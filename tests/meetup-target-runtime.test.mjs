import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const profile = { interests: ["music", "books"], intents: ["coffee"], bio: "Tanıtım", availability: "week", discoverable: true, configured: true };
const match = { publicId: "peer", displayName: "Sentetik eşleşme", handle: "peer", departmentName: "Test", classYear: 1, sharedIntents: ["coffee"], sharedInterests: ["books"], availability: "today", score: 70, reasons: ["Kitaplar"], bio: "Örnek tanıtım" };
const meetup = (id, patch = {}) => ({ id, direction: "incoming", otherPublicId: `peer-${id}`, otherName: `Sentetik kişi ${id}`, activity: "coffee", message: `Yalnızca ${id} isteğine ait açıklama`, proposedTime: "2026-09-09T12:00:00.000Z", campusPlace: `Kampüs ${id}`, status: "pending", expiresAt: "2026-09-09T12:00:00.000Z", time: "az", ...patch });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const button = (node, text) => [...node.querySelectorAll("button")].find((item) => item.textContent.trim() === text || item.getAttribute("aria-label") === text);
const detail = (ui) => ui.host.querySelector('[role="dialog"][aria-labelledby="meetup-detail-title"]');
async function setup({ direct = "", transport, list = [] } = {}) {
  const calls = []; let owner = "owner:one", expired = 0;
  const ui = await createMobileDom({ view: "match", fetch: async (url, options = {}) => {
    const call = { url, options, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null, id: new URL(url, "http://localhost").searchParams.get("id") }; calls.push(call);
    if (!call.id && call.method === "GET") return Response.json({ profile, matches: [match], requests: list });
    return transport ? transport(call) : Response.json({ request: meetup(call.id) });
  } });
  if (direct) ui.window.history.replaceState({ kampiraDepth: 0 }, "", direct);
  const workspace = ui.load("lib/workspace-state.ts"); workspace.setWorkspaceStateOwnerScope(owner);
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider, Component = ui.load("app/social-match.tsx").SocialMatchWorkspace;
  const render = () => ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() { expired++; } }, h(Component, { universityShortName: "TEST" })));
  const until = async (predicate) => { for (let index = 0; index < 140 && !predicate(); index++) await act(async () => new Promise((resolve) => setTimeout(resolve, 3))); assert.ok(predicate(), ui.host.textContent); };
  await render();
  return { ...ui, calls, until, expired: () => expired,
    navigate: (id) => act(async () => ui.load("lib/app-links.ts").navigateAppHref(`/?view=match&meetup=${encodeURIComponent(id)}`)),
    replaceOwner: async () => { owner = "owner:two"; workspace.setWorkspaceStateOwnerScope(owner); await render(); },
  };
}

test("an exact meetup outside the list opens independently of tab/filter with one focused Back/Forward layer and no automatic decision", async () => {
  const ui = await setup({ list: [meetup("listed")] });
  try {
    await ui.click(button(ui.host, "Tercihlerim")); await ui.fill(ui.host.querySelector(".social-settings textarea"), "Kaydedilmemiş tercih taslağı");
    const before = ui.window.history.length; await ui.navigate("outside-80"); await ui.until(() => detail(ui)?.dataset.state === "ready");
    assert.equal(ui.window.history.length, before + 1); assert.equal(ui.window.history.state.kampiraDepth, 1);
    assert.match(detail(ui).textContent, /Sentetik kişi outside-80/); assert.equal(ui.document.activeElement, detail(ui)); assert.equal(ui.host.querySelector(".social-settings textarea").value, "Kaydedilmemiş tercih taslağı");
    assert.equal(ui.calls.filter((call) => call.method !== "GET").length, 0);
    await ui.travel("back"); assert.equal(detail(ui), null); assert.equal(ui.host.querySelector(".social-settings textarea").value, "Kaydedilmemiş tercih taslağı");
    await ui.travel("forward"); await ui.until(() => detail(ui)?.dataset.state === "ready"); assert.match(detail(ui).textContent, /outside-80/);
    await ui.click(button(detail(ui), "Buluşma ayrıntısını kapat")); await ui.until(() => !detail(ui)); assert.equal(ui.window.location.search, "?view=match");
  } finally { await ui.close(); }
});

test("direct URLs close in place and invalid or duplicated IDs render an unavailable layer without fetching a target", async () => {
  for (const direct of ["/?view=match&meetup=direct", "/?view=match&meetup=", "/?view=match&meetup=A&meetup=B", "/?view=match&meetup=a%20b", "/?view=match&meetup=%20direct%20", "/?view=match&meetup=a.b", `/?view=match&meetup=${"x".repeat(81)}`]) {
    const ui = await setup({ direct });
    try {
      await ui.until(() => detail(ui) && detail(ui).dataset.state !== "loading"); assert.equal(ui.window.history.length, 1);
      if (direct.endsWith("=direct")) assert.equal(detail(ui).dataset.state, "ready");
      else { assert.equal(detail(ui).dataset.state, "unavailable"); assert.match(detail(ui).textContent, /geçerli değil/); assert.equal(ui.calls.filter((call) => call.id).length, 0); }
      await ui.click(button(detail(ui), "Buluşma ayrıntısını kapat")); await ui.until(() => !detail(ui)); assert.equal(ui.window.location.search, "?view=match"); assert.equal(ui.window.history.length, 1);
    } finally { await ui.close(); }
  }
});

test("switching A to B immediately hides A and a deferred old JSON body cannot replace B", async () => {
  const delayed = deferred(); let readsA = 0;
  const ui = await setup({ transport: (call) => call.id === "A" && ++readsA === 2 ? { ok: true, status: 200, json: () => delayed.promise } : Response.json({ request: meetup(call.id) }) });
  try {
    await ui.navigate("A"); await ui.until(() => detail(ui)?.dataset.state === "ready");
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" }); await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    await ui.until(() => readsA === 2); await ui.navigate("B");
    assert.doesNotMatch(detail(ui).textContent, /Sentetik kişi A|Kampüs A/); await ui.until(() => detail(ui)?.dataset.state === "ready");
    await act(async () => delayed.resolve({ request: meetup("A") })); assert.match(detail(ui).textContent, /Sentetik kişi B/); assert.doesNotMatch(detail(ui).textContent, /Sentetik kişi A/);
  } finally { delayed.resolve({}); await ui.close(); }
});

test("wrong target response is rejected, unavailable content has manual retry, and refresh removes a revoked target's private data", async () => {
  let mode = "wrong";
  const ui = await setup({ transport: (call) => mode === "wrong" ? Response.json({ request: meetup("someone-else") }) : mode === "revoked" ? Response.json({ error: "Buluşma isteği bulunamadı." }, { status: 404 }) : Response.json({ request: meetup(call.id) }) });
  try {
    await ui.navigate("target"); await ui.until(() => detail(ui)?.dataset.state === "unavailable"); assert.doesNotMatch(detail(ui).textContent, /someone-else/);
    mode = "ready"; await ui.click(button(detail(ui), "Durumu yenile")); await ui.until(() => detail(ui)?.dataset.state === "ready");
    mode = "revoked"; Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" }); await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    await ui.until(() => detail(ui)?.dataset.state === "unavailable"); assert.doesNotMatch(detail(ui).textContent, /Sentetik kişi target|Kampüs target/); assert.equal(Boolean(button(detail(ui), "Kabul et")), false);
  } finally { await ui.close(); }
});

test("owner replacement discards pending private bodies and session expiry never parses unauthorized target JSON", async () => {
  const body = deferred(); let first = true, parsed = false;
  const ui = await setup({ transport: () => { if (first) { first = false; return { ok: true, status: 200, json: () => body.promise }; } return { ok: false, status: 401, json() { parsed = true; throw new Error("Must not parse unauthorized private body"); } }; } });
  try {
    await ui.navigate("A"); await ui.until(() => ui.calls.some((call) => call.id === "A"));
    await ui.replaceOwner(); await ui.until(() => ui.expired() === 1);
    await act(async () => body.resolve({ request: meetup("A") })); assert.equal(parsed, false); assert.doesNotMatch(ui.host.textContent, /Sentetik kişi A|Kampüs A/);
    assert.equal(detail(ui).dataset.state, "unavailable"); assert.match(detail(ui).textContent, /Oturumun sona erdi/);
  } finally { body.resolve({}); await ui.close(); }
});

test("same-frame decision sends only the exact visible ID once, and lost acknowledgement rechecks canonical status without replay", async () => {
  const pending = deferred(); let status = "pending";
  const ui = await setup({ transport(call) {
    if (call.method === "GET") return Response.json({ request: meetup(call.id, { status }) });
    assert.deepEqual(call.body, { id: "outside", decision: "accepted" }); status = "accepted"; return pending.promise;
  } });
  try {
    await ui.navigate("outside"); await ui.until(() => detail(ui)?.dataset.state === "ready");
    const accept = button(detail(ui), "Kabul et"); await act(async () => { accept.click(); accept.click(); }); assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
    await act(async () => pending.resolve({ ok: true, status: 200, json: async () => { throw new Error("Lost committed response"); } }));
    await ui.until(() => detail(ui)?.querySelector('[data-status="accepted"]')); assert.match(detail(ui).textContent, /tekrar gönderilmiyor/);
    assert.equal(Boolean(button(detail(ui), "Kabul et")), false); assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
  } finally { pending.resolve(Response.json({})); await ui.close(); }
});

test("all terminal states stay readable without response buttons, and outgoing pending allows only cancellation", async () => {
  const ui = await setup({ transport: (call) => Response.json({ request: meetup(call.id, { status: call.id === "outgoing" ? "pending" : call.id, direction: call.id === "outgoing" ? "outgoing" : "incoming" }) }) });
  try {
    for (const status of ["accepted", "declined", "cancelled", "expired", "outgoing"]) {
      await ui.navigate(status); await ui.until(() => detail(ui)?.dataset.state === "ready");
      assert.equal(Boolean(button(detail(ui), "Kabul et")), false); assert.equal(Boolean(button(detail(ui), "Reddet")), false); assert.ok(button(detail(ui), "Şikâyet"));
      assert.equal(Boolean(button(detail(ui), "İptal et")), status === "outgoing");
    }
    assert.equal(ui.calls.some((call) => call.method !== "GET"), false);
  } finally { await ui.close(); }
});

test("leaving a pending decision aborts its delivery and never alters a newer target or resends the old decision", async () => {
  const body = deferred(); let readingBody = false;
  const ui = await setup({ transport: (call) => call.method === "PATCH" ? { ok: true, status: 200, json: () => { readingBody = true; return body.promise; } } : Response.json({ request: meetup(call.id) }) });
  try {
    await ui.navigate("A"); await ui.until(() => detail(ui)?.dataset.state === "ready"); await ui.click(button(detail(ui), "Kabul et")); await ui.until(() => readingBody);
    await ui.navigate("B"); await ui.until(() => detail(ui)?.dataset.state === "ready");
    assert.equal(ui.calls.find((call) => call.method === "PATCH").options.signal.aborted, true);
    await act(async () => body.resolve({ request: meetup("A", { status: "accepted" }), status: "accepted" }));
    assert.match(detail(ui).textContent, /Sentetik kişi B/); assert.equal(detail(ui).querySelector('[data-status]').dataset.status, "pending"); assert.doesNotMatch(detail(ui).textContent, /İstek güncellendi/);
    assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
  } finally { body.resolve({}); await ui.close(); }
});

test("request and report drafts survive exact-detail navigation and reporting never submits on Back", async () => {
  const ui = await setup();
  try {
    await ui.click(button(ui.host, "Buluşma isteği")); const requestDialog = ui.host.querySelector('[aria-labelledby="meetup-title"]');
    await ui.fill(requestDialog.querySelector('[name="message"]'), "Kişiye özel oluşturma taslağı");
    await ui.navigate("A"); await ui.until(() => detail(ui)?.dataset.state === "ready"); assert.equal(ui.host.querySelector('[aria-labelledby="meetup-title"]'), null);
    await ui.travel("back"); await ui.until(() => !!ui.host.querySelector('[aria-labelledby="meetup-title"]'));
    assert.equal(ui.host.querySelector('[aria-labelledby="meetup-title"] [name="message"]').value, "Kişiye özel oluşturma taslağı");
    await ui.travel("back"); await ui.navigate("A"); await ui.until(() => detail(ui)?.dataset.state === "ready");
    await ui.click(button(detail(ui), "Şikâyet")); let reportDialog = ui.host.querySelector('[aria-labelledby="meetup-report-title"]'); assert.ok(reportDialog);
    await ui.fill(reportDialog.querySelector('[name="details"]'), "A isteğine ait şikâyet taslağı");
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector('[aria-labelledby="meetup-report-title"]'));
    assert.equal(detail(ui).dataset.meetupId, "A"); await ui.click(button(detail(ui), "Şikâyet")); reportDialog = ui.host.querySelector('[aria-labelledby="meetup-report-title"]');
    assert.equal(reportDialog.querySelector('[name="details"]').value, "A isteğine ait şikâyet taslağı");
    assert.equal(ui.calls.some((call) => call.method !== "GET"), false);
  } finally { await ui.close(); }
});
