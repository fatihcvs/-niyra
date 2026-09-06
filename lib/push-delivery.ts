import webPush from "web-push";
import type { PushConfig } from "./push-config";
import { readPushReceipt, validPushEndpoint, type PushPayload, type StoredPushSubscription } from "./push-subscriptions";

type Transport = typeof fetch;
type Delivery = { id: string; notification_id: string; subscription_id: string; attempts: number; expires_ms: number };
type ProviderResult = { status: number; expired?: boolean; retryAfter?: number };
const tokenCache = new Map<string, { value: string; expires: number }>();
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

async function providerFetch(transport: Transport, url: string, options: RequestInit) {
  // The pinned workerd runtime rejects redirect:"error" before networking.
  // Inspect the first response ourselves so credentials never follow Location.
  const response = await transport(url, { ...options, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("Push provider redirect rejected");
  }
  return response;
}

async function fcmAccessToken(config: NonNullable<PushConfig["fcm"]>, transport: Transport, now: number) {
  const fingerprint = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${config.clientEmail}:${config.privateKey}`))));
  const cached = tokenCache.get(fingerprint);
  if (cached && cached.expires > now + 60_000) return cached.value;
  const pem = config.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (character) => character.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const header = base64(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64(new TextEncoder().encode(JSON.stringify({ iss: config.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 })));
  const unsigned = `${header}.${claims}`;
  const signature = base64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))));
  const response = await providerFetch(transport, "https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }).toString() });
  if (!response.ok) throw new Error("Push provider authorization unavailable");
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || payload.access_token.length > 8192 || !payload.access_token || !Number.isFinite(Number(payload.expires_in))) throw new Error("Invalid push provider authorization");
  if (tokenCache.size >= 8) tokenCache.clear();
  tokenCache.set(fingerprint, { value: payload.access_token, expires: now + Math.min(3600, Math.max(0, Number(payload.expires_in))) * 1000 });
  return payload.access_token;
}

function retryAfter(response: Response, now: number) {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.min(3600, Math.max(30, seconds)) : undefined;
}

export async function sendPushMessage(subscription: StoredPushSubscription, payload: PushPayload, config: PushConfig, transport: Transport = fetch, now = Date.now()): Promise<ProviderResult> {
  if (subscription.kind === "web") {
    if (!config.web || !validPushEndpoint(subscription.endpoint) || !subscription.p256dh || !subscription.auth) return { status: 400, expired: true };
    // The maintained library handles RFC8291 encryption and VAPID signing only.
    // Our allowlisted fetch transport never follows a provider redirect.
    const request = webPush.generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), {
      vapidDetails: config.web, contentEncoding: "aes128gcm", TTL: 300, urgency: "normal",
    });
    const response = await providerFetch(transport, request.endpoint, { method: "POST", headers: request.headers, body: request.body ? new Uint8Array(request.body) : undefined,
      signal: AbortSignal.timeout(10_000) });
    return { status: response.status, expired: response.status === 404 || response.status === 410, retryAfter: retryAfter(response, now) };
  }
  if (!config.fcm || !subscription.token) return { status: 400, expired: true };
  const token = await fcmAccessToken(config.fcm, transport, now);
  // Data-only FCM delivery lets the native receiver revalidate the current account
  // before display. A notification payload would auto-display on a locked device.
  const response = await providerFetch(transport, `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.fcm.projectId)}/messages:send`, {
    method: "POST", signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token: subscription.token, data: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)])), android: { priority: "high", ttl: "300s" } } }),
  });
  let expired = false;
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: { details?: { errorCode?: string }[] } } | null;
    expired = Boolean(error?.error?.details?.some((detail) => detail.errorCode === "UNREGISTERED"));
    if (response.status === 401) tokenCache.clear();
  }
  return { status: response.status, expired, retryAfter: retryAfter(response, now) };
}

export async function dispatchPushOutbox(db: D1Database, config: PushConfig, options: { fetch?: Transport; now?: () => number; limit?: number; concurrency?: number } = {}) {
  const counts = { claimed: 0, sent: 0, retried: 0, expired: 0, suppressed: 0, disabled: 0 };
  if (!config.web && !config.fcm) { counts.disabled = 1; return counts; }
  const now = options.now ?? Date.now;
  const transport = options.fetch ?? fetch;
  const limit = Math.min(20, Math.max(1, Math.floor(options.limit ?? 20)));
  await db.prepare(`UPDATE push_deliveries SET state = 'expired', finished_ms = ?, lease_token = NULL, lease_until_ms = NULL
    WHERE state IN ('pending', 'sending') AND (expires_ms <= ? OR (attempts >= 8 AND (state = 'pending' OR lease_until_ms <= ?)))`)
    .bind(now(), now(), now()).run();
  await db.prepare("DELETE FROM push_deliveries WHERE finished_ms IS NOT NULL AND finished_ms < ?").bind(now() - 7 * 86400_000).run();
  const candidates = await db.prepare(`SELECT delivery.id FROM push_deliveries delivery JOIN push_subscriptions subscription ON subscription.id = delivery.subscription_id
    WHERE delivery.expires_ms > ? AND delivery.attempts < 8 AND delivery.next_attempt_ms <= ?
      AND (delivery.state = 'pending' OR (delivery.state = 'sending' AND delivery.lease_until_ms <= ?))
      AND ((subscription.kind = 'web' AND ? = 1) OR (subscription.kind = 'fcm' AND ? = 1))
    ORDER BY delivery.next_attempt_ms, delivery.id LIMIT ?`).bind(now(), now(), now(), config.web ? 1 : 0, config.fcm ? 1 : 0, limit).all<{ id: string }>();
  let cursor = 0;
  async function drain() {
    while (cursor < candidates.results.length) {
      const candidate = candidates.results[cursor++];
      const lease = crypto.randomUUID();
      const delivery = await db.prepare(`UPDATE push_deliveries SET state = 'sending', lease_token = ?, lease_until_ms = ?, attempts = attempts + 1
        WHERE id = ? AND expires_ms > ? AND attempts < 8 AND next_attempt_ms <= ?
          AND (state = 'pending' OR (state = 'sending' AND lease_until_ms <= ?))
        RETURNING id, notification_id, subscription_id, attempts, expires_ms`)
        .bind(lease, now() + 60_000, candidate.id, now(), now(), now()).first<Delivery>();
      if (!delivery) continue;
      counts.claimed++;
      const payload = await readPushReceipt(db, delivery.notification_id, delivery.subscription_id, undefined, now());
      const subscription = payload ? await db.prepare("SELECT * FROM push_subscriptions WHERE id = ?").bind(delivery.subscription_id).first<StoredPushSubscription>() : null;
      if (!payload || !subscription) {
        await db.prepare("UPDATE push_deliveries SET state = 'suppressed', finished_ms = ?, lease_token = NULL, lease_until_ms = NULL WHERE id = ? AND lease_token = ?")
          .bind(now(), delivery.id, lease).run(); counts.suppressed++; continue;
      }
      let result: ProviderResult;
      try { result = await sendPushMessage(subscription, payload, config, transport, now()); }
      catch { result = { status: 0 }; }
      if (result.expired) {
        // Scope deletion to the exact subscription generation, never its replacement.
        await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run(); counts.expired++; continue;
      }
      const sent = result.status >= 200 && result.status < 300;
      const transient = result.status === 0 || result.status === 429 || result.status >= 500 || result.status === 401 || result.status === 403;
      const seconds = result.retryAfter ?? Math.min(3600, 30 * 2 ** (delivery.attempts - 1));
      const retry = !sent && transient && delivery.attempts < 8 && now() + seconds * 1000 < delivery.expires_ms;
      await db.prepare(`UPDATE push_deliveries SET state = ?, next_attempt_ms = ?, last_status = ?, finished_ms = ?, lease_token = NULL, lease_until_ms = NULL
        WHERE id = ? AND lease_token = ?`).bind(sent ? "sent" : retry ? "pending" : "expired", now() + seconds * 1000, result.status, retry ? null : now(), delivery.id, lease).run();
      if (sent) counts.sent++; else if (retry) counts.retried++; else counts.expired++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, options.concurrency ?? 2), candidates.results.length) }, drain));
  return counts;
}
