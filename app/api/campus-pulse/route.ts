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
import { MediaUploadError, putOwnedMedia } from "../../../lib/media-upload-operations";
import { activeActor, ActiveActorError } from "../../../lib/active-actor";

const kinds = new Set(["live", "confession"]);
const categories = new Set(["general", "transport", "food", "event", "lost-found", "study", "safety", "social"]);
const liveDurations = new Set([1, 3, 6, 12, 24]);
const reactionLabels = new Set(["support", "confirm", "outdated"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
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

type PulseRow = {
  id: string;
  kind: string;
  category: string;
  content: string;
  campus_zone: string;
  image_object_key: string | null;
  is_anonymous: number;
  author_email: string;
  expires_at: string | null;
  created_at: string;
  display_name: string;
  public_id: string;
  support_count: number;
  confirm_count: number;
  outdated_count: number;
  viewer_reaction: string | null;
};

function serialize(row: PulseRow, viewerEmail: string) {
  const anonymous = Boolean(row.is_anonymous);
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    content: row.content,
    campusZone: row.campus_zone,
    imageUrl: row.image_object_key ? `/api/campus-pulse/image?id=${encodeURIComponent(row.id)}` : null,
    anonymous,
    authorName: anonymous ? "Anonim öğrenci" : row.display_name,
    authorId: anonymous ? null : row.public_id,
    own: row.author_email === viewerEmail,
    expiresAt: row.expires_at,
    time: relativeTime(row.created_at),
    supportCount: Number(row.support_count),
    confirmCount: Number(row.confirm_count),
    outdatedCount: Number(row.outdated_count),
    viewerReaction: row.viewer_reaction,
  };
}

function trendingTopics(rows: PulseRow[]) {
  const scores = new Map<string, number>();
  for (const row of rows) {
    scores.set(row.category, (scores.get(row.category) ?? 0) + 1);
    for (const match of row.content.matchAll(/#([\p{L}\p{N}_-]{2,30})/gu)) {
      const tag = `#${match[1].toLocaleLowerCase("tr-TR")}`;
      scores.set(tag, (scores.get(tag) ?? 0) + 2);
    }
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "tr-TR"))
    .slice(0, 6)
    .map(([topic, score]) => ({ topic, score }));
}

async function readCounts(db: D1Database, postId: string) {
  const counts = await db.prepare(
    `SELECT
       SUM(CASE WHEN reaction = 'support' THEN 1 ELSE 0 END) AS support_count,
       SUM(CASE WHEN reaction = 'confirm' THEN 1 ELSE 0 END) AS confirm_count,
       SUM(CASE WHEN reaction = 'outdated' THEN 1 ELSE 0 END) AS outdated_count
     FROM campus_pulse_reactions WHERE post_id = ?`,
  ).bind(postId).first<{ support_count: number | null; confirm_count: number | null; outdated_count: number | null }>();
  return {
    supportCount: Number(counts?.support_count ?? 0),
    confirmCount: Number(counts?.confirm_count ?? 0),
    outdatedCount: Number(counts?.outdated_count ?? 0),
  };
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüs Anlık akışını görmek için giriş yapmalısın.");
  const requestedKind = new URL(request.url).searchParams.get("kind")?.trim() ?? "all";
  if (requestedKind !== "all" && !kinds.has(requestedKind)) {
    return Response.json({ error: "Akış türü geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const rows = await DB.prepare(
      `SELECT p.id, p.kind, p.category, p.content, p.campus_zone, p.image_object_key, p.is_anonymous,
              p.author_email, p.expires_at, p.created_at, u.display_name, u.public_id,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'support') AS support_count,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'confirm') AS confirm_count,
              (SELECT COUNT(*) FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.reaction = 'outdated') AS outdated_count,
              (SELECT reaction FROM campus_pulse_reactions r WHERE r.post_id = p.id AND r.user_email = ? LIMIT 1) AS viewer_reaction
       FROM campus_pulse_posts p
       JOIN users u ON u.email = p.author_email
       WHERE p.university_id = ?
         AND p.status = 'active'
         AND p.deleted_at IS NULL
         AND (? = 'all' OR p.kind = ?)
         AND (p.kind = 'confession' OR p.expires_at IS NULL OR datetime(p.expires_at) > CURRENT_TIMESTAMP)
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_email = ? AND b.blocked_email = p.author_email)
              OR (b.blocker_email = p.author_email AND b.blocked_email = ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_mutes m WHERE m.muter_email = ? AND m.muted_email = p.author_email
         )
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 80`,
    ).bind(identity.email, profile.university_id, requestedKind, requestedKind, identity.email, identity.email, identity.email).all<PulseRow>();
    const items = rows.results.map((row) => serialize(row, identity.email));
    return Response.json({ items, topics: trendingTopics(rows.results.filter((row) => row.kind === "live")) });
  } catch (error) {
    return unavailableResponse(error, "Kampüs Anlık akışına şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Kampüste paylaşım yapmak için giriş yapmalısın.");
  let payload: Record<string, unknown>;
  let image: File | null = null;
  try {
    if (request.headers.get("content-type")?.toLocaleLowerCase("en-US").startsWith("multipart/form-data")) {
      const form = await request.formData();
      payload = {
        kind: form.get("kind"),
        category: form.get("category"),
        content: form.get("content"),
        campusZone: form.get("campusZone"),
        durationHours: form.get("durationHours"),
      };
      const imageEntry = form.get("image");
      if (imageEntry instanceof File && imageEntry.size > 0) image = imageEntry;
      else if (imageEntry !== null && imageEntry !== "") return Response.json({ error: "Paylaşım görseli geçerli değil." }, { status: 400 });
    } else {
      payload = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return Response.json({ error: "Paylaşım bilgisi geçerli değil." }, { status: 400 });
  }

  const kind = cleanText(payload.kind, 20);
  const category = cleanText(payload.category, 24) || "general";
  const content = cleanText(payload.content, 800);
  const campusZone = cleanText(payload.campusZone, 80);
  if (!kinds.has(kind)) return Response.json({ error: "Paylaşım türü geçerli değil." }, { status: 400 });
  if (!categories.has(category)) return Response.json({ error: "Kampüs kategorisi geçerli değil." }, { status: 400 });
  if (content.length < 12) return Response.json({ error: "Paylaşım en az 12 karakter olmalı." }, { status: 400 });
  if (image && kind !== "live") return Response.json({ error: "Görsel yalnızca Kampüs Anlık paylaşımlarına eklenebilir." }, { status: 400 });
  const durationHours = Number(payload.durationHours ?? 6);
  if (kind === "live" && !liveDurations.has(durationHours)) {
    return Response.json({ error: "Anlık paylaşım süresi geçerli değil." }, { status: 400 });
  }

  let preparedImage: { bytes: Uint8Array; extension: string } | null = null;
  if (image) {
    if (!image.size || image.size > MAX_IMAGE_SIZE) return Response.json({ error: "Paylaşım görseli en fazla 5 MB olabilir." }, { status: 413 });
    if (image.name.length > 140 || /[\\/\0]/.test(image.name)) return Response.json({ error: "Görsel dosya adı geçerli değil." }, { status: 400 });
    const allowed = allowedImages[image.type];
    const extension = image.name.split(".").at(-1)?.toLocaleLowerCase("tr-TR") ?? "";
    if (!allowed || !allowed.extensions.includes(extension)) return Response.json({ error: "Yalnızca PNG, JPG veya WEBP paylaşım görselleri yükleyebilirsin." }, { status: 415 });
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!allowed.magic(bytes)) return Response.json({ error: "Görsel içeriği bildirilen dosya türüyle eşleşmiyor." }, { status: 415 });
    preparedImage = { bytes, extension: allowed.storedExtension };
  }

  let uploadedObject: { bucket: R2Bucket; key: string } | null = null;
  let postCreated = false;
  try {
    const { DB, FILES } = await getRuntime();
    if (preparedImage && !FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, `campus-pulse-${kind}`, kind === "confession" ? 4 : 12, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const id = crypto.randomUUID();
    const anonymous = kind === "confession";
    const expiresAt = kind === "live" ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
    const safeOwner = identity.email.toLocaleLowerCase("en-US").replace(/[^a-z0-9@._-]/g, "_");
    const objectKey = preparedImage ? `pulse/${profile.university_id}/${safeOwner}/${id}.${preparedImage.extension}` : null;
    if (preparedImage && image && FILES && objectKey) {
      await putOwnedMedia(DB, FILES, { ownerEmail: identity.email, ownerPublicId: profile.public_id, objectKey, kind: "pulse" }, preparedImage.bytes, {
        httpMetadata: { contentType: image.type },
        customMetadata: { postId: id, universityId: profile.university_id, owner: identity.email },
      });
      uploadedObject = { bucket: FILES, key: objectKey };
    }
    const published = await DB.prepare(
      `INSERT INTO campus_pulse_posts
       (id, author_email, university_id, kind, category, content, campus_zone, image_object_key,
        image_original_file_name, image_content_type, image_byte_size, is_anonymous, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM users WHERE email = ? AND public_id = ? AND status = 'active') RETURNING id`,
    ).bind(
      id,
      identity.email,
      profile.university_id,
      kind,
      category,
      content,
      campusZone,
      objectKey,
      image?.name ?? null,
      image?.type ?? null,
      image?.size ?? null,
      anonymous ? 1 : 0,
      expiresAt,
      identity.email,
      profile.public_id,
    ).first<{ id: string }>();
    if (!published) throw new MediaUploadError();
    postCreated = true;
    await activeActor(DB, identity.email, profile.public_id).audit("campus-pulse.created", "pulse", id, { kind, category, anonymous, hasImage: Boolean(objectKey) });
    return Response.json({ item: { id, kind, category, content, campusZone, anonymous, expiresAt, imageUrl: objectKey ? `/api/campus-pulse/image?id=${encodeURIComponent(id)}` : null } }, { status: 201 });
  } catch (error) {
    if (uploadedObject && !postCreated) {
      try {
        const { DB } = await getRuntime();
        const referenced = await DB.prepare("SELECT id FROM campus_pulse_posts WHERE image_object_key = ? LIMIT 1")
          .bind(uploadedObject.key).first<{ id: string }>();
        if (!referenced) await uploadedObject.bucket.delete(uploadedObject.key);
      }
      catch { /* The inaccessible orphan can be cleaned by storage maintenance. */ }
    }
    if (error instanceof ActiveActorError) return Response.json({ error: error.message, code: "ACCOUNT_CHANGED" }, { status: 409 });
    if (error instanceof MediaUploadError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return unavailableResponse(error, "Kampüs paylaşımı şu anda yayınlanamadı.");
  }
}

export async function PATCH(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Tepki bilgisi geçerli değil." }, { status: 400 }); }
  const action = cleanText(payload.action, 20);
  const id = cleanText(payload.id, 80);
  const reaction = cleanText(payload.reaction, 20);
  if (action !== "react" || !id || !reactionLabels.has(reaction)) {
    return Response.json({ error: "Kampüs tepkisi geçerli değil." }, { status: 400 });
  }
  try {
    const { DB } = await getRuntime();
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const post = await DB.prepare(
      `SELECT id, kind FROM campus_pulse_posts
       WHERE id = ? AND university_id = ? AND status = 'active' AND deleted_at IS NULL
         AND (kind = 'confession' OR expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
       LIMIT 1`,
    ).bind(id, profile.university_id).first<{ id: string; kind: string }>();
    if (!post) return Response.json({ error: "Kampüs paylaşımı bulunamadı veya süresi doldu." }, { status: 404 });
    if ((post.kind === "confession" && reaction !== "support") || (post.kind === "live" && reaction === "support")) {
      return Response.json({ error: "Bu tepki paylaşım türüne uygun değil." }, { status: 400 });
    }
    const current = await DB.prepare(
      `SELECT reaction FROM campus_pulse_reactions WHERE post_id = ? AND user_email = ? LIMIT 1`,
    ).bind(id, identity.email).first<{ reaction: string }>();
    if (current?.reaction === reaction) {
      await DB.prepare(`DELETE FROM campus_pulse_reactions WHERE post_id = ? AND user_email = ?`).bind(id, identity.email).run();
    } else {
      await DB.prepare(
        `INSERT INTO campus_pulse_reactions (post_id, user_email, reaction)
         VALUES (?, ?, ?)
         ON CONFLICT(post_id, user_email)
         DO UPDATE SET reaction = excluded.reaction, updated_at = CURRENT_TIMESTAMP`,
      ).bind(id, identity.email, reaction).run();
    }
    return Response.json({ active: current?.reaction !== reaction, reaction, ...(await readCounts(DB, id)) });
  } catch (error) {
    return unavailableResponse(error, "Kampüs tepkisi şu anda kaydedilemedi.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse();
  let payload: Record<string, unknown>;
  try { payload = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ error: "Silme isteği geçerli değil." }, { status: 400 }); }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Kampüs paylaşımı seçilmedi." }, { status: 400 });
  try {
    const { DB, FILES } = await getRuntime();
    const moderator = await DB.prepare(
      `SELECT 1 AS allowed FROM platform_roles WHERE user_email = ? AND role IN ('moderator', 'admin') LIMIT 1`,
    ).bind(identity.email).first();
    const removed = await DB.prepare(
      `UPDATE campus_pulse_posts
       SET status = 'removed', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL AND (author_email = ? OR ? = 1)
       RETURNING id, author_email, image_object_key`,
    ).bind(id, identity.email, moderator ? 1 : 0).first<{ id: string; author_email: string; image_object_key: string | null }>();
    if (!removed) return Response.json({ error: "Silinebilecek paylaşım bulunamadı." }, { status: 404 });
    await audit(DB, identity.email, "campus-pulse.removed", "pulse", id, { moderator: Boolean(moderator) });
    if (removed.image_object_key && FILES) {
      try { await FILES.delete(removed.image_object_key); }
      catch { /* The removed post no longer exposes the object; cleanup can retry later. */ }
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return unavailableResponse(error, "Kampüs paylaşımı şu anda silinemedi.");
  }
}
