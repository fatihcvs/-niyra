import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const makeToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
async function fixture(t, seed) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close()); db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(resolve(root, "drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    if (file.startsWith("0040")) seed?.(db);
    db.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  }
  let beforeBatch = () => {};
  const prepare = (sql, args = []) => ({ sql, args, bind(...values) { return prepare(sql, values); }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return { meta: db.prepare(sql).run(...args), success: true }; } });
  const DB = { prepare, async batch(statements) { beforeBatch(); db.exec("BEGIN"); try { const result = statements.map(item => ({ meta: db.prepare(item.sql).run(...item.args), success: true })); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } } };
  const env = { DB, BETA_REVIEW_SECRET: makeToken() }, cache = new Map(); let identityHeaders = new Headers();
  const load = path => {
    const file = resolve(root, path); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, crypto, Response, Request, Headers, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
      require(name) { if (name === "cloudflare:workers") return { env }; if (name === "next/headers") return { headers: async () => identityHeaders }; if (name === "next/navigation") return { redirect() { throw new Error("Unexpected redirect"); } }; return load(resolve(dirname(file), `${name}.ts`)); } });
    return exports;
  };
  const staff = load("lib/staff-auth.ts"), auth = load("lib/app-auth.ts");
  db.exec("INSERT INTO staff_accounts(id,username,display_name,role,password_hash,password_salt,password_iterations,must_change_password) VALUES('admin','admin','Admin','admin','hash','salt',310000,0)");
  const cookie = (await staff.createStaffSession(DB, "admin", new Request("https://kampira.test"))).cookie.split(";")[0];
  const headers = { cookie, "X-Staff-Context": await staff.staffAccountContext(new Headers({ cookie }), "admin") };
  const automation = { authorization: `Bearer ${env.BETA_REVIEW_SECRET}` };
  const call = (path, method = "GET", body, extra = {}) => load(`app/api/${path.split("?")[0]}/route.ts`)[method](new Request(`https://kampira.test/api/${path}`, { method,
    headers: { origin: "https://kampira.test", "content-type": "application/json", "x-forwarded-for": "127.0.0.1", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const application = extra => ({ token: makeToken(), kind: "application", platform: "web", email: "student@example.invalid", adult: true, consent: true, ...extra });
  const submit = extra => call("beta/requests", "POST", application(extra));
  const create = (extra = {}, access = headers) => call("admin/test-accounts", "POST", { action: "create", requestId: crypto.randomUUID(), ...extra }, access);
  const mailCall = (method, body, access = automation) => call("admin/test-accounts/mail", method, body, access);
  const claim = async () => {
    const row = db.prepare("SELECT id FROM test_account_outbox WHERE state='pending' ORDER BY created_at,id LIMIT 1").get(); assert.ok(row);
    const response = await mailCall("POST", { action: "claim", id: row.id }); assert.equal(response.status, 200);
    const body = await response.json(); assert.match(body.text, /etkinlestir#[A-Za-z0-9_-]{43}/);
    return { ...body, token: body.text.match(/etkinlestir#([A-Za-z0-9_-]{43})/)[1] };
  };
  return { db, DB, env, load, auth, headers, automation, call, application, submit, create, mailCall, claim, setIdentityHeaders(value) { identityHeaders = value; }, beforeBatch(fn) { beforeBatch = fn; } };
}
const betaMode = f => f.db.exec("UPDATE platform_settings SET value_json='true' WHERE key='betaAccessOnly'; INSERT INTO platform_settings(key,value_json) VALUES('registrationOpen','false') ON CONFLICT(key) DO UPDATE SET value_json='false'");
const credential = (f, email) => f.db.prepare("SELECT * FROM user_credentials WHERE user_email=?").get(email);
const authenticate = (f, email, password) => f.call("auth/session", "POST", { email, password });

test("migration preserves old accounts, credentials, sessions and content; beta gate also fences trusted headers and active writes", async t => {
  const f = await fixture(t, db => db.exec("INSERT INTO users(email,public_id,display_name,handle) VALUES('legacy@example.invalid','legacy-id','Legacy','legacy'); INSERT INTO user_credentials(user_email,password_hash,password_salt,password_iterations) VALUES('legacy@example.invalid','unchanged-hash','unchanged-salt',310000); INSERT INTO posts(id,author_email,content) VALUES('legacy-post','legacy@example.invalid','Preserved content'); INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES('old-session-hash','legacy@example.invalid','2099-01-01')"));
  assert.equal(credential(f, "legacy@example.invalid").password_hash, "unchanged-hash");
  assert.equal(f.db.prepare("SELECT content FROM posts WHERE id='legacy-post'").get().content, "Preserved content");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM user_sessions WHERE token_hash='old-session-hash'").get().n, 1);
  assert.equal(f.db.prepare("SELECT kind FROM test_accounts WHERE user_email='legacy@example.invalid'").get().kind, "existing-beta");
  betaMode(f);
  assert.equal(await f.auth.appAccountAllowed(f.DB, "legacy@example.invalid"), true);
  f.db.exec("INSERT INTO users(email,public_id,display_name,handle) VALUES('unissued@example.invalid','unissued','Unissued','unissued')");
  assert.equal(await f.auth.appAccountAllowed(f.DB, "unissued@example.invalid"), false);
  const identity = f.load("app/chatgpt-auth.ts");
  f.setIdentityHeaders(new Headers({ host: "kampira.chatgpt.site", "oai-authenticated-user-id": "platform", "oai-authenticated-user-email": "legacy@example.invalid" }));
  assert.equal((await identity.getChatGPTUser()).email, "legacy@example.invalid");
  f.setIdentityHeaders(new Headers({ host: "kampira.chatgpt.site", "oai-authenticated-user-id": "platform", "oai-authenticated-user-email": "unissued@example.invalid" }));
  assert.equal(await identity.getChatGPTUser(), null);
  const session = await f.auth.createSession(f.DB, "legacy@example.invalid", new Request("https://kampira.test"));
  f.db.exec("UPDATE test_accounts SET status='revoked' WHERE user_email='legacy@example.invalid'");
  assert.equal(await f.auth.getSessionIdentity(f.DB, new Headers({ cookie: session.cookie.split(';')[0] })), null);
  await assert.rejects(f.auth.createSession(f.DB, "legacy@example.invalid", new Request("https://kampira.test")), /Active account/);
  await assert.rejects(f.load("lib/active-actor.ts").activeActor(f.DB, "legacy@example.invalid", "legacy-id").audit("synthetic.test", "user", "legacy-id"), /Hesap durumu/);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM audit_logs WHERE action='synthetic.test'").get().n, 0);
  assert.equal((await f.call("admin/test-accounts", "GET", undefined, f.headers)).status, 200, "Staff access is independent of app login gate");
});

test("registration closes at settings and transaction boundaries without changing existing accounts", async t => {
  const f = await fixture(t), input = { displayName: "Student", email: "register@example.invalid", password: "SafeAccountPassword63" };
  betaMode(f); assert.equal((await f.call("auth/register", "POST", input)).status, 403);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
  f.db.exec("UPDATE platform_settings SET value_json='false' WHERE key='betaAccessOnly'; UPDATE platform_settings SET value_json='true' WHERE key='registrationOpen'");
  f.beforeBatch(() => betaMode(f));
  assert.equal((await f.call("auth/register", "POST", input)).status, 403);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM user_credentials").get().n, 0);
});

test("generated passwords are strong, hash-only, once-only on create and reset; reset revokes sessions", async t => {
  const f = await fixture(t), requestId = crypto.randomUUID(); betaMode(f);
  const first = await f.create({ requestId, displayName: "Tester" }); assert.equal(first.status, 201); assert.match(first.headers.get("cache-control"), /no-store/);
  const body = await first.json(), { loginEmail, password } = body.credentials;
  assert.match(loginEmail, /^beta-[a-f0-9]{32}@test\.kampira\.net$/); assert.ok(password.length >= 16);
  const stored = credential(f, loginEmail); assert.notEqual(stored.password_hash, password);
  assert.equal(await f.auth.verifyPassword(password, stored.password_salt, stored.password_iterations, stored.password_hash), true);
  const replay = await (await f.create({ requestId, displayName: "Tester" })).json(); assert.equal(replay.credentials, null); assert.equal(replay.replayed, true);
  assert.equal((await f.create({ requestId, displayName: "Changed" })).status, 409);
  const listed = await (await f.call("admin/test-accounts", "GET", undefined, f.headers)).json(); assert.equal(listed.items.length, 1); assert.equal(JSON.stringify(listed).includes(password), false);
  const login = await authenticate(f, loginEmail, password); assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(';')[0];
  const resetInput = { action: "reset", id: body.account.id, requestId: crypto.randomUUID() };
  const reset = await (await f.call("admin/test-accounts", "POST", resetInput, f.headers)).json(); assert.ok(reset.credentials.password);
  assert.equal(await f.auth.getSessionIdentity(f.DB, new Headers({ cookie })), null);
  assert.equal((await authenticate(f, loginEmail, password)).status, 401);
  assert.equal((await authenticate(f, loginEmail, reset.credentials.password)).status, 200);
  assert.equal((await (await f.call("admin/test-accounts", "POST", resetInput, f.headers)).json()).credentials, null);
  const raw = JSON.stringify([f.db.prepare("SELECT * FROM test_account_operations").all(), f.db.prepare("SELECT * FROM staff_audit_logs").all()]);
  assert.equal(raw.includes(password), false); assert.equal(raw.includes(reset.credentials.password), false);
});

test("concurrent create yields one account and one plaintext response; stale staff and automated resets are denied", async t => {
  const f = await fixture(t), requestId = crypto.randomUUID();
  const unauthorized = await f.call("admin/test-accounts"); assert.equal(unauthorized.status, 401); assert.match(unauthorized.headers.get("cache-control"), /no-store/);
  assert.equal((await f.call("admin/test-accounts/mail")).status, 401);
  const results = await Promise.all([f.create({ requestId }), f.create({ requestId })]);
  const bodies = await Promise.all(results.map(r => r.json()));
  assert.equal(bodies.filter(body => body.credentials).length, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 1);
  const automated = await f.create({}, f.automation); assert.equal(automated.status, 201);
  const account = (await automated.json()).account;
  assert.equal((await f.call("admin/test-accounts", "POST", { action: "reset", id: account.id, requestId: crypto.randomUUID() }, f.automation)).status, 403);
  f.beforeBatch(() => f.db.exec("DELETE FROM staff_sessions WHERE staff_id='admin'"));
  assert.equal((await f.create()).status, 403);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 2);
});

test("web intake is consent-only, Android still requires device and participation; issuance is atomic and private", async t => {
  const f = await fixture(t);
  assert.equal((await f.submit({ adult: false })).status, 422);
  assert.equal((await f.submit({ platform: ["web"] })).status, 422);
  assert.equal((await f.submit({ platform: "android" })).status, 422);
  assert.equal((await f.submit({ platform: "both", android: true, participation: true })).status, 422);
  const input = f.application({ displayName: "Web tester" }), response = await f.call("beta/requests", "POST", input); assert.equal(response.status, 201);
  const body = await response.json(); assert.equal(body.accountDelivery, "email"); assert.equal(Object.hasOwn(body, "loginEmail"), false);
  const row = f.db.prepare("SELECT * FROM test_accounts").get(); assert.equal(row.status, "pending"); assert.equal(row.kind, "applicant");
  assert.equal(await f.auth.appAccountAllowed(f.DB, row.user_email), false, "Pending account cannot login even before beta mode activation");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM user_credentials").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox").get().n, 1);
  assert.equal((await f.call("beta/requests", "POST", input)).status, 201);
  assert.equal((await f.submit()).status, 201);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_accounts").get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox").get().n, 1);
  assert.equal((await f.call("admin/beta", "PATCH", { id: body.id, revision: 0, status: "ready" }, f.automation)).status, 200);
  assert.equal((await f.call("admin/beta", "PATCH", { id: body.id, revision: 1, status: "invited" }, f.headers)).status, 200);
  assert.equal((await (await f.call("beta/status", "POST", { token: input.token, action: "read" })).json()).request.platform, "web");
});

test("intake failures roll back both the application and issued account; concurrent recipient requests have one alias", async t => {
  const f = await fixture(t);
  f.db.exec("CREATE TRIGGER synthetic_outbox_failure BEFORE INSERT ON test_account_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.equal((await f.submit()).status, 503);
  for (const table of ["users", "test_accounts", "beta_requests", "test_account_outbox"]) assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  f.db.exec("DROP TRIGGER synthetic_outbox_failure");
  const result = await Promise.all([f.submit(), f.submit()]); assert.ok(result.every(r => r.status === 201));
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_accounts").get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM users").get().n, 1);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox").get().n, 1);
});

test("activation requires mail ownership, keeps the actual contact account untouched, consumes once and allows login", async t => {
  const f = await fixture(t); betaMode(f);
  f.db.exec("INSERT INTO users(email,public_id,display_name,handle) VALUES('student@example.invalid','real-owner','Owner','owner'); INSERT INTO user_credentials(user_email,password_hash,password_salt,password_iterations) VALUES('student@example.invalid','existing-hash','existing-salt',310000)");
  assert.equal((await f.submit()).status, 201);
  const mail = await f.claim(); assert.equal(mail.to, "student@example.invalid");
  const inspect = await f.call("auth/test-activation", "POST", { action: "inspect", token: mail.token }); assert.equal(inspect.status, 200);
  const checked = await inspect.json(); assert.equal(checked.valid, true); assert.notEqual(checked.loginEmail, "student@example.invalid");
  const raw = JSON.stringify(f.db.prepare("SELECT * FROM test_account_outbox").all()); assert.equal(raw.includes(mail.token), false); assert.equal(raw.includes(mail.leaseToken), false);
  assert.equal(f.db.prepare("SELECT token_hash FROM test_account_activations").get().token_hash, await f.auth.sha256(mail.token));
  assert.equal((await f.call("auth/test-activation", "POST", { action: "activate", token: mail.token, password: "short" })).status, 422);
  const password = "OwnedMailboxPassword73";
  const activate = await f.call("auth/test-activation", "POST", { action: "activate", token: mail.token, password }); assert.equal(activate.status, 200); assert.ok(activate.headers.get("set-cookie"));
  assert.equal(credential(f, "student@example.invalid").password_hash, "existing-hash");
  assert.equal((await authenticate(f, checked.loginEmail, password)).status, 200);
  assert.equal((await f.call("auth/test-activation", "POST", { action: "activate", token: mail.token, password: "DifferentPassword66" })).status, 404);
  assert.equal((await f.call("auth/test-activation", "POST", { action: "inspect", token: mail.token })).status, 404);
  // Recipient may activate between mail send and delivery ACK. The lease still accepts provider proof.
  assert.equal((await f.mailCall("PATCH", { id: mail.id, leaseToken: mail.leaseToken, outcome: "sent", providerMessageId: "synthetic-provider-1" })).status, 200);
  assert.equal(f.db.prepare("SELECT state FROM test_account_outbox").get().state, "sent");
  assert.equal(f.db.prepare("SELECT token_hash FROM test_account_activations").get().token_hash, null);
});

test("outbox has one CAS owner, uncertain leases require provider review and automatic retries are rejected", async t => {
  const f = await fixture(t); await f.submit();
  const id = f.db.prepare("SELECT id FROM test_account_outbox").get().id;
  const responses = await Promise.all([f.mailCall("POST", { action: "claim", id }), f.mailCall("POST", { action: "claim", id })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const claimed = await responses.find(r => r.status === 200).json();
  assert.equal((await f.mailCall("PATCH", { id, leaseToken: makeToken(), outcome: "sent", providerMessageId: "synthetic" })).status, 409);
  assert.equal((await f.mailCall("PATCH", { id, leaseToken: claimed.leaseToken, outcome: "sent" })).status, 422);
  f.db.exec("UPDATE test_account_outbox SET lease_expires_at='2020-01-01'");
  const queue = await f.call("admin/test-accounts/mail?state=unknown", "GET", undefined, f.automation); assert.equal((await queue.json()).items.length, 1);
  assert.equal((await f.mailCall("POST", { action: "claim", id })).status, 409);
  assert.equal((await f.mailCall("POST", { action: "resolve", id, resolution: "not_sent", providerChecked: true })).status, 403);
  assert.equal((await f.mailCall("POST", { action: "resolve", id, resolution: "not_sent" }, f.headers)).status, 422);
  assert.equal((await f.mailCall("POST", { action: "resolve", id, resolution: "not_sent", providerChecked: true }, f.headers)).status, 200);
  assert.equal((await f.mailCall("POST", { action: "claim", id })).status, 200);
  assert.equal(f.db.prepare("SELECT attempts FROM test_account_outbox").get().attempts, 2);
});

test("withdrawal revokes access and tokens but preserves accounts; retention keeps activated accounts", async t => {
  const f = await fixture(t), input = f.application(); await f.call("beta/requests", "POST", input);
  const mail = await f.claim(); const activated = await (await f.call("auth/test-activation", "POST", { action: "activate", token: mail.token, password: "PreserveAccountPassword71" })).json();
  const account = f.db.prepare("SELECT * FROM test_accounts").get();
  assert.equal((await f.call("beta/status", "POST", { token: input.token, action: "withdraw", confirm: true })).status, 200);
  assert.equal(f.db.prepare("SELECT status FROM test_accounts").get().status, "revoked");
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM user_sessions").get().n, 0);
  assert.equal(f.db.prepare("SELECT recipient_email FROM test_account_outbox").get().recipient_email, "");
  assert.ok(credential(f, activated.loginEmail)); assert.ok(f.db.prepare("SELECT 1 FROM users WHERE email=?").get(account.user_email));
  const originalHash = credential(f, activated.loginEmail).password_hash;
  await f.submit(); assert.equal(credential(f, activated.loginEmail).password_hash, originalHash); assert.equal(await f.auth.appAccountAllowed(f.DB, activated.loginEmail), false);
  const input2 = f.application({ email: "second@example.invalid" }); await f.call("beta/requests", "POST", input2);
  const mail2 = await f.claim(); const body2 = await (await f.call("auth/test-activation", "POST", { action: "activate", token: mail2.token, password: "AnotherAccountPassword42" })).json();
  f.db.exec("UPDATE beta_requests SET expires_at='2020-01-01'");
  await f.call("admin/beta", "GET", undefined, f.headers);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM beta_requests").get().n, 0);
  assert.equal(await f.auth.appAccountAllowed(f.DB, body2.loginEmail), true);
  assert.ok(credential(f, body2.loginEmail)); assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox").get().n, 0);
});

test("expired pending activation can be renewed once across concurrent applications without changing aliases", async t => {
  const f = await fixture(t); await f.submit();
  const old = f.db.prepare("SELECT * FROM test_accounts").get(); const oldMail = await f.claim();
  f.db.exec("UPDATE test_account_activations SET expires_at='2020-01-01'; UPDATE test_account_outbox SET expires_at='2020-01-01'");
  const responses = await Promise.all([f.submit(), f.submit()]); assert.ok(responses.every(r => r.status === 201));
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_accounts").get().n, 1);
  assert.equal(f.db.prepare("SELECT user_email FROM test_accounts").get().user_email, old.user_email);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox WHERE state='pending'").get().n, 1);
  assert.equal((await f.call("auth/test-activation", "POST", { action: "inspect", token: oldMail.token })).status, 404);
  const renewed = await f.claim(); assert.equal((await f.call("auth/test-activation", "POST", { action: "activate", token: renewed.token, password: "RenewedAccountPassword71" })).status, 200);
});

test("frozen/deleted accounts and expired applications cannot activate or be claimed", async t => {
  const f = await fixture(t); await f.submit(); const mail = await f.claim();
  const email = f.db.prepare("SELECT user_email FROM test_accounts").get().user_email;
  f.db.prepare("UPDATE users SET status='deleting' WHERE email=?").run(email);
  assert.equal((await f.call("auth/test-activation", "POST", { action: "inspect", token: mail.token })).status, 404);
  assert.equal(f.db.prepare("SELECT state FROM test_account_outbox").get().state, "cancelled");
  assert.equal(f.db.prepare("SELECT recipient_email FROM test_account_outbox").get().recipient_email, "");
  f.db.prepare("DELETE FROM users WHERE email=?").run(email);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_activations").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM test_account_outbox").get().n, 0);
  await f.submit({ email: "expired@example.invalid" });
  f.db.exec("UPDATE beta_requests SET expires_at='2020-01-01'");
  await f.call("admin/beta", "GET", undefined, f.headers);
  assert.equal(f.db.prepare("SELECT status FROM test_accounts").get().status, "revoked");
  assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("missing issuance secret is atomic; rotated delivery secret never emits a broken activation message", async t => {
  const f = await fixture(t), saved = f.env.BETA_REVIEW_SECRET;
  delete f.env.BETA_REVIEW_SECRET;
  assert.equal((await f.submit()).status, 503);
  for (const table of ["users", "test_accounts", "beta_requests", "test_account_outbox"]) assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  f.env.BETA_REVIEW_SECRET = saved;
  assert.equal((await f.submit()).status, 201);
  f.env.BETA_REVIEW_SECRET = makeToken();
  const id = f.db.prepare("SELECT id FROM test_account_outbox").get().id;
  const response = await f.mailCall("POST", { action: "claim", id }, f.headers);
  assert.equal(response.status, 503); const body = await response.json(); assert.equal(Object.hasOwn(body, "text"), false);
  assert.equal(f.db.prepare("SELECT state FROM test_account_outbox").get().state, "claimed");
  assert.equal((await f.mailCall("POST", { action: "claim", id }, f.headers)).status, 409);
});

test("activation transaction rejects withdrawal after inspection and concurrent activations have one password winner", async t => {
  const f = await fixture(t); await f.submit(); const mail = await f.claim();
  let batches = 0;
  f.beforeBatch(() => { if (++batches === 2) f.db.exec("UPDATE beta_requests SET status='withdrawn'"); });
  assert.equal((await f.call("auth/test-activation", "POST", { action: "activate", token: mail.token, password: "WithdrawRacePassword47" })).status, 409);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM user_credentials").get().n, 0);
  f.beforeBatch(() => {});
  await f.submit({ email: "parallel@example.invalid" }); const parallel = await f.claim();
  const candidates = ["ParallelFirstPassword41", "ParallelSecondPassword52"];
  const result = await Promise.all(candidates.map(password => f.call("auth/test-activation", "POST", { action: "activate", token: parallel.token, password })));
  assert.equal(result.filter(response => response.status === 200).length, 1);
  assert.ok(result.every(response => [200, 404, 409].includes(response.status)));
  const winner = result.findIndex(response => response.status === 200), account = await result[winner].json();
  assert.equal((await authenticate(f, account.loginEmail, candidates[winner])).status, 200);
  assert.equal((await authenticate(f, account.loginEmail, candidates[1-winner])).status, 401);
});
