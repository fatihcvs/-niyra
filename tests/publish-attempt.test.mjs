import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { secureRandomKeyDependency } from "./helpers/secure-random-key.mjs";
const context = { exports: {}, require: secureRandomKeyDependency };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/publish-attempt.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const draft = { content: "A", audience: "platform", courseId: null, media: null };
test("network/5xx retries retain the exact original payload, file and key", () => {
  for (const status of [undefined, 200, 201, 503, 500, 409]) {
    let sequence = 0;
    const state = context.exports.createPublishAttempt(() => `key-${++sequence}`);
    const file = { name: "photo.jpg" };
    const first = state.begin({ ...draft, media: file });
    assert.equal(state.failed(status), true);
    const retry = state.begin({ ...draft, content: "edited meanwhile", media: null });
    assert.equal(retry, first);
    assert.equal(retry.draft.content, "A");
    assert.equal(retry.draft.media, file);
    assert.equal(sequence, 1);
  }
});
test("known rejections allow correction, while success/logout start a new attempt", () => {
  let sequence = 0;
  const state = context.exports.createPublishAttempt(() => `key-${++sequence}`);
  for (const status of [400, 401, 403, 410, 413, 415, 422, 429]) {
    const previous = state.begin(draft);
    assert.equal(state.failed(status), false);
    assert.notEqual(state.begin({ ...draft, content: "corrected" }).key, previous.key);
    state.complete();
  }
  state.begin(draft); state.failed(); state.reset();
  assert.equal(state.begin({ ...draft, content: "new account" }).draft.content, "new account");
});

test("a later auth/quota/validation rejection cannot discard an earlier uncertain publication", () => {
  for (const status of [400, 401, 403, 410, 413, 415, 422, 429]) {
    let sequence = 0;
    const state = context.exports.createPublishAttempt(() => `key-${++sequence}`);
    const media = { name: "original-photo.jpg" };
    const original = state.begin({ ...draft, media });
    assert.equal(state.failed(), true);
    assert.equal(state.failed(status), true);
    const retried = state.begin({ ...draft, content: "modified after lost reply", media: null });
    assert.equal(retried, original);
    assert.equal(retried.draft.media, media);
    assert.equal(retried.draft.content, draft.content);
    assert.equal(sequence, 1);
    state.complete();
    assert.notEqual(state.begin(draft).key, original.key);
  }
});

test("snapshot/resume keeps the original file and treats interrupted persisted attempts as uncertain", () => {
  const file = { name: "same-file.jpg" };
  const state = context.exports.createPublishAttempt(() => "original-key-001");
  const first = state.begin({ ...draft, media: file });
  const snapshot = state.snapshot();
  snapshot.draft.content = "Snapshot mutation";
  assert.equal(state.snapshot().draft.content, draft.content);
  assert.equal(state.snapshot().draft.media, file);
  const next = context.exports.createPublishAttempt(() => "unexpected-new-key");
  assert.equal(next.resume({ ...first, key: "bad key" }), false);
  assert.equal(next.resume(state.snapshot()), true);
  assert.equal(next.resume(state.snapshot()), false);
  const restored = next.begin({ ...draft, content: "New text" });
  assert.equal(restored.key, first.key);
  assert.equal(restored.draft.content, draft.content);
  assert.equal(restored.draft.media, file);
  assert.equal(restored.uncertain, true);
  assert.equal(next.failed(401), true);
});

test("ordered multi-photo attempts cannot be changed through an input array or returned snapshot during an uncertain retry", () => {
  const photos = [{ name: "first.png" }, { name: "second.png" }, { name: "third.png" }];
  const state = context.exports.createPublishAttempt(() => "ordered-attempt-01");
  const original = state.begin({ ...draft, media: photos[0], mediaFiles: photos });
  photos.reverse();
  assert.deepEqual(Array.from(original.draft.mediaFiles, (file) => file.name), ["first.png", "second.png", "third.png"]);
  assert.throws(() => original.draft.mediaFiles.reverse(), { name: "TypeError" });
  const snapshot = state.snapshot();
  snapshot.draft.mediaFiles.splice(0, 1);
  state.failed();
  const retry = state.begin({ ...draft, media: null, mediaFiles: [] });
  assert.equal(retry, original);
  assert.equal(retry.draft.mediaFiles.length, 3);
  const resumed = context.exports.createPublishAttempt();
  resumed.resume(state.snapshot());
  assert.deepEqual(Array.from(resumed.begin(draft).draft.mediaFiles, (file) => file.name), ["first.png", "second.png", "third.png"]);
});
