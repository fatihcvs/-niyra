import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { loadSecureRandomKey } from "./helpers/secure-random-key.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function load(path, helper) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require(name) { assert.equal(name, "./secure-random-key"); return helper; } });
  return exports;
}

test("publication and DM default keys work with LAN HTTP crypto without randomUUID and keep retry keys", () => {
  let calls = 0;
  const browserCrypto = { getRandomValues(bytes) { calls++; return crypto.getRandomValues(bytes); } };
  assert.equal(browserCrypto.randomUUID, undefined);
  const helper = loadSecureRandomKey({ window: { crypto: browserCrypto } });
  const post = load("../lib/publish-attempt.ts", helper).createPublishAttempt();
  const draft = { content: "LAN post", audience: "platform", courseId: null, media: null };
  const first = post.begin(draft); assert.match(first.key, uuid);
  post.failed(); assert.equal(post.begin({ ...draft, content: "Changed" }).key, first.key);
  const messages = load("../lib/message-drafts.ts", helper).createMessageSessionState();
  messages.setOwnerScope("owner");
  messages.saveSession("owner", { selected: { conversationId: null, person: { publicId: "recipient" } } });
  const message = messages.beginSend("owner", "recipient", "LAN message", null);
  assert.match(message.key, uuid); assert.notEqual(message.key, first.key);
  messages.failSend("owner", "recipient", message.key, "Lost response");
  assert.equal(messages.beginSend("owner", "recipient", "LAN message", null).key, message.key);
  assert.equal(calls, 2);
});

test("secure keys preserve UUID v4 version and variant bits without losing the random payload", () => {
  const helper = loadSecureRandomKey({ crypto: { getRandomValues(bytes) { return bytes.fill(255); } } });
  assert.equal(helper.createSecureRandomKey(), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.match(loadSecureRandomKey().createSecureRandomKey(), uuid);
  assert.throws(() => loadSecureRandomKey({}).createSecureRandomKey(), /getRandomValues/);
});
