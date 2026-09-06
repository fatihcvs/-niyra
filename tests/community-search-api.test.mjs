import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMobileQualityFixtures } from "../scripts/mobile-quality/fixtures.mjs";

const root = new URL("../", import.meta.url);
const fixture = createMobileQualityFixtures();
const files = ["lib/server-api.ts", "lib/profile.ts", "lib/platform-settings.ts", "lib/search-query.ts", "lib/app-auth.ts", "lib/active-actor.ts", "app/api/search/route.ts", "app/api/communities/route.ts", "app/api/community-posts/route.ts", "app/api/community-events/route.ts", "app/api/messages/route.ts"];
const sources = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, root), "utf8")])));
function load(name, dependencies = {}, code = sources[name]) {
  const exports = {};
  runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, crypto: webcrypto, Request, Response, Headers, URL, Error, require(specifier) { assert.ok(specifier in dependencies, `Unexpected import ${specifier}`); return dependencies[specifier]; } });
  return exports;
}
const authSyntax = ts.createSourceFile("app-auth.ts", sources["lib/app-auth.ts"], ts.ScriptTarget.Latest, true);
const auth = load("lib/app-auth.ts", {}, authSyntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sameOriginRequest").getText(authSyntax));
const directory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, directory), "utf8")));
function setup(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close()); db.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => db.exec(sql));
  db.prepare("INSERT INTO universities(id,name,short_name,city) VALUES (?,?,?,?)").run(fixture.university.id,fixture.university.name,fixture.university.shortName,fixture.university.city);
  db.prepare("INSERT INTO departments(id,name) VALUES (?,?)").run(fixture.department.id,fixture.department.name);
  for (const user of Object.values(fixture.profiles)) {
    db.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,?,?,?)").run(user.email,user.publicId,user.displayName,user.handle);
    db.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES (?,?,?,?)").run(user.email,user.universityId,user.departmentId,user.classYear);
  }
  let identity = fixture.profiles.populated;
  const DB = {
    prepare(sql) { return { bind(...values) { return {
      async first() { return db.prepare(sql).get(...values) ?? null; }, async all() { return { results: db.prepare(sql).all(...values) }; },
      execute() { const result = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; }, async run() { return this.execute(); },
    }; } }; },
    async batch(statements) { db.exec("BEGIN"); try { const results = statements.map((statement) => statement.execute()); db.exec("COMMIT"); return results; } catch (error) { db.exec("ROLLBACK"); throw error; } },
  };
  const server = load("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser: async () => identity } });
  const dependencies = { "../../../lib/app-auth": auth, "../../../lib/profile": load("lib/profile.ts"), "../../../lib/search-query": load("lib/search-query.ts"), "../../../lib/platform-settings": load("lib/platform-settings.ts"), "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }), unavailableResponse(error) { throw error; } } };
  dependencies["../../../lib/active-actor"] = load("lib/active-actor.ts");
  const routes = Object.fromEntries(["search","communities","community-posts","community-events","messages"].map((name) => [name, load(`app/api/${name}/route.ts`, dependencies)]));
  const request = async (route, method = "GET", payload = null, params = {}) => routes[route][method](new Request(`https://example.invalid/api/${route}?${new URLSearchParams(params)}`, { method, headers: { "content-type":"application/json", origin:"https://example.invalid" }, ...(payload ? { body: JSON.stringify(payload) } : {}) }));
  const create = async (joinPolicy = "open", name = "[SYNTHETIC] IĞDIR ÇALIŞMA TOPLULUĞU") => {
    const response = await request("communities","POST",{ name,description:"[SYNTHETIC] İzole çalışma grubu",category:"akademik",joinPolicy,rules:"[SYNTHETIC] Saygılı ol." }); assert.equal(response.status,201); return (await response.json()).community;
  };
  return { db, request, create, identity(user) { identity = user; } };
}

test("actual search matches Turkish uppercase, retains people without faculty, treats wildcard input literally and keeps scope", async (t) => {
  const api = setup(t);
  api.db.prepare("UPDATE users SET display_name=? WHERE email=?").run("[SYNTHETIC] IĞDIR ŞÜKRÜ ÖĞRENCİ",fixture.profiles.longName.email);
  const group = await api.create();
  let response = await api.request("search","GET",null,{q:"ığdır",scope:"campus"}); assert.equal(response.headers.get("cache-control"),"no-store");
  let result=await response.json(); assert.equal(result.people[0].public_id,fixture.profiles.longName.publicId); assert.equal(result.communities[0].id,group.id);
  response=await api.request("search","GET",null,{q:"şükrü"}); result=await response.json(); assert.equal(result.people.length,1);
  result=await (await api.request("search","GET",null,{q:"%_"})).json(); assert.equal(result.people.length,0); assert.equal(result.communities.length,0);
  result=await (await api.request("search","GET",null,{q:"a",scope:"platform"})).json(); assert.equal(result.scope,"platform"); assert.equal(result.posts.length,0);
  // Search analytics must not replace correct results with an unrelated write failure.
  api.db.exec("DROP TABLE product_events"); result=await (await api.request("search","GET",null,{q:"ığdır"})).json(); assert.equal(result.communities.length,1);
});

test("search, directory and detail exclude bans, removed results and an old campus consistently", async (t) => {
  const api = setup(t); const group=await api.create();
  api.identity(fixture.profiles.longName);
  api.db.prepare("INSERT INTO community_bans(community_id,user_email,banned_by_email,reason) VALUES (?,?,?,?)").run(group.id,fixture.profiles.longName.email,fixture.profiles.populated.email,"[SYNTHETIC] ban");
  assert.equal((await (await api.request("search","GET",null,{q:"ığdır"})).json()).communities.length,0);
  const hiddenDirectory = await (await api.request("communities")).json();
  assert.equal(hiddenDirectory.communities.length,0); assert.equal(hiddenDirectory.stats.total,0);
  assert.equal((await api.request("communities","GET",null,{id:group.id})).status,404);
  api.identity(fixture.profiles.empty);
  api.db.prepare("INSERT INTO universities(id,name,short_name,city) VALUES ('other','[SYNTHETIC] Other','OTHER','Test')").run();
  api.db.prepare("UPDATE student_profiles SET university_id='other' WHERE user_email=?").run(fixture.profiles.empty.email);
  assert.equal((await api.request("communities","GET",null,{id:group.id})).status,404);
  assert.equal((await (await api.request("search","GET",null,{q:"ığdır"})).json()).communities.length,0);
  api.identity(fixture.profiles.populated); api.db.prepare("UPDATE communities SET moderation_status='removed' WHERE id=?").run(group.id);
  assert.equal((await api.request("communities","GET",null,{id:group.id})).status,404);
  api.identity(null); assert.equal((await api.request("search","GET",null,{q:"ığdır"})).status,401);
});

test("real private membership request, founder approval, post and event permissions remain enforced by APIs", async (t) => {
  const api=setup(t); const group=await api.create("request");
  api.identity(fixture.profiles.longName);
  let response=await api.request("communities","PATCH",{id:group.id,action:"join"}); assert.equal(response.status,200); assert.equal((await response.json()).pending,true);
  assert.equal((await api.request("community-posts","POST",{communityId:group.id,content:"[SYNTHETIC] Unauthorized post",postType:"discussion"})).status,403);
  assert.equal((await api.request("community-posts","GET",null,{communityId:group.id})).status,403);
  api.identity(fixture.profiles.populated);
  response=await api.request("communities","PATCH",{id:group.id,action:"approve",targetId:fixture.profiles.longName.publicId}); assert.equal(response.status,200);
  api.identity(fixture.profiles.longName);
  response=await api.request("community-posts","POST",{communityId:group.id,content:"[SYNTHETIC] Confirmed member post",postType:"discussion"}); assert.equal(response.status,201); assert.ok((await response.json()).post.id);
  const event={communityId:group.id,title:"[SYNTHETIC] Event",description:"[SYNTHETIC] Actual test event",location:"[SYNTHETIC] Campus",startsAt:"2099-01-01T12:00:00Z"};
  assert.equal((await api.request("community-events","POST",event)).status,403);
  api.identity(fixture.profiles.populated); response=await api.request("community-events","POST",event); assert.equal(response.status,201); const created=(await response.json()).event;
  api.identity(fixture.profiles.longName); assert.equal((await api.request("community-events","PATCH",{id:created.id,action:"cancel"})).status,403);
  response=await api.request("community-events","PATCH",{id:created.id,action:"rsvp"}); assert.equal(response.status,200); assert.equal((await response.json()).going,true);
  api.identity(fixture.profiles.populated); response=await api.request("communities","PATCH",{id:group.id,action:"ban",targetId:fixture.profiles.longName.publicId,reason:"[SYNTHETIC] test"}); assert.equal(response.status,200);
  api.identity(fixture.profiles.longName); assert.equal((await api.request("communities","PATCH",{id:group.id,action:"join"})).status,403);
});

test("member search reaches beyond the first 120 and excludes blocked, inactive and moved members", async (t) => {
  const api = setup(t); const group = await api.create();
  for (let index = 0; index < 130; index++) {
    const id = `synthetic-member-${String(index).padStart(3,"0")}`; const email = `${id}@example.invalid`;
    api.db.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,?,?,?)").run(email,id,index === 129 ? "[SYNTHETIC] ŞÜKRÜ IĞDIR SONÜYE" : `[SYNTHETIC] Öğrenci ${index}`,id);
    api.db.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES (?,?,?,1)").run(email,fixture.university.id,fixture.department.id);
    api.db.prepare("INSERT INTO community_members(community_id,user_email,role,status,created_at) VALUES (?,?,'member','active',?)").run(group.id,email,`2099-01-01T00:${String(Math.floor(index/60)).padStart(2,"0")}:${String(index%60).padStart(2,"0")}Z`);
  }
  let result = await (await api.request("communities","GET",null,{id:group.id})).json();
  assert.equal(result.members.length,120); assert.equal(result.members.some((member) => member.publicId === "synthetic-member-129"),false);
  const find = async () => (await (await api.request("communities","GET",null,{id:group.id,memberQ:"şükrü ığdır"})).json()).members;
  assert.equal((await find())[0].publicId,"synthetic-member-129");
  const email = "synthetic-member-129@example.invalid";
  api.db.prepare("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES (?,?)").run(email,fixture.profiles.populated.email);
  assert.equal((await find()).length,0); api.db.prepare("DELETE FROM user_blocks WHERE blocker_email=?").run(email);
  api.db.prepare("UPDATE users SET status='suspended' WHERE email=?").run(email); assert.equal((await find()).length,0);
  api.db.prepare("UPDATE users SET status='active' WHERE email=?").run(email);
  api.db.prepare("INSERT INTO universities(id,name,short_name,city) VALUES ('moved','[SYNTHETIC] Moved','MOVED','Test')").run();
  api.db.prepare("UPDATE student_profiles SET university_id='moved' WHERE user_email=?").run(email); assert.equal((await find()).length,0);
});

test("event targets reach old cancelled records and preserve private membership, bans and parent checks", async (t) => {
  const api = setup(t); const group = await api.create("request");
  const response = await api.request("community-events", "POST", { communityId: group.id, title: "[SYNTHETIC] Linked event", description: "[SYNTHETIC] Targeted private event", location: "Test campus", startsAt: "2099-01-01T12:00:00Z" });
  const target = (await response.json()).event;
  api.db.prepare("UPDATE community_events SET starts_at='2020-01-01T12:00:00Z', status='cancelled' WHERE id=?").run(target.id);
  assert.equal((await (await api.request("community-events", "GET", null, { communityId: group.id })).json()).events.length, 0);
  const linked = await (await api.request("community-events", "GET", null, { id: target.id })).json();
  assert.equal(linked.communityId, group.id); assert.equal(linked.event.id, target.id); assert.equal(linked.event.status, "cancelled");
  assert.equal((await api.request("community-events", "GET", null, { id: target.id, communityId: "wrong" })).status, 404);
  api.identity(fixture.profiles.longName);
  assert.equal((await api.request("community-events", "GET", null, { id: target.id })).status, 403);
  api.db.prepare("UPDATE communities SET join_policy='open' WHERE id=?").run(group.id);
  api.db.prepare("INSERT INTO community_bans(community_id,user_email,banned_by_email,reason) VALUES (?,?,?,?)").run(group.id, fixture.profiles.longName.email, fixture.profiles.populated.email, "[SYNTHETIC] ban");
  assert.equal((await api.request("community-events", "GET", null, { id: target.id })).status, 404);
  api.identity(null); assert.equal((await api.request("community-events", "GET", null, { id: target.id })).status, 401);
});

test("message IDs resolve only for current conversation members and never disclose removed or blocked content", async (t) => {
  const api = setup(t); const viewer = fixture.profiles.populated, peer = fixture.profiles.longName;
  const pair = [viewer.email, peer.email].sort();
  api.db.prepare("INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('linked-thread',?,?,?)").run(fixture.university.id, ...pair);
  api.db.prepare("INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('linked-message','linked-thread',?,?)").run(peer.email, "[SYNTHETIC] Linked private message");
  let response = await api.request("messages", "GET", null, { messageId: "linked-message" });
  let result = await response.json(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.conversationId, "linked-thread"); assert.equal(result.linkedMessage.body, "[SYNTHETIC] Linked private message");
  assert.equal(result.conversations.find((item) => item.id === "linked-thread").person.publicId, peer.publicId);
  assert.equal((await api.request("messages", "GET", null, { messageId: "linked-message", conversationId: "different" })).status, 404);
  api.identity(fixture.profiles.empty); response = await api.request("messages", "GET", null, { messageId: "linked-message" });
  assert.equal(response.status, 404); assert.equal((await response.json()).linkedMessage, undefined);
  api.identity(viewer); api.db.prepare("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES (?,?)").run(peer.email, viewer.email);
  assert.equal((await api.request("messages", "GET", null, { messageId: "linked-message" })).status, 403);
  api.db.exec("DELETE FROM user_blocks"); api.db.prepare("UPDATE direct_messages SET deleted_at=CURRENT_TIMESTAMP WHERE id='linked-message'").run();
  response = await api.request("messages", "GET", null, { messageId: "linked-message" }); assert.equal(response.status, 404); result = await response.json(); assert.equal(result.linkedMessage, undefined);
  api.identity(null); assert.equal((await api.request("messages", "GET", null, { messageId: "linked-message" })).status, 401);
});

test("linked conversations remain addressable beyond the latest 100 and campus moves revoke access", async (t) => {
  const api = setup(t); const viewer = fixture.profiles.populated;
  for (let index = 0; index < 101; index++) {
    const email = `linked-peer-${index}@example.invalid`;
    api.db.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES (?,?,?,?)").run(email, `linked-peer-${index}`, "[SYNTHETIC] Peer", `linked-peer-${index}`);
    api.db.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES (?,?,?,1)").run(email, fixture.university.id, fixture.department.id);
    api.db.prepare("INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email,last_message_at) VALUES (?,?,?,?,?)").run(`thread-${index}`, fixture.university.id, ...[email, viewer.email].sort(), index === 0 ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z");
  }
  const list = await (await api.request("messages")).json(); assert.equal(list.conversations.length, 100); assert.equal(list.conversations.some((item) => item.id === "thread-0"), false);
  const target = await (await api.request("messages", "GET", null, { conversationId: "thread-0" })).json(); assert.equal(target.conversations[0].id, "thread-0"); assert.equal(target.conversationId, "thread-0");
  api.db.prepare("INSERT INTO universities(id,name,short_name,city) VALUES ('message-moved','[SYNTHETIC] Moved','MOVED','Test')").run();
  api.db.prepare("UPDATE student_profiles SET university_id='message-moved' WHERE user_email='linked-peer-0@example.invalid'").run();
  assert.equal((await api.request("messages", "GET", null, { conversationId: "thread-0" })).status, 403);
});
