import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as orm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";

const root = new URL("../", import.meta.url);
const files = ["app/api/follows/route.ts", "app/api/profile-relationships/route.ts", "lib/server-api.ts", "lib/profile.ts", "lib/search-query.ts", "lib/profile-relationships.ts", "lib/app-auth.ts", "db/schema.ts"];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(new URL(file, root), "utf8")])));
const migrations = await Promise.all((await readdir(new URL("drizzle/", root))).filter((file) => /^\d+.*\.sql$/.test(file)).sort().map((file) => readFile(new URL(`drizzle/${file}`, root), "utf8")));
function load(file, dependencies = {}, source = sources[file]) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, crypto: webcrypto, Request, Response, Headers, URL, Error,
    require(specifier) { assert.ok(specifier in dependencies, `${file}: unexpected ${specifier}`); return dependencies[specifier]; },
  });
  return exports;
}
const schema = load("db/schema.ts", { "drizzle-orm": orm, "drizzle-orm/sqlite-core": sqliteCore });
const authAst = ts.createSourceFile("app-auth.ts", sources["lib/app-auth.ts"], ts.ScriptTarget.Latest, true);
const auth = load("lib/app-auth.ts", {}, authAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sameOriginRequest").getText(authAst));

function setup(t) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => database.exec(sql));
  database.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('campus-a','[SYNTHETIC] A','A','Test'),('campus-b','[SYNTHETIC] B','B','Test'); INSERT INTO departments(id,name) VALUES ('department','[SYNTHETIC] Department');");
  function person(id, options = {}) {
    database.prepare("INSERT INTO users(email,public_id,display_name,handle,status) VALUES (?,?,?,?,?)").run(`${id}@example.invalid`, id, options.name ?? `[SYNTHETIC] ${id}`, id, options.status ?? "active");
    database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES (?,?,'department',1,?)").run(`${id}@example.invalid`, options.campus ?? "campus-a", options.onboard ?? 1);
    if (options.public) database.prepare("INSERT INTO posts(id,author_email,content,audience) VALUES (?,?,'[SYNTHETIC] public','platform')").run(`post-${id}`, `${id}@example.invalid`);
  }
  person("viewer"); person("target");
  const follow = (from, to) => database.prepare("INSERT INTO user_follows(follower_email,following_email,created_at) VALUES (?,?,'2026-09-05 09:00:00')").run(`${from}@example.invalid`, `${to}@example.invalid`);
  const DB = { prepare(query) { return { bind(...values) { return {
    async first() { return database.prepare(query).get(...values) ?? null; },
    async all() { return { results: database.prepare(query).all(...values) }; },
    async run() { return { success: true, meta: database.prepare(query).run(...values) }; },
    async raw() { const statement = database.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
  }; } }; } };
  let actor = "viewer";
  const getChatGPTUser = async () => actor ? { email: `${actor}@example.invalid`, displayName: `[SYNTHETIC] ${actor}` } : null;
  const server = { ...load("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser } }), getRuntime: async () => ({ DB }) };
  const common = { "../../chatgpt-auth": { getChatGPTUser }, "../../../lib/server-api": server, "../../../lib/profile": load("lib/profile.ts") };
  const listing = load("app/api/profile-relationships/route.ts", { ...common, "../../../lib/search-query": load("lib/search-query.ts"), "../../../lib/profile-relationships": load("lib/profile-relationships.ts") });
  const actions = load("app/api/follows/route.ts", { ...common, "drizzle-orm": orm, "../../../db": { getDb: async () => drizzle(DB, { schema }) }, "../../../db/schema": schema, "../../../lib/app-auth": auth });
  return {
    database, person, follow, actor(value) { actor = value; },
    get(params = {}) { return listing.GET(new Request(`https://example.invalid/api/profile-relationships?${new URLSearchParams({ id: "target", kind: "followers", ...params })}`)); },
    post(payload = {}, origin = "https://example.invalid") { return actions.POST(new Request("https://example.invalid/api/follows", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) })); },
    async list(params = {}) { const response = await this.get(params); assert.equal(response.status, 200, await response.clone().text()); return response.json(); },
    async action(...desired) { const response = await this.post({ targetId: "target", ...(desired.length ? { active: desired[0] } : {}) }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); },
    count(table) { assert.ok(["user_follows", "notifications", "audit_logs", "rate_limit_windows"].includes(table)); return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
  };
}

test("real SQLite relationship cursor traverses tied timestamps without duplicate or skipped people", async (t) => {
  const api = setup(t);
  for (let index = 0; index < 85; index++) { const id = `synthetic-${String(index).padStart(3, "0")}`; api.person(id); api.follow(id, "target"); }
  const first = await api.list(), second = await api.list({ cursor: first.nextCursor }), third = await api.list({ cursor: second.nextCursor });
  const all = [...first.people, ...second.people, ...third.people];
  assert.equal(first.people.length, 40); assert.equal(second.people.length, 40); assert.equal(third.people.length, 5); assert.equal(third.nextCursor, null);
  assert.equal(new Set(all.map((person) => person.publicId)).size, 85);
  assert.equal(all[0].publicId, "synthetic-084"); assert.equal(all.at(-1).publicId, "synthetic-000");
  assert.doesNotMatch(JSON.stringify(first), /@example\.invalid|followerCount|followingCount|university_id/);
  for (const params of [{ kind: "following" }, { q: "synthetic" }, { id: "viewer" }]) assert.equal((await api.get({ ...params, cursor: first.nextCursor })).status, 400);
});

test("both lists omit hidden, blocked, inactive and incomplete rows while preserving public cross-campus identity", async (t) => {
  const api = setup(t);
  const variants = { normal: {}, private: { campus: "campus-b" }, public: { campus: "campus-b", public: true }, suspended: { status: "suspended" }, incomplete: { onboard: 0 }, blocked: {}, blocker: {} };
  for (const [id, options] of Object.entries(variants)) { api.person(id, options); api.follow(id, "target"); api.follow("target", id); }
  api.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('viewer@example.invalid','blocked@example.invalid'),('blocker@example.invalid','viewer@example.invalid')");
  api.follow("viewer", "normal"); api.follow("viewer", "target");
  const followers = await api.list(), following = await api.list({ kind: "following" });
  assert.deepEqual(followers.people.map((person) => person.publicId).sort(), ["normal", "public", "viewer"]);
  assert.deepEqual(following.people.map((person) => person.publicId).sort(), ["normal", "public"]);
  assert.equal(followers.people.find((person) => person.publicId === "viewer").isSelf, true);
  assert.equal(followers.people.find((person) => person.publicId === "normal").isFollowing, true);
  for (const id of ["private", "blocked", "blocker", "suspended", "incomplete", "missing"]) {
    const response = await api.get({ id }); assert.equal(response.status, 404);
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  }
  assert.equal((await api.get({ id: "public" })).status, 200);
  api.actor(null); assert.equal((await api.get()).status, 401);
});

test("Turkish search folds dotted letters and treats SQL wildcard characters literally", async (t) => {
  const api = setup(t);
  for (const [id, name] of [["turkish", "[SYNTHETIC] İPEK IŞIK"], ["literal", "[SYNTHETIC] İPEK %_\\"]]) { api.person(id, { name }); api.follow(id, "target"); }
  assert.deepEqual((await api.list({ q: "ipek ışık" })).people.map((person) => person.publicId), ["turkish"]);
  assert.deepEqual((await api.list({ q: "%_\\" })).people.map((person) => person.publicId), ["literal"]);
  assert.equal((await api.get({ cursor: "{}" })).status, 400); assert.equal((await api.get({ kind: "secret" })).status, 400);
});

test("desired follow retries return authoritative counts without duplicate audit or notification; legacy toggles remain", async (t) => {
  const api = setup(t); api.person("other"); api.follow("viewer", "other"); api.follow("other", "target");
  const results = await Promise.all([api.action(true), api.action(true)]);
  assert.ok(results.every((result) => result.active && result.targetId === "target" && result.followerCount === 2 && result.viewerFollowingCount === 2));
  assert.equal(api.count("notifications"), 1); assert.equal(api.count("audit_logs"), 1);
  assert.equal((await api.action(false)).viewerFollowingCount, 1);
  assert.equal((await api.action(false)).followerCount, 1); assert.equal(api.count("audit_logs"), 2);
  assert.equal((await api.action()).active, true); assert.equal((await api.action()).active, false);
});

test("follow input, origin, onboarding, block and existing cross-campus policy remain guarded", async (t) => {
  const api = setup(t);
  for (const payload of [null, [], {}, { targetId: 2 }, { targetId: "target", active: null }, { targetId: "target", active: "true" }]) assert.equal((await api.post(payload)).status, 400);
  assert.equal(api.count("rate_limit_windows"), 0);
  assert.equal((await api.post({ targetId: "target", active: true }, "https://other.invalid")).status, 403);
  api.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('target@example.invalid','viewer@example.invalid')");
  assert.equal((await api.post({ targetId: "target", active: true })).status, 403);
  api.database.exec("DELETE FROM user_blocks; UPDATE student_profiles SET university_id='campus-b' WHERE user_email='target@example.invalid'");
  assert.equal((await api.action(true)).active, true, "legacy direct cross-campus following permission is unchanged even when the list is not visible");
  api.database.exec("UPDATE student_profiles SET onboarding_completed=0 WHERE user_email='viewer@example.invalid'");
  assert.equal((await api.post({ targetId: "target", active: false })).status, 409);
  api.actor(null); assert.equal((await api.post({ targetId: "target", active: true })).status, 401);
});
