import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const person = (id, options = {}) => ({ publicId: id, displayName: `[SYNTHETIC] ${id}`, handle: id, avatarUrl: null, universityShortName: "TEST", isFollowing: false, isSelf: false, ...options });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const page = (url, people = [person("deniz")], nextCursor = null, viewerId = "viewer") => { const params = new URL(url, "http://localhost").searchParams; return { targetId: params.get("id"), kind: params.get("kind"), query: params.get("q"), viewerId, people, nextCursor }; };
const settle = (ms = 15) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

async function setup(transport = async (url) => response(page(url))) {
  const calls = [], changes = [], expired = [];
  const ui = await createMobileDom({ view: "profile", fetch: async (url, init) => { calls.push({ url, init }); return transport(url, init); } });
  const Stats = ui.load("app/profile-relationships.tsx").ProfileRelationshipStats;
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const memory = ui.load("lib/workspace-state.ts");
  const relationships = ui.load("lib/profile-relationships.ts");
  memory.setWorkspaceStateOwnerScope("owner-a");
  const button = (label) => [...ui.document.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === label || element.textContent.trim() === label);
  return { ...ui, calls, changes, expired, button, relationships,
    async render(options = {}) { memory.setWorkspaceStateOwnerScope(options.owner ?? "owner-a"); await ui.render(h(Provider, { ownerScope: options.owner ?? "owner-a", onBack() {}, onSessionExpired() { expired.push(true); }, onFollowChanged(value) { changes.push(value); relationships.invalidateProfileRelationships(); } }, options.hidden ? null : h(Stats, { targetId: options.target ?? "target", targetName: "[SYNTHETIC] Öğrenci", postCount: 3, followerCount: options.followerCount ?? 2, followingCount: 2, courseCount: 4, ...(options.preview ? { preview: options.preview } : {}) }))); },
    async open(kind = "followers") { await ui.click(button(kind === "followers" ? "2 takipçi, listeyi aç" : "2 takip edilen, listeyi aç")); await settle(); },
  };
}

test("real shared history opens accessible list, preserves two pages through Back/Forward, and restores opener focus", async () => {
  const ui = await setup(async (url) => response(page(url, new URL(url, "http://localhost").searchParams.has("cursor") ? [person("second")] : [person("first")], url.includes("cursor=") ? null : "next-cursor")));
  try {
    await ui.render(); const opener = ui.button("2 takipçi, listeyi aç"); await ui.open();
    const dialog = ui.document.querySelector("[role=dialog]");
    assert.ok(dialog?.getAttribute("aria-labelledby")); assert.equal(dialog.dataset.mobileOverlay, "true"); assert.equal(ui.document.body.style.overflow, "hidden");
    assert.equal(ui.document.querySelector('a[href="/?profile=first"]').textContent.includes("[SYNTHETIC] first"), true);
    await ui.click(ui.button("Daha fazla göster")); assert.match(ui.document.body.textContent, /second/);
    await ui.travel("back"); assert.equal(ui.document.querySelector("[role=dialog]"), null); assert.equal(ui.document.activeElement, opener);
    await ui.travel("forward"); assert.match(ui.document.body.textContent, /first/); assert.match(ui.document.body.textContent, /second/); assert.equal(ui.calls.length, 2);
    assert.equal(ui.document.querySelector("[role=dialog]").contains(ui.document.activeElement), true);
    await ui.key("Escape"); assert.equal(ui.document.querySelector("[role=dialog]"), null);
  } finally { await ui.close(); }
});

test("profile navigation and route remount adopt the existing layer with its query, rows and scroll without another history entry", async () => {
  const ui = await setup(async (url) => response(page(url, [person("deniz")], "next")));
  try {
    await ui.render(); await ui.open("following"); await ui.fill(ui.document.querySelector("input"), "deniz"); await settle(280);
    const content = ui.document.querySelector('[role=tabpanel]');
    await act(async () => { content.scrollTop = 240; content.dispatchEvent(new ui.window.Event("scroll", { bubbles: true })); });
    const layer = ui.window.history.state.kampiraLayer.key, length = ui.window.history.length;
    await ui.render({ hidden: true }); await ui.render(); await settle();
    assert.equal(ui.window.history.state.kampiraLayer.key, layer); assert.equal(ui.window.history.length, length);
    assert.equal(ui.document.querySelector('[role=tab][aria-selected=true]').textContent, "Takip edilenler");
    assert.equal(ui.document.querySelector("input").value, "deniz"); assert.equal(ui.document.querySelector('[role=tabpanel]').scrollTop, 240);
    assert.equal(ui.calls.length, 2); assert.ok(ui.button("Daha fazla göster"));
    assert.equal(ui.window.localStorage.length, 0); assert.doesNotMatch(JSON.stringify(ui.window.history.state), /deniz|SYNTHETIC/);
  } finally { await ui.close(); }
});

test("switching away during pagination aborts the request and restores a usable earlier tab with its cursor", async () => {
  let stalled;
  const ui = await setup(async (url, init) => url.includes("cursor=") ? new Promise((resolve) => { stalled = { resolve, init, url }; }) : response(page(url, [person("first")], "next")));
  try {
    await ui.render(); await ui.open(); await ui.click(ui.button("Daha fazla göster"));
    await ui.click(ui.button("Takip edilenler")); await settle(); assert.equal(stalled.init.signal.aborted, true);
    await ui.click(ui.button("Takipçiler")); assert.equal(ui.button("Daha fazla göster").disabled, false);
    await act(async () => stalled.resolve(response(page(stalled.url, [person("STALE-PAGE")]))));
    assert.doesNotMatch(ui.document.body.textContent, /STALE-PAGE/); assert.match(ui.document.body.textContent, /first/);
  } finally { await ui.close(); }
});

test("confirmed safety invalidation clears current rows and cached other tab while preserving the open layer and query", async () => {
  let blocked = false;
  const ui = await setup(async (url) => response(page(url, blocked ? [] : [person("blocked-later")])));
  try {
    await ui.render(); await ui.open("following"); await ui.click(ui.button("Takipçiler")); await settle();
    await ui.fill(ui.document.querySelector("input"), "blocked"); await settle(280);
    const historyKey = ui.window.history.state.kampiraLayer.key;
    blocked = true; await act(async () => ui.relationships.invalidateProfileRelationships()); await settle();
    assert.equal(ui.window.history.state.kampiraLayer.key, historyKey); assert.equal(ui.document.querySelector("input").value, "blocked");
    assert.doesNotMatch(ui.document.body.textContent, /blocked-later/);
    await ui.click(ui.button("Takip edilenler")); await settle(); assert.doesNotMatch(ui.document.body.textContent, /blocked-later/);
  } finally { await ui.close(); }
});

test("cache bound never restores a cursor after discarded rows; outside confirmed count changes invalidate the affected list", async () => {
  let large = true;
  const ui = await setup(async (url) => response(page(url, large ? Array.from({ length: 201 }, (_, index) => person(`synthetic-${index}`)) : [person("fresh")], "next")));
  try {
    await ui.render(); await ui.open(); assert.equal(ui.document.querySelectorAll(".list li").length, 201);
    await ui.render({ hidden: true }); large = false; await ui.render(); await settle();
    assert.equal(new URL(ui.calls.at(-1).url, "http://localhost").searchParams.has("cursor"), false);
    assert.equal(ui.document.querySelectorAll(".list li").length, 1); assert.match(ui.document.body.textContent, /fresh/);
    const before = ui.calls.length; await ui.render({ followerCount: 3 }); await settle(); assert.equal(ui.calls.length, before + 1);
  } finally { await ui.close(); }
});

test("keyboard tabs, Turkish query drafts and empty recovery use the actual controls", async () => {
  const ui = await setup(async (url) => response(page(url, new URL(url, "http://localhost").searchParams.get("q") ? [] : [person("deniz")])));
  try {
    await ui.render(); await ui.open();
    const first = ui.document.querySelector('[role=tab][aria-selected=true]');
    await act(async () => first.dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
    await settle(); assert.equal(ui.document.querySelector('[role=tab][aria-selected=true]').textContent, "Takip edilenler");
    await ui.fill(ui.document.querySelector("input"), "İpek Işık "); await settle(280);
    assert.match(ui.document.body.textContent, /Eşleşen öğrenci yok/);
    assert.equal(new URL(ui.calls.at(-1).url, "http://localhost").searchParams.get("q"), "İpek Işık");
    await ui.travel("back"); await ui.travel("forward"); assert.equal(ui.document.querySelector("input").value, "İpek Işık ");
    await ui.click(ui.button("Aramayı temizle")); await settle(); assert.equal(ui.document.querySelector("input").value, ""); assert.match(ui.document.body.textContent, /deniz/);
  } finally { await ui.close(); }
});

test("late query, target and account responses are aborted and cannot repopulate the current list", async () => {
  const pending = [];
  const ui = await setup((url, init) => new Promise((resolve) => pending.push({ url, init, resolve })));
  try {
    await ui.render(); await ui.open();
    await ui.fill(ui.document.querySelector("input"), "new"); await settle(280);
    assert.equal(pending[0].init.signal.aborted, true);
    await act(async () => pending[0].resolve(response(page(pending[0].url, [person("STALE-QUERY")]))));
    assert.doesNotMatch(ui.document.body.textContent, /STALE-QUERY/);
    await ui.render({ owner: "owner-b", target: "other" }); assert.equal(pending[1].init.signal.aborted, true); await ui.open();
    await act(async () => pending[1].resolve(response(page(pending[1].url, [person("PRIVATE-A")]))));
    const current = pending.at(-1); await act(async () => current.resolve(response(page(current.url, [person("CURRENT-B")]))));
    assert.doesNotMatch(ui.document.body.textContent, /PRIVATE-A|STALE-QUERY/); assert.match(ui.document.body.textContent, /CURRENT-B/);
  } finally { await ui.close(); }
});

test("pagination failure retains rows/cursor for retry; inaccessible profile clears them", async () => {
  let mode = "network";
  const ui = await setup(async (url) => url.includes("cursor=") ? mode === "network" ? response({ error: "Sentetik ağ hatası" }, 503) : mode === "hidden" ? response({ error: "Bu profilin takip listesine erişilemiyor." }, 404) : response(page(url, [person("second")], "third")) : response(page(url, [person("first")], "second")));
  try {
    await ui.render(); await ui.open(); await ui.click(ui.button("Daha fazla göster"));
    assert.match(ui.document.body.textContent, /Sentetik ağ hatası/); assert.match(ui.document.body.textContent, /first/);
    mode = "success"; await ui.click(ui.button("Tekrar dene")); assert.match(ui.document.body.textContent, /second/);
    assert.equal(new URL(ui.calls.at(-1).url, "http://localhost").searchParams.get("cursor"), "second");
    mode = "hidden"; await ui.click(ui.button("Daha fazla göster"));
    assert.match(ui.document.body.textContent, /erişilemiyor/); assert.equal(ui.document.querySelectorAll(".list li").length, 0); assert.equal(ui.button("Daha fazla göster"), undefined);
  } finally { await ui.close(); }
});

test("same-frame desired follow is sent once and only confirmed own-following removal changes rows and root counts", async () => {
  let finish;
  const ui = await setup(async (url, init) => init.method === "POST" ? new Promise((resolve) => { finish = resolve; }) : response(page(url, [person("self", { isSelf: true }), person("deniz", { isFollowing: true })], null, "viewer")));
  try {
    await ui.render({ target: "viewer" }); await ui.open("following");
    assert.equal(ui.button("[SYNTHETIC] self: Takip et"), undefined);
    const action = ui.button("[SYNTHETIC] deniz: Takibi bırak");
    const layerKey = ui.window.history.state.kampiraLayer.key;
    action.focus();
    await act(async () => { action.click(); action.click(); });
    assert.equal(ui.calls.filter((call) => call.init.method === "POST").length, 1);
    assert.deepEqual(JSON.parse(ui.calls.at(-1).init.body), { targetId: "deniz", active: false });
    assert.match(ui.document.body.textContent, /deniz/); assert.equal(ui.changes.length, 0);
    const confirmed = { targetId: "deniz", active: false, followerCount: 12, viewerFollowingCount: 7 };
    await act(async () => finish(response(confirmed)));
    assert.doesNotMatch(ui.document.body.textContent, /deniz/); assert.deepEqual(ui.changes, [confirmed]);
    assert.equal(ui.calls.filter((call) => call.init.method !== "POST").length, 1, "own callback invalidation must not replace the current list");
    assert.equal(ui.window.history.state.kampiraLayer.key, layerKey);
    assert.equal(ui.document.querySelector('[role=tabpanel]').contains(ui.document.activeElement), true, "removing the focused row keeps keyboard focus inside the list");
  } finally { await ui.close(); }
});

test("aborted body on account switch cannot deliver follow state; session expiry is handled before body parsing", async () => {
  let resolveBody, oldSignal, bodyReads = 0;
  let mode = "body";
  const ui = await setup(async (url, init) => {
    if (mode === "401") return { status: 401, ok: false, json: async () => { bodyReads++; return {}; } };
    if (init.method === "POST") { oldSignal = init.signal; return { status: 200, ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) }; }
    return response(page(url));
  });
  try {
    await ui.render(); await ui.open(); await ui.click(ui.button("[SYNTHETIC] deniz: Takip et"));
    await ui.render({ owner: "owner-b" }); assert.equal(oldSignal.aborted, true);
    await act(async () => resolveBody({ targetId: "deniz", active: true, followerCount: 1, viewerFollowingCount: 1 }));
    assert.equal(ui.changes.length, 0);
    mode = "401"; await ui.render({ owner: "owner-c" }); await settle(); assert.equal(ui.expired.length, 1); assert.equal(bodyReads, 0);
  } finally { await ui.close(); }
});

test("ignored response-body cancellation still times out and permits retry without inventing follow success", async () => {
  let attempt = 0;
  const ui = await setup(async (url, init) => {
    if (init.method !== "POST") return response(page(url));
    attempt++;
    return attempt === 1 ? { status: 200, ok: true, json: () => new Promise(() => {}) } : response({ targetId: "deniz", active: true, followerCount: 8, viewerFollowingCount: 2 });
  });
  try {
    const original = ui.window.setTimeout.bind(ui.window);
    ui.window.setTimeout = (callback, delay, ...args) => original(callback, delay === 20_000 ? 25 : delay, ...args);
    await ui.render(); await ui.open(); await ui.click(ui.button("[SYNTHETIC] deniz: Takip et")); await settle(40);
    assert.match(ui.document.body.textContent, /Yanıt alınamadı/); assert.equal(ui.changes.length, 0); assert.equal(ui.button("[SYNTHETIC] deniz: Takip et").disabled, false);
    await ui.click(ui.button("[SYNTHETIC] deniz: Takip et")); assert.equal(ui.changes.length, 1); assert.ok(ui.button("[SYNTHETIC] deniz: Takibi bırak"));
    assert.ok(ui.calls.filter((call) => call.init.method === "POST").every((call) => JSON.parse(call.init.body).active === true));
  } finally { await ui.close(); }
});

test("explicit gallery full/self/empty rendering never fetches, navigates or calls real follow callbacks", async () => {
  const ui = await setup(() => { throw new Error("Preview must not fetch"); });
  try {
    await ui.render({ preview: { mode: "gallery" } }); await ui.open();
    assert.equal(ui.document.querySelectorAll(".list li").length, 3); assert.match(ui.document.body.textContent, /Galeri simülasyonu · Örnek veriler/);
    assert.equal(ui.document.querySelectorAll(".follow").length, 2);
    await ui.click(ui.button("Galeri simülasyonu · Ece: Takip et"));
    assert.ok(ui.button("Galeri simülasyonu · Ece: Takibi bırak"));
    const href = ui.window.location.href; await ui.click(ui.document.querySelector(".person")); assert.equal(ui.window.location.href, href);
    assert.equal(ui.calls.length, 0); assert.equal(ui.changes.length, 0);
    await ui.travel("back"); await ui.render({ preview: { mode: "gallery", state: "empty" } }); await ui.open();
    assert.match(ui.document.body.textContent, /Henüz takipçi yok/); assert.equal(ui.calls.length, 0);
  } finally { await ui.close(); }
});
