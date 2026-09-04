import {
  cleanText,
  getRuntime,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../../lib/server-api";

function safeInlineName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 140) || "kampus-anlik-gorseli";
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüs görselini açmak için giriş yapmalısın.");
  const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Kampüs görseli bağlantısı geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const image = await DB.prepare(
      `SELECT p.image_object_key, p.image_original_file_name, p.image_content_type, p.image_byte_size
       FROM campus_pulse_posts p
       WHERE p.id = ? AND p.university_id = ?
         AND p.status = 'active' AND p.deleted_at IS NULL
         AND p.image_object_key IS NOT NULL
         AND (p.kind = 'confession' OR p.expires_at IS NULL OR datetime(p.expires_at) > CURRENT_TIMESTAMP)
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email)
              OR (b.blocker_email = p.author_email AND b.blocked_email = ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = p.author_email
         )
       LIMIT 1`,
    ).bind(id, profile.university_id, identity.email, identity.email, identity.email).first<{
      image_object_key: string;
      image_original_file_name: string;
      image_content_type: string;
      image_byte_size: number;
    }>();
    if (!image) return Response.json({ error: "Kampüs görseli bulunamadı veya erişim iznin yok." }, { status: 404 });

    const object = await FILES.get(image.image_object_key);
    if (!object) return Response.json({ error: "Kampüs görseli henüz hazır değil." }, { status: 409 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", image.image_content_type);
    headers.set("content-length", String(object.size || image.image_byte_size));
    headers.set("content-disposition", `inline; filename="${safeInlineName(image.image_original_file_name)}"`);
    headers.set("cache-control", "private, max-age=600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return unavailableResponse(error, "Kampüs görseline şu anda ulaşılamıyor.");
  }
}
