import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as drizzleOrm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";

const root = new URL("../", import.meta.url);
const files = ["app/api/post-actions/route.ts", "app/api/comments/route.ts", "lib/server-api.ts", "lib/profile.ts", "lib/app-auth.ts", "db/schema.ts"];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(new URL(file, root), "utf8")])));
const migrationDirectory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort().map((file) => readFile(new URL(file, migrationDirectory), "utf8")));
function load(file, dependencies = {}, text = sources[file]) {
  const exports = {};
  runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, crypto: webcrypto, Request, Response, Headers, URL, Error,
    require(specifier) { assert.ok(specifier in dependencies, `${file}: unexpected dependency ${specifier}`); return dependencies[specifier]; },
  });
  return exports;
}
const schema = load("db/schema.ts", { "drizzle-orm": drizzleOrm, "drizzle-orm/sqlite-core": sqliteCore });
const authAst = ts.createSourceFile("app-auth.ts", sources["lib/app-auth.ts"], ts.ScriptTarget.Latest, true);
const auth = load("lib/app-auth.ts", {}, authAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sameOriginRequest").getText(authAst));

function setup(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON");
  migrations.forEach((sql) => database.exec(sql));
  database.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('test-campus','[SYNTHETIC] University','TEST','Test'); INSERT INTO departments(id,name) VALUES ('test-department','[SYNTHETIC] Department');");
  for (const id of ["author", "actor", "commenter"]) {
    database.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,?,?,?)").run(`${id}@example.invalid`, `synthetic-${id}`, `[SYNTHETIC] ${id}`, `synthetic-${id}`);
    database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES (?,'test-campus','test-department',1,1)").run(`${id}@example.invalid`);
  }
  database.exec("INSERT INTO posts(id,author_email,content,audience) VALUES ('synthetic-post','author@example.invalid','[SYNTHETIC] isolated post','platform');");
  const DB = {
    prepare(query) { return { bind(...values) { return {
      async first() { return database.prepare(query).get(...values) ?? null; },
      async all() { return { results: database.prepare(query).all(...values) }; },
      async run() { return { success: true, meta: database.prepare(query).run(...values) }; },
      async raw() { const statement = database.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
    }; } }; },
  };
  let signedIn = true;
  const getChatGPTUser = async () => signedIn ? { email: "actor@example.invalid", displayName: "[SYNTHETIC] Actor" } : null;
  const server = load("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser } });
  const route = load("app/api/post-actions/route.ts", {
    "drizzle-orm": drizzleOrm, "../../chatgpt-auth": { getChatGPTUser }, "../../../lib/app-auth": auth,
    "../../../db": { getDb: async () => drizzle(DB, { schema }) }, "../../../db/schema": schema,
    "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) }, "../../../lib/profile": load("lib/profile.ts"),
  });
  const comments = load("app/api/comments/route.ts", {
    "drizzle-orm": drizzleOrm, "../../chatgpt-auth": { getChatGPTUser }, "../../../lib/app-auth": auth,
    "../../../db": { getDb: async () => drizzle(DB, { schema }) }, "../../../db/schema": schema,
    "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) }, "../../../lib/profile": load("lib/profile.ts"),
  });
  return {
    database, signOut() { signedIn = false; },
    readComments(query) { return comments.GET(new Request(`https://example.invalid/api/comments?${query}`)); },
    seedComment(id, index = 0) { database.prepare("INSERT INTO post_comments(id,post_id,author_email,content,created_at) VALUES (?,'synthetic-post','commenter@example.invalid',?,?)").run(id, `[SYNTHETIC] ${id}`, `2026-01-01 12:${String(index).padStart(2, "0")}:00`); },
    count(table) { assert.ok(["post_likes", "post_saves", "notifications", "audit_logs", "rate_limit_windows", "post_comments"].includes(table)); return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
    async request(payload, origin = "https://example.invalid") {
      return route.POST(new Request("https://example.invalid/api/post-actions", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) }));
    },
    async action(type, ...desired) {
      const response = await this.request({ postId: "synthetic-post", type, ...(desired.length ? { active: desired[0] } : {}) });
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    },
  };
}

test("repeating desired like on/off preserves state and sends one notification for the actual insertion", async (t) => {
  const api = setup(t);
  assert.deepEqual(await api.action("like", true), { type: "like", active: true, count: 1 });
  // This represents retry after the first response was lost; the committed row already exists.
  assert.deepEqual(await api.action("like", true), { type: "like", active: true, count: 1 });
  assert.equal(api.count("post_likes"), 1); assert.equal(api.count("notifications"), 1); assert.equal(api.count("audit_logs"), 1);
  assert.deepEqual(await api.action("like", false), { type: "like", active: false, count: 0 });
  assert.deepEqual(await api.action("like", false), { type: "like", active: false, count: 0 });
  assert.equal(api.count("post_likes"), 0); assert.equal(api.count("notifications"), 1); assert.equal(api.count("audit_logs"), 2);
  assert.equal(api.database.prepare("SELECT hit_count FROM rate_limit_windows WHERE action='post-like'").get().hit_count, 4, "desired retries still obey the existing quota");
});

test("a new comment notification preserves its own identity instead of losing it to the post", async (t) => {
  const api = setup(t);
  const response = await api.request({ postId: "synthetic-post", type: "comment", content: "[SYNTHETIC] exact comment target" });
  assert.equal(response.status, 201);
  const { comment } = await response.json();
  const notification = api.database.prepare("SELECT entity_type,entity_id FROM notifications").get();
  assert.equal(notification.entity_type, "comment"); assert.equal(notification.entity_id, comment.id);
  const resolved = await api.readComments(`commentId=${comment.id}`);
  assert.equal(resolved.status, 200); const target = await resolved.json();
  assert.equal(target.postId, "synthetic-post"); assert.equal(target.comment.id, comment.id);
});

test("comment targets outside the first twenty resolve through the same privacy filter without changing recent pagination", async (t) => {
  const api = setup(t);
  for (let index = 0; index < 35; index++) api.seedComment(`comment-${String(index).padStart(2, "0")}`, index);
  const recent = await (await api.readComments("postId=synthetic-post")).json();
  assert.equal(recent.comments.length, 20); assert.equal(recent.hasMore, true);
  assert.equal(recent.comments.some((comment) => comment.id === "comment-00"), false);
  const response = await api.readComments("commentId=comment-00"); const target = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(target.postId, "synthetic-post"); assert.equal(target.comment.content, "[SYNTHETIC] comment-00");
  assert.deepEqual(target.comments, recent.comments); assert.equal("authorEmail" in target.comment, false);
  assert.equal((await api.readComments("commentId=comment-00&postId=wrong-parent")).status, 404);
  assert.equal((await api.readComments(`commentId=${"x".repeat(81)}`)).status, 400);
  assert.equal((await api.readComments("commentId=bad%00id")).status, 400);
  api.database.exec("UPDATE post_comments SET deleted_at=CURRENT_TIMESTAMP WHERE id='comment-00'");
  const deleted = await api.readComments("commentId=comment-00"); assert.equal(deleted.status, 404); assert.equal("comment" in await deleted.json(), false);
  api.signOut(); assert.equal((await api.readComments("commentId=comment-01")).status, 401);
});

test("targeted comments retain author/post blocks, active authors, deleted posts and campus boundaries", async (t) => {
  const api = setup(t); api.seedComment("target");
  for (const pair of [["actor", "commenter"], ["commenter", "actor"], ["actor", "author"], ["author", "actor"]]) {
    api.database.prepare("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES (?,?)").run(`${pair[0]}@example.invalid`, `${pair[1]}@example.invalid`);
    assert.equal((await api.readComments("commentId=target")).status, 404);
    api.database.exec("DELETE FROM user_blocks");
  }
  api.database.exec("UPDATE users SET status='suspended' WHERE email='commenter@example.invalid'");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  assert.equal((await (await api.readComments("postId=synthetic-post")).json()).comments.length, 0);
  api.database.exec("UPDATE users SET status='active'; UPDATE posts SET deleted_at=CURRENT_TIMESTAMP");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  api.database.exec("UPDATE posts SET deleted_at=NULL,audience='campus'; INSERT INTO universities(id,name,short_name,city) VALUES ('other-campus','Other','OTHER','Test'); UPDATE student_profiles SET university_id='other-campus' WHERE user_email='actor@example.invalid'");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  api.database.exec("UPDATE posts SET audience='platform'");
  assert.equal((await api.readComments("commentId=target")).status, 200);
});

test("private community membership, bans and archive state apply when resolving a comment ID", async (t) => {
  const api = setup(t); api.seedComment("target");
  api.database.exec("INSERT INTO communities(id,slug,name,description,creator_email,university_id,join_policy) VALUES ('group-a','group-a','Synthetic','Synthetic private community','author@example.invalid','test-campus','approval'); UPDATE posts SET community_id='group-a'");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  api.database.exec("INSERT INTO community_members(community_id,user_email,status) VALUES ('group-a','actor@example.invalid','pending')");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  api.database.exec("UPDATE community_members SET status='active'");
  assert.equal((await api.readComments("commentId=target")).status, 200);
  api.database.exec("INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES ('group-a','actor@example.invalid','author@example.invalid')");
  assert.equal((await api.readComments("commentId=target")).status, 404);
  api.database.exec("DELETE FROM community_bans; UPDATE communities SET status='archived'");
  assert.equal((await api.readComments("commentId=target")).status, 404);
});

test("concurrent identical desired inserts cannot duplicate likes, saves, notifications or audit rows", async (t) => {
  const api = setup(t);
  const likes = await Promise.all([api.action("like", true), api.action("like", true)]);
  assert.ok(likes.every((result) => result.active && result.count === 1));
  const saves = await Promise.all([api.action("save", true), api.action("save", true)]);
  assert.ok(saves.every((result) => result.active));
  assert.equal(api.count("post_likes"), 1); assert.equal(api.count("post_saves"), 1);
  assert.equal(api.count("notifications"), 1); assert.equal(api.count("audit_logs"), 2);
  await Promise.all([api.action("save", false), api.action("save", false)]);
  assert.equal(api.count("post_saves"), 0); assert.equal(api.count("audit_logs"), 3);
});

test("omitting active retains sequential legacy toggle behavior for both actions", async (t) => {
  const api = setup(t);
  for (const type of ["like", "save"]) {
    assert.equal((await api.action(type)).active, true);
    assert.equal((await api.action(type)).active, false);
    assert.equal((await api.action(type)).active, true);
    assert.equal((await api.action(type, true)).active, true, "switching to desired-state callers does not toggle an existing row");
  }
  assert.equal(api.count("post_likes"), 1); assert.equal(api.count("post_saves"), 1); assert.equal(api.count("notifications"), 2);
});

test("invalid desired fields and malformed payloads are rejected before mutation or quota", async (t) => {
  const api = setup(t);
  for (const active of [null, "true", "false", 0, 1, {}, []]) {
    for (const type of ["like", "save"]) assert.equal((await api.request({ postId: "synthetic-post", type, active })).status, 400);
  }
  assert.equal((await api.request({ postId: "synthetic-post", type: "comment", content: "[SYNTHETIC] comment", active: true })).status, 400);
  for (const payload of [null, [], true, 0, "invalid"]) assert.equal((await api.request(payload)).status, 400);
  assert.equal(api.count("post_likes"), 0); assert.equal(api.count("post_saves"), 0); assert.equal(api.count("post_comments"), 0);
  assert.equal(api.count("notifications"), 0); assert.equal(api.count("rate_limit_windows"), 0);
});

test("desired-state requests retain origin, session, campus, block and rate-limit boundaries", async (t) => {
  const api = setup(t);
  const payload = { postId: "synthetic-post", type: "like", active: true };
  assert.equal((await api.request(payload, "https://other.invalid")).status, 403);
  api.database.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('other-campus','[SYNTHETIC] Other','OTHER','Test'); UPDATE student_profiles SET university_id='other-campus' WHERE user_email='actor@example.invalid'; UPDATE posts SET audience='campus' WHERE id='synthetic-post';");
  assert.equal((await api.request(payload)).status, 403);
  api.database.exec("UPDATE posts SET audience='platform' WHERE id='synthetic-post'; INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('author@example.invalid','actor@example.invalid');");
  assert.equal((await api.request(payload)).status, 403);
  api.database.exec("DELETE FROM user_blocks; UPDATE rate_limit_windows SET hit_count=160 WHERE action='post-like';");
  assert.equal((await api.request(payload)).status, 429);
  api.signOut(); assert.equal((await api.request(payload)).status, 401);
  assert.equal(api.count("post_likes"), 0); assert.equal(api.count("notifications"), 0);
});
