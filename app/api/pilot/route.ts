import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  requireIdentity,
  sha256,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

export async function GET() {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Pilot ilerlemeni görmek için giriş yapmalısın.");
  try {
    const { DB } = await getRuntime();
    const progress = await DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM student_courses WHERE user_email = ?) AS course_count,
        (SELECT COUNT(*) FROM user_follows WHERE follower_email = ?) AS follow_count,
        (SELECT COUNT(*) FROM note_saves WHERE user_email = ?) AS saved_note_count,
        (SELECT COUNT(*) FROM posts WHERE author_email = ? AND deleted_at IS NULL) AS post_count,
        (SELECT COUNT(*) FROM notes WHERE owner_email = ? AND status = 'published' AND deleted_at IS NULL) AS note_count`,
    ).bind(identity.email, identity.email, identity.email, identity.email, identity.email).first<{
      course_count: number; follow_count: number; saved_note_count: number; post_count: number; note_count: number;
    }>();
    const goals = [
      { id: "courses", label: "En az 3 ders seç", complete: Number(progress?.course_count ?? 0) >= 3 },
      { id: "follow", label: "1 öğrenciyi takip et", complete: Number(progress?.follow_count ?? 0) >= 1 },
      { id: "save-note", label: "1 not kaydet", complete: Number(progress?.saved_note_count ?? 0) >= 1 },
      { id: "contribute", label: "1 gönderi veya not paylaş", complete: Number(progress?.post_count ?? 0) + Number(progress?.note_count ?? 0) >= 1 },
    ];
    return Response.json({ goals, completed: goals.filter((goal) => goal.complete).length, total: goals.length });
  } catch (error) {
    return unavailableResponse(error, "Pilot ilerlemen şu anda getirilemedi.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Pilot işlemi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 24);
  try {
    const { DB } = await getRuntime();
    const limit = await enforceRateLimit(DB, identity.email, `pilot-${action}`, 40, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (action === "event") {
      const name = cleanText(payload.name, 60);
      const allowedEvents = ["onboarding.completed", "search.completed", "note.opened", "community.joined", "feedback.opened"];
      if (!allowedEvents.includes(name)) return Response.json({ error: "Ölçüm olayı desteklenmiyor." }, { status: 400 });
      await DB.prepare(`INSERT INTO product_events (id, user_email, name, properties_json) VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), identity.email, name, JSON.stringify({ source: cleanText(payload.source, 40) })).run();
      return Response.json({ recorded: true });
    }
    if (action === "feedback") {
      const rating = Number(payload.rating);
      const message = cleanText(payload.message, 1200);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || message.length < 5) return Response.json({ error: "1–5 puan ve kısa bir açıklama gerekli." }, { status: 400 });
      const id = crypto.randomUUID();
      await DB.prepare(`INSERT INTO product_feedback (id, user_email, rating, message) VALUES (?, ?, ?, ?)`).bind(id, identity.email, rating, message).run();
      await audit(DB, identity.email, "feedback.created", "feedback", id, { rating });
      return Response.json({ feedback: { id, status: "new" } }, { status: 201 });
    }
    if (action === "invite") {
      const code = `${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const id = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await DB.prepare(`INSERT INTO pilot_invites (id, code_hash, created_by_email, expires_at) VALUES (?, ?, ?, ?)`).bind(id, await sha256(code), identity.email, expiresAt).run();
      await audit(DB, identity.email, "pilot.invite.created", "pilot_invite", id);
      return Response.json({ invite: { code, expiresAt } }, { status: 201 });
    }
    if (action === "claim") {
      const code = cleanText(payload.code, 40);
      if (!code) return Response.json({ error: "Davet kodu zorunludur." }, { status: 400 });
      const invite = await DB.prepare(`SELECT id FROM pilot_invites WHERE code_hash = ? AND claimed_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1`).bind(await sha256(code)).first<{ id: string }>();
      if (!invite) return Response.json({ error: "Davet kodu geçersiz, kullanılmış veya süresi dolmuş." }, { status: 404 });
      await DB.prepare(`UPDATE pilot_invites SET claimed_by_email = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND claimed_at IS NULL`).bind(identity.email, invite.id).run();
      await audit(DB, identity.email, "pilot.invite.claimed", "pilot_invite", invite.id);
      return Response.json({ claimed: true });
    }
    return Response.json({ error: "Pilot işlemi desteklenmiyor." }, { status: 400 });
  } catch (error) {
    return unavailableResponse(error, "Pilot işlemi şu anda tamamlanamadı.");
  }
}
