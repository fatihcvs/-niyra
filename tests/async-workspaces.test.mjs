import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(name) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, AbortController });
  return exports;
}
const { createLatestRequest } = load("latest-request");
const { shouldFollowMessages, mergeMessages } = load("message-scroll");

test("a delayed response cannot replace the next conversation or a closed dialog", async () => {
  const scope = createLatestRequest();
  let displayed = "";
  let resolveOld;
  const old = scope.begin();
  const pending = new Promise((resolve) => { resolveOld = resolve; }).then(() => { if (old.isCurrent()) displayed = "old"; });
  const next = scope.begin();
  assert.equal(old.signal.aborted, true);
  if (next.isCurrent()) displayed = "next";
  resolveOld();
  await pending;
  assert.equal(displayed, "next");
  scope.cancel();
  assert.equal(next.isCurrent(), false);
  assert.equal(next.signal.aborted, true);
  assert.equal(scope.begin().isCurrent(), true);
});

test("polling read receipts and times preserves the reader's scroll position", () => {
  const snapshot = { conversationId: "a", lastMessageId: "m1" };
  assert.equal(shouldFollowMessages(snapshot, snapshot, true), false);
  assert.equal(shouldFollowMessages(snapshot, snapshot, false), false);
  const incoming = { conversationId: "a", lastMessageId: "m2" };
  assert.equal(shouldFollowMessages(snapshot, incoming, false), false);
  assert.equal(shouldFollowMessages(snapshot, incoming, true), true);
  assert.equal(shouldFollowMessages(snapshot, incoming, false, true), true);
  assert.equal(shouldFollowMessages(snapshot, { conversationId: "b", lastMessageId: "b1" }, false), true);
});

test("an initial thread follows its first messages but an empty poll never scrolls", () => {
  const empty = { conversationId: "a", lastMessageId: null };
  assert.equal(shouldFollowMessages(empty, empty, true), false);
  assert.equal(shouldFollowMessages(empty, { ...empty, lastMessageId: "m1" }, false), true);
});

test("history and polling merge without losing old messages, new sends or updated receipts", () => {
  const message = (id, read = false) => ({ id, createdAt: "2026-09-05T12:00:00.000Z", read });
  const current = [message("a"), message("b"), message("d")];
  const next = mergeMessages(current, [message("b", true), message("c")]);
  assert.equal(next.map((item) => item.id).join(","), "a,b,c,d");
  assert.equal(next[1].read, true);
  assert.equal(current[1].read, false);
});
