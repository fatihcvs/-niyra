import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Home");
const handler = home.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "signOut");
assert.ok(handler, "Exercise the actual Home logout handler");
const compiled = ts.transpileModule(`${handler.getText(ast)}\nglobalThis.signOut = signOut;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture({ sessionOk = true, publish, market, push } = {}) {
  const events = [], errors = [], signingOut = { current: false };
  let nativeFileCancellations = 0;
  const context = {
    signingOut, Error, Promise,
    fetch: async () => { events.push("session-delete"); return { ok: sessionOk }; },
    durableDraft: { logout: () => { events.push("publish-clear"); return publish ?? Promise.resolve({ status: "cleared" }); } },
    clearMarketDraftsOnLogout: () => { events.push("market-clear"); return market ?? Promise.resolve({ status: "cleared" }); },
    clearNativeFiles: () => { nativeFileCancellations++; return Promise.resolve(); },
    clearPushNotificationsOnLogout: () => { events.push("push-clear"); return push ?? Promise.resolve({ cleared: true }); },
    expireSession: () => events.push("session-expired"),
    setSessionError: (value) => errors.push(value),
    setComposerExpanded() {}, setStudentProfile() {}, setIdentityName() {}, setPosts() {}, setPeople() {}, setProfileState() {},
    window: { location: { hostname: "localhost" } },
  };
  runInNewContext(compiled, context);
  return { events, errors, signingOut, signOut: context.signOut, nativeFileCancellations: () => nativeFileCancellations };
}

test("explicit logout waits for private drafts and push cleanup and ignores repeated clicks", async () => {
  const publish = deferred(), market = deferred(), push = deferred();
  const f = fixture({ publish: publish.promise, market: market.promise, push: push.promise });
  const pending = f.signOut(); await Promise.resolve();
  await f.signOut();
  assert.deepEqual(f.events, ["session-delete", "publish-clear", "market-clear", "push-clear"]);
  publish.resolve({ status: "cleared" }); await Promise.resolve();
  assert.equal(f.events.includes("session-expired"), false);
  market.resolve({ status: "cleared" }); await Promise.resolve();
  assert.equal(f.events.includes("session-expired"), false);
  push.resolve({ cleared: true }); await pending;
  assert.equal(f.events.at(-1), "session-expired");
  assert.equal(f.signingOut.current, false);
  assert.equal(f.nativeFileCancellations(), 1);
});

test("failed Market erasure is disclosed after session logout even when post drafts clear", async () => {
  const f = fixture({ market: Promise.resolve({ status: "unavailable", reason: "denied" }) });
  await f.signOut();
  assert.deepEqual(f.events, ["session-delete", "publish-clear", "market-clear", "push-clear", "session-expired"]);
  assert.match(f.errors.at(-1), /cihazdaki taslaklar temizlenemedi/);
});

test("device notification cleanup failure never keeps a revoked account signed in", async () => {
  const f = fixture({ push: Promise.resolve().then(() => { throw new Error("Storage denied"); }) });
  await f.signOut();
  assert.equal(f.events.at(-1), "session-expired");
  assert.match(f.errors.at(-1), /eski bildirimleri elle/);
  assert.equal(f.signingOut.current, false);
  assert.equal(f.nativeFileCancellations(), 1);
});

test("failed session logout retains drafts and allows a later retry", async () => {
  const f = fixture({ sessionOk: false }); await f.signOut();
  assert.deepEqual(f.events, ["session-delete"]);
  assert.equal(f.signingOut.current, false);
  assert.equal(f.nativeFileCancellations(), 1);
  assert.match(f.errors.at(-1), /Çıkış tamamlanamadı/);
});
