import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const data = (label) => ({ people: [{ public_id: label, display_name: label, handle: label, department_name: "Örnek bölüm" }], courses: [], posts: [], notes: [], communities: [] });
const settle = async (fn = () => {}) => { await act(async () => { fn(); await new Promise((resolve) => setTimeout(resolve, 290)); }); };

async function setup(fetch) {
  const ui = await createMobileDom({ view: "discover", fetch });
  const { UnifiedSearchResults } = ui.load("app/unified-search.tsx");
  const { AppNavigationProvider } = ui.load("app/app-navigation.tsx");
  const store = ui.load("lib/workspace-state.ts");
  let scope = "owner-a:1", expired = 0;
  store.setWorkspaceStateOwnerScope(scope);
  const render = (query, searchScope = "platform") => ui.render(h(AppNavigationProvider, { ownerScope: scope, onBack() {}, onSessionExpired() { expired++; store.setWorkspaceStateOwnerScope(null); } }, h(UnifiedSearchResults, { query, scope: searchScope })));
  return { ...ui, render, expired: () => expired, owner(next) { scope = next; store.setWorkspaceStateOwnerScope(next); } };
}

test("a slow old search, including an abort-ignoring response, never replaces the current query", async () => {
  const requests = [];
  const ui = await setup((url, options) => new Promise((resolve) => requests.push({ url, signal: options.signal, resolve })));
  try {
    await ui.render("Deniz"); await settle();
    await ui.render("Ece"); await settle();
    assert.equal(requests[0].signal.aborted, true);
    await settle(() => requests[1].resolve({ ok: true, status: 200, json: async () => data("Ece") }));
    await settle(() => requests[0].resolve({ ok: true, status: 200, json: async () => data("Deniz") }));
    assert.match(ui.host.textContent, /Ece/);
    assert.doesNotMatch(ui.host.textContent, /Deniz/);
    assert.equal(ui.host.querySelector('[data-scroll-pending="true"]'), null);
  } finally { await ui.close(); }
});

test("Back-style remount restores the query cache, while scope and account changes fetch separate results", async () => {
  const requests = [];
  const ui = await setup(async (url) => { requests.push(url); return { ok: true, status: 200, json: async () => data(`Result-${requests.length}`) }; });
  try {
    await ui.render("Deniz"); await settle();
    await ui.render("");
    await ui.render("Deniz");
    assert.match(ui.host.textContent, /Result-1/);
    assert.equal(ui.host.querySelector('[data-scroll-pending="true"]'), null);
    await settle(); assert.equal(requests.length, 1);
    await ui.render("Deniz", "campus"); await settle(); assert.equal(requests.length, 2);
    ui.owner("owner-b:1"); await ui.render("Deniz", "campus");
    assert.doesNotMatch(ui.host.textContent, /Result-2/);
    await settle(); assert.equal(requests.length, 3);
    assert.match(ui.host.textContent, /Result-3/);
  } finally { await ui.close(); }
});

test("a failed search offers a working retry; malformed success stays recoverable", async () => {
  let calls = 0;
  const ui = await setup(async () => ({ ok: true, status: 200, json: async () => ++calls === 1 ? {} : data("Recovered") }));
  try {
    await ui.render("Deniz"); await settle();
    assert.match(ui.host.textContent, /Arama tamamlanamadı/);
    await ui.click([...ui.host.querySelectorAll("button")].find((button) => button.textContent === "Tekrar dene"));
    await settle();
    assert.match(ui.host.textContent, /Recovered/);
    assert.equal(calls, 2);
  } finally { await ui.close(); }
});

test("401 expires the owner once and private cached results are not rendered after account change", async () => {
  let parsed = 0;
  const ui = await setup(async () => ({ ok: false, status: 401, json: async () => { parsed++; return { error: "Expired" }; } }));
  try {
    await ui.render("Deniz"); await settle();
    assert.equal(ui.expired(), 1);
    assert.equal(parsed, 0, "expiration rejects the owner before reading its response body");
    assert.match(ui.host.textContent, /Oturumun sona erdi/);
    await ui.render("D");
    assert.equal(ui.host.textContent, "");
  } finally { await ui.close(); }
});
