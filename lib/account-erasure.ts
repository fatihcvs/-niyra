import { AccountDeletionError } from "./account-deletion";
import { ERASURE_ENTITY_SOURCES, ERASURE_PRESERVATIONS, ERASURE_USER_RELATIONS, snapshotErasureObjects } from "./account-erasure-inventory";

export type AccountErasureJob = {
  id: string; requestId: string; state: "queued" | "storage_pending" | "blocked" | "finalizing" | "completed";
  createdAt: string; updatedAt: string; completedAt: string | null;
  removedObjectCount: number; removedRowCount: number; preservedContainerCount: number;
  pendingObjectCount: number; lastErrorCode: string | null;
};
type JobRow = {
  id: string; source_request_id: string; state: AccountErasureJob["state"]; created_at: string; updated_at: string;
  completed_at: string | null; removed_object_count: number; removed_row_count: number; preserved_container_count: number;
  last_error_code: string | null; pending_object_count: number;
};
type Subject = { user_email: string; tombstone_email: string; scan_cursor: string | null; scan_complete: number; scrub_table: number; scrub_cursor: string | null; scrub_complete: number };
const safeJob = (row: JobRow): AccountErasureJob => ({ id: row.id, requestId: row.source_request_id, state: row.state,
  createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at, removedObjectCount: row.removed_object_count,
  removedRowCount: row.removed_row_count, preservedContainerCount: row.preserved_container_count,
  pendingObjectCount: row.pending_object_count, lastErrorCode: row.last_error_code });
const jobSelect = `SELECT j.*, (SELECT COUNT(*) FROM account_erasure_objects o WHERE o.job_id=j.id AND o.state!='deleted') AS pending_object_count FROM account_erasure_jobs j`;

export async function readAccountErasureJob(db: D1Database, id: string) {
  const row = await db.prepare(`${jobSelect} WHERE j.id=?`).bind(id).first<JobRow>();
  if (!row) throw new AccountDeletionError("Silme işlemi bulunamadı.", 404);
  return safeJob(row);
}
export async function readAccountErasureJobs(db: D1Database, requestIds?: readonly string[]) {
  if (requestIds && !requestIds.length) return [];
  const ids = requestIds?.slice(0, 50);
  const rows = await db.prepare(`${jobSelect} ${ids ? `WHERE j.source_request_id IN (${ids.map(() => "?").join(",")})` : ""}
    ORDER BY CASE WHEN j.state='completed' THEN 1 ELSE 0 END,j.created_at DESC,j.id DESC LIMIT 50`).bind(...(ids ?? [])).all<JobRow>();
  return rows.results.map(safeJob);
}
async function requireOwner(db: D1Database, staffId: string) {
  const owner = await db.prepare("SELECT id FROM staff_accounts WHERE id=? AND role='owner' AND status='active' AND must_change_password=0").bind(staffId).first();
  if (!owner) throw new AccountDeletionError("Bu işlem yalnızca owner hesabına açıktır.", 403);
}

/** The request uniqueness constraint is the acceptance CAS. Every dependent statement uses its winning job ID. */
export async function acceptAccountErasure(db: D1Database, staffId: string, requestId: string) {
  await requireOwner(db, staffId);
  const existing = await db.prepare("SELECT id FROM account_erasure_jobs WHERE source_request_id=?").bind(requestId).first<{ id: string }>();
  if (existing) return readAccountErasureJob(db, existing.id);
  const request = await db.prepare("SELECT r.user_email,r.status,u.status AS user_status FROM account_deletion_requests r JOIN users u ON u.email=r.user_email WHERE r.id=?")
    .bind(requestId).first<{ user_email: string; status: string; user_status: string }>();
  if (!request) throw new AccountDeletionError("Talep bulunamadı.", 404);
  if (request.status !== "in_review" || request.user_status !== "active") throw new AccountDeletionError("Yalnızca incelemedeki etkin hesap talebi yürütülebilir.", 409);
  const id = crypto.randomUUID();
  const tombstone = `erased-${crypto.randomUUID()}@invalid.kampira`;
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`INSERT INTO account_erasure_jobs(id,source_request_id,created_at,updated_at)
      SELECT ?,r.id,?,? FROM account_deletion_requests r JOIN users u ON u.email=r.user_email
      WHERE r.id=? AND r.status='in_review' AND u.status='active'
        AND EXISTS(SELECT 1 FROM staff_accounts WHERE id=? AND role='owner' AND status='active' AND must_change_password=0)
      ON CONFLICT(source_request_id) DO NOTHING`).bind(id, now, now, requestId, staffId),
    db.prepare(`INSERT INTO account_erasure_subjects(job_id,user_email,tombstone_email)
      SELECT j.id,r.user_email,? FROM account_erasure_jobs j JOIN account_deletion_requests r ON r.id=j.source_request_id WHERE j.id=?`).bind(tombstone, id),
    db.prepare("UPDATE users SET status='deleting',updated_at=? WHERE email=? AND status='active' AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=? AND user_email=users.email)").bind(now, request.user_email, id),
    db.prepare("DELETE FROM user_sessions WHERE user_email=? AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=? AND user_email=user_sessions.user_email)").bind(request.user_email, id),
    db.prepare("DELETE FROM push_subscriptions WHERE owner_email=? AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=? AND user_email=push_subscriptions.owner_email)").bind(request.user_email, id),
    ...snapshotErasureObjects(db, id, request.user_email),
    ...ERASURE_ENTITY_SOURCES.map(([kind, table, owner]) => db.prepare(`INSERT INTO account_erasure_entities(job_id,kind,entity_id)
      SELECT ?,?,id FROM ${table} WHERE ${owner}=? AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=?) ON CONFLICT DO NOTHING`).bind(id, kind, request.user_email, id)),
    db.prepare(`INSERT INTO account_erasure_entities(job_id,kind,entity_id) SELECT ?,'post',post_id FROM post_publish_requests
      WHERE author_email=? AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=?) ON CONFLICT DO NOTHING`).bind(id, request.user_email, id),
    db.prepare(`INSERT INTO account_erasure_entities(job_id,kind,entity_id) SELECT ?,'user',public_id FROM users
      WHERE email=? AND public_id IS NOT NULL AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=?)`).bind(id, request.user_email, id),
    db.prepare(`INSERT INTO account_erasure_entities(job_id,kind,entity_id) SELECT ?,'user-email',? WHERE EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=?)`).bind(id, request.user_email, id),
    db.prepare(`INSERT INTO staff_audit_logs(id,staff_id,action,entity_type,entity_id,detail)
      SELECT ?,?,'account.erasure_accepted','account-erasure',id,'{}' FROM account_erasure_jobs WHERE id=?`).bind(crypto.randomUUID(), staffId, id),
  ];
  try { await db.batch(statements); } catch {
    const committed = await db.prepare("SELECT id FROM account_erasure_jobs WHERE source_request_id=?").bind(requestId).first<{ id: string }>();
    if (committed) return readAccountErasureJob(db, committed.id);
    throw new AccountDeletionError("Silme işlemi başlatılamadı. Talep durumunu yenileyip tekrar deneyebilirsin.", 503);
  }
  const winner = await db.prepare("SELECT id FROM account_erasure_jobs WHERE source_request_id=?").bind(requestId).first<{ id: string }>();
  if (!winner) throw new AccountDeletionError("Talep bu sırada değişti. Durumu yenile.", 409);
  return readAccountErasureJob(db, winner.id);
}

const unresolvedPut = `EXISTS(SELECT 1 FROM media_upload_operations op WHERE op.owner_email=? AND op.object_key=o.object_key AND op.state!='settled')
 OR EXISTS(SELECT 1 FROM market_media_attempt_objects m JOIN market_media_attempts a ON a.id=m.attempt_id
   WHERE a.owner_email=? AND m.object_key=o.object_key AND a.puts_settled=0)
 OR EXISTS(SELECT 1 FROM post_publish_attempts a JOIN post_publish_requests r ON r.id=a.request_id
   WHERE r.author_email=? AND a.state='pending' AND (a.object_key=o.object_key OR EXISTS(SELECT 1 FROM post_publish_attempt_media m WHERE m.attempt_id=a.id AND m.object_key=o.object_key)))
 OR EXISTS(SELECT 1 FROM notes n WHERE n.owner_email=? AND n.object_key=o.object_key AND n.status IN ('processing','deleting','rejected')
   AND NOT EXISTS(SELECT 1 FROM media_upload_operations op WHERE op.owner_email=n.owner_email AND op.object_key=n.object_key AND op.state='settled'))`;

function resemblesLegacyKey(key: string, email: string) {
  const basic = email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  const profile = email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return key.startsWith(`notes/${basic}/`) || key.startsWith(`market/${basic}/`) || key.startsWith(`profiles/${profile}/`)
    || (key.startsWith("pulse/") && key.split("/")[2] === basic);
}
async function scanLegacyObjects(db: D1Database, files: R2Bucket, jobId: string, token: string, subject: Subject) {
  if (subject.scan_complete) return;
  // Whole-bucket pagination is deliberate: lossy email-derived prefixes are not ownership evidence.
  const page = await files.list({ limit: 100, ...(subject.scan_cursor ? { cursor: subject.scan_cursor } : {}), include: ["customMetadata"] });
  const statements: D1PreparedStatement[] = [];
  for (const object of page.objects) {
    if (!/^(notes|profiles|pulse|market|posts)\//.test(object.key)) continue;
    const owner = object.customMetadata?.owner;
    const postKey = /^posts\/([^/]+)\/[^/]+$/.exec(object.key);
    const ownedPost = postKey ? await db.prepare("SELECT entity_id FROM account_erasure_entities WHERE job_id=? AND kind='post' AND entity_id=?").bind(jobId, postKey[1]).first() : null;
    const owned = owner === subject.user_email || Boolean(ownedPost);
    const ambiguous = !owner && resemblesLegacyKey(object.key, subject.user_email);
    if (!owned && !ambiguous) continue;
    statements.push(db.prepare(`INSERT INTO account_erasure_objects(job_id,object_key,kind,state,evidence_kind,last_error_code)
      SELECT ?,?,'legacy',?,?,? WHERE EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=?)
      ON CONFLICT(job_id,object_key) DO NOTHING`).bind(jobId, object.key, ambiguous ? "blocked" : "waiting_put",
      ambiguous ? "ambiguous_legacy" : ownedPost ? "exact_post_parent" : "exact_owner_metadata", ambiguous ? "LEGACY_OWNERSHIP_UNKNOWN" : null, jobId, token));
  }
  statements.push(db.prepare(`UPDATE account_erasure_subjects SET scan_cursor=?,scan_complete=? WHERE job_id=?
    AND EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=?)`).bind(page.truncated ? page.cursor : null, page.truncated ? 0 : 1, jobId, jobId, token));
  await db.batch(statements);
}

function hasSubjectReference(value: unknown, references: Set<string>): boolean {
  if (typeof value === "string") return [...references].some(reference => reference && (value === reference || value.includes(reference)));
  if (Array.isArray(value)) return value.some(item => hasSubjectReference(item, references));
  return value !== null && typeof value === "object" && Object.entries(value).some(([key, item]) => references.has(key) || hasSubjectReference(item, references));
}

/** Redact known structured copies while preserving unrelated authors' free-form message/comment bodies. */
async function scrubSnapshotPage(db: D1Database, jobId: string, subject: Subject, token: string) {
  if (subject.scrub_complete) return;
  const email = subject.user_email;
  const entities = await db.prepare("SELECT entity_id FROM account_erasure_entities WHERE job_id=?").bind(jobId).all<{ entity_id: string }>();
  const references = new Set([email, ...entities.results.map(row => row.entity_id)]);
  const statements: D1PreparedStatement[] = [];
  const sources = [["direct_messages", "attachment_snapshot"], ["content_reports", "evidence_json"], ["audit_logs", "detail"], ["staff_audit_logs", "detail"], ["community_audit_logs", "detail"]];
  const [table, column] = sources[subject.scrub_table];
    const actor = table === "direct_messages" ? "sender_email" : table === "content_reports" ? "reporter_email" : table === "staff_audit_logs" ? null : "actor_email";
    const rows = await db.prepare(`SELECT id,${column} AS value FROM ${table} WHERE ${column} NOT IN ('{}','[]','') ${actor ? `AND (${actor} IS NULL OR ${actor}!=?)` : ""}
      AND id>? ORDER BY id LIMIT 100`).bind(...(actor ? [email] : []), subject.scrub_cursor ?? "").all<{ id: string; value: string }>();
    for (const row of rows.results) {
      let value: unknown = row.value;
      try { value = JSON.parse(row.value); } catch { /* Malformed legacy snapshots are checked as text. */ }
      if (!hasSubjectReference(value, references)) continue;
      const assignments = table === "direct_messages" ? "attachment_snapshot='{}',attachment_type=NULL,attachment_id=NULL" : `${column}='{}'`;
      statements.push(db.prepare(`UPDATE ${table} SET ${assignments} WHERE id=? AND EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=? AND state!='completed')`).bind(row.id, jobId, token));
    }
  const nextTable = rows.results.length < 100 ? subject.scrub_table + 1 : subject.scrub_table;
  statements.push(db.prepare(`UPDATE account_erasure_subjects SET scrub_table=?,scrub_cursor=?,scrub_complete=? WHERE job_id=?
    AND EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=?)`).bind(nextTable, rows.results.length < 100 ? null : rows.results.at(-1)!.id,
    nextTable === sources.length ? 1 : 0, jobId, jobId, token));
  await db.batch(statements);
}

async function finalizeErasure(db: D1Database, jobId: string, token: string, subject: Subject) {
  const email = subject.user_email;
  const guard = "EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=? AND state='finalizing')";
  const statement = (sql: string, ...values: D1Value[]) => db.prepare(sql).bind(...values, jobId, token);
  const timestamp = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE account_erasure_jobs SET state='finalizing',updated_at=? WHERE id=? AND lease_token=?
      AND NOT EXISTS(SELECT 1 FROM account_erasure_objects WHERE job_id=? AND state!='deleted')
      AND EXISTS(SELECT 1 FROM account_erasure_subjects WHERE job_id=? AND scan_complete=1 AND scrub_complete=1)
      AND NOT EXISTS(SELECT 1 FROM media_upload_operations WHERE owner_email=? AND state!='settled')`).bind(timestamp, jobId, token, jobId, jobId, email),
    statement(`INSERT INTO users(email,display_name,handle,status) SELECT ?,'Silinmiş hesap',?,'deleted' WHERE ${guard}`, subject.tombstone_email, `erased_${subject.tombstone_email.split("@")[0].replaceAll("-", "")}`),
    statement(`UPDATE direct_messages SET attachment_type=NULL,attachment_id=NULL,attachment_snapshot='{}' WHERE attachment_id IN(SELECT entity_id FROM account_erasure_entities WHERE job_id=?) AND sender_email!=? AND ${guard}`, jobId, email),
    statement(`UPDATE notifications SET actor_email=NULL,title='Silinmiş içerik',body='',entity_type=NULL,entity_id=NULL WHERE
      (actor_email=? OR entity_id IN(SELECT entity_id FROM account_erasure_entities WHERE job_id=?)) AND user_email!=? AND ${guard}`, email, jobId, email),
    statement(`UPDATE content_reports SET evidence_json='{}',details='',reason='Silinmiş içerik',appeal_text=NULL WHERE entity_id IN(SELECT entity_id FROM account_erasure_entities WHERE job_id=?) AND reporter_email!=? AND ${guard}`, jobId, email),
    statement(`UPDATE content_reports SET decided_by_email=NULL WHERE decided_by_email=? AND reporter_email!=? AND ${guard}`, email, email),
    statement(`UPDATE pilot_invites SET claimed_by_email=NULL WHERE claimed_by_email=? AND created_by_email!=? AND ${guard}`, email, email),
    statement(`UPDATE community_audit_logs SET target_email=NULL,detail='{}' WHERE target_email=? AND actor_email!=? AND ${guard}`, email, email),
    statement(`DELETE FROM post_media WHERE post_id IN(SELECT id FROM posts WHERE author_email=?) AND ${guard}`, email),
    statement(`DELETE FROM marketplace_listing_images WHERE listing_id IN(SELECT id FROM marketplace_listings WHERE owner_email=?) AND ${guard}`, email),
    statement(`UPDATE account_erasure_jobs SET preserved_container_count=preserved_container_count+(SELECT COUNT(*) FROM direct_conversations WHERE member_one_email=? OR member_two_email=?) WHERE id=? AND ${guard}`, email, email, jobId),
    statement(`UPDATE direct_conversations SET
      member_one_email=min(CASE WHEN member_one_email=? THEN ? ELSE member_one_email END,CASE WHEN member_two_email=? THEN ? ELSE member_two_email END),
      member_two_email=max(CASE WHEN member_one_email=? THEN ? ELSE member_one_email END,CASE WHEN member_two_email=? THEN ? ELSE member_two_email END)
      WHERE (member_one_email=? OR member_two_email=?) AND ${guard}`,
      email, subject.tombstone_email, email, subject.tombstone_email, email, subject.tombstone_email, email, subject.tombstone_email, email, email),
  ];
  for (const [table, owner, fields] of ERASURE_PRESERVATIONS) {
    statements.push(statement(`UPDATE account_erasure_jobs SET preserved_container_count=preserved_container_count+(SELECT COUNT(*) FROM ${table} WHERE ${owner}=?) WHERE id=? AND ${guard}`, email, jobId));
    statements.push(statement(`UPDATE ${table} SET ${owner}=?${fields ? `,${fields}` : ""} WHERE ${owner}=? AND ${guard}`, subject.tombstone_email, email));
  }
  // Exact remaining relations only. Parent rows with other people's dependents have already been reassigned.
  for (const [table, ...columns] of ERASURE_USER_RELATIONS) {
    const where = columns.map(column => `${column}=?`).join(" OR ");
    statements.push(statement(`UPDATE account_erasure_jobs SET removed_row_count=removed_row_count+(SELECT COUNT(*) FROM ${table} WHERE ${where}) WHERE id=? AND ${guard}`, ...columns.map(() => email), jobId));
    statements.push(statement(`DELETE FROM ${table} WHERE (${where}) AND ${guard}`, ...columns.map(() => email)));
  }
  for (const table of ["audit_logs", "rate_limit_windows"]) statements.push(statement(`DELETE FROM ${table} WHERE actor_email=? AND ${guard}`, email));
  for (const table of ["audit_logs", "staff_audit_logs"]) statements.push(statement(`UPDATE ${table} SET entity_id=NULL,detail='{}' WHERE entity_id IN(SELECT entity_id FROM account_erasure_entities WHERE job_id=?) AND ${guard}`, jobId));
  statements.push(
    statement(`UPDATE staff_audit_logs SET detail='{}' WHERE entity_id IN(SELECT entity_id FROM account_erasure_entities WHERE job_id=?) AND ${guard}`, jobId),
    statement(`DELETE FROM media_upload_operations WHERE owner_email=? AND ${guard}`, email),
    statement(`DELETE FROM users WHERE email=? AND status='deleting' AND ${guard}`, email),
    statement(`UPDATE account_erasure_jobs SET removed_object_count=(SELECT COUNT(*) FROM account_erasure_objects WHERE job_id=? AND state='deleted'),removed_row_count=removed_row_count+1 WHERE id=? AND ${guard}`, jobId, jobId),
    statement(`DELETE FROM account_erasure_objects WHERE job_id=? AND ${guard}`, jobId),
    statement(`DELETE FROM account_erasure_entities WHERE job_id=? AND ${guard}`, jobId),
    statement(`DELETE FROM account_erasure_subjects WHERE job_id=? AND ${guard}`, jobId),
    db.prepare("UPDATE account_erasure_jobs SET state='completed',last_error_code=NULL,lease_token=NULL,lease_until_ms=NULL,updated_at=?,completed_at=? WHERE id=? AND lease_token=? AND state='finalizing'").bind(timestamp, timestamp, jobId, token),
  );
  await db.batch(statements);
}

/** One bounded, owner-authorized step. Time passing never resolves an unknown PUT. */
export async function resumeAccountErasure(db: D1Database, files: R2Bucket | undefined, staffId: string, jobId: string, options: { now?: () => number; objectLimit?: number } = {}) {
  await requireOwner(db, staffId);
  const initial = await readAccountErasureJob(db, jobId);
  if (initial.state === "completed") return initial;
  const now = options.now ?? Date.now;
  const token = crypto.randomUUID();
  const claimed = await db.prepare(`UPDATE account_erasure_jobs SET lease_token=?,lease_until_ms=?,attempts=attempts+1,updated_at=?
    WHERE id=? AND state!='completed' AND (lease_token IS NULL OR lease_until_ms<=?) RETURNING id`).bind(token, now() + 60000, new Date(now()).toISOString(), jobId, now()).first();
  if (!claimed) return readAccountErasureJob(db, jobId);
  let errorCode: string | null = null;
  try {
    const subject = await db.prepare("SELECT * FROM account_erasure_subjects WHERE job_id=?").bind(jobId).first<Subject>();
    if (!subject) throw new Error("Erasure subject unavailable");
    await db.batch(snapshotErasureObjects(db, jobId, subject.user_email));
    if (!files) errorCode = "STORAGE_UNAVAILABLE";
    else {
      await scanLegacyObjects(db, files, jobId, token, subject);
      await scrubSnapshotPage(db, jobId, subject, token);
      await db.prepare(`UPDATE account_erasure_objects AS o SET state=CASE WHEN (${unresolvedPut}) THEN 'waiting_put' ELSE 'delete_pending' END
        WHERE job_id=? AND state IN ('waiting_put','delete_pending') AND EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=?)`)
        .bind(subject.user_email, subject.user_email, subject.user_email, subject.user_email, jobId, jobId, token).run();
      const limit = Math.min(25, Math.max(1, options.objectLimit ?? 20));
      const objects = await db.prepare(`SELECT object_key FROM account_erasure_objects WHERE job_id=? AND state='delete_pending' ORDER BY object_key LIMIT ?`).bind(jobId, limit).all<{ object_key: string }>();
      for (const object of objects.results) {
        const current = await db.prepare("SELECT id FROM account_erasure_jobs WHERE id=? AND lease_token=?").bind(jobId, token).first();
        if (!current) break;
        try {
          await files.delete(object.object_key);
          if (await files.head(object.object_key)) throw new Error("Object remains after deletion");
          await db.prepare(`UPDATE account_erasure_objects SET state='deleted',attempts=attempts+1,deleted_at=?,last_error_code=NULL
            WHERE job_id=? AND object_key=? AND state='delete_pending' AND EXISTS(SELECT 1 FROM account_erasure_jobs WHERE id=? AND lease_token=?)`)
            .bind(new Date(now()).toISOString(), jobId, object.object_key, jobId, token).run();
        } catch {
          errorCode = "STORAGE_DELETE_UNCONFIRMED";
          await db.prepare("UPDATE account_erasure_objects SET attempts=attempts+1,last_error_code='STORAGE_DELETE_UNCONFIRMED' WHERE job_id=? AND object_key=? AND state!='deleted'").bind(jobId, object.object_key).run();
        }
      }
      const pending = await db.prepare("SELECT state,COUNT(*) AS count FROM account_erasure_objects WHERE job_id=? AND state!='deleted' GROUP BY state").bind(jobId).all<{ state: string; count: number }>();
      if (pending.results.some(row => row.state === "blocked")) errorCode = "LEGACY_OWNERSHIP_UNKNOWN";
      else if (pending.results.some(row => row.state === "waiting_put")) errorCode = "UPLOAD_UNRESOLVED";
      const scan = await db.prepare("SELECT scan_complete,scrub_complete FROM account_erasure_subjects WHERE job_id=?").bind(jobId).first<{ scan_complete: number; scrub_complete: number }>();
      if (!pending.results.length && scan?.scan_complete && scan.scrub_complete) await finalizeErasure(db, jobId, token, subject);
    }
  } catch {
    // A lost final batch acknowledgement may already represent completion. Never undo its receipt.
    const result = await readAccountErasureJob(db, jobId);
    if (result.state === "completed") return result;
    errorCode ??= "ERASURE_RETRY_REQUIRED";
  } finally {
    await db.prepare(`UPDATE account_erasure_jobs SET state=?,last_error_code=?,lease_token=NULL,lease_until_ms=NULL,updated_at=?
      WHERE id=? AND lease_token=? AND state!='completed'`).bind(errorCode === "UPLOAD_UNRESOLVED" || errorCode === "LEGACY_OWNERSHIP_UNKNOWN" ? "blocked" : "storage_pending", errorCode, new Date(now()).toISOString(), jobId, token).run();
  }
  return readAccountErasureJob(db, jobId);
}
