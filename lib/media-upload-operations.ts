export type MediaUploadKind = "notes" | "profile" | "pulse" | "post" | "market";
type UploadOwner = { ownerEmail: string; ownerPublicId: string; objectKey: string; kind: MediaUploadKind };

export class MediaUploadError extends Error {
  constructor(message = "Hesap durumu değişti. Dosya yayınlanmadı.", public status = 409, public code = "MEDIA_ACCOUNT_CHANGED") {
    super(message); this.name = "MediaUploadError";
  }
}

export async function requireActiveMediaOwner(db: D1Database, ownerEmail: string, ownerPublicId: string) {
  const active = await db.prepare("SELECT 1 AS active FROM users WHERE email = ? AND public_id = ? AND status = 'active' LIMIT 1")
    .bind(ownerEmail, ownerPublicId).first<{ active: number }>();
  if (!active) throw new MediaUploadError();
}

/** The durable registration precedes the real PUT and survives deletion of its owner.
 * A rejected/unknown PUT is never evidence of settlement. The erasure worker must
 * retain putting/unknown rows even if a delete/HEAD currently sees no object.
 */
export async function putOwnedMedia(
  db: D1Database, files: R2Bucket, owner: UploadOwner, bytes: Uint8Array, options?: R2PutOptions,
) {
  const prefix = { notes: "notes/", profile: "profiles/", pulse: "pulse/", post: "posts/", market: "market/" }[owner.kind];
  if (!prefix || !owner.objectKey.startsWith(prefix) || owner.objectKey.length > 1024 || /[\x00-\x1f\x7f]/.test(owner.objectKey)
    || !owner.ownerEmail || owner.ownerEmail.length > 320 || !owner.ownerPublicId || owner.ownerPublicId.length > 128) throw new MediaUploadError("Dosya sahipliği doğrulanamadı.", 400, "MEDIA_OWNER_INVALID");
  const id = crypto.randomUUID();
  // A concurrent freeze wins before this statement or leaves an independent
  // putting entry that the erasure job can observe; there is no unregistered PUT.
  const registered = await db.prepare(`INSERT INTO media_upload_operations (id, owner_email, owner_public_id, object_key, kind)
    SELECT ?, ?, ?, ?, ? FROM users WHERE email = ? AND public_id = ? AND status = 'active' RETURNING id`)
    .bind(id, owner.ownerEmail, owner.ownerPublicId, owner.objectKey, owner.kind, owner.ownerEmail, owner.ownerPublicId).first<{ id: string }>();
  if (!registered) throw new MediaUploadError();
  try {
    await files.put(owner.objectKey, bytes, options);
  } catch (error) {
    try {
      await db.prepare("UPDATE media_upload_operations SET state = 'unknown' WHERE id = ? AND object_key = ? AND state = 'putting'")
        .bind(id, owner.objectKey).run();
    } catch { /* A missing acknowledgement leaves putting, which also blocks completion. */ }
    throw error;
  }
  // This update is deliberately after fulfillment, outside the catch above: a
  // failed DB acknowledgement must not replace a possibly committed settled row.
  const settled = await db.prepare(`UPDATE media_upload_operations SET state = 'settled', settled_at = CURRENT_TIMESTAMP
    WHERE id = ? AND object_key = ? AND state IN ('putting', 'unknown') RETURNING id`)
    .bind(id, owner.objectKey).first<{ id: string }>();
  if (!settled) throw new MediaUploadError("Dosya aktarımının son durumu doğrulanamadı.", 503, "MEDIA_SETTLEMENT_UNAVAILABLE");
  await requireActiveMediaOwner(db, owner.ownerEmail, owner.ownerPublicId);
}
