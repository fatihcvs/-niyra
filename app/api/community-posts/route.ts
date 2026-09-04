import { sameOriginRequest } from "../../../lib/app-auth";
import { profileMediaUrl } from "../../../lib/profile";
import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  notify,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

const postTypes = ["discussion", "question", "resource", "announcement"] as const;
const managerRoles = ["founder", "admin", "moderator"];

type Row = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_handle: string;
  department_name: string | null;
  avatar_updated_at: string | null;
  content: string;
  post_type: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  own: number;
  liked: number;
  saved: number;
  like_count: number;
  comment_count: number;
};

function serialize(row: Row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    departmentName: row.department_name ?? "Bölüm bilgisi yok",
    avatarUrl: profileMediaUrl(row.author_id, "avatar", row.avatar_updated_at),
    content: row.content,
    postType: row.post_type,
    pinned: Boolean(row.is_pinned),
    own: Boolean(row.own),
    liked: Boolean(row.liked),
    saved: Boolean(row.saved),
    likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count),
    time: relativeTime(row.created_at),
    edited: row.updated_at !== row.created_at,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  const url = new URL(request.url);
  const communityId = cleanText(url.searchParams.get("communityId"), 80);
  const cursor = cleanText(url.searchParams.get("cursor"), 60);
  const requestedType = cleanText(url.searchParams.get("type"), 20);
  const postType = postTypes.includes(requestedType as typeof postTypes[number]) ? requestedType : "";
  if (!communityId) return Response.json({ error: "Topluluk zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const access = await DB.prepare(
      `SELECT c.join_policy, cm.status AS membership_status
       FROM communities c LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_email = ?
       WHERE c.id = ? AND c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active' LIMIT 1`,
    ).bind(identity.email, communityId, profile.university_id).first<{ join_policy: string; membership_status: string | null }>();
    if (!access) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
    if (access.join_policy !== "open" && access.membership_status !== "active") return Response.json({ error: "Bu topluluğun gönderilerini görmek için katılımın onaylanmalı." }, { status: 403 });

    const rows = await DB.prepare(
      `SELECT p.id, u.public_id AS author_id, u.display_name AS author_name, u.handle AS author_handle,
              d.name AS department_name,
              (SELECT updated_at FROM profile_media pm WHERE pm.user_email = p.author_email AND pm.kind = 'avatar' LIMIT 1) AS avatar_updated_at,
              p.content, COALESCE(meta.post_type, 'discussion') AS post_type, p.is_pinned, p.created_at, p.updated_at,
              CASE WHEN p.author_email = ? THEN 1 ELSE 0 END AS own,
              EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_email = ?) AS liked,
              EXISTS(SELECT 1 FROM post_saves ps WHERE ps.post_id = p.id AND ps.user_email = ?) AS saved,
              (SELECT COUNT(*) FROM post_likes plx WHERE plx.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND pc.deleted_at IS NULL) AS comment_count
       FROM posts p
       JOIN users u ON u.email = p.author_email
       LEFT JOIN student_profiles sp ON sp.user_email = p.author_email
       LEFT JOIN departments d ON d.id = sp.department_id
       LEFT JOIN community_post_meta meta ON meta.post_id = p.id
       WHERE p.community_id = ? AND p.deleted_at IS NULL
         AND (? = '' OR COALESCE(meta.post_type, 'discussion') = ?)
         AND (? = '' OR p.created_at < ?)
         AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email) OR (b.blocker_email = p.author_email AND b.blocked_email = ?))
         AND NOT EXISTS (SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = p.author_email)
       ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC LIMIT 31`,
    ).bind(identity.email, identity.email, identity.email, communityId, postType, postType, cursor, cursor, identity.email, identity.email, identity.email).all<Row>();
    const hasMore = rows.results.length > 30;
    const page = rows.results.slice(0, 30);
    return Response.json({ posts: page.map(serialize), hasMore, cursor: hasMore ? page.at(-1)?.created_at ?? null : null });
  } catch (error) {
    return unavailableResponse(error, "Topluluk gönderilerine ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan gönderi isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Gönderi bilgisi geçerli değil." }, { status: 400 }); }
  const communityId = cleanText(payload.communityId, 80);
  const content = cleanText(payload.content, 1200);
  const requestedType = cleanText(payload.postType, 20) || "discussion";
  const postType = postTypes.includes(requestedType as typeof postTypes[number]) ? requestedType : "";
  if (!communityId || !content || !postType) return Response.json({ error: "Topluluk, gönderi metni ve türü zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const membership = await DB.prepare(
      `SELECT cm.role, c.name FROM community_members cm JOIN communities c ON c.id = cm.community_id
       WHERE cm.community_id = ? AND cm.user_email = ? AND cm.status = 'active' AND c.status = 'active'
         AND c.moderation_status = 'active' AND c.university_id = ? LIMIT 1`,
    ).bind(communityId, identity.email, profile.university_id).first<{ role: string; name: string }>();
    if (!membership) return Response.json({ error: "Gönderi paylaşmak için topluluğa katılmalısın." }, { status: 403 });
    if (postType === "announcement" && !managerRoles.includes(membership.role)) return Response.json({ error: "Duyuruları yalnızca topluluk ekibi paylaşabilir." }, { status: 403 });
    const limit = await enforceRateLimit(DB, identity.email, "community-post", 30, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await DB.batch([
      DB.prepare(`INSERT INTO posts (id, author_email, community_id, content, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, identity.email, communityId, content, postType === "announcement" ? 1 : 0, now, now),
      DB.prepare(`INSERT INTO community_post_meta (post_id, post_type) VALUES (?, ?)`).bind(id, postType),
      DB.prepare(`UPDATE communities SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(now, communityId),
      DB.prepare(
        `INSERT INTO notifications (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
         SELECT LOWER(HEX(RANDOMBLOB(16))), cm.user_email, ?, 'community', ?, ?, 'post', ?
         FROM community_members cm LEFT JOIN notification_preferences np ON np.user_email = cm.user_email
         WHERE cm.community_id = ? AND cm.status = 'active' AND cm.user_email <> ? AND COALESCE(np.communities, 1) = 1
           AND (cm.notification_level = 'all' OR (? = 'announcement' AND cm.notification_level = 'announcements'))`,
      ).bind(identity.email, postType === "announcement" ? `${membership.name} topluluğunda yeni duyuru` : `${membership.name} topluluğunda yeni gönderi`, content.slice(0, 120), id, communityId, identity.email, postType),
    ]);
    await audit(DB, identity.email, "community.post.created", "post", id, { communityId, postType });
    return Response.json({ post: { id, content, postType, pinned: postType === "announcement", own: true, liked: false, saved: false, likeCount: 0, commentCount: 0, authorName: "Sen", authorHandle: "sen", departmentName: "", avatarUrl: null, time: "şimdi", edited: false, createdAt: now } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Topluluk gönderisi paylaşılamadı.");
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan gönderi isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "İşlem bilgisi geçerli değil." }, { status: 400 }); }
  const communityId = cleanText(payload.communityId, 80);
  const postId = cleanText(payload.postId, 80);
  const action = cleanText(payload.action, 20) || "pin";
  if (!communityId || !postId || !["pin", "remove"].includes(action)) return Response.json({ error: "Topluluk, gönderi ve işlem zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const manager = await DB.prepare(
      `SELECT cm.role FROM community_members cm JOIN communities c ON c.id = cm.community_id
       WHERE cm.community_id = ? AND cm.user_email = ? AND cm.status = 'active' AND c.moderation_status = 'active'
         AND c.university_id = ? LIMIT 1`,
    ).bind(communityId, identity.email, profile.university_id).first<{ role: string }>();
    if (!manager || !managerRoles.includes(manager.role)) return Response.json({ error: "Gönderiyi yönetmek için yetkin yok." }, { status: 403 });
    const post = await DB.prepare(`SELECT is_pinned, author_email FROM posts WHERE id = ? AND community_id = ? AND deleted_at IS NULL LIMIT 1`).bind(postId, communityId).first<{ is_pinned: number; author_email: string }>();
    if (!post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });
    if (action === "remove") {
      await DB.prepare(`UPDATE posts SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(postId).run();
      await audit(DB, identity.email, "community.post.removed", "post", postId, { communityId });
      return Response.json({ removed: true });
    }
    const active = !Boolean(post.is_pinned);
    await DB.prepare(`UPDATE posts SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(active ? 1 : 0, postId).run();
    await audit(DB, identity.email, active ? "community.post.pinned" : "community.post.unpinned", "post", postId, { communityId });
    if (active) await notify(DB, { userEmail: post.author_email, actorEmail: identity.email, kind: "community", title: "Gönderin toplulukta sabitlendi", entityType: "post", entityId: postId });
    return Response.json({ active });
  } catch (error) {
    return unavailableResponse(error, "Gönderi işlemi tamamlanamadı.");
  }
}
