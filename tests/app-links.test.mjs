import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/app-links.ts", import.meta.url), "utf8");
function harness() {
  const calls = [];
  const window = { location: new URL("https://kampira.example/?feed=campus"), history: { state: { kampiraDepth: 2 } }, dispatchEvent: (event) => calls.push(["event", event]) };
  const context = { exports: {}, URL, Set, window, PopStateEvent: class { constructor(type, props) { this.type = type; Object.assign(this, props); } }, require: (path) => path.includes("workspace-navigation") ? { workspaceRoutes: { Notlar: "notes", Topluluklar: "communities", Eşleş: "match" } } : { pushAppLocation: (href) => calls.push(["push", href]) } };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context.exports, calls, window };
}
test("only supported same-origin application targets enter client history", () => {
  const { appLocationFor } = harness();
  const origin = "https://kampira.example/";
  for (const href of ["/?profile=student", "/?post=42", "/?view=notes&course=long", "/?view=communities&community=42", "/?view=notes&note=a%26b", "/?view=communities&communityEvent=old", "/?view=match&meetup=one%26two"]) assert.equal(appLocationFor(href, origin), href);
  for (const href of ["https://elsewhere.example/?profile=a", "/api/notes/file?id=42", "/legal#help", "/?view=unknown", "/?token=secret", "javascript:alert(1)", "https://user:password@kampira.example/", "/#help"]) assert.equal(appLocationFor(href, origin), null, href);
});
test("modified clicks, cancelled clicks, external targets and downloads retain browser behavior", () => {
  const { isPlainLinkActivation } = harness();
  const event = { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(isPlainLinkActivation(event), true);
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"]) assert.equal(isPlainLinkActivation({ ...event, [key]: true }), false);
  assert.equal(isPlainLinkActivation({ ...event, button: 1 }), false);
  assert.equal(isPlainLinkActivation(event, "_blank"), false);
  for (const download of [true, "", "notes.pdf"]) assert.equal(isPlainLinkActivation(event, "_self", download), false);
});
test("a client transition creates one history entry and informs all URL consumers", () => {
  const h = harness();
  assert.equal(h.navigateAppHref("/?profile=student"), true);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0], ["push", "/?profile=student"]);
  assert.equal(h.calls[1][1].type, "popstate");
  assert.equal(h.calls[1][1].state, h.window.history.state);
  h.calls.length = 0;
  assert.equal(h.navigateAppHref("/?feed=campus"), true);
  assert.equal(h.navigateAppHref("/api/notes/file?id=42"), false);
  assert.equal(h.calls.length, 0);
});
