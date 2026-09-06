import { notificationHref } from "./workspace-navigation";

const viewerSql = `WITH viewer AS (SELECT user.email, profile.university_id FROM users user
  JOIN student_profiles profile ON profile.user_email = user.email
  WHERE user.email = ? AND user.status = 'active' AND profile.onboarding_completed = 1)`;
const unblocked = (owner: string) => `NOT EXISTS (SELECT 1 FROM user_blocks block WHERE
  (block.blocker_email = viewer.email AND block.blocked_email = ${owner})
  OR (block.blocker_email = ${owner} AND block.blocked_email = viewer.email))`;
const communityVisible = (community: string) => `EXISTS (SELECT 1 FROM communities visible_community
  WHERE visible_community.id = ${community} AND visible_community.status = 'active' AND visible_community.moderation_status = 'active'
    AND visible_community.university_id = viewer.university_id
    AND NOT EXISTS (SELECT 1 FROM community_bans ban WHERE ban.community_id = visible_community.id AND ban.user_email = viewer.email)
    AND NOT EXISTS (SELECT 1 FROM community_members member WHERE member.community_id = visible_community.id AND member.user_email = viewer.email AND member.status = 'banned')
    AND (visible_community.join_policy = 'open' OR EXISTS (SELECT 1 FROM community_members member
      WHERE member.community_id = visible_community.id AND member.user_email = viewer.email AND member.status = 'active')))`;

/** Revalidate the current target, not just its surviving notification row.
 * Predicates follow the shared-target endpoints for comments/posts, messages,
 * campus-content, notes and community content. Unknown future kinds use the inbox.
 */
export async function pushTargetHref(db: D1Database, email: string, type: string | null, id: string | null, actorId?: string | null) {
  if (!type || !id) return "/?view=notifications";
  if (id.length > 80 || /[\u0000-\u001f\u007f]/.test(id)) return null;
  let query: string;
  let target = id;
  if (["post", "comment", "post-comment"].includes(type)) {
    const comment = type !== "post";
    query = `SELECT post.id FROM posts post
      JOIN users author ON author.email = post.author_email AND author.status = 'active'
      JOIN student_profiles author_profile ON author_profile.user_email = author.email
      ${comment ? "JOIN post_comments comment ON comment.post_id = post.id JOIN users commenter ON commenter.email = comment.author_email AND commenter.status = 'active'" : ""}
      CROSS JOIN viewer WHERE ${comment ? "comment.id" : "post.id"} = ? AND post.deleted_at IS NULL
      ${comment ? `AND comment.deleted_at IS NULL AND ${unblocked("comment.author_email")}` : ""}
      AND (author_profile.university_id = viewer.university_id OR (post.audience = 'platform' AND post.community_id IS NULL AND post.course_id IS NULL))
      AND ${unblocked("post.author_email")}
      AND (post.community_id IS NULL OR ${communityVisible("post.community_id")})`;
  } else if (["conversation", "direct-message", "message"].includes(type)) {
    const message = type !== "conversation";
    query = `SELECT conversation.id FROM direct_conversations conversation
      JOIN users one ON one.email = conversation.member_one_email AND one.status = 'active'
      JOIN users two ON two.email = conversation.member_two_email AND two.status = 'active'
      JOIN student_profiles first_profile ON first_profile.user_email = one.email AND first_profile.university_id = conversation.university_id
      JOIN student_profiles second_profile ON second_profile.user_email = two.email AND second_profile.university_id = conversation.university_id
      ${message ? "JOIN direct_messages message ON message.conversation_id = conversation.id" : ""}
      CROSS JOIN viewer WHERE ${message ? "message.id" : "conversation.id"} = ? ${message ? "AND message.deleted_at IS NULL" : ""}
      AND conversation.university_id = viewer.university_id AND viewer.email IN (conversation.member_one_email, conversation.member_two_email)
      AND ${unblocked("conversation.member_one_email")} AND ${unblocked("conversation.member_two_email")}`;
  } else if (type === "listing") {
    query = `SELECT listing.id FROM marketplace_listings listing JOIN users owner ON owner.email = listing.owner_email AND owner.status = 'active'
      CROSS JOIN viewer WHERE listing.id = ? AND listing.university_id = viewer.university_id
      AND (listing.status IN ('active','reserved') OR listing.owner_email = viewer.email) AND ${unblocked("listing.owner_email")}`;
  } else if (type === "event") {
    query = `SELECT event.id FROM campus_events event JOIN users owner ON owner.email = event.creator_email AND owner.status = 'active'
      CROSS JOIN viewer WHERE event.id = ? AND event.university_id = viewer.university_id AND event.status = 'active' AND ${unblocked("event.creator_email")}`;
  } else if (type === "note") {
    query = `SELECT note.id FROM notes note JOIN users owner ON owner.email = note.owner_email AND owner.status = 'active'
      JOIN student_profiles owner_profile ON owner_profile.user_email = note.owner_email JOIN courses course ON course.id = note.course_id
      CROSS JOIN viewer WHERE note.id = ? AND note.deleted_at IS NULL AND owner_profile.university_id = viewer.university_id
      AND (note.status = 'published' OR note.owner_email = viewer.email) AND ${unblocked("note.owner_email")}`;
  } else if (type === "community") {
    query = `SELECT community.id FROM communities community CROSS JOIN viewer WHERE community.id = ? AND ${communityVisible("community.id")}`;
  } else if (type === "community-event" || type === "community_event") {
    query = `SELECT event.id FROM community_events event JOIN users owner ON owner.email = event.creator_email AND owner.status = 'active'
      CROSS JOIN viewer WHERE event.id = ? AND event.status IN ('active','cancelled') AND ${communityVisible("event.community_id")} AND ${unblocked("event.creator_email")}`;
  } else if (type === "user") {
    target = actorId || id;
    query = `SELECT user.public_id FROM users user CROSS JOIN viewer WHERE user.public_id = ? AND user.status = 'active' AND ${unblocked("user.email")}`;
  } else if (type === "meetup") {
    // A surviving notification never grants access beyond the current participants.
    query = `SELECT meetup.id FROM meetup_requests meetup
      JOIN users sender ON sender.email = meetup.sender_email AND sender.status = 'active'
      JOIN users recipient ON recipient.email = meetup.recipient_email AND recipient.status = 'active'
      JOIN student_profiles sender_profile ON sender_profile.user_email = sender.email
      JOIN student_profiles recipient_profile ON recipient_profile.user_email = recipient.email
      CROSS JOIN viewer WHERE meetup.id = ? AND viewer.email IN (meetup.sender_email, meetup.recipient_email)
      AND sender_profile.university_id = viewer.university_id AND recipient_profile.university_id = viewer.university_id
      AND sender_profile.onboarding_completed = 1 AND recipient_profile.onboarding_completed = 1
      AND ${unblocked("meetup.sender_email")} AND ${unblocked("meetup.recipient_email")}`;
  } else return "/?view=notifications";
  const accessible = await db.prepare(`${viewerSql} ${query} LIMIT 1`).bind(email, target).first();
  return accessible ? notificationHref(type, id, actorId) ?? "/?view=notifications" : null;
}
