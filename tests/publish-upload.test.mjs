import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";

const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const upload = {};
const attempts = {};
runInNewContext(await compile("../lib/publish-attempt.ts"), { exports: attempts, require: secureRandomKeyDependency });
runInNewContext(await compile("../lib/publish-upload.ts"), {
  exports: upload, FormData, XMLHttpRequest: class { constructor() { throw new Error("A real network request is forbidden in this test"); } },
  fetch() { throw new Error("Upload must use XHR transport, not fetch"); },
  require(name) { assert.equal(name, "./publish-attempt"); return attempts; },
});
const { sendPublishUpload, PublishUploadError } = upload;

class FakeXHR extends EventTarget {
  upload = new EventTarget();
  status = 0;
  responseText = "";
  responseHeaders = new Headers();
  headers = new Headers();
  body = undefined;
  sent = 0;
  aborted = 0;
  open(method, url, async) { this.opened = { method, url, async }; }
  setRequestHeader(name, value) { this.headers.set(name, value); }
  getResponseHeader(name) { return this.responseHeaders.get(name); }
  send(body) { this.body = body; this.sent++; }
  abort() { this.aborted++; this.dispatchEvent(new Event("abort")); }
  progress(loaded, total = 0, lengthComputable = false) {
    const event = new Event("progress");
    Object.assign(event, { loaded, total, lengthComputable });
    this.upload.dispatchEvent(event);
  }
  reply(status, data, headers = {}) {
    this.status = status;
    this.responseText = typeof data === "string" ? data : JSON.stringify(data);
    this.responseHeaders = new Headers(headers);
    this.dispatchEvent(new Event("load"));
  }
}

const draft = { content: "Campus message", audience: "platform", courseId: null, media: null };
const attempt = (overrides = {}) => ({ key: "draft-attempt-001", draft: { ...draft, ...overrides } });
const plain = (value) => JSON.parse(JSON.stringify(value));
const assertClean = (xhr, signal) => {
  for (const type of ["load", "error", "timeout", "abort"]) assert.equal(getEventListeners(xhr, type).length, 0, type);
  for (const type of ["progress", "load"]) assert.equal(getEventListeners(xhr.upload, type).length, 0, `upload.${type}`);
  if (signal) assert.equal(getEventListeners(signal, "abort").length, 0, "signal.abort");
};

test("text publishing uses one same-origin asynchronous XHR with the stable key and a 20 second deadline", async () => {
  const xhr = new FakeXHR();
  const controller = new AbortController();
  const promise = sendPublishUpload(attempt(), { createXHR: () => xhr, signal: controller.signal });
  assert.deepEqual(xhr.opened, { method: "POST", url: "/api/posts", async: true });
  assert.equal(xhr.withCredentials, false); // Same-origin cookies still included by XHR.
  assert.equal(xhr.timeout, 20_000);
  assert.equal(xhr.responseType, "text");
  assert.equal(xhr.sent, 1);
  assert.equal(xhr.headers.get("Idempotency-Key"), "draft-attempt-001");
  assert.equal(xhr.headers.get("Content-Type"), "application/json");
  assert.equal(xhr.headers.get("Accept"), "application/json");
  assert.deepEqual(JSON.parse(xhr.body), { content: draft.content, audience: "platform", courseId: null });
  xhr.reply(201, { post: { id: "post-1" } }, { "Idempotency-Replayed": "true" });
  assert.deepEqual(plain(await promise), { status: 201, ok: true, data: { post: { id: "post-1" } }, replayed: true });
  assertClean(xhr, controller.signal);
  controller.abort();
  assert.equal(xhr.aborted, 0);
});

test("media publishing preserves the exact File and course payload without setting a multipart boundary", async () => {
  const xhr = new FakeXHR();
  const media = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" });
  const promise = sendPublishUpload(attempt({ content: "", audience: "campus", courseId: "course-a", media }), { createXHR: () => xhr });
  assert.equal(xhr.timeout, 30_000);
  assert.equal(xhr.headers.has("Content-Type"), false);
  assert.ok(xhr.body instanceof FormData);
  assert.equal(xhr.body.get("content"), "");
  assert.equal(xhr.body.get("audience"), "campus");
  assert.equal(xhr.body.get("courseId"), "course-a");
  assert.equal(xhr.body.get("media"), media);
  assert.deepEqual([...new Uint8Array(await xhr.body.get("media").arrayBuffer())], [1, 2, 3, 4]);
  xhr.reply(201, { post: { id: "photo-post" } });
  assert.equal((await promise).data.post.id, "photo-post");
  assertClean(xhr);
});

test("multipart retry sends every original photo in its immutable order after the first response is lost", async () => {
  const photos = [3, 1, 2].map((index) => new File([new Uint8Array([index])], `${index}.png`, { type: "image/png" }));
  const state = attempts.createPublishAttempt(() => "multi-upload-001");
  const original = state.begin({ ...draft, media: photos[0], mediaFiles: photos });
  const first = new FakeXHR();
  const pending = sendPublishUpload(original, { createXHR: () => first });
  first.dispatchEvent(new Event("error"));
  await assert.rejects(pending, { kind: "network" });
  state.failed();
  photos.reverse();
  const retry = new FakeXHR();
  const next = sendPublishUpload(state.begin({ ...draft, media: null, mediaFiles: [] }), { createXHR: () => retry });
  assert.equal(retry.headers.get("Idempotency-Key"), first.headers.get("Idempotency-Key"));
  assert.deepEqual(retry.body.getAll("media").map((file) => file.name), ["3.png", "1.png", "2.png"]);
  assert.deepEqual(retry.body.getAll("media"), first.body.getAll("media"));
  retry.reply(201, { post: { id: "ordered-post" } }, { "Idempotency-Replayed": "true" });
  assert.equal((await next).replayed, true);
  assertClean(first); assertClean(retry);
});

test("progress reports actual request-body bytes; unknown totals stay indeterminate and upload 100 percent waits for the server", async () => {
  const xhr = new FakeXHR();
  const updates = [];
  let finished = false;
  const promise = sendPublishUpload(attempt(), { createXHR: () => xhr, onProgress: (value) => updates.push(plain(value)) });
  promise.then(() => { finished = true; });
  assert.deepEqual(updates[0], { phase: "uploading", loaded: 0, total: null, percent: null });
  xhr.progress(10);
  assert.deepEqual(updates.at(-1), { phase: "uploading", loaded: 10, total: null, percent: null });
  xhr.progress(25, 100, true);
  assert.equal(updates.at(-1).percent, 25);
  xhr.progress(99.9, 100, true);
  assert.equal(updates.at(-1).percent, 99);
  xhr.progress(100, 100, true);
  xhr.upload.dispatchEvent(new Event("load"));
  assert.deepEqual(updates.at(-1), { phase: "processing", loaded: 100, total: 100, percent: 100 });
  await Promise.resolve();
  assert.equal(finished, false);
  const count = updates.length;
  xhr.progress(25, 100, true); // A late progress event cannot move processing back to uploading.
  assert.equal(updates.length, count);
  xhr.reply(201, { post: { id: "confirmed" } });
  assert.equal((await promise).data.post.id, "confirmed");
  xhr.progress(100, 100, true);
  assert.equal(updates.length, count);
  assertClean(xhr);
});

test("unknown or invalid totals never manufacture a completion percentage", async () => {
  const xhr = new FakeXHR();
  const updates = [];
  const promise = sendPublishUpload(attempt(), { createXHR: () => xhr, onProgress: (value) => updates.push(plain(value)) });
  for (const total of [0, -1, Infinity, NaN]) {
    xhr.progress(25, total, true);
    assert.equal(updates.at(-1).total, null);
    assert.equal(updates.at(-1).percent, null);
  }
  xhr.upload.dispatchEvent(new Event("load"));
  assert.deepEqual(updates.at(-1), { phase: "processing", loaded: 25, total: null, percent: null });
  xhr.reply(201, { post: { id: "confirmed" } });
  await promise;
});

test("HTTP auth/conflict/server errors remain typed responses; malformed 2xx cannot fabricate a published post", async () => {
  for (const status of [401, 403, 409, 410, 413, 429, 503]) {
    const xhr = new FakeXHR();
    const promise = sendPublishUpload(attempt(), { createXHR: () => xhr });
    xhr.reply(status, { error: "Server explanation", code: status === 409 ? "IDEMPOTENCY_CONFLICT" : "ERROR" });
    const response = await promise;
    assert.equal(response.status, status);
    assert.equal(response.ok, false);
    assert.equal(response.data.error, "Server explanation");
    assertClean(xhr);
  }
  for (const [status, body] of [[201, "<html>proxy</html>"], [200, "null"], [401, ""], [503, "[]"]]) {
    const xhr = new FakeXHR();
    const promise = sendPublishUpload(attempt(), { createXHR: () => xhr });
    xhr.reply(status, body);
    const response = await promise;
    assert.equal(response.status, status);
    assert.equal(response.data, null);
    const state = attempts.createPublishAttempt(() => "stable-key-001");
    state.begin(draft);
    assert.equal(state.failed(response.status), status !== 401);
  }
});

test("network failure, native timeout and status zero settle once as uncertain and detach every listener", async () => {
  for (const [event, kind] of [["error", "network"], ["timeout", "timeout"], ["load", "network"], ["abort", "aborted"]]) {
    const xhr = new FakeXHR();
    const controller = new AbortController();
    const promise = sendPublishUpload(attempt(), { createXHR: () => xhr, signal: controller.signal });
    const rejection = assert.rejects(promise, (error) => error instanceof PublishUploadError && error.kind === kind && error.uncertain);
    xhr.dispatchEvent(new Event(event));
    xhr.reply(201, { post: { id: "late-response" } });
    await rejection;
    assertClean(xhr, controller.signal);
  }
});

test("external cancel after upload preserves the original payload/key; user-controlled retry can reconcile a committed post", async () => {
  let keys = 0;
  const state = attempts.createPublishAttempt(() => `attempt-key-${++keys}`);
  const media = new File(["image bytes"], "campus.png", { type: "image/png" });
  const original = state.begin({ ...draft, media });
  const first = new FakeXHR();
  const controller = new AbortController();
  const updates = [];
  const pending = sendPublishUpload(original, { createXHR: () => first, signal: controller.signal, onProgress: (value) => updates.push(value) });
  first.progress(100, 100, true);
  first.upload.dispatchEvent(new Event("load"));
  const queuedProgress = getEventListeners(first.upload, "progress")[0];
  const rejected = assert.rejects(pending, (error) => error.kind === "aborted" && error.uncertain);
  controller.abort();
  await rejected;
  assert.equal(first.aborted, 1);
  const count = updates.length;
  queuedProgress({ loaded: 10, total: 100, lengthComputable: true });
  assert.equal(updates.length, count);
  assertClean(first, controller.signal);
  assert.equal(state.failed(), true);
  const retryAttempt = state.begin({ ...draft, content: "Edited after cancellation", media: null });
  assert.equal(retryAttempt, original);
  assert.equal(retryAttempt.draft.media, media);
  assert.equal(keys, 1);
  const second = new FakeXHR();
  const retry = sendPublishUpload(retryAttempt, { createXHR: () => second });
  assert.equal(second.headers.get("Idempotency-Key"), first.headers.get("Idempotency-Key"));
  assert.equal(second.body.get("media"), first.body.get("media"));
  assert.equal(second.body.get("content"), draft.content);
  // Server idempotency/SQLite tests separately prove this committed replay never creates another post.
  second.reply(201, { post: { id: "already-committed" } }, { "Idempotency-Replayed": "true" });
  const response = await retry;
  assert.equal(response.replayed, true);
  assert.equal(response.data.post.id, "already-committed");
  state.complete();
  assert.notEqual(state.begin(draft).key, original.key);
});

test("an already-aborted signal sends nothing; abort from initial progress also prevents send", async () => {
  const controller = new AbortController();
  controller.abort();
  let created = 0;
  await assert.rejects(sendPublishUpload(attempt(), { signal: controller.signal, createXHR: () => { created++; return new FakeXHR(); } }), { kind: "aborted" });
  assert.equal(created, 0);
  const next = new AbortController();
  const xhr = new FakeXHR();
  await assert.rejects(sendPublishUpload(attempt(), { signal: next.signal, createXHR: () => xhr, onProgress: () => next.abort() }), { kind: "aborted" });
  assert.equal(xhr.sent, 0);
  assert.equal(xhr.aborted, 1);
  assertClean(xhr, next.signal);
});

test("setup exceptions and invalid keys send no alternative request; observer errors cannot strand a valid upload", async () => {
  for (const method of ["open", "setRequestHeader", "send"]) {
    const xhr = new FakeXHR();
    const controller = new AbortController();
    xhr[method] = () => { throw new Error("Injected browser failure"); };
    await assert.rejects(sendPublishUpload(attempt(), { signal: controller.signal, createXHR: () => xhr }), { kind: "setup", uncertain: true });
    assert.equal(xhr.aborted, 1);
    assertClean(xhr, controller.signal);
  }
  let created = 0;
  await assert.rejects(sendPublishUpload({ ...attempt(), key: "invalid key" }, { createXHR: () => { created++; return new FakeXHR(); } }), { kind: "setup" });
  assert.equal(created, 0);
  const xhr = new FakeXHR();
  const promise = sendPublishUpload(attempt(), { createXHR: () => xhr, onProgress() { throw new Error("UI unmounted"); } });
  assert.equal(xhr.sent, 1);
  xhr.progress(25, 100, true);
  xhr.reply(201, { post: { id: "confirmed" } });
  assert.equal((await promise).data.post.id, "confirmed");
  assertClean(xhr);
});
