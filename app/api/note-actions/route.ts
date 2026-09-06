import {
  audit,
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../lib/server-api";

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Notu kaydetmek için giriş yapmalısın.");

  let payload: { id?: unknown; type?: unknown; active?: unknown };
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid payload");
  } catch {
    return Response.json({ error: "İşlem bilgisi geçerli değil." }, { status: 400 });
  }
  const id = cleanText(payload.id, 80);
  const type = cleanText(payload.type, 20);
  if (!id || !["save", "helpful", "unhelpful"].includes(type)) return Response.json({ error: "Not işlemi desteklenmiyor." }, { status: 400 });
  if ("active" in payload && typeof payload.active !== "boolean") return Response.json({ error: "İstenen not durumu geçerli değil." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, type === "save" ? "note-save" : "note-feedback", 80, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const note = await DB
      .prepare(
        `SELECT n.id FROM notes n
         JOIN student_profiles owner_profile ON owner_profile.user_email = n.owner_email
         WHERE n.id = ? AND n.status = 'published' AND n.deleted_at IS NULL
           AND owner_profile.university_id = ? LIMIT 1`,
      )
      .bind(id, profile.university_id)
      .first<{ id: string }>();
    if (!note) return Response.json({ error: "Not bulunamadı." }, { status: 404 });

    if (type === "save") {
      const current = await DB
        .prepare(`SELECT note_id FROM note_saves WHERE note_id = ? AND user_email = ? LIMIT 1`)
        .bind(id, identity.email)
        .first<{ note_id: string }>();
      const active = typeof payload.active === "boolean" ? payload.active : !current;
      const changed = active
        ? await DB.prepare(`INSERT INTO note_saves (note_id, user_email) VALUES (?, ?) ON CONFLICT(note_id, user_email) DO NOTHING RETURNING note_id`).bind(id, identity.email).first<{ note_id: string }>()
        : await DB.prepare(`DELETE FROM note_saves WHERE note_id = ? AND user_email = ? RETURNING note_id`).bind(id, identity.email).first<{ note_id: string }>();
      const count = await DB.prepare(`SELECT COUNT(*) AS total FROM note_saves WHERE note_id = ?`).bind(id).first<{ total: number }>();
      if (changed) await audit(DB, identity.email, active ? "note.saved" : "note.unsaved", "note", id);
      return Response.json({ active, count: Number(count?.total ?? 0) });
    }

    const current = await DB
      .prepare(`SELECT value FROM note_feedback WHERE note_id = ? AND user_email = ? LIMIT 1`)
      .bind(id, identity.email)
      .first<{ value: string }>();
    const nextVote = typeof payload.active === "boolean" ? payload.active ? type : null : current?.value === type ? null : type;
    let changed: { value: string } | null;
    if (nextVote) {
      changed = await DB.prepare(
        `INSERT INTO note_feedback (note_id, user_email, value) VALUES (?, ?, ?)
         ON CONFLICT(note_id, user_email) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
         WHERE note_feedback.value != excluded.value RETURNING value`,
      ).bind(id, identity.email, nextVote).first<{ value: string }>();
    } else {
      changed = await DB.prepare(`DELETE FROM note_feedback WHERE note_id = ? AND user_email = ? AND value = ? RETURNING value`).bind(id, identity.email, type).first<{ value: string }>();
    }
    const confirmed = await DB.prepare(`SELECT value FROM note_feedback WHERE note_id = ? AND user_email = ?`).bind(id, identity.email).first<{ value: string }>();
    const counts = await DB.prepare(
      `SELECT
         SUM(CASE WHEN value = 'helpful' THEN 1 ELSE 0 END) AS helpful,
         SUM(CASE WHEN value = 'unhelpful' THEN 1 ELSE 0 END) AS unhelpful
       FROM note_feedback WHERE note_id = ?`,
    ).bind(id).first<{ helpful: number | null; unhelpful: number | null }>();
    if (changed) await audit(DB, identity.email, nextVote ? "note.feedback_set" : "note.feedback_removed", "note", id, { value: nextVote });
    return Response.json({
      vote: confirmed?.value ?? null,
      helpfulCount: Number(counts?.helpful ?? 0),
      unhelpfulCount: Number(counts?.unhelpful ?? 0),
    });
  } catch (error) {
    return unavailableResponse(error, "Not kaydı şu anda değiştirilemedi.");
  }
}
