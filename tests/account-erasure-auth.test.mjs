import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, crypto, Request, Response, Headers, URL, TextEncoder, Uint8Array, atob, btoa, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const auth = load('lib/app-auth.ts');
function fixture(t) {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  database.exec('PRAGMA foreign_keys=ON');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name)).sort()) database.exec(readFileSync(new URL(name, directory), 'utf8'));
  database.exec("INSERT INTO users(email,public_id,display_name,handle) VALUES ('first@example.invalid','first','First','first'),('second@example.invalid','second','Second','second')");
  const DB = { prepare(sql) {
    const statement = (values = []) => ({ sql, values, bind(...bound) { return statement(bound); }, async first() { return database.prepare(sql).get(...values) ?? null; }, async run() { return { meta: database.prepare(sql).run(...values) }; } });
    return statement();
  }, async batch(statements) { database.exec('BEGIN'); try { const results = statements.map(({ sql, values }) => ({ meta: database.prepare(sql).run(...values) })); database.exec('COMMIT'); return results; } catch (error) { database.exec('ROLLBACK'); throw error; } } };
  return { DB, database };
}
const platformHeaders = () => new Headers({ host: 'kampira.chatgpt.site', 'oai-authenticated-user-id': 'synthetic-platform-identity', 'oai-authenticated-user-email': 'first@example.invalid' });

test('trusted platform identity requires an existing active account and fails closed on missing storage', async (t) => {
  const f = fixture(t); let binding = f.DB;
  const identity = load('app/chatgpt-auth.ts', { 'next/headers': { headers: async () => platformHeaders() }, 'next/navigation': { redirect() { throw new Error('unexpected redirect'); } }, '../lib/app-auth': auth, 'cloudflare:workers': { get env() { return { DB: binding }; } } });
  assert.equal((await identity.getChatGPTUser()).email, 'first@example.invalid');
  f.database.exec("UPDATE users SET status='deleting' WHERE email='first@example.invalid'");
  assert.equal(await identity.getChatGPTUser(), null);
  f.database.exec("DELETE FROM users WHERE email='first@example.invalid'");
  assert.equal(await identity.getChatGPTUser(), null, 'Retained platform headers do not recreate deleted accounts');
  binding = undefined; assert.equal(await identity.getChatGPTUser(), null);
  binding = { prepare() { throw new Error('database unavailable'); } }; assert.equal(await identity.getChatGPTUser(), null);
});

test('new session issuance to a frozen account fails without revoking the browser previous account', async (t) => {
  const f = fixture(t);
  const prior = await auth.createSession(f.DB, 'first@example.invalid', new Request('https://kampira.test'));
  const headers = new Headers({ cookie: prior.cookie.split(';')[0] });
  f.database.exec("UPDATE users SET status='deleting' WHERE email='second@example.invalid'");
  await assert.rejects(auth.createSession(f.DB, 'second@example.invalid', new Request('https://kampira.test', { headers })), /Active account/);
  assert.equal((await auth.getSessionIdentity(f.DB, headers)).email, 'first@example.invalid');
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM user_sessions WHERE user_email='second@example.invalid'").get().n, 0);
});

test('profile and cookie identity stop authorizing a frozen account', async (t) => {
  const f = fixture(t);
  f.database.exec("INSERT INTO universities(id,name,short_name,city) VALUES('campus','Campus','C','Test'); INSERT INTO faculties(id,university_id,name,short_name) VALUES('faculty','campus','Faculty','F'); INSERT INTO departments(id,faculty_id,name) VALUES('department','faculty','Department'); INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES('first@example.invalid','campus','department',1,1)");
  const server = load('lib/server-api.ts', { '../app/chatgpt-auth': { getChatGPTUser: async () => null } });
  const session = await auth.createSession(f.DB, 'first@example.invalid', new Request('https://kampira.test'));
  const headers = new Headers({ cookie: session.cookie.split(';')[0] });
  assert.equal((await server.requireProfile(f.DB, 'first@example.invalid')).public_id, 'first');
  f.database.exec("UPDATE users SET status='deleting' WHERE email='first@example.invalid'");
  assert.equal(await server.requireProfile(f.DB, 'first@example.invalid'), null);
  assert.equal(await auth.getSessionIdentity(f.DB, headers), null);
  assert.equal(await auth.getActiveSessionContext(f.DB, headers), null);
});

test('staff confirmation context changes with account and session without exposing its credential', async () => {
  const staff = load('lib/staff-auth.ts', { './app-auth': auth, './server-api': {} });
  const headers = new Headers({ cookie: 'uniyra_staff_session=synthetic-session-one' });
  const context = await staff.staffAccountContext(headers, 'owner-one');
  assert.match(context, /^[a-f0-9]{64}$/);
  assert.notEqual(context, await auth.sha256('synthetic-session-one'));
  assert.equal(context, await staff.staffAccountContext(headers, 'owner-one'));
  assert.notEqual(context, await staff.staffAccountContext(headers, 'owner-two'));
  assert.notEqual(context, await staff.staffAccountContext(new Headers({ cookie: 'uniyra_staff_session=synthetic-session-two' }), 'owner-one'));
  assert.equal(await staff.staffAccountContext(new Headers(), 'owner-one'), '');
});
