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

type Row = {
  id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  is_pinned: number;
  created_at: string;
  own: number;
};

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  const communityId = cleanText(new URL(request.url).searchParams.get("communityId"), 80);
  if (!communityId) return Response.json({ error: "Topluluk zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const rows = await DB.prepare(
      `SELECT p.id, u.public_id AS author_id, u.display_name AS author_name, p.content,
              p.is_pinned, p.created_at, CASE WHEN p.author_email = ? THEN 1 ELSE 0 END AS own
       FROM posts p JOIN users u ON u.email = p.author_email
       JOIN communities c ON c.id = p.community_id
       JOIN student_profiles creator_profile ON creator_profile.user_email = c.creator_email
       WHERE p.community_id = ? AND p.deleted_at IS NULL AND c.status = 'active'
         AND creator_profile.university_id = ?
         AND (c.join_policy = 'open' OR EXISTS (
           SELECT 1 FROM community_members cm
           WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active'
         ))
       ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT 40`,
    ).bind(identity.email, communityId, profile.university_id, identity.email).all<Row>();
    return Response.json({ posts: rows.results.map((row) => ({ id: row.id, authorId: row.author_id, authorName: row.author_name, content: row.content, pinned: Boolean(row.is_pinned), own: Boolean(row.own), time: relativeTime(row.created_at) })) });
  } catch (error) {
    return unavailableResponse(error, "Topluluk gönderilerine ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Gönderi bilgisi geçerli değil." }, { status: 400 }); }
  const communityId = cleanText(payload.communityId, 80);
  const content = cleanText(payload.content, 1200);
  if (!communityId || !content) return Response.json({ error: "Topluluk ve gönderi metni zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const membership = await DB.prepare(
      `SELECT cm.role, c.name FROM community_members cm JOIN communities c ON c.id = cm.community_id
       JOIN student_profiles creator_profile ON creator_profile.user_email = c.creator_email
       WHERE cm.community_id = ? AND cm.user_email = ? AND cm.status = 'active' AND c.status = 'active'
         AND creator_profile.university_id = ? LIMIT 1`,
    ).bind(communityId, identity.email, profile.university_id).first<{ role: string; name: string }>();
    if (!membership) return Response.json({ error: "Gönderi paylaşmak için topluluğa katılmalısın." }, { status: 403 });
    const limit = await enforceRateLimit(DB, identity.email, "community-post", 30, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    await DB.prepare(`INSERT INTO posts (id, author_email, community_id, content) VALUES (?, ?, ?, ?)`).bind(id, identity.email, communityId, content).run();
    await DB.prepare(
      `INSERT INTO notifications (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
       SELECT LOWER(HEX(RANDOMBLOB(16))), cm.user_email, ?, 'community', ?, ?, 'post', ?
       FROM community_members cm
       LEFT JOIN notification_preferences np ON np.user_email = cm.user_email
       WHERE cm.community_id = ? AND cm.status = 'active' AND cm.user_email <> ? AND COALESCE(np.communities, 1) = 1`,
    ).bind(identity.email, `${membership.name} topluluğunda yeni gönderi`, content.slice(0, 120), id, communityId, identity.email).run();
    await audit(DB, identity.email, "community.post.created", "post", id, { communityId });
    return Response.json({ post: { id, content, pinned: false, own: true, time: "şimdi" } }, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Topluluk gönderisi paylaşılamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "İşlem bilgisi geçerli değil." }, { status: 400 }); }
  const communityId = cleanText(payload.communityId, 80);
  const postId = cleanText(payload.postId, 80);
  if (!communityId || !postId) return Response.json({ error: "Topluluk ve gönderi zorunludur." }, { status: 400 });
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const manager = await DB.prepare(
      `SELECT cm.role FROM community_members cm
       JOIN communities c ON c.id = cm.community_id
       JOIN student_profiles creator_profile ON creator_profile.user_email = c.creator_email
       WHERE cm.community_id = ? AND cm.user_email = ? AND cm.status = 'active'
         AND creator_profile.university_id = ? LIMIT 1`,
    ).bind(communityId, identity.email, profile.university_id).first<{ role: string }>();
    if (!manager || !['founder', 'admin', 'moderator'].includes(manager.role)) return Response.json({ error: "Gönderiyi sabitlemek için yetkin yok." }, { status: 403 });
    const post = await DB.prepare(`SELECT is_pinned, author_email FROM posts WHERE id = ? AND community_id = ? AND deleted_at IS NULL LIMIT 1`).bind(postId, communityId).first<{ is_pinned: number; author_email: string }>();
    if (!post) return Response.json({ error: "Gönderi bulunamadı." }, { status: 404 });
    const active = !Boolean(post.is_pinned);
    await DB.prepare(`UPDATE posts SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(active ? 1 : 0, postId).run();
    await audit(DB, identity.email, active ? "community.post.pinned" : "community.post.unpinned", "post", postId, { communityId });
    if (active) await notify(DB, { userEmail: post.author_email, actorEmail: identity.email, kind: "community", title: "Gönderin toplulukta sabitlendi", entityType: "post", entityId: postId });
    return Response.json({ active });
  } catch (error) {
    return unavailableResponse(error, "Gönderi sabitleme işlemi tamamlanamadı.");
  }
}
