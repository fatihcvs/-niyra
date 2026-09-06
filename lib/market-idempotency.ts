export type MarketWriteAction = "listing" | "inquiry" | "price";

type MarketWriteRecord = {
  owner_email: string;
  university_id: string;
  action: MarketWriteAction;
  payload_hash: string;
  target_id: string;
  response_json: string;
};

export type MarketWriteContext = {
  ownerEmail: string;
  universityId: string;
  key: string | null;
  action: MarketWriteAction;
  payloadHash: string;
};

export class MarketIdempotencyError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "MarketIdempotencyError";
  }
}

export function parseMarketIdempotencyKey(value: string | null) {
  if (value === null) return null;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new MarketIdempotencyError("Pazar işleminin tekrar anahtarı geçerli değil.", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return value;
}

/** The route passes normalized, ordered semantic fields, never the raw JSON body. */
export async function hashMarketPayload(universityId: string, action: MarketWriteAction, fields: readonly unknown[]) {
  const bytes = new TextEncoder().encode(JSON.stringify([1, universityId, action, ...fields]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function unavailableTarget(): never {
  throw new MarketIdempotencyError("Bu pazar kaydına artık erişilemiyor.", 404, "MARKET_TARGET_UNAVAILABLE");
}

function removedTarget(): never {
  throw new MarketIdempotencyError("Bu işlemle oluşturulan pazar kaydı kaldırıldı veya kapatıldı. Yeniden oluşturulmadı.", 410, "MARKET_TARGET_REMOVED");
}

/** A replay still requires the current campus, ownership and block relationships. */
export async function replayMarketWrite(db: D1Database, context: MarketWriteContext): Promise<Response | null> {
  if (context.key === null) return null;
  const record = await db.prepare(
    `SELECT owner_email, university_id, action, payload_hash, target_id, response_json
     FROM market_write_requests WHERE owner_email = ? AND idempotency_key = ?`,
  ).bind(context.ownerEmail, context.key).first<MarketWriteRecord>();
  if (!record) return null;
  if (record.university_id !== context.universityId) unavailableTarget();
  if (record.action !== context.action || record.payload_hash !== context.payloadHash) {
    throw new MarketIdempotencyError("Bu işlem anahtarı farklı bilgiler için kullanıldı. Yeni işlem için yeni anahtar gerekli.", 409, "IDEMPOTENCY_CONFLICT");
  }
  if (record.action === "listing") {
    const listing = await db.prepare("SELECT owner_email, university_id, status FROM marketplace_listings WHERE id = ?")
      .bind(record.target_id).first<{ owner_email: string; university_id: string; status: string }>();
    if (!listing) removedTarget();
    if (listing.owner_email !== context.ownerEmail || listing.university_id !== context.universityId) unavailableTarget();
    if (!["active", "reserved"].includes(listing.status)) removedTarget();
  } else if (record.action === "price") {
    const price = await db.prepare("SELECT reporter_email, university_id, status FROM campus_price_reports WHERE id = ?")
      .bind(record.target_id).first<{ reporter_email: string; university_id: string; status: string }>();
    if (!price) removedTarget();
    if (price.reporter_email !== context.ownerEmail || price.university_id !== context.universityId) unavailableTarget();
    if (price.status !== "active") removedTarget();
  } else {
    const inquiry = await db.prepare(
      `SELECT mi.sender_email, ml.owner_email, ml.university_id, ml.status AS listing_status,
         EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_email = ? AND b.blocked_email = ml.owner_email)
           OR (b.blocker_email = ml.owner_email AND b.blocked_email = ?)) AS blocked
       FROM marketplace_inquiries mi JOIN marketplace_listings ml ON ml.id = mi.listing_id WHERE mi.id = ?`,
    ).bind(context.ownerEmail, context.ownerEmail, record.target_id)
      .first<{ sender_email: string; owner_email: string; university_id: string; listing_status: string; blocked: number }>();
    if (!inquiry) removedTarget();
    if (inquiry.sender_email !== context.ownerEmail || inquiry.university_id !== context.universityId || inquiry.blocked) unavailableTarget();
    if (!["active", "reserved"].includes(inquiry.listing_status)) removedTarget();
  }
  return marketWriteResponse(JSON.parse(record.response_json), true, true);
}

export function marketWriteResponse(body: Record<string, unknown>, replayed: boolean, keyed: boolean) {
  return Response.json(keyed ? { ...body, idempotentReplay: replayed } : body, {
    status: 201,
    headers: { "Cache-Control": "private, no-store", "Idempotency-Replayed": String(replayed) },
  });
}

/** D1.batch rolls every statement back on failure, including a losing unique-key race. */
export async function commitMarketWrite(
  db: D1Database,
  context: MarketWriteContext,
  targetId: string,
  body: Record<string, unknown>,
  statements: D1PreparedStatement[],
) {
  const ledger = context.key === null ? [] : [db.prepare(
    `INSERT INTO market_write_requests (owner_email, idempotency_key, university_id, action, payload_hash, target_id, response_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(context.ownerEmail, context.key, context.universityId, context.action, context.payloadHash, targetId, JSON.stringify(body))];
  try {
    await db.batch([...ledger, ...statements]);
  } catch (error) {
    // Covers both UNIQUE races and a committed transaction whose acknowledgement was lost.
    const replay = await replayMarketWrite(db, context);
    if (replay) return replay;
    throw error;
  }
  return marketWriteResponse(body, false, context.key !== null);
}
