import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const directory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, directory), "utf8")));
async function compiled(path) { return ts.transpileModule(await readFile(new URL(path, root), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; }
const serverCode = await compiled("lib/server-api.ts"), routeCode = await compiled("app/api/safety/route.ts");
function load(code, dependencies) {
  const exports = {};
  runInNewContext(code, { exports, Response, URL, crypto, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  const DB = { prepare(query) {
    const statement = (values = []) => ({ bind: (...bound) => statement(bound), first: async () => database.prepare(query).get(...values) ?? null, all: async () => ({ results: database.prepare(query).all(...values) }), run: async () => database.prepare(query).run(...values) });
    return statement();
  }, batch: (statements) => Promise.all(statements.map((statement) => statement.run())) };
  let identity = "viewer@test.local";
  const server = load(serverCode, { "../app/chatgpt-auth": { getChatGPTUser: async () => identity ? { email: identity } : null } });
  const route = load(routeCode, { "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }), enforceRateLimit: async () => ({ allowed: true }), audit: async () => {} } });
  database.exec("INSERT INTO universities (id,name,short_name,city) VALUES ('campus','University','UNI','City'),('outside','Other','OTH','City'); INSERT INTO departments (id,name) VALUES ('dept','Engineering');");
  for (const [id, university] of [["viewer", "campus"], ["peer", "campus"], ["outside", "outside"]]) {
    database.prepare("INSERT INTO users (email,public_id,display_name,handle) VALUES (?,?,?,?)").run(`${id}@test.local`, id, id, id);
    database.prepare("INSERT INTO student_profiles (user_email,university_id,department_id,class_year) VALUES (?,?,'dept',1)").run(`${id}@test.local`, university);
  }
  return { database, signOut() { identity = null; }, async request(payload) { return route.POST(new Request("https://campus.test/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })); } };
}

for (const action of ["block", "mute"]) test(`${action} removal is idempotent, including after a campus transfer`, async (t) => {
  const f = fixture(t);
  for (const active of [true, true, false, false]) {
    const response = await f.request({ action, targetId: "peer", active });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).active, active);
  }
  await f.request({ action, targetId: "peer", active: true });
  f.database.exec("UPDATE student_profiles SET university_id='outside' WHERE user_email='peer@test.local'");
  assert.equal((await f.request({ action, targetId: "peer", active: true })).status, 404);
  assert.equal((await f.request({ action, targetId: "peer" })).status, 404);
  for (let i = 0; i < 2; i++) assert.equal((await f.request({ action, targetId: "peer", active: false })).status, 200);
  assert.equal(f.database.prepare(`SELECT COUNT(*) AS count FROM ${action === "block" ? "user_blocks" : "user_mutes"}`).get().count, 0);
});

test("visibility controls preserve authentication, campus boundaries and legacy toggles", async (t) => {
  const f = fixture(t);
  assert.equal((await f.request({ action: "block", targetId: "outside", active: true })).status, 404);
  assert.equal((await f.request({ action: "block", targetId: "viewer", active: false })).status, 404);
  assert.equal((await f.request({ action: "mute", targetId: "peer", active: "false" })).status, 400);
  for (const expected of [true, false]) assert.equal((await (await f.request({ action: "block", targetId: "peer" })).json()).active, expected);
  f.signOut();
  assert.equal((await f.request({ action: "block", targetId: "peer", active: false })).status, 401);
});

test("blocking removes both follow directions and never modifies other users' restrictions", async (t) => {
  const f = fixture(t);
  f.database.exec("INSERT INTO user_follows (follower_email,following_email) VALUES ('viewer@test.local','peer@test.local'),('peer@test.local','viewer@test.local'); INSERT INTO user_blocks (blocker_email,blocked_email) VALUES ('peer@test.local','viewer@test.local');");
  await f.request({ action: "block", targetId: "peer", active: true });
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM user_follows").get().count, 0);
  await f.request({ action: "block", targetId: "peer", active: false });
  assert.equal(f.database.prepare("SELECT blocker_email FROM user_blocks").get().blocker_email, "peer@test.local");
});
