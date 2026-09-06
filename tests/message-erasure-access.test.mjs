import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const migrations = await Promise.all((await readdir(new URL("drizzle/", root))).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(`drizzle/${name}`, root), "utf8")));
const source = ts.transpileModule(await readFile(new URL("app/api/messages/route.ts", root), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const activeSource = ts.transpileModule(await readFile(new URL("lib/active-actor.ts", root), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture(t, erased = true) {
  const sql = new DatabaseSync(":memory:"); t.after(() => sql.close()); sql.exec("PRAGMA foreign_keys=ON"); for (const migration of migrations) sql.exec(migration);
  sql.exec(`INSERT INTO universities(id,name,short_name,city) VALUES ('campus-one','Test','T','Test'),('campus-two','Other','O','Other');
    INSERT INTO faculties(id,university_id,name,short_name) VALUES ('faculty-one','campus-one','Faculty','F');
    INSERT INTO departments(id,faculty_id,name) VALUES ('department-one','faculty-one','Department');
    INSERT INTO users(email,public_id,display_name,handle) VALUES ('peer@example.invalid','peer-id','Peer','peer'),('other@example.invalid','other-id','Other','other'),('subject@example.invalid','subject-id','Subject','subject');
    INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES
    ('peer@example.invalid','campus-one','department-one',1,1),('other@example.invalid','campus-one','department-one',1,1),('subject@example.invalid','campus-one','department-one',1,1);
    INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('conversation-one','campus-one','peer@example.invalid','subject@example.invalid');
    INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('retained-message','conversation-one','peer@example.invalid','[SYNTHETIC] My retained message');`);
  if (erased) {
    // Fixtures model the engine's final anonymous state. SQL engine rewrite is
    // exercised separately; this suite calls the actual message API afterwards.
    sql.exec("INSERT INTO users(email,public_id,display_name,handle,status) VALUES ('erased-fixture@invalid.kampira',NULL,'Silinmiş hesap','erased_fixture','active')");
    sql.exec("UPDATE direct_conversations SET member_one_email='erased-fixture@invalid.kampira',member_two_email='peer@example.invalid' WHERE id='conversation-one'");
    sql.exec("UPDATE users SET status='deleted' WHERE email='erased-fixture@invalid.kampira'");
    sql.exec("DELETE FROM users WHERE email='subject@example.invalid'");
  }
  let actor = "peer@example.invalid", beforeRun, beforeBatch;
  const DB = { prepare(query) { const prepared = { query, values: [], bind(...values) { return { ...prepared, values }; }, async first() { return sql.prepare(query).get(...this.values) ?? null; }, async all() { return { results: sql.prepare(query).all(...this.values) }; }, async run() { if (beforeRun) { const hook = beforeRun; beforeRun = null; hook(query); } return { success: true, meta: sql.prepare(query).run(...this.values) }; } }; return prepared; },
    async batch(statements) { if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); } sql.exec("BEGIN"); try { const result = statements.map(({ query, values }) => ({ success: true, meta: sql.prepare(query).run(...values) })); sql.exec("COMMIT"); return result; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
  const server = { requireIdentity: async () => ({ email: actor }), getRuntime: async () => ({ DB }),
    requireProfile: async (_db, email) => sql.prepare("SELECT sp.*,u.public_id,u.display_name FROM student_profiles sp JOIN users u ON u.email=sp.user_email WHERE sp.user_email=? AND u.status='active'").get(email),
    cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "", relativeTime: () => "şimdi", enforceRateLimit: async () => ({ allowed: true }),
    signInResponse: () => Response.json({ error: "auth" }, { status: 401 }),
    unavailableResponse: (error) => Response.json({ error: error.message }, { status: 503 }), rateLimitResponse: () => Response.json({}, { status: 429 }) };
  const active = {}; runInNewContext(activeSource, { exports: active, crypto });
  const exports = {}; runInNewContext(source, { exports, crypto, URL, Headers, Response, Date, Intl, require(name) {
    if (name.endsWith("/active-actor")) return active;
    if (name.endsWith("/server-api")) return server;
    if (name.endsWith("/app-auth")) return { sameOriginRequest: (request) => request.headers.get("origin") === "https://kampira.test" };
    if (name.endsWith("/profile")) return { profileMediaUrl: () => null };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { sql, get effects() { return [...sql.prepare("SELECT id FROM audit_logs").all(), ...sql.prepare("SELECT id FROM notifications").all()]; }, setActor: (email) => { actor = email; }, beforeRun: (hook) => { beforeRun = hook; }, beforeBatch: (hook) => { beforeBatch = hook; },
    call: (method = "GET", data, query = "") => exports[method](new Request(`https://kampira.test/api/messages${query}`, { method, headers: { origin: "https://kampira.test", "content-type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(data) }) })) };
}

test("erased-peer conversation and the surviving user's message remain accessible without a fake academic profile or profile identity", async (t) => {
  const f = fixture(t); const listing = await f.call(); assert.equal(listing.status, 200); const data = await listing.json();
  assert.equal(data.conversations.length, 1); assert.equal(data.conversations[0].readOnly, true);
  assert.deepEqual(data.conversations[0].person, { publicId: null, displayName: "Silinmiş hesap", handle: "", universityShortName: "", departmentName: "", avatarUrl: null, deleted: true });
  const detail = await f.call("GET", undefined, "?conversationId=conversation-one&messageId=retained-message"); assert.equal(detail.status, 200);
  const body = await detail.json(); assert.equal(body.messages[0].body, "[SYNTHETIC] My retained message"); assert.equal(body.messages[0].own, true);
  assert.doesNotMatch(JSON.stringify(body), /subject@example|erased-fixture@|subject-id/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM student_profiles WHERE user_email='erased-fixture@invalid.kampira'").get().n, 0);
});

for (const rotated of ["peer", "subject"]) test(`a changed ${rotated} account generation cannot commit an old message attempt`, async (t) => {
  const f = fixture(t, false); f.beforeBatch(() => f.sql.prepare("UPDATE users SET public_id=? WHERE email=?").run(`${rotated}-new-generation`, `${rotated}@example.invalid`));
  const response = await f.call("POST", { conversationId: "conversation-one", body: "[SYNTHETIC] stale account generation" });
  assert.equal(response.status, 409); assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n, 1); assert.equal(f.effects.length, 0);
});

for (const rotated of ["peer", "other"]) test(`a fresh conversation is not created after the ${rotated} account generation changes`, async (t) => {
  const f = fixture(t, false); f.beforeRun((query) => { assert.match(query, /INSERT INTO direct_conversations/); f.sql.prepare("UPDATE users SET public_id=? WHERE email=?").run(`${rotated}-new-generation`, `${rotated}@example.invalid`); });
  const response = await f.call("POST", { recipientId: "other-id", body: "[SYNTHETIC] stale initial conversation" });
  assert.equal(response.status, 409); assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM direct_conversations").get().n, 1); assert.equal(f.effects.length, 0);
});

test("late audit and notification writes cannot carry an old sender generation into a replacement account", async (t) => {
  const f = fixture(t, false); f.beforeRun((query) => { assert.match(query, /INSERT INTO audit_logs/); f.sql.exec("UPDATE users SET public_id='peer-new-generation' WHERE email='peer@example.invalid'"); });
  const response = await f.call("POST", { conversationId: "conversation-one", body: "[SYNTHETIC] stale side effects" });
  assert.equal(response.status, 409); assert.equal(f.effects.length, 0);
});

test("a delayed notification never targets the replacement recipient generation", async (t) => {
  const f = fixture(t, false); f.beforeRun((query) => { assert.match(query, /INSERT INTO audit_logs/); f.sql.exec("UPDATE users SET public_id='subject-new-generation' WHERE email='subject@example.invalid'"); });
  const response = await f.call("POST", { conversationId: "conversation-one", body: "[SYNTHETIC] retained sender message" });
  assert.equal(response.status, 201); assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM notifications").get().n, 0);
});

test("erased history stays participant/campus scoped and cannot receive new messages", async (t) => {
  const f = fixture(t); const before = f.sql.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n;
  assert.equal((await f.call("POST", { conversationId: "conversation-one", body: "not allowed" })).status, 403);
  f.setActor("other@example.invalid"); assert.equal((await f.call("GET", undefined, "?conversationId=conversation-one")).status, 404);
  f.setActor("peer@example.invalid"); f.sql.exec("UPDATE student_profiles SET university_id='campus-two' WHERE user_email='peer@example.invalid'");
  assert.equal((await f.call("GET", undefined, "?conversationId=conversation-one")).status, 404);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n, before); assert.equal(f.effects.length, 0);
});

for (const frozen of ["peer", "subject"]) test(`a ${frozen} erasure accepted after message access checks fences the actual final INSERT`, async (t) => {
  const f = fixture(t, false); f.beforeBatch(() => f.sql.prepare("UPDATE users SET status='deleting' WHERE email=?").run(`${frozen}@example.invalid`));
  const response = await f.call("POST", { conversationId: "conversation-one", body: "[SYNTHETIC] delayed send", clientMessageKey: "synthetic-send-key-0001" });
  assert.equal(response.status, 409); assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM direct_messages").get().n, 1); assert.equal(f.effects.length, 0);
});

test("an active conversation still sends while a read receipt paused across actor deletion writes nothing", async (t) => {
  const f = fixture(t, false); const sent = await f.call("POST", { conversationId: "conversation-one", body: "[SYNTHETIC] new message" }); assert.equal(sent.status, 201);
  f.setActor("subject@example.invalid"); f.beforeRun((query) => { assert.match(query, /UPDATE direct_messages/); f.sql.exec("UPDATE users SET status='deleting' WHERE email='subject@example.invalid'"); });
  const read = await f.call("PATCH", { action: "read", conversationId: "conversation-one" }); assert.equal(read.status, 409);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM direct_messages WHERE read_at IS NOT NULL").get().n, 0);
});
