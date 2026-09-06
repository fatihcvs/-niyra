import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationsDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationsDirectory), "utf8")));
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const [authSource, routeSource] = await Promise.all([compile("../lib/app-auth.ts"), compile("../app/api/auth/session/route.ts")]);

async function fixture(t) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close()); database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => database.exec(sql));
  database.exec("INSERT INTO users(email,display_name,handle,public_id) VALUES ('owner@test.local','Owner','owner','owner-public'),('other@test.local','Other','other','other-public')");
  const auth = {}; const globals = { crypto, Request, Response, Headers, URL, TextEncoder, Uint8Array, atob, btoa };
  runInNewContext(authSource, { ...globals, exports: auth });
  const oldToken = "synthetic-cookie-for-owner", oldHash = await auth.sha256(oldToken);
  database.prepare("INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES (?,'owner@test.local','2099-01-01T00:00:00Z')").run(oldHash);
  database.exec("INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES ('separate-device-session','owner@test.local','2099-01-01T00:00:00Z')");
  database.prepare("INSERT INTO push_subscriptions(id,owner_email,session_hash,device_id,kind,endpoint_hash,token) VALUES ('current-subscription','owner@test.local',?,'device:current','fcm','current-endpoint','synthetic-native-token')").run(oldHash);
  database.exec("INSERT INTO push_subscriptions(id,owner_email,session_hash,device_id,kind,endpoint_hash,token) VALUES ('separate-subscription','owner@test.local','separate-device-session','device:separate','fcm','separate-endpoint','separate-native-token'); INSERT INTO notifications(id,user_email,actor_email,kind,title) VALUES ('queued','owner@test.local','other@test.local','interaction','Private')");
  let loseDeleteAck = false;
  const DB = {
    prepare(sql) {
      const statement = (values = []) => ({ sql, values, bind(...bound) { return statement(bound); },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async run() { const result = database.prepare(sql).run(...values); if (loseDeleteAck && /^DELETE FROM user_sessions/.test(sql)) { loseDeleteAck = false; throw new Error("Committed deletion acknowledgement lost"); } return result; },
      }); return statement();
    },
    async batch(statements) { database.exec("BEGIN"); try { const results = statements.map((statement) => database.prepare(statement.sql).run(...statement.values)); database.exec("COMMIT"); return results; } catch (error) { database.exec("ROLLBACK"); throw error; } },
  };
  const route = {};
  runInNewContext(routeSource, { ...globals, exports: route, require(name) {
    if (name.endsWith("/app-auth")) return auth;
    if (name.endsWith("/server-api")) return { getRuntime: async () => ({ DB }), unavailableResponse: () => Response.json({ error: "Retry logout" }, { status: 503 }), enforceRateLimit: async () => ({ allowed: true }) };
    throw new Error(`Unexpected import ${name}`);
  } });
  const request = (extra = {}) => new Request("https://kampira.test/api/auth/session", { method: "DELETE", headers: { cookie: `uniyra_session=${oldToken}`, origin: "https://kampira.test", ...extra } });
  return { database, DB, auth, route, oldHash, request, loseDeleteAck() { loseDeleteAck = true; },
    subscriptionCount() { return database.prepare("SELECT count(*) AS n FROM push_subscriptions").get().n; },
    jobCount() { return database.prepare("SELECT count(*) AS n FROM push_deliveries").get().n; },
  };
}

test("account replacement atomically revokes only the previous browser session and its push generation", async (t) => {
  const f = await fixture(t); assert.equal(f.subscriptionCount(), 2); assert.equal(f.jobCount(), 2);
  const session = await f.auth.createSession(f.DB, "other@test.local", f.request());
  assert.equal(f.database.prepare("SELECT token_hash FROM user_sessions WHERE token_hash=?").get(f.oldHash), undefined);
  assert.equal(f.subscriptionCount(), 1); assert.equal(f.jobCount(), 1);
  assert.ok(f.database.prepare("SELECT id FROM push_subscriptions WHERE id='separate-subscription'").get());
  const newCookie = session.cookie.split(";")[0]; const context = await f.auth.getActiveSessionContext(f.DB, new Headers({ cookie: newCookie }));
  assert.equal(context.email, "other@test.local"); assert.equal(context.publicId, "other-public"); assert.notEqual(context.tokenHash, f.oldHash);
  assert.match(session.cookie, /HttpOnly/); assert.match(session.cookie, /Secure/); assert.match(session.cookie, /SameSite=Lax/);
});

test("failed replacement insert rolls back the old session, subscription and queued push deliveries", async (t) => {
  const f = await fixture(t);
  f.database.exec("CREATE TRIGGER fail_replacement BEFORE INSERT ON user_sessions WHEN NEW.user_email='other@test.local' BEGIN SELECT RAISE(ABORT,'insert failed'); END");
  await assert.rejects(f.auth.createSession(f.DB, "other@test.local", f.request()));
  assert.ok(f.database.prepare("SELECT token_hash FROM user_sessions WHERE token_hash=?").get(f.oldHash));
  assert.equal(f.subscriptionCount(), 2); assert.equal(f.jobCount(), 2);
  assert.equal((await f.auth.getActiveSessionContext(f.DB, f.request().headers)).email, "owner@test.local");
});

test("session context requires the actual cookie and rejects expired or suspended sessions", async (t) => {
  const f = await fixture(t); assert.equal(await f.auth.getActiveSessionContext(f.DB, new Headers()), null);
  assert.equal(await f.auth.getActiveSessionContext(f.DB, new Headers({ cookie: "uniyra_session=unknown" })), null);
  f.database.prepare("UPDATE user_sessions SET expires_at='2000-01-01T00:00:00Z' WHERE token_hash=?").run(f.oldHash);
  assert.equal(await f.auth.getActiveSessionContext(f.DB, f.request().headers), null);
  f.database.prepare("UPDATE user_sessions SET expires_at='2099-01-01T00:00:00Z' WHERE token_hash=?").run(f.oldHash);
  f.database.exec("UPDATE users SET status='suspended' WHERE email='owner@test.local'");
  assert.equal(await f.auth.getActiveSessionContext(f.DB, f.request().headers), null);
});

test("failed logout revocation returns503 without clearing its cookie and succeeds on an explicit retry", async (t) => {
  const f = await fixture(t); f.database.exec("CREATE TRIGGER block_logout BEFORE DELETE ON user_sessions BEGIN SELECT RAISE(ABORT,'database unavailable'); END");
  const failed = await f.route.DELETE(f.request()); assert.equal(failed.status, 503); assert.equal(failed.headers.get("set-cookie"), null); assert.notEqual((await failed.json()).signedOut, true);
  assert.equal(f.subscriptionCount(), 2); assert.equal(f.jobCount(), 2);
  f.database.exec("DROP TRIGGER block_logout"); const success = await f.route.DELETE(f.request()); assert.equal(success.status, 200); assert.equal((await success.json()).signedOut, true);
  assert.match(success.headers.get("set-cookie"), /Max-Age=0/); assert.equal(f.subscriptionCount(), 1); assert.equal(f.jobCount(), 1);
});

test("lost logout acknowledgement keeps a retryable cookie without resurrecting the revoked push session", async (t) => {
  const f = await fixture(t); f.loseDeleteAck();
  const uncertain = await f.route.DELETE(f.request()); assert.equal(uncertain.status, 503); assert.equal(uncertain.headers.get("set-cookie"), null);
  assert.equal(f.subscriptionCount(), 1); assert.equal(f.jobCount(), 1); assert.equal(await f.auth.getActiveSessionContext(f.DB, f.request().headers), null);
  const retry = await f.route.DELETE(f.request()); assert.equal(retry.status, 200); assert.match(retry.headers.get("set-cookie"), /Max-Age=0/); assert.equal(f.subscriptionCount(), 1);
});

test("cross-origin logout cannot revoke an authenticated device subscription", async (t) => {
  const f = await fixture(t); const response = await f.route.DELETE(f.request({ origin: "https://evil.test" }));
  assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null); assert.equal(f.subscriptionCount(), 2); assert.equal(f.jobCount(), 2);
});
