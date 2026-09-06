import type { PushConfig } from "./push-config";
import { pushTargetHref } from "./push-target-access";

export class PushError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_PUSH_SUBSCRIPTION") { super(message); }
}
export type PushSession = { email: string; publicId: string; tokenHash: string };
export type PushPayload = { v: 1; title: string; body: string; tag: string; notificationId: string; subscriptionId: string; href: string; accountId: string };
export type StoredPushSubscription = { id: string; owner_email: string; session_hash: string; kind: "web" | "fcm"; endpoint: string | null; p256dh: string | null; auth: string | null; token: string | null };

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    if (url.hostname === "fcm.googleapis.com") return !url.search && /^\/(?:fcm\/send|wp)\/[A-Za-z0-9:_-]+$/.test(url.pathname);
    if (url.hostname === "updates.push.services.mozilla.com") return !url.search && /^\/wpush\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname);
    if (url.hostname === "web.push.apple.com") return !url.search && /^\/[A-Za-z0-9._~-]+$/.test(url.pathname);
    return /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname) && url.pathname === "/w/"
      && [...url.searchParams.keys()].length === 1 && Boolean(url.searchParams.get("token"));
  } catch { return false; }
}

const field = (value: unknown, pattern: RegExp) => typeof value === "string" && pattern.test(value);
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function webPushFingerprint(endpoint: string, p256dh: string, auth: string) {
  return digest(JSON.stringify(["web", endpoint, p256dh, auth]));
}

async function deviceRetired(db: D1Database, session: PushSession, deviceId: string) {
  return Boolean(await db.prepare("SELECT device_id FROM push_device_revocations WHERE session_hash = ? AND device_id = ?")
    .bind(session.tokenHash, deviceId).first());
}

export async function registerPushSubscription(db: D1Database, config: PushConfig, session: PushSession, payload: unknown) {
  if (!payload || typeof payload !== "object") throw new PushError("Bildirim ayarları okunamadı.");
  const body = payload as Record<string, unknown>;
  if (!field(body.deviceId, /^[A-Za-z0-9._:-]{8,128}$/)) throw new PushError("Cihaz kimliği geçerli değil.");
  const kind = body.kind;
  if (kind !== "web" && kind !== "fcm") throw new PushError("Bildirim türü desteklenmiyor.");
  if (!(kind === "web" ? config.web : config.fcm)) throw new PushError("Cihaz bildirimleri henüz hazırlanıyor.", 503, "PUSH_UNAVAILABLE");
  let endpoint: string | null = null, p256dh: string | null = null, auth: string | null = null, token: string | null = null;
  if (kind === "web") {
    const subscription = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
    if (!subscription || !validPushEndpoint(subscription.endpoint)) throw new PushError("Bildirim sağlayıcısının adresi desteklenmiyor.");
    if (!field(subscription.keys?.p256dh, /^[A-Za-z0-9_-]{87}$/) || !field(subscription.keys?.auth, /^[A-Za-z0-9_-]{22}$/)) throw new PushError("Bildirim anahtarları geçerli değil.");
    endpoint = subscription.endpoint; p256dh = subscription.keys!.p256dh as string; auth = subscription.keys!.auth as string;
    try {
      const key = Uint8Array.from(atob(p256dh.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
      await crypto.subtle.importKey("raw", key, { name: "ECDH", namedCurve: "P-256" }, false, []);
    } catch { throw new PushError("Bildirim şifreleme anahtarı geçerli değil."); }
  } else {
    if (!field(body.token, /^[A-Za-z0-9:_-]{32,4096}$/)) throw new PushError("Cihaz bildirim anahtarı geçerli değil.");
    token = body.token as string;
  }
  const endpointHash = await digest(`${kind}:${endpoint ?? token}`);
  if (kind === "fcm" && await deviceRetired(db, session, body.deviceId as string)) {
    throw new PushError("Bu bildirim bağlantısı kapatıldı. Yeniden açarak yeni bağlantı kurabilirsin.", 410, "PUSH_DEVICE_RETIRED");
  }
  const existing = await db.prepare("SELECT id, owner_email, session_hash, device_id, p256dh, auth FROM push_subscriptions WHERE endpoint_hash = ?")
    .bind(endpointHash).first<{ id: string; owner_email: string; session_hash: string; device_id: string; p256dh: string | null; auth: string | null }>();
  if (existing) {
    if (existing.owner_email !== session.email || existing.session_hash !== session.tokenHash || existing.device_id !== body.deviceId) {
      throw new PushError("Bu cihaz bildirimi başka bir oturuma bağlı. Bildirim aboneliğini yenileyebilirsin.", 409, "PUSH_SESSION_CONFLICT");
    }
    if (existing.p256dh === p256dh && existing.auth === auth) return { id: existing.id, kind, enabled: true };
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE owner_email = ?").bind(session.email).first<{ count: number }>();
  const currentDevice = await db.prepare("SELECT id, kind, endpoint_hash FROM push_subscriptions WHERE owner_email = ? AND session_hash = ? AND device_id = ?")
    .bind(session.email, session.tokenHash, body.deviceId as string).first<{ id: string; kind: string; endpoint_hash: string }>();
  if (currentDevice && (currentDevice.kind !== kind || kind === "fcm" && currentDevice.endpoint_hash !== endpointHash)) {
    throw new PushError("Cihaz bağlantısı değişti. Yeni bildirim bağlantısı kurabilirsin.", 409, "PUSH_DEVICE_CHANGED");
  }
  if (!currentDevice && !existing && Number(count?.count ?? 0) >= 12) throw new PushError("En fazla 12 cihazda bildirim açabilirsin.", 409, "PUSH_DEVICE_LIMIT");
  const id = crypto.randomUUID();
  let commitError: unknown;
  try {
    // Exact concurrent retries preserve their winning generation and queued deliveries.
    // Only a real token/key rotation removes the previous generation.
    await db.batch([
      db.prepare(`DELETE FROM push_subscriptions WHERE owner_email = ? AND session_hash = ? AND device_id = ?
        AND kind = 'web' AND ? = 'web' AND NOT (endpoint_hash = ? AND kind = ? AND p256dh IS ? AND auth IS ?)`)
        .bind(session.email, session.tokenHash, body.deviceId as string, kind, endpointHash, kind, p256dh, auth),
      db.prepare(`INSERT INTO push_subscriptions (id, owner_email, session_hash, device_id, kind, endpoint_hash, endpoint, p256dh, auth, token)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_sessions session JOIN users user ON user.email = session.user_email
          WHERE session.token_hash = ? AND session.user_email = ? AND datetime(session.expires_at) > CURRENT_TIMESTAMP AND user.status = 'active')
          AND (SELECT COUNT(*) FROM push_subscriptions WHERE owner_email = ?) < 12
          AND (? != 'fcm' OR (NOT EXISTS (SELECT 1 FROM push_device_revocations WHERE session_hash = ? AND device_id = ?)
            AND (SELECT COUNT(*) FROM push_device_revocations WHERE session_hash = ?) < 512))
          AND NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE owner_email = ? AND session_hash = ? AND device_id = ?)`)
        .bind(id, session.email, session.tokenHash, body.deviceId as string, kind, endpointHash, endpoint, p256dh, auth, token,
          session.tokenHash, session.email, session.email, kind, session.tokenHash, body.deviceId as string, session.tokenHash,
          session.email, session.tokenHash, body.deviceId as string),
    ]);
  } catch (error) { commitError = error; }
  // Read the canonical generation, including a committed batch whose acknowledgement was lost.
  const created = await db.prepare(`SELECT id FROM push_subscriptions WHERE owner_email = ? AND session_hash = ? AND device_id = ?
    AND endpoint_hash = ? AND kind = ? AND p256dh IS ? AND auth IS ?`)
    .bind(session.email, session.tokenHash, body.deviceId as string, endpointHash, kind, p256dh, auth).first<{ id: string }>();
  if (created) return { id: created.id, kind, enabled: true };
  const active = await db.prepare(`SELECT session.token_hash FROM user_sessions session JOIN users user ON user.email = session.user_email
    WHERE session.token_hash = ? AND session.user_email = ? AND datetime(session.expires_at) > CURRENT_TIMESTAMP AND user.status = 'active'`)
    .bind(session.tokenHash, session.email).first<{ token_hash: string }>();
  if (!active) throw new PushError("Bildirimleri açmak için tekrar giriş yapmalısın.", 401, "PUSH_SESSION_EXPIRED");
  if (kind === "fcm" && await deviceRetired(db, session, body.deviceId as string)) {
    throw new PushError("Bu bildirim bağlantısı kapatıldı. Yeniden açarak yeni bağlantı kurabilirsin.", 410, "PUSH_DEVICE_RETIRED");
  }
  if (commitError) throw commitError;
  throw new PushError("Cihaz bildirim ayarı başka bir işlemde değişti veya cihaz sınırına ulaşıldı. Durumunu yenileyebilirsin.", 409, "PUSH_REGISTRATION_CHANGED");
}

export async function revokePushSubscriptions(db: D1Database, session: PushSession, target: { id?: string; deviceId?: string }) {
  const statements: D1PreparedStatement[] = [];
  if (target.deviceId) {
    // The missing-row case is intentional: a prior POST may still be in flight.
    // Bound unknown identities; already registered devices can always be retired.
    statements.push(db.prepare(`INSERT OR IGNORE INTO push_device_revocations (session_hash, device_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM user_sessions WHERE token_hash = ? AND user_email = ?)
        AND ((SELECT COUNT(*) FROM push_device_revocations WHERE session_hash = ?) < 512
          OR EXISTS (SELECT 1 FROM push_subscriptions WHERE session_hash = ? AND device_id = ?))`)
      .bind(session.tokenHash, target.deviceId, session.tokenHash, session.email, session.tokenHash, session.tokenHash, target.deviceId));
  }
  statements.push(db.prepare(`DELETE FROM push_subscriptions WHERE owner_email = ? AND session_hash = ?
    AND (? IS NULL OR id = ?) AND (? IS NULL OR device_id = ?)`)
    .bind(session.email, session.tokenHash, target.id ?? null, target.id ?? null, target.deviceId ?? null, target.deviceId ?? null));
  let commitError: unknown;
  try { await db.batch(statements); } catch (error) { commitError = error; }
  const remaining = await db.prepare(`SELECT id FROM push_subscriptions WHERE owner_email = ? AND session_hash = ?
    AND (? IS NULL OR id = ?) AND (? IS NULL OR device_id = ?)`)
    .bind(session.email, session.tokenHash, target.id ?? null, target.id ?? null, target.deviceId ?? null, target.deviceId ?? null).first();
  const retired = !target.deviceId || await deviceRetired(db, session, target.deviceId);
  if (!remaining && retired) return { deleted: true };
  if (commitError) throw commitError;
  throw new PushError("Bildirim bağlantısının kapatılması doğrulanamadı. Tekrar deneyebilirsin.", 503, "PUSH_REVOCATION_PENDING");
}

export async function readPushReceipt(db: D1Database, notificationId: string, subscriptionId: string, session?: PushSession, now = Date.now(), purpose: "receive" | "click" = "receive"): Promise<PushPayload | null> {
  // Reading a notification stops new alerts; it does not revoke an existing alert's
  // destination. Only an authenticated click may resolve that already-read target.
  const allowRead = purpose === "click" && Boolean(session);
  const row = await db.prepare(`SELECT notification.id, notification.entity_type, notification.entity_id, recipient.public_id, actor.public_id AS actor_id,
      subscription.owner_email, subscription.session_hash
    FROM push_subscriptions subscription JOIN user_sessions session ON session.token_hash = subscription.session_hash
    JOIN users recipient ON recipient.email = subscription.owner_email
    JOIN notifications notification ON notification.id = ? AND notification.user_email = subscription.owner_email
    JOIN push_deliveries delivery ON delivery.notification_id = notification.id AND delivery.subscription_id = subscription.id
    LEFT JOIN users actor ON actor.email = notification.actor_email
    LEFT JOIN notification_preferences preference ON preference.user_email = recipient.email
    WHERE subscription.id = ? AND recipient.status = 'active' AND session.user_email = recipient.email
      AND datetime(session.expires_at) > CURRENT_TIMESTAMP AND (? = 1 OR notification.read_at IS NULL)
      AND delivery.expires_ms > ? AND delivery.state NOT IN ('expired', 'suppressed')
      AND (notification.actor_email IS NULL OR notification.actor_email != recipient.email)
      AND NOT EXISTS (SELECT 1 FROM user_blocks block WHERE
        (block.blocker_email = recipient.email AND block.blocked_email = notification.actor_email)
        OR (block.blocker_email = notification.actor_email AND block.blocked_email = recipient.email))
      AND CASE notification.kind WHEN 'course' THEN COALESCE(preference.courses, 1)
        WHEN 'community' THEN COALESCE(preference.communities, 1) ELSE COALESCE(preference.interactions, 1) END = 1`)
    .bind(notificationId, subscriptionId, allowRead ? 1 : 0, now).first<{ id: string; entity_type: string | null; entity_id: string | null; public_id: string; actor_id: string | null; owner_email: string; session_hash: string }>();
  if (!row || !row.public_id || (session && (row.owner_email !== session.email || row.session_hash !== session.tokenHash || row.public_id !== session.publicId))) return null;
  const href = await pushTargetHref(db, row.owner_email, row.entity_type, row.entity_id, row.actor_id);
  if (!href) return null;
  return { v: 1, title: "Kampira", body: "Yeni bir bildirimin var.", tag: `kampira:${row.id}`, notificationId: row.id,
    subscriptionId, accountId: row.public_id, href };
}
