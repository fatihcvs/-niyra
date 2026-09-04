import { sameOriginRequest } from "../../../../lib/app-auth";
import { profileMediaUrl } from "../../../../lib/profile";
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
} from "../../../../lib/server-api";

type MediaKind = "avatar" | "banner";

const allowedImages: Record<string, { extensions: string[]; storedExtension: string; magic: (bytes: Uint8Array) => boolean }> = {
  "image/png": {
    extensions: ["png"],
    storedExtension: "png",
    magic: (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
  },
  "image/jpeg": {
    extensions: ["jpg", "jpeg"],
    storedExtension: "jpg",
    magic: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/webp": {
    extensions: ["webp"],
    storedExtension: "webp",
    magic: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
};

function cleanKind(value: unknown): MediaKind | null {
  return value === "avatar" || value === "banner" ? value : null;
}

function safeInlineName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 140) || "profil-gorseli";
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Profil görselini açmak için giriş yapmalısın.");
  const requestUrl = new URL(request.url);
  const publicId = cleanText(requestUrl.searchParams.get("user"), 80);
  const kind = cleanKind(requestUrl.searchParams.get("kind"));
  if (!publicId || !kind) return Response.json({ error: "Profil görseli bağlantısı geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const media = await DB.prepare(
      `SELECT pm.object_key, pm.original_file_name, pm.content_type, pm.byte_size
       FROM profile_media pm
       JOIN users target ON target.email = pm.user_email
       JOIN student_profiles target_profile ON target_profile.user_email = target.email
       JOIN student_profiles viewer_profile ON viewer_profile.user_email = ?
       WHERE target.public_id = ? AND pm.kind = ?
         AND target_profile.onboarding_completed = 1
         AND (target_profile.university_id = viewer_profile.university_id OR (pm.kind = 'avatar' AND EXISTS (SELECT 1 FROM posts public_post WHERE public_post.author_email = target.email AND public_post.audience = 'platform' AND public_post.community_id IS NULL AND public_post.course_id IS NULL AND public_post.deleted_at IS NULL)))
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = target.email)
              OR (b.blocker_email = target.email AND b.blocked_email = ?)
         )
       LIMIT 1`,
    ).bind(identity.email, publicId, kind, identity.email, identity.email).first<{
      object_key: string;
      original_file_name: string;
      content_type: string;
      byte_size: number;
    }>();
    if (!media) return Response.json({ error: "Profil görseli bulunamadı veya erişim iznin yok." }, { status: 404 });

    const object = await FILES.get(media.object_key);
    if (!object) return Response.json({ error: "Profil görseli henüz hazır değil." }, { status: 409 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", media.content_type);
    headers.set("content-length", String(object.size || media.byte_size));
    headers.set("content-disposition", `inline; filename="${safeInlineName(media.original_file_name)}"`);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return unavailableResponse(error, "Profil görseline şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan görsel isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Profil görseli eklemek için giriş yapmalısın.");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Geçerli bir profil görseli gönderilmedi." }, { status: 400 });
  }
  const kind = cleanKind(formData.get("kind"));
  const image = formData.get("image");
  if (!kind || !(image instanceof File) || image.size === 0) return Response.json({ error: "Profil görseli seçmelisin." }, { status: 400 });
  const maxBytes = kind === "avatar" ? 4 * 1024 * 1024 : 8 * 1024 * 1024;
  if (image.size > maxBytes) return Response.json({ error: kind === "avatar" ? "Profil fotoğrafı en fazla 4 MB olabilir." : "Kapak görseli en fazla 8 MB olabilir." }, { status: 413 });
  const allowed = allowedImages[image.type];
  const extension = image.name.split(".").at(-1)?.toLocaleLowerCase("tr-TR") ?? "";
  if (!allowed || !allowed.extensions.includes(extension)) return Response.json({ error: "Yalnızca PNG, JPG veya WEBP profil görselleri yükleyebilirsin." }, { status: 415 });
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!allowed.magic(bytes)) return Response.json({ error: "Görsel içeriği bildirilen dosya türüyle eşleşmiyor." }, { status: 415 });

  let uploadedKey = "";
  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "profile.media.upload", 12, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const existing = await DB.prepare("SELECT object_key FROM profile_media WHERE user_email = ? AND kind = ? LIMIT 1").bind(identity.email, kind).first<{ object_key: string }>();
    const safeOwner = identity.email.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "student";
    uploadedKey = `profiles/${safeOwner}/${kind}-${crypto.randomUUID()}.${allowed.storedExtension}`;
    await FILES.put(uploadedKey, bytes, {
      httpMetadata: { contentType: image.type },
      customMetadata: { owner: identity.email, kind },
    });
    await DB.prepare(
      `INSERT INTO profile_media (user_email, kind, object_key, original_file_name, content_type, byte_size, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, STRFTIME('%Y-%m-%d %H:%M:%f', 'now'))
       ON CONFLICT(user_email, kind) DO UPDATE SET
         object_key = excluded.object_key,
         original_file_name = excluded.original_file_name,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         updated_at = excluded.updated_at`,
    ).bind(identity.email, kind, uploadedKey, image.name.slice(0, 180), image.type, image.size).run();
    if (existing?.object_key && existing.object_key !== uploadedKey) {
      try { await FILES.delete(existing.object_key); } catch { /* The new media is already active; stale-object cleanup can retry later. */ }
    }
    const stored = await DB.prepare("SELECT updated_at FROM profile_media WHERE user_email = ? AND kind = ? LIMIT 1").bind(identity.email, kind).first<{ updated_at: string }>();
    await audit(DB, identity.email, "profile.media_updated", "profile", profile.public_id, { kind, byteSize: image.size });
    return Response.json({ media: { kind, url: profileMediaUrl(profile.public_id, kind, stored?.updated_at ?? new Date().toISOString()) } }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        const { FILES } = await getRuntime();
        if (FILES) await FILES.delete(uploadedKey);
      } catch { /* Preserve the original error response. */ }
    }
    return unavailableResponse(error, "Profil görseli şu anda kaydedilemedi.");
  }
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "Güvenli olmayan görsel isteği reddedildi." }, { status: 403 });
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Profil görselini kaldırmak için giriş yapmalısın.");
  let kind: MediaKind | null = null;
  try {
    const payload = (await request.json()) as { kind?: unknown };
    kind = cleanKind(payload.kind);
  } catch {
    return Response.json({ error: "Geçerli bir görsel türü gönderilmedi." }, { status: 400 });
  }
  if (!kind) return Response.json({ error: "Profil görseli türü geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const media = await DB.prepare("SELECT object_key FROM profile_media WHERE user_email = ? AND kind = ? LIMIT 1").bind(identity.email, kind).first<{ object_key: string }>();
    await DB.prepare("DELETE FROM profile_media WHERE user_email = ? AND kind = ?").bind(identity.email, kind).run();
    if (media?.object_key && FILES) await FILES.delete(media.object_key);
    await audit(DB, identity.email, "profile.media_removed", "profile", profile.public_id, { kind });
    return Response.json({ removed: Boolean(media), kind });
  } catch (error) {
    return unavailableResponse(error, "Profil görseli şu anda kaldırılamadı.");
  }
}
