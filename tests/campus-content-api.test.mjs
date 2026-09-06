import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  for (const name of readdirSync("drizzle").filter((file) => /^\d+.*\.sql$/.test(file)).sort()) db.exec(readFileSync(`drizzle/${name}`, "utf8"));
  db.exec(`INSERT INTO universities(id,name,short_name,city) VALUES('a','[SYNTHETIC] A','A','Test'),('b','[SYNTHETIC] B','B','Test');
    INSERT INTO departments(id,name) VALUES('d','Test');
    INSERT INTO users(email,public_id,display_name,handle) VALUES('viewer@example.invalid','viewer','Viewer','viewer'),('owner@example.invalid','owner','Owner','owner');
    INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES('viewer@example.invalid','a','d',1,1),('owner@example.invalid','a','d',1,1);
    INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description,condition) VALUES('listing','a','owner@example.invalid','free','books','Test listing','[SYNTHETIC] description','used-good');
    INSERT INTO campus_events(id,university_id,creator_email,title,description,category,starts_at) VALUES('event','a','owner@example.invalid','Test event','[SYNTHETIC] description','social','2025-01-01 10:00:00');`);
  const DB = { prepare(sql) { return { bind(...values) { return { first: async () => db.prepare(sql).get(...values) ?? null, all: async () => ({ results: db.prepare(sql).all(...values) }) }; } }; } };
  let actor = "viewer@example.invalid";
  const server = { getRuntime: async () => ({ DB }), requireIdentity: async () => actor ? { email: actor } : null,
    requireProfile: async (_db, email) => db.prepare("SELECT university_id FROM student_profiles WHERE user_email=? AND onboarding_completed=1").get(email),
    signInResponse: () => Response.json({ error: "Login required" }, { status: 401 }), unavailableResponse: (error) => { throw error; }, relativeTime: () => "1 dk" };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync("app/api/campus-content/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Response, URL, require: (name) => { assert.equal(name, "../../../lib/server-api"); return server; } });
  return { db, actor(value) { actor = value; }, get: (kind, id = kind) => exports.GET(new Request(`https://example.invalid/api/campus-content?${new URLSearchParams({ kind, id })}`)) };
}

test("direct listing and past event resolve independently from list filters without private fields", async (t) => {
  const api = setup(t);
  for (const kind of ["listing", "event"]) {
    const response = await api.get(kind); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json(); assert.equal(body.content.item.id, kind);
    assert.doesNotMatch(JSON.stringify(body), /@example\.invalid|university_id|creator_email|owner_email/);
  }
});

test("foreign campus, either block direction and suspended authors cannot resolve shared targets", async (t) => {
  const api = setup(t);
  for (const change of [
    "UPDATE student_profiles SET university_id='b' WHERE user_email='viewer@example.invalid'",
    "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('viewer@example.invalid','owner@example.invalid')",
    "INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('owner@example.invalid','viewer@example.invalid')",
    "UPDATE users SET status='suspended' WHERE public_id='owner'",
  ]) {
    api.db.exec("SAVEPOINT variant"); api.db.exec(change);
    for (const kind of ["listing", "event"]) assert.equal((await api.get(kind)).status, 404);
    api.db.exec("ROLLBACK TO variant; RELEASE variant");
  }
});

test("archived/missing targets and malformed input fail without leaking records", async (t) => {
  const api = setup(t);
  api.db.exec("UPDATE marketplace_listings SET status='closed'; UPDATE campus_events SET status='archived'");
  for (const kind of ["listing", "event"]) { assert.equal((await api.get(kind)).status, 404); assert.equal((await api.get(kind, "missing")).status, 404); }
  api.actor("owner@example.invalid"); assert.equal((await api.get("listing")).status, 200);
  for (const [kind, id] of [["listing", ""], ["listing", "x".repeat(81)], ["event", "a\u0000b"], ["unknown", "x"]]) assert.equal((await api.get(kind, id)).status, 400);
  api.actor(null); assert.equal((await api.get("listing")).status, 401);
});
