import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const makeToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
async function fixture(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close()); db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(resolve(root, "drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) db.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  let beforeBatch = () => {};
  const prepare = (sql, args = []) => ({ sql, args, bind(...values) { return prepare(sql, values); }, async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return { meta: db.prepare(sql).run(...args), success: true }; } });
  const DB = { prepare, async batch(statements) { beforeBatch(); db.exec("BEGIN"); try { const result = statements.map(item => ({ meta: db.prepare(item.sql).run(...item.args), success: true })); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } } };
  const env = { DB, BETA_REVIEW_SECRET: makeToken() }, cache = new Map();
  const load = path => {
    const file = resolve(root, path); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, crypto, Response, Request, Headers, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
      require(name) { if (name === "cloudflare:workers") return { env }; if (name.endsWith("/chatgpt-auth")) return { getChatGPTUser: async () => null }; return load(resolve(dirname(file), `${name}.ts`)); } });
    return exports;
  };
  const staff = load("lib/staff-auth.ts"), auth = load("lib/app-auth.ts");
  const cookies = {};
  for (const role of ["owner", "admin"]) {
    db.prepare("INSERT INTO staff_accounts(id,username,display_name,role,password_hash,password_salt,password_iterations,must_change_password) VALUES(?,?,?,?, 'hash','salt',310000,0)").run(role, role, role, role);
    cookies[role] = (await staff.createStaffSession(DB, role, new Request("https://kampira.test"))).cookie.split(";")[0];
  }
  const call = (path, method = "GET", body, options = {}) => load(`app/api/${path.split("?")[0]}/route.ts`)[method](new Request(`https://kampira.test/api/${path}`, { method,
    headers: { origin: "https://kampira.test", "content-type": "application/json", "x-forwarded-for": "127.0.0.1", ...options }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const application = (extra = {}) => ({ token: makeToken(), kind: "application", email: "student@example.invalid", deviceModel: "Android phone", adult: true, android: true, participation: true, consent: true, ...extra });
  const submit = input => call("beta/requests", "POST", input);
  const status = token => call("beta/status", "POST", { token, action: "read" });
  const headers = { cookie: cookies.admin, "X-Staff-Context": await staff.staffAccountContext(new Headers({ cookie: cookies.admin }), "admin") };
  const automation = { authorization: `Bearer ${env.BETA_REVIEW_SECRET}` };
  return { db, DB, load, auth, cookies, headers, automation, application, call, submit, status, beforeBatch(fn) { beforeBatch = fn; } };
}

test("public submissions require complete consent and create a private replay-safe receipt", async t => {
  const f = await fixture(t), input = f.application({ displayName: "Öğrenci", message: "Notları denemek istiyorum." });
  for (const field of ["adult", "android", "participation", "consent"]) assert.equal((await f.submit({ ...input, [field]: false })).status, 422);
  const first = await f.submit(input); assert.equal(first.status, 201); const body = await first.json();
  assert.equal((await (await f.submit(input)).json()).id, body.id);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_requests").get().n, 1);
  assert.equal((await f.submit({ ...input, message: "Değiştirildi" })).status, 409);
  const tracked = await (await f.status(input.token)).json(); assert.equal(tracked.request.status, "new");
  assert.equal(tracked.request.playUrl, ""); assert.equal(tracked.request.subject, "Android kapalı test başvurusu");
  assert.equal("internalNote" in tracked.request, false); assert.equal("access_hash" in tracked.request, false);
  assert.equal((await f.status(makeToken())).status, 404);
  assert.equal((await f.call("beta/requests", "POST", input, { origin: "https://attacker.invalid" })).status, 403);
});

test("feedback needs no account or email and excessive payloads and honeypots are rejected", async t => {
  const f = await fixture(t), token = makeToken();
  const body = { token, kind: "feedback", category: "bug", subject: "Not yükleme sorunu", message: "Notu seçtiğimde yükleme tamamlanmıyor.", consent: true };
  assert.equal((await f.submit(body)).status, 201);
  assert.equal((await (await f.status(token)).json()).request.kind, "feedback");
  assert.equal((await f.submit({ ...body, token: makeToken(), website: "spam" })).status, 422);
  assert.equal((await f.submit({ ...body, message: "x".repeat(20000) })).status, 413);
  assert.equal((await f.submit({ ...body, category: "__proto__" })).status, 422);
});

test("only current staff can review; public replies and private notes remain separate", async t => {
  const f = await fixture(t), input = f.application(), { id } = await (await f.submit(input)).json();
  assert.equal((await f.call("admin/beta")).status, 401);
  assert.equal((await f.call("admin/beta", "GET", undefined, { authorization: `Bearer ${makeToken()}` })).status, 401);
  const change = { id, revision: 0, status: "ready", internalNote: "Yalnız ekip notu", reply: "Başvurunu aldık, test erişimi için sıradasın." };
  assert.equal((await f.call("admin/beta", "PATCH", change, { cookie: f.cookies.admin })).status, 409);
  assert.equal((await f.call("admin/beta", "PATCH", change, f.headers)).status, 200);
  const tracked = await (await f.status(input.token)).json();
  assert.equal(tracked.request.status, "ready"); assert.equal(tracked.messages.length, 1);
  assert.equal(JSON.stringify(tracked).includes("Yalnız ekip notu"), false);
  assert.equal((await f.call("admin/beta", "PATCH", change, f.headers)).status, 409);
  const queue = await (await f.call(`admin/beta?id=${id}`, "GET", undefined, f.headers)).json();
  assert.equal(queue.items[0].internalNote, "Yalnız ekip notu");
  assert.equal(JSON.stringify(queue).includes("access_hash"), false); assert.equal(JSON.stringify(queue).includes("submission_hash"), false);
});

test("automation can pre-assess new records but cannot grant access, reject or close feedback", async t => {
  const f = await fixture(t), input = f.application(), { id } = await (await f.submit(input)).json();
  for (const status of ["invited", "testing", "completed", "declined"]) assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 0, status }, f.automation)).status, 403);
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 0, status: "ready", reply: "Test erişimi için sıradasın." }, f.automation)).status, 200);
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 1, status: "needs_info" }, f.automation)).status, 403);
  assert.equal((await (await f.status(input.token)).json()).messages[0].authorKind, "automation");
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 1, status: "invited", playUrl: "https://evil.invalid" }, f.headers)).status, 422);
  const link = "https://play.google.com/apps/testing/app.kampira.mobile";
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 1, status: "invited", playUrl: link }, f.headers)).status, 422);
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 1, status: "invited", playUrl: link, accessConfirmed: true }, f.headers)).status, 200);
  assert.equal((await f.call("beta/status", "POST", { token: input.token, action: "joined" })).status, 200);
  assert.equal((await (await f.status(input.token)).json()).request.status, "testing");
});

test("review transaction rolls back on audit failure and rejects a revoked session after initial read", async t => {
  const f = await fixture(t), input = f.application(), { id } = await (await f.submit(input)).json();
  f.db.exec("CREATE TRIGGER test_beta_audit BEFORE INSERT ON staff_audit_logs WHEN NEW.action='beta.reviewed' BEGIN SELECT RAISE(ABORT,'synthetic_audit_failure'); END");
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 0, status: "ready", reply: "Kayıt alınmıştır." }, f.headers)).status, 503);
  assert.equal(f.db.prepare("SELECT status FROM beta_requests").get().status, "new"); assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_request_messages").get().n, 0);
  f.db.exec("DROP TRIGGER test_beta_audit");
  f.beforeBatch(() => f.db.exec("UPDATE staff_accounts SET status='disabled' WHERE id='admin'"));
  assert.equal((await f.call("admin/beta", "PATCH", { id, revision: 0, status: "ready" }, f.headers)).status, 409);
  assert.equal(f.db.prepare("SELECT status FROM beta_requests").get().status, "new");
});

test("follow-up retries stay singular; withdrawal scrubs personal data and expiry deletes conversations", async t => {
  const f = await fixture(t), input = f.application({ displayName: "İsim", university: "Üniversite", message: "Özel açıklama" }), { id } = await (await f.submit(input)).json();
  const followup = { token: input.token, action: "message", requestId: crypto.randomUUID(), message: "Ek cihaz bilgisi paylaşıyorum." };
  assert.equal((await f.call("beta/status", "POST", followup)).status, 200); assert.equal((await f.call("beta/status", "POST", followup)).status, 200);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_request_messages").get().n, 1);
  assert.equal((await f.call("beta/status", "POST", { token: input.token, action: "withdraw", confirm: true })).status, 200);
  const row = f.db.prepare("SELECT * FROM beta_requests WHERE id=?").get(id);
  for (const name of ["email", "display_name", "university", "device_model", "android_version", "message", "internal_note"]) assert.equal(row[name], "");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_request_messages").get().n, 0);
  assert.equal((await f.call("beta/status", "POST", followup)).status, 409);
  f.db.prepare("UPDATE beta_requests SET expires_at='2020-01-01' WHERE id=?").run(id);
  assert.equal((await f.status(input.token)).status, 404);
  await f.call("admin/beta", "GET", undefined, f.headers); assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_requests").get().n, 0);
});
