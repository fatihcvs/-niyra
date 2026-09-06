export const MARKET_DRAFT_DB_NAME = "kampira-market-drafts";
export const MARKET_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export type MarketDraftFields = Record<string, Record<string, string>>;
export type MarketCreateRecovery = { kind: "listing" | "price"; payload: Record<string, string | null>; images: File[]; phase: "create-unknown" | "create-ended" | "photos-retry" | "photos-unknown" | "photos-ended"; listingId?: string; key: string; photoKey?: string };
export type MarketContactAttempt = { message: string; key: string; ended?: boolean; title?: string };
export type MarketDraftSnapshot = { kind: string; forms: MarketDraftFields; images: File[]; recovery: MarketCreateRecovery | null; contacts: Record<string, MarketContactAttempt> };
export type DurableMarketDraft = MarketDraftSnapshot & { owner: string; schemaVersion: 1; revision: number; createdAt: number; updatedAt: number; expiresAt: number };
export type MarketDraftFailure = { status: "inactive" | "stale" } | { status: "unavailable"; reason: "unsupported" | "denied" | "quota" | "blocked" | "invalid" | "storage" };
export type MarketDraftRead = { status: "loaded"; record: DurableMarketDraft | null; discarded?: "invalid" | "expired" } | MarketDraftFailure;
export type MarketDraftWrite = { status: "saved"; record: DurableMarketDraft } | { status: "conflict"; record: DurableMarketDraft | null } | MarketDraftFailure;
export type MarketDraftClear = { status: "cleared" } | MarketDraftFailure;
type StoredFile = { bytes: Blob; name: string; type: string; lastModified: number };
type Stored = Omit<DurableMarketDraft, "images" | "recovery"> & { images: StoredFile[]; recovery: (Omit<MarketCreateRecovery, "images"> & { images: StoredFile[] }) | null };
type Coordinator = { invalidators: Set<() => void>; clearing: Promise<MarketDraftClear> | null };
const coordinators = new WeakMap<IDBFactory, Map<string, Coordinator>>();
const keyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const targetPattern = /^[A-Za-z0-9_-]{1,80}$/;
export const emptyMarketDraft = (): MarketDraftSnapshot => ({ kind: "sell", forms: {}, images: [], recovery: null, contacts: {} });
export function hasMarketDraft(snapshot: MarketDraftSnapshot) {
  return Boolean(snapshot.images.length || snapshot.recovery || Object.keys(snapshot.contacts).length || Object.values(snapshot.forms).some((fields) => Object.values(fields).some(Boolean)));
}
function pending(snapshot: MarketDraftSnapshot) { return Boolean(snapshot.recovery || Object.keys(snapshot.contacts).length); }
function validFiles(files: unknown): files is File[] {
  return Array.isArray(files) && files.length <= 6 && files.reduce((sum, file) => sum + (file?.size || 0), 0) <= 20 * 1024 * 1024
    && files.every((file) => file instanceof File && file.size > 0 && file.size <= 5 * 1024 * 1024
      && file.name.length > 0 && file.name.length <= 1024 && Number.isFinite(file.lastModified) && ["image/png", "image/jpeg", "image/webp"].includes(file.type));
}
const safeObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function pruneEmptyContacts(fields: MarketDraftFields) {
  return Object.fromEntries(Object.entries(fields).filter(([bucket, values]) => !bucket.startsWith("contact:") || !safeObject(values) || Object.values(values).some((value) => typeof value !== "string" || Boolean(value))));
}
function validFields(fields: unknown): fields is MarketDraftFields {
  if (!safeObject(fields) || Object.keys(fields).length > 1000) return false;
  const pruned = pruneEmptyContacts(fields as MarketDraftFields);
  if (Object.keys(pruned).length > 34) return false;
  const allowed = new Set(["title", "category", "description", "price", "condition", "meetupPlace", "placeId", "placeName", "itemName", "observedAt", "sourceNote", "message"]);
  return Object.entries(pruned).every(([bucket, values]) => (bucket === "listing" || bucket === "price" || /^contact:[A-Za-z0-9_-]{1,80}$/.test(bucket))
    && safeObject(values) && Object.keys(values).length <= 12
    && Object.entries(values).every(([field, value]) => allowed.has(field) && typeof value === "string" && value.length <= 1000));
}
export function copyMarketDraft(snapshot: MarketDraftSnapshot): MarketDraftSnapshot {
  return { kind: snapshot.kind, forms: Object.fromEntries(Object.entries(pruneEmptyContacts(snapshot.forms)).map(([bucket, fields]) => [bucket, { ...fields }])), images: [...snapshot.images],
    recovery: snapshot.recovery ? { ...snapshot.recovery, payload: { ...snapshot.recovery.payload }, images: [...snapshot.recovery.images] } : null,
    contacts: Object.fromEntries(Object.entries(snapshot.contacts).map(([id, attempt]) => [id, { ...attempt }])) };
}
function validSnapshot(value: unknown): value is MarketDraftSnapshot {
  if (!safeObject(value) || !["sell", "wanted", "free"].includes(String(value.kind)) || !validFields(value.forms) || !validFiles(value.images) || !safeObject(value.contacts) || Object.keys(value.contacts).length > 32) return false;
  if (!Object.entries(value.contacts).every(([id, attempt]) => targetPattern.test(id) && safeObject(attempt) && typeof attempt.key === "string" && keyPattern.test(attempt.key)
    && typeof attempt.message === "string" && attempt.message.length <= 500 && (attempt.title === undefined || typeof attempt.title === "string" && attempt.title.length <= 100)
    && (attempt.ended === undefined || typeof attempt.ended === "boolean"))) return false;
  const attempt = value.recovery;
  if (attempt === null) return true;
  if (!safeObject(attempt) || !["listing", "price"].includes(String(attempt.kind)) || !["create-unknown", "create-ended", "photos-retry", "photos-unknown", "photos-ended"].includes(String(attempt.phase))
    || typeof attempt.key !== "string" || !keyPattern.test(attempt.key) || !safeObject(attempt.payload) || !validFiles(attempt.images)
    || (attempt.photoKey !== undefined && (attempt.kind !== "listing" || typeof attempt.photoKey !== "string" || !keyPattern.test(attempt.photoKey)))
    || attempt.payload.action !== attempt.kind || Object.keys(attempt.payload).length > 12
    || !Object.values(attempt.payload).every((field) => field === null || typeof field === "string" && field.length <= 1000)
    || (attempt.listingId !== undefined && (typeof attempt.listingId !== "string" || !targetPattern.test(attempt.listingId)))) return false;
  const allowed = new Set(attempt.kind === "listing" ? ["action", "kind", "category", "title", "description", "price", "condition", "meetupPlace"] : ["action", "category", "placeId", "placeName", "itemName", "price", "observedAt", "sourceNote"]);
  return Object.keys(attempt.payload).every((field) => allowed.has(field)) && (attempt.kind === "listing" || !attempt.images.length)
    && (!["photos-retry", "photos-unknown", "photos-ended"].includes(String(attempt.phase)) || attempt.kind === "listing" && Boolean(attempt.listingId));
}
function encode(snapshot: MarketDraftSnapshot) {
  const files = new Map<File, StoredFile>();
  const save = (file: File) => { if (!files.has(file)) files.set(file, { bytes: file, name: file.name, type: file.type, lastModified: file.lastModified }); return files.get(file)!; };
  const copied = copyMarketDraft(snapshot);
  return { ...copied, images: copied.images.map(save), recovery: copied.recovery ? { ...copied.recovery, images: copied.recovery.images.map(save) } : null };
}
function decode(value: unknown, owner: string, now: number): { record: DurableMarketDraft | null; discarded?: "invalid" | "expired" } {
  if (value === undefined) return { record: null };
  const row = value as Stored;
  if (!row || row.owner !== owner || row.schemaVersion !== 1 || !Number.isSafeInteger(row.revision) || row.revision < 1
    || !Number.isFinite(row.createdAt) || !Number.isFinite(row.updatedAt) || row.createdAt < 0 || row.updatedAt < row.createdAt
    || row.updatedAt > now + 300_000 || row.expiresAt !== row.updatedAt + MARKET_DRAFT_TTL_MS) return { record: null, discarded: "invalid" };
  const cache = new Map<StoredFile, File>();
  const restore = (stored: StoredFile) => {
    if (!stored || !(stored.bytes instanceof Blob) || stored.type !== stored.bytes.type || typeof stored.name !== "string" || !Number.isFinite(stored.lastModified)) throw new Error("Invalid stored photo");
    if (!cache.has(stored)) cache.set(stored, new File([stored.bytes], stored.name, { type: stored.type, lastModified: stored.lastModified }));
    return cache.get(stored)!;
  };
  try {
    const record = { ...row, forms: safeObject(row.forms) ? pruneEmptyContacts(row.forms) : row.forms, images: row.images.map(restore), recovery: row.recovery ? { ...row.recovery, images: row.recovery.images.map(restore) } : null };
    if (!validSnapshot(record)) return { record: null, discarded: "invalid" };
    // Unknown operations must keep their original key even after ordinary draft retention expires.
    if (row.expiresAt <= now && !pending(record)) return { record: null, discarded: "expired" };
    return { record };
  } catch { return { record: null, discarded: "invalid" }; }
}
function failure(error: unknown): MarketDraftFailure {
  const name = safeObject(error) ? error.name : "";
  return { status: "unavailable", reason: name === "QuotaExceededError" ? "quota" : ["SecurityError", "NotAllowedError"].includes(String(name)) ? "denied" : ["TimeoutError", "InvalidStateError"].includes(String(name)) ? "blocked" : "storage" };
}
function transaction(db: IDBDatabase) {
  try { return db.transaction(["drafts", "meta"], "readwrite", { durability: "strict" }); }
  catch (error) { if (error instanceof TypeError) return db.transaction(["drafts", "meta"], "readwrite"); throw error; }
}

export function createMarketDraftStore(options: { indexedDB?: IDBFactory; databaseName?: string; now?: () => number; onInvalidate?: () => void } = {}) {
  let factory: IDBFactory | undefined;
  let unsupported: "unsupported" | "denied" = "unsupported";
  try { factory = options.indexedDB ?? (typeof window !== "undefined" ? window.indexedDB : globalThis.indexedDB); } catch { unsupported = "denied"; }
  const name = options.databaseName ?? MARKET_DRAFT_DB_NAME, now = options.now ?? Date.now;
  let group: Coordinator = { invalidators: new Set(), clearing: null };
  if (factory) { const groups = coordinators.get(factory) ?? new Map(); group = groups.get(name) ?? group; groups.set(name, group); coordinators.set(factory, groups); }
  let owner: string | null = null, generation = 0, confirmedAt = 0, sessionEpoch: number | null = null, disposed = false;
  let connection: IDBDatabase | null = null, opening: Promise<IDBDatabase> | null = null;
  const transactions = new Set<IDBTransaction>();
  const transactionFailures = new WeakMap<IDBTransaction, unknown>();
  const invalidate = () => { generation++; owner = null; sessionEpoch = null; for (const tx of transactions) { try { tx.abort(); } catch { /* Complete already. */ } } try { options.onInvalidate?.(); } catch { /* View cleanup must never interrupt durable logout fencing. */ } };
  group.invalidators.add(invalidate);
  let channel: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") { try { channel = new BroadcastChannel(`${name}:lifecycle`); channel.onmessage = (event) => { if (event.data === "logout") invalidate(); }; } catch { /* Persisted epoch still fences writes. */ } }
  const open = () => {
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    if (!factory) return Promise.reject(new DOMException("Draft storage unavailable", "NotSupportedError"));
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory!.open(name, 1); let finished = false;
      const stop = (error: unknown) => { if (!finished) { finished = true; clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => stop(new DOMException("Draft storage open timed out", "TimeoutError")), 5000);
      request.onupgradeneeded = () => { const db = request.result; db.createObjectStore("drafts", { keyPath: "owner" }); db.createObjectStore("meta", { keyPath: "id" }).put({ id: "epoch", value: 0, clearedAt: 0 }); };
      request.onerror = () => stop(request.error);
      request.onblocked = () => stop(new DOMException("Draft storage blocked", "InvalidStateError"));
      request.onsuccess = () => { if (finished || disposed) { request.result.close(); stop(new DOMException("Draft storage closed", "AbortError")); return; } finished = true; clearTimeout(timer); connection = request.result; connection.onversionchange = () => { connection?.close(); connection = null; opening = null; }; resolve(connection); };
    }).catch((error) => { opening = null; throw error; });
    return opening;
  };
  const operation = async <T>(action: (store: IDBObjectStore, tx: IDBTransaction, finish: (result: T) => void, contextOwner: string) => void): Promise<T | MarketDraftFailure> => {
    const contextOwner = owner, contextGeneration = generation;
    if (!contextOwner || disposed) return { status: "inactive" };
    if (!factory) return { status: "unavailable", reason: unsupported };
    const current = () => !disposed && owner === contextOwner && generation === contextGeneration;
    try {
      if (group.clearing) { const cleared = await group.clearing; if (cleared.status !== "cleared") return cleared; }
      const db = await open(); if (!current()) return { status: "stale" };
      return await new Promise<T | MarketDraftFailure>((resolve) => {
        const tx = transaction(db); transactions.add(tx); let result: T; let problem: MarketDraftFailure | null = null;
        tx.oncomplete = () => { transactions.delete(tx); resolve(current() ? result : { status: "stale" }); };
        tx.onabort = () => { transactions.delete(tx); resolve(problem ?? (current() ? failure(transactionFailures.get(tx) ?? tx.error) : { status: "stale" })); };
        tx.onerror = () => { problem = failure(tx.error); };
        const epoch = tx.objectStore("meta").get("epoch");
        epoch.onsuccess = () => {
          if (!current()) { problem = { status: "stale" }; tx.abort(); return; }
          if (!Number.isSafeInteger(epoch.result?.value) || (sessionEpoch !== null && sessionEpoch !== epoch.result.value)
            || (sessionEpoch === null && epoch.result.clearedAt && epoch.result.clearedAt >= confirmedAt)) { problem = { status: "inactive" }; invalidate(); return; }
          sessionEpoch = epoch.result.value;
          try { action(tx.objectStore("drafts"), tx, (value) => { result = value; }, contextOwner); }
          catch (error) { problem = failure(error); tx.abort(); }
        };
      });
    } catch (error) { return current() ? failure(error) : { status: "stale" }; }
  };
  return {
    setOwner(value: { publicId: string; confirmed: true } | null) { if (disposed) return; invalidate(); if (value?.confirmed === true && /^[A-Za-z0-9_-]{1,160}$/.test(value.publicId)) { owner = value.publicId; confirmedAt = now(); } },
    load(): Promise<MarketDraftRead> {
      return operation<MarketDraftRead>((store, _tx, finish, contextOwner) => {
        const request = store.get(contextOwner); request.onsuccess = () => { const decoded = decode(request.result, contextOwner, now()); if (decoded.discarded) store.delete(contextOwner); finish({ status: "loaded", ...decoded }); };
      });
    },
    save(snapshot: MarketDraftSnapshot, expectedRevision: number, resolvedKeys: readonly string[] = []): Promise<MarketDraftWrite> {
      if (!validSnapshot(snapshot) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return Promise.resolve({ status: "unavailable", reason: "invalid" });
      const copied = copyMarketDraft(snapshot);
      return operation<MarketDraftWrite>((store, tx, finish, contextOwner) => {
        const request = store.get(contextOwner);
        request.onsuccess = () => {
          try {
            const current = decode(request.result, contextOwner, now()).record;
            if ((current?.revision ?? 0) !== expectedRevision) { finish({ status: "conflict", record: current }); return; }
            // A stale autosave cannot release or alter an unresolved network attempt.
            if (current?.recovery && !resolvedKeys.includes(current.recovery.key)) {
              if (copied.recovery?.key !== current.recovery.key) { finish({ status: "conflict", record: current }); return; }
              if (current.recovery.listingId && copied.recovery.listingId && current.recovery.listingId !== copied.recovery.listingId) { finish({ status: "conflict", record: current }); return; }
              copied.recovery = { ...copied.recovery, kind: current.recovery.kind, key: current.recovery.key, payload: current.recovery.payload, images: current.recovery.images };
              if (current.recovery.photoKey) copied.recovery.photoKey = current.recovery.photoKey;
              if (current.recovery.listingId) {
                copied.recovery.listingId = current.recovery.listingId;
                if (!["photos-retry", "photos-unknown", "photos-ended"].includes(copied.recovery.phase)) copied.recovery.phase = current.recovery.phase;
              }
              if (current.recovery.phase === "create-ended") copied.recovery.phase = "create-ended";
              if (current.recovery.phase === "photos-ended") copied.recovery.phase = "photos-ended";
            }
            for (const [id, old] of Object.entries(current?.contacts ?? {})) if (!resolvedKeys.includes(old.key)) {
              if (copied.contacts[id]?.key !== old.key) { finish({ status: "conflict", record: current }); return; }
              copied.contacts[id] = { ...old, ...(copied.contacts[id].ended ? { ended: true } : {}) };
            }
            const updatedAt = now();
            const stored: Stored = { ...encode(copied), owner: contextOwner, schemaVersion: 1, revision: expectedRevision + 1,
              createdAt: current?.createdAt ?? updatedAt, updatedAt, expiresAt: updatedAt + MARKET_DRAFT_TTL_MS };
            store.put(stored); finish({ status: "saved", record: decode(stored, contextOwner, updatedAt).record! });
          } catch (error) { transactionFailures.set(tx, error); tx.abort(); }
        };
      });
    },
    async clearOnExplicitLogout(): Promise<MarketDraftClear> {
      for (const notify of group.invalidators) notify();
      try { channel?.postMessage("logout"); } catch { /* Epoch remains authoritative. */ }
      if (!factory) return { status: "unavailable", reason: unsupported };
      const previous = group.clearing;
      const clearing = (async (): Promise<MarketDraftClear> => {
        if (previous) await previous;
        try { const db = await open(); return await new Promise<MarketDraftClear>((resolve) => {
          const tx = transaction(db); tx.oncomplete = () => resolve({ status: "cleared" }); tx.onabort = () => resolve(failure(transactionFailures.get(tx) ?? tx.error));
          const meta = tx.objectStore("meta"), read = meta.get("epoch"); read.onsuccess = () => { try { meta.put({ id: "epoch", value: (Number(read.result?.value) || 0) + 1, clearedAt: now() }); tx.objectStore("drafts").clear(); } catch (error) { transactionFailures.set(tx, error); tx.abort(); } };
        }); } catch (error) { return failure(error); }
      })();
      group.clearing = clearing; const result = await clearing; if (result.status === "cleared" && group.clearing === clearing) group.clearing = null; return result;
    },
    dispose() { if (disposed) return; invalidate(); disposed = true; group.invalidators.delete(invalidate); channel?.close(); connection?.close(); connection = null; },
  };
}
export async function clearMarketDraftsOnLogout(): Promise<MarketDraftClear> {
  const store = createMarketDraftStore();
  try { return await store.clearOnExplicitLogout(); } finally { store.dispose(); }
}
