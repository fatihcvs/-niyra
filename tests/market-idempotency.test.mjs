import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const migrations = await Promise.all((await readdir(new URL("drizzle/", root))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
  .map((name) => readFile(new URL(`drizzle/${name}`, root), "utf8")));
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const [helperSource, serverSource, routeSource] = await Promise.all([
  "lib/market-idempotency.ts", "lib/server-api.ts", "app/api/campus-market/route.ts",
].map(compile));
const globals = { crypto, Response, Request, Headers, TextEncoder, Uint8Array, URL };
const helpers = {};
runInNewContext(helperSource, { ...globals, exports: helpers });
const listing = { action: "listing", kind: "sell", category: "books", title: "Calculus book", description: "Used course book in good condition", condition: "used-good", price: "25,50", meetupPlace: "Library" };
const price = { action: "price", category: "food", placeName: "Campus cafe", itemName: "Lunch", price: "85", observedAt: new Date().toISOString(), sourceNote: "Seen on the posted menu" };
const inquiry = { action: "inquiry", listingId: "other-listing", message: "Can we meet at the campus library?" };

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((sql) => database.exec(sql));
  database.exec(`INSERT INTO universities (id, name, short_name, city) VALUES ('campus', 'Campus', 'UNI', 'City'), ('outside', 'Outside', 'OUT', 'City');
    INSERT INTO departments (id, name) VALUES ('department', 'Engineering');`);
  for (const user of ["owner", "other", "third"]) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(`${user}@test.local`, user, user, user);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year, onboarding_completed) VALUES (?, 'campus', 'department', 1, 1)")
      .run(`${user}@test.local`);
  }
  database.exec(`INSERT INTO marketplace_listings (id, university_id, owner_email, kind, category, title, description)
    VALUES ('other-listing', 'campus', 'other@test.local', 'sell', 'books', 'Other book', 'Good campus book');`);
  let identity = "owner", quotaCalls = 0, batchFault = null, unavailable = false, deferred = null, gate = null, batchCount = 0, batchHook = null;
  const assertAvailable = () => { if (unavailable) throw new Error("DB unavailable after lost acknowledgement"); };
  const executeBatch = (statements) => {
    database.exec("BEGIN");
    try {
      const results = statements.map(({ query, values }) => ({ success: true, meta: database.prepare(query).run(...values) }));
      database.exec("COMMIT");
      return results;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const DB = {
    prepare(query) { return { bind(...values) { return {
      query, values,
      async first() { assertAvailable(); return database.prepare(query).get(...values) ?? null; },
      async all() { assertAvailable(); return { results: database.prepare(query).all(...values) }; },
      async run() { assertAvailable(); return { success: true, meta: database.prepare(query).run(...values) }; },
    }; } }; },
    async batch(statements) {
      assertAvailable(); batchCount++;
      if (gate) { const current = gate; if (--current.remaining === 0) { gate = null; current.release(); } await current.promise; }
      if (batchHook) { const hook = batchHook; batchHook = null; hook(); }
      const fault = batchFault; batchFault = null;
      if (fault === "delayed") { deferred = statements; throw new Error("Batch outcome pending"); }
      const result = executeBatch(statements);
      if (fault === "committed-unreachable") unavailable = true;
      if (fault) throw new Error("Batch committed but acknowledgement lost");
      return result;
    },
  };
  const server = {};
  runInNewContext(serverSource, { ...globals, exports: server, require(path) {
    assert.equal(path, "../app/chatgpt-auth");
    return { getChatGPTUser: async () => identity ? { email: `${identity}@test.local` } : null };
  } });
  const realRateLimit = server.enforceRateLimit;
  server.getRuntime = async () => ({ DB });
  server.enforceRateLimit = (...args) => { quotaCalls++; return realRateLimit(...args); };
  const route = {};
  runInNewContext(routeSource, { ...globals, exports: route, require(path) {
    if (path === "../../../lib/server-api") return server;
    assert.equal(path, "../../../lib/market-idempotency"); return helpers;
  } });
  return {
    database, count(table) { return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
    signIn(user) { identity = user; }, quotaCalls: () => quotaCalls, batchCount: () => batchCount,
    fault(value) { batchFault = value; }, recover() { unavailable = false; }, commitDeferred() { executeBatch(deferred); deferred = null; },
    concurrent(count) { let release; const promise = new Promise((resolve) => { release = resolve; }); gate = { remaining: count, promise, release }; },
    beforeBatch(callback) { batchHook = callback; },
    post(payload = listing, key = "market-request-001") {
      const headers = { "content-type": "application/json" };
      if (key !== null) headers["Idempotency-Key"] = key;
      return route.POST(new Request("https://kampira.test/api/campus-market", { method: "POST", headers, body: JSON.stringify(payload) }));
    },
  };
}

test("market listing, price and inquiry retries replay one atomic entity and audit without consuming quota", async (t) => {
  for (const [payload, table, expectedCount] of [[listing, "marketplace_listings", 2], [price, "campus_price_reports", 1], [inquiry, "marketplace_inquiries", 1]]) {
    const f = fixture(t), first = await f.post(payload), again = await f.post(payload);
    assert.equal(first.status, 201); assert.equal(again.status, 201);
    const firstBody = await first.json(), replayBody = await again.json();
    assert.equal(firstBody.idempotentReplay, false); assert.equal(replayBody.idempotentReplay, true);
    assert.deepEqual(firstBody[payload.action], replayBody[payload.action]);
    assert.equal(again.headers.get("Idempotency-Replayed"), "true");
    assert.equal(again.headers.get("Cache-Control"), "private, no-store");
    assert.equal(f.count(table), expectedCount); assert.equal(f.count("market_write_requests"), 1); assert.equal(f.count("audit_logs"), 1);
    assert.equal(f.count("notifications"), payload.action === "inquiry" ? 1 : 0); assert.equal(f.quotaCalls(), 1);
  }
});

test("market hashes normalize semantic values while rejecting changed content, action and owner collisions", async (t) => {
  const f = fixture(t);
  assert.equal((await f.post(listing)).status, 201);
  const normalized = await f.post({ ...listing, price: 25.5, title: `  ${listing.title}  `, irrelevant: "ignored" });
  assert.equal(normalized.status, 201); assert.equal((await normalized.json()).idempotentReplay, true);
  for (const payload of [{ ...listing, title: "Different title" }, price]) {
    const conflict = await f.post(payload); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, "IDEMPOTENCY_CONFLICT");
  }
  f.signIn("other"); const other = await f.post(listing); assert.equal(other.status, 201); assert.equal((await other.json()).idempotentReplay, false);
  assert.equal(f.count("market_write_requests"), 2); assert.equal(f.count("marketplace_listings"), 3);
});

test("market key parsing rejects raw invalid keys and legacy clients keep their response shape", async (t) => {
  for (const key of ["", "short", " abcdefgh", "abcdefgh ", "abc defgh", "ığüşöçab", "a".repeat(129), "abcdefgh,abcdefgh"]) {
    assert.throws(() => helpers.parseMarketIdempotencyKey(key), (error) => error.status === 400 && error.code === "INVALID_IDEMPOTENCY_KEY");
  }
  const f = fixture(t); assert.equal((await f.post(listing, "bad")).status, 400); assert.equal(f.quotaCalls(), 0);
  for (const payload of [null, [], 3]) assert.equal((await f.post(payload)).status, 400);
  const first = await f.post(listing, null), second = await f.post(listing, null);
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  assert.equal("idempotentReplay" in await first.json(), false); assert.equal(f.count("market_write_requests"), 0);
  assert.equal(f.count("marketplace_listings"), 3); assert.equal(f.count("audit_logs"), 2);
  for (const invalidPrice of ["not a price", -1, 1_000_000_001]) assert.equal((await f.post({ ...listing, kind: "wanted", price: invalidPrice })).status, 400);
});

test("market simultaneous key races roll back the losing entity and replay the winner", async (t) => {
  for (const payload of [listing, price, inquiry]) {
    const f = fixture(t); f.concurrent(2);
    const responses = await Promise.all([f.post(payload), f.post(payload)]);
    assert.equal(f.batchCount(), 2); assert.deepEqual(responses.map((response) => response.status), [201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies[0][payload.action], bodies[1][payload.action]);
    assert.deepEqual(bodies.map((body) => body.idempotentReplay).sort(), [false, true]);
    assert.equal(f.count("market_write_requests"), 1); assert.equal(f.count("audit_logs"), 1); assert.equal(f.count("notifications"), payload.action === "inquiry" ? 1 : 0);
    assert.equal(f.count(payload.action === "listing" ? "marketplace_listings" : payload.action === "price" ? "campus_price_reports" : "marketplace_inquiries"), payload.action === "listing" ? 2 : 1);
  }
});

test("market committed acknowledgement loss and deferred outcome recover the original entity", async (t) => {
  for (const payload of [listing, price, inquiry]) {
    for (const fault of ["committed", "committed-unreachable", "delayed"]) {
      const f = fixture(t); f.fault(fault); const first = await f.post(payload);
      assert.equal(first.status, fault === "committed" ? 201 : 503);
      if (fault === "committed") assert.equal((await first.json()).idempotentReplay, true);
      if (fault === "delayed") { assert.equal(f.count("market_write_requests"), 0); f.commitDeferred(); }
      f.recover(); const retry = await f.post(payload); assert.equal(retry.status, 201); assert.equal((await retry.json()).idempotentReplay, true);
      assert.equal(f.count("market_write_requests"), 1); assert.equal(f.count("audit_logs"), 1); assert.equal(f.batchCount(), 1);
    }
  }
});

test("market audit or notification failures roll back entity and receipt so the exact key can retry", async (t) => {
  for (const [payload, failureTable] of [[listing, "audit_logs"], [price, "audit_logs"], [inquiry, "audit_logs"], [inquiry, "notifications"]]) {
    const f = fixture(t);
    f.database.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON ${failureTable} BEGIN SELECT RAISE(ABORT, 'Injected failure'); END;`);
    assert.equal((await f.post(payload)).status, 503);
    assert.equal(f.count("market_write_requests"), 0); assert.equal(f.count("marketplace_listings"), 1);
    assert.equal(f.count("campus_price_reports"), 0); assert.equal(f.count("marketplace_inquiries"), 0); assert.equal(f.count("notifications"), 0); assert.equal(f.count("audit_logs"), 0);
    f.database.exec("DROP TRIGGER reject_write");
    const retry = await f.post(payload); assert.equal(retry.status, 201); assert.equal((await retry.json()).idempotentReplay, false);
  }
});

test("market conflicting races and unresolved delayed batches can only commit one receipt", async (t) => {
  const conflict = fixture(t); conflict.concurrent(2);
  const responses = await Promise.all([conflict.post(listing), conflict.post({ ...listing, title: "Another valid title" })]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(conflict.count("marketplace_listings"), 2); assert.equal(conflict.count("market_write_requests"), 1); assert.equal(conflict.count("audit_logs"), 1);
  const delayed = fixture(t); delayed.fault("delayed");
  assert.equal((await delayed.post()).status, 503); assert.equal((await delayed.post()).status, 201);
  assert.throws(() => delayed.commitDeferred(), /UNIQUE/);
  assert.equal(delayed.count("marketplace_listings"), 2); assert.equal(delayed.count("market_write_requests"), 1); assert.equal(delayed.count("audit_logs"), 1);
  const inquiryRace = fixture(t); inquiryRace.concurrent(2);
  const inquiries = await Promise.all([inquiryRace.post(inquiry, "inquiry-attempt-001"), inquiryRace.post(inquiry, "inquiry-attempt-002")]);
  assert.deepEqual(inquiries.map((response) => response.status).sort(), [201, 409]);
  assert.equal(inquiryRace.count("marketplace_inquiries"), 1); assert.equal(inquiryRace.count("notifications"), 1); assert.equal(inquiryRace.count("market_write_requests"), 1);
});

test("market removed, archived or closed targets retain receipts and cannot be resurrected by retry", async (t) => {
  for (const [payload, table, operation] of [
    [listing, "marketplace_listings", "DELETE"], [listing, "marketplace_listings", "closed"],
    [price, "campus_price_reports", "DELETE"], [price, "campus_price_reports", "archived"],
    [inquiry, "marketplace_inquiries", "DELETE"],
  ]) {
    const f = fixture(t), body = await (await f.post(payload)).json(), id = body[payload.action].id;
    if (operation === "DELETE") f.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    else f.database.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(operation, id);
    const replay = await f.post(payload); assert.equal(replay.status, 410); assert.equal((await replay.json()).code, "MARKET_TARGET_REMOVED");
    assert.equal(f.count("market_write_requests"), 1); assert.equal(f.count("audit_logs"), 1); assert.equal(f.batchCount(), 1);
  }
  const f = fixture(t); await f.post(inquiry); f.database.exec("DELETE FROM marketplace_listings WHERE id = 'other-listing'");
  assert.equal((await f.post(inquiry)).status, 410); assert.equal(f.count("market_write_requests"), 1);
});

test("market replay respects current authentication, completed profile, campus and both block directions", async (t) => {
  const f = fixture(t); await f.post(listing);
  f.signIn(null); assert.equal((await f.post(listing)).status, 401); f.signIn("owner");
  f.database.exec("UPDATE student_profiles SET onboarding_completed = 0 WHERE user_email = 'owner@test.local'"); assert.equal((await f.post(listing)).status, 409);
  f.database.exec("UPDATE student_profiles SET onboarding_completed = 1, university_id = 'outside' WHERE user_email = 'owner@test.local'"); assert.equal((await f.post(listing)).status, 404);
  assert.equal(f.batchCount(), 1);
  for (const [blocker, blocked] of [["owner", "other"], ["other", "owner"]]) {
    const b = fixture(t); await b.post(inquiry);
    b.database.prepare("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES (?, ?)").run(`${blocker}@test.local`, `${blocked}@test.local`);
    assert.equal((await b.post(inquiry)).status, 404); assert.equal(b.count("notifications"), 1); assert.equal(b.batchCount(), 1);
  }
});

test("market exhausted quota permits an existing receipt but still rejects a new key", async (t) => {
  const f = fixture(t); await f.post(listing);
  f.database.exec("UPDATE rate_limit_windows SET hit_count = 100 WHERE action = 'campus-market-listing'");
  assert.equal((await f.post(listing)).status, 201); assert.equal(f.quotaCalls(), 1);
  assert.equal((await f.post(listing, "different-request-002")).status, 429); assert.equal(f.count("market_write_requests"), 1);
});

test("inquiry authorization is checked again atomically when a block arrives before commit", async (t) => {
  const f = fixture(t);
  f.beforeBatch(() => f.database.exec("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('other@test.local', 'owner@test.local')"));
  assert.equal((await f.post(inquiry)).status, 404);
  assert.equal(f.count("market_write_requests"), 0); assert.equal(f.count("marketplace_inquiries"), 0); assert.equal(f.count("notifications"), 0);
  assert.equal((await f.post(inquiry)).status, 404);
});
