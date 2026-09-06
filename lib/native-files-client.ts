import { createSecureRandomKey } from "./secure-random-key";

type FilesBridge = { postMessage: (value: string) => void; onmessage?: ((event: { data: string }) => void) | null };
declare global { interface Window { KampiraFiles?: FilesBridge } }
export type FileAction = "save" | "share";
export type NativeFileReply = {
  protocolVersion: 1; id: string; accountId: string;
  state: "ready" | "received" | "saved" | "shareOpened" | "cancelled" | "error" | "busy";
  message?: string; httpStatus?: number; transferId?: string; maxChunkBytes?: number; nextSequence?: number;
};
type Command = "download" | "shareLink" | "blobStart" | "blobChunk" | "blobFinish" | "cancel" | "clear";
type Pending = { accountId: string; states: string[]; finish: (reply: NativeFileReply | Error) => void };
const pending = new Map<string, Pending>();
let bound: FilesBridge | undefined;
let clearGeneration = 0;
export const nativeFileAccount = (scope: string | undefined) => /^([A-Za-z0-9_-]{1,160}):\d+$/.exec(scope ?? "")?.[1] ?? "";
export function hasNativeFiles() { return typeof window !== "undefined" && typeof window.KampiraFiles?.postMessage === "function"; }
const cancelled = () => new DOMException("Dosya işlemi iptal edildi.", "AbortError");

/** Explicit click commands only. Tokens, cookies, file paths and file bytes never arrive in replies. */
export function nativeFileRequest(command: Command, accountId: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<NativeFileReply> {
  if (!hasNativeFiles()) return Promise.reject(new Error("Bu uygulama sürümü dosya işlemlerini desteklemiyor."));
  if (command !== "clear" && !/^[A-Za-z0-9_-]{1,160}$/.test(accountId)) return Promise.reject(new Error("Dosya hesabı doğrulanamadı."));
  if (signal?.aborted) return Promise.reject(cancelled());
  const bridge = window.KampiraFiles!;
  if (bound !== bridge) {
    if (bound) clearGeneration++;
    for (const request of pending.values()) request.finish(cancelled());
    bound = bridge;
    bridge.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 2048) return;
      let reply: NativeFileReply;
      try { reply = JSON.parse(event.data) as NativeFileReply; } catch { return; }
      if (!reply || typeof reply.id !== "string") return;
      const request = pending.get(reply.id);
      if (!request || reply.accountId !== request.accountId) return;
      if (reply.protocolVersion !== 1 || !request.states.includes(reply.state)
        || reply.message !== undefined && (typeof reply.message !== "string" || reply.message.length > 240)
        || reply.httpStatus !== undefined && (!Number.isInteger(reply.httpStatus) || reply.httpStatus < 100 || reply.httpStatus > 599)
        || ["ready", "received", "saved", "shareOpened"].includes(reply.state) && reply.httpStatus !== undefined && (reply.httpStatus < 200 || reply.httpStatus >= 300)
        || reply.state === "ready" && (typeof reply.transferId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(reply.transferId)
          || !Number.isInteger(reply.maxChunkBytes) || reply.maxChunkBytes! < 1 || reply.maxChunkBytes! > 49152)
        || reply.state === "received" && (!Number.isInteger(reply.nextSequence) || reply.nextSequence! < 1)) {
        request.finish(new Error("Uygulamanın dosya yanıtı doğrulanamadı.")); return;
      }
      request.finish(reply);
    };
  }
  const id = createSecureRandomKey();
  return new Promise((resolve, reject) => {
    const cancelNative = () => {
      try { bridge.postMessage(JSON.stringify({ command: "cancel", id: createSecureRandomKey(), accountId, requestId: id,
        ...(typeof payload.transferId === "string" ? { transferId: payload.transferId } : {}) })); } catch { /* The document may already be gone. */ }
    };
    const abort = () => { cancelNative(); pending.get(id)?.finish(cancelled()); };
    const timer = setTimeout(() => {
      cancelNative(); pending.get(id)?.finish(new Error("Dosya işlemi zamanında tamamlanmadı. Tekrar deneyebilirsin."));
    }, ["download", "blobFinish", "shareLink"].includes(command) ? 300_000 : 20_000);
    const success = command === "blobStart" ? "ready" : command === "blobChunk" ? "received" : command === "shareLink" || payload.action === "share" ? "shareOpened" : "saved";
    const states = ["cancelled", "error", "busy", ...(["cancel", "clear"].includes(command) ? [] : [success])];
    pending.set(id, { accountId, states, finish: (reply) => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort); pending.delete(id);
      if (reply instanceof Error) reject(reply); else resolve(reply);
    } });
    signal?.addEventListener("abort", abort, { once: true });
    try { bridge.postMessage(JSON.stringify({ ...payload, id, command, ...(accountId ? { accountId } : {}) })); }
    catch { pending.get(id)?.finish(new Error("Dosya işlemi açılamadı.")); }
  });
}

export async function nativeBlobAction(blob: Blob, name: string, accountId: string, action: FileAction = "save", signal?: AbortSignal) {
  const generation = clearGeneration;
  const check = () => { if (signal?.aborted || generation !== clearGeneration) throw cancelled(); };
  check();
  if (blob.size < 1 || blob.size > 20 * 1024 * 1024) throw new Error("Dosya boyutu 20 MB sınırını aşıyor veya dosya boş.");
  const started = await nativeFileRequest("blobStart", accountId, { name, mime: blob.type, size: blob.size, action }, signal);
  check();
  if (started.state !== "ready") return started;
  const transferId = started.transferId!;
  let finished = false;
  try {
    let sequence = 0;
    for (let offset = 0; offset < blob.size; offset += started.maxChunkBytes!) {
      check();
      const bytes = new Uint8Array(await blob.slice(offset, offset + started.maxChunkBytes!).arrayBuffer());
      check();
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const reply = await nativeFileRequest("blobChunk", accountId, { transferId, sequence, base64: btoa(binary) }, signal);
      check();
      if (reply.state !== "received") return reply;
      if (reply.nextSequence !== ++sequence) throw new Error("Dosya aktarım sırası doğrulanamadı.");
    }
    const reply = await nativeFileRequest("blobFinish", accountId, { transferId, action }, signal);
    check();
    finished = ["saved", "shareOpened", "cancelled"].includes(reply.state);
    return reply;
  } finally {
    if (!finished) void nativeFileRequest("cancel", accountId, { requestId: started.id, transferId }).catch(() => {});
  }
}

export async function shareAppLink(accountId: string, data: { title: string; text?: string; url: string }, signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled();
  if (hasNativeFiles()) {
    const reply = await nativeFileRequest("shareLink", accountId, data, signal);
    if (reply.state === "cancelled") throw cancelled();
    if (reply.state !== "shareOpened") throw new Error(reply.message ?? "Paylaşım menüsü açılamadı.");
    return "opened" as const;
  }
  if (navigator.share) { await navigator.share(data); return "opened" as const; }
  await navigator.clipboard.writeText(data.url);
  return "copied" as const;
}

export async function clearNativeFiles() {
  clearGeneration++;
  for (const request of pending.values()) request.finish(cancelled());
  if (hasNativeFiles()) await nativeFileRequest("clear", "");
}
