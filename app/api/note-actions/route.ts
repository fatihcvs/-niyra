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

  let payload: { id?: unknown; type?: unknown };
  try {
    payload = (await request.json()) as { id?: unknown; type?: unknown };
  } catch {
    return Response.json({ error: "İşlem bilgisi geçerli değil." }, { status: 400 });
  }
  const id = cleanText(payload.id, 80);
  const type = cleanText(payload.type, 20);
  if (!id || type !== "save") return Response.json({ error: "Not işlemi desteklenmiyor." }, { status: 400 });

  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "note-save", 80, 3600);
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

    const current = await DB
      .prepare(`SELECT note_id FROM note_saves WHERE note_id = ? AND user_email = ? LIMIT 1`)
      .bind(id, identity.email)
      .first<{ note_id: string }>();
    if (current) {
      await DB.prepare(`DELETE FROM note_saves WHERE note_id = ? AND user_email = ?`).bind(id, identity.email).run();
    } else {
      await DB.prepare(`INSERT INTO note_saves (note_id, user_email) VALUES (?, ?)`).bind(id, identity.email).run();
    }
    const count = await DB.prepare(`SELECT COUNT(*) AS total FROM note_saves WHERE note_id = ?`).bind(id).first<{ total: number }>();
    await audit(DB, identity.email, current ? "note.unsaved" : "note.saved", "note", id);
    return Response.json({ active: !current, count: Number(count?.total ?? 0) });
  } catch (error) {
    return unavailableResponse(error, "Not kaydı şu anda değiştirilemedi.");
  }
}
