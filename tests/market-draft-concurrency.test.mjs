import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { IDBFactory } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";

const source = ts.transpileModule(readFileSync(new URL("../lib/market-draft-store.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function implementation() { const exports = {}; runInNewContext(source, { exports, File, Blob, DOMException, setTimeout, clearTimeout }); return exports; }
const attempt = (overrides = {}) => ({ kind: "listing", key: "market:immutable-key", payload: { action: "listing", title: "Kitap", description: "Ders kitabı", kind: "sell" }, images: [], phase: "create-unknown", ...overrides });
function setup(t) {
  const indexedDB = new IDBFactory(); let time = 1_000_000;
  const api = implementation(); const instances = [];
  const create = (module = api, owner = "owner-a") => { const store = module.createMarketDraftStore({ indexedDB, now: () => time }); store.setOwner({ publicId: owner, confirmed: true }); instances.push(store); return store; };
  t.after(() => instances.forEach((store) => store.dispose()));
  return { api, create, tick: (amount = 1) => { time += amount; }, draft: (changes = {}) => ({ ...api.emptyMarketDraft(), ...changes }) };
}

test("a delayed same-key snapshot cannot forget the confirmed listing or restart its creation", async (t) => {
  const f = setup(t), store = f.create();
  const old = f.draft({ recovery: attempt() });
  assert.equal((await store.save(old, 0)).status, "saved");
  const confirmed = f.draft({ recovery: attempt({ phase: "photos-unknown", listingId: "confirmed-listing" }) });
  assert.equal((await store.save(confirmed, 1)).status, "saved");
  const delayed = await store.save(old, 2);
  assert.ok(["saved", "conflict"].includes(delayed.status));
  const restored = (await store.load()).record;
  assert.equal(restored.recovery.listingId, "confirmed-listing");
  assert.equal(restored.recovery.phase, "photos-unknown");
});

test("two independent tabs cannot overwrite the newer immutable request with stale editable data", async (t) => {
  const f = setup(t), first = f.create(), second = f.create(implementation());
  assert.equal((await first.load()).record, null); assert.equal((await second.load()).record, null);
  const snapshot = f.draft({ recovery: attempt() });
  assert.equal((await first.save(snapshot, 0)).status, "saved");
  const conflict = await second.save(f.draft({ forms: { listing: { title: "Old tab text" } } }), 0);
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.record.recovery.key, snapshot.recovery.key);
  assert.equal((await second.save(f.draft(), conflict.record.revision)).status, "conflict", "Even a newly read revision cannot release an unresolved key");
});

test("persistent logout epoch fences a separately loaded module that missed the broadcast", async (t) => {
  const f = setup(t), first = f.create(), second = f.create(implementation());
  await second.load(); await second.save(f.draft({ recovery: attempt() }), 0);
  f.tick(); assert.equal((await first.clearOnExplicitLogout()).status, "cleared");
  assert.ok(["inactive", "stale"].includes((await second.save(f.draft({ recovery: attempt() }), 1)).status));
  f.tick(); const fresh = f.create(); assert.equal((await fresh.load()).record, null);
});

test("logout also fences a stale owner whose first database operation begins afterwards", async (t) => {
  const f = setup(t), first = f.create(), dormant = f.create(implementation());
  f.tick(); await first.clearOnExplicitLogout(); f.tick();
  assert.ok(["inactive", "stale"].includes((await dormant.save(f.draft({ recovery: attempt() }), 0)).status));
  const fresh = f.create(); assert.equal((await fresh.load()).record, null);
});

test("ordinary retention never silently drops the key for an uncertain create or inquiry", async (t) => {
  const f = setup(t), store = f.create();
  const snapshot = f.draft({ recovery: attempt(), contacts: { "listing-b": { key: "market:contact-key", message: "Kitap duruyor mu?" } } });
  await store.save(snapshot, 0); f.tick(f.api.MARKET_DRAFT_TTL_MS * 30);
  const restored = (await f.create(implementation()).load()).record;
  assert.equal(restored.recovery.key, snapshot.recovery.key);
  assert.equal(restored.contacts["listing-b"].key, "market:contact-key");
});

test("a view cleanup exception cannot stop explicit logout from erasing private drafts", async () => {
  const indexedDB = new IDBFactory(), api = implementation(); let throwOnInvalidate = false;
  const first = api.createMarketDraftStore({ indexedDB, onInvalidate() { if (throwOnInvalidate) throw new Error("View has already unmounted"); } });
  const clearing = api.createMarketDraftStore({ indexedDB });
  try {
    first.setOwner({ publicId: "owner-a", confirmed: true });
    await first.save({ ...api.emptyMarketDraft(), recovery: attempt() }, 0);
    throwOnInvalidate = true;
    assert.equal((await clearing.clearOnExplicitLogout()).status, "cleared");
    throwOnInvalidate = false;
    assert.ok(["inactive", "stale"].includes((await first.load()).status));
  } finally { throwOnInvalidate = false; first.dispose(); clearing.dispose(); }
});

test("photo keys and terminal outcomes survive stale same-key saves and a fresh store", async (t) => {
  const f = setup(t), store = f.create();
  const legacy = f.draft({ recovery: attempt({ listingId: "confirmed-listing", phase: "photos-unknown" }) });
  await store.save(legacy, 0);
  assert.equal((await f.create(implementation()).load()).record.recovery.photoKey, undefined, "Legacy unknown uploads never become safe replays by reading them");
  const keyed = f.draft({ recovery: { ...legacy.recovery, photoKey: "market:photo-key-original" } });
  await store.save(keyed, 1);
  await store.save(f.draft({ recovery: { ...keyed.recovery, photoKey: "market:replacement-key" } }), 2);
  await store.save(legacy, 3);
  assert.equal((await store.load()).record.recovery.photoKey, keyed.recovery.photoKey);
  await store.save(f.draft({ recovery: { ...keyed.recovery, phase: "photos-ended" } }), 4);
  await store.save(keyed, 5);
  const restored = (await f.create(implementation()).load()).record.recovery;
  assert.equal(restored.photoKey, keyed.recovery.photoKey); assert.equal(restored.phase, "photos-ended");
});
