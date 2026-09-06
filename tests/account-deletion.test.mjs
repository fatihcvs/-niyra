import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = new URL("../", import.meta.url);
const migrations = await Promise.all((await readdir(new URL("drizzle/", root))).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
  .map((name) => readFile(new URL(`drizzle/${name}`, root), "utf8")));
const paths = ["lib/account-deletion.ts", "lib/account-erasure.ts", "lib/account-erasure-inventory.ts", "lib/app-auth.ts", "lib/staff-auth.ts", "lib/server-api.ts", "app/api/account-deletion/route.ts", "app/api/admin/account-deletion/route.ts", "app/account-deletion/request-panel.tsx", "app/account-deletion/page.tsx"];
const sources = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, ts.transpileModule(await readFile(new URL(path, root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText])));
function load(path, dependencies = {}) {
  const exports = {};
  runInNewContext(sources[path], { exports, crypto, Response, Request, Headers, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob, React,
    require(name) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  return exports;
}
const appAuth = load("lib/app-auth.ts");
const helpers = load("lib/account-deletion.ts");
const erasureInventory = load("lib/account-erasure-inventory.ts");
const erasure = load("lib/account-erasure.ts", { "./account-deletion": helpers, "./account-erasure-inventory": erasureInventory });

async function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  database.exec(`INSERT INTO users (email, public_id, display_name, handle) VALUES
    ('author@test.local', 'author', 'Author', 'author'), ('other@test.local', 'other', 'Other', 'other');
    INSERT INTO posts (id, author_email, content) VALUES ('keep-post', 'author@test.local', 'Keep my content');`);
  let currentHeaders = new Headers();
  let loseBatchAcknowledgement = false;
  const DB = {
    prepare(query) { return { bind(...values) { return {
      query, values,
      async first() { return database.prepare(query).get(...values) ?? null; },
      async all() { return { results: database.prepare(query).all(...values) }; },
      async run() { return { success: true, meta: database.prepare(query).run(...values) }; },
    }; } }; },
    async batch(statements) {
      database.exec("BEGIN");
      let results;
      try {
        results = statements.map(({ query, values }) => ({ success: true, meta: database.prepare(query).run(...values) }));
        database.exec("COMMIT");
      } catch (error) { database.exec("ROLLBACK"); throw error; }
      if (loseBatchAcknowledgement) { loseBatchAcknowledgement = false; throw new Error("Committed response lost"); }
      return results;
    },
  };
  const identity = { getChatGPTUser: () => appAuth.getSessionIdentity(DB, currentHeaders) };
  const server = load("lib/server-api.ts", { "../app/chatgpt-auth": identity });
  const runtime = { ...server, getRuntime: async () => ({ DB, FILES: { delete() { throw new Error("Account requests must never delete files"); } } }) };
  const staff = load("lib/staff-auth.ts", { "./app-auth": appAuth, "./server-api": runtime });
  const publicRoute = load("app/api/account-deletion/route.ts", {
    "../../chatgpt-auth": identity, "../../../lib/app-auth": appAuth, "../../../lib/server-api": runtime, "../../../lib/account-deletion": helpers,
  });
  const staffRoute = load("app/api/admin/account-deletion/route.ts", {
    "../../../../lib/account-deletion": helpers, "../../../../lib/account-erasure": erasure, "../../../../lib/server-api": runtime, "../../../../lib/staff-auth": staff,
  });
  const request = new Request("https://kampira.test/account-deletion");
  const cookies = {};
  for (const id of ["author", "other"]) cookies[id] = (await appAuth.createSession(DB, `${id}@test.local`, request)).cookie.split(";")[0];
  for (const role of ["owner", "admin"]) {
    database.prepare("INSERT INTO staff_accounts (id, username, display_name, role, password_hash, password_salt, password_iterations, must_change_password) VALUES (?, ?, ?, ?, 'test-hash', 'test-salt', 310000, 0)")
      .run(`staff-${role}`, role, role, role);
    cookies[role] = (await staff.createStaffSession(DB, `staff-${role}`, request)).cookie.split(";")[0];
  }
  return {
    database, DB, cookies,
    loseBatchResponse() { loseBatchAcknowledgement = true; },
    count(table) { return database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count; },
    call(method = "GET", payload, { user = "author", origin = "https://kampira.test", context, raw } = {}) {
      currentHeaders = new Headers({ origin, ...(user ? { cookie: cookies[user] } : {}) });
      if (context !== undefined) currentHeaders.set("X-Account-Context", context);
      const headers = new Headers(currentHeaders);
      if (method !== "GET") headers.set("content-type", "application/json");
      return publicRoute[method](new Request("https://kampira.test/api/account-deletion", { method, headers, ...(method === "GET" ? {} : { body: raw ?? JSON.stringify(payload) }) }));
    },
    staffCall(method = "GET", payload, { role = "admin", origin = "https://kampira.test", query = "", cookie } = {}) {
      const headers = { origin, cookie: cookie ?? cookies[role] ?? "", "content-type": "application/json" };
      return staffRoute[method](new Request(`https://kampira.test/api/admin/account-deletion${query}`, { method, headers, ...(method === "GET" ? {} : { body: JSON.stringify(payload) }) }));
    },
  };
}

test("authenticated account requests need no academic onboarding and do not delete or suspend any account data", async (t) => {
  const f = await fixture(t);
  const response = await f.call("POST", { confirm: true, note: " My request ", email: "other@test.local" });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.deletionExecuted, false);
  assert.equal(body.request.note, "My request");
  assert.deepEqual(body.request.history.map((entry) => entry.status), ["requested"]);
  assert.equal(f.database.prepare("SELECT user_email FROM account_deletion_requests").get().user_email, "author@test.local");
  assert.equal(f.count("users"), 2);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("user_sessions"), 2);
  assert.equal(f.database.prepare("SELECT status FROM users WHERE email = 'author@test.local'").get().status, "active");
  assert.equal(f.count("student_profiles"), 0);
  const owned = await f.call();
  assert.equal(owned.headers.get("cache-control"), "private, no-store");
  assert.equal((await owned.json()).requests.length, 1);
});

test("concurrent retries and a lost commit response keep one open request and one audit event", async (t) => {
  const f = await fixture(t);
  f.loseBatchResponse();
  assert.equal((await f.call("POST", { confirm: true })).status, 503);
  const responses = await Promise.all([f.call("POST", { confirm: true }), f.call("POST", { confirm: true, note: "Different retry note" })]);
  assert.ok(responses.every((response) => response.status === 200));
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies[0].request.id, bodies[1].request.id);
  assert.equal(bodies[1].request.note, "");
  assert.equal(f.count("account_deletion_requests"), 1);
  assert.equal(f.count("account_deletion_events"), 1);
  assert.equal(f.count("audit_logs"), 1);
});

test("ownership, same-origin and stale account context are enforced without exposing another request", async (t) => {
  const f = await fixture(t);
  const body = await (await f.call("POST", { confirm: true })).json();
  assert.equal((await f.call("GET", null, { user: null })).status, 401);
  assert.equal((await f.call("POST", { confirm: true }, { user: null })).status, 401);
  assert.equal((await f.call("POST", { confirm: true }, { origin: "https://outside.test" })).status, 403);
  const changed = await f.call("POST", { confirm: true }, { context: "other@test.local" });
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, "ACCOUNT_CHANGED");
  const other = await (await f.call("GET", null, { user: "other" })).json();
  assert.deepEqual(other.requests, []);
  assert.equal((await f.call("PATCH", { action: "cancel", id: body.request.id }, { user: "other" })).status, 404);
  assert.equal(f.database.prepare("SELECT status FROM account_deletion_requests").get().status, "requested");
});

test("cancel is idempotent, retains history and permits a later explicitly new request", async (t) => {
  const f = await fixture(t);
  const first = await (await f.call("POST", { confirm: true })).json();
  for (let index = 0; index < 2; index++) {
    const response = await f.call("PATCH", { action: "cancel", id: first.request.id });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).request.history.map((event) => event.status), ["requested", "cancelled"]);
  }
  assert.equal(f.count("audit_logs"), 2);
  assert.equal(f.count("account_deletion_events"), 2);
  const next = await f.call("POST", { confirm: true });
  assert.equal(next.status, 202);
  assert.notEqual((await next.json()).request.id, first.request.id);
  assert.equal((await (await f.call()).json()).requests.length, 2);
  assert.equal(f.count("posts"), 1);
});

test("invalid input, suspended accounts and unsupported completion are rejected", async (t) => {
  const f = await fixture(t);
  for (const payload of [{}, { confirm: "true" }, { confirm: true, note: "x".repeat(801) }, { confirm: true, note: {} }]) {
    assert.equal((await f.call("POST", payload)).status, 400);
  }
  assert.equal((await f.call("POST", null, { raw: "not-json" })).status, 400);
  assert.equal((await f.call("PATCH", { action: "completed", id: "request-id" })).status, 400);
  assert.equal((await f.call("PATCH", { action: "cancel", id: "../other" })).status, 400);
  f.database.exec("UPDATE users SET status = 'suspended' WHERE email = 'author@test.local'");
  assert.equal((await f.call("POST", { confirm: true })).status, 401);
  assert.equal(f.count("account_deletion_requests"), 0);
});

test("staff queue requires a real active owner/admin staff session and completed initial password change", async (t) => {
  const f = await fixture(t);
  await f.call("POST", { confirm: true });
  f.database.exec("INSERT INTO platform_roles (user_email, role) VALUES ('author@test.local', 'moderator')");
  assert.equal((await f.staffCall("GET", null, { cookie: f.cookies.author })).status, 401);
  assert.equal((await f.staffCall("GET", null, { role: "missing" })).status, 401);
  for (const role of ["owner", "admin"]) {
    const response = await f.staffCall("GET", null, { role });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).requests[0].email, "author@test.local");
  }
  f.database.exec("UPDATE staff_accounts SET must_change_password = 1 WHERE role = 'admin'");
  assert.equal((await f.staffCall()).status, 428);
  f.database.exec("UPDATE staff_accounts SET must_change_password = 0, status = 'disabled' WHERE role = 'admin'");
  assert.equal((await f.staffCall()).status, 401);
});

test("staff review is audited atomically and cancellable before execution; unsupported completion shortcuts are rejected", async (t) => {
  const f = await fixture(t);
  const created = await (await f.call("POST", { confirm: true })).json();
  const id = created.request.id;
  assert.equal((await f.staffCall("PATCH", { action: "review", id }, { origin: "https://outside.test" })).status, 403);
  for (let index = 0; index < 2; index++) assert.equal((await f.staffCall("PATCH", { action: "review", id })).status, 200);
  assert.equal(f.count("staff_audit_logs"), 1);
  const own = (await (await f.call()).json()).requests[0];
  assert.equal(own.status, "in_review");
  assert.deepEqual(own.history.map((event) => event.status), ["requested", "in_review"]);
  assert.ok(!JSON.stringify(own).includes("staff-admin"));
  for (const action of ["complete", "completed", "delete"]) assert.equal((await f.staffCall("PATCH", { action, id })).status, 400);
  assert.equal((await f.call("PATCH", { action: "cancel", id })).status, 200);
  assert.equal((await f.staffCall("PATCH", { action: "review", id })).status, 409);
  assert.equal((await (await f.staffCall()).json()).requests.length, 0);
  assert.equal((await (await f.staffCall("GET", null, { query: "?status=cancelled" })).json()).requests.length, 1);
});

test("audit failure rolls back request creation and staff review", async (t) => {
  const f = await fixture(t);
  f.database.exec("CREATE TRIGGER fail_user_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.equal((await f.call("POST", { confirm: true })).status, 503);
  assert.equal(f.count("account_deletion_requests"), 0);
  assert.equal(f.count("account_deletion_events"), 0);
  f.database.exec("DROP TRIGGER fail_user_audit");
  const id = (await (await f.call("POST", { confirm: true })).json()).request.id;
  f.database.exec("CREATE TRIGGER fail_staff_audit BEFORE INSERT ON staff_audit_logs BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.equal((await f.staffCall("PATCH", { action: "review", id })).status, 503);
  assert.equal(f.database.prepare("SELECT status FROM account_deletion_requests").get().status, "requested");
  assert.equal(f.count("account_deletion_events"), 1);
});

test("staff queue pagination is bounded and has no duplicates at identical timestamps", async (t) => {
  const f = await fixture(t);
  const stamp = "2026-09-05T10:00:00.000Z";
  for (let index = 0; index < 53; index++) {
    f.database.prepare("INSERT INTO account_deletion_requests (id, user_email, status, created_at, updated_at) VALUES (?, 'author@test.local', 'cancelled', ?, ?)")
      .run(`request-${String(index).padStart(3, "0")}`, stamp, stamp);
  }
  const first = await (await f.staffCall("GET", null, { query: "?status=cancelled" })).json();
  assert.equal(first.requests.length, 50);
  assert.ok(first.nextCursor);
  const second = await (await f.staffCall("GET", null, { query: `?status=cancelled&before=${encodeURIComponent(first.nextCursor)}` })).json();
  assert.equal(second.requests.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.requests, ...second.requests].map((request) => request.id)).size, 53);
  assert.equal((await f.staffCall("GET", null, { query: "?status=completed" })).status, 400);
  assert.equal((await f.staffCall("GET", null, { query: "?before=invalid" })).status, 400);
  assert.equal((await (await f.call()).json()).requests.length, 20);
});

test("request creation rate limiting returns Retry-After without changing the existing request", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 6; index++) assert.ok((await f.call("POST", { confirm: true })).ok);
  const limited = await f.call("POST", { confirm: true });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(f.count("account_deletion_requests"), 1);
});

test("public page renders an accessible login and explains that requesting deletion does not execute it", async () => {
  const style = { default: new Proxy({}, { get: (_, key) => String(key) }) };
  const panel = load("app/account-deletion/request-panel.tsx", { react: React, "./account-deletion.module.css": style });
  const page = load("app/account-deletion/page.tsx", {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "../chatgpt-auth": { getChatGPTUser: async () => null }, "./request-panel": panel, "./account-deletion.module.css": style,
  });
  const html = renderToStaticMarkup(await page.default());
  assert.match(html, /Hesap ve veri silme talebi/);
  assert.match(html, /href="#request-status"/);
  assert.match(html, /id="request-status"/);
  assert.match(html, /name="email"/);
  assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /hesabın ve verilerin hemen silinmez/);
  assert.doesNotMatch(html, /Hesabın silindi|24 saat|30 gün/);
});
