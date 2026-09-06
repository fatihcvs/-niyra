import type { AccountErasureJob } from "./account-erasure";
export type AccountDeletionStatus = "requested" | "in_review" | "cancelled";
export type AccountDeletionEvent = { status: AccountDeletionStatus; createdAt: string };
export type AccountDeletionRequest = {
  id: string;
  status: AccountDeletionStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  history: AccountDeletionEvent[];
  erasureJob?: AccountErasureJob;
};
export type AccountDeletionQueueItem = AccountDeletionRequest & { email: string; displayName: string; publicId: string | null };

type RequestRow = { id: string; user_email: string; status: AccountDeletionStatus; note: string; created_at: string; updated_at: string };

export class AccountDeletionError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = "AccountDeletionError"; }
}

export function requireDeletionContext(request: Request, email: string) {
  const expected = request.headers.get("X-Account-Context");
  if (expected !== null && expected !== email) throw new AccountDeletionError("Oturumundaki hesap değişti. Devam etmeden önce talep durumunu yenile.", 409, "ACCOUNT_CHANGED");
}

export function deletionNote(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.trim().length > 800) throw new AccountDeletionError("Açıklama en fazla 800 karakter olabilir.", 400);
  return value.trim();
}

export function deletionRequestId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(value)) throw new AccountDeletionError("Talep kimliği geçerli değil.", 400);
  return value;
}

export async function requireDeletionAccount(db: D1Database, email: string) {
  const user = await db.prepare("SELECT email, display_name FROM users WHERE email = ? AND status = 'active' LIMIT 1")
    .bind(email).first<{ email: string; display_name: string }>();
  if (!user) throw new AccountDeletionError("Bu işlem için etkin hesabına giriş yapmalısın.", 403);
  return { email: user.email, displayName: user.display_name };
}

async function withHistory(db: D1Database, rows: RequestRow[]): Promise<AccountDeletionRequest[]> {
  if (!rows.length) return [];
  const events = await db.prepare(
    `SELECT request_id, status, created_at FROM account_deletion_events WHERE request_id IN (${rows.map(() => "?").join(",")})
     ORDER BY created_at, CASE status WHEN 'requested' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END`,
  ).bind(...rows.map((row) => row.id)).all<{ request_id: string; status: AccountDeletionStatus; created_at: string }>();
  return rows.map((row) => ({
    id: row.id, status: row.status, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at,
    history: events.results.filter((event) => event.request_id === row.id).map((event) => ({ status: event.status, createdAt: event.created_at })),
  }));
}

export async function readAccountDeletionRequests(db: D1Database, email: string) {
  const rows = await db.prepare("SELECT * FROM account_deletion_requests WHERE user_email = ? ORDER BY created_at DESC, id DESC LIMIT 20")
    .bind(email).all<RequestRow>();
  return withHistory(db, rows.results);
}

export async function createAccountDeletionRequest(db: D1Database, email: string, note: string) {
  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO account_deletion_requests (id, user_email, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_email) WHERE status IN ('requested', 'in_review') DO NOTHING`,
    ).bind(id, email, note, now, now),
    db.prepare(
      `INSERT INTO account_deletion_events (id, request_id, status, actor_kind, created_at)
       SELECT ?, id, 'requested', 'user', ? FROM account_deletion_requests WHERE id = ? AND user_email = ?`,
    ).bind(eventId, now, id, email),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
       SELECT ?, ?, 'account.deletion_requested', 'account-deletion-request', id, '{}' FROM account_deletion_requests WHERE id = ? AND user_email = ?`,
    ).bind(crypto.randomUUID(), email, id, email),
  ]);
  const row = await db.prepare(
    `SELECT * FROM account_deletion_requests WHERE user_email = ? AND (id = ? OR status IN ('requested', 'in_review'))
     ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(email, id, id).first<RequestRow>();
  if (!row) throw new Error("Account deletion request result unavailable");
  return { request: (await withHistory(db, [row]))[0], created: row.id === id };
}

export async function cancelAccountDeletionRequest(db: D1Database, email: string, id: string) {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE account_deletion_requests SET status = 'cancelled', updated_at = ? WHERE id = ? AND user_email = ? AND status IN ('requested', 'in_review') AND NOT EXISTS(SELECT 1 FROM account_erasure_jobs WHERE source_request_id=account_deletion_requests.id)")
      .bind(now, id, email),
    db.prepare(
      `INSERT INTO account_deletion_events (id, request_id, status, actor_kind, created_at)
       SELECT ?, id, 'cancelled', 'user', ? FROM account_deletion_requests WHERE id = ? AND user_email = ? AND status = 'cancelled'
       ON CONFLICT(request_id, status) DO NOTHING`,
    ).bind(eventId, now, id, email),
    db.prepare(
      `INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
       SELECT ?, ?, 'account.deletion_cancelled', 'account-deletion-request', request_id, '{}' FROM account_deletion_events WHERE id = ?`,
    ).bind(crypto.randomUUID(), email, eventId),
  ]);
  const row = await db.prepare("SELECT * FROM account_deletion_requests WHERE id = ? AND user_email = ?")
    .bind(id, email).first<RequestRow>();
  if (!row) throw new AccountDeletionError("Talep bulunamadı.", 404);
  const started = await db.prepare("SELECT id FROM account_erasure_jobs WHERE source_request_id=?").bind(id).first();
  if (started) throw new AccountDeletionError("Yürütülmeye başlayan silme işlemi iptal edilemez.", 409, "ERASURE_STARTED");
  return (await withHistory(db, [row]))[0];
}

export async function readAccountDeletionQueue(db: D1Database, filter: string, before: string | null) {
  if (!["open", "requested", "in_review", "cancelled"].includes(filter)) throw new AccountDeletionError("Kuyruk filtresi geçerli değil.", 400);
  let cursor: { createdAt: string; id: string } | null = null;
  if (before) {
    try {
      if (before.length > 512) throw new Error("Cursor too long");
      cursor = JSON.parse(atob(before));
      if (!cursor || typeof cursor.createdAt !== "string" || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error("Invalid date");
      deletionRequestId(cursor.id);
    } catch { throw new AccountDeletionError("Sayfalama bilgisi geçerli değil.", 400); }
  }
  const condition = filter === "open" ? "r.status IN ('requested', 'in_review')" : "r.status = ?";
  const values: D1Value[] = filter === "open" ? [] : [filter];
  if (cursor) values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  const rows = await db.prepare(
    `SELECT r.*, u.display_name, u.public_id FROM account_deletion_requests r JOIN users u ON u.email = r.user_email
     WHERE ${condition} ${cursor ? "AND (r.created_at < ? OR (r.created_at = ? AND r.id < ?))" : ""}
     ORDER BY r.created_at DESC, r.id DESC LIMIT 51`,
  ).bind(...values).all<RequestRow & { display_name: string; public_id: string | null }>();
  const visible = rows.results.slice(0, 50);
  const requests = await withHistory(db, visible);
  const last = visible.at(-1);
  return {
    requests: requests.map((request, index): AccountDeletionQueueItem => ({ ...request,
      email: visible[index].user_email, displayName: visible[index].display_name, publicId: visible[index].public_id,
    })),
    nextCursor: rows.results.length > 50 && last ? btoa(JSON.stringify({ createdAt: last.created_at, id: last.id })) : null,
  };
}

export async function reviewAccountDeletionRequest(db: D1Database, staffId: string, id: string) {
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE account_deletion_requests SET status = 'in_review', updated_at = ? WHERE id = ? AND status = 'requested'")
      .bind(now, id),
    db.prepare(
      `INSERT INTO account_deletion_events (id, request_id, status, actor_kind, staff_id, created_at)
       SELECT ?, id, 'in_review', 'staff', ?, ? FROM account_deletion_requests WHERE id = ? AND status = 'in_review'
       ON CONFLICT(request_id, status) DO NOTHING`,
    ).bind(eventId, staffId, now, id),
    db.prepare(
      `INSERT INTO staff_audit_logs (id, staff_id, action, entity_type, entity_id, detail)
       SELECT ?, ?, 'account.deletion_review_started', 'account-deletion-request', request_id, '{}' FROM account_deletion_events WHERE id = ?`,
    ).bind(crypto.randomUUID(), staffId, eventId),
  ]);
  const row = await db.prepare("SELECT * FROM account_deletion_requests WHERE id = ?").bind(id).first<RequestRow>();
  if (!row) throw new AccountDeletionError("Talep bulunamadı.", 404);
  if (row.status === "cancelled") throw new AccountDeletionError("İptal edilen talep yeniden incelemeye alınamaz.", 409);
  return (await withHistory(db, [row]))[0];
}
