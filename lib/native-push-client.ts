import { createSecureRandomKey } from "./secure-random-key";

type NativePushBridge = { postMessage: (value: string) => void; onmessage?: ((event: { data: string }) => void) | null };
declare global { interface Window { KampiraPush?: NativePushBridge } }
export type NativePushStatus = {
  protocolVersion: 1; id: string; accountId: string;
  state: "unavailable" | "denied" | "off" | "on" | "error" | "busy";
  available: boolean; permission: "granted" | "denied" | "prompt"; enabled: boolean; message?: string;
};
type Pending = { accountId: string; finish: (reply: NativePushStatus | Error) => void };
let bound: NativePushBridge | undefined;
const pending = new Map<string, Pending>();

export function hasNativePush() { return typeof window !== "undefined" && typeof window.KampiraPush?.postMessage === "function"; }

/** The exact-origin native bridge exposes status/commands only, never its FCM token or cookies. */
export function nativePushRequest(command: "status" | "enable" | "disable" | "clear", accountId = ""): Promise<NativePushStatus> {
  if (!hasNativePush()) return Promise.reject(new Error("Bu uygulama sürümü cihaz bildirimlerini desteklemiyor."));
  if (command !== "clear" && !/^[A-Za-z0-9_-]{1,160}$/.test(accountId)) return Promise.reject(new Error("Bildirim hesabı doğrulanamadı."));
  const bridge = window.KampiraPush!;
  if (bound !== bridge) {
    for (const request of pending.values()) request.finish(new Error("Bildirim bağlantısı yenilendi. Tekrar dene."));
    bound = bridge;
    bridge.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 2048) return;
      let reply: NativePushStatus;
      try { reply = JSON.parse(event.data) as NativePushStatus; } catch { return; }
      if (!reply || typeof reply.id !== "string") return;
      const request = pending.get(reply.id);
      if (!request || typeof reply.accountId !== "string" || reply.accountId !== request.accountId) return;
      if (reply.protocolVersion !== 1 || !["unavailable", "denied", "off", "on", "error", "busy"].includes(reply.state)
        || typeof reply.available !== "boolean" || typeof reply.enabled !== "boolean" || !["granted", "denied", "prompt"].includes(reply.permission)
        || reply.state === "on" && (!reply.available || !reply.enabled || reply.permission !== "granted")
        || !["on", "busy"].includes(reply.state) && reply.enabled
        || reply.message !== undefined && (typeof reply.message !== "string" || reply.message.length > 240)) {
        request.finish(new Error("Uygulamanın bildirim yanıtı doğrulanamadı.")); return;
      }
      request.finish(reply.state === "off" && !reply.available ? { ...reply, state: "unavailable" } : reply);
    };
  }
  const id = createSecureRandomKey();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Bildirim ayarı zamanında tamamlanmadı. Durumu yenileyip tekrar dene.")); }, command === "enable" ? 45_000 : 12_000);
    pending.set(id, { accountId, finish: (reply) => { clearTimeout(timer); pending.delete(id); if (reply instanceof Error) reject(reply); else resolve(reply); } });
    try { bridge.postMessage(JSON.stringify({ id, command, ...(accountId ? { accountId } : {}) })); }
    catch { const request = pending.get(id); request?.finish(new Error("Uygulamanın bildirim ayarı açılamadı.")); }
  });
}
