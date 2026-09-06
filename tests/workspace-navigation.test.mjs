import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const exports = {};
const source = await readFile(new URL("../lib/workspace-navigation.ts", import.meta.url), "utf8");
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URLSearchParams });
const { workspaceHref, workspaceFromSearch, matchesSearch, notificationHref } = exports;

test("workspace addresses survive reload and reject unknown destinations", () => {
  for (const name of Object.keys(exports.workspaceRoutes)) {
    assert.equal(workspaceFromSearch(new URL(workspaceHref(name), "https://campus.test").search), name);
  }
  for (const query of ["", "?view=missing", "?view=https://evil.test", "?view=__proto__"]) assert.equal(workspaceFromSearch(query), "Akış");
  assert.equal(workspaceHref("missing"), "/");
  assert.equal(workspaceHref("__proto__"), "/");
});

test("campus search matches Turkish characters and multiple words across fields", () => {
  assert.equal(matchesSearch("kutuphane merkez", "Merkez Kütüphane", null), true);
  assert.equal(matchesSearch("IŞIK mühendis", "Işık", "Bilgisayar Mühendisliği"), true);
  assert.equal(matchesSearch("merkez eczane", "Merkez Kütüphane"), false);
  assert.equal(matchesSearch("   ", undefined, null), true);
});

test("notifications open supported content and do not construct unsafe destinations", () => {
  assert.equal(notificationHref("post", "one&view=safety"), "/?post=one%26view%3Dsafety");
  assert.equal(notificationHref("user", "a/b"), "/?profile=a%2Fb");
  assert.equal(notificationHref("user", "recipient", "follower"), "/?profile=follower");
  assert.equal(notificationHref("direct-message", "one"), "/?view=messages&message=one");
  assert.equal(notificationHref("community-event", "one"), "/?view=communities&communityEvent=one");
  assert.equal(notificationHref("note", "one"), "/?view=notes&note=one");
  assert.equal(notificationHref("meetup", "one&view=safety"), "/?view=match&meetup=one%26view%3Dsafety");
  assert.equal(notificationHref("unknown", "javascript:alert(1)"), null);
  assert.equal(notificationHref("__proto__", "one"), null);
  assert.equal(notificationHref("post", null), null);
});
