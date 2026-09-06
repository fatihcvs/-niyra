import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const [source, mediaSource, keysSource, fileSource, uploadsSource] = await Promise.all([compile("../app/api/campus-market/images/route.ts"), compile("../lib/market-media-idempotency.ts"), compile("../lib/market-idempotency.ts"), compile("../lib/file-response.ts"), compile("../lib/media-upload-operations.ts")]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=", "base64");
const photoKey = "media:durable-request-0001";

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON");
  migrations.forEach((migration) => database.exec(migration));
  database.exec("INSERT INTO universities (id,name,short_name,city) VALUES ('campus','Campus','UNI','City'),('other','Other','OTH','City'); INSERT INTO users (email,display_name,handle) VALUES ('owner@test.local','Owner','owner'),('other@test.local','Other','other'); INSERT INTO marketplace_listings (id,university_id,owner_email,kind,category,title,description) VALUES ('listing','campus','owner@test.local','sell','books','Book','A campus listing');");
  let batchFault = null, deferred = null, putHook = null, deleteHook = null, calls = 0;
  database.exec("UPDATE users SET public_id=handle");
  let owner = "owner@test.local", campus = "campus", limited = false;
  const objects = new Map(), deleted = [];
  const execute = (statements) => {
    database.exec("BEGIN");
    try { for (const item of statements) database.prepare(item.sql).run(...item.values); database.exec("COMMIT"); return []; }
    catch (cause) { database.exec("ROLLBACK"); throw cause; }
  };
  const DB = {
    prepare(sql) {
      return { bind(...values) { return {
        sql, values,
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async run() { return database.prepare(sql).run(...values); },
      }; } };
    },
    async batch(statements) {
      const stage = statements[0].sql.includes("SET response_json") ? "commit" : statements[0].sql.includes("INSERT OR IGNORE INTO market_media_tombstones") ? "delete" : "register";
      if (batchFault?.stage === stage) {
        const fault = batchFault; batchFault = null;
        if (fault.kind === "delayed") { deferred = statements; throw new Error("Lost delayed batch acknowledgement"); }
        execute(statements); throw new Error("Committed batch acknowledgement lost");
      }
      return execute(statements);
    },
  };
  const FILES = {
    async put(key, bytes) { objects.set(key, Buffer.from(bytes)); calls++; if (putHook) await putHook(key, calls); },
    async delete(key) { if (deleteHook) await deleteHook(key); deleted.push(key); objects.delete(key); },
    async get(key) { const bytes = objects.get(key); return bytes ? { body: bytes, size: bytes.length, writeHttpMetadata() {} } : null; },
  };
  const server = {
    cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "",
    getRuntime: async () => ({ DB, FILES }), requireIdentity: async () => ({ email: owner }), requireProfile: async () => ({ university_id: campus, public_id: database.prepare('SELECT public_id FROM users WHERE email=?').get(owner)?.public_id }),
    enforceRateLimit: async () => ({ allowed: !limited, retryAfter: 1 }), rateLimitResponse: () => Response.json({ error: "quota" }, { status: 429 }),
    signInResponse: () => Response.json({ error: "auth" }, { status: 401 }), unavailableResponse: () => Response.json({ error: "Temporary failure" }, { status: 503 }),
  };
  const modules = {};
  const globals = { File, FormData, Response, Request, Headers, URL, Uint8Array, TextEncoder, crypto };
  for (const [name, code] of [["uploads", uploadsSource], ["keys", keysSource], ["media", mediaSource], ["file", fileSource], ["route", source]]) {
    const loadedExports = {};
    runInNewContext(code, { ...globals, exports: loadedExports, require(path) {
      if (path.endsWith("/server-api")) return server;
      if (path.endsWith("/market-idempotency")) return modules.keys;
      if (path.endsWith("/market-media-idempotency")) return modules.media;
      if (path.endsWith("/file-response")) return modules.file;
      if (path.endsWith("/media-upload-operations")) return modules.uploads;
      throw new Error(`Unexpected import ${path}`);
    } });
    modules[name] = loadedExports;
  }
  return {
    database, objects, deleted, DB, FILES, modules,
    calls: () => calls,
    batchFault(kind, stage = "commit") { batchFault = { kind, stage }; },
    putHook(value) { putHook = value; }, deleteHook(value) { deleteHook = value; },
    identity(email, university = "campus") { owner = email; campus = university; }, limited(value) { limited = value; },
    executeDeferred() { const statements = deferred; deferred = null; return execute(statements); },
    remove(id) { return modules.route.DELETE(new Request("https://kampira.test/api/campus-market/images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })); },
    get(id) { return modules.route.GET(new Request(`https://kampira.test/api/campus-market/images?id=${id}`)); },
    async post(count = 2, { key = photoKey, listingId = "listing", filenames, contents } = {}) {
      const body = new FormData(); body.set("listingId", listingId);
      for (let index = 0; index < count; index++) body.append("images", new File([contents?.[index] ?? png], filenames?.[index] ?? `${index}.png`, { type: "image/png" }));
      return modules.route.POST(new Request("https://kampira.test/api/campus-market/images", { method: "POST", body, headers: key === null ? {} : { "Idempotency-Key": key } }));
    },
  };
}

const imageRows = (f) => f.database.prepare("SELECT id,object_key,sort_order FROM marketplace_listing_images ORDER BY sort_order").all();
for (const change of ["status='deleting'", "public_id='fresh-owner-generation'"]) test(`market PUT settlement cannot publish through changed account ${change}`, async t => {
  const f = fixture(t); let changed = false; f.putHook(() => { if (!changed) { changed = true; f.database.exec(`UPDATE users SET ${change} WHERE email='owner@test.local'`); } });
  assert.equal((await f.post(1)).status, 503); assert.equal(imageRows(f).length, 0);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='settled' AND owner_public_id='owner'").get().n, 1);
});
const auditCount = (f, action = "market-listing.images-added") => f.database.prepare("SELECT count(*) AS n FROM audit_logs WHERE action=?").get(action).n;
async function until(check) { for (let index = 0; index < 200 && !check(); index++) await new Promise((resolve) => setTimeout(resolve, 1)); assert.ok(check(), "timed out waiting for fixture barrier"); }

test("committed response loss replays the same ordered images without uploading or charging quota again", async (t) => {
  const f = fixture(t); f.batchFault("committed");
  const initial = await f.post(); assert.equal(initial.status, 201); const body = await initial.json();
  assert.equal(body.idempotentReplay, true); assert.equal(initial.headers.get("Idempotency-Replayed"), "true");
  f.limited(true); const retry = await f.post(); assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), body);
  assert.equal(f.calls(), 2); assert.equal(imageRows(f).length, 2); assert.equal(f.objects.size, 2); assert.equal(auditCount(f), 1); assert.deepEqual(f.deleted, []);
  assert.deepEqual(imageRows(f).map((row) => row.id), body.images.map((image) => image.id));
});

test("audit failure rolls the winning receipt and image metadata back atomically, then safely cleans settled uploads", async (t) => {
  const f = fixture(t); f.database.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit down'); END");
  assert.equal((await f.post()).status, 503); assert.equal(imageRows(f).length, 0); assert.equal(f.objects.size, 0);
  assert.equal(f.database.prepare("SELECT response_json FROM market_media_requests").get().response_json, null);
  f.database.exec("DROP TRIGGER reject_audit"); assert.equal((await f.post()).status, 201); assert.equal(imageRows(f).length, 2); assert.equal(auditCount(f), 1);
});

test("a delayed final batch cannot publish after the durable token fence, even after a same-key retry wins", async (t) => {
  const f = fixture(t); f.batchFault("delayed"); assert.equal((await f.post()).status, 503);
  assert.equal(imageRows(f).length, 0); assert.equal(f.objects.size, 0);
  const retry = await f.post(); assert.equal(retry.status, 201); const winner = await retry.json();
  f.executeDeferred(); assert.equal(imageRows(f).length, 2); assert.equal(auditCount(f), 1);
  assert.deepEqual(imageRows(f).map((row) => row.id), winner.images.map((image) => image.id));
  for (const row of imageRows(f)) assert.ok(f.objects.has(row.object_key));
});

test("fulfilled PUT siblings are cleaned while rejected unknown PUTs remain quarantined across a same-key retry", async (t) => {
  const f = fixture(t); let release; const delayed = new Promise((resolve) => { release = resolve; });
  f.putHook(async (_key, count) => { if (count === 1) throw new Error("First failed"); await delayed; });
  const request = f.post(); await until(() => f.calls() === 2); const oldKeys = [...f.objects.keys()]; assert.equal(f.deleted.length, 0);
  release(); assert.equal((await request).status, 503); assert.equal(f.objects.size, 1); assert.equal(f.deleted.length, 1);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='unknown'").get().n, 1);
  f.putHook(null); assert.equal((await f.post()).status, 201); for (const row of imageRows(f)) assert.ok(!oldKeys.includes(row.object_key));
  assert.equal(f.objects.size, 3);
});

test("concurrent same-key attempt is fenced but its unknown in-flight PUTs remain quarantined until every sibling settles", async (t) => {
  const f = fixture(t); let release; const delayed = new Promise((resolve) => { release = resolve; });
  f.putHook(async (_key, count) => { if (count <= 2) await delayed; });
  const first = f.post(); await until(() => f.calls() === 2); const originalKeys = [...f.objects.keys()];
  const second = await f.post(); assert.equal(second.status, 201); const winner = await second.json();
  assert.equal(f.objects.size, 4); for (const key of originalKeys) assert.ok(!f.deleted.includes(key));
  release(); const previous = await first; assert.equal(previous.status, 201); assert.deepEqual((await previous.json()).images, winner.images);
  assert.equal(f.objects.size, 2); assert.equal(imageRows(f).length, 2); assert.equal(auditCount(f), 1); for (const key of originalKeys) assert.ok(f.deleted.includes(key));
});

test("different-key capacity race is checked in the winner transaction and preserves stable ordinals", async (t) => {
  const f = fixture(t); let release; const delayed = new Promise((resolve) => { release = resolve; });
  f.putHook(async () => { await delayed; });
  const first = f.post(4, { key: "media:capacity-a" }); const second = f.post(4, { key: "media:capacity-b" });
  await until(() => f.calls() === 8); release();
  assert.deepEqual((await Promise.all([first, second])).map((response) => response.status).sort(), [201, 409]);
  assert.equal(imageRows(f).length, 4); assert.equal(f.objects.size, 4); assert.equal(auditCount(f), 1);
  assert.deepEqual(imageRows(f).map((row) => row.sort_order), [0, 1, 2, 3]);
});

test("ordered filenames and bytes are immutable under the request key; wrong owner and campus cannot replay", async (t) => {
  const f = fixture(t); assert.equal((await f.post()).status, 201);
  assert.equal((await f.post(2, { filenames: ["1.png", "0.png"] })).status, 409);
  assert.equal((await f.post(2, { contents: [Buffer.concat([png, Buffer.from("changed")]), png] })).status, 409);
  f.identity("other@test.local"); assert.equal((await f.post()).status, 404);
  f.identity("owner@test.local", "other"); assert.equal((await f.post()).status, 404);
  assert.equal(f.calls(), 2); assert.equal(imageRows(f).length, 2);
});

test("cleanup failure persists a queue entry which an actual successful replay reconciles", async (t) => {
  const f = fixture(t); f.deleteHook(async () => { throw new Error("R2 delete unavailable"); });
  f.database.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit down'); END");
  assert.equal((await f.post()).status, 503); assert.equal(f.objects.size, 2);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM market_media_attempt_objects WHERE cleaned_at IS NULL").get().n, 2);
  f.database.exec("DROP TRIGGER reject_audit"); assert.equal((await f.post()).status, 201); assert.equal(f.objects.size, 4);
  f.deleteHook(null); assert.equal((await f.post()).status, 201); assert.equal(f.objects.size, 2); assert.equal(f.deleted.length, 2);
});

test("metadata or audit deletion failure preserves the visible object and no tombstone can escape a rollback", async (t) => {
  const f = fixture(t); assert.equal((await f.post()).status, 201); const { id, object_key } = imageRows(f)[0];
  f.database.exec("CREATE TRIGGER block_image_delete BEFORE DELETE ON marketplace_listing_images BEGIN SELECT RAISE(ABORT,'DB down'); END");
  assert.equal((await f.remove(id)).status, 503); assert.ok(f.objects.has(object_key)); assert.equal((await f.get(id)).status, 200);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM market_media_tombstones").get().n, 0);
  f.database.exec("DROP TRIGGER block_image_delete; CREATE TRIGGER block_delete_audit BEFORE INSERT ON audit_logs WHEN NEW.action='market-listing.image-removed' BEGIN SELECT RAISE(ABORT,'audit down'); END");
  assert.equal((await f.remove(id)).status, 503); assert.equal((await f.get(id)).status, 200); assert.ok(f.objects.has(object_key));
});

test("committed image deletion keeps a durable tombstone, retries failed R2 cleanup, and old POST cannot resurrect it", async (t) => {
  const f = fixture(t); assert.equal((await f.post()).status, 201); const { id, object_key } = imageRows(f)[0];
  f.deleteHook(async () => { throw new Error("R2 unavailable"); }); f.batchFault("committed", "delete");
  const removed = await f.remove(id); assert.equal(removed.status, 200); assert.deepEqual(await removed.json(), { deleted: true, id });
  assert.equal((await f.get(id)).status, 404); assert.ok(f.objects.has(object_key)); assert.equal((await f.post()).status, 410);
  f.deleteHook(null); assert.equal((await f.remove(id)).status, 200); assert.equal(f.objects.has(object_key), false); assert.equal(auditCount(f, "market-listing.image-removed"), 1);
  assert.equal((await f.post()).status, 410); assert.equal(imageRows(f).length, 1);
  f.identity("other@test.local"); assert.equal((await f.remove(id)).status, 404);
});

test("delayed delete acknowledgement cannot delete R2 until metadata removal really commits", async (t) => {
  const f = fixture(t); assert.equal((await f.post()).status, 201); const { id, object_key } = imageRows(f)[0];
  f.batchFault("delayed", "delete"); assert.equal((await f.remove(id)).status, 503); assert.ok(f.objects.has(object_key)); assert.equal((await f.get(id)).status, 200);
  f.executeDeferred(); assert.equal((await f.remove(id)).status, 200); assert.equal(f.objects.has(object_key), false); assert.equal((await f.post()).status, 410);
});

test("a known closed or removed listing permanently ends the key even if the listing reopens", async (t) => {
  const f = fixture(t); f.putHook(async () => { throw new Error("interrupted"); }); assert.equal((await f.post()).status, 503);
  f.database.exec("UPDATE marketplace_listings SET status='sold' WHERE id='listing'"); assert.equal((await f.post()).status, 410);
  f.database.exec("UPDATE marketplace_listings SET status='active' WHERE id='listing'"); f.putHook(null); assert.equal((await f.post()).status, 410); assert.equal(imageRows(f).length, 0);
  assert.equal((await f.post(2, { key: "media:new-explicit-action" })).status, 201);
  f.database.exec("DELETE FROM marketplace_listings WHERE id='listing'"); assert.equal((await f.post(2, { key: "media:new-explicit-action" })).status, 410); assert.equal(f.objects.size, 2);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='unknown'").get().n, 2);
});

test("a closed listing on the first request also persists a terminal receipt", async (t) => {
  const f = fixture(t); f.database.exec("UPDATE marketplace_listings SET status='sold' WHERE id='listing'"); assert.equal((await f.post()).status, 410);
  f.database.exec("UPDATE marketplace_listings SET status='active' WHERE id='listing'"); assert.equal((await f.post()).status, 410); assert.equal(f.calls(), 0);
});

test("unacknowledged attempt registration never starts PUT and its delayed manifest cannot resurrect cleaned uploads", async (t) => {
  const f = fixture(t); f.batchFault("delayed", "register"); assert.equal((await f.post()).status, 503); assert.equal(f.calls(), 0);
  f.executeDeferred(); assert.equal((await f.post()).status, 201); assert.equal(f.calls(), 2); assert.equal(f.objects.size, 2); assert.equal(imageRows(f).length, 2);
});

test("headerless uploads remain separate operations and malformed supplied keys cannot create manifests", async (t) => {
  const f = fixture(t); assert.equal((await f.post(1, { key: "bad" })).status, 400); assert.equal(f.calls(), 0);
  assert.equal((await f.post(1, { key: null })).status, 201); assert.equal((await f.post(1, { key: null })).status, 201);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM market_media_requests").get().n, 2); assert.equal(imageRows(f).length, 2);
});
