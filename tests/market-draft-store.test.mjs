import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { IDBFactory, IDBObjectStore } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";

const source = ts.transpileModule(await readFile(new URL("../lib/market-draft-store.ts", import.meta.url), "utf8"), {
  fileName: "market-draft-store.ts", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
runInNewContext(source, { exports: api, File, Blob, DOMException, setTimeout, clearTimeout });
const plain = (value) => JSON.parse(JSON.stringify(value));
const draft = (changes = {}) => ({ ...api.emptyMarketDraft(), kind: "wanted", forms: { listing: { title: "Course book", description: "A good campus book", price: "25.50", category: "books", condition: "used-good", meetupPlace: "Library" }, price: { placeId: "cafe", placeName: "Campus cafe", itemName: "Lunch", category: "food", price: "85", observedAt: "2026-09-06", sourceNote: "Menu price" }, "contact:listing-a": { message: "Is it available?" } }, ...changes });
const attempt = (images = []) => ({ kind: "listing", payload: { action: "listing", kind: "wanted", title: "Course book", description: "A good campus book", price: "25.50", category: "books", condition: "used-good", meetupPlace: "Library" }, images, phase: "create-unknown", key: "market:immutable-request-001" });
const owner = (id = "owner-a") => ({ publicId: id, confirmed: true });
function setup(t, options = {}) {
  const indexedDB = options.indexedDB ?? new IDBFactory();
  const store = api.createMarketDraftStore({ indexedDB, ...options }); t.after(() => store.dispose());
  store.setOwner(owner()); return { store, indexedDB };
}

test("market durable drafts do not touch storage before a confirmed owner and preserve all form buckets", async (t) => {
  const indexedDB = new IDBFactory(), open = indexedDB.open.bind(indexedDB); let opens = 0;
  indexedDB.open = (...args) => { opens++; return open(...args); };
  const store = api.createMarketDraftStore({ indexedDB }); t.after(() => store.dispose());
  assert.equal((await store.load()).status, "inactive"); assert.equal((await store.save(draft(), 0)).status, "inactive"); assert.equal(opens, 0);
  store.setOwner({ publicId: "owner-a", confirmed: false }); assert.equal((await store.load()).status, "inactive");
  store.setOwner(owner()); const saved = await store.save(draft(), 0); assert.equal(saved.status, "saved");
  const other = setup(t, { indexedDB }).store; const loaded = await other.load(); assert.equal(loaded.status, "loaded");
  assert.deepEqual(plain(loaded.record.forms), plain(draft().forms)); assert.equal(loaded.record.kind, "wanted");
  other.setOwner(owner("owner-b")); assert.equal((await other.load()).record, null);
});

test("market ordered files retain exact bytes and metadata after closing and reopening the store", async (t) => {
  const { store, indexedDB } = setup(t);
  const images = [new File([new Uint8Array([1, 2, 3])], "first.png", { type: "image/png", lastModified: 101 }), new File([new Uint8Array([4, 5, 6, 7])], "second.webp", { type: "image/webp", lastModified: 202 })];
  const input = draft({ images, recovery: attempt(images) });
  assert.equal((await store.save(input, 0)).status, "saved"); store.dispose();
  const reopened = setup(t, { indexedDB }).store, loaded = await reopened.load();
  assert.equal(loaded.status, "loaded"); assert.deepEqual(Array.from(loaded.record.images, (file) => [file.name, file.type, file.lastModified]), [["first.png", "image/png", 101], ["second.webp", "image/webp", 202]]);
  assert.deepEqual(Array.from(new Uint8Array(await loaded.record.images[1].arrayBuffer())), [4, 5, 6, 7]);
  assert.equal(loaded.record.recovery.key, input.recovery.key); assert.equal(loaded.record.recovery.images[0], loaded.record.images[0]);
});

test("market persisted immutable attempts ignore altered content or bytes and require the exact resolution key", async (t) => {
  const { store } = setup(t), original = new File(["original"], "photo.png", { type: "image/png", lastModified: 1 });
  const first = await store.save(draft({ images: [original], recovery: attempt([original]), contacts: { "listing-a": { message: "Original message", key: "inquiry-request-001", title: "Book" } } }), 0);
  const replacement = new File(["different"], "photo.png", { type: "image/png", lastModified: 1 });
  const edited = draft({ images: [replacement], recovery: { ...attempt([replacement]), payload: { ...attempt().payload, title: "Changed payload" } }, contacts: { "listing-a": { message: "Changed message", key: "inquiry-request-001", title: "Changed title" } } });
  const saved = await store.save(edited, first.record.revision);
  assert.equal(saved.status, "saved"); assert.equal(saved.record.recovery.payload.title, "Course book"); assert.equal(await saved.record.recovery.images[0].text(), "original"); assert.equal(saved.record.contacts["listing-a"].message, "Original message");
  assert.equal((await store.save(draft(), saved.record.revision, ["wrong-resolution-001"])).status, "conflict");
  const cleared = await store.save(draft(), saved.record.revision, [attempt().key, "inquiry-request-001"]); assert.equal(cleared.status, "saved"); assert.equal(cleared.record.recovery, null); assert.deepEqual(plain(cleared.record.contacts), {});
});

test("market quota and unavailable storage do not report saved and leave the old durable state unchanged", async (t) => {
  const { store } = setup(t); const first = await store.save(draft(), 0);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === "drafts") throw new DOMException("Injected quota", "QuotaExceededError"); return put.apply(this, args); };
  let result;
  try { result = await store.save(draft({ kind: "free" }), first.record.revision); } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(plain(result), { status: "unavailable", reason: "quota" }); assert.equal((await store.load()).record.kind, "wanted");
  const unsupported = api.createMarketDraftStore(); t.after(() => unsupported.dispose()); unsupported.setOwner(owner()); assert.deepEqual(plain(await unsupported.load()), { status: "unavailable", reason: "unsupported" });
});

test("market storage validates bounds, supported files, target buckets and immutable payload fields", async (t) => {
  const { store } = setup(t);
  const invalid = [draft({ images: [new File(["gif"], "image.gif", { type: "image/gif" })] }), draft({ images: Array.from({ length: 7 }, () => new File(["png"], "photo.png", { type: "image/png" })) }), draft({ forms: { "contact:../other": { message: "invalid" } } }), draft({ recovery: { ...attempt(), payload: { ...attempt().payload, token: "never persist auth material" } } }), draft({ contacts: { listing: { message: "x", key: "bad" } } })];
  for (const input of invalid) assert.deepEqual(plain(await store.save(input, 0)), { status: "unavailable", reason: "invalid" });
  assert.equal((await store.load()).record, null);
});

test("market ordinary draft load does not renew TTL and expired editable records disappear only for their owner", async (t) => {
  let now = 1_000;
  const { store } = setup(t, { now: () => now }); const saved = await store.save(draft(), 0);
  now += 1_000; assert.equal((await store.load()).record.updatedAt, saved.record.updatedAt);
  now += api.MARKET_DRAFT_TTL_MS; const expired = await store.load(); assert.equal(expired.status, "loaded"); assert.equal(expired.record, null); assert.equal(expired.discarded, "expired");
});

test("resolved contact form buckets do not exhaust the active draft limit after many conversations", async (t) => {
  const { store } = setup(t);let revision=0;const forms={listing:{title:"Still editable"}};
  for(let index=0;index<40;index++){
    const id=`listing-${index}`,key=`request-contact-${index}`;forms[`contact:${id}`]={message:"A campus question"};
    const prepared=await store.save(draft({forms,contacts:{[id]:{key,message:"A campus question"}}}),revision);assert.equal(prepared.status,"saved");revision=prepared.record.revision;
    forms[`contact:${id}`]={};
    const cleared=await store.save(draft({forms}),revision,[key]);assert.equal(cleared.status,"saved");revision=cleared.record.revision;
    assert.equal(Object.keys(cleared.record.forms).length,1);
  }
  assert.equal((await store.load()).record.forms.listing.title,"Still editable");
});
