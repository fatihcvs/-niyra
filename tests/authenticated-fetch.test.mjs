import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/authenticated-fetch.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, DOMException });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("active 401 expires once before parallel replies, without consuming or replacing Response/body/options", async () => {
  const pending = [], calls = [];
  const scope = exports.createAuthenticatedFetchScope((input, init) => { const task = deferred(); pending.push(task); calls.push({ input, init }); return task.promise; });
  let expired = 0;
  scope.setSessionExpiredHandler(() => { expired++; }); scope.activate("owner-a:1");
  const options = { method: "POST", body: "unchanged", credentials: "same-origin", headers: { "content-type": "text/plain" } };
  const first = scope.fetch("/api/example", options), second = scope.fetch("/api/other").catch((error) => error);
  const response = Response.json({ error: "Oturum gerekli" }, { status: 401 });
  pending[0].resolve(response);
  assert.equal(await first, response); assert.equal(response.bodyUsed, false);
  assert.equal(calls[0].init, options); assert.equal(expired, 1);
  assert.deepEqual(await response.json(), { error: "Oturum gerekli" });
  pending[1].resolve(Response.json({}, { status: 401 }));
  assert.equal((await second).name, "AbortError"); assert.equal(expired, 1);
});

test("owner changes, explicit cancellation and unmount fence old 401 responses including non-fetch checks", async () => {
  const pending = [];
  const scope = exports.createAuthenticatedFetchScope(() => { const task = deferred(); pending.push(task); return task.promise; });
  let expired = 0;
  scope.setSessionExpiredHandler(() => { expired++; }); scope.activate("owner-a:1");
  const old = scope.fetch("/api/a").catch((error) => error);
  const oldXHR = scope.fetch.beginResponseCheck();
  scope.deactivate(); scope.activate("owner-b:2");
  pending[0].resolve(new Response(null, { status: 401 }));
  assert.equal((await old).name, "AbortError"); assert.equal(oldXHR.accept(401), false); assert.equal(expired, 0);
  const abort = new AbortController();
  const cancelled = scope.fetch("/api/b", { signal: abort.signal }).catch((error) => error);
  abort.abort(); pending[1].resolve(new Response(null, { status: 401 }));
  assert.equal((await cancelled).name, "AbortError"); assert.equal(expired, 0);
  const late = scope.fetch("/api/c").catch((error) => error); scope.deactivate(); pending[2].resolve(new Response(null, { status: 401 }));
  assert.equal((await late).name, "AbortError"); assert.equal(expired, 0);
  await assert.rejects(scope.fetch("/api/closed"), { name: "AbortError" }); assert.equal(pending.length, 3);
  scope.activate("");
  const anonymous = scope.fetch("/api/no-provider"); pending[3].resolve(new Response(null, { status: 401 }));
  assert.equal((await anonymous).status, 401); assert.equal(expired, 0, "Standalone error semantics remain available without inventing an owner");
});
