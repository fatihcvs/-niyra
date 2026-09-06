import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";
import { createMobileQualityFixtures } from "../scripts/mobile-quality/fixtures.mjs";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const compile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const load = (code, dependencies = {}) => {
  const exports = {};
  runInNewContext(compile(code), { exports, crypto: webcrypto, Response, Request, Headers, URL, Error, require(name) { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; } });
  return exports;
};
const { createMessageSessionState } = load(await source("lib/message-drafts.ts"), { "./secure-random-key": secureRandomKeyDependency("./secure-random-key") });
const fixture = createMobileQualityFixtures();
const person = (id) => ({ publicId: id, displayName: `[SYNTHETIC] ${id}`, handle: id, universityShortName: "TEST", departmentName: "Test" });
const message = (id) => ({ id, createdAt: "2026-09-05T09:00:00.000Z", body: `[SYNTHETIC] ${id}`, own: true, read: false, removed: false, time: "şimdi", attachment: null, attachmentType: null, attachmentId: null });
const thread = (id, changes = {}) => ({ conversationId: `conversation-${id}`, person: person(id), messages: Array.from({ length: 100 }, (_, i) => message(`msg-${String(i).padStart(3, "0")}`)), text: "[SYNTHETIC] Türkçe taslak: İğdır, Şişli", attachment: null, olderCursor: "msg-000", historyLoaded: true, scrollTop: 423, nearBottom: false, ...changes });
const plain = (value) => JSON.parse(JSON.stringify(value));
const setup = (options = {}) => { let sequence = 0; const store = createMessageSessionState({ createKey: () => `synthetic-key-${String(++sequence).padStart(8, "0")}`, ...options }); store.setOwnerScope("viewer:1"); return store; };

test("same-session revisit retains selected recipient, draft, 100 messages, history cursor and reading offset", () => {
  const store = setup(); const original = thread("alice");
  store.saveThread("viewer:1", original);
  store.saveSession("viewer:1", { selected: { conversationId: original.conversationId, person: original.person }, loaded: true });
  assert.deepEqual(plain(store.readThread("viewer:1", "alice")), original);
  assert.equal(store.readSession("viewer:1").selected.person.publicId, "alice");
  store.saveThread("viewer:1", thread("bob", { text: "[SYNTHETIC] Bob draft" }));
  assert.equal(store.readThread("viewer:1", "alice").text, original.text);
  assert.equal(store.readThread("viewer:1", "bob").text, "[SYNTHETIC] Bob draft");
});

test("reads never activate an owner; logout, account changes and relogin reject stale asynchronous completions", async () => {
  const store = createMessageSessionState();
  store.readSession("viewer:1"); store.saveThread("viewer:1", thread("alice"));
  assert.equal(store.readThread("viewer:1", "alice"), undefined);
  store.setOwnerScope("viewer:1"); store.saveThread("viewer:1", thread("alice"));
  const guard = store.capture("viewer:1");
  let complete; const late = new Promise((resolve) => { complete = resolve; }).then(() => { if (guard.isCurrent()) store.saveThread("viewer:1", thread("alice", { text: "late private text" })); });
  store.setOwnerScope(null); store.setOwnerScope("other:1");
  complete(); await late;
  assert.equal(guard.isCurrent(), false);
  assert.equal(store.readThread("other:1", "alice"), undefined);
  assert.equal(store.readSession("viewer:1").selected, null);
  store.setOwnerScope("viewer:2"); assert.equal(store.readThread("viewer:2", "alice"), undefined);
  store.setOwnerScope("viewer:1"); assert.equal(guard.isCurrent(), false, "even an accidentally reused scope cannot revive old request tokens");
});

test("failed retries keep one key; edited content and confirmed later sends receive a fresh key", () => {
  const store = setup(); store.saveThread("viewer:1", thread("alice"));
  const first = store.beginSend("viewer:1", "alice", "[SYNTHETIC] hello", null);
  assert.equal(store.beginSend("viewer:1", "alice", first.body, null), null, "double taps cannot start another in-flight request");
  store.failSend("viewer:1", "alice", first.key, "Connection interrupted");
  const retry = store.beginSend("viewer:1", "alice", first.body, null);
  assert.equal(retry.key, first.key);
  store.failSend("viewer:1", "alice", retry.key, "Offline");
  const edited = store.beginSend("viewer:1", "alice", "[SYNTHETIC] edited", null);
  assert.notEqual(edited.key, first.key);
  store.failSend("viewer:1", "alice", first.key, "stale failure");
  assert.equal(store.attempt("viewer:1", "alice").status, "sending");
  store.completeSend("viewer:1", "alice", edited.key, "conversation-alice", message("confirmed"));
  assert.equal(store.attempt("viewer:1", "alice").status, "sent");
  assert.notEqual(store.beginSend("viewer:1", "alice", edited.body, null).key, edited.key);
});

test("send completion after leaving a thread clears only its matching draft and never another recipient's draft", () => {
  const store = setup(); const original = thread("alice"); store.saveThread("viewer:1", original);
  const send = store.beginSend("viewer:1", "alice", original.text, null);
  store.saveThread("viewer:1", thread("bob")); store.saveSession("viewer:1", { selected: { conversationId: "conversation-bob", person: person("bob") } });
  store.completeSend("viewer:1", "alice", send.key, "conversation-alice", message("confirmed"));
  assert.equal(store.readThread("viewer:1", "alice").text, "");
  assert.ok(store.readThread("viewer:1", "alice").messages.some((item) => item.id === "confirmed"));
  assert.equal(store.readThread("viewer:1", "alice").messages[0].id, "confirmed", "equal timestamps retain the API's ID tie-break order after a delayed replay");
  assert.equal(store.readThread("viewer:1", "bob").text, original.text);
  assert.equal(store.readSession("viewer:1").selected.person.publicId, "bob");
  store.saveThread("viewer:1", thread("alice"));
  const another = store.beginSend("viewer:1", "alice", original.text, null);
  store.saveThread("viewer:1", thread("alice", { text: "[SYNTHETIC] changed while away" }));
  store.completeSend("viewer:1", "alice", another.key, "conversation-alice", message("next"));
  assert.equal(store.readThread("viewer:1", "alice").text, "[SYNTHETIC] changed while away");
});

test("cache size limits preserve the retained boundary cursor and evict whole inactive threads", () => {
  const store = setup({ maxThreads: 2, maxMessages: 100 });
  for (const id of ["alice", "bob", "charlie"]) store.saveThread("viewer:1", thread(id));
  assert.equal(store.readThread("viewer:1", "alice"), undefined);
  const messages = Array.from({ length: 230 }, (_, i) => message(`msg-${String(i).padStart(3, "0")}`));
  store.saveThread("viewer:1", thread("charlie", { messages, olderCursor: null }));
  const cached = store.readThread("viewer:1", "charlie");
  assert.equal(cached.messages.length, 100);
  assert.equal(cached.messages[0].id, "msg-130"); assert.equal(cached.olderCursor, "msg-130");
  store.removeThread("viewer:1", "charlie"); assert.equal(store.readThread("viewer:1", "charlie"), undefined);
});

test("confirmed blocks clear the recipient cache and attempt, fence stale writes, and cannot be reversed by another owner", () => {
  const store = setup(); const original = thread("alice");
  store.saveThread("viewer:1", original);
  store.saveSession("viewer:1", { selected: { conversationId: original.conversationId, person: original.person }, conversations: [{ id: original.conversationId, person: original.person, preview: "private", lastMessageOwn: false, unreadCount: 1, time: "now" }] });
  const pending = store.beginSend("viewer:1", "alice", original.text, null);
  store.setRecipientRestriction("viewer:1", "alice", true);
  assert.equal(store.readThread("viewer:1", "alice"), undefined); assert.equal(store.attempt("viewer:1", "alice"), undefined);
  assert.equal(store.readSession("viewer:1").selected, null); assert.equal(store.readSession("viewer:1").conversations.length, 0);
  store.saveThread("viewer:1", original); store.saveSession("viewer:1", { selected: { conversationId: original.conversationId, person: original.person } });
  assert.equal(store.readThread("viewer:1", "alice"), undefined); assert.equal(store.readSession("viewer:1").selected, null);
  assert.equal(store.beginSend("viewer:1", "alice", "new", null), null);
  store.setRecipientRestriction("other:1", "alice", false); assert.equal(store.isRestricted("viewer:1", "alice"), true);
  store.setRecipientRestriction("viewer:1", "alice", false);
  store.completeSend("viewer:1", "alice", pending.key, original.conversationId, message("late"));
  assert.equal(store.attempt("viewer:1", "alice"), undefined);
  assert.ok(store.beginSend("viewer:1", "alice", "new", null));
  store.setRecipientRestriction("viewer:1", "alice", true); store.setOwnerScope("other:1");
  assert.equal(store.isRestricted("other:1", "alice"), false, "restrictions are scoped to the authenticated session");
});

test("real new-message dialog describes an empty search as a first-use prompt and does not request people", async () => {
  const calls = [];
  const ui = await createMobileDom({ view: "messages", fetch: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ conversations: [], messages: [], shareables: [], people: [] }) }; } });
  try {
    ui.load("lib/message-drafts.ts").setMessageOwnerScope("viewer:1");
    ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("viewer:1");
    const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
    const Component = ui.load("app/direct-messages.tsx").DirectMessagesWorkspace;
    await ui.render(h(Provider, { ownerScope: "viewer:1", onBack() {}, onSessionExpired() {} }, h(Component, { initialRecipient: null, onNavigate() {}, onUnreadChange() {} })));
    await ui.click(ui.host.querySelector('[aria-label="Yeni mesaj"]'));
    const dialog = () => ui.host.querySelector('[role="dialog"]');
    assert.match(dialog().textContent, /kişinin adını veya kullanıcı adını ara/);
    assert.doesNotMatch(dialog().textContent, /eşleşen öğrenci bulunamadı/);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 310)); });
    assert.equal(calls.some((url) => url.startsWith("/api/people")), false, "empty search never requests people");
    const input = ui.host.querySelector('[aria-label="Mesaj gönderilecek öğrenciyi ara"]');
    await ui.fill(input, "Deniz");
    assert.match(dialog().textContent, /Öğrenciler aranıyor/);
    await ui.fill(input, " ");
    assert.match(dialog().textContent, /kişinin adını veya kullanıcı adını ara/);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 310)); });
    assert.equal(calls.some((url) => url.startsWith("/api/people")), false, "clearing a draft search cancels its pending request");
  } finally { await ui.close(); }
});

const serverCode = await source("lib/server-api.ts");
const routeCode = await source("app/api/messages/route.ts");
const activeActorCode = await source("lib/active-actor.ts");
const profileCode = await source("lib/profile.ts");
const authCode = await source("lib/app-auth.ts");
const syntax = ts.createSourceFile("app-auth.ts", authCode, ts.ScriptTarget.Latest, true);
const auth = load(syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sameOriginRequest").getText(syntax));
const migrationDirectory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));

function api(t) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((migration) => database.exec(migration));
  database.prepare("INSERT INTO universities (id,name,short_name,city) VALUES (?,?,?,?)").run(fixture.university.id, fixture.university.name, fixture.university.shortName, fixture.university.city);
  database.prepare("INSERT INTO departments (id,name) VALUES (?,?)").run(fixture.department.id, fixture.department.name);
  for (const user of Object.values(fixture.profiles)) {
    database.prepare("INSERT INTO users (email,public_id,display_name,handle) VALUES (?,?,?,?)").run(user.email,user.publicId,user.displayName,user.handle);
    database.prepare("INSERT INTO student_profiles (user_email,university_id,department_id,class_year) VALUES (?,?,?,?)").run(user.email,user.universityId,user.departmentId,user.classYear);
  }
  const DB = {
    prepare(query) { return { bind(...values) { return {
      async first() { return database.prepare(query).get(...values) ?? null; },
      async all() { return { results: database.prepare(query).all(...values) }; },
      execute() { const result = database.prepare(query).run(...values); return { success:true,meta:{changes: Number(result.changes)} }; },
      async run() { return this.execute(); },
    }; } }; },
    async batch(statements) { database.exec("BEGIN"); try { const results = statements.map((statement) => statement.execute()); database.exec("COMMIT"); return results; } catch (error) { database.exec("ROLLBACK"); throw error; } },
  };
  let identity = fixture.profiles.populated;
  const server = load(serverCode, { "../app/chatgpt-auth": { getChatGPTUser: async () => identity } });
  const route = load(routeCode, { "../../../lib/active-actor": load(activeActorCode), "../../../lib/app-auth": auth, "../../../lib/profile": load(profileCode), "../../../lib/server-api": { ...server, unavailableResponse(error) { throw error; }, getRuntime: async () => ({ DB }) } });
  const request = (method, payload, search = "") => new Request(`https://example.invalid/api/messages${search}`, { method, headers: { "content-type":"application/json", origin:"https://example.invalid" }, ...(payload ? {body:JSON.stringify(payload)} : {}) });
  return { database, route, request, identity: (user) => { identity = user; }, post: (payload) => route.POST(request("POST", payload)), get: (search) => route.GET(request("GET", null, search)) };
}

test("real POST lost-response retry returns one persisted message and one notification; changed-payload reuse conflicts", async (t) => {
  const app = api(t); const body = { recipientId: fixture.profiles.longName.publicId, body: "[SYNTHETIC] İğdır mesajı", clientMessageKey: "synthetic-retry-key-0001" };
  const sent = await app.post(body); assert.equal(sent.status, 201); const original = await sent.json();
  const retry = await app.post(body); assert.equal(retry.status, 200); const replay = await retry.json();
  assert.equal(replay.message.id, original.message.id); assert.equal(replay.message.createdAt, original.message.createdAt);
  assert.equal(replay.message.read, false);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM direct_messages").get().count, 1);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE kind='direct-message'").get().count, 1);
  assert.equal((await app.post({...body,body:"[SYNTHETIC] different"})).status, 409);
  assert.equal((await app.post({...body,clientMessageKey:"x"})).status, 400);
  assert.equal((await app.post({...body,clientMessageKey:"x".repeat(101)})).status, 400);
});

test("real POST concurrent retry is constrained by the database and sender scope", async (t) => {
  const app = api(t); const payload = { recipientId: fixture.profiles.longName.publicId, body:"[SYNTHETIC] concurrent", clientMessageKey:"synthetic-concurrent-0001" };
  // Establish the conversation first so this isolates the message insert race.
  const initial = await (await app.post({...payload,clientMessageKey:"synthetic-initial-key-0001"})).json();
  const request = { ...payload, conversationId:initial.conversationId,recipientId:undefined };
  const responses = await Promise.all([app.post(request),app.post(request)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200,201]);
  const messages = await Promise.all(responses.map((response) => response.json())); assert.equal(messages[0].message.id,messages[1].message.id);
  app.identity(fixture.profiles.longName);
  const reverse = await app.post({...request,body:"[SYNTHETIC] other sender"}); assert.equal(reverse.status,201);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM direct_messages WHERE client_message_key=?").get(payload.clientMessageKey).count, 2);
});

test("real backend read receipts require the recipient PATCH; blocked, outsider and logged-out retries cannot read cached messages", async (t) => {
  const app = api(t); const sender = fixture.profiles.populated; const recipient = fixture.profiles.longName;
  const payload = {recipientId:recipient.publicId,body:"[SYNTHETIC] private",clientMessageKey:"synthetic-private-key-0001"};
  const sent = await (await app.post(payload)).json();
  let result = await (await app.get(`?conversationId=${sent.conversationId}`)).json(); assert.equal(result.messages[0].read,false);
  app.identity(recipient); assert.equal((await app.route.PATCH(app.request("PATCH",{action:"read",conversationId:sent.conversationId}))).status,200);
  app.identity(sender); result = await (await app.get(`?conversationId=${sent.conversationId}`)).json(); assert.equal(result.messages[0].read,true);
  app.database.prepare("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES (?,?)").run(recipient.email,sender.email);
  assert.equal((await app.post(payload)).status,403);
  assert.equal((await app.get(`?conversationId=${sent.conversationId}`)).status,403);
  app.identity(fixture.profiles.empty); assert.equal((await app.get(`?conversationId=${sent.conversationId}`)).status,404);
  app.identity(null); assert.equal((await app.post(payload)).status,401);
});

test("real GET pages restore 200 loaded messages, cap memory at an exact cursor and resume without gaps", async (t) => {
  const app = api(t); const sent = await (await app.post({recipientId:fixture.profiles.longName.publicId,body:"[SYNTHETIC] establish"})).json();
  app.database.prepare("DELETE FROM direct_messages WHERE conversation_id=?").run(sent.conversationId);
  for(let index=0;index<250;index++) app.database.prepare("INSERT INTO direct_messages(id,conversation_id,sender_email,body,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(`synthetic-message-${String(index).padStart(4,"0")}`,sent.conversationId,fixture.profiles.populated.email,`[SYNTHETIC] ${index}`,"2026-09-05T09:00:00.000Z","2026-09-05T09:00:00.000Z");
  const page = async (before) => {const response=await app.get(`?conversationId=${sent.conversationId}${before?`&before=${before}`:""}`);assert.equal(response.status,200);return response.json();};
  const latest=await page(); const older=await page(latest.olderCursor);
  const store=setup({maxMessages:100});store.saveThread("viewer:1",thread("alice",{conversationId:sent.conversationId,messages:[...older.messages,...latest.messages],olderCursor:older.olderCursor}));
  const restored=store.readThread("viewer:1","alice");assert.equal(restored.messages.length,100);assert.equal(restored.olderCursor,latest.olderCursor);
  const resumed=await page(restored.olderCursor);
  assert.deepEqual(resumed.messages.map((item)=>item.id),older.messages.map((item)=>item.id));
  assert.equal(new Set([...resumed.messages,...restored.messages].map((item)=>item.id)).size,200);
});
