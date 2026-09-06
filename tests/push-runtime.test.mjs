import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { workerSecrets, serializeSecrets, startPushPump, runRailway } from "../scripts/push/railway-run.mjs";

function load(relative, dependencies) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: (id) => {
    assert.ok(id in dependencies, `Unstubbed dependency ${id}`); return dependencies[id];
  }, Request, Response, URL, TextEncoder, Uint8Array, crypto, console });
  return exports;
}
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("internal dispatcher requires exact strong bearer credential and ignores URL secrets", async () => {
  const { pushDispatchAuthorized } = load("../lib/push-runtime.ts", { "./push-config": {}, "./push-delivery": {} });
  const secret = "a".repeat(43);
  assert.equal(await pushDispatchAuthorized(new Request("https://app.test/__internal/push-dispatch", { headers: { Authorization: `Bearer ${secret}` } }), secret), true);
  for (const authorization of ["", `Bearer ${"b".repeat(43)}`, secret, `Basic ${secret}`, `Bearer ${secret}more`]) {
    assert.equal(await pushDispatchAuthorized(new Request(`https://app.test/__internal/push-dispatch?secret=${secret}`, { headers: { Authorization: authorization } }), secret), false);
  }
  assert.equal(await pushDispatchAuthorized(new Request("https://app.test"), undefined), false);
});

test("disabled config never queries database and request bursts share one dispatch until completion", async () => {
  const pending = deferred(), calls = [];
  const { runPushDispatch } = load("../lib/push-runtime.ts", {
    "./push-config": { getPushConfig: (env) => ({ web: env.enabled ? {} : null, fcm: null }) },
    "./push-delivery": { dispatchPushOutbox: (...args) => { calls.push(args); return pending.promise; } },
  });
  const DB = {};
  assert.equal((await runPushDispatch({ DB })).disabled, 1);
  assert.equal(calls.length, 0);
  const first = runPushDispatch({ DB, enabled: true }, 2), second = runPushDispatch({ DB, enabled: true }, 4);
  assert.equal(first, second); assert.equal(calls.length, 1);
  pending.resolve({ sent: 1 }); await first;
  await runPushDispatch({ DB, enabled: true }, 4); assert.equal(calls.length, 2);
});

test("worker dispatch runs after successful mutations without delaying response; cron and internal retries work", async () => {
  const pending = deferred(), waits = [], calls = [];
  let allowed = false, routed = 0;
  const worker = load("../worker/index.ts", {
    "vinext/server/image-optimization": {},
    "vinext/server/app-router-entry": { default: { fetch: async () => { routed++; return new Response("ok"); } }, __esModule: true },
    "../lib/push-runtime": { pushDispatchAuthorized: async () => allowed, runPushDispatch: (env, limit) => { calls.push(limit); return pending.promise; }, reportPushDispatchFailure() {} },
  }).default;
  const context = { waitUntil: (value) => waits.push(value) };
  assert.equal((await worker.fetch(new Request("https://app.test/api/comments", { method: "POST" }), {}, context)).status, 200);
  assert.equal(calls[0], 2); assert.equal(waits.length, 1);
  await worker.fetch(new Request("https://app.test/api/comments"), {}, context); assert.equal(calls.length, 1);
  assert.equal((await worker.fetch(new Request("https://app.test/__internal/push-dispatch", { method: "POST" }), {}, context)).status, 404);
  assert.equal(routed, 2); assert.equal(calls.length, 1);
  allowed = true;
  assert.equal((await worker.fetch(new Request("https://app.test/__internal/push-dispatch"), {}, context)).status, 404);
  const internal = worker.fetch(new Request("https://app.test/__internal/push-dispatch", { method: "POST" }), {}, context);
  pending.resolve({ sent: 1 }); assert.equal((await internal).status, 200); assert.equal(calls.at(-1), 4);
  await worker.scheduled({}, {}, context); assert.equal(calls.at(-1), 20);
  await Promise.all(waits);
});

test("Railway binds only allowlisted configuration using a private env file, never CLI secret values", () => {
  const values = workerSecrets({ FCM_PROJECT_ID: "kampira-ac5a2", FCM_PRIVATE_KEY: "test\nkey", UNRELATED_PASSWORD: "excluded" });
  assert.equal(values.UNRELATED_PASSWORD, undefined);
  assert.match(values.PUSH_JOB_SECRET, /^[A-Za-z0-9_-]{43}$/);
  assert.match(serializeSecrets(values), /FCM_PRIVATE_KEY="test\\nkey"/);
  assert.throws(() => workerSecrets({ PUSH_JOB_SECRET: "short" }));
  assert.equal(workerSecrets({ FCM_PRIVATE_KEY: "test\\nkey" }).FCM_PRIVATE_KEY, "test\nkey");
  assert.equal(serializeSecrets(workerSecrets({ FCM_PRIVATE_KEY: "test\\nkey", PUSH_JOB_SECRET: "a".repeat(43) })), serializeSecrets(workerSecrets({ FCM_PRIVATE_KEY: "test\nkey", PUSH_JOB_SECRET: "a".repeat(43) })));
});

test("Railway supervisor passes a private env file, forces its loading and removes it after graceful child exit", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kampira-push-supervisor-"));
  const signals = new EventEmitter(), spawned = deferred(), child = new EventEmitter();
  const kills = []; let stopped = 0, captured, pump;
  child.kill = (signal) => { kills.push(signal); queueMicrotask(() => child.emit("exit", 0, signal)); return true; };
  try {
    const task = runRailway({ UNIYRA_DATA_DIR: directory, PORT: "5190", FCM_PRIVATE_KEY: "synthetic\\nprivate-key", PUSH_JOB_SECRET: "s".repeat(43), CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" }, {
      processObject: signals,
      spawnImpl(command, args, options) { captured = { command, args, options }; spawned.resolve(); return child; },
      pumpFactory(options) { pump = options; return () => { stopped++; }; },
    });
    await spawned.promise;
    const file = captured.args[captured.args.indexOf("--env-file") + 1];
    assert.ok(path.resolve(file).startsWith(path.resolve(directory) + path.sep));
    assert.equal(captured.options.env.CLOUDFLARE_INCLUDE_PROCESS_ENV, "false");
    assert.equal(captured.options.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, "true");
    assert.equal(captured.options.windowsHide, true); assert.ok(!captured.args.join(" ").includes("synthetic")); assert.ok(!captured.args.includes("s".repeat(43)));
    const contents = await readFile(file, "utf8"); assert.match(contents, /FCM_PRIVATE_KEY="synthetic\\nprivate-key"/);
    assert.equal(pump.origin, "http://127.0.0.1:5190");
    signals.emit("SIGTERM"); assert.equal(await task, 0); assert.deepEqual(kills, ["SIGTERM"]); assert.ok(stopped >= 1);
    assert.deepEqual(await readdir(directory), []); assert.equal(signals.listenerCount("SIGTERM"), 0); assert.equal(signals.listenerCount("SIGINT"), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Railway supervisor removes its private file if process startup fails", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kampira-push-supervisor-failure-"));
  const signals = new EventEmitter();
  try {
    await assert.rejects(runRailway({ UNIYRA_DATA_DIR: directory, PORT: "5190" }, { processObject: signals, spawnImpl() { throw new Error("injected spawn failure"); } }));
    assert.deepEqual(await readdir(directory), []); assert.equal(signals.listenerCount("SIGTERM"), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Railway pump retries with all clients closed, never overlaps and cancels on shutdown", async () => {
  const calls = [], pending = deferred();
  const stop = startPushPump({ origin: "http://127.0.0.1:5189", secret: "test-secret", intervalMs: 5, timeoutMs: 1000,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return pending.promise; } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 35)); assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, "Bearer test-secret");
    assert.equal(calls[0].options.redirect, "error");
    stop(); assert.equal(calls[0].options.signal.aborted, true);
    pending.resolve(new Response(null, { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(calls.length, 1);
  } finally { stop(); }
  assert.throws(() => startPushPump({ origin: "https://external.example", secret: "test" }));
});
