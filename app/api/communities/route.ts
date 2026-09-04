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
import { getBooleanPlatformSetting } from "../../../lib/platform-settings";

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  join_policy: string;
  rules: string;
  status: string;
  course_id: string | null;
  course_code: string | null;
  creator_id: string | null;
  creator_name: string;
  created_at: string;
  member_count: number;
  post_count: number;
  membership_status: string | null;
  role: string | null;
};

function serialize(row: CommunityRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    joinPolicy: row.join_policy,
    rules: row.rules,
    status: row.status,
    courseId: row.course_id,
    courseCode: row.course_code,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    createdAt: row.created_at,
    time: relativeTime(row.created_at),
    memberCount: Number(row.member_count),
    postCount: Number(row.post_count),
    membershipStatus: row.membership_status,
    role: row.role,
    joined: row.membership_status === "active",
    pending: row.membership_status === "pending",
    canManage: ["founder", "admin", "moderator"].includes(row.role ?? ""),
  };
}

function slugify(value: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (letter) => map[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52) || "topluluk";
}

function baseSelect() {
  return `SELECT c.id, c.name, c.slug, c.description, c.category, c.join_policy,
                 c.rules, c.status, c.course_id, cr.code AS course_code,
                 u.public_id AS creator_id, u.display_name AS creator_name, c.created_at,
                 (SELECT COUNT(*) FROM community_members cmx WHERE cmx.community_id = c.id AND cmx.status = 'active') AS member_count,
                 (SELECT COUNT(*) FROM posts px WHERE px.community_id = c.id AND px.deleted_at IS NULL) AS post_count,
                 cm.status AS membership_status, cm.role
          FROM communities c
          JOIN users u ON u.email = c.creator_email
          JOIN student_profiles creator_profile ON creator_profile.user_email = c.creator_email
          LEFT JOIN courses cr ON cr.id = c.course_id
          LEFT JOIN community_members cm ON cm.community_id = c.id AND cm.user_email = ?`;
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Toplulukları görmek için giriş yapmalısın.");
  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"), 80);
  const query = cleanText(url.searchParams.get("q"), 80).toLocaleLowerCase("tr-TR");
  const mine = url.searchParams.get("mine") === "1" ? 1 : 0;

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (id) {
      const community = await DB
        .prepare(`${baseSelect()} WHERE c.id = ? AND (c.status = 'active' OR c.creator_email = ?) AND creator_profile.university_id = ? LIMIT 1`)
        .bind(identity.email, id, identity.email, profile.university_id)
        .first<CommunityRow>();
      if (!community) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
      const members = community.role && ["founder", "admin", "moderator"].includes(community.role)
        ? await DB
            .prepare(
              `SELECT u.public_id, u.display_name, u.handle, cm.role, cm.status, cm.created_at
               FROM community_members cm JOIN users u ON u.email = cm.user_email
               WHERE cm.community_id = ? ORDER BY CASE cm.role WHEN 'founder' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, cm.created_at`,
            )
            .bind(id)
            .all()
        : { results: [] };
      return Response.json({ community: serialize(community), members: members.results });
    }

    const like = query ? `%${query}%` : "";
    const rows = await DB
      .prepare(`${baseSelect()}
        WHERE c.status = 'active'
          AND creator_profile.university_id = ?
          AND (? = 0 OR cm.status = 'active')
          AND (? = '' OR LOWER(c.name || ' ' || c.description || ' ' || c.category || ' ' || COALESCE(cr.code, '')) LIKE ?)
        ORDER BY CASE WHEN cm.status = 'active' THEN 0 ELSE 1 END, member_count DESC, c.created_at DESC
        LIMIT 40`)
      .bind(identity.email, profile.university_id, mine, like, like)
      .all<CommunityRow>();
    return Response.json({ communities: rows.results.map(serialize) });
  } catch (error) {
    return unavailableResponse(error, "Topluluklara şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Topluluk kurmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Topluluk bilgileri geçerli değil." }, { status: 400 });
  }

  const name = cleanText(payload.name, 80);
  const description = cleanText(payload.description, 500);
  const category = cleanText(payload.category, 30) || "ilgi";
  const joinPolicy = cleanText(payload.joinPolicy, 20);
  const rules = cleanText(payload.rules, 800);
  const courseId = cleanText(payload.courseId, 80) || null;
  if (name.length < 3) return Response.json({ error: "Topluluk adı en az 3 karakter olmalı." }, { status: 400 });
  if (description.length < 12) return Response.json({ error: "Topluluğun amacını biraz daha açıklamalısın." }, { status: 400 });
  if (!['open', 'request'].includes(joinPolicy)) return Response.json({ error: "Katılım tipi geçerli değil." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    if (!(await getBooleanPlatformSetting(DB, "communityCreationOpen"))) {
      return Response.json({ error: "Yeni topluluk oluşturma owner tarafından geçici olarak durduruldu." }, { status: 503 });
    }
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Topluluk kurmadan önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "community-create", 3, 86400);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (courseId) {
      const course = await DB
        .prepare(`SELECT course_id FROM student_courses WHERE user_email = ? AND course_id = ? LIMIT 1`)
        .bind(identity.email, courseId)
        .first();
      if (!course) return Response.json({ error: "Ders topluluğu yalnızca seçtiğin derslerden biri için kurulabilir." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const slug = `${slugify(name)}-${id.slice(0, 6)}`;
    await DB.batch([
      DB.prepare(
        `INSERT INTO communities
         (id, creator_email, course_id, name, slug, description, category, join_policy, rules)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, identity.email, courseId, name, slug, description, category, joinPolicy, rules),
      DB.prepare(
        `INSERT INTO community_members (community_id, user_email, role, status)
         VALUES (?, ?, 'founder', 'active')`,
      ).bind(id, identity.email),
      DB.prepare(
        `INSERT INTO community_audit_logs (id, community_id, actor_email, action, detail)
         VALUES (?, ?, ?, 'community.created', ?)`,
      ).bind(crypto.randomUUID(), id, identity.email, JSON.stringify({ joinPolicy })),
    ]);
    await audit(DB, identity.email, "community.created", "community", id, { joinPolicy });
    const response = await GET(new Request(`${new URL(request.url).origin}/api/communities?id=${id}`, { headers: request.headers }));
    const body = await response.json();
    return Response.json(body, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Topluluk şu anda kurulamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Topluluk işlemi için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Topluluk işlemi geçerli değil." }, { status: 400 });
  }
  const id = cleanText(payload.id, 80);
  const action = cleanText(payload.action, 24);
  const targetId = cleanText(payload.targetId, 80);
  const role = cleanText(payload.role, 20);
  if (!id || !["join", "leave", "archive", "restore", "approve", "role"].includes(action)) {
    return Response.json({ error: "Topluluk işlemi desteklenmiyor." }, { status: 400 });
  }

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "community-action", 80, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const community = await DB
      .prepare(
        `SELECT c.id, c.name, c.creator_email, c.join_policy, c.status
         FROM communities c
         JOIN student_profiles creator_profile ON creator_profile.user_email = c.creator_email
         WHERE c.id = ? AND creator_profile.university_id = ? LIMIT 1`,
      )
      .bind(id, profile.university_id)
      .first<{ id: string; name: string; creator_email: string; join_policy: string; status: string }>();
    if (!community) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
    const membership = await DB
      .prepare(`SELECT role, status FROM community_members WHERE community_id = ? AND user_email = ? LIMIT 1`)
      .bind(id, identity.email)
      .first<{ role: string; status: string }>();

    if (action === "join") {
      if (community.status !== "active") return Response.json({ error: "Arşivlenmiş topluluğa katılamazsın." }, { status: 409 });
      const nextStatus = community.join_policy === "request" ? "pending" : "active";
      await DB
        .prepare(
          `INSERT INTO community_members (community_id, user_email, role, status)
           VALUES (?, ?, 'member', ?)
           ON CONFLICT(community_id, user_email) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(id, identity.email, nextStatus)
        .run();
      await audit(DB, identity.email, `community.${nextStatus === "pending" ? "join_requested" : "joined"}`, "community", id);
      if (nextStatus === "pending") {
        await notify(DB, { userEmail: community.creator_email, actorEmail: identity.email, kind: "community", title: `${community.name} için yeni katılım isteği`, entityType: "community", entityId: id });
      }
      return Response.json({ joined: nextStatus === "active", pending: nextStatus === "pending", status: nextStatus });
    }

    if (action === "leave") {
      if (membership?.role === "founder") return Response.json({ error: "Kurucu topluluktan ayrılamaz; önce bir yönetici atamalısın." }, { status: 409 });
      await DB.prepare(`DELETE FROM community_members WHERE community_id = ? AND user_email = ?`).bind(id, identity.email).run();
      await audit(DB, identity.email, "community.left", "community", id);
      return Response.json({ joined: false, pending: false, status: null });
    }

    if (!membership || !["founder", "admin", "moderator"].includes(membership.role) || membership.status !== "active") {
      return Response.json({ error: "Bu yönetim işlemi için yetkin yok." }, { status: 403 });
    }
    if (["archive", "restore"].includes(action)) {
      if (!['founder', 'admin'].includes(membership.role)) return Response.json({ error: "Topluluğu yalnızca kurucu veya yönetici arşivleyebilir." }, { status: 403 });
      const nextStatus = action === "archive" ? "archived" : "active";
      await DB
        .prepare(`UPDATE communities SET status = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(nextStatus, nextStatus === "archived" ? new Date().toISOString() : null, id)
        .run();
      await DB.prepare(
        `INSERT INTO community_audit_logs (id, community_id, actor_email, action) VALUES (?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, identity.email, `community.${action}`).run();
      await audit(DB, identity.email, `community.${action}`, "community", id);
      return Response.json({ status: nextStatus });
    }

    const target = targetId
      ? await DB.prepare(`SELECT email FROM users WHERE public_id = ? LIMIT 1`).bind(targetId).first<{ email: string }>()
      : null;
    if (!target) return Response.json({ error: "Üye bulunamadı." }, { status: 404 });
    const targetMembership = await DB
      .prepare(`SELECT role, status FROM community_members WHERE community_id = ? AND user_email = ? LIMIT 1`)
      .bind(id, target.email)
      .first<{ role: string; status: string }>();
    if (!targetMembership) return Response.json({ error: "Üyelik bulunamadı." }, { status: 404 });
    if (targetMembership.role === "founder") return Response.json({ error: "Kurucu rolü değiştirilemez." }, { status: 409 });

    if (action === "approve") {
      await DB.prepare(`UPDATE community_members SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE community_id = ? AND user_email = ?`).bind(id, target.email).run();
      await notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "community", title: `${community.name} katılım isteğin kabul edildi`, entityType: "community", entityId: id });
    } else {
      if (membership.role !== "founder" && membership.role !== "admin") return Response.json({ error: "Rolleri yalnızca kurucu veya yönetici değiştirebilir." }, { status: 403 });
      if (!['member', 'moderator', 'admin'].includes(role)) return Response.json({ error: "Rol geçerli değil." }, { status: 400 });
      await DB.prepare(`UPDATE community_members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE community_id = ? AND user_email = ?`).bind(role, id, target.email).run();
    }
    await DB.prepare(
      `INSERT INTO community_audit_logs (id, community_id, actor_email, action, target_email, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, identity.email, `member.${action}`, target.email, JSON.stringify({ role })).run();
    await audit(DB, identity.email, `community.member.${action}`, "community", id, { targetId, role });
    return Response.json({ updated: true });
  } catch (error) {
    return unavailableResponse(error, "Topluluk işlemi şu anda tamamlanamadı.");
  }
}
