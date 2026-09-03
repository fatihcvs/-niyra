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

const MAX_IMAGES = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
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

function safeInlineName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 140) || "urun-fotografi";
}

function imageUrl(id: string) {
  return `/api/campus-market/images?id=${encodeURIComponent(id)}`;
}

export async function GET(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Ürün görselini açmak için giriş yapmalısın.");
  const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
  if (!id) return Response.json({ error: "Ürün görseli bağlantısı geçerli değil." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const image = await DB.prepare(
      `SELECT image.object_key, image.original_file_name, image.content_type, image.byte_size,
              listing.owner_email, listing.status
       FROM marketplace_listing_images image
       JOIN marketplace_listings listing ON listing.id = image.listing_id
       WHERE image.id = ? AND listing.university_id = ?
         AND (listing.status IN ('active', 'reserved') OR listing.owner_email = ?)
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks block
           WHERE (block.blocker_email = ? AND block.blocked_email = listing.owner_email)
              OR (block.blocker_email = listing.owner_email AND block.blocked_email = ?)
         )
       LIMIT 1`,
    ).bind(id, profile.university_id, identity.email, identity.email, identity.email).first<{
      object_key: string; original_file_name: string; content_type: string; byte_size: number; owner_email: string; status: string;
    }>();
    if (!image) return Response.json({ error: "Ürün görseli bulunamadı veya erişim iznin yok." }, { status: 404 });
    const object = await FILES.get(image.object_key);
    if (!object) return Response.json({ error: "Ürün görseli henüz hazır değil." }, { status: 409 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type", image.content_type);
    headers.set("content-length", String(object.size || image.byte_size));
    headers.set("content-disposition", `inline; filename="${safeInlineName(image.original_file_name)}"`);
    headers.set("cache-control", "private, max-age=3600");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return unavailableResponse(error, "Ürün görseline şu anda ulaşılamıyor.");
  }
}

export async function POST(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Ürün görseli yüklemek için giriş yapmalısın.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Görsel yükleme bilgileri okunamadı." }, { status: 400 });
  }
  const listingId = cleanText(form.get("listingId"), 80);
  const images = form.getAll("images");
  if (!listingId) return Response.json({ error: "Görsellerin ekleneceği ilan zorunludur." }, { status: 400 });
  if (!images.length || images.length > MAX_IMAGES || images.some((image) => !(image instanceof File))) {
    return Response.json({ error: "Bir ilanda en fazla 6 ürün görseli yükleyebilirsin." }, { status: 400 });
  }

  const files = images as File[];
  if (files.some((file) => !file.size || file.size > MAX_FILE_SIZE)) return Response.json({ error: "Her ürün görseli en fazla 5 MB olabilir." }, { status: 413 });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) return Response.json({ error: "Görsellerin toplam boyutu 20 MB sınırını aşmamalı." }, { status: 413 });
  if (files.some((file) => file.name.length > 140 || /[\\/\0]/.test(file.name))) return Response.json({ error: "Görsel dosya adı geçerli değil." }, { status: 400 });

  const prepared: { file: File; bytes: Uint8Array; extension: string }[] = [];
  for (const file of files) {
    const allowed = allowedImages[file.type];
    const extension = file.name.split(".").at(-1)?.toLocaleLowerCase("tr-TR") ?? "";
    if (!allowed || !allowed.extensions.includes(extension)) return Response.json({ error: "Yalnızca PNG, JPG veya WEBP ürün görselleri yükleyebilirsin." }, { status: 415 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!allowed.magic(bytes)) return Response.json({ error: "Görsel içeriği bildirilen dosya türüyle eşleşmiyor." }, { status: 415 });
    prepared.push({ file, bytes, extension: allowed.storedExtension });
  }

  const objectKeys: string[] = [];
  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const listing = await DB.prepare(
      `SELECT id FROM marketplace_listings
       WHERE id = ? AND university_id = ? AND owner_email = ? AND status IN ('active', 'reserved') LIMIT 1`,
    ).bind(listingId, profile.university_id, identity.email).first<{ id: string }>();
    if (!listing) return Response.json({ error: "Görsel ekleyebileceğin açık ilan bulunamadı." }, { status: 404 });
    const count = await DB.prepare(`SELECT COUNT(*) AS count FROM marketplace_listing_images WHERE listing_id = ?`).bind(listingId).first<{ count: number }>();
    const existingCount = Number(count?.count ?? 0);
    if (existingCount + prepared.length > MAX_IMAGES) return Response.json({ error: "Bir ilanda toplam en fazla 6 ürün görseli bulunabilir." }, { status: 409 });
    const limit = await enforceRateLimit(DB, identity.email, "market-image-upload", 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    const safeOwner = identity.email.toLocaleLowerCase("en-US").replace(/[^a-z0-9@._-]/g, "_");
    const records = prepared.map((item, index) => {
      const id = crypto.randomUUID();
      const objectKey = `market/${safeOwner}/${listingId}/${id}.${item.extension}`;
      objectKeys.push(objectKey);
      return { ...item, id, objectKey, sortOrder: existingCount + index };
    });
    await Promise.all(records.map((record) => FILES.put(record.objectKey, record.bytes, {
      httpMetadata: { contentType: record.file.type },
      customMetadata: { listingId, imageId: record.id, owner: identity.email },
    })));
    await DB.batch(records.map((record) => DB.prepare(
      `INSERT INTO marketplace_listing_images
       (id, listing_id, uploader_email, object_key, original_file_name, content_type, byte_size, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(record.id, listingId, identity.email, record.objectKey, record.file.name, record.file.type, record.file.size, record.sortOrder)));
    await audit(DB, identity.email, "market-listing.images-added", "listing", listingId, { count: records.length });
    return Response.json({ images: records.map((record) => ({ id: record.id, url: imageUrl(record.id) })) }, { status: 201 });
  } catch (error) {
    if (objectKeys.length) {
      try {
        const { FILES } = await getRuntime();
        if (FILES) await Promise.all(objectKeys.map((objectKey) => FILES.delete(objectKey)));
      } catch {
        // The primary error is returned below; orphaned objects are not addressable and can be cleaned later.
      }
    }
    return unavailableResponse(error, "Ürün görselleri şu anda yüklenemedi.");
  }
}

export async function DELETE(request: Request) {
  const identity = await requireIdentity();
  if (!identity) return signInResponse("Ürün görselini kaldırmak için giriş yapmalısın.");
  let payload: { id?: unknown };
  try {
    payload = (await request.json()) as { id?: unknown };
  } catch {
    return Response.json({ error: "Kaldırılacak görsel bilgisi geçerli değil." }, { status: 400 });
  }
  const id = cleanText(payload.id, 80);
  if (!id) return Response.json({ error: "Kaldırılacak görsel zorunludur." }, { status: 400 });

  try {
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const image = await DB.prepare(
      `SELECT image.object_key, image.listing_id
       FROM marketplace_listing_images image
       JOIN marketplace_listings listing ON listing.id = image.listing_id
       WHERE image.id = ? AND listing.owner_email = ? LIMIT 1`,
    ).bind(id, identity.email).first<{ object_key: string; listing_id: string }>();
    if (!image) return Response.json({ error: "Görsel bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });
    await FILES.delete(image.object_key);
    await DB.prepare(`DELETE FROM marketplace_listing_images WHERE id = ?`).bind(id).run();
    await audit(DB, identity.email, "market-listing.image-removed", "listing", image.listing_id, { imageId: id });
    return Response.json({ deleted: true, id });
  } catch (error) {
    return unavailableResponse(error, "Ürün görseli şu anda kaldırılamadı.");
  }
}
