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
import { getBooleanPlatformSetting } from "../../../lib/platform-settings";

const categories = ["akademik", "teknoloji", "kampus", "kariyer", "sosyal", "spor", "sanat", "ilgi"] as const;
const managerRoles = ["founder", "admin", "moderator"];

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  join_policy: string;
  rules: string;
  status: string;
  moderation_status: string;
  course_id: string | null;
  course_code: string | null;
  creator_id: string | null;
  creator_name: string;
  created_at: string;
  last_activity_at: string;
  member_count: number;
  post_count: number;
  weekly_post_count: number;
  event_count: number;
  next_event_title: string | null;
  next_event_starts_at: string | null;
  membership_status: string | null;
  role: string | null;
  notification_level: string | null;
};

type MemberRow = {
  public_id: string;
  display_name: string;
  handle: string;
  role: string;
  status: string;
  notification_level: string;
  created_at: string;
  department_name: string | null;
  avatar_updated_at: string | null;
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
    lastActivityAt: row.last_activity_at,
    lastActive: relativeTime(row.last_activity_at),
    memberCount: Number(row.member_count),
    postCount: Number(row.post_count),
    weeklyPostCount: Number(row.weekly_post_count),
    eventCount: Number(row.event_count),
    nextEvent: row.next_event_title && row.next_event_starts_at
      ? { title: row.next_event_title, startsAt: row.next_event_starts_at }
      : null,
    membershipStatus: row.membership_status,
    role: row.role,
    notificationLevel: row.notification_level ?? "all",
    joined: row.membership_status === "active",
    pending: row.membership_status === "pending",
    canManage: managerRoles.includes(row.role ?? ""),
  };
}

function serializeMember(row: MemberRow) {
  return {
    publicId: row.public_id,
    displayName: row.display_name,
    handle: row.handle,
    role: row.role,
    status: row.status,
    notificationLevel: row.notification_level,
    joinedAt: row.created_at,
    departmentName: row.department_name ?? "Bölüm bilgisi yok",
    avatarUrl: profileMediaUrl(row.public_id, "avatar", row.avatar_updated_at),
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
                 c.rules, c.status, c.moderation_status, c.course_id, cr.code AS course_code,
                 u.public_id AS creator_id, u.display_name AS creator_name, c.created_at,
                 COALESCE(c.last_activity_at, c.created_at) AS last_activity_at,
                 (SELECT COUNT(*) FROM community_members cmx WHERE cmx.community_id = c.id AND cmx.status = 'active') AS member_count,
                 (SELECT COUNT(*) FROM posts px WHERE px.community_id = c.id AND px.deleted_at IS NULL) AS post_count,
                 (SELECT COUNT(*) FROM posts pw WHERE pw.community_id = c.id AND pw.deleted_at IS NULL AND datetime(pw.created_at) >= datetime('now', '-7 days')) AS weekly_post_count,
                 (SELECT COUNT(*) FROM community_events ce WHERE ce.community_id = c.id AND ce.status = 'active' AND datetime(ce.starts_at) >= datetime('now')) AS event_count,
                 (SELECT ce.title FROM community_events ce WHERE ce.community_id = c.id AND ce.status = 'active' AND datetime(ce.starts_at) >= datetime('now') ORDER BY ce.starts_at LIMIT 1) AS next_event_title,
                 (SELECT ce.starts_at FROM community_events ce WHERE ce.community_id = c.id AND ce.status = 'active' AND datetime(ce.starts_at) >= datetime('now') ORDER BY ce.starts_at LIMIT 1) AS next_event_starts_at,
                 cm.status AS membership_status, cm.role, cm.notification_level
          FROM communities c
          JOIN users u ON u.email = c.creator_email
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
  const requestedCategory = cleanText(url.searchParams.get("category"), 30);
  const category = categories.includes(requestedCategory as typeof categories[number]) ? requestedCategory : "";
  const sort = cleanText(url.searchParams.get("sort"), 20);

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    if (id) {
      const community = await DB
        .prepare(`${baseSelect()} WHERE c.id = ? AND c.moderation_status = 'active' AND c.university_id = ?
          AND (c.status = 'active' OR (cm.status = 'active' AND cm.role IN ('founder','admin','moderator'))) LIMIT 1`)
        .bind(identity.email, id, profile.university_id)
        .first<CommunityRow>();
      if (!community) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
      const serialized = serialize(community);
      const canSeeMembers = serialized.joined || serialized.canManage;
      const members = canSeeMembers
        ? await DB.prepare(
            `SELECT u.public_id, u.display_name, u.handle, cm.role, cm.status, cm.notification_level, cm.created_at,
                    d.name AS department_name,
                    (SELECT updated_at FROM profile_media pm WHERE pm.user_email = u.email AND pm.kind = 'avatar' LIMIT 1) AS avatar_updated_at
             FROM community_members cm
             JOIN users u ON u.email = cm.user_email
             LEFT JOIN student_profiles sp ON sp.user_email = u.email
             LEFT JOIN departments d ON d.id = sp.department_id
             WHERE cm.community_id = ? AND (cm.status = 'active' OR ? = 1)
             ORDER BY CASE cm.status WHEN 'pending' THEN 0 ELSE 1 END,
                      CASE cm.role WHEN 'founder' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,
                      cm.created_at LIMIT 120`,
          ).bind(id, serialized.canManage ? 1 : 0).all<MemberRow>()
        : { results: [] as MemberRow[] };
      const bans = serialized.canManage
        ? await DB.prepare(
            `SELECT u.public_id, u.display_name, u.handle, cb.reason, cb.created_at
             FROM community_bans cb JOIN users u ON u.email = cb.user_email
             WHERE cb.community_id = ? ORDER BY cb.created_at DESC LIMIT 100`,
          ).bind(id).all()
        : { results: [] };
      return Response.json({ community: serialized, members: members.results.map(serializeMember), bans: bans.results });
    }

    const like = query ? `%${query}%` : "";
    const order = sort === "new"
      ? "c.created_at DESC"
      : sort === "members"
        ? "member_count DESC, last_activity_at DESC"
        : "CASE WHEN cm.status = 'active' THEN 0 ELSE 1 END, CASE WHEN c.course_id IN (SELECT sc.course_id FROM student_courses sc WHERE sc.user_email = ?) THEN 0 ELSE 1 END, last_activity_at DESC, member_count DESC";
    const bindings: Array<string | number> = [identity.email, profile.university_id, mine, category, category, like, like];
    if (!['new', 'members'].includes(sort)) bindings.push(identity.email);
    const rows = await DB
      .prepare(`${baseSelect()}
        WHERE c.status = 'active' AND c.moderation_status = 'active' AND c.university_id = ?
          AND (? = 0 OR cm.status = 'active')
          AND (? = '' OR c.category = ?)
          AND (? = '' OR LOWER(c.name || ' ' || c.description || ' ' || c.category || ' ' || COALESCE(cr.code, '')) LIKE ?)
        ORDER BY ${order} LIMIT 60`)
      .bind(...bindings)
      .all<CommunityRow>();
    const stats = await DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN datetime(c.created_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS new_this_week,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active') THEN 1 ELSE 0 END) AS joined,
        (SELECT COUNT(*) FROM community_events ce JOIN communities cx ON cx.id = ce.community_id
          WHERE cx.university_id = ? AND cx.status = 'active' AND cx.moderation_status = 'active' AND ce.status = 'active' AND datetime(ce.starts_at) >= datetime('now')) AS upcoming_events
       FROM communities c WHERE c.university_id = ? AND c.status = 'active' AND c.moderation_status = 'active'`,
    ).bind(identity.email, profile.university_id, profile.university_id).first<Record<string, number>>();
    return Response.json({ communities: rows.results.map(serialize), stats: { total: Number(stats?.total ?? 0), joined: Number(stats?.joined ?? 0), newThisWeek: Number(stats?.new_this_week ?? 0), upcomingEvents: Number(stats?.upcoming_events ?? 0) } });
  } catch (error) {
    return unavailableResponse(error, "Topluluklara şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan topluluk isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Topluluk kurmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Topluluk bilgileri geçerli değil." }, { status: 400 }); }

  const name = cleanText(payload.name, 80);
  const description = cleanText(payload.description, 500);
  const requestedCategory = cleanText(payload.category, 30);
  const category = categories.includes(requestedCategory as typeof categories[number]) ? requestedCategory : "";
  const joinPolicy = cleanText(payload.joinPolicy, 20);
  const rules = cleanText(payload.rules, 800);
  const courseId = cleanText(payload.courseId, 80) || null;
  if (name.length < 3) return Response.json({ error: "Topluluk adı en az 3 karakter olmalı." }, { status: 400 });
  if (description.length < 12) return Response.json({ error: "Topluluğun amacını biraz daha açıklamalısın." }, { status: 400 });
  if (!category) return Response.json({ error: "Topluluk kategorisi geçerli değil." }, { status: 400 });
  if (!['open', 'request'].includes(joinPolicy)) return Response.json({ error: "Katılım tipi geçerli değil." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    if (!(await getBooleanPlatformSetting(DB, "communityCreationOpen"))) return Response.json({ error: "Yeni topluluk oluşturma owner tarafından geçici olarak durduruldu." }, { status: 503 });
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Topluluk kurmadan önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "community-create", 3, 86400);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (courseId) {
      const course = await DB.prepare(`SELECT course_id FROM student_courses WHERE user_email = ? AND course_id = ? LIMIT 1`).bind(identity.email, courseId).first();
      if (!course) return Response.json({ error: "Ders topluluğu yalnızca seçtiğin derslerden biri için kurulabilir." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const slug = `${slugify(name)}-${id.slice(0, 6)}`;
    const now = new Date().toISOString();
    await DB.batch([
      DB.prepare(`INSERT INTO communities (id, creator_email, university_id, course_id, name, slug, description, category, join_policy, rules, last_activity_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, identity.email, profile.university_id, courseId, name, slug, description, category, joinPolicy, rules, now),
      DB.prepare(`INSERT INTO community_members (community_id, user_email, role, status) VALUES (?, ?, 'founder', 'active')`).bind(id, identity.email),
      DB.prepare(`INSERT INTO community_audit_logs (id, community_id, actor_email, action, detail) VALUES (?, ?, ?, 'community.created', ?)`).bind(crypto.randomUUID(), id, identity.email, JSON.stringify({ joinPolicy, category })),
    ]);
    await audit(DB, identity.email, "community.created", "community", id, { joinPolicy, category });
    const response = await GET(new Request(`${new URL(request.url).origin}/api/communities?id=${id}`, { headers: request.headers }));
    const body = await response.json();
    return Response.json(body, { status: 201 });
  } catch (error) {
    return unavailableResponse(error, "Topluluk şu anda kurulamadı.");
  }
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan topluluk isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Topluluk işlemi için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Topluluk işlemi geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  const action = cleanText(payload.action, 24);
  const targetId = cleanText(payload.targetId, 80);
  const role = cleanText(payload.role, 20);
  const allowedActions = ["join", "leave", "archive", "restore", "approve", "reject", "remove", "ban", "unban", "role", "notification", "update"];
  if (!id || !allowedActions.includes(action)) return Response.json({ error: "Topluluk işlemi desteklenmiyor." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "community-action", 100, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const community = await DB.prepare(`SELECT c.id, c.name, c.creator_email, c.join_policy, c.status FROM communities c WHERE c.id = ? AND c.university_id = ? AND c.moderation_status = 'active' LIMIT 1`).bind(id, profile.university_id).first<{ id: string; name: string; creator_email: string; join_policy: string; status: string }>();
    if (!community) return Response.json({ error: "Topluluk bulunamadı." }, { status: 404 });
    const membership = await DB.prepare(`SELECT role, status FROM community_members WHERE community_id = ? AND user_email = ? LIMIT 1`).bind(id, identity.email).first<{ role: string; status: string }>();

    if (action === "join") {
      if (community.status !== "active") return Response.json({ error: "Arşivlenmiş topluluğa katılamazsın." }, { status: 409 });
      const banned = await DB.prepare(`SELECT 1 FROM community_bans WHERE community_id = ? AND user_email = ? LIMIT 1`).bind(id, identity.email).first();
      if (banned) return Response.json({ error: "Bu topluluğa katılımın sınırlandırılmış." }, { status: 403 });
      const nextStatus = community.join_policy === "request" ? "pending" : "active";
      await DB.prepare(`INSERT INTO community_members (community_id, user_email, role, status) VALUES (?, ?, 'member', ?) ON CONFLICT(community_id, user_email) DO UPDATE SET role = CASE WHEN community_members.role = 'founder' THEN 'founder' ELSE 'member' END, status = excluded.status, updated_at = CURRENT_TIMESTAMP`).bind(id, identity.email, nextStatus).run();
      await audit(DB, identity.email, `community.${nextStatus === "pending" ? "join_requested" : "joined"}`, "community", id);
      if (nextStatus === "pending") await notify(DB, { userEmail: community.creator_email, actorEmail: identity.email, kind: "community", title: `${community.name} için yeni katılım isteği`, entityType: "community", entityId: id });
      return Response.json({ joined: nextStatus === "active", pending: nextStatus === "pending", status: nextStatus });
    }

    if (action === "leave") {
      if (membership?.role === "founder") return Response.json({ error: "Kurucu topluluktan ayrılamaz." }, { status: 409 });
      await DB.prepare(`DELETE FROM community_members WHERE community_id = ? AND user_email = ?`).bind(id, identity.email).run();
      await audit(DB, identity.email, "community.left", "community", id);
      return Response.json({ joined: false, pending: false, status: null });
    }

    if (action === "notification") {
      const level = cleanText(payload.level, 20);
      if (!membership || membership.status !== "active" || !["all", "announcements", "mute"].includes(level)) return Response.json({ error: "Bildirim tercihi geçerli değil." }, { status: 400 });
      await DB.prepare(`UPDATE community_members SET notification_level = ?, updated_at = CURRENT_TIMESTAMP WHERE community_id = ? AND user_email = ?`).bind(level, id, identity.email).run();
      return Response.json({ level });
    }

    if (!membership || !managerRoles.includes(membership.role) || membership.status !== "active") return Response.json({ error: "Bu yönetim işlemi için yetkin yok." }, { status: 403 });

    if (["archive", "restore"].includes(action)) {
      if (!['founder', 'admin'].includes(membership.role)) return Response.json({ error: "Topluluğu yalnızca kurucu veya yönetici arşivleyebilir." }, { status: 403 });
      const nextStatus = action === "archive" ? "archived" : "active";
      await DB.prepare(`UPDATE communities SET status = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND moderation_status = 'active'`).bind(nextStatus, nextStatus === "archived" ? new Date().toISOString() : null, id).run();
      await DB.prepare(`INSERT INTO community_audit_logs (id, community_id, actor_email, action) VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), id, identity.email, `community.${action}`).run();
      await audit(DB, identity.email, `community.${action}`, "community", id);
      return Response.json({ status: nextStatus });
    }

    if (action === "update") {
      if (!['founder', 'admin'].includes(membership.role)) return Response.json({ error: "Topluluk bilgilerini yalnızca kurucu veya yönetici değiştirebilir." }, { status: 403 });
      const description = cleanText(payload.description, 500);
      const rules = cleanText(payload.rules, 800);
      const joinPolicy = cleanText(payload.joinPolicy, 20);
      if (description.length < 12 || !['open', 'request'].includes(joinPolicy)) return Response.json({ error: "Topluluk bilgileri geçerli değil." }, { status: 400 });
      await DB.prepare(`UPDATE communities SET description = ?, rules = ?, join_policy = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(description, rules, joinPolicy, id).run();
      await audit(DB, identity.email, "community.updated", "community", id, { joinPolicy });
      return Response.json({ updated: true });
    }

    const target = targetId ? await DB.prepare(`SELECT email FROM users WHERE public_id = ? LIMIT 1`).bind(targetId).first<{ email: string }>() : null;
    if (!target) return Response.json({ error: "Üye bulunamadı." }, { status: 404 });
    const targetMembership = await DB.prepare(`SELECT role, status FROM community_members WHERE community_id = ? AND user_email = ? LIMIT 1`).bind(id, target.email).first<{ role: string; status: string }>();

    if (action === "unban") {
      if (!['founder', 'admin'].includes(membership.role)) return Response.json({ error: "Yasağı yalnızca kurucu veya yönetici kaldırabilir." }, { status: 403 });
      await DB.prepare(`DELETE FROM community_bans WHERE community_id = ? AND user_email = ?`).bind(id, target.email).run();
      await audit(DB, identity.email, "community.member.unbanned", "community", id, { targetId });
      return Response.json({ updated: true });
    }

    if (!targetMembership) return Response.json({ error: "Üyelik bulunamadı." }, { status: 404 });
    if (targetMembership.role === "founder") return Response.json({ error: "Kurucu üzerinde bu işlem yapılamaz." }, { status: 409 });
    const actorRank = { moderator: 1, admin: 2, founder: 3 }[membership.role] ?? 0;
    const targetRank = { member: 0, moderator: 1, admin: 2, founder: 3 }[targetMembership.role] ?? 0;
    if (actorRank <= targetRank) return Response.json({ error: "Kendi rolüne eşit veya daha yetkili bir üyeyi yönetemezsin." }, { status: 403 });

    if (action === "approve") {
      if (targetMembership.status !== "pending") return Response.json({ error: "Bekleyen katılım isteği bulunamadı." }, { status: 409 });
      await DB.prepare(`UPDATE community_members SET status = 'active', role = 'member', updated_at = CURRENT_TIMESTAMP WHERE community_id = ? AND user_email = ?`).bind(id, target.email).run();
      await notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "community", title: `${community.name} katılım isteğin kabul edildi`, entityType: "community", entityId: id });
    } else if (action === "reject" || action === "remove") {
      if (action === "reject" && targetMembership.status !== "pending") return Response.json({ error: "Bekleyen katılım isteği bulunamadı." }, { status: 409 });
      await DB.prepare(`DELETE FROM community_members WHERE community_id = ? AND user_email = ?`).bind(id, target.email).run();
      if (action === "remove") await notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "community", title: `${community.name} topluluğundaki üyeliğin sona erdi`, entityType: "community", entityId: id });
    } else if (action === "ban") {
      const reason = cleanText(payload.reason, 300);
      await DB.batch([
        DB.prepare(`INSERT INTO community_bans (community_id, user_email, banned_by_email, reason) VALUES (?, ?, ?, ?) ON CONFLICT(community_id, user_email) DO UPDATE SET banned_by_email = excluded.banned_by_email, reason = excluded.reason, created_at = CURRENT_TIMESTAMP`).bind(id, target.email, identity.email, reason),
        DB.prepare(`DELETE FROM community_members WHERE community_id = ? AND user_email = ?`).bind(id, target.email),
      ]);
      await notify(DB, { userEmail: target.email, actorEmail: identity.email, kind: "community", title: `${community.name} topluluğuna erişimin sınırlandırıldı`, entityType: "community", entityId: id });
    } else if (action === "role") {
      if (!['founder', 'admin'].includes(membership.role) || !['member', 'moderator', 'admin'].includes(role)) return Response.json({ error: "Rol değişikliği geçerli değil." }, { status: 400 });
      if (membership.role !== "founder" && (targetMembership.role === "admin" || role === "admin")) return Response.json({ error: "Yönetici rolünü yalnızca kurucu değiştirebilir." }, { status: 403 });
      await DB.prepare(`UPDATE community_members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE community_id = ? AND user_email = ?`).bind(role, id, target.email).run();
    }
    await DB.prepare(`INSERT INTO community_audit_logs (id, community_id, actor_email, action, target_email, detail) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, identity.email, `member.${action}`, target.email, JSON.stringify({ role })).run();
    await audit(DB, identity.email, `community.member.${action}`, "community", id, { targetId, role });
    return Response.json({ updated: true });
  } catch (error) {
    return unavailableResponse(error, "Topluluk işlemi şu anda tamamlanamadı.");
  }
}
