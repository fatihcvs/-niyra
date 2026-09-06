import { searchableSql, searchPattern } from "../../../lib/search-query";
import {
  cleanText,
  getRuntime,
  parseJsonArray,
  relativeTime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Arama yapmak için giriş yapmalısın.");
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "platform" ? "platform" : "campus";
  const query = cleanText(url.searchParams.get("q"), 80).normalize("NFC").toLocaleLowerCase("tr-TR");
  if (query.length < 2) return Response.json({ query, scope, people: [], courses: [], posts: [], notes: [], communities: [] }, { headers: { "cache-control": "no-store" } });
  const like = searchPattern(query);

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });

    const [people, courses, posts, notes, communities] = await Promise.all([
      DB.prepare(
        `SELECT u.public_id, u.display_name, u.handle, d.name AS department_name, f.short_name AS faculty_short_name
         FROM users u
         JOIN student_profiles sp ON sp.user_email = u.email
         JOIN departments d ON d.id = sp.department_id
         LEFT JOIN faculties f ON f.id = d.faculty_id
         WHERE u.email <> ? AND u.status = 'active' AND sp.onboarding_completed = 1
           AND (sp.university_id = ? OR (? = 'platform' AND EXISTS (
             SELECT 1 FROM posts public_post WHERE public_post.author_email = u.email AND public_post.deleted_at IS NULL
               AND public_post.audience = 'platform' AND public_post.community_id IS NULL AND public_post.course_id IS NULL
           )))
           AND ${searchableSql("u.display_name || ' ' || u.handle || ' ' || d.name || ' ' || COALESCE(f.name, '')")} LIKE ? ESCAPE '\\'
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = u.email) OR (b.blocker_email = u.email AND b.blocked_email = ?))
         ORDER BY u.display_name LIMIT 6`,
      ).bind(identity.email, profile.university_id, scope, like, identity.email, identity.email).all(),
      DB.prepare(
        `SELECT DISTINCT c.id, c.code, c.name, d.name AS department_name
         FROM courses c JOIN departments d ON d.id = c.department_id
         JOIN student_courses sc ON sc.course_id = c.id
         JOIN student_profiles sp ON sp.user_email = sc.user_email
         WHERE sp.university_id = ? AND ${searchableSql("c.code || ' ' || c.name || ' ' || d.name")} LIKE ? ESCAPE '\\'
         ORDER BY c.code LIMIT 6`,
      ).bind(profile.university_id, like).all(),
      DB.prepare(
        `SELECT p.id, p.content, p.created_at, u.public_id AS author_id, u.display_name AS author_name, COALESCE(c.code, 'GENEL') AS course_code
         FROM posts p JOIN users u ON u.email = p.author_email
         JOIN student_profiles author_profile ON author_profile.user_email = p.author_email
         LEFT JOIN courses c ON c.id = p.course_id
         WHERE p.deleted_at IS NULL AND u.status = 'active'
           AND ((? = 'campus' AND author_profile.university_id = ?)
             OR (? = 'platform' AND p.audience = 'platform' AND p.community_id IS NULL AND p.course_id IS NULL))
           AND ${searchableSql("p.content || ' ' || COALESCE(c.code, '') || ' ' || u.display_name")} LIKE ? ESCAPE '\\'
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email) OR (b.blocker_email = p.author_email AND b.blocked_email = ?))
           AND NOT EXISTS (SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = p.author_email)
           AND (p.community_id IS NULL OR EXISTS (
             SELECT 1 FROM communities cx WHERE cx.id = p.community_id AND cx.status = 'active' AND cx.moderation_status = 'active'
               AND (cx.university_id IS NULL OR cx.university_id = ?)
               AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = cx.id AND cb.user_email = ?)
               AND (cx.join_policy = 'open' OR EXISTS (
                 SELECT 1 FROM community_members cm WHERE cm.community_id = cx.id AND cm.user_email = ? AND cm.status = 'active'
               ))
           ))
         ORDER BY p.created_at DESC LIMIT 6`,
      ).bind(scope, profile.university_id, scope, like, identity.email, identity.email, identity.email, profile.university_id, identity.email, identity.email).all<{ id: string; content: string; created_at: string; author_id: string; author_name: string; course_code: string }>(),
      DB.prepare(
        `SELECT n.id, n.title, n.description, n.tags_json, n.created_at, c.code AS course_code,
                u.display_name AS owner_name,
                (SELECT COUNT(*) FROM note_views nv WHERE nv.note_id = n.id) AS view_count
         FROM notes n JOIN courses c ON c.id = n.course_id JOIN users u ON u.email = n.owner_email
         JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
         WHERE u.status = 'active' AND n.status = 'published' AND n.deleted_at IS NULL AND owner_profile.university_id = ?
           AND ${searchableSql("n.title || ' ' || n.description || ' ' || n.tags_json || ' ' || c.code || ' ' || c.name || ' ' || u.display_name")} LIKE ? ESCAPE '\\'
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = n.owner_email) OR (b.blocker_email = n.owner_email AND b.blocked_email = ?))
         ORDER BY n.created_at DESC LIMIT 6`,
      ).bind(profile.university_id, like, identity.email, identity.email).all<{ id: string; title: string; description: string; tags_json: string; created_at: string; course_code: string; owner_name: string; view_count: number }>(),
      DB.prepare(
        `SELECT c.id, c.name, c.description, c.category, c.slug,
                (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count
         FROM communities c
         WHERE c.status = 'active' AND c.moderation_status = 'active' AND c.university_id = ?
           AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ?)
           AND ${searchableSql("c.name || ' ' || c.description || ' ' || c.category")} LIKE ? ESCAPE '\\'
         ORDER BY member_count DESC, c.created_at DESC LIMIT 6`,
      ).bind(profile.university_id, identity.email, like).all(),
    ]);

    await DB.prepare(`INSERT INTO product_events (id, user_email, name, properties_json) VALUES (?, ?, 'search.completed', ?)`)
      .bind(crypto.randomUUID(), identity.email, JSON.stringify({ queryLength: query.length, resultCount: people.results.length + courses.results.length + posts.results.length + notes.results.length + communities.results.length }))
      .run().catch(() => undefined);
    return Response.json({
      query, scope,
      people: people.results,
      courses: courses.results,
      posts: posts.results.map((post) => ({ ...post, time: relativeTime(post.created_at) })),
      notes: notes.results.map((note) => ({ ...note, tags: parseJsonArray(note.tags_json), time: relativeTime(note.created_at), view_count: Number(note.view_count) })),
      communities: communities.results,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return unavailableResponse(error, "Arama sonuçlarına şu anda ulaşılamıyor.");
  }
}
