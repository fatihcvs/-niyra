import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const top = (ui) => [...ui.host.querySelectorAll('[role="dialog"]')].filter((element) => !element.closest("[hidden]")).at(-1);
const button = (scope, label) => [...scope.querySelectorAll("button")].find((node) => node.textContent.trim() === label || node.getAttribute("aria-label") === label);
const student = (id) => ({ id, name: `[SYNTHETIC] Yurt ${id}`, description: "Sentetik öğrenci konaklama açıklaması.", address: "", latitude: null, longitude: null, coordinatesKnown: false, own: true, updatedTime: "şimdi", category: "housing", curated: false, accessibility: [], currentCount: 0, needsUpdateCount: 0, verification: { label: "Öğrenci kaydı", time: null }, viewerState: null, openingHours: "", source: null, campusName: "", distanceMeters: null });
const experience = (id, own = false) => ({ id, content: `[SYNTHETIC] Deneyim ${id}`, anonymous: !own, authorName: own ? "Örnek öğrenci" : "Anonim öğrenci", authorHandle: null, own, time: "şimdi" });
const catalogue = (id) => ({ universities: [{ id: "u", name: "Örnek Üniversite" }], university: { id: "u", name: "Örnek Üniversite" }, campuses: [{ id: "campus", universityId: "u", name: "Örnek Yerleşke", city: "Örnek", region: "TR", latitude: 41, longitude: null, address: "", sourceUrl: "https://example.org/campus" }], selectedCampus: { id: "campus", name: "Örnek Yerleşke", latitude: 41, longitude: null }, places: [{ id, name: `[SYNTHETIC] Kaynak ${id}`, kind: "dorm", city: "Örnek", region: "TR", address: "", latitude: 41, longitude: 29, gender: "unknown", phone: "", website: "", capacity: null, features: [], description: "", universityIds: ["u"], source: { type: "openstreetmap", url: "https://www.openstreetmap.org/node/1", checkedAt: "invalid-date" }, coordinateSourceUrl: "https://www.openstreetmap.org/node/1", distanceMeters: null, campusName: "Örnek Yerleşke", relation: "university" }], total: 1, page: 1, pageSize: 24, counts: { nearby: 0, university: 1, city: 0, public: 0, private: 0, other: 1 }, checkedAt: "2026-09-05", scope: "nearby" });

async function setup() {
  const requests = [], expired = [], archived = [];
  const ui = await createMobileDom({ fetch: (url, options) => { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; } });
  const { AppNavigationProvider: Provider } = ui.load("app/app-navigation.tsx");
  const workspace = ui.load("lib/workspace-state.ts"); let changeOwner;
  function Harness({ Component, props }) {
    const [owner, setOwner] = useState("owner-a:1");
    changeOwner = (next) => { workspace.setWorkspaceStateOwnerScope(next); setOwner(next); };
    return owner ? h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() { expired.push(owner); changeOwner(null); } }, h(Component, props)) : h("p", null, "Giriş gerekli");
  }
  return { ...ui, requests, expired, archived,
    renderComponent: async (file, name, props = {}) => { workspace.setWorkspaceStateOwnerScope("owner-a:1"); await ui.render(h(Harness, { Component: ui.load(file)[name], props })); },
    community: async (places = [student("a"), student("b")]) => { workspace.setWorkspaceStateOwnerScope("owner-a:1"); await ui.render(h(Harness, { Component: ui.load("app/housing-community.tsx").HousingCommunity, props: { places, onAdd() {}, onArchived: (id) => archived.push(id) } })); },
    until: async (check) => { for (let i = 0; i < 180; i++) { if (check()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(check(), ui.host.textContent); },
    resolve: (request, body, status = 200) => act(async () => request.resolve(Response.json(body, { status }))),
    switchOwner: (next) => act(async () => changeOwner(next)),
  };
}
const submit = (ui) => act(async () => top(ui).querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
async function choose(ui, id) { await ui.click([...ui.host.querySelectorAll(".list>button")].find((node) => node.textContent.includes(`Yurt ${id}`))); }

test("catalogue detail preserves unknown source facts and Back focus; changed filters cannot show a stale response", async () => {
  const ui = await setup();
  try {
    await ui.renderComponent("app/housing-directory.tsx", "HousingDirectory"); await ui.until(() => ui.requests.length === 1);
    await ui.resolve(ui.requests[0], catalogue("a"));
    assert.equal(ui.host.querySelector(".workspace-filter-toggle").getAttribute("aria-expanded"), "false");
    await ui.click(ui.host.querySelector(".workspace-filter-toggle")); assert.match(top(ui).textContent, /Üniversite/);
    await ui.travel("back"); assert.equal(top(ui), undefined);
    const open = ui.host.querySelector('button[aria-label$="ayrıntılarını aç"]'); await ui.click(open);
    assert.match(top(ui).textContent, /Kontrol tarihi belirtilmemiş/);
    assert.match(top(ui).textContent, /Kaynakta belirtilmemiş/);
    assert.match(top(ui).textContent, /resmî onayı anlamına gelmez/);
    assert.doesNotMatch(top(ui).querySelector('a[href*="maps/dir"]').href, /origin=/, "a partial campus coordinate is not sent as an origin");
    await ui.travel("back"); assert.equal(top(ui), undefined); assert.equal(ui.document.activeElement, open);
    await ui.travel("forward"); assert.match(top(ui).textContent, /Kaynak a/); await ui.travel("back");
    await ui.fill(ui.host.querySelector('input[type="search"]'), "birinci");
    assert.equal(ui.host.querySelector('button[aria-label$="ayrıntılarını aç"]'), null, "old results disappear immediately before the debounce runs");
    await ui.until(() => ui.requests.length === 2); const stale = ui.requests[1];
    await ui.fill(ui.host.querySelector('input[type="search"]'), "ikinci"); await ui.until(() => ui.requests.length === 3);
    await ui.resolve(ui.requests[2], catalogue("b")); await ui.resolve(stale, catalogue("stale"));
    assert.match(ui.host.textContent, /Kaynak b/); assert.doesNotMatch(ui.host.textContent, /Kaynak stale/);
  } finally { await ui.close(); }
});

test("owned student housing archive applies only a server acknowledgement and Back exits the archived detail", async () => {
  const ui = await setup();
  try {
    await ui.community(); await choose(ui, "a"); await ui.resolve(ui.requests[0], { place: { id: "a" }, messages: [] });
    await ui.click(button(top(ui), "Kaydı arşivle")); assert.equal(ui.requests.length, 1);
    await ui.click(button(top(ui), "Kaydı arşivle")); assert.deepEqual(JSON.parse(ui.requests[1].options.body), { action: "archive-place", id: "a" });
    await ui.resolve(ui.requests[1], { archived: true }); assert.deepEqual(ui.archived, []);
    await ui.travel("back"); assert.deepEqual(ui.archived, ["a"]); assert.equal(top(ui), undefined);
  } finally { await ui.close(); }
});

test("student details isolate late reads and per-place controlled experience drafts across Back and Forward", async () => {
  const ui = await setup();
  try {
    await ui.community(); await choose(ui, "a"); const old = ui.requests[0]; await ui.travel("back");
    await choose(ui, "b"); await ui.resolve(ui.requests[1], { place: { id: "b" }, messages: [experience("b")] }); await ui.resolve(old, { place: { id: "a" }, messages: [experience("stale-a")] });
    assert.match(top(ui).textContent, /Deneyim b/); assert.doesNotMatch(top(ui).textContent, /stale-a/);
    await ui.click(button(top(ui), "Deneyimini paylaş")); await ui.fill(top(ui).querySelector("textarea"), "[SYNTHETIC] B taslağı"); await ui.click(top(ui).querySelector('input[type="checkbox"]'));
    await ui.travel("back"); assert.equal(top(ui).getAttribute("aria-labelledby"), "housing-student-title");
    await ui.travel("forward"); assert.equal(top(ui).querySelector("textarea").value, "[SYNTHETIC] B taslağı"); assert.equal(top(ui).querySelector("input").checked, true);
    await ui.travel("back"); await ui.travel("back"); await choose(ui, "a"); await ui.resolve(ui.requests[2], { place: { id: "a" }, messages: [] }); await ui.click(button(top(ui), "Deneyimini paylaş"));
    assert.equal(top(ui).querySelector("textarea").value, ""); assert.equal(top(ui).querySelector("input").checked, false);
  } finally { await ui.close(); }
});

test("experience mutation validates the selected target, rejects double submit, retains failure drafts and deletes only a confirmed owned message", async () => {
  const ui = await setup();
  try {
    await ui.community(); await choose(ui, "a"); await ui.resolve(ui.requests[0], { place: { id: "a" }, messages: [experience("other")] });
    assert.equal(button(top(ui), "Deneyimimi sil"), undefined);
    await ui.click(button(top(ui), "Deneyimini paylaş")); await ui.fill(top(ui).querySelector("textarea"), "[SYNTHETIC] Gerçek hedefe bağlı taslak"); await ui.click(top(ui).querySelector("input"));
    await submit(ui); await submit(ui); assert.equal(ui.requests.length, 2);
    assert.deepEqual(JSON.parse(ui.requests[1].options.body), { placeId: "a", content: "[SYNTHETIC] Gerçek hedefe bağlı taslak", anonymous: true });
    await ui.resolve(ui.requests[1], { error: "Sentetik bakım" }, 503); assert.match(top(ui).textContent, /Sentetik bakım/); assert.notEqual(top(ui).querySelector("textarea").value, "");
    await submit(ui); await ui.resolve(ui.requests[2], {}); assert.match(top(ui).textContent, /doğrulanamadı/);
    await submit(ui); await ui.resolve(ui.requests[3], { message: experience("created", true) }, 201);
    assert.equal(top(ui).querySelector("textarea").value, ""); assert.match(top(ui).textContent, /Deneyimin paylaşıldı/);
    await ui.travel("back"); assert.match(top(ui).textContent, /Deneyim created/);
    await ui.click(button(top(ui), "Deneyimimi sil")); assert.equal(ui.requests.length, 4);
    await ui.click(button(top(ui), "Deneyimimi sil")); assert.deepEqual(JSON.parse(ui.requests[4].options.body), { id: "created" });
    await ui.resolve(ui.requests[4], { deleted: true, id: "created" }); await ui.travel("back");
    assert.doesNotMatch(top(ui).textContent, /Deneyim created/); assert.match(top(ui).textContent, /Deneyim other/);
  } finally { await ui.close(); }
});

test("housing request timeout bounds an abort-ignoring body and owner changes prevent private body delivery or old 401 expiry", async () => {
  const ui = await setup(); const timers = new Map(); let sequence = 9000;
  const setTimer = ui.window.setTimeout.bind(ui.window), clearTimer = ui.window.clearTimeout.bind(ui.window);
  ui.window.setTimeout = (callback, duration, ...args) => { if (duration !== 20000) return setTimer(callback, duration, ...args); const id = ++sequence; timers.set(id, callback); return id; };
  ui.window.clearTimeout = (id) => { if (!timers.delete(id)) clearTimer(id); };
  try {
    await ui.community(); await choose(ui, "a"); const body = deferred();
    await act(async () => ui.requests[0].resolve({ ok: true, status: 200, json: () => body.promise }));
    await act(async () => [...timers.values()][0]()); assert.match(top(ui).textContent, /Yanıt zamanında/);
    await act(async () => body.resolve({ place: { id: "a" }, messages: [experience("late-body")] })); assert.doesNotMatch(top(ui).textContent, /late-body/);
    await ui.click(button(top(ui), "Deneyimleri yeniden dene")); const old = ui.requests[1]; await ui.switchOwner("owner-b:2");
    let reads = 0; await act(async () => old.resolve({ ok: false, status: 401, json: async () => { reads++; return {}; } }));
    assert.deepEqual(ui.expired, []); assert.equal(reads, 0); assert.equal(top(ui), undefined);
    await choose(ui, "b"); await act(async () => ui.requests[2].resolve({ ok: false, status: 401, json: async () => { reads++; return {}; } }));
    assert.equal(reads, 0); assert.deepEqual(ui.expired, ["owner-b:2"]); assert.equal(ui.host.textContent, "Giriş gerekli");
  } finally { await ui.close(); }
});

test("actual Campus housing creation preserves its controlled draft on Back, requires an acknowledged ID and opens the created student record", async () => {
  const ui = await setup();
  try {
    await ui.renderComponent("app/campus-guide.tsx", "CampusGuideWorkspace", { universityShortName: "TEST" });
    await ui.resolve(ui.requests[0], { places: [student("a")], events: [], suggestion: null });
    await ui.click([...ui.host.querySelectorAll(".campus-guide-tabs button")].find((node) => node.textContent.includes("Konaklama")));
    await ui.until(() => ui.requests.some((request) => request.url.startsWith("/api/housing/catalog")));
    await ui.resolve(ui.requests.find((request) => request.url.startsWith("/api/housing/catalog")), catalogue("source-only"));
    await ui.click(ui.host.querySelector('[data-action-id="campus.add-housing"]'));
    await ui.fill(top(ui).querySelector('[name="name"]'), "[SYNTHETIC] Yeni yurt");
    await ui.fill(top(ui).querySelector('[name="description"]'), "[SYNTHETIC] Kontrol edilen yeni konaklama açıklaması.");
    await ui.travel("back"); assert.equal(top(ui), undefined);
    await ui.travel("forward"); assert.equal(top(ui).querySelector('[name="name"]').value, "[SYNTHETIC] Yeni yurt");
    await submit(ui); await submit(ui);
    const posts = () => ui.requests.filter((request) => request.url === "/api/campus-guide" && request.options?.method === "POST");
    assert.equal(posts().length, 1); assert.equal(JSON.parse(posts()[0].options.body).category, "housing");
    await ui.resolve(posts()[0], {}); assert.match(top(ui).textContent, /Kayıt sonucu doğrulanamadı/); assert.notEqual(top(ui).querySelector('[name="name"]').value, "");
    await submit(ui); await ui.resolve(posts()[1], { place: { id: "new-student-record" } }, 201);
    await ui.until(() => ui.requests.filter((request) => request.url === "/api/campus-guide" && request.options?.method !== "POST").length === 2);
    const refresh = ui.requests.filter((request) => request.url === "/api/campus-guide" && request.options?.method !== "POST").at(-1);
    await ui.resolve(refresh, { places: [student("a"), student("new-student-record")], events: [], suggestion: null });
    await ui.until(() => ui.requests.some((request) => request.url === "/api/housing?placeId=new-student-record"));
    await ui.resolve(ui.requests.find((request) => request.url === "/api/housing?placeId=new-student-record"), { place: { id: "new-student-record" }, messages: [] });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    assert.equal(top(ui).getAttribute("aria-labelledby"), "housing-student-title");
    assert.match(top(ui).textContent, /new-student-record/);
    assert.equal(ui.requests.some((request) => request.url === "/api/housing?placeId=source-only"), false, "official catalogue IDs never become student discussion targets");
  } finally { await ui.close(); }
});
