import { parseMediaRange } from "../../../../lib/post-media";
import { getRuntime, requireIdentity, signInResponse, unavailableResponse } from "../../../../lib/server-api";

async function readMedia(request: Request, headOnly = false) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Gönderi görselini veya videosunu açmak için giriş yapmalısın.");
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || id.length > 80) return Response.json({ error: "Medya bağlantısı geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const media = await DB.prepare(
      `SELECT pm.object_key, pm.original_file_name, pm.content_type, pm.byte_size
       FROM post_media pm
       JOIN posts p ON p.id = pm.post_id
       JOIN student_profiles author ON author.user_email = p.author_email
       JOIN student_profiles viewer ON viewer.user_email = ? AND viewer.onboarding_completed = 1
       WHERE pm.id = ? AND p.deleted_at IS NULL
         AND author.university_id = viewer.university_id
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email)
              OR (b.blocker_email = p.author_email AND b.blocked_email = ?)
         )
         AND (p.community_id IS NULL OR EXISTS (
           SELECT 1 FROM communities c WHERE c.id = p.community_id AND c.status = 'active'
             AND c.moderation_status = 'active'
             AND (c.university_id IS NULL OR c.university_id = viewer.university_id)
             AND NOT EXISTS (SELECT 1 FROM community_bans cb WHERE cb.community_id = c.id AND cb.user_email = ?)
             AND (c.join_policy = 'open' OR EXISTS (
               SELECT 1 FROM community_members cm
               WHERE cm.community_id = c.id AND cm.user_email = ? AND cm.status = 'active'
             ))
         )) LIMIT 1`,
    ).bind(identity.email, id, identity.email, identity.email, identity.email, identity.email)
      .first<{ object_key: string; original_file_name: string; content_type: string; byte_size: number }>();
    if (!media) return Response.json({ error: "Gönderi medyası bulunamadı veya erişim iznin yok." }, { status: 404 });

    const range = parseMediaRange(request.headers.get("range"), media.byte_size);
    const headers = new Headers({
      "content-type": media.content_type,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.original_file_name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "accept-ranges": "bytes",
    });
    if (range === "invalid") {
      headers.set("content-range", `bytes */${media.byte_size}`);
      return new Response(null, { status: 416, headers });
    }
    const object = await FILES.get(media.object_key, range ? { range } : undefined);
    if (!object) return Response.json({ error: "Gönderi medyası henüz hazır değil." }, { status: 409 });
    headers.set("content-length", String(range?.length ?? media.byte_size));
    if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${media.byte_size}`);
    if (headOnly) await object.body.cancel();
    return new Response(headOnly ? null : object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return unavailableResponse(error, "Gönderi medyasına şu anda ulaşılamıyor.");
  }
}

export async function GET(request: Request) {
  return readMedia(request);
}

export async function HEAD(request: Request) {
  return readMedia(request, true);
}
