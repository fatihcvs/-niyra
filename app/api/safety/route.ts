import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  relativeTime,
  requireIdentity,
  requireProfile,
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
  if (action === "report" && (!['post', 'comment', 'note', 'note-comment', 'community', 'community-event', 'pulse', 'meetup', 'place', 'housing-message', 'event', 'listing', 'price', 'direct-message', 'user'].includes(entityType) || !entityId)) {
    return Response.json({ error: "Şikâyet edilen içerik geçerli değil." }, { status: 400 });
  }
  if (action === "report" && !['spam', 'harassment', 'privacy', 'copyright', 'misinformation', 'other'].includes(reason)) {
    return Response.json({ error: "Şikâyet nedeni geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, `safety-${action}`, action === "report" ? 12 : 80, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    if (action === "block" || action === "mute") {
      const targetId = cleanText(payload.targetId, 80);
      const target = await DB.prepare(
        `SELECT u.email FROM users u
         JOIN student_profiles target_profile ON target_profile.user_email = u.email
         WHERE u.public_id = ? AND u.email <> ? AND target_profile.university_id = ? LIMIT 1`,
      ).bind(targetId, identity.email, profile.university_id).first<{ email: string }>();
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
      if (entityType === "post") evidence = await DB.prepare(
        `SELECT p.id, p.author_email, p.content, p.created_at FROM posts p
         JOIN student_profiles author_profile ON author_profile.user_email = p.author_email
         WHERE p.id = ? AND author_profile.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "comment") evidence = await DB.prepare(
        `SELECT pc.id, pc.author_email, pc.content, pc.created_at FROM post_comments pc
         JOIN posts p ON p.id = pc.post_id
         JOIN student_profiles author_profile ON author_profile.user_email = p.author_email
         WHERE pc.id = ? AND author_profile.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "note") evidence = await DB.prepare(
        `SELECT n.id, n.owner_email, n.title, n.description, n.original_file_name, n.created_at FROM notes n
         JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
         WHERE n.id = ? AND owner_profile.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "note-comment") evidence = await DB.prepare(
        `SELECT nc.id, nc.author_email, nc.note_id, nc.content, nc.created_at FROM note_comments nc
         JOIN notes n ON n.id = nc.note_id
         JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
         WHERE nc.id = ? AND nc.deleted_at IS NULL AND owner_profile.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "community") evidence = await DB.prepare(
        `SELECT c.id, c.creator_email, c.name, c.description, c.rules, c.created_at FROM communities c
         WHERE c.id = ? AND c.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "community-event") evidence = await DB.prepare(
        `SELECT e.id, e.creator_email, e.community_id, e.title, e.description, e.location,
                e.starts_at, e.ends_at, e.capacity, e.created_at
         FROM community_events e JOIN communities c ON c.id = e.community_id
         WHERE e.id = ? AND c.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "pulse") evidence = await DB.prepare(
        `SELECT p.id, p.author_email, p.kind, p.category, p.content, p.campus_zone,
                p.is_anonymous, p.expires_at, p.created_at
         FROM campus_pulse_posts p
         WHERE p.id = ? AND p.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "meetup") evidence = await DB.prepare(
        `SELECT mr.id, mr.sender_email, mr.recipient_email, mr.activity, mr.message,
                mr.proposed_time, mr.campus_place, mr.status, mr.created_at
         FROM meetup_requests mr
         JOIN student_profiles sender_profile ON sender_profile.user_email = mr.sender_email
         JOIN student_profiles recipient_profile ON recipient_profile.user_email = mr.recipient_email
         WHERE mr.id = ? AND sender_profile.university_id = ? AND recipient_profile.university_id = ?
           AND (mr.sender_email = ? OR mr.recipient_email = ?)
         LIMIT 1`,
      ).bind(entityId, profile.university_id, profile.university_id, identity.email, identity.email).first<Record<string, unknown>>();
      if (entityType === "place") evidence = await DB.prepare(
        `SELECT id, creator_email, name, category, description, address, latitude, longitude,
                accessibility_json, opening_hours, verified_at, created_at
         FROM campus_places WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "housing-message") evidence = await DB.prepare(
        `SELECT h.id, h.author_email, h.place_id, h.content, h.is_anonymous, h.created_at
         FROM housing_discussions h
         JOIN campus_places cp ON cp.id = h.place_id
         WHERE h.id = ? AND cp.university_id = ? AND h.status = 'active' LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "event") evidence = await DB.prepare(
        `SELECT id, creator_email, place_id, title, description, category, starts_at, ends_at, created_at
         FROM campus_events WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "listing") evidence = await DB.prepare(
        `SELECT id, owner_email, kind, category, title, description, price_cents, condition,
                meetup_place, status, created_at
         FROM marketplace_listings WHERE id = ? AND university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "price") evidence = await DB.prepare(
        `SELECT id, reporter_email, place_id, place_name, item_name, category, price_cents,
                observed_at, source_note, created_at
         FROM campus_price_reports WHERE id = ? AND university_id = ? AND status = 'active' LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
      if (entityType === "direct-message") evidence = await DB.prepare(
        `SELECT m.id, m.conversation_id, m.sender_email, m.body, m.attachment_type,
                m.attachment_id, m.attachment_snapshot, m.created_at
         FROM direct_messages m
         JOIN direct_conversations c ON c.id = m.conversation_id
         WHERE m.id = ? AND c.university_id = ?
           AND (c.member_one_email = ? OR c.member_two_email = ?)
           AND m.sender_email <> ?
         LIMIT 1`,
      ).bind(entityId, profile.university_id, identity.email, identity.email, identity.email).first<Record<string, unknown>>();
      if (entityType === "user") evidence = await DB.prepare(
        `SELECT u.public_id, u.display_name, u.handle, u.created_at FROM users u
         JOIN student_profiles target_profile ON target_profile.user_email = u.email
         WHERE u.public_id = ? AND target_profile.university_id = ? LIMIT 1`,
      ).bind(entityId, profile.university_id).first<Record<string, unknown>>();
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
