import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createECDH, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import webPush from "web-push";

const require = createRequire(import.meta.url);
const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const sourceFiles = ["lib/app-auth.ts", "lib/workspace-navigation.ts", "lib/push-config.ts", "lib/push-target-access.ts", "lib/push-subscriptions.ts", "lib/push-delivery.ts", "app/api/push-subscriptions/route.ts"];
const sources = new Map(await Promise.all(sourceFiles.map(async (path) => [path, ts.transpileModule(await readFile(new URL(`../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText])));
const vapid = webPush.generateVAPIDKeys();
const keys = createECDH("prime256v1"); keys.generateKeys();
const authSecret = randomBytes(16);
const clientSubscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-test-token", keys: { p256dh: keys.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") } };
const privateFcm = generateKeyPairSync("rsa", { modulusLength: 2048 });
const fcmPem = privateFcm.privateKey.export({ type: "pkcs8", format: "pem" });

async function fixture(t, { configured = true, native = false } = {}) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close()); database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => database.exec(sql));
  database.exec("INSERT INTO users(email,display_name,handle,public_id) VALUES ('owner@test.local','Owner','owner','owner-public'),('actor@test.local','Actor','actor','actor-public'),('other@test.local','Other','other','other-public')");
  database.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('campus','Campus','UNI','City'),('other-campus','Other','OTH','City'); INSERT INTO departments(id,name) VALUES ('department','Department'); INSERT INTO student_profiles(user_email,university_id,department_id,class_year) SELECT email,'campus','department',1 FROM users; INSERT INTO posts(id,author_email,content,audience) VALUES ('post-id','owner@test.local','Private post','campus'); INSERT INTO post_comments(id,post_id,author_email,content) VALUES ('comment-id','post-id','actor@test.local','Private comment');");
  const sessionToken = "synthetic-session-cookie-token";
  const tokenHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionToken))).toString("hex");
  database.prepare("INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES (?, 'owner@test.local','2099-01-01T00:00:00Z')").run(tokenHash);
  database.exec("INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES ('other-session','other@test.local','2099-01-01T00:00:00Z')");
  let beforeBatch = null, loseBatchAck = false;
  const DB = {
    prepare(sql) { return { bind(...values) { return { sql, values,
      async first() { return database.prepare(sql).get(...values) ?? null; },
      async all() { return { results: database.prepare(sql).all(...values) }; },
      async run() { return database.prepare(sql).run(...values); },
    }; } }; },
    async batch(statements) {
      if (beforeBatch) await beforeBatch();
      database.exec("BEGIN"); let results;
      try { results = statements.map((entry) => database.prepare(entry.sql).run(...entry.values)); database.exec("COMMIT"); } catch (error) { database.exec("ROLLBACK"); throw error; }
      if (loseBatchAck) { loseBatchAck = false; throw new Error("Committed enrollment acknowledgement lost"); }
      return results;
    },
  };
  const env = configured ? { PUSH_VAPID_SUBJECT: "https://kampira.test", PUSH_VAPID_PUBLIC_KEY: vapid.publicKey, PUSH_VAPID_PRIVATE_KEY: vapid.privateKey } : {};
  if (native) Object.assign(env, { FCM_PROJECT_ID: "synthetic-project", FCM_CLIENT_EMAIL: "sender@synthetic-project.iam.gserviceaccount.com", FCM_PRIVATE_KEY: fcmPem });
  const modules = new Map();
  const server = { getRuntime: async () => ({ DB }), enforceRateLimit: async () => ({ allowed: true }), rateLimitResponse: () => Response.json({}, { status: 429 }) };
  for (const [path, source] of sources) {
    const loaded = {};
    runInNewContext(source, { exports: loaded, crypto, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date, Request, Response, Headers, AbortSignal, atob, btoa,
      require(name) {
        if (name === "node:crypto" || name === "web-push") return require(name);
        if (name === "cloudflare:workers") return { env };
        if (name.endsWith("/server-api")) return server;
        const filename = name.split("/").at(-1);
        const key = `lib/${filename}.ts`;
        if (modules.has(key)) return modules.get(key);
        throw new Error(`Unexpected import ${name}`);
      },
    }); modules.set(path, loaded);
  }
  const api = modules.get("app/api/push-subscriptions/route.ts"), subscriptions = modules.get("lib/push-subscriptions.ts"), delivery = modules.get("lib/push-delivery.ts");
  const config = modules.get("lib/push-config.ts").getPushConfig(env);
  const session = { email: "owner@test.local", publicId: "owner-public", tokenHash };
  const headers = { cookie: `uniyra_session=${sessionToken}`, "X-Account-Context": "owner-public", origin: "https://kampira.test" };
  return { database, DB, env, modules, config, session, headers, subscriptions, delivery,
    beforeBatch(value) { beforeBatch = value; }, loseBatchAck() { loseBatchAck = true; },
    async enroll(deviceId = "device:synthetic-a", subscription = clientSubscription) { return subscriptions.registerPushSubscription(DB, config, session, { kind: "web", deviceId, subscription }); },
    notification(id = crypto.randomUUID(), kind = "interaction") { database.prepare("INSERT INTO notifications(id,user_email,actor_email,kind,title,body,entity_type,entity_id) VALUES (?,'owner@test.local','actor@test.local',?,'PRIVATE TITLE','PRIVATE BODY','comment','comment-id')").run(id, kind); return id; },
    request(method, body, extraHeaders = {}, query = "") { return api[method](new Request(`https://kampira.test/api/push-subscriptions${query}`, { method, headers: { ...headers, ...extraHeaders }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) })); },
    jobs() { return database.prepare("SELECT * FROM push_deliveries ORDER BY id").all(); },
  };
}

test("missing or malformed provider configuration is unavailable and enroll never fabricates success", async (t) => {
  const f = await fixture(t, { configured: false });
  const response = await f.request("GET"); const status = await response.json();
  assert.deepEqual(status.webPush, { available: false, publicKey: null }); assert.deepEqual(status.nativePush, { available: false });
  assert.equal((await f.request("POST", { kind: "web", deviceId: "device:test-a", subscription: clientSubscription })).status, 503);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 0);
  const getConfig = f.modules.get("lib/push-config.ts").getPushConfig;
  assert.equal(getConfig({ PUSH_VAPID_SUBJECT: "https://kampira.test", PUSH_VAPID_PUBLIC_KEY: vapid.publicKey, PUSH_VAPID_PRIVATE_KEY: "x".repeat(43) }).web, null);
  assert.equal((await f.delivery.dispatchPushOutbox(f.DB, f.config)).disabled, 1);
});

test("strict provider URL allowlist and elliptic-curve key validation reject SSRF and malformed subscriptions", async (t) => {
  const f = await fixture(t);
  for (const endpoint of ["http://fcm.googleapis.com/fcm/send/abc", "https://127.0.0.1/push", "https://169.254.169.254/push", "https://fcm.googleapis.com.evil.test/fcm/send/abc", "https://user:pass@fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com:8443/fcm/send/abc", "https://fcm.googleapis.com/v1/projects/p/messages:send", "https://fcm.googleapis.com/fcm/send/abc?url=http://localhost", "https://evil.notify.windows.com/other?token=a"]) {
    assert.equal(f.subscriptions.validPushEndpoint(endpoint), false, endpoint);
    await assert.rejects(f.enroll("device:invalid", { ...clientSubscription, endpoint }), (error) => error.status === 400);
  }
  await assert.rejects(f.enroll("device:invalid", { ...clientSubscription, keys: { ...clientSubscription.keys, p256dh: "A".repeat(87) } }), (error) => error.status === 400);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 0);
});

test("subscription endpoint/session ownership, context and Origin checks cannot be bypassed by a client device ID", async (t) => {
  const f = await fixture(t); const subscription = await f.enroll();
  assert.equal((await f.enroll()).id, subscription.id);
  await assert.rejects(f.subscriptions.registerPushSubscription(f.DB, f.config, { email: "other@test.local", publicId: "other-public", tokenHash: "other-session" }, { kind: "web", deviceId: "device:synthetic-a", subscription: clientSubscription }), (error) => error.status === 409);
  assert.equal((await f.request("GET", undefined, { "X-Account-Context": "other-public" })).status, 409);
  assert.equal((await f.request("DELETE", {}, { origin: "https://evil.test" })).status, 403);
  assert.equal((await f.request("GET", undefined, { cookie: "" })).status, 401);
  const status = await (await f.request("GET")).json(); assert.equal(status.subscriptions[0].deviceId, "device:synthetic-a");
  const serialized = JSON.stringify(status); for (const secret of [vapid.privateKey, authSecret.toString("base64url"), clientSubscription.endpoint, f.session.tokenHash]) assert.ok(!serialized.includes(secret));
});

test("notification trigger queues only existing devices, including atomic notifications, with no historical backfill", async (t) => {
  const f = await fixture(t); f.notification("before-opt-in"); assert.equal(f.jobs().length, 0); await f.enroll(); assert.equal(f.jobs().length, 0);
  f.notification("after-opt-in"); assert.equal(f.jobs().length, 1);
  await f.DB.batch([f.DB.prepare("INSERT INTO notifications(id,user_email,actor_email,kind,title,entity_type,entity_id) VALUES ('atomic','owner@test.local','actor@test.local','community','Private','community','community-id')").bind()]);
  assert.equal(f.jobs().length, 2);
  f.database.exec("CREATE TRIGGER reject_late_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'failure'); END");
  await assert.rejects(f.DB.batch([f.DB.prepare("INSERT INTO notifications(id,user_email,kind,title) VALUES ('rollback','owner@test.local','interaction','Private')").bind(), f.DB.prepare("INSERT INTO audit_logs(id,actor_email,action) VALUES ('audit','owner@test.local','test')").bind()]));
  assert.equal(f.jobs().length, 2);
});

test("identical concurrent enrollment preserves one canonical generation and recovers a lost commit acknowledgement", async (t) => {
  const f = await fixture(t); let waiting = 0, release; const barrier = new Promise((resolve) => { release = resolve; });
  f.beforeBatch(async () => { if (++waiting === 2) release(); await barrier; });
  const [first, second] = await Promise.all([f.enroll(), f.enroll()]);
  assert.equal(first.id, second.id); assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 1);
  f.beforeBatch(null); f.notification("preserve-generation"); assert.equal((await f.enroll()).id, first.id); assert.equal(f.jobs().length, 1);
  f.loseBatchAck(); const rotated = await f.enroll("device:synthetic-a", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-new` });
  assert.notEqual(rotated.id, first.id); assert.equal(f.jobs().length, 0); assert.equal((await f.enroll("device:synthetic-a", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-new` })).id, rotated.id);
});

test("concurrent enrollment cannot exceed the device limit or falsely expire an active session; rotation at the limit works", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 11; index++) await f.enroll(`device:initial-${index}`, { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-${index}` });
  let waiting = 0, release; const barrier = new Promise((resolve) => { release = resolve; });
  f.beforeBatch(async () => { if (++waiting === 2) release(); await barrier; });
  const results = await Promise.allSettled([f.enroll("device:race-a", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-race-a` }), f.enroll("device:race-b", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-race-b` })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected"); assert.equal(rejected.reason.status, 409); assert.notEqual(rejected.reason.code, "PUSH_SESSION_EXPIRED");
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 12);
  f.beforeBatch(null); assert.equal((await f.enroll("device:initial-0", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-rotated-at-limit` })).enabled, true);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 12);
});

test("session deletion and device rotation erase queued deliveries; a new generation never receives old notifications", async (t) => {
  const f = await fixture(t); const previous = await f.enroll(); f.notification("old-device");
  const changed = await f.enroll("device:synthetic-a", { ...clientSubscription, endpoint: `${clientSubscription.endpoint}-rotated` }); assert.notEqual(changed.id, previous.id); assert.equal(f.jobs().length, 0);
  f.notification("current-device"); assert.equal(f.jobs().length, 1);
  f.database.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(f.session.tokenHash);
  assert.equal(f.jobs().length, 0); assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 0);
});

test("native DELETE retires an unknown in-flight device before late POST and cannot affect a newer consent", async (t) => {
  const f = await fixture(t, { native: true });
  const oldPayload = { kind: "fcm", deviceId: "consent:old:token-digest", token: "old-synthetic-fcm-token-".repeat(3) };
  const newPayload = { kind: "fcm", deviceId: "consent:new:token-digest", token: "new-synthetic-fcm-token-".repeat(3) };
  let entered, release, batches = 0;
  const enteredBatch = new Promise((resolve) => { entered = resolve; }), delayed = new Promise((resolve) => { release = resolve; });
  f.beforeBatch(async () => { if (++batches === 1) { entered(); await delayed; } });
  const old = f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, oldPayload).then((value) => ({ value }), (error) => ({ error }));
  await enteredBatch;
  assert.equal((await f.request("DELETE", { deviceId: oldPayload.deviceId })).status, 200);
  const current = await f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, newPayload);
  release(); assert.equal((await old).error.code, "PUSH_DEVICE_RETIRED");
  assert.equal(f.database.prepare("SELECT id FROM push_subscriptions").get().id, current.id);
  assert.equal((await f.request("DELETE", { deviceId: oldPayload.deviceId })).status, 200);
  assert.equal((await f.request("POST", oldPayload)).status, 410);
  assert.equal(f.database.prepare("SELECT id FROM push_subscriptions").get().id, current.id);
  f.database.prepare("DELETE FROM user_sessions WHERE token_hash=?").run(f.session.tokenHash);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_device_revocations").get().n, 0, "session cascade cannot recreate child tombstones");
});

test("native identity is immutable under concurrent different tokens and revocation recovers lost acknowledgement", async (t) => {
  const f = await fixture(t, { native: true });
  const payload = { kind: "fcm", deviceId: "consent:immutable:device", token: "first-synthetic-token-".repeat(3) };
  let waiting = 0, release; const gate = new Promise((resolve) => { release = resolve; });
  f.beforeBatch(async () => { if (++waiting === 2) release(); await gate; });
  const result = await Promise.allSettled([f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, payload), f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, { ...payload, token: "second-synthetic-token-".repeat(3) })]);
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(result.find((row) => row.status === "rejected").reason.status, 409);
  f.beforeBatch(null); const row = f.database.prepare("SELECT * FROM push_subscriptions").get();
  await assert.rejects(f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, { ...payload, token: "third-synthetic-token-".repeat(3) }), (error) => error.code === "PUSH_DEVICE_CHANGED");
  assert.equal(f.database.prepare("SELECT id FROM push_subscriptions").get().id, row.id);
  f.beforeBatch(async () => { throw new Error("synthetic revoke storage failure"); });
  assert.equal((await f.request("DELETE", { deviceId: payload.deviceId })).status, 503);
  assert.equal(f.database.prepare("SELECT id FROM push_subscriptions").get().id, row.id);
  f.beforeBatch(null); f.loseBatchAck();
  assert.equal((await f.request("DELETE", { id: row.id })).status, 200);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_device_revocations").get().n, 1);
  assert.equal((await f.request("POST", { ...payload, token: row.token })).status, 410);
});

test("native retired-device ledger is bounded while existing enrollments remain revocable", async (t) => {
  const f = await fixture(t, { native: true });
  const payload = { kind: "fcm", deviceId: "consent:existing:device", token: "synthetic-fcm-token-".repeat(3) };
  await f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, payload);
  const insert = f.database.prepare("INSERT INTO push_device_revocations(session_hash,device_id) VALUES (?,?)");
  for (let index = 0; index < 512; index++) insert.run(f.session.tokenHash, `retired-device-${index}`);
  assert.equal((await f.request("DELETE", { deviceId: "unknown-device-over-limit" })).status, 503);
  assert.equal((await f.request("POST", { ...payload, deviceId: "new-device-over-limit", token: "different-synthetic-fcm-token-".repeat(3) })).status, 409);
  assert.equal((await f.request("DELETE", { deviceId: payload.deviceId })).status, 200);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_device_revocations").get().n, 513);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 0);
  assert.equal((await f.enroll()).enabled, true, "native retirement must not prevent web enrollment");
});

test("web status fingerprint identifies endpoint and encryption key changes without exposing raw credentials", async (t) => {
  const f = await fixture(t); await f.enroll();
  const first = (await (await f.request("GET")).json()).subscriptions[0];
  assert.equal(first.subscriptionFingerprint, await f.subscriptions.webPushFingerprint(clientSubscription.endpoint, clientSubscription.keys.p256dh, clientSubscription.keys.auth));
  const rotated = { ...clientSubscription, keys: { ...clientSubscription.keys, auth: randomBytes(16).toString("base64url") } };
  await f.enroll("device:synthetic-a", rotated);
  const second = (await (await f.request("GET")).json()).subscriptions[0];
  assert.notEqual(first.subscriptionFingerprint, second.subscriptionFingerprint);
  assert.ok(!JSON.stringify(second).includes(rotated.keys.auth));
});

test("authenticated click resolves a read notification while receive and revoked targets remain suppressed", async (t) => {
  const f = await fixture(t); const subscription = await f.enroll(); f.notification("read-click");
  f.database.exec("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id='read-click'");
  const query = `?notificationId=read-click&subscriptionId=${subscription.id}`;
  assert.equal((await (await f.request("GET", undefined, {}, query)).json()).receipt, null);
  assert.equal((await (await f.request("GET", undefined, {}, `${query}&purpose=click`)).json()).receipt.href, "/?view=feed&comment=comment-id");
  assert.equal(await f.subscriptions.readPushReceipt(f.DB, "read-click", subscription.id, undefined, Date.now(), "click"), null, "background dispatch cannot opt into read receipt resolution");
  assert.equal((await f.request("GET", undefined, { "X-Account-Context": "other-public" }, `${query}&purpose=click`)).status, 409);
  f.database.exec("UPDATE post_comments SET deleted_at=CURRENT_TIMESTAMP WHERE id='comment-id'");
  assert.equal((await (await f.request("GET", undefined, {}, `${query}&purpose=click`)).json()).receipt, null);
});

test("receipt revalidates exact session, unread status, block, preferences and suspension without exposing content", async (t) => {
  const f = await fixture(t); const subscription = await f.enroll(); const id = f.notification("receipt");
  const receipt = await f.subscriptions.readPushReceipt(f.DB, id, subscription.id, f.session);
  assert.equal(receipt.href, "/?view=feed&comment=comment-id"); assert.equal(receipt.body, "Yeni bir bildirimin var."); assert.ok(!JSON.stringify(receipt).includes("PRIVATE"));
  assert.equal(await f.subscriptions.readPushReceipt(f.DB, id, subscription.id, { ...f.session, tokenHash: "other-session" }), null);
  f.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('actor@test.local','owner@test.local')"); assert.equal(await f.subscriptions.readPushReceipt(f.DB, id, subscription.id), null);
  f.database.exec("DELETE FROM user_blocks; INSERT INTO notification_preferences(user_email,interactions) VALUES ('owner@test.local',0)"); assert.equal(await f.subscriptions.readPushReceipt(f.DB, id, subscription.id), null);
  f.database.exec("UPDATE notification_preferences SET interactions=1; UPDATE users SET status='suspended' WHERE email='owner@test.local'"); assert.equal(await f.subscriptions.readPushReceipt(f.DB, id, subscription.id), null);
  f.database.exec("UPDATE users SET status='active' WHERE email='owner@test.local'; UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id='receipt'"); assert.equal(await f.subscriptions.readPushReceipt(f.DB, id, subscription.id), null);
});

test("removed comments/posts and changed campus visibility suppress a surviving notification receipt", async (t) => {
  const f = await fixture(t); const sub = await f.enroll(); const id = f.notification("target-post");
  const receipt = () => f.subscriptions.readPushReceipt(f.DB, id, sub.id, f.session);
  assert.ok(await receipt());
  f.database.exec("UPDATE post_comments SET deleted_at=CURRENT_TIMESTAMP WHERE id='comment-id'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE post_comments SET deleted_at=NULL; UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE id='post-id'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE posts SET deleted_at=NULL,author_email='other@test.local'; UPDATE student_profiles SET university_id='other-campus' WHERE user_email='other@test.local'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE posts SET audience='platform'"); assert.ok(await receipt());
  f.database.exec("INSERT INTO courses(id,department_id,code,name) VALUES ('course','department','TEST','Test course'); UPDATE posts SET course_id='course'"); assert.equal(await receipt(), null);
  let calls = 0; const dispatched = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async () => { calls++; return new Response(null, { status: 201 }); } });
  assert.equal(dispatched.suppressed, 1); assert.equal(calls, 0);
});

test("private community membership, moderation and exact-target bans are rechecked before push display", async (t) => {
  const f = await fixture(t); const sub = await f.enroll(); const id = f.notification("target-community");
  f.database.exec("INSERT INTO communities(id,creator_email,name,slug,university_id,join_policy) VALUES ('private','actor@test.local','Private','private','campus','approval'),('unrelated-open','actor@test.local','Open','unrelated','campus','open'); UPDATE posts SET community_id='private'; INSERT INTO community_members(community_id,user_email,role,status) VALUES ('private','owner@test.local','member','active')");
  const receipt = () => f.subscriptions.readPushReceipt(f.DB, id, sub.id, f.session);
  assert.ok(await receipt()); f.database.exec("DELETE FROM community_members WHERE community_id='private'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE notifications SET entity_type='community',entity_id='private' WHERE id='target-community'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE communities SET join_policy='open' WHERE id='private'"); assert.ok(await receipt());
  f.database.exec("INSERT INTO community_bans(community_id,user_email,banned_by_email) VALUES ('private','owner@test.local','actor@test.local')"); assert.equal(await receipt(), null);
  f.database.exec("DELETE FROM community_bans; UPDATE communities SET moderation_status='hidden' WHERE id='private'"); assert.equal(await receipt(), null);
});

test("message receipts require current conversation participation and campus, and never open a removed message", async (t) => {
  const f = await fixture(t); const sub = await f.enroll(); const id = f.notification("target-message");
  f.database.exec("INSERT INTO direct_conversations(id,university_id,member_one_email,member_two_email) VALUES ('conversation','campus','other@test.local','owner@test.local'); INSERT INTO direct_messages(id,conversation_id,sender_email,body) VALUES ('message','conversation','other@test.local','Private DM'); UPDATE notifications SET entity_type='direct-message',entity_id='message' WHERE id='target-message'");
  const receipt = () => f.subscriptions.readPushReceipt(f.DB, id, sub.id, f.session);
  assert.equal((await receipt()).href, '/?view=messages&message=message');
  f.database.exec("UPDATE direct_messages SET deleted_at=CURRENT_TIMESTAMP"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE direct_messages SET deleted_at=NULL; UPDATE student_profiles SET university_id='other-campus' WHERE user_email='other@test.local'"); assert.equal(await receipt(), null);
  f.database.exec("UPDATE student_profiles SET university_id='campus' WHERE user_email='other@test.local'; INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('other@test.local','owner@test.local')"); assert.equal(await receipt(), null);
  f.database.exec("DELETE FROM user_blocks; UPDATE direct_conversations SET member_one_email='actor@test.local',member_two_email='other@test.local'"); assert.equal(await receipt(), null);
});

test("listing, note, event and meetup targets must still exist with current access; unknown kinds use the inbox", async (t) => {
  const f = await fixture(t); const sub = await f.enroll(); const id = f.notification("other-targets");
  const target = (type, value) => f.database.prepare("UPDATE notifications SET entity_type=?,entity_id=? WHERE id=?").run(type, value, id);
  const receipt = () => f.subscriptions.readPushReceipt(f.DB, id, sub.id, f.session);
  f.database.exec("INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','campus','other@test.local','sell','books','Listing','Details')");
  target('listing','listing'); assert.ok(await receipt()); f.database.exec("UPDATE marketplace_listings SET status='sold'"); assert.equal(await receipt(), null);
  f.database.exec("INSERT INTO courses(id,department_id,code,name) VALUES ('course','department','TEST','Test course'); INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('note','other@test.local','course','Note','private/note','note.pdf','application/pdf',1,'published')");
  target('note','note'); assert.ok(await receipt()); f.database.exec("UPDATE notes SET status='rejected'"); assert.equal(await receipt(), null);
  f.database.exec("INSERT INTO campus_events(id,university_id,creator_email,title,description,category,starts_at) VALUES ('event','campus','other@test.local','Event','Details','sosyal','2099-01-01')");
  target('event','event'); assert.ok(await receipt()); f.database.exec("DELETE FROM campus_events WHERE id='event'"); assert.equal(await receipt(), null);
  f.database.exec("INSERT INTO meetup_requests(id,sender_email,recipient_email,activity,expires_at) VALUES ('meetup','owner@test.local','other@test.local','study','2099-01-01')");
  target('meetup','meetup'); assert.equal((await receipt()).href,'/?view=match&meetup=meetup'); f.database.exec("DELETE FROM meetup_requests WHERE id='meetup'"); assert.equal(await receipt(), null);
  target('future-unrecognized-kind','https://evil.test'); assert.equal((await receipt()).href,'/?view=notifications');
});

test("actual WebPush wire output is encrypted, VAPID-signed, short-lived and sent without redirects", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("encrypted-wire"); let captured;
  const counts = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async (url, options) => { captured = { url, options }; return new Response(null, { status: 201 }); } });
  assert.equal(counts.sent, 1); assert.equal(f.jobs()[0].state, "sent"); assert.equal(captured.url, clientSubscription.endpoint);
  const headers = new Headers(captured.options.headers); assert.equal(headers.get("content-encoding"), "aes128gcm"); assert.equal(headers.get("ttl"), "300"); assert.match(headers.get("authorization"), /^vapid t=/);
  assert.equal(captured.options.redirect, "manual"); assert.ok(captured.options.signal instanceof AbortSignal); assert.ok(captured.options.body.byteLength > 100);
  const body = Buffer.from(captured.options.body); assert.ok(!body.includes(Buffer.from("PRIVATE"))); assert.ok(!body.includes(Buffer.from("encrypted-wire")));
  // Independently decrypt RFC8291 wire output using the receiving browser's private key.
  const salt = body.subarray(0, 16), serverKeyLength = body[20], serverKey = body.subarray(21, 21 + serverKeyLength);
  const shared = keys.computeSecret(serverKey);
  const { hkdfSync, createDecipheriv } = require("node:crypto");
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), keys.getPublicKey(), serverKey]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const ciphertext = body.subarray(21 + serverKeyLength), decipher = createDecipheriv("aes-128-gcm", cek, nonce); decipher.setAuthTag(ciphertext.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]); assert.equal(plaintext.at(-1), 2);
  const payload = JSON.parse(plaintext.subarray(0, -1).toString("utf8")); assert.equal(payload.notificationId, "encrypted-wire"); assert.equal(payload.href, "/?view=feed&comment=comment-id"); assert.ok(!JSON.stringify(payload).includes("PRIVATE"));
});

test("Worker-compatible manual fetch rejects WebPush redirects without sending credentials to Location", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("web-redirect"); const calls = [];
  const counts = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async (url, options) => {
    assert.equal(options.redirect, "manual"); calls.push(url);
    return new Response(null, { status: 307, headers: { Location: "https://untrusted.test/collect" } });
  } });
  assert.equal(calls.length, 1); assert.equal(calls[0], clientSubscription.endpoint);
  assert.equal(counts.sent, 0); assert.equal(counts.retried, 1);
});

test("exact meetup push targets preserve participant, campus, onboarding and block privacy in every status", async (t) => {
  const f = await fixture(t);
  const href = f.modules.get("lib/push-target-access.ts").pushTargetHref;
  f.database.exec("INSERT INTO meetup_requests(id,sender_email,recipient_email,activity,expires_at) VALUES ('private-meetup','owner@test.local','other@test.local','study','2099-01-01')");
  for (const status of ["pending", "accepted", "declined", "cancelled", "expired"]) {
    f.database.prepare("UPDATE meetup_requests SET status=? WHERE id='private-meetup'").run(status);
    for (const participant of ["owner@test.local", "other@test.local"]) assert.equal(await href(f.DB, participant, "meetup", "private-meetup"), "/?view=match&meetup=private-meetup");
    assert.equal(await href(f.DB, "actor@test.local", "meetup", "private-meetup"), null);
  }
  for (const [blocker, blocked] of [["owner@test.local", "other@test.local"], ["other@test.local", "owner@test.local"]]) {
    f.database.prepare("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES (?,?)").run(blocker, blocked);
    assert.equal(await href(f.DB, "owner@test.local", "meetup", "private-meetup"), null);
    f.database.exec("DELETE FROM user_blocks");
  }
  f.database.exec("UPDATE student_profiles SET university_id='other-campus' WHERE user_email='other@test.local'");
  assert.equal(await href(f.DB, "owner@test.local", "meetup", "private-meetup"), null);
  f.database.exec("UPDATE student_profiles SET university_id='campus',onboarding_completed=0 WHERE user_email='other@test.local'");
  assert.equal(await href(f.DB, "owner@test.local", "meetup", "private-meetup"), null);
  f.database.exec("UPDATE student_profiles SET onboarding_completed=1 WHERE user_email='other@test.local'; UPDATE users SET status='deleting' WHERE email='other@test.local'");
  assert.equal(await href(f.DB, "owner@test.local", "meetup", "private-meetup"), null);
  f.database.exec("DELETE FROM meetup_requests WHERE id='private-meetup'");
  assert.equal(await href(f.DB, "owner@test.local", "meetup", "private-meetup"), null);
});

test("OAuth and FCM redirects stop at the original provider without following Location", async (t) => {
  for (const redirectStage of ["oauth", "fcm"]) {
    const f = await fixture(t, { native: true });
    await f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, { kind: "fcm", deviceId: "redirect:test-device", token: "synthetic-redirect-token-".repeat(3) });
    f.notification(`native-redirect-${redirectStage}`); const calls = [];
    const counts = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async (url, options) => {
      assert.equal(options.redirect, "manual"); calls.push(url);
      if (url === "https://oauth2.googleapis.com/token" && redirectStage === "fcm") return Response.json({ access_token: "synthetic-access-token", expires_in: 3600 });
      return new Response(null, { status: 302, headers: { Location: "https://untrusted.test/collect" } });
    } });
    assert.equal(calls.length, redirectStage === "oauth" ? 1 : 2);
    assert.ok(calls.every((url) => new URL(url).hostname.endsWith("googleapis.com")));
    assert.equal(counts.sent, 0); assert.equal(counts.retried, 1);
  }
});

test("two concurrent dispatchers claim a delivery once and an unknown acknowledgement retries with the same tag", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("claim-race"); let calls = 0, release; const barrier = new Promise((resolve) => { release = resolve; });
  const transport = async () => { calls++; await barrier; throw new Error("Lost acknowledgement"); };
  const first = f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: transport });
  for (let i = 0; i < 100 && !calls; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  const second = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: transport }); assert.equal(second.claimed, 0); assert.equal(calls, 1);
  release(); assert.equal((await first).retried, 1); const future = Date.now() + 31_000;
  const retry = await f.delivery.dispatchPushOutbox(f.DB, f.config, { now: () => future, fetch: async () => new Response(null, { status: 201 }) }); assert.equal(retry.sent, 1); assert.equal(f.jobs()[0].attempts, 2);
});

test("retry-after and expired subscription responses persist bounded recovery without leaking another generation", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("retry-after"); const now = Date.now();
  assert.equal((await f.delivery.dispatchPushOutbox(f.DB, f.config, { now: () => now, fetch: async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }) })).retried, 1);
  assert.equal(f.jobs()[0].next_attempt_ms, now + 120_000);
  assert.equal((await f.delivery.dispatchPushOutbox(f.DB, f.config, { now: () => now + 121_000, fetch: async () => new Response(null, { status: 410 }) })).expired, 1);
  assert.equal(f.jobs().length, 0); assert.equal(f.database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n, 0);
});

test("disabled preferences and read notifications suppress queued jobs before any provider call", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("read-first"); f.database.exec("UPDATE notifications SET read_at=CURRENT_TIMESTAMP");
  const counts = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async () => { throw new Error("Must not send"); } }); assert.equal(counts.suppressed, 1); assert.equal(f.jobs()[0].state, "suppressed");
});

test("expired leases recover after a crashed dispatcher but active leases and exhausted attempts never send", async (t) => {
  const f = await fixture(t); await f.enroll(); f.notification("stale-lease"); const now = Date.now();
  f.database.prepare("UPDATE push_deliveries SET state='sending',lease_token='crashed',lease_until_ms=?,attempts=1").run(now - 1);
  assert.equal((await f.delivery.dispatchPushOutbox(f.DB, f.config, { now: () => now, fetch: async () => new Response(null, { status: 201 }) })).sent, 1);
  f.notification("expired-attempts"); f.database.prepare("UPDATE push_deliveries SET attempts=8 WHERE notification_id='expired-attempts'").run();
  f.notification("ttl-expired"); f.database.prepare("UPDATE push_deliveries SET expires_ms=? WHERE notification_id='ttl-expired'").run(now - 1);
  let calls = 0; await f.delivery.dispatchPushOutbox(f.DB, f.config, { now: () => now, fetch: async () => { calls++; return new Response(null, { status: 201 }); } });
  assert.equal(calls, 0); assert.equal(f.jobs().filter((job) => job.state === "expired").length, 2);
});

test("receipt endpoint is exact-generation scoped and bounded request parsing rejects oversized untrusted JSON", async (t) => {
  const f = await fixture(t); const enrolled = await f.enroll(); f.notification("http-receipt");
  const query = `?notificationId=http-receipt&subscriptionId=${enrolled.id}`;
  assert.equal((await (await f.request("GET", undefined, {}, query)).json()).receipt.subscriptionId, enrolled.id);
  assert.equal((await (await f.request("GET", undefined, {}, "?notificationId=http-receipt&subscriptionId=wrong-device")).json()).receipt, null);
  assert.equal((await f.request("POST", "x".repeat(12001))).status, 413);
  assert.equal((await f.request("DELETE", { id: enrolled.id })).status, 200);
  assert.equal((await (await f.request("GET", undefined, {}, query)).json()).receipt, null);
});

test("FCM signs an OAuth service-account JWT and sends data-only payload; UNREGISTERED revokes exact subscription", async (t) => {
  const f = await fixture(t, { configured: false, native: true });
  await f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, { kind: "fcm", deviceId: "device:native-a", token: "synthetic-native-token-00000000000000000000" }); f.notification("native-wire"); const captured = [];
  const counts = await f.delivery.dispatchPushOutbox(f.DB, f.config, { fetch: async (url, options) => {
    captured.push({ url, options }); assert.equal(options.redirect, "manual");
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(options.body).get("assertion"); const parts = assertion.split(".");
      assert.ok(verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), privateFcm.publicKey, Buffer.from(parts[2], "base64url")));
      const claims = JSON.parse(Buffer.from(parts[1], "base64url")); assert.equal(claims.aud, url); assert.equal(claims.scope, "https://www.googleapis.com/auth/firebase.messaging"); assert.equal(claims.exp - claims.iat, 3600);
      return Response.json({ access_token: "synthetic-provider-access-token", expires_in: 3600 });
    }
    assert.equal(url, "https://fcm.googleapis.com/v1/projects/synthetic-project/messages:send");
    const body = JSON.parse(options.body); assert.equal(body.message.notification, undefined); assert.equal(body.message.data.notificationId, "native-wire"); assert.equal(body.message.data.body, "Yeni bir bildirimin var."); assert.equal(body.message.android.ttl, "300s");
    return Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 });
  } });
  assert.equal(captured.length, 2); assert.equal(counts.expired, 1); assert.equal(f.jobs().length, 0);
  assert.equal(f.database.prepare("SELECT device_id FROM push_device_revocations").get().device_id, "device:native-a");
  await assert.rejects(f.subscriptions.registerPushSubscription(f.DB, f.config, f.session, { kind: "fcm", deviceId: "device:native-a", token: "synthetic-native-token-00000000000000000000" }), (error) => error.code === "PUSH_DEVICE_RETIRED");
});
