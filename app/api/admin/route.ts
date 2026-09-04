import { MODERATABLE_ENTITY_TYPES, type ModeratableEntityType } from "../../../lib/admin-registry";
import { cleanText, enforceRateLimit, getRuntime, rateLimitResponse } from "../../../lib/server-api";
import { requireSameOriginStaffRequest, requireStaff, staffAudit } from "../../../lib/staff-auth";

export async function GET(request: Request) {
  try {
    const { DB } = await getRuntime();
    const access = await requireStaff(DB, request);
    if ("response" in access) return access.response;
    const [metrics, reports, content, users, decisions] = await Promise.all([
      DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM content_reports WHERE status = 'open') AS reports_open,
          (SELECT COUNT(*) FROM content_reports WHERE status = 'appealed') AS reports_appealed,
          (SELECT COUNT(*) FROM content_reports WHERE status = 'resolved' AND datetime(decided_at) >= datetime('now', '-7 days')) AS reports_resolved_week,
          (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS users_suspended,
          (SELECT COUNT(*) FROM notes WHERE status IN ('processing', 'rejected') AND deleted_at IS NULL) AS notes_attention,
          (SELECT COUNT(*) FROM campus_places WHERE status = 'hidden') AS places_hidden,
          (SELECT COUNT(*) FROM housing_discussions WHERE status = 'hidden') AS housing_hidden,
          (SELECT COUNT(*) FROM marketplace_listings WHERE status = 'hidden') AS listings_hidden,
          (SELECT COUNT(*) FROM campus_pulse_posts WHERE status = 'hidden' AND deleted_at IS NULL) AS pulse_hidden`,
      ).first<Record<string, number>>(),
      DB.prepare(
        `SELECT r.id, r.entity_type, r.entity_id, r.reason, r.details, r.evidence_json, r.status,
                r.decision, r.appeal_text, r.created_at, u.display_name AS reporter_name, u.handle AS reporter_handle
         FROM content_reports r JOIN users u ON u.email = r.reporter_email
         ORDER BY CASE r.status WHEN 'appealed' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 100`,
      ).all<{
        id: string; entity_type: string; entity_id: string; reason: string; details: string; evidence_json: string;
        status: string; decision: string | null; appeal_text: string | null; created_at: string; reporter_name: string; reporter_handle: string;
      }>(),
      Promise.all([
        DB.prepare(
          `SELECT 'post' AS entity_type, p.id, SUBSTR(p.content, 1, 140) AS title, u.display_name AS owner_name,
                  CASE WHEN p.deleted_at IS NULL THEN 'active' ELSE 'hidden' END AS status, p.created_at
           FROM posts p JOIN users u ON u.email = p.author_email ORDER BY p.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'comment' AS entity_type, c.id, SUBSTR(c.content, 1, 140) AS title, u.display_name AS owner_name,
                  CASE WHEN c.deleted_at IS NULL THEN 'active' ELSE 'hidden' END AS status, c.created_at
           FROM post_comments c JOIN users u ON u.email = c.author_email ORDER BY c.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'note' AS entity_type, n.id, n.title, u.display_name AS owner_name, n.status, n.created_at
           FROM notes n JOIN users u ON u.email = n.owner_email WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'community' AS entity_type, c.id, c.name AS title, u.display_name AS owner_name, c.status, c.created_at
           FROM communities c JOIN users u ON u.email = c.creator_email ORDER BY c.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'pulse' AS entity_type, p.id, SUBSTR(p.content, 1, 140) AS title,
                  CASE WHEN p.is_anonymous = 1 THEN 'Anonim öğrenci' ELSE u.display_name END AS owner_name, p.status, p.created_at
           FROM campus_pulse_posts p JOIN users u ON u.email = p.author_email
           WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'listing' AS entity_type, l.id, l.title, u.display_name AS owner_name, l.status, l.created_at
           FROM marketplace_listings l JOIN users u ON u.email = l.owner_email ORDER BY l.created_at DESC LIMIT 100`,
        ).all(),
        DB.prepare(
          `SELECT 'housing-message' AS entity_type, h.id, SUBSTR(h.content, 1, 140) AS title,
                  CASE WHEN h.is_anonymous = 1 THEN 'Anonim öğrenci' ELSE u.display_name END AS owner_name,
                  h.status, h.created_at
           FROM housing_discussions h JOIN users u ON u.email = h.author_email
           WHERE h.status <> 'deleted' ORDER BY h.created_at DESC LIMIT 100`,
        ).all(),
      ]),
      DB.prepare(
        `SELECT u.email, u.public_id, u.display_name, u.handle, u.status, u.suspended_reason, u.created_at,
                un.short_name AS university_short_name,
                (SELECT COUNT(*) FROM content_reports r WHERE r.entity_type = 'user' AND r.entity_id = u.public_id) AS report_count
         FROM users u LEFT JOIN student_profiles sp ON sp.user_email = u.email
         LEFT JOIN universities un ON un.id = sp.university_id
         ORDER BY CASE u.status WHEN 'suspended' THEN 0 ELSE 1 END, u.created_at DESC LIMIT 100`,
      ).all(),
      DB.prepare(
        `SELECT l.action, l.entity_type, l.entity_id, l.detail, l.created_at, COALESCE(a.display_name, 'Sistem') AS actor_name
         FROM staff_audit_logs l LEFT JOIN staff_accounts a ON a.id = l.staff_id
         WHERE l.action LIKE 'moderation.%' OR l.action LIKE 'user.%'
         ORDER BY l.created_at DESC LIMIT 60`,
      ).all(),
    ]);
    return Response.json({
      staff: access.identity,
      metrics: metrics ?? {},
      reports: reports.results.map((report) => ({
        ...report,
        evidence: safeJson(report.evidence_json),
      })),
      content: content
        .flatMap((group) => group.results as Array<Record<string, unknown>>)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .slice(0, 100),
      users: users.results,
      decisions: decisions.results,
      generatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[admin] dashboard query failed", error);
    return Response.json({ error: "Admin paneli verileri şu anda yüklenemedi." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOriginStaffRequest(request);
  if (originError) return originError;
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Moderasyon işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 40);
  try {
    const { DB } = await getRuntime();
    const access = await requireStaff(DB, request);
    if ("response" in access) return access.response;
    const limit = await enforceRateLimit(DB, `staff:${access.identity.id}`, "admin-action", 240, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    if (action === "decide-report") {
      const id = cleanText(payload.id, 80);
      const decision = cleanText(payload.decision, 800);
      const moderationState = cleanText(payload.moderationState, 16);
      if (decision.length < 5) return Response.json({ error: "Karar açıklaması en az 5 karakter olmalı." }, { status: 400 });
      if (!['none', 'hide', 'restore'].includes(moderationState)) return Response.json({ error: "İçerik işlemi geçerli değil." }, { status: 400 });
      const report = await DB.prepare(
        `SELECT id, entity_type, entity_id FROM content_reports WHERE id = ? AND status IN ('open', 'appealed') LIMIT 1`,
      ).bind(id).first<{ id: string; entity_type: string; entity_id: string }>();
      if (!report) return Response.json({ error: "Açık şikâyet bulunamadı." }, { status: 404 });
      if (moderationState !== "none" && MODERATABLE_ENTITY_TYPES.includes(report.entity_type as ModeratableEntityType)) {
        const updated = await applyModerationState(DB, report.entity_type as ModeratableEntityType, report.entity_id, moderationState as "hide" | "restore", decision);
        if (!updated) return Response.json({ error: "Şikâyete bağlı içerik artık bulunamıyor; kararı içerik işlemi olmadan kaydedebilirsin." }, { status: 404 });
      }
      await DB.prepare(
        `UPDATE content_reports SET status = 'resolved', decision = ?, decided_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('open', 'appealed')`,
      ).bind(decision, id).run();
      await staffAudit(DB, access.identity.id, "moderation.report_resolved", "report", id, {
        entityType: report.entity_type, entityId: report.entity_id, moderationState, decision,
      });
      return Response.json({ resolved: true, status: "resolved" });
    }

    if (action === "moderate-content") {
      const entityType = cleanText(payload.entityType, 24) as ModeratableEntityType;
      const id = cleanText(payload.id, 80);
      const state = cleanText(payload.state, 16);
      const reason = cleanText(payload.reason, 500);
      if (!MODERATABLE_ENTITY_TYPES.includes(entityType) || !id || !["hide", "restore"].includes(state)) {
        return Response.json({ error: "İçerik moderasyon bilgileri geçerli değil." }, { status: 400 });
      }
      if (reason.length < 5) return Response.json({ error: "İşlem nedeni en az 5 karakter olmalı." }, { status: 400 });
      const updated = await applyModerationState(DB, entityType, id, state as "hide" | "restore", reason);
      if (!updated) return Response.json({ error: "Moderasyon hedefi bulunamadı." }, { status: 404 });
      await staffAudit(DB, access.identity.id, `moderation.content_${state}`, entityType, id, { reason });
      return Response.json({ updated: true, status: state === "hide" ? "hidden" : "active" });
    }

    if (action === "set-user-status") {
      const id = cleanText(payload.id, 80);
      const status = cleanText(payload.status, 16);
      const reason = cleanText(payload.reason, 500);
      if (!id || !["active", "suspended"].includes(status)) return Response.json({ error: "Kullanıcı durumu geçerli değil." }, { status: 400 });
      if (status === "suspended" && reason.length < 5) return Response.json({ error: "Askıya alma nedeni en az 5 karakter olmalı." }, { status: 400 });
      const user = await DB.prepare(`SELECT email, public_id FROM users WHERE public_id = ? LIMIT 1`).bind(id).first<{ email: string; public_id: string }>();
      if (!user) return Response.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
      await DB.batch([
        DB.prepare(
          `UPDATE users SET status = ?, suspended_at = ?, suspended_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE public_id = ?`,
        ).bind(status, status === "suspended" ? new Date().toISOString() : null, status === "suspended" ? reason : null, id),
        ...(status === "suspended" ? [DB.prepare(`DELETE FROM user_sessions WHERE user_email = ?`).bind(user.email)] : []),
      ]);
      await staffAudit(DB, access.identity.id, `user.${status}`, "user", id, { reason });
      return Response.json({ updated: true, status });
    }

    return Response.json({ error: "Moderasyon işlemi desteklenmiyor." }, { status: 400 });
  } catch (error) {
    console.error("[admin] moderation action failed", { action, error });
    return Response.json({ error: "Moderasyon işlemi şu anda tamamlanamadı." }, { status: 503 });
  }
}

async function applyModerationState(db: D1Database, entityType: ModeratableEntityType, id: string, state: "hide" | "restore", reason: string) {
  const hidden = state === "hide";
  const statements: Record<ModeratableEntityType, D1PreparedStatement> = {
    post: db.prepare(`UPDATE posts SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? new Date().toISOString() : null, id),
    comment: db.prepare(`UPDATE post_comments SET deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? new Date().toISOString() : null, id),
    note: db.prepare(`UPDATE notes SET status = ?, rejection_reason = ?, published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(hidden ? "rejected" : "published", hidden ? reason : null, hidden ? "rejected" : "published", id),
    community: db.prepare(`UPDATE communities SET status = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? "archived" : "active", hidden ? new Date().toISOString() : null, id),
    pulse: db.prepare(`UPDATE campus_pulse_posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(hidden ? "hidden" : "active", id),
    listing: db.prepare(`UPDATE marketplace_listings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? "hidden" : "active", id),
    place: db.prepare(`UPDATE campus_places SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? "hidden" : "active", id),
    "housing-message": db.prepare(`UPDATE housing_discussions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'deleted'`).bind(hidden ? "hidden" : "active", id),
    event: db.prepare(`UPDATE campus_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? "hidden" : "active", id),
    price: db.prepare(`UPDATE campus_price_reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(hidden ? "hidden" : "active", id),
    user: db.prepare(`UPDATE users SET status = ?, suspended_at = ?, suspended_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE public_id = ?`).bind(hidden ? "suspended" : "active", hidden ? new Date().toISOString() : null, hidden ? reason : null, id),
  };
  const result = await statements[entityType].run();
  if (entityType === "user" && hidden) {
    await db.prepare(`DELETE FROM user_sessions WHERE user_email = (SELECT email FROM users WHERE public_id = ? LIMIT 1)`).bind(id).run();
  }
  return Number(result.meta.changes ?? 0) > 0;
}

function safeJson(value: string) {
  try { return JSON.parse(value) as Record<string, unknown>; }
  catch { return {}; }
}
