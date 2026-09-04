import {
  audit,
  cleanText,
  getRuntime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../../lib/server-api";

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 140) || "kampira-notu";
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Not dosyasını açmak için giriş yapmalısın.");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"), 80);
  const download = url.searchParams.get("download") === "1";
  if (!id) return Response.json({ error: "Not bağlantısı geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const note = await DB
      .prepare(
        `SELECT object_key, original_file_name, content_type, byte_size, owner_email, status
         FROM notes
         JOIN student_profiles owner_profile ON owner_profile.user_email = notes.owner_email
         WHERE id = ? AND deleted_at IS NULL
           AND (status = 'published' OR owner_email = ?)
           AND owner_profile.university_id = ?
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = notes.owner_email) OR (b.blocker_email = notes.owner_email AND b.blocked_email = ?))
         LIMIT 1`,
      )
      .bind(id, identity.email, profile.university_id, identity.email, identity.email)
      .first<{
        object_key: string;
        original_file_name: string;
        content_type: string;
        byte_size: number;
        owner_email: string;
        status: string;
      }>();
    if (!note) return Response.json({ error: "Not bulunamadı veya erişim iznin yok." }, { status: 404 });

    const object = await FILES.get(note.object_key);
    if (!object) return Response.json({ error: "Not dosyası henüz hazır değil." }, { status: 409 });

    await DB
      .prepare(`INSERT OR IGNORE INTO note_views (note_id, user_email) VALUES (?, ?)`)
      .bind(id, identity.email)
      .run();
    await audit(DB, identity.email, download ? "note.downloaded" : "note.viewed", "note", id);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", note.content_type);
    headers.set("content-length", String(object.size || note.byte_size));
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${safeDownloadName(note.original_file_name)}"`);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return unavailableResponse(error, "Not dosyasına şu anda ulaşılamıyor.");
  }
}
