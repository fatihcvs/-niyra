import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

async function isModerator(db: D1Database, email: string) {
  return Boolean(await db.prepare(`SELECT role FROM platform_roles WHERE user_email = ? AND role IN ('moderator', 'admin') LIMIT 1`).bind(email).first());
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Güvenlik merkezini kullanmak için giriş yapmalısın.");
  const moderation = new URL(request.url).searchParams.get("moderation") === "1";
  try {
    const { DB } = await getRuntime();
    const moderator = await isModerator(DB, identity.email);
    if (moderation && !moderator) return Response.json({ error: "Moderasyon kuyruğu için yetkin yok." }, { status: 403 });
    const [reports, blocked, muted] = await Promise.all([
      moderation
        ? DB.prepare(
            `SELECT r.id, r.entity_type, r.entity_id, r.reason, r.details, r.evidence_json, r.status,
                    r.decision, r.appeal_text, r.created_at, u.display_name AS reporter_name
             FROM content_reports r JOIN users u ON u.email = r.reporter_email
             ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'appealed' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 100`,
          ).all<{
            id: string; entity_type: string; entity_id: string; reason: string; details: string; evidence_json: string;
            status: string; decision: string | null; appeal_text: string | null; created_at: string; reporter_name: string;
          }>()
        : DB.prepare(
            `SELECT id, entity_type, entity_id, reason, details, evidence_json, status, decision,
                    appeal_text, created_at, 'Sen' AS reporter_name
             FROM content_reports WHERE reporter_email = ? ORDER BY created_at DESC LIMIT 40`,
          ).bind(identity.email).all<{
            id: string; entity_type: string; entity_id: string; reason: string; details: string; evidence_json: string;
            status: string; decision: string | null; appeal_text: string | null; created_at: string; reporter_name: string;
          }>(),
      DB.prepare(
        `SELECT u.public_id, u.display_name, u.handle FROM user_blocks b JOIN users u ON u.email = b.blocked_email
         WHERE b.blocker_email = ? ORDER BY b.created_at DESC`,
      ).bind(identity.email).all(),
      DB.prepare(
        `SELECT u.public_id, u.display_name, u.handle FROM user_mutes m JOIN users u ON u.email = m.muted_email
         WHERE m.muter_email = ? ORDER BY m.created_at DESC`,
      ).bind(identity.email).all(),
    ]);
    return Response.json({
      moderator,
      reports: reports.results.map((report) => ({
        id: report.id, entityType: report.entity_type, entityId: report.entity_id, reason: report.reason,
        details: report.details, status: report.status, decision: report.decision, appealText: report.appeal_text,
        reporterName: report.reporter_name, time: relativeTime(report.created_at),
      })),
      blocked: blocked.results,
      muted: muted.results,
    });
  } catch (error) {
    return unavailableResponse(error, "Güvenlik merkezine şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Güvenlik işlemi için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Güvenlik işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 24);
  if (!['block', 'mute', 'report'].includes(action)) return Response.json({ error: "Güvenlik işlemi desteklenmiyor." }, { status: 400 });
  const entityType = cleanText(payload.entityType, 24);
  const entityId = cleanText(payload.entityId, 80);
  const reason = cleanText(payload.reason, 40);
  if (action === "report" && (!['post', 'comment', 'note', 'community', 'user'].includes(entityType) || !entityId)) {
    return Response.json({ error: "Şikâyet edilen içerik geçerli değil." }, { status: 400 });
  }
  if (action === "report" && !['spam', 'harassment', 'privacy', 'copyright', 'misinformation', 'other'].includes(reason)) {
    return Response.json({ error: "Şikâyet nedeni geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, `safety-${action}`, action === "report" ? 12 : 80, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    if (action === "block" || action === "mute") {
      const targetId = cleanText(payload.targetId, 80);
      const target = await DB.prepare(`SELECT email FROM users WHERE public_id = ? AND email <> ? LIMIT 1`).bind(targetId, identity.email).first<{ email: string }>();
      if (!target) return Response.json({ error: "Öğrenci bulunamadı." }, { status: 404 });
      const table = action === "block" ? "user_blocks" : "user_mutes";
      const firstColumn = action === "block" ? "blocker_email" : "muter_email";
      const secondColumn = action === "block" ? "blocked_email" : "muted_email";
      const current = await DB.prepare(`SELECT 1 AS found FROM ${table} WHERE ${firstColumn} = ? AND ${secondColumn} = ? LIMIT 1`).bind(identity.email, target.email).first();
      if (current) {
        await DB.prepare(`DELETE FROM ${table} WHERE ${firstColumn} = ? AND ${secondColumn} = ?`).bind(identity.email, target.email).run();
      } else {
        const statements = [DB.prepare(`INSERT INTO ${table} (${firstColumn}, ${secondColumn}) VALUES (?, ?)`).bind(identity.email, target.email)];
        if (action === "block") {
          statements.push(DB.prepare(`DELETE FROM user_follows WHERE (follower_email = ? AND following_email = ?) OR (follower_email = ? AND following_email = ?)`).bind(identity.email, target.email, target.email, identity.email));
        }
        await DB.batch(statements);
      }
      await audit(DB, identity.email, `user.${current ? "un" : ""}${action}ed`, "user", targetId);
      return Response.json({ active: !current });
    }

    if (action === "report") {
      const details = cleanText(payload.details, 800);

      let evidence: Record<string, unknown> | null = null;
      if (entityType === "post") evidence = await DB.prepare(`SELECT id, author_email, content, created_at FROM posts WHERE id = ? LIMIT 1`).bind(entityId).first<Record<string, unknown>>();
      if (entityType === "comment") evidence = await DB.prepare(`SELECT id, author_email, content, created_at FROM post_comments WHERE id = ? LIMIT 1`).bind(entityId).first<Record<string, unknown>>();
      if (entityType === "note") evidence = await DB.prepare(`SELECT id, owner_email, title, description, original_file_name, created_at FROM notes WHERE id = ? LIMIT 1`).bind(entityId).first<Record<string, unknown>>();
      if (entityType === "community") evidence = await DB.prepare(`SELECT id, creator_email, name, description, rules, created_at FROM communities WHERE id = ? LIMIT 1`).bind(entityId).first<Record<string, unknown>>();
      if (entityType === "user") evidence = await DB.prepare(`SELECT public_id, display_name, handle, created_at FROM users WHERE public_id = ? LIMIT 1`).bind(entityId).first<Record<string, unknown>>();
      if (!evidence) return Response.json({ error: "Şikâyet edilen içerik bulunamadı." }, { status: 404 });

      const duplicate = await DB.prepare(
        `SELECT id FROM content_reports WHERE reporter_email = ? AND entity_type = ? AND entity_id = ? AND status IN ('open', 'appealed') LIMIT 1`,
      ).bind(identity.email, entityType, entityId).first();
      if (duplicate) return Response.json({ error: "Bu içerik için açık bir şikâyetin zaten var." }, { status: 409 });
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO content_reports (id, reporter_email, entity_type, entity_id, reason, details, evidence_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, identity.email, entityType, entityId, reason, details, JSON.stringify(evidence)).run();
      await audit(DB, identity.email, "report.created", entityType, entityId, { reportId: id, reason });
      return Response.json({ report: { id, status: "open" } }, { status: 201 });
    }
    return Response.json({ error: "Güvenlik işlemi desteklenmiyor." }, { status: 400 });
  } catch (error) {
    return unavailableResponse(error, "Güvenlik işlemi şu anda tamamlanamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Karar bilgisi geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  const action = cleanText(payload.action, 20);
  try {
    const { DB } = await getRuntime();
    if (action === "appeal") {
      const appeal = cleanText(payload.appeal, 1000);
      if (appeal.length < 10) return Response.json({ error: "İtiraz açıklaması en az 10 karakter olmalı." }, { status: 400 });
      const report = await DB.prepare(`SELECT id FROM content_reports WHERE id = ? AND reporter_email = ? AND status = 'resolved' LIMIT 1`).bind(id, identity.email).first();
      if (!report) return Response.json({ error: "İtiraz edilebilecek bir karar bulunamadı." }, { status: 404 });
      await DB.prepare(`UPDATE content_reports SET status = 'appealed', appeal_text = ?, appealed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(appeal, id).run();
      await audit(DB, identity.email, "report.appealed", "report", id);
      return Response.json({ status: "appealed" });
    }
    if (action !== "decide" || !(await isModerator(DB, identity.email))) return Response.json({ error: "Moderasyon kararı için yetkin yok." }, { status: 403 });
    const decision = cleanText(payload.decision, 800);
    if (decision.length < 5) return Response.json({ error: "Karar açıklaması en az 5 karakter olmalı." }, { status: 400 });
    const updated = await DB.prepare(
      `UPDATE content_reports SET status = 'resolved', decision = ?, decided_by_email = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('open', 'appealed') RETURNING reporter_email`,
    ).bind(decision, identity.email, id).first<{ reporter_email: string }>();
    if (!updated) return Response.json({ error: "Açık şikâyet bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, "report.resolved", "report", id, { decision });
    return Response.json({ status: "resolved" });
  } catch (error) {
    return unavailableResponse(error, "Moderasyon işlemi şu anda tamamlanamadı.");
  }
}
