import {
  cleanText,
  enforceRateLimit,
  getRuntime,
  rateLimitResponse,
  requireIdentity,
  requireProfile,
  signInResponse,
  unavailableResponse,
} from "../../../../lib/server-api";
import { MarketIdempotencyError, parseMarketIdempotencyKey } from "../../../../lib/market-idempotency";
import { hashMarketMedia, marketMediaResponse, reconcileMarketMedia, replayMarketMedia, storeMarketMedia } from "../../../../lib/market-media-idempotency";
import { fileContentDisposition } from "../../../../lib/file-response";

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
    headers.set("content-disposition", fileContentDisposition("inline", image.original_file_name, "urun-fotografi"));
    headers.set("cache-control", "private, no-store");
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

  const prepared: { file: File; bytes: Uint8Array<ArrayBuffer>; extension: string }[] = [];
  for (const file of files) {
    const allowed = allowedImages[file.type];
    const extension = file.name.split(".").at(-1)?.toLocaleLowerCase("tr-TR") ?? "";
    if (!allowed || !allowed.extensions.includes(extension)) return Response.json({ error: "Yalnızca PNG, JPG veya WEBP ürün görselleri yükleyebilirsin." }, { status: 415 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!allowed.magic(bytes)) return Response.json({ error: "Görsel içeriği bildirilen dosya türüyle eşleşmiyor." }, { status: 415 });
    prepared.push({ file, bytes, extension: allowed.storedExtension });
  }

  try {
    const suppliedKey = parseMarketIdempotencyKey(request.headers.get("Idempotency-Key"));
    // Older clients still work, but each headerless call is a distinct operation.
    const key = suppliedKey ?? `legacy:${crypto.randomUUID()}`;
    const { DB, FILES } = await getRuntime();
    if (!FILES) throw new Error("R2 binding FILES is unavailable");
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const context = {
      ownerEmail: identity.email, ownerPublicId: profile.public_id, universityId: profile.university_id, listingId, key,
      payloadHash: await hashMarketMedia(profile.university_id, listingId, prepared),
    };
    // Reconciliation is owner/campus scoped and actually runs on successful retries.
    // Its failure does not turn a completed upload into a failed client operation.
    try { await reconcileMarketMedia(DB, FILES, identity.email, profile.university_id); } catch { /* Try on the next owner operation. */ }
    const replay = await replayMarketMedia(DB, context);
    if (replay) return marketMediaResponse(replay, true);
    const count = await DB.prepare("SELECT COUNT(*) AS count FROM marketplace_listing_images WHERE listing_id = ?")
      .bind(listingId).first<{ count: number }>();
    if (Number(count?.count ?? 0) + prepared.length > MAX_IMAGES) {
      return Response.json({ error: "Bir ilanda toplam en fazla 6 ürün görseli bulunabilir." }, { status: 409 });
    }
    const limit = await enforceRateLimit(DB, identity.email, "market-image-upload", 12, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    return await storeMarketMedia(DB, FILES, context, prepared);
  } catch (error) {
    if (error instanceof MarketIdempotencyError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    return unavailableResponse(error, "Ürün görselleri şu anda yüklenemedi. Aynı fotoğraf işlemini tekrar deneyebilirsin.");
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
    const profile = await requireProfile(DB, identity.email);
    if (!profile) return Response.json({ error: "Önce akademik profilini tamamlamalısın." }, { status: 409 });
    const previous = await DB.prepare(`SELECT image_id FROM market_media_tombstones
      WHERE image_id = ? AND owner_email = ? AND university_id = ?`)
      .bind(id, identity.email, profile.university_id).first<{ image_id: string }>();
    if (!previous) {
      const image = await DB.prepare(`SELECT image.id FROM marketplace_listing_images image
        JOIN marketplace_listings listing ON listing.id = image.listing_id
        WHERE image.id = ? AND listing.owner_email = ? AND listing.university_id = ? LIMIT 1`)
        .bind(id, identity.email, profile.university_id).first<{ id: string }>();
      if (!image) return Response.json({ error: "Görsel bulunamadı veya bu işlem için yetkin yok." }, { status: 404 });
      try {
        // Tombstone, removal and audit share a transaction. There is no R2 deletion
        // until the committed tombstone is visible and addressable metadata is gone.
        await DB.batch([
          DB.prepare(`INSERT OR IGNORE INTO market_media_tombstones
            (image_id, owner_email, university_id, listing_id, object_key)
            SELECT image.id, listing.owner_email, listing.university_id, listing.id, image.object_key
            FROM marketplace_listing_images image JOIN marketplace_listings listing ON listing.id = image.listing_id
            WHERE image.id = ? AND listing.owner_email = ? AND listing.university_id = ?`)
            .bind(id, identity.email, profile.university_id),
          DB.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
            SELECT ?, ?, 'market-listing.image-removed', 'listing', image.listing_id, ?
            FROM marketplace_listing_images image WHERE image.id = ?
              AND EXISTS (SELECT 1 FROM market_media_tombstones WHERE image_id = image.id AND owner_email = ? AND university_id = ?)`)
            .bind(crypto.randomUUID(), identity.email, JSON.stringify({ imageId: id }), id, identity.email, profile.university_id),
          DB.prepare(`DELETE FROM marketplace_listing_images WHERE id = ?
            AND EXISTS (SELECT 1 FROM market_media_tombstones WHERE image_id = ? AND owner_email = ? AND university_id = ?)`)
            .bind(id, id, identity.email, profile.university_id),
        ]);
      } catch (error) {
        const committed = await DB.prepare(`SELECT image_id FROM market_media_tombstones WHERE image_id = ? AND owner_email = ? AND university_id = ?
          AND NOT EXISTS (SELECT 1 FROM marketplace_listing_images WHERE id = ?)`)
          .bind(id, identity.email, profile.university_id, id).first<{ image_id: string }>();
        if (!committed) throw error;
      }
    }
    try { await reconcileMarketMedia(DB, FILES, identity.email, profile.university_id); } catch { /* The durable tombstone will be retried. */ }
    return Response.json({ deleted: true, id }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return unavailableResponse(error, "Ürün görseli şu anda kaldırılamadı.");
  }
}
