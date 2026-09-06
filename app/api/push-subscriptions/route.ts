import { getActiveSessionContext, sameOriginRequest } from "../../../lib/app-auth";
import { enforceRateLimit, getRuntime, rateLimitResponse } from "../../../lib/server-api";
import { getPushConfig } from "../../../lib/push-config";
import { PushError, readPushReceipt, registerPushSubscription, revokePushSubscriptions, webPushFingerprint } from "../../../lib/push-subscriptions";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => error instanceof PushError
  ? json({ error: error.message, code: error.code }, error.status)
  : json({ error: "Cihaz bildirimi ayarları şu anda tamamlanamadı." }, 503);

async function readBody(request: Request, maximum: number) {
  if (Number(request.headers.get("Content-Length") ?? 0) > maximum) throw new PushError("Bildirim ayarları çok büyük.", 413);
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  while (true) {
    const result = await reader.read();
    if (result.done) return text + decoder.decode();
    bytes += result.value.byteLength;
    if (bytes > maximum) { await reader.cancel(); throw new PushError("Bildirim ayarları çok büyük.", 413); }
    text += decoder.decode(result.value, { stream: true });
  }
}

async function context(request: Request) {
  if (!sameOriginRequest(request)) throw new PushError("Güvenli olmayan talep reddedildi.", 403, "PUSH_ORIGIN_MISMATCH");
  const { DB } = await getRuntime();
  const session = await getActiveSessionContext(DB, request.headers);
  if (!session) throw new PushError("Cihaz bildirimleri için giriş yapmalısın.", 401, "PUSH_SESSION_REQUIRED");
  if (request.headers.get("X-Account-Context") !== session.publicId) throw new PushError("Hesabın değişti. Sayfayı yenileyip tekrar dene.", 409, "PUSH_ACCOUNT_CHANGED");
  return { DB, session };
}

export async function GET(request: Request) {
  try {
    const { DB, session } = await context(request);
    const params = new URL(request.url).searchParams;
    if (params.has("notificationId") || params.has("subscriptionId")) {
      const notificationId = params.get("notificationId") ?? "", subscriptionId = params.get("subscriptionId") ?? "";
      if (!/^[A-Za-z0-9._:-]{1,80}$/.test(notificationId) || !/^[A-Za-z0-9._:-]{1,80}$/.test(subscriptionId)) return json({ receipt: null });
      const purpose = params.get("purpose") === "click" ? "click" : "receive";
      return json({ receipt: await readPushReceipt(DB, notificationId, subscriptionId, session, Date.now(), purpose) });
    }
    const { env } = await import("cloudflare:workers");
    const config = getPushConfig(env);
    const subscriptions = await DB.prepare("SELECT id, kind, device_id AS deviceId, endpoint, p256dh, auth FROM push_subscriptions WHERE owner_email = ? AND session_hash = ? ORDER BY created_at, id")
      .bind(session.email, session.tokenHash).all<{ id: string; kind: string; deviceId: string; endpoint: string | null; p256dh: string | null; auth: string | null }>();
    const metadata = await Promise.all(subscriptions.results.map(async (row) => ({ id: row.id, kind: row.kind, deviceId: row.deviceId,
      ...(row.kind === "web" && row.endpoint && row.p256dh && row.auth ? { subscriptionFingerprint: await webPushFingerprint(row.endpoint, row.p256dh, row.auth) } : {}) })));
    return json({ webPush: { available: Boolean(config.web), publicKey: config.web?.publicKey ?? null }, nativePush: { available: Boolean(config.fcm) }, subscriptions: metadata });
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  try {
    const { DB, session } = await context(request);
    const raw = await readBody(request, 12_000);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { throw new PushError("Bildirim ayarları okunamadı."); }
    const { env } = await import("cloudflare:workers");
    const config = getPushConfig(env);
    const limit = await enforceRateLimit(DB, session.email, "push-subscription", 30, 3600);
    if (!limit.allowed) { const response = rateLimitResponse(limit.retryAfter); response.headers.set("Cache-Control", "private, no-store"); return response; }
    return json(await registerPushSubscription(DB, config, session, payload), 201);
  } catch (error) { return failed(error); }
}

export async function DELETE(request: Request) {
  try {
    const { DB, session } = await context(request);
    const raw = await readBody(request, 1024);
    let payload: { id?: unknown; deviceId?: unknown } = {};
    try { if (raw) payload = JSON.parse(raw); } catch { throw new PushError("Bildirim ayarları okunamadı."); }
    if (!payload || typeof payload !== "object") throw new PushError("Bildirim ayarları okunamadı.");
    if (payload.id !== undefined && (typeof payload.id !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(payload.id))) throw new PushError("Bildirim aboneliği geçerli değil.");
    if (payload.deviceId !== undefined && (typeof payload.deviceId !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(payload.deviceId))) throw new PushError("Cihaz kimliği geçerli değil.");
    if (payload.deviceId !== undefined) {
      const limit = await enforceRateLimit(DB, session.email, "push-subscription-revoke", 60, 3600);
      if (!limit.allowed) { const response = rateLimitResponse(limit.retryAfter); response.headers.set("Cache-Control", "private, no-store"); return response; }
    }
    return json(await revokePushSubscriptions(DB, session, payload as { id?: string; deviceId?: string }));
  } catch (error) { return failed(error); }
}
