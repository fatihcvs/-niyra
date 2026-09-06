import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Home");
const effects = home.body.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(syntax) === "useEffect").map((node) => node.expression);
const publicEffect = effects.find((node) => node.arguments[0].getText(syntax).includes("async function loadPublicProfile"));
const authEffect = effects.find((node) => node.arguments[0].getText(syntax).includes("async function loadProfile()"));
const latestContext = { exports: {}, AbortController };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/latest-request.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, latestContext);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
  const pending = [];
  const state = { profile: null, error: "", loading: false, nav: "Akış" };
  const context = {
    URLSearchParams, Error, profileState: "ready", studentProfile: { publicId: "own" }, window: { location: new URL("https://kampira.example/?profile=A") },
    publicProfileRequest: { current: latestContext.exports.createLatestRequest() },
    setPublicProfile: (value) => { state.profile = value; }, setFollowError: (value) => { state.error = value; }, setPublicProfileLoading: (value) => { state.loading = value; }, setActiveNav: (value) => { state.nav = value; },
    authenticatedFetch: (url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })),
  };
  const run = () => { runInNewContext(ts.transpileModule(`globalThis.run = ${publicEffect.arguments[0].getText(syntax)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context); return context.run(); };
  return { state, context, pending, run };
}
test("workspace history changes cannot trigger an auth bootstrap request", () => {
  assert.equal(authEffect.arguments[1].getText(syntax), "[sessionRevision]");
});
test("late A response cannot replace B even if transport ignores abort", async () => {
  const h = harness();
  h.run();
  h.context.window.location = new URL("https://kampira.example/?profile=B");
  h.run();
  assert.equal(h.pending[0].options.signal.aborted, true);
  h.pending[1].resolve({ ok: true, json: async () => ({ person: { publicId: "B" } }) });
  await flush();
  h.pending[0].resolve({ ok: true, json: async () => ({ person: { publicId: "A" } }) });
  await flush();
  assert.equal(h.state.profile.publicId, "B");
  assert.equal(h.state.loading, false);
});
test("leaving a profile before response suppresses its data, error and loading completion", async () => {
  const h = harness();
  const cleanup = h.run();
  h.context.window.location = new URL("https://kampira.example/?view=notes");
  cleanup();
  h.pending[0].reject(new Error("stale error"));
  await flush();
  assert.equal(h.state.profile, null);
  assert.equal(h.state.error, "");
});
test("own profile resolves locally and current missing profile has a recoverable error", async () => {
  const h = harness();
  h.context.window.location = new URL("https://kampira.example/?profile=own");
  h.run();
  assert.equal(h.pending.length, 0);
  h.context.window.location = new URL("https://kampira.example/?profile=missing");
  h.run();
  h.pending[0].resolve({ ok: false, json: async () => ({ error: "Öğrenci bulunamadı." }) });
  await flush();
  assert.equal(h.state.loading, false);
  assert.equal(h.state.profile, null);
  assert.equal(h.state.error, "Öğrenci bulunamadı.");
});
