import { createSecureRandomKey } from "./secure-random-key";
import { hasNativePush, nativePushRequest } from "./native-push-client";

export type PushConfiguration = {
  webPush: { available: boolean; publicKey: string | null };
  nativePush: { available: boolean };
  subscriptions: { id: string; kind: "web" | "fcm"; deviceId: string; subscriptionFingerprint?: string }[];
};
export type PushBrowserSupport = "supported" | "insecure" | "unsupported";
const DEVICE_KEY = "kampira-push-device-v1";
let operationEpoch = 0;
let logoutEpoch = -1;

/** A service-worker revocation message also cancels dialogs open in sibling tabs. */
export function invalidatePushEnrollment() { operationEpoch++; }

async function bounded<T>(work: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Bildirim hizmeti zamanında yanıt vermedi. Durumu yenileyip tekrar dene.")), milliseconds); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

async function supportsPushWorker(registration: ServiceWorkerRegistration) {
  if (!registration.active || !("MessageChannel" in window)) throw new Error("Bildirimleri açmadan önce Kampira’nın tüm sekmelerini kapatıp yeniden aç.");
  const channel = new window.MessageChannel();
  try {
    const reply = new Promise<boolean>((resolve) => { channel.port1.onmessage = (event) => resolve(event.data?.pushVersion === 1); });
    registration.active.postMessage({ type: "KAMPIRA_PUSH_CHECK" }, [channel.port2]);
    if (!await bounded(reply, 3_000)) throw new Error("Bildirimleri açmadan önce Kampira’nın tüm sekmelerini kapatıp yeniden aç.");
  } catch { throw new Error("Bildirimleri açmadan önce Kampira’nın tüm sekmelerini kapatıp yeniden aç."); }
  finally { channel.port1.close(); channel.port2.close(); }
}

export function pushBrowserSupport(): PushBrowserSupport {
  if (typeof window === "undefined" || !window.isSecureContext) return "insecure";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}

/** Random installation metadata only. Never stores a session, endpoint or push encryption keys. */
export function pushDeviceId(create = false): string | null {
  const stored = window.localStorage.getItem(DEVICE_KEY);
  if (stored && /^web:[a-f0-9-]{36}$/.test(stored)) return stored;
  if (!create) return null;
  const id = `web:${createSecureRandomKey()}`;
  window.localStorage.setItem(DEVICE_KEY, id);
  if (window.localStorage.getItem(DEVICE_KEY) !== id) throw new Error("Bu cihazın bildirim ayarı kaydedilemedi.");
  return id;
}

export async function readPushConfiguration(transport: typeof fetch, accountId: string, signal?: AbortSignal): Promise<PushConfiguration> {
  const response = await bounded(transport("/api/push-subscriptions", { credentials: "same-origin", cache: "no-store", signal, headers: { "X-Account-Context": accountId } }));
  const body = await bounded(response.json());
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Cihaz bildirimleri kontrol edilemedi.");
  if (typeof body?.webPush?.available !== "boolean" || !Array.isArray(body?.subscriptions)) throw new Error("Bildirim ayarı doğrulanamadı.");
  return body;
}

function applicationKey(value: string) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(value)) throw new Error("Bildirim hizmetinin ayarı doğrulanamadı.");
  const decoded = window.atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
  const bytes = Uint8Array.from(decoded, (letter) => letter.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("Bildirim hizmetinin ayarı doğrulanamadı.");
  return bytes;
}

/** An installation ID alone does not prove the browser still owns the server's endpoint/key generation. */
export async function isRegisteredBrowserPush(config: PushConfiguration, subscription: PushSubscription, deviceId: string | null) {
  if (!deviceId || !config.webPush.publicKey) return false;
  const configuredKey = applicationKey(config.webPush.publicKey), actualKey = subscription.options?.applicationServerKey;
  if (!actualKey || new Uint8Array(actualKey).length !== configuredKey.length || new Uint8Array(actualKey).some((byte, index) => byte !== configuredKey[index])) return false;
  const json = subscription.toJSON();
  if (typeof json.endpoint !== "string" || typeof json.keys?.p256dh !== "string" || typeof json.keys?.auth !== "string") return false;
  const data = new window.TextEncoder().encode(JSON.stringify(["web", json.endpoint, json.keys.p256dh, json.keys.auth]));
  const fingerprint = Array.from(new Uint8Array(await window.crypto.subtle.digest("SHA-256", data)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return config.subscriptions.some((item) => item.kind === "web" && item.deviceId === deviceId && item.subscriptionFingerprint === fingerprint);
}

function assertCurrent(current: () => boolean) {
  if (!current()) throw new DOMException("Bildirim işlemi artık aktif değil.", "AbortError");
}

async function closeVisible(registration: ServiceWorkerRegistration) {
  for (const notice of await registration.getNotifications()) if (notice.tag.startsWith("kampira:")) notice.close();
}

export async function enableBrowserPush(options: {
  transport: typeof fetch; accountId: string; publicKey: string;
  permission: Promise<NotificationPermission>; isCurrent: () => boolean;
}) {
  const epoch = ++operationEpoch;
  const current = () => operationEpoch === epoch && options.isCurrent();
  const permission = await options.permission;
  assertCurrent(current);
  if (permission !== "granted") return { enabled: false as const, permission };
  const deviceId = pushDeviceId(true)!;
  const key = applicationKey(options.publicKey);
  await bounded(navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
  assertCurrent(current);
  const registration = await bounded(navigator.serviceWorker.ready);
  assertCurrent(current);
  await supportsPushWorker(registration);
  assertCurrent(current);
  let subscription = await bounded(registration.pushManager.getSubscription());
  assertCurrent(current);
  if (subscription) {
    const previousKey = subscription.options?.applicationServerKey;
    if (!previousKey || new Uint8Array(previousKey).length !== key.length || new Uint8Array(previousKey).some((byte, index) => byte !== key[index])) {
      if (!await bounded(subscription.unsubscribe())) throw new Error("Önceki bildirim kaydı yenilenemedi. Tekrar dene.");
      subscription = null;
    }
  }
  assertCurrent(current);
  if (!subscription) {
    const pending = registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    void pending.then(async (value) => { if (!current() && operationEpoch === logoutEpoch) await value.unsubscribe(); }).catch(() => {});
    subscription = await bounded(pending);
  }
  if (!current()) {
    // A permission/subscribe dialog can resolve after logout. Never register it to
    // a later account; remove it only while no newer enrollment has taken over.
    assertCurrent(current);
  }
  const response = await bounded(options.transport("/api/push-subscriptions", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", "X-Account-Context": options.accountId },
    body: JSON.stringify({ kind: "web", subscription: subscription.toJSON(), deviceId }),
  }));
  assertCurrent(current);
  const body = await bounded(response.json());
  assertCurrent(current);
  if (!response.ok || body?.enabled !== true || typeof body.id !== "string") throw new Error(typeof body?.error === "string" ? body.error : "Bildirim kaydı doğrulanamadı. Durumu kontrol edip tekrar deneyebilirsin.");
  return { enabled: true as const, permission, id: body.id, deviceId };
}

export async function disableBrowserPush(transport: typeof fetch, accountId: string, isCurrent: () => boolean) {
  const epoch = ++operationEpoch;
  const current = () => operationEpoch === epoch && isCurrent();
  const deviceId = pushDeviceId();
  const response = await bounded(transport("/api/push-subscriptions", {
    method: "DELETE", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json", "X-Account-Context": accountId },
    body: JSON.stringify(deviceId ? { deviceId } : {}),
  }));
  assertCurrent(current);
  const body = await bounded(response.json());
  assertCurrent(current);
  if (!response.ok || body?.deleted !== true) throw new Error(typeof body?.error === "string" ? body.error : "Bildirimler kapatılamadı. Tekrar deneyebilirsin.");
  const registration = await bounded(navigator.serviceWorker.getRegistration("/"));
  if (registration) {
    registration.active?.postMessage({ type: "KAMPIRA_PUSH_CLEAR" });
    await bounded(closeVisible(registration));
    const subscription = await bounded(registration.pushManager.getSubscription());
    if (subscription && !(await bounded(subscription.unsubscribe()))) throw new Error("Bildirim gönderimi kapatıldı; tarayıcı kaydını temizlemek için tekrar dene.");
  }
}

/** Call after successful server logout. Server session deletion is the revocation authority. */
export async function clearPushNotificationsOnLogout(): Promise<{ cleared: boolean }> {
  logoutEpoch = ++operationEpoch;
  const nativeCleared = !hasNativePush() || await nativePushRequest("clear").then((reply) => !reply.enabled && reply.state !== "error").catch(() => false);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return { cleared: nativeCleared };
  try {
    const registration = await bounded(navigator.serviceWorker.getRegistration("/"));
    if (!registration) return { cleared: nativeCleared };
    registration.active?.postMessage({ type: "KAMPIRA_PUSH_CLEAR" });
    registration.waiting?.postMessage({ type: "KAMPIRA_PUSH_CLEAR" });
    await bounded(closeVisible(registration));
    const subscription = await bounded(registration.pushManager?.getSubscription());
    const browserCleared = !subscription || await bounded(subscription.unsubscribe());
    return { cleared: nativeCleared && browserCleared };
  } catch { return { cleared: false }; }
}
