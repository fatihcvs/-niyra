import { publishDraftMedia, type PublishDraft } from "./publish-attempt";

export const PUBLISH_JSON_TIMEOUT_MS = 20_000;
export const PUBLISH_MEDIA_TIMEOUT_MS = 30_000;

export type PublishUploadProgress = {
  phase: "uploading" | "processing";
  loaded: number;
  total: number | null;
  percent: number | null;
};

export type PublishUploadResponse<Post> = {
  status: number;
  ok: boolean;
  data: { post?: Post; error?: string; code?: string } | null;
  replayed: boolean;
};

export type PublishUploadXHR = Pick<XMLHttpRequest,
  "open" | "setRequestHeader" | "send" | "abort" | "status" | "responseText" | "getResponseHeader"
  | "timeout" | "withCredentials" | "responseType" | "addEventListener" | "removeEventListener" | "upload">;

export type PublishUploadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: PublishUploadProgress) => void;
  createXHR?: () => PublishUploadXHR;
};

export class PublishUploadError extends Error {
  readonly uncertain = true;
  constructor(public readonly kind: "aborted" | "timeout" | "network" | "setup") {
    super({
      aborted: "Yükleme durduruldu. Yayın sonucu henüz doğrulanamadı; aynı taslakla tekrar deneyebilirsin.",
      timeout: "Yükleme zaman aşımına uğradı. Yayın sonucunu aynı taslakla tekrar deneyerek kontrol edebilirsin.",
      network: "Bağlantı kesildi. Yayın sonucu henüz doğrulanamadı; taslağın korunuyor.",
      setup: "Yükleme başlatılamadı. Taslağını koruyarak tekrar deneyebilirsin.",
    }[kind]);
    this.name = "PublishUploadError";
  }
}

/** Send exactly one immutable attempt. Only a validated HTTP post response proves publication. */
export function sendPublishUpload<Post = unknown>(
  attempt: { readonly key: string; readonly draft: PublishDraft },
  options: PublishUploadOptions = {},
): Promise<PublishUploadResponse<Post>> {
  if (options.signal?.aborted) return Promise.reject(new PublishUploadError("aborted"));
  return new Promise((resolve, reject) => {
    let xhr: PublishUploadXHR | undefined;
    let settled = false;
    let progress: PublishUploadProgress = { phase: "uploading", loaded: 0, total: null, percent: null };

    const notify = (next: PublishUploadProgress) => {
      if (settled) return;
      progress = next;
      try { options.onProgress?.({ ...next }); } catch { /* A UI observer cannot change the publish outcome. */ }
    };
    const onProgress = (event: Event) => {
      if (settled || progress.phase !== "uploading") return;
      const update = event as ProgressEvent;
      const loaded = Number.isFinite(update.loaded) ? Math.max(progress.loaded, update.loaded, 0) : progress.loaded;
      const total = update.lengthComputable && Number.isFinite(update.total) && update.total > 0 ? update.total : null;
      notify({ phase: "uploading", loaded, total, percent: total === null ? null : Math.min(100, Math.floor(loaded / total * 100)) });
    };
    const onUploaded = () => {
      notify({ ...progress, phase: "processing", loaded: progress.total ?? progress.loaded, percent: progress.total === null ? null : 100 });
    };
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onSignalAbort);
      if (!xhr) return;
      xhr.upload.removeEventListener("progress", onProgress);
      xhr.upload.removeEventListener("load", onUploaded);
      xhr.removeEventListener("load", onLoad);
      xhr.removeEventListener("error", onNetworkError);
      xhr.removeEventListener("timeout", onTimeout);
      xhr.removeEventListener("abort", onAbort);
    };
    const fail = (kind: PublishUploadError["kind"]) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new PublishUploadError(kind));
    };
    const abortRequest = () => {
      try { xhr?.abort(); } catch { /* Failure to stop transport cannot establish the server outcome. */ }
    };
    const onSignalAbort = () => {
      if (settled) return;
      // Detach first: native abort may synchronously emit abort/loadend, followed by queued callbacks.
      fail("aborted");
      abortRequest();
    };
    const onAbort = () => fail("aborted");
    const onTimeout = () => fail("timeout");
    const onNetworkError = () => fail("network");
    const onLoad = () => {
      if (settled || !xhr) return;
      const status = xhr.status;
      if (!status) { fail("network"); return; }
      let data: PublishUploadResponse<Post>["data"] = null;
      try {
        const value: unknown = JSON.parse(xhr.responseText);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          // Callers validate post presence/shape before clearing a draft, including malformed 2xx replies.
          data = value as NonNullable<PublishUploadResponse<Post>["data"]>;
        }
      } catch { /* Preserve the HTTP status so callers can distinguish 4xx rejection from uncertain 2xx/5xx. */ }
      const response = { status, ok: status >= 200 && status < 300, data, replayed: xhr.getResponseHeader("Idempotency-Replayed") === "true" };
      settled = true;
      cleanup();
      resolve(response);
    };

    try {
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(attempt.key)) { fail("setup"); return; }
      const { content, audience, courseId } = attempt.draft;
      const media = publishDraftMedia(attempt.draft);
      let body: string | FormData;
      if (media.length) {
        body = new FormData();
        body.set("content", content);
        body.set("audience", audience);
        if (courseId) body.set("courseId", courseId);
        for (const file of media) body.append("media", file);
      } else {
        body = JSON.stringify({ content, courseId, audience });
      }
      xhr = options.createXHR ? options.createXHR() : new XMLHttpRequest();
      xhr.upload.addEventListener("progress", onProgress);
      xhr.upload.addEventListener("load", onUploaded);
      xhr.addEventListener("load", onLoad);
      xhr.addEventListener("error", onNetworkError);
      xhr.addEventListener("timeout", onTimeout);
      xhr.addEventListener("abort", onAbort);
      options.signal?.addEventListener("abort", onSignalAbort, { once: true });
      if (options.signal?.aborted) { onSignalAbort(); return; }
      xhr.open("POST", "/api/posts", true);
      // XHR always includes same-origin cookies; false excludes cross-origin credentials.
      xhr.withCredentials = false;
      xhr.responseType = "text";
      xhr.timeout = media.length ? PUBLISH_MEDIA_TIMEOUT_MS : PUBLISH_JSON_TIMEOUT_MS;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("Idempotency-Key", attempt.key);
      if (!media.length) xhr.setRequestHeader("Content-Type", "application/json");
      // The browser generates multipart Content-Type/boundary. The original File and attempt key survive retries.
      notify(progress);
      if (!settled) xhr.send(body);
    } catch {
      fail("setup");
      abortRequest();
    }
  });
}
