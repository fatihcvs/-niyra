import { copyPublishDraft, publishDraftMedia, type PublishAttemptSnapshot, type PublishDraft } from "./publish-attempt";
import { POST_IMAGE_MAX_BYTES, POST_VIDEO_MAX_BYTES, POST_PHOTO_MAX_COUNT, POST_MEDIA_TOTAL_MAX_BYTES } from "./post-media";

export const PUBLISH_DRAFT_SCHEMA_VERSION = 2;
export const PUBLISH_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const PUBLISH_DRAFT_DB_NAME = "kampira-publish-drafts";
export type ConfirmedDraftOwner = { publicId: string; confirmed: true };
export type DurablePublishDraft = PublishDraft & {
  owner: string;
  schemaVersion: 1 | 2;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  immutableAttempt: PublishAttemptSnapshot | null;
};
export type DraftStoreFailure = { status: "inactive" | "stale" }
  | { status: "unavailable"; reason: "unsupported" | "denied" | "quota" | "blocked" | "invalid" | "storage" };
export type DraftLoadResult = { status: "loaded"; record: DurablePublishDraft | null; discarded?: "expired" | "invalid" } | DraftStoreFailure;
export type DraftSaveResult = { status: "saved"; record: DurablePublishDraft } | { status: "recovery-required"; record: DurablePublishDraft } | DraftStoreFailure;
export type DraftPrepareResult = { status: "prepared"; record: DurablePublishDraft; attempt: PublishAttemptSnapshot }
  | { status: "recovery-required"; record: DurablePublishDraft } | DraftStoreFailure;
export type DraftClearResult = { status: "cleared" } | DraftStoreFailure;
type StoredMedia = { file: Blob; name: string; type: string; lastModified: number };
type StoredDraft = Omit<PublishDraft, "media" | "mediaFiles"> & { media: StoredMedia | null; mediaFiles?: StoredMedia[] };
type StoredRecord = Omit<DurablePublishDraft, "media" | "mediaFiles" | "immutableAttempt"> & {
  media: StoredMedia | null;
  mediaFiles?: StoredMedia[];
  immutableAttempt: { key: string; draft: StoredDraft; uncertain: true } | null;
};
type Context = { owner: string; generation: number; revision: number; writing: boolean };
type Coordinator = { invalidate: Set<() => void>; clearing: Promise<DraftClearResult> | null };
const coordinators = new WeakMap<IDBFactory, Map<string, Coordinator>>();

function failure(error: unknown): DraftStoreFailure {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  return { status: "unavailable", reason: name === "QuotaExceededError" ? "quota" : name === "SecurityError" || name === "NotAllowedError" ? "denied" : "storage" };
}
function validDraft(value: PublishDraft) {
  if (!value || typeof value.content !== "string" || value.content.length > 1200
    || !["platform", "campus"].includes(value.audience)
    || !(value.courseId === null || (typeof value.courseId === "string" && value.courseId.length <= 160))) return false;
  if (value.mediaFiles !== undefined && (!Array.isArray(value.mediaFiles) || value.media !== (value.mediaFiles[0] ?? null))) return false;
  if (value.mediaFiles === undefined && value.media !== null && !(value.media instanceof File)) return false;
  const media = publishDraftMedia(value);
  if (media.length > POST_PHOTO_MAX_COUNT || media.reduce((total, file) => total + (file?.size || 0), 0) > POST_MEDIA_TOTAL_MAX_BYTES) return false;
  return media.every((file) => {
    if (!(file instanceof File) || !file.name || file.name.length > 1024 || !Number.isFinite(file.lastModified)) return false;
    const image = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
    return (image || (media.length === 1 && ["video/mp4", "video/webm"].includes(file.type)))
      && file.size > 0 && file.size <= (image ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES);
  });
}
function encodeDraft(draft: PublishDraft): StoredDraft {
  const media = publishDraftMedia(draft).map((file) => ({ file, name: file.name, type: file.type, lastModified: file.lastModified }));
  return { content: draft.content, audience: draft.audience, courseId: draft.courseId,
    media: media[0] ?? null, ...(draft.mediaFiles !== undefined ? { mediaFiles: media } : {}) };
}
function decodeDraft(stored: StoredDraft): PublishDraft | null {
  if (!stored || typeof stored !== "object") return null;
  if (stored.mediaFiles !== undefined && (!Array.isArray(stored.mediaFiles) || stored.media !== (stored.mediaFiles[0] ?? null))) return null;
  const mediaFiles: File[] = [];
  for (const file of stored.mediaFiles ?? (stored.media ? [stored.media] : [])) {
    if (!file || !(file.file instanceof Blob) || typeof file.name !== "string" || typeof file.type !== "string"
      || file.type !== file.file.type || !Number.isFinite(file.lastModified)) return null;
    // Metadata is explicit because Node's structuredClone(File) currently retains Blob bytes but drops File fields.
    mediaFiles.push(new File([file.file], file.name, { type: file.type, lastModified: file.lastModified }));
  }
  if (stored.media === undefined) return null;
  const draft = { content: stored.content, audience: stored.audience, courseId: stored.courseId, media: mediaFiles[0] ?? null,
    ...(stored.mediaFiles !== undefined ? { mediaFiles } : {}) };
  return validDraft(draft) ? draft : null;
}
function decodeRecord(value: unknown, owner: string, now: number): { record: DurablePublishDraft | null; discarded?: "expired" | "invalid" } {
  if (value === undefined) return { record: null };
  const row = value as StoredRecord;
  if (!row || row.owner !== owner || ![1, 2].includes(row.schemaVersion) || (row.schemaVersion === 2 && !Array.isArray(row.mediaFiles)) || !Number.isFinite(row.createdAt) || row.createdAt < 0
    || !Number.isFinite(row.updatedAt) || row.updatedAt < row.createdAt || row.updatedAt > now + 300_000
    || row.expiresAt !== row.updatedAt + PUBLISH_DRAFT_TTL_MS) return { record: null, discarded: "invalid" };
  if (row.expiresAt <= now) return { record: null, discarded: "expired" };
  const draft = decodeDraft(row);
  if (!draft) return { record: null, discarded: "invalid" };
  let immutableAttempt: PublishAttemptSnapshot | null = null;
  if (row.immutableAttempt !== null) {
    const stored = row.immutableAttempt;
    const restored = stored && decodeDraft(stored.draft);
    if (!stored || typeof stored.key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(stored.key) || stored.uncertain !== true || !restored
      || restored.content !== draft.content || restored.audience !== draft.audience || restored.courseId !== draft.courseId
      || Boolean(restored.media) !== Boolean(draft.media)
      || (row.mediaFiles && (stored.draft.mediaFiles?.length !== row.mediaFiles.length || row.mediaFiles.some((file, index) => {
        const attemptFile = stored.draft.mediaFiles?.[index];
        return !attemptFile || attemptFile.file !== file.file || attemptFile.name !== file.name || attemptFile.type !== file.type || attemptFile.lastModified !== file.lastModified;
      })))
      || (row.media && (stored.draft.media?.file !== row.media.file || stored.draft.media.name !== row.media.name
        || stored.draft.media.type !== row.media.type || stored.draft.media.lastModified !== row.media.lastModified))) {
      return { record: null, discarded: "invalid" };
    }
    immutableAttempt = { key: stored.key, draft, uncertain: true };
  }
  return { record: { ...draft, owner, schemaVersion: row.schemaVersion, createdAt: row.createdAt, updatedAt: row.updatedAt, expiresAt: row.expiresAt, immutableAttempt } };
}

/** Owner must come from a current server-confirmed session. No auth material is stored or requested here. */
export function createPublishDraftStore(options: { indexedDB?: IDBFactory; databaseName?: string; now?: () => number; debounceMs?: number; onInvalidate?: () => void } = {}) {
  let factory: IDBFactory | undefined;
  let unavailableReason: "unsupported" | "denied" = "unsupported";
  try { factory = options.indexedDB ?? globalThis.indexedDB; } catch { unavailableReason = "denied"; }
  const name = options.databaseName ?? PUBLISH_DRAFT_DB_NAME;
  const now = options.now ?? Date.now;
  let coordinator: Coordinator = { invalidate: new Set(), clearing: null };
  if (factory) {
    const groups = coordinators.get(factory) ?? new Map<string, Coordinator>();
    coordinator = groups.get(name) ?? coordinator;
    groups.set(name, coordinator); coordinators.set(factory, groups);
  }
  let owner: string | null = null;
  let generation = 0;
  let revision = 0;
  let sessionEpoch: number | null = null;
  let disposed = false;
  let connection: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;
  let scheduled: { timer: ReturnType<typeof setTimeout>; resolve: (result: DraftSaveResult) => void } | null = null;
  const transactions = new Map<IDBTransaction, boolean>();
  const transactionErrors = new WeakMap<IDBTransaction, unknown>();
  const cancelWrites = () => {
    revision++;
    if (scheduled) { clearTimeout(scheduled.timer); scheduled.resolve({ status: "stale" }); scheduled = null; }
    for (const [tx, writing] of transactions) if (writing) { try { tx.abort(); } catch { /* Already committed. */ } }
  };
  const invalidate = () => {
    generation++; owner = null; sessionEpoch = null; cancelWrites();
    for (const tx of transactions.keys()) { try { tx.abort(); } catch { /* Already complete. */ } }
    try { options.onInvalidate?.(); } catch { /* UI cleanup cannot bypass storage invalidation. */ }
  };
  coordinator.invalidate.add(invalidate);
  // Other tabs invalidate visible owner contexts; the persisted epoch also fences already-open transactions.
  let channel: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    try { channel = new BroadcastChannel(`${name}:lifecycle`); channel.onmessage = (event) => { if (event.data === "logout") invalidate(); }; } catch { /* IDB epoch fencing remains available. */ }
  }
  const context = (writing: boolean): Context | null => owner && !disposed ? { owner, generation, revision, writing } : null;
  const current = (ctx: Context) => !disposed && owner === ctx.owner && generation === ctx.generation && revision === ctx.revision;

  const open = () => {
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    if (!factory) return Promise.reject(new DOMException("IndexedDB unavailable", "NotSupportedError"));
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory!.open(name, 1);
      let finished = false;
      const stop = (error: DOMException) => { if (!finished) { finished = true; clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => stop(new DOMException("Draft database open timed out", "TimeoutError")), 5000);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "owner" }).createIndex("expiry", "expiresAt");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" }).put({ id: "epoch", value: 0 });
      };
      request.onerror = () => stop(request.error ?? new DOMException("Draft database unavailable", "UnknownError"));
      request.onblocked = () => stop(new DOMException("Draft database blocked", "InvalidStateError"));
      request.onsuccess = () => {
        if (finished || disposed) { request.result.close(); stop(new DOMException("Draft store closed", "AbortError")); return; }
        finished = true; clearTimeout(timer);
        connection = request.result;
        connection.onversionchange = () => { connection?.close(); connection = null; opening = null; };
        resolve(connection);
      };
    }).catch((error) => { opening = null; throw error; });
    return opening;
  };

  const operation = async <Result>(ctx: Context, action: (store: IDBObjectStore, tx: IDBTransaction, finish: (result: Result) => void) => void): Promise<Result | DraftStoreFailure> => {
    if (!factory) return { status: "unavailable", reason: unavailableReason };
    try {
      if (coordinator.clearing) {
        const cleared = await coordinator.clearing;
        if (cleared.status !== "cleared") return cleared;
      }
      const db = await open();
      if (!current(ctx)) return { status: "stale" };
      return await new Promise<Result | DraftStoreFailure>((resolve) => {
        const tx = db.transaction(["drafts", "meta"], "readwrite");
        transactions.set(tx, ctx.writing);
        let result: Result;
        let reason: DraftStoreFailure | null = null;
        tx.oncomplete = () => { transactions.delete(tx); resolve(current(ctx) ? result : { status: "stale" }); };
        tx.onabort = () => { transactions.delete(tx); resolve(reason ?? (current(ctx) ? failure(transactionErrors.get(tx) ?? tx.error) : { status: "stale" })); };
        tx.onerror = () => { reason = current(ctx) ? failure(tx.error) : { status: "stale" }; };
        const request = tx.objectStore("meta").get("epoch");
        request.onsuccess = () => {
          if (!current(ctx)) { reason = { status: "stale" }; tx.abort(); return; }
          const epoch = request.result?.value;
          if (!Number.isSafeInteger(epoch) || (sessionEpoch !== null && sessionEpoch !== epoch)) {
            reason = { status: "inactive" }; invalidate(); return;
          }
          sessionEpoch = epoch;
          try { action(tx.objectStore("drafts"), tx, (value) => { result = value; }); }
          catch (error) { reason = failure(error); tx.abort(); }
        };
      });
    } catch (error) {
      if (!current(ctx)) return { status: "stale" };
      if (error instanceof DOMException && ["InvalidStateError", "TimeoutError"].includes(error.name)) return { status: "unavailable", reason: "blocked" };
      return failure(error);
    }
  };
  const read = (store: IDBObjectStore, tx: IDBTransaction, ctx: Context, handler: (value: ReturnType<typeof decodeRecord>) => void) => {
    const request = store.get(ctx.owner);
    request.onsuccess = () => {
      if (!current(ctx)) { tx.abort(); return; }
      try { handler(decodeRecord(request.result, ctx.owner, now())); } catch (error) { transactionErrors.set(tx, error); tx.abort(); }
    };
  };
  const write = async (ctx: Context, draft: PublishDraft, attempt?: PublishAttemptSnapshot): Promise<DraftSaveResult | DraftPrepareResult> => {
    if (!validDraft(draft) || (attempt && (typeof attempt.key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(attempt.key)))) return { status: "unavailable", reason: "invalid" };
    return operation<DraftSaveResult | DraftPrepareResult>(ctx, (store, tx, finish) => read(store, tx, ctx, ({ record }) => {
      if (record?.immutableAttempt) {
        finish(attempt?.key === record.immutableAttempt.key
          ? { status: "prepared", record, attempt: record.immutableAttempt }
          : { status: "recovery-required", record });
        return;
      }
      const updatedAt = now();
      const encoded = encodeDraft(draft);
      const stored: StoredRecord = { ...encoded, owner: ctx.owner, schemaVersion: encoded.mediaFiles ? 2 : 1,
        createdAt: record?.createdAt ?? updatedAt, updatedAt, expiresAt: updatedAt + PUBLISH_DRAFT_TTL_MS,
        immutableAttempt: attempt ? { key: attempt.key, draft: encoded, uncertain: true } : null };
      const put = store.put(stored);
      put.onsuccess = () => {
        const next = decodeRecord(stored, ctx.owner, updatedAt).record!;
        finish(attempt ? { status: "prepared", record: next, attempt: next.immutableAttempt! } : { status: "saved", record: next });
      };
      // Delete only expired keys, without loading another account's File or draft into application memory.
      const expired = store.index("expiry").openKeyCursor();
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (cursor && Number(cursor.key) <= updatedAt) { store.delete(cursor.primaryKey); cursor.continue(); }
      };
    }));
  };

  return {
    setOwner(value: ConfirmedDraftOwner | null) {
      if (disposed) return;
      invalidate();
      if (!disposed && value?.confirmed === true && /^[A-Za-z0-9_-]{1,160}$/.test(value.publicId)) owner = value.publicId;
    },
    async load(): Promise<DraftLoadResult> {
      const ctx = context(false);
      if (!ctx) return { status: "inactive" };
      return operation<DraftLoadResult>(ctx, (store, tx, finish) => read(store, tx, ctx, (value) => {
        if (value.discarded) store.delete(ctx.owner);
        finish({ status: "loaded", ...value });
      }));
    },
    saveNow(draft: PublishDraft): Promise<DraftSaveResult> {
      cancelWrites();
      const ctx = context(true);
      return ctx ? write(ctx, copyPublishDraft(draft)) as Promise<DraftSaveResult> : Promise.resolve({ status: "inactive" });
    },
    scheduleSave(draft: PublishDraft): Promise<DraftSaveResult> {
      cancelWrites();
      const ctx = context(true);
      if (!ctx) return Promise.resolve({ status: "inactive" });
      const snapshot = copyPublishDraft(draft);
      return new Promise((resolve) => {
        const timer = setTimeout(() => { scheduled = null; void write(ctx, snapshot).then((value) => resolve(value as DraftSaveResult)); }, options.debounceMs ?? 400);
        scheduled = { timer, resolve };
      });
    },
    preparePublish(attempt: PublishAttemptSnapshot): Promise<DraftPrepareResult> {
      cancelWrites();
      const ctx = context(true);
      const snapshot = { ...attempt, draft: copyPublishDraft(attempt.draft) };
      return ctx ? write(ctx, snapshot.draft, snapshot) as Promise<DraftPrepareResult> : Promise.resolve({ status: "inactive" });
    },
    async clearCurrent(expectedKey?: string): Promise<DraftClearResult> {
      cancelWrites();
      const ctx = context(true);
      if (!ctx) return { status: "inactive" };
      return operation<DraftClearResult>(ctx, (store, tx, finish) => read(store, tx, ctx, ({ record }) => {
        if (expectedKey && record?.immutableAttempt?.key !== expectedKey) { finish({ status: "stale" }); return; }
        store.delete(ctx.owner); finish({ status: "cleared" });
      }));
    },
    async clearOnExplicitLogout(): Promise<DraftClearResult> {
      for (const notify of coordinator.invalidate) notify();
      try { channel?.postMessage("logout"); } catch { /* Persisted epoch and local invalidation still fence writes. */ }
      if (!factory) return { status: "unavailable", reason: unavailableReason };
      const previous = coordinator.clearing;
      const clearing = (async (): Promise<DraftClearResult> => {
        if (previous) await previous;
        try {
          const db = await open();
          return await new Promise<DraftClearResult>((resolve) => {
            const tx = db.transaction(["drafts", "meta"], "readwrite");
            let clearError: unknown;
            tx.oncomplete = () => resolve({ status: "cleared" });
            tx.onabort = () => resolve(failure(clearError ?? tx.error));
            const meta = tx.objectStore("meta");
            const request = meta.get("epoch");
            request.onsuccess = () => {
              try { meta.put({ id: "epoch", value: (Number(request.result?.value) || 0) + 1 }); tx.objectStore("drafts").clear(); }
              catch (error) { clearError = error; tx.abort(); }
            };
          });
        } catch (error) { return failure(error); }
      })();
      coordinator.clearing = clearing;
      const result = await clearing;
      if (coordinator.clearing === clearing && result.status === "cleared") coordinator.clearing = null;
      return result;
    },
    dispose() { if (disposed) return; invalidate(); disposed = true; coordinator.invalidate.delete(invalidate); channel?.close(); connection?.close(); connection = null; },
  };
}
