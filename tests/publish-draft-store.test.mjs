import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";
import { IDBFactory, IDBObjectStore, IDBDatabase } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";

const compile = async (file) => ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const [storeSource, mediaSource, attemptSource] = await Promise.all([
  "../lib/publish-draft-store.ts", "../lib/post-media.ts", "../lib/publish-attempt.ts",
].map(compile));
const media = {};
runInNewContext(mediaSource, { exports: media, Uint8Array, DataView, TextDecoder });
const attemptApi = {};
runInNewContext(attemptSource, { exports: attemptApi, require: secureRandomKeyDependency });
function module() {
  const exports = {};
  runInNewContext(storeSource, { exports, File, Blob, DOMException, setTimeout, clearTimeout, require(name) {
    if (name === "./publish-attempt") return attemptApi;
    assert.equal(name, "./post-media"); return media;
  } });
  return exports;
}
const api = module();
const owner = (publicId) => ({ publicId, confirmed: true });
const draft = (overrides = {}) => ({ content: "Saved campus draft", audience: "platform", courseId: null, media: null, ...overrides });
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture(t, options = {}) {
  const indexedDB = new IDBFactory();
  const instances = [];
  const create = (more = {}, implementation = api) => {
    const store = implementation.createPublishDraftStore({ indexedDB, debounceMs: 0, ...options, ...more });
    instances.push(store); return store;
  };
  t.after(() => instances.forEach((store) => store.dispose()));
  return { indexedDB, create };
}
async function rawDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(api.PUBLISH_DRAFT_DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function rawRecords(indexedDB) {
  const db = await rawDatabase(indexedDB);
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function replaceRaw(indexedDB, record) {
  const db = await rawDatabase(indexedDB);
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(record);
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

test("no database opens, draft reads or writes occur before a server-confirmed owner is supplied", async (t) => {
  const f = fixture(t);
  const open = f.indexedDB.open.bind(f.indexedDB);
  let opened = 0;
  f.indexedDB.open = (...args) => { opened++; return open(...args); };
  const store = f.create();
  assert.equal((await store.load()).status, "inactive");
  assert.equal((await store.saveNow(draft())).status, "inactive");
  assert.equal((await store.scheduleSave(draft())).status, "inactive");
  store.setOwner({ publicId: "owner-a", confirmed: false });
  assert.equal((await store.load()).status, "inactive");
  assert.equal(opened, 0);
  store.setOwner(owner("owner-a"));
  assert.equal((await store.load()).record, null);
  assert.equal(opened, 1);
});

test("durable ordered photos retain bytes, metadata and order through reload and an immutable attempt", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a"));
  const photos = ["z.png", "a.png", "last.png"].map((name, index) => new File([new Uint8Array([137, 80, index])], name, { type: "image/png", lastModified: index + 1 }));
  const state = attemptApi.createPublishAttempt(() => "ordered-persist-01");
  const attempt = state.begin(draft({ media: photos[0], mediaFiles: photos }));
  assert.equal((await store.preparePublish(attempt)).status, "prepared");
  store.dispose();
  const restored = f.create(); restored.setOwner(owner("owner-a"));
  const { record } = await restored.load();
  assert.equal(record.schemaVersion, 2);
  assert.deepEqual(Array.from(record.mediaFiles, (file) => file.name), ["z.png", "a.png", "last.png"]);
  assert.equal(record.media, record.mediaFiles[0]);
  assert.equal(record.immutableAttempt.key, attempt.key);
  for (let index = 0; index < photos.length; index++) {
    assert.deepEqual(new Uint8Array(await record.mediaFiles[index].arrayBuffer()), new Uint8Array(await photos[index].arrayBuffer()));
    assert.equal(record.mediaFiles[index].lastModified, index + 1);
  }
  const changed = await restored.saveNow(draft({ media: photos[2], mediaFiles: [...photos].reverse() }));
  assert.equal(changed.status, "recovery-required");
  assert.equal(changed.record.mediaFiles[0].name, "z.png");
});

test("debounced ordered selection copies the caller array and rejects mixed, excessive or inconsistent drafts", async (t) => {
  const f = fixture(t);
  const store = f.create({ debounceMs: 5 }); store.setOwner(owner("owner-a"));
  const photos = [1, 2].map((value) => new File([`${value}`], `${value}.png`, { type: "image/png" }));
  const save = store.scheduleSave(draft({ media: photos[0], mediaFiles: photos }));
  photos.reverse();
  assert.equal((await save).status, "saved");
  assert.deepEqual(Array.from((await store.load()).record.mediaFiles, (file) => file.name), ["1.png", "2.png"]);
  const video = new File(["video"], "one.mp4", { type: "video/mp4" });
  for (const mediaFiles of [[photos[0], video], [...photos, ...photos, photos[0]], [video, video]]) {
    assert.equal((await store.saveNow(draft({ media: mediaFiles[0], mediaFiles }))).reason, "invalid");
  }
  assert.equal((await store.saveNow(draft({ media: null, mediaFiles: photos }))).reason, "invalid");
});

test("a tampered persisted photo order cannot replace the immutable publishing payload", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a"));
  const mediaFiles = [1, 2, 3].map((value) => new File([`${value}`], `${value}.png`, { type: "image/png" }));
  await store.preparePublish({ key: "tamper-order-01", draft: draft({ media: mediaFiles[0], mediaFiles }), uncertain: true });
  const [row] = await rawRecords(f.indexedDB);
  // Keep the top-level alias valid while changing only the immutable copy's tail order.
  row.immutableAttempt.draft = { ...row.immutableAttempt.draft, mediaFiles: [row.mediaFiles[0], row.mediaFiles[2], row.mediaFiles[1]] };
  await replaceRaw(f.indexedDB, row);
  const restored = await store.load();
  assert.equal(restored.discarded, "invalid");
  assert.equal(restored.record, null);
});

test("reload restores original File bytes/metadata and immutable key; no token or cookie fields are persisted", async (t) => {
  const f = fixture(t);
  const first = f.create(); first.setOwner(owner("owner-a"));
  const file = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "original-phone.png", { type: "image/png", lastModified: 123456 });
  const state = attemptApi.createPublishAttempt(() => "durable-key-001");
  const attempt = state.begin(draft({ media: file }));
  const prepared = await first.preparePublish(attempt);
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.attempt.key, attempt.key);
  first.dispose();
  const next = f.create(); next.setOwner(owner("owner-a"));
  const restored = await next.load();
  assert.equal(restored.status, "loaded");
  assert.equal(restored.record.owner, "owner-a");
  assert.equal(restored.record.schemaVersion, 1);
  assert.equal(restored.record.media.name, file.name);
  assert.equal(restored.record.media.type, file.type);
  assert.equal(restored.record.media.lastModified, file.lastModified);
  assert.deepEqual([...new Uint8Array(await restored.record.media.arrayBuffer())], [...new Uint8Array(await file.arrayBuffer())]);
  assert.equal(restored.record.immutableAttempt.key, attempt.key);
  assert.equal(restored.record.immutableAttempt.uncertain, true);
  const resumed = attemptApi.createPublishAttempt(() => "must-not-generate-new-key");
  assert.equal(resumed.resume(restored.record.immutableAttempt), true);
  assert.equal(resumed.begin(draft({ content: "later edit", media: null })).key, attempt.key);
  assert.equal(resumed.snapshot().draft.media.name, file.name);
  assert.equal(resumed.resume(restored.record.immutableAttempt), false);
  const raw = (await rawRecords(f.indexedDB))[0];
  assert.deepEqual(Object.keys(raw).sort(), ["audience", "content", "courseId", "createdAt", "expiresAt", "immutableAttempt", "media", "owner", "schemaVersion", "updatedAt"].sort());
});

test("owner switch and 401 suspension cannot expose another owner's draft or apply a stale asynchronous load", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a"));
  assert.equal((await store.saveNow(draft({ content: "A private draft" }))).status, "saved");
  const pending = store.load();
  store.setOwner(owner("owner-b"));
  assert.equal((await pending).status, "stale");
  assert.equal((await store.load()).record, null);
  await store.saveNow(draft({ content: "B private draft" }));
  store.setOwner(null); // Expired session: no disk deletion, but no readable active owner.
  assert.equal((await store.load()).status, "inactive");
  store.setOwner(owner("owner-a"));
  assert.equal((await store.load()).record.content, "A private draft");
  store.setOwner(owner("owner-b"));
  assert.equal((await store.load()).record.content, "B private draft");
  assert.equal((await rawRecords(f.indexedDB)).length, 2);
});

test("debounce supersedes stale autosaves and one owner has one current bounded draft", async (t) => {
  const f = fixture(t, { debounceMs: 1 });
  const store = f.create(); store.setOwner(owner("owner-a"));
  const early = store.scheduleSave(draft({ content: "old" }));
  const latest = store.scheduleSave(draft({ content: "latest" }));
  assert.equal((await early).status, "stale");
  assert.equal((await latest).status, "saved");
  assert.equal((await store.load()).record.content, "latest");
  assert.equal((await rawRecords(f.indexedDB)).length, 1);
  for (const invalid of [draft({ content: "x".repeat(1201) }), draft({ media: new File(["svg"], "a.svg", { type: "image/svg+xml" }) }),
    draft({ media: new File([new Uint8Array(media.POST_IMAGE_MAX_BYTES + 1)], "large.png", { type: "image/png" }) })]) {
    assert.deepEqual(plain(await store.saveNow(invalid)), { status: "unavailable", reason: "invalid" });
  }
  assert.equal((await store.load()).record.content, "latest");
});

test("immutable attempt cannot be replaced by autosave or a new key and publication waits for transaction commit", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a"));
  await store.load();
  const originalTransaction = IDBDatabase.prototype.transaction;
  let committed = false;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = originalTransaction.apply(this, args);
    tx.addEventListener("complete", () => { committed = true; });
    return tx;
  };
  t.after(() => { IDBDatabase.prototype.transaction = originalTransaction; });
  const snapshot = { key: "saved-attempt-001", draft: draft(), uncertain: false };
  const pending = store.preparePublish(snapshot);
  assert.equal(committed, false);
  const prepared = await pending;
  assert.equal(committed, true);
  assert.equal(prepared.status, "prepared");
  const locked = await store.saveNow(draft({ content: "Cannot replace original" }));
  assert.equal(locked.status, "recovery-required");
  assert.equal(locked.record.content, draft().content);
  const conflicting = await store.preparePublish({ ...snapshot, key: "different-key-002" });
  assert.equal(conflicting.status, "recovery-required");
  const retry = await store.preparePublish({ ...snapshot, draft: draft({ content: "Incorrect retry body" }) });
  assert.equal(retry.status, "prepared");
  assert.equal(retry.attempt.draft.content, draft().content);
  assert.equal((await store.clearCurrent("different-key-002")).status, "stale");
  assert.equal((await store.clearCurrent(snapshot.key)).status, "cleared");
  assert.equal((await store.load()).record, null);
});

test("explicit logout globally invalidates queued writes across instances and removes all stored owners", async (t) => {
  const f = fixture(t, { debounceMs: 100 });
  let invalidations = 0;
  const a = f.create(); a.setOwner(owner("owner-a"));
  const b = f.create({ onInvalidate: () => { invalidations++; } }); b.setOwner(owner("owner-b"));
  await a.saveNow(draft()); await b.saveNow(draft());
  const queued = b.scheduleSave(draft({ content: "must not reappear after logout" }));
  const clear = await a.clearOnExplicitLogout();
  assert.equal(clear.status, "cleared");
  assert.equal((await queued).status, "stale");
  assert.equal((await b.load()).status, "inactive");
  assert.ok(invalidations >= 2);
  assert.deepEqual(await rawRecords(f.indexedDB), []);
  b.setOwner(owner("owner-b"));
  assert.equal((await b.load()).record, null);
});

test("logout after put succeeds but before transaction commit aborts the write and cannot report prepared", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a")); await store.load();
  const originalPut = IDBObjectStore.prototype.put;
  let clear;
  let triggered;
  const began = new Promise((resolve) => { triggered = resolve; });
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args);
    if (this.name === "drafts") request.addEventListener("success", () => { clear = store.clearOnExplicitLogout(); triggered(); }, { once: true });
    return request;
  };
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  const pending = store.preparePublish({ key: "in-flight-key-001", draft: draft(), uncertain: false });
  await began;
  assert.equal((await pending).status, "stale");
  assert.equal((await clear).status, "cleared");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
});

test("persisted logout epoch fences a stale independent module even without a BroadcastChannel message", async (t) => {
  const f = fixture(t);
  const first = f.create(); first.setOwner(owner("owner-a")); await first.saveNow(draft());
  const otherContext = f.create({}, module()); otherContext.setOwner(owner("owner-a"));
  await otherContext.load(); // This tab observes the pre-logout epoch.
  assert.equal((await first.clearOnExplicitLogout()).status, "cleared");
  const stale = await otherContext.saveNow(draft({ content: "old tab still open" }));
  assert.equal(stale.status, "inactive");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
});

test("expired and malformed records are discarded; expiry cleanup never loads another owner's file", async (t) => {
  let clock = 1_000_000;
  const f = fixture(t, { now: () => clock });
  const store = f.create(); store.setOwner(owner("owner-a")); await store.saveNow(draft());
  const original = (await rawRecords(f.indexedDB))[0];
  clock += api.PUBLISH_DRAFT_TTL_MS;
  const expired = await store.load();
  assert.equal(expired.record, null); assert.equal(expired.discarded, "expired");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
  clock = original.updatedAt;
  for (const mutation of [{ schemaVersion: 99 }, { createdAt: NaN }, { expiresAt: Infinity }, { audience: "private" }, { media: { file: {}, name: "bad.png" } },
    { immutableAttempt: { key: "bad key", draft: original, uncertain: true } }, { immutableAttempt: { key: 123456789, draft: original, uncertain: true } }]) {
    await replaceRaw(f.indexedDB, { ...original, ...mutation });
    const result = await store.load();
    assert.equal(result.status, "loaded"); assert.equal(result.record, null); assert.equal(result.discarded, "invalid");
  }
  await replaceRaw(f.indexedDB, { ...original, owner: "expired-other" });
  clock += api.PUBLISH_DRAFT_TTL_MS;
  await store.saveNow(draft({ content: "current" }));
  const remaining = await rawRecords(f.indexedDB);
  assert.equal(remaining.length, 1); assert.equal(remaining[0].owner, "owner-a");
});

test("quota, denied and unavailable storage never claim saved or prepared and never erase the in-memory draft", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a")); await store.load();
  const input = draft();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "drafts") throw new DOMException("Injected disk quota", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  assert.deepEqual(plain(await store.saveNow(input)), { status: "unavailable", reason: "quota" });
  assert.deepEqual(plain(await store.preparePublish({ key: "quota-key-001", draft: input, uncertain: false })), { status: "unavailable", reason: "quota" });
  assert.equal(input.content, draft().content);
  assert.deepEqual(await rawRecords(f.indexedDB), []);
  const denied = api.createPublishDraftStore({ indexedDB: { open() { throw new DOMException("Storage denied", "SecurityError"); } } });
  t.after(() => denied.dispose()); denied.setOwner(owner("owner-a"));
  assert.deepEqual(plain(await denied.load()), { status: "unavailable", reason: "denied" });
  const unsupported = api.createPublishDraftStore(); t.after(() => unsupported.dispose()); unsupported.setOwner(owner("owner-a"));
  assert.deepEqual(plain(await unsupported.saveNow(input)), { status: "unavailable", reason: "unsupported" });
});

test("logout during database opening and dispose during debounce leave no late writes or stale records", async (t) => {
  const f = fixture(t, { debounceMs: 100 });
  const store = f.create(); store.setOwner(owner("owner-a"));
  const writing = store.saveNow(draft());
  const clearing = store.clearOnExplicitLogout();
  assert.equal((await writing).status, "stale");
  assert.equal((await clearing).status, "cleared");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
  store.setOwner(owner("owner-a"));
  const pending = store.scheduleSave(draft());
  store.dispose();
  assert.equal((await pending).status, "stale");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
});

test("a newly confirmed session waits for an in-flight logout clear before writing its new draft", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a")); await store.saveNow(draft());
  const clearing = store.clearOnExplicitLogout();
  store.setOwner(owner("owner-b"));
  const next = store.saveNow(draft({ content: "New authenticated session" }));
  assert.equal((await clearing).status, "cleared");
  assert.equal((await next).status, "saved");
  const records = await rawRecords(f.indexedDB);
  assert.equal(records.length, 1); assert.equal(records[0].owner, "owner-b");
  assert.equal((await store.load()).record.content, "New authenticated session");
});

test("a denied logout clear is reported honestly and blocks subsequent storage access until clear succeeds", async (t) => {
  const f = fixture(t);
  const store = f.create(); store.setOwner(owner("owner-a")); await store.saveNow(draft());
  const originalClear = IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear = function () { throw new DOMException("Storage disabled", "SecurityError"); };
  t.after(() => { IDBObjectStore.prototype.clear = originalClear; });
  assert.deepEqual(plain(await store.clearOnExplicitLogout()), { status: "unavailable", reason: "denied" });
  assert.equal((await store.load()).status, "inactive");
  store.setOwner(owner("owner-a"));
  assert.deepEqual(plain(await store.load()), { status: "unavailable", reason: "denied" });
  assert.deepEqual(plain(await store.saveNow(draft({ content: "must not overwrite" }))), { status: "unavailable", reason: "denied" });
  assert.equal((await rawRecords(f.indexedDB))[0].content, draft().content);
  IDBObjectStore.prototype.clear = originalClear;
  assert.equal((await store.clearOnExplicitLogout()).status, "cleared");
  assert.deepEqual(await rawRecords(f.indexedDB), []);
});
