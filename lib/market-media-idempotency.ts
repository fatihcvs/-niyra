import { MarketIdempotencyError } from "./market-idempotency";
import { putOwnedMedia } from "./media-upload-operations";

export type MarketMediaContext = {
  ownerEmail: string;
  ownerPublicId: string;
  universityId: string;
  listingId: string;
  key: string;
  payloadHash: string;
};

export type MarketMediaFile = { file: File; bytes: Uint8Array<ArrayBuffer>; extension: string };
type Receipt = {
  university_id: string;
  listing_id: string;
  payload_hash: string;
  current_attempt_id: string | null;
  committed_attempt_id: string | null;
  response_json: string | null;
  ended_at: string | null;
};
type MediaResponse = { images: { id: string; url: string }[] };

function ended(): never {
  throw new MarketIdempotencyError("Bu fotoğraf işleminin ilanı veya fotoğrafları kaldırıldı. Yeniden oluşturulmadı.", 410, "MARKET_MEDIA_REMOVED");
}

function hidden(): never {
  throw new MarketIdempotencyError("Görsel ekleyebileceğin ilan bulunamadı.", 404, "MARKET_TARGET_UNAVAILABLE");
}

export async function hashMarketMedia(universityId: string, listingId: string, files: MarketMediaFile[]) {
  const ordered = await Promise.all(files.map(async ({ file, bytes }) => {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [file.name, file.type, file.size, Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")];
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([1, universityId, listingId, ordered])));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readReceipt(db: D1Database, context: MarketMediaContext) {
  return db.prepare(`SELECT university_id, listing_id, payload_hash, current_attempt_id, committed_attempt_id, response_json, ended_at
    FROM market_media_requests WHERE owner_email = ? AND idempotency_key = ?`)
    .bind(context.ownerEmail, context.key).first<Receipt>();
}

async function endReceipt(db: D1Database, context: MarketMediaContext) {
  await db.prepare(`INSERT OR IGNORE INTO market_media_requests
    (owner_email, idempotency_key, university_id, listing_id, payload_hash, ended_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(context.ownerEmail, context.key, context.universityId, context.listingId, context.payloadHash).run();
  await db.prepare(`UPDATE market_media_requests SET ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP), current_attempt_id = NULL
    WHERE owner_email = ? AND idempotency_key = ?`).bind(context.ownerEmail, context.key).run();
  ended();
}

async function assertTarget(db: D1Database, context: MarketMediaContext, known: boolean) {
  const listing = await db.prepare("SELECT owner_email, university_id, status FROM marketplace_listings WHERE id = ?")
    .bind(context.listingId).first<{ owner_email: string; university_id: string; status: string }>();
  if (!listing) { if (known) await endReceipt(db, context); hidden(); }
  if (listing.owner_email !== context.ownerEmail || listing.university_id !== context.universityId) hidden();
  if (!["active", "reserved"].includes(listing.status)) await endReceipt(db, context);
}

export async function replayMarketMedia(db: D1Database, context: MarketMediaContext): Promise<MediaResponse | null> {
  const receipt = await readReceipt(db, context);
  if (receipt?.university_id !== undefined && receipt.university_id !== context.universityId) hidden();
  if (receipt && (receipt.listing_id !== context.listingId || receipt.payload_hash !== context.payloadHash)) {
    throw new MarketIdempotencyError("Bu fotoğraf anahtarı farklı dosyalar için kullanıldı.", 409, "IDEMPOTENCY_CONFLICT");
  }
  if (receipt?.ended_at) ended();
  await assertTarget(db, context, Boolean(receipt));
  if (!receipt?.response_json) return null;
  const body = JSON.parse(receipt.response_json) as MediaResponse;
  for (const image of body.images) {
    const visible = await db.prepare(`SELECT id FROM marketplace_listing_images WHERE id = ? AND listing_id = ?
      AND NOT EXISTS (SELECT 1 FROM market_media_tombstones WHERE image_id = ?)`)
      .bind(image.id, context.listingId, image.id).first<{ id: string }>();
    if (!visible) await endReceipt(db, context);
  }
  return body;
}

export function marketMediaResponse(body: MediaResponse, replayed: boolean) {
  return Response.json({ ...body, idempotentReplay: replayed }, {
    status: 201,
    headers: { "Cache-Control": "private, no-store", "Idempotency-Replayed": String(replayed) },
  });
}

/** Only a permanently fenced attempt with every PUT settled is safe to delete.
 * A crashed/unknown PUT is deliberately quarantined: elapsed time is not proof that it cannot finish.
 * Object keys are unique per attempt and can never be reused by a later winner.
 */
export async function reconcileMarketMedia(db: D1Database, files: R2Bucket, ownerEmail: string, universityId: string) {
  const abandoned = await db.prepare(`SELECT object.image_id, object.object_key FROM market_media_attempt_objects object
    JOIN market_media_attempts attempt ON attempt.id = object.attempt_id
    JOIN market_media_requests receipt ON receipt.owner_email = attempt.owner_email AND receipt.idempotency_key = attempt.idempotency_key
    WHERE receipt.owner_email = ? AND receipt.university_id = ? AND attempt.puts_settled = 1
      AND NOT EXISTS (SELECT 1 FROM media_upload_operations op WHERE op.object_key = object.object_key AND op.state IN ('putting', 'unknown'))
      AND object.cleaned_at IS NULL AND (
        (receipt.current_attempt_id IS NOT attempt.id AND receipt.committed_attempt_id IS NOT attempt.id)
        OR (receipt.committed_attempt_id = attempt.id AND receipt.response_json IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM marketplace_listing_images image WHERE image.object_key = object.object_key))
      )
    LIMIT 48`).bind(ownerEmail, universityId).all<{ image_id: string; object_key: string }>();
  for (const object of abandoned.results) {
    try {
      await files.delete(object.object_key);
      await db.prepare("UPDATE market_media_attempt_objects SET cleaned_at = CURRENT_TIMESTAMP WHERE image_id = ?")
        .bind(object.image_id).run();
    } catch { /* Keep the durable cleanup entry for the next owner operation. */ }
  }
  const removed = await db.prepare(`SELECT image_id, object_key FROM market_media_tombstones tombstone
    WHERE owner_email = ? AND university_id = ? AND cleaned_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM media_upload_operations op WHERE op.object_key = tombstone.object_key AND op.state IN ('putting', 'unknown'))
      AND NOT EXISTS (SELECT 1 FROM marketplace_listing_images image WHERE image.object_key = tombstone.object_key)
    LIMIT 48`).bind(ownerEmail, universityId).all<{ image_id: string; object_key: string }>();
  for (const object of removed.results) {
    try {
      await files.delete(object.object_key);
      await db.prepare("UPDATE market_media_tombstones SET cleaned_at = CURRENT_TIMESTAMP WHERE image_id = ?")
        .bind(object.image_id).run();
    } catch { /* Successful logical deletion must not depend on R2 availability. */ }
  }
}

export async function storeMarketMedia(db: D1Database, files: R2Bucket, context: MarketMediaContext, prepared: MarketMediaFile[]) {
  const replay = await replayMarketMedia(db, context);
  if (replay) return marketMediaResponse(replay, true);
  await db.prepare(`INSERT OR IGNORE INTO market_media_requests
    (owner_email, idempotency_key, university_id, listing_id, payload_hash) VALUES (?, ?, ?, ?, ?)`)
    .bind(context.ownerEmail, context.key, context.universityId, context.listingId, context.payloadHash).run();
  // Concurrent first requests cannot change the winning immutable payload.
  const afterInsert = await replayMarketMedia(db, context);
  if (afterInsert) return marketMediaResponse(afterInsert, true);
  const attemptId = crypto.randomUUID();
  const records = prepared.map((item, ordinal) => {
    const id = crypto.randomUUID();
    return { ...item, id, ordinal, objectKey: `market/attempts/${attemptId}/${id}.${item.extension}` };
  });
  const body: MediaResponse = { images: records.map(({ id }) => ({ id, url: `/api/campus-market/images?id=${encodeURIComponent(id)}` })) };
  let registered = false;
  let putsSettled = false;
  try {
    // This batch is durable before any PUT. Replacing the current token permanently
    // fences all older attempts, including a D1 commit whose response was lost.
    await db.batch([
      db.prepare("INSERT INTO market_media_attempts (id, owner_email, idempotency_key) VALUES (?, ?, ?)")
        .bind(attemptId, context.ownerEmail, context.key),
      ...records.map((record) => db.prepare(`INSERT INTO market_media_attempt_objects
        (image_id, attempt_id, ordinal, object_key) VALUES (?, ?, ?, ?)`).bind(record.id, attemptId, record.ordinal, record.objectKey)),
      db.prepare(`UPDATE market_media_requests SET current_attempt_id = ? WHERE owner_email = ? AND idempotency_key = ? AND response_json IS NULL AND ended_at IS NULL`)
        .bind(attemptId, context.ownerEmail, context.key),
    ]);
    registered = true;
    const current = await readReceipt(db, context);
    if (current?.current_attempt_id !== attemptId || current.response_json) {
      putsSettled = true; // No PUT was started in this attempt.
      const winner = await replayMarketMedia(db, context);
      if (winner) return marketMediaResponse(winner, true);
      throw new Error("Market image attempt was superseded before uploading");
    }
    const uploaded = await Promise.allSettled(records.map((record) => putOwnedMedia(db, files, { ownerEmail: context.ownerEmail, ownerPublicId: context.ownerPublicId, objectKey: record.objectKey, kind: "market" }, record.bytes, {
      httpMetadata: { contentType: record.file.type },
      customMetadata: { listingId: context.listingId, imageId: record.id, owner: context.ownerEmail, attemptId },
    })));
    putsSettled = true;
    await db.prepare("UPDATE market_media_attempts SET puts_settled = 1 WHERE id = ?").bind(attemptId).run();
    const failed = uploaded.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;

    // D1 executes the entire batch transactionally. Only the current token may win;
    // capacity and current ownership/campus/status are rechecked inside that transaction.
    // Every following write is conditional on that winner, so a losing batch adds zero rows.
    const winnerCondition = `EXISTS (SELECT 1 FROM market_media_requests WHERE owner_email = ? AND idempotency_key = ? AND committed_attempt_id = ?)`;
    await db.batch([
      db.prepare(`UPDATE market_media_requests SET response_json = ?, committed_attempt_id = ?
        WHERE owner_email = ? AND idempotency_key = ? AND current_attempt_id = ? AND response_json IS NULL AND ended_at IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE email = market_media_requests.owner_email AND public_id = ? AND status = 'active')
          AND EXISTS (SELECT 1 FROM marketplace_listings WHERE id = ? AND owner_email = ? AND university_id = ? AND status IN ('active', 'reserved'))
          AND (SELECT COUNT(*) FROM marketplace_listing_images WHERE listing_id = ?) + ? <= 6`)
        .bind(JSON.stringify(body), attemptId, context.ownerEmail, context.key, attemptId, context.ownerPublicId,
          context.listingId, context.ownerEmail, context.universityId, context.listingId, records.length),
      ...records.map((record) => db.prepare(`INSERT INTO marketplace_listing_images
        (id, listing_id, uploader_email, object_key, original_file_name, content_type, byte_size, sort_order)
        SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM marketplace_listing_images WHERE listing_id = ?), 0)
        WHERE ${winnerCondition}`)
        .bind(record.id, context.listingId, context.ownerEmail, record.objectKey, record.file.name, record.file.type, record.file.size,
          context.listingId, context.ownerEmail, context.key, attemptId)),
      db.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
        SELECT ?, ?, 'market-listing.images-added', 'listing', ?, ? WHERE ${winnerCondition}`)
        .bind(crypto.randomUUID(), context.ownerEmail, context.listingId, JSON.stringify({ count: records.length, attemptId }), context.ownerEmail, context.key, attemptId),
    ]);
    const winner = await replayMarketMedia(db, context);
    if (winner) return marketMediaResponse(winner, (await readReceipt(db, context))?.committed_attempt_id !== attemptId);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM marketplace_listing_images WHERE listing_id = ?")
      .bind(context.listingId).first<{ count: number }>();
    if (Number(count?.count ?? 0) + records.length > 6) {
      throw new MarketIdempotencyError("Bir ilanda toplam en fazla 6 ürün görseli bulunabilir.", 409, "MARKET_IMAGE_CAPACITY");
    }
    throw new Error("Another market image attempt is still running; retry the same key");
  } catch (error) {
    // A submitted batch may have committed even when its acknowledgement was lost.
    const winner = await replayMarketMedia(db, context);
    if (winner) return marketMediaResponse(winner, true);
    throw error;
  } finally {
    if (registered && putsSettled) {
      try {
        await db.prepare("UPDATE market_media_attempts SET puts_settled = 1 WHERE id = ?").bind(attemptId).run();
        await db.prepare(`UPDATE market_media_requests SET current_attempt_id = NULL
          WHERE owner_email = ? AND idempotency_key = ? AND current_attempt_id = ? AND response_json IS NULL`)
          .bind(context.ownerEmail, context.key, attemptId).run();
        await reconcileMarketMedia(db, files, context.ownerEmail, context.universityId);
      } catch { /* Unknown DB/PUT state remains quarantined; never infer safety from a missing image row. */ }
    }
  }
}
