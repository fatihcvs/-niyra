import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/mobile-navigation.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(window = undefined) {
  const testModule = { exports: {} };
  runInNewContext(source, { module: testModule, exports: testModule.exports, URL, window });
  return testModule.exports;
}
function browserHistory({ location = "/", state = null, scrollY = 0 } = {}) {
  const entries = [{ location, state }];
  let index = 0;
  const calls = [];
  const window = {
    scrollY,
    history: {
      get state() { return entries[index].state; },
      replaceState(nextState, title, nextLocation) {
        calls.push({ kind: "replace", title, location: nextLocation });
        entries[index] = { state: structuredClone(nextState), location: nextLocation ?? entries[index].location };
      },
      pushState(nextState, title, nextLocation) {
        calls.push({ kind: "push", title, location: nextLocation });
        entries.splice(index + 1);
        entries.push({ state: structuredClone(nextState), location: nextLocation });
        index += 1;
      },
      back() { if (index > 0) index -= 1; },
    },
  };
  return { window, entries, calls, current: () => entries[index] };
}

test("mobileRootFor maps every secondary workspace to its persistent primary destination", () => {
  const { mobileRootFor, MOBILE_PRIMARY_DESTINATIONS } = load();
  assert.deepEqual(Array.from(MOBILE_PRIMARY_DESTINATIONS), ["Akış", "Keşfet", "Paylaş", "Mesajlar", "Profil"]);
  for (const name of ["Keşfet", "Notlar", "Topluluklar", "Kampüs Anlık", "Kütüphane", "Kampüs", "Pazar", "Eşleş", "Öğrenci"]) assert.equal(mobileRootFor(name), "Keşfet", name);
  for (const name of ["Profil", "Kaydedilenler", "Güvenlik", "Ayarlar"]) assert.equal(mobileRootFor(name), "Profil", name);
  for (const name of ["Akış", "Bildirimler"]) assert.equal(mobileRootFor(name), "Akış", name);
  assert.equal(mobileRootFor("Mesajlar"), "Mesajlar");
});

test("closing a composer preserves the target course, search and feed query context", () => {
  const { pageLocationWithoutComposer } = load();
  const input = "/?view=notes&course=MAT%20101&courseName=Matematik%20I&source=editorial&q=t%C3%BCrev&feed=campus&compose=1";
  const output = pageLocationWithoutComposer(input);
  const before = new URL(input, "https://app.kampira.test");
  const after = new URL(output, before);
  assert.equal(after.searchParams.has("compose"), false);
  assert.equal(after.pathname, before.pathname);
  for (const key of ["view", "course", "courseName", "source", "q", "feed"]) assert.equal(after.searchParams.get(key), before.searchParams.get(key), key);
  assert.ok(output.startsWith("/"));
  assert.doesNotMatch(output, /^https?:/);
});

test("composer normalization accepts absolute URLs and removes repeated compose flags only", () => {
  const { pageLocationWithoutComposer } = load();
  const output = pageLocationWithoutComposer("https://app.kampira.test/campus?view=market&market=prices&compose=1&compose=0");
  assert.equal(output, "/campus?view=market&market=prices");
  assert.equal(pageLocationWithoutComposer("/?view=messages"), "/?view=messages");
  assert.equal(pageLocationWithoutComposer("/?compose=1"), "/");
});

test("first app navigation stores the outgoing scroll position and starts a new history entry", () => {
  const browser = browserHistory({ scrollY: 732 });
  const { pushAppLocation } = load(browser.window);
  pushAppLocation("/?view=discover");
  assert.equal(browser.entries.length, 2);
  assert.deepEqual(browser.entries[0], { location: "/", state: { kampiraScrollY: 732 } });
  assert.deepEqual(browser.current(), { location: "/?view=discover", state: { kampiraDepth: 1, kampiraScrollY: 0 } });
  assert.deepEqual(browser.calls.map((call) => call.kind), ["replace", "push"]);
});

test("history navigation preserves an existing entry's state and gives new pages independent scroll", () => {
  const initialState = { kampiraDepth: 4, kampiraScrollY: 12, routeContext: { course: "MAT 101" } };
  const browser = browserHistory({ location: "/?view=notes&course=MAT", state: initialState, scrollY: 680 });
  const { pushAppLocation } = load(browser.window);
  pushAppLocation("/?view=messages");
  assert.equal(initialState.kampiraScrollY, 12, "the helper must not mutate the caller's state object");
  assert.deepEqual(browser.entries[0].state, { kampiraDepth: 4, kampiraScrollY: 680, routeContext: { course: "MAT 101" } });
  assert.deepEqual(browser.current().state, { kampiraDepth: 5, kampiraScrollY: 0 });
  browser.window.history.back();
  assert.equal(browser.current().location, "/?view=notes&course=MAT");
  assert.equal(browser.current().state.kampiraScrollY, 680);
});

test("navigating after Back branches history without losing the previous page's restored context", () => {
  const browser = browserHistory({ state: { kampiraDepth: 0 }, scrollY: 410 });
  const { pushAppLocation } = load(browser.window);
  pushAppLocation("/?view=discover");
  browser.window.scrollY = 250;
  pushAppLocation("/?view=notes");
  browser.window.history.back();
  assert.equal(browser.current().state.kampiraScrollY, 250);
  browser.window.scrollY = 330;
  pushAppLocation("/?view=campus");
  assert.deepEqual(browser.entries.map((entry) => entry.location), ["/", "/?view=discover", "/?view=campus"]);
  assert.equal(browser.entries[1].state.kampiraScrollY, 330);
  assert.equal(browser.current().state.kampiraDepth, 2);
});

test("a malformed optional depth does not prevent the first in-app navigation", () => {
  const browser = browserHistory({ state: { kampiraDepth: "unknown" }, scrollY: 0 });
  const { pushAppLocation } = load(browser.window);
  pushAppLocation("/?view=profile");
  assert.equal(browser.current().state.kampiraDepth, 1);
});
