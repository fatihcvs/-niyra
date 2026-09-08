import { APP_ACCOUNT_ACCESS_SQL } from "./app-auth";

/** Arguments are trusted SQL expressions, never request values. All user input stays bound. */
export function communityEventVisibleSql(event = "event", email = "viewer.email", campus = "viewer.university_id", requireMembership = false) {
  return `${event}.status IN ('active','cancelled')
    AND EXISTS(SELECT 1 FROM users event_creator WHERE event_creator.email=${event}.creator_email AND event_creator.status='active')
    AND NOT EXISTS(SELECT 1 FROM user_blocks event_block WHERE
      (event_block.blocker_email=${email} AND event_block.blocked_email=${event}.creator_email)
      OR (event_block.blocker_email=${event}.creator_email AND event_block.blocked_email=${email}))
    AND EXISTS(SELECT 1 FROM communities event_community WHERE event_community.id=${event}.community_id
      AND event_community.university_id=${campus} AND event_community.status='active' AND event_community.moderation_status='active'
      AND NOT EXISTS(SELECT 1 FROM community_bans event_ban WHERE event_ban.community_id=event_community.id AND event_ban.user_email=${email})
      AND NOT EXISTS(SELECT 1 FROM community_members event_banned_member WHERE event_banned_member.community_id=event_community.id
        AND event_banned_member.user_email=${email} AND event_banned_member.status='banned')
      AND (${requireMembership ? "" : "event_community.join_policy='open' OR "}EXISTS(SELECT 1 FROM community_members event_member
        WHERE event_member.community_id=event_community.id AND event_member.user_email=${email} AND event_member.status='active')))`;
}

/** The same account generation and campus that began the request must still own its response. */
export const EVENT_VIEWER_SQL = `WITH event_viewer AS (
  SELECT event_user.email,event_profile.university_id FROM users event_user
  JOIN student_profiles event_profile ON event_profile.user_email=event_user.email
  WHERE event_user.email=? AND event_user.public_id=? AND event_user.status='active'
    AND event_profile.university_id=? AND event_profile.onboarding_completed=1
    AND ${APP_ACCOUNT_ACCESS_SQL.replace(/\bu\./g, "event_user.")})`;
