import { getChatGPTUser } from "../../chatgpt-auth";
import { getRuntime } from "../../../lib/server-api";
import { profileMediaUrl } from "../../../lib/profile";
import { searchableSql, searchPattern } from "../../../lib/search-query";
import { unavailableRelationshipProfile } from "../../../lib/profile-relationships";

type IdentityRow = { email: string; public_id: string; university_id: string };
type PersonRow = { public_id: string; display_name: string; handle: string; university_short_name: string; avatar_updated_at: string | null; is_following: number; is_self: number; created_at: string };
const visibleProfile = `(sp.university_id = ? OR EXISTS (SELECT 1 FROM posts p WHERE p.author_email = u.email AND p.audience = 'platform' AND p.community_id IS NULL AND p.course_id IS NULL AND p.deleted_at IS NULL))`;
const notBlocked = `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = u.email) OR (b.blocker_email = u.email AND b.blocked_email = ?))`;

export async function GET(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return Response.json({ error: "Takip listesini görmek için giriş yapmalısın." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const targetId = params.get("id")?.trim() ?? "";
  const kind = params.get("kind") ?? "followers";
  const query = (params.get("q") ?? "").trim().normalize("NFC").slice(0, 60);
  if (!targetId || targetId.length > 80 || !["followers", "following"].includes(kind)) return Response.json({ error: "Geçerli bir profil ve liste seç." }, { status: 400 });
  let cursor: { at: string; id: string; target: string; kind: string; query: string } | null = null;
  if (params.has("cursor")) {
    try {
      const raw = params.get("cursor")!;
      if (raw.length > 1000) throw new Error();
      cursor = JSON.parse(raw);
      if (!cursor || typeof cursor.at !== "string" || cursor.at.length > 40 || typeof cursor.id !== "string" || cursor.id.length > 80 || cursor.target !== targetId || cursor.kind !== kind || cursor.query !== query) throw new Error();
    } catch { return Response.json({ error: "Liste devam bilgisi geçersiz. Listeyi yeniden aç." }, { status: 400 }); }
  }
  try {
    const { DB } = await getRuntime();
    const viewer = await DB.prepare(`SELECT u.email, u.public_id, sp.university_id FROM users u JOIN student_profiles sp ON sp.user_email = u.email WHERE u.email = ? AND u.status = 'active' AND sp.onboarding_completed = 1 AND u.public_id IS NOT NULL`).bind(identity.email).first<IdentityRow>();
    if (!viewer) return Response.json({ error: "Takip listesinden önce akademik profilini tamamlamalısın." }, { status: 409 });
    const target = await DB.prepare(`SELECT u.email FROM users u JOIN student_profiles sp ON sp.user_email = u.email WHERE u.public_id = ? AND u.status = 'active' AND sp.onboarding_completed = 1 AND ${visibleProfile} AND ${notBlocked} LIMIT 1`).bind(targetId, viewer.university_id, viewer.email, viewer.email).first<{ email: string }>();
    if (!target) return Response.json({ error: unavailableRelationshipProfile }, { status: 404 });
    const other = kind === "followers" ? "f.follower_email" : "f.following_email";
    const subject = kind === "followers" ? "f.following_email" : "f.follower_email";
    const bindings: (string | number)[] = [viewer.email, viewer.email, target.email, viewer.university_id, viewer.email, viewer.email];
    const search = query ? `AND (${searchableSql("u.display_name")} LIKE ? ESCAPE '\\' OR ${searchableSql("u.handle")} LIKE ? ESCAPE '\\')` : "";
    if (query) bindings.push(searchPattern(query), searchPattern(query));
    if (cursor) bindings.push(cursor.at, cursor.at, cursor.id);
    const result = await DB.prepare(`SELECT u.public_id, u.display_name, u.handle, university.short_name AS university_short_name, f.created_at,
      (SELECT updated_at FROM profile_media WHERE user_email = u.email AND kind = 'avatar' LIMIT 1) AS avatar_updated_at,
      EXISTS(SELECT 1 FROM user_follows mine WHERE mine.follower_email = ? AND mine.following_email = u.email) AS is_following,
      u.email = ? AS is_self
      FROM user_follows f JOIN users u ON u.email = ${other} JOIN student_profiles sp ON sp.user_email = u.email
      JOIN universities university ON university.id = sp.university_id
      WHERE ${subject} = ? AND u.status = 'active' AND u.public_id IS NOT NULL AND sp.onboarding_completed = 1 AND ${visibleProfile} AND ${notBlocked} ${search}
      ${cursor ? "AND (f.created_at < ? OR (f.created_at = ? AND u.public_id < ?))" : ""}
      ORDER BY f.created_at DESC, u.public_id DESC LIMIT 41`).bind(...bindings).all<PersonRow>();
    const rows = result.results.slice(0, 40);
    const last = rows.at(-1);
    return Response.json({ targetId, kind, query, viewerId: viewer.public_id,
      people: rows.map((row) => ({ publicId: row.public_id, displayName: row.display_name, handle: row.handle, universityShortName: row.university_short_name, avatarUrl: profileMediaUrl(row.public_id, "avatar", row.avatar_updated_at), isFollowing: Boolean(row.is_following), isSelf: Boolean(row.is_self) })),
      nextCursor: result.results.length > 40 && last ? JSON.stringify({ at: last.created_at, id: last.public_id, target: targetId, kind, query }) : null,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Takip listesi alınamadı. Yeniden dene." }, { status: 503 }); }
}
