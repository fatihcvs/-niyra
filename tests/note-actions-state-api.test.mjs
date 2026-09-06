import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const files = ["app/api/note-actions/route.ts", "lib/server-api.ts"];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(new URL(file, root), "utf8")])));
const dir = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(dir)).filter((file) => /^\d+.*\.sql$/.test(file)).sort().map((file) => readFile(new URL(file, dir), "utf8")));
function load(file, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(sources[file], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, crypto: webcrypto, Request, Response, Headers, URL, Error, require: (specifier) => { assert.ok(specifier in dependencies, specifier); return dependencies[specifier]; } });
  return exports;
}
function setup(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close()); db.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => db.exec(sql));
  db.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('campus','[SYNTHETIC] University','TEST','Test'); INSERT INTO departments(id,name) VALUES ('department','[SYNTHETIC] Department');");
  for (const id of ["author", "actor"]) {
    db.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,?,?,?)").run(`${id}@example.invalid`, `synthetic-${id}`, `[SYNTHETIC] ${id}`, `synthetic-${id}`);
    db.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES (?,'campus','department',1,1)").run(`${id}@example.invalid`);
  }
  db.exec("INSERT INTO courses(id,department_id,code,name) VALUES ('course','department','TEST101','[SYNTHETIC] Course'); INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('note','author@example.invalid','course','[SYNTHETIC] Note','example','example.pdf','application/pdf',1,'published');");
  const DB = { prepare(query) { return { bind(...values) { return { async first() { return db.prepare(query).get(...values) ?? null; }, async all() { return { results: db.prepare(query).all(...values) }; }, async run() { return { success: true, meta: db.prepare(query).run(...values) }; } }; } }; } };
  let signedIn = true;
  const server = load("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser: async () => signedIn ? { email: "actor@example.invalid" } : null } });
  const route = load("app/api/note-actions/route.ts", { "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) } });
  return { db, signOut() { signedIn = false; }, count(table) { assert.ok(["note_saves", "note_feedback", "audit_logs", "rate_limit_windows"].includes(table)); return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; }, async request(payload) { return route.POST(new Request("https://example.invalid/api/note-actions", { method: "POST", body: JSON.stringify(payload) })); }, async action(type, ...desired) { const response = await this.request({ id: "note", type, ...(desired.length ? { active: desired[0] } : {}) }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); } };
}

test("desired note saves stay stable across retries and concurrent insertion/removal; audit only actual changes", async (t) => {
  const api = setup(t);
  await Promise.all([api.action("save", true), api.action("save", true)]);
  assert.equal(api.count("note_saves"), 1); assert.equal(api.count("audit_logs"), 1);
  assert.deepEqual(await api.action("save", true), { active: true, count: 1 });
  await Promise.all([api.action("save", false), api.action("save", false)]);
  assert.equal(api.count("note_saves"), 0); assert.equal(api.count("audit_logs"), 2);
  assert.equal((await api.action("save")).active, true); assert.equal((await api.action("save")).active, false);
});

test("desired feedback keeps the confirmed vote and stale removal cannot clear the opposite vote", async (t) => {
  const api = setup(t);
  await Promise.all([api.action("helpful", true), api.action("helpful", true)]);
  assert.equal(api.count("note_feedback"), 1); assert.equal(api.count("audit_logs"), 1);
  assert.deepEqual(await api.action("unhelpful", true), { vote: "unhelpful", helpfulCount: 0, unhelpfulCount: 1 });
  assert.deepEqual(await api.action("helpful", false), { vote: "unhelpful", helpfulCount: 0, unhelpfulCount: 1 });
  assert.equal(api.count("audit_logs"), 2);
  assert.deepEqual(await api.action("unhelpful", false), { vote: null, helpfulCount: 0, unhelpfulCount: 0 });
  assert.equal((await api.action("helpful")).vote, "helpful"); assert.equal((await api.action("helpful")).vote, null);
});

test("invalid desired fields and malformed payloads do not mutate or consume quota", async (t) => {
  const api = setup(t);
  for (const payload of [null, [], true, "invalid", { id: "note", type: "save", active: null }, { id: "note", type: "helpful", active: "true" }, { id: "note", type: "save", active: 1 }]) assert.equal((await api.request(payload)).status, 400);
  assert.equal(api.count("note_saves"), 0); assert.equal(api.count("note_feedback"), 0); assert.equal(api.count("rate_limit_windows"), 0);
});

test("desired note actions retain campus, publication, session and rate limit checks", async (t) => {
  const api = setup(t);
  api.db.exec("UPDATE notes SET status='processing' WHERE id='note'"); assert.equal((await api.request({ id: "note", type: "save", active: true })).status, 404);
  api.db.exec("UPDATE notes SET status='published'; INSERT INTO universities(id,name,short_name,city) VALUES ('other','Other','OTHER','Test'); UPDATE student_profiles SET university_id='other' WHERE user_email='actor@example.invalid'");
  assert.equal((await api.request({ id: "note", type: "save", active: true })).status, 404);
  api.db.exec("UPDATE student_profiles SET university_id='campus'; UPDATE rate_limit_windows SET hit_count=80 WHERE action='note-save'");
  assert.equal((await api.request({ id: "note", type: "save", active: true })).status, 429);
  api.signOut(); assert.equal((await api.request({ id: "note", type: "save", active: true })).status, 401); assert.equal(api.count("note_saves"), 0);
});
