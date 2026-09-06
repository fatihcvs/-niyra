import { putOwnedMedia } from "./media-upload-operations";

type Attachment = {
  bytes: Uint8Array;
  kind: "image" | "video";
  contentType: string;
  fileName: string;
  storedExtension: string;
  width?: number;
  height?: number;
};

type PublishPayload = {
  content: string;
  audience: "campus" | "platform";
  courseId: string | null;
  attachment: Attachment | null;
  attachments?: readonly Attachment[];
};

export type PostPublication = {
  id: string;
  author_email: string;
  payload_hash: string;
  post_id: string;
  response_json: string | null;
};

export class PostIdempotencyError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "PostIdempotencyError";
  }
}

export function parsePostIdempotencyKey(value: string | null) {
  if (value === null) return null;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new PostIdempotencyError("Yayın tekrar anahtarı geçerli değil.", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return value;
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashPostPayload(payload: PublishPayload) {
  const attachments = payload.attachments ?? (payload.attachment ? [payload.attachment] : []);
  const media = attachments[0];
  // Hash semantic fields, not multipart boundaries or client-provided digests.
  const fingerprint = async (item: Attachment) => [item.kind, item.contentType, item.fileName, item.bytes.byteLength, await sha256(item.bytes)];
  // Zero/one attachment retain the exact v1 fingerprint, including already-persisted unknown attempts.
  const canonical = JSON.stringify(attachments.length <= 1 ? [
    1, payload.content.trim(), payload.audience, payload.courseId?.trim() || null,
    media ? await fingerprint(media) : null,
  ] : [2, payload.content.trim(), payload.audience, payload.courseId?.trim() || null, await Promise.all(attachments.map(fingerprint))]);
  return sha256(new TextEncoder().encode(canonical));
}

export async function findPostPublication(db: D1Database, email: string, key: string, hash: string) {
  const record = await db.prepare(
    "SELECT id, author_email, payload_hash, post_id, response_json FROM post_publish_requests WHERE author_email = ? AND idempotency_key = ?",
  ).bind(email, key).first<PostPublication>();
  if (record && record.payload_hash !== hash) {
    throw new PostIdempotencyError(
      "Bu yayın anahtarı farklı bir içerik için kullanıldı. Yeni paylaşım için yeni bir anahtar oluşturmalısın.",
      409, "IDEMPOTENCY_CONFLICT",
    );
  }
  return record;
}

export async function reservePostPublication(db: D1Database, email: string, key: string | null, hash: string, ownerPublicId: string) {
  const requestId = crypto.randomUUID();
  const postId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO post_publish_requests (id, author_email, idempotency_key, payload_hash, post_id)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE email = ? AND public_id = ? AND status = 'active')
     ON CONFLICT(author_email, idempotency_key) DO NOTHING`,
  ).bind(requestId, email, key, hash, postId, email, ownerPublicId).run();
  const record = key !== null
    ? await findPostPublication(db, email, key, hash)
    : await db.prepare(
      "SELECT id, author_email, payload_hash, post_id, response_json FROM post_publish_requests WHERE id = ? AND author_email = ?",
    ).bind(requestId, email).first<PostPublication>();
  if (!record) throw new Error("Post publication reservation unavailable");
  return record;
}

export async function readPostPublication(db: D1Database, publication: PostPublication): Promise<unknown | null> {
  const record = await db.prepare(
    "SELECT response_json, post_id FROM post_publish_requests WHERE id = ? AND author_email = ?",
  ).bind(publication.id, publication.author_email).first<{ response_json: string | null; post_id: string }>();
  if (!record?.response_json) return null;
  const post = await db.prepare(
    "SELECT deleted_at FROM posts WHERE id = ? AND author_email = ?",
  ).bind(record.post_id, publication.author_email).first<{ deleted_at: string | null }>();
  if (!post || post.deleted_at) {
    throw new PostIdempotencyError("Bu anahtarla paylaşılan gönderi kaldırıldı. Yeniden oluşturulmadı.", 410, "POST_REMOVED");
  }
  return JSON.parse(record.response_json);
}

export function postPublicationResponse(body: unknown, replayed: boolean) {
  return Response.json(body, {
    status: 201,
    headers: { "Cache-Control": "private, no-store", "Idempotency-Replayed": String(replayed) },
  });
}

/** Only known-finished failed attempts are eligible. Pending uploads need operational reconciliation. */
export async function cleanupPostAttempts(db: D1Database, files: R2Bucket | undefined, email: string, requestId: string) {
  const rows = await db.prepare(
    `SELECT a.id, a.object_key FROM post_publish_attempts a
     JOIN post_publish_requests r ON r.id = a.request_id
     WHERE r.author_email = ? AND r.id = ? AND a.state = 'cleanup' LIMIT 10`,
  ).bind(email, requestId).all<{ id: string; object_key: string | null }>();
  let cleaned = 0;
  for (const row of rows.results) {
    try {
      const ledger = await db.prepare("SELECT object_key FROM post_publish_attempt_media WHERE attempt_id = ? ORDER BY ordinal")
        .bind(row.id).all<{ object_key: string }>();
      const objectKeys = [...new Set([...(row.object_key ? [row.object_key] : []), ...ledger.results.map((item) => item.object_key)])];
      let referencedObject = false;
      for (const objectKey of objectKeys) {
        if (!files) continue;
        const unsettled = await db.prepare("SELECT id FROM media_upload_operations WHERE object_key = ? AND state IN ('putting', 'unknown') LIMIT 1")
          .bind(objectKey).first<{ id: string }>();
        if (unsettled) { referencedObject = true; continue; }
        const referenced = await db.prepare("SELECT id FROM post_media WHERE object_key = ? LIMIT 1")
          .bind(objectKey).first<{ id: string }>();
        if (referenced) { referencedObject = true; continue; }
        await files.delete(objectKey);
      }
      if (referencedObject || (objectKeys.length && !files)) continue;
      await db.prepare("UPDATE post_publish_attempts SET state = 'cleaned', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'cleanup'")
        .bind(row.id).run();
      cleaned++;
    } catch { /* Retain the cleanup record if storage or the acknowledgement is unavailable. */ }
  }
  return cleaned;
}

export async function retryPostCleanup(db: D1Database, files: R2Bucket | undefined, publication: PostPublication) {
  try {
    await cleanupPostAttempts(db, files, publication.author_email, publication.id);
  } catch { /* Storage maintenance must not turn a confirmed publication into a failed response. */ }
}

export async function publishPost(
  db: D1Database,
  files: R2Bucket | undefined,
  publication: PostPublication,
  ownerPublicId: string,
  payload: PublishPayload,
  responseBody: (postId: string, mediaId: string, createdAt: string, mediaIds: readonly string[]) => unknown,
) {
  const existing = await readPostPublication(db, publication);
  if (existing !== null) {
    await retryPostCleanup(db, files, publication);
    return postPublicationResponse(existing, true);
  }
  // Previously failed cleanup is retried only within this authenticated author's request.
  await cleanupPostAttempts(db, files, publication.author_email, publication.id);
  const attemptId = crypto.randomUUID();
  const attachments = payload.attachments ?? (payload.attachment ? [payload.attachment] : []);
  const mediaIds = attachments.map(() => crypto.randomUUID());
  const objectKeys = attachments.map((media, index) => `posts/${publication.post_id}/${mediaIds[index]}.${media.storedExtension}`);
  const createdAt = new Date().toISOString().replace("T", " ").replace("Z", "");
  const body = responseBody(publication.post_id, mediaIds[0] ?? "", createdAt, mediaIds);
  await db.prepare("INSERT INTO post_publish_attempts (id, request_id, object_key) VALUES (?, ?, ?)")
    .bind(attemptId, publication.id, objectKeys[0] ?? null).run();

  try {
    // Persist every planned object before the first upload. Partial/lost writes retain an auditable ledger.
    for (let index = 0; index < objectKeys.length; index++) {
      await db.prepare("INSERT INTO post_publish_attempt_media (attempt_id, ordinal, object_key) VALUES (?, ?, ?)")
        .bind(attemptId, index, objectKeys[index]).run();
    }
    for (let index = 0; index < attachments.length; index++) {
      if (!files) throw new Error("R2 binding FILES is unavailable");
      await putOwnedMedia(db, files, { ownerEmail: publication.author_email, ownerPublicId, objectKey: objectKeys[index], kind: "post" }, attachments[index].bytes,
        { httpMetadata: { contentType: attachments[index].contentType } });
    }
    // The attempt state is a transaction fence. A lost batch acknowledgement may race with
    // cleanup; whichever transaction wins prevents the other from publishing/deleting its media.
    const statements = [
      db.prepare(`UPDATE post_publish_attempts SET state = 'committed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND request_id = ? AND state = 'pending'
        AND EXISTS (SELECT 1 FROM users WHERE email = ? AND public_id = ? AND status = 'active')`)
        .bind(attemptId, publication.id, publication.author_email, ownerPublicId),
      db.prepare(
        `INSERT INTO posts (id, author_email, course_id, audience, content, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ? FROM post_publish_attempts WHERE id = ? AND state = 'committed'`,
      ).bind(publication.post_id, publication.author_email, payload.courseId, payload.audience, payload.content, createdAt, createdAt, attemptId),
    ];
    for (let index = 0; index < attachments.length; index++) {
      const media = attachments[index];
      statements.push(db.prepare(
        `INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size, width, height, ordinal)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM post_publish_attempts WHERE id = ? AND state = 'committed'`,
      ).bind(mediaIds[index], publication.post_id, media.kind, objectKeys[index], media.fileName, media.contentType, media.bytes.byteLength,
        media.width ?? null, media.height ?? null, index, attemptId));
    }
    statements.push(
      db.prepare(
        `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
         SELECT ?, ?, 'post.created', 'post', ?, ? FROM post_publish_attempts WHERE id = ? AND state = 'committed'`,
      ).bind(crypto.randomUUID(), publication.author_email, publication.post_id,
        JSON.stringify({ audience: payload.audience, courseId: payload.courseId, mediaKind: attachments[0]?.kind ?? null, mediaCount: attachments.length }), attemptId),
      db.prepare(
        `UPDATE post_publish_requests SET response_json = ? WHERE id = ? AND author_email = ?
         AND EXISTS (SELECT 1 FROM post_publish_attempts WHERE id = ? AND state = 'committed')`,
      ).bind(JSON.stringify(body), publication.id, publication.author_email, attemptId),
    );
    // D1 batch rolls back all statements if the shared post_id already has a winner.
    await db.batch(statements);
    const completed = await readPostPublication(db, publication);
    if (completed === null) throw new Error("Post publication attempt was cancelled");
    return postPublicationResponse(completed, false);
  } catch (error) {
    try {
      // Fence this attempt before checking references or deleting objects. If commit won,
      // its state stays committed; if cleanup won, a delayed batch can no longer insert.
      await db.prepare("UPDATE post_publish_attempts SET state = 'cleanup', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND request_id = ? AND state = 'pending'")
        .bind(attemptId, publication.id).run();
      await cleanupPostAttempts(db, files, publication.author_email, publication.id);
      const completed = await readPostPublication(db, publication);
      if (completed !== null) return postPublicationResponse(completed, true);
    } catch (reconciliationError) {
      if (reconciliationError instanceof PostIdempotencyError) throw reconciliationError;
      // Unknown DB outcome: preserve the object plus its durable attempt record.
    }
    throw error;
  }
}
