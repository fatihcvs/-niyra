import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("Campus guide layers", () => {
const point = (id, name, coordinatesKnown) => ({ id, name, category: "study", description: "Synthetic campus fixture description.", address: "Synthetic campus address", latitude: coordinatesKnown ? 35.1 : null, longitude: coordinatesKnown ? 33.1 : null, coordinatesKnown, accessibility: ["quiet"], openingHours: "09.00–17.00", currentCount: 0, needsUpdateCount: 0, viewerState: null, verification: { label: "Kaynaklı kayıt", time: null }, own: false, updatedTime: "şimdi", curated: true, campusName: "Test Kampüsü", distanceMeters: null, source: { type: "official-university", label: "Synthetic source", url: "https://campus.example.invalid/source", checkedAt: "2026-09-05" } });
const data = { places: [point("a", "Test Çalışma Alanı", true), point("b", "Test Koordinatsız Mekân", false)], events: [], suggestion: null };
let ui;
let requests;
let respond;
let Workspace;
let Provider;
const activeDialog = () => [...ui.host.querySelectorAll("[role='dialog']")].find((item) => !item.closest("[hidden]"));
const primary = () => ui.host.querySelector("[data-action-id^='campus.add-']");
const tab = (label) => [...ui.host.querySelectorAll(".campus-guide-tabs button")].find((item) => item.querySelector("strong").textContent === label);
const formField = (name, scope = activeDialog()) => scope.querySelector(`[name='${name}']`);
const renderWorkspace = async (ownerScope = "test-owner") => ui.render(h(Provider, { ownerScope, onBack() {}, onSessionExpired() {} }, h(Workspace, { universityShortName: "TEST" })));

test.beforeEach(async () => {
  requests = [];
  respond = async () => ({ ok: true, json: async () => data });
  ui = await createMobileDom({ modules: { "app/housing-directory.tsx": { HousingDirectory: () => h("div", { "data-housing-directory": true }, "Housing directory fixture") } }, fetch: async (url, options) => { requests.push({ url, options }); return respond(url, options); } });
  Workspace = ui.load("app/campus-guide.tsx").CampusGuideWorkspace;
  Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("test-owner");
});
test.afterEach(async () => { await ui.close(); });

test("mobile starts with the place list and mounts a map only after a real detail action", async () => {
  await renderWorkspace();
  assert.equal(ui.host.querySelectorAll(".campus-place-list article").length, 2);
  assert.equal(ui.host.querySelector("iframe"), null);
  assert.equal(activeDialog(), undefined);
  const details = ui.host.querySelector(".campus-place-list button");
  await ui.click(details);
  assert.equal(activeDialog().getAttribute("aria-labelledby"), "campus-place-detail-title");
  assert.equal(activeDialog().querySelector("h2").textContent, "Test Çalışma Alanı");
  assert.equal(activeDialog().querySelectorAll("iframe").length, 1);
  assert.ok(activeDialog().querySelector("a[href='https://campus.example.invalid/source']"));
  assert.equal(ui.window.history.state.kampiraLayer.id, "campus.place-detail");
  await ui.travel("back");
  assert.equal(activeDialog(), undefined);
  assert.equal(ui.host.querySelector("iframe"), null);
  assert.equal(ui.document.activeElement, details);
  await ui.travel("forward");
  assert.equal(activeDialog().querySelector("h2").textContent, "Test Çalışma Alanı");
  assert.ok(requests.every(({ options }) => !options?.method), "Detail navigation is read-only");
});

test("unknown coordinates show the actual source and no invented map", async () => {
  await renderWorkspace();
  await ui.click(ui.host.querySelectorAll(".campus-place-list button")[1]);
  assert.equal(activeDialog().querySelector("iframe"), null);
  assert.match(activeDialog().textContent, /Harita konumu henüz eklenmedi/);
  assert.ok(activeDialog().querySelector("a[href='https://campus.example.invalid/source']"));
});

test("781px retains the desktop map aside and detail selection creates no overlay history", async () => {
  await ui.resize(781);
  await renderWorkspace();
  assert.ok(ui.host.querySelector("aside.campus-map-panel iframe"));
  const initialLength = ui.window.history.length;
  await ui.click(ui.host.querySelectorAll(".campus-place-list button")[1]);
  assert.match(ui.host.querySelector("aside.campus-map-panel").textContent, /Test Koordinatsız Mekân/);
  assert.equal(activeDialog(), undefined);
  assert.equal(ui.window.history.length, initialLength);
});

test("actual tab callbacks open the correct form and daily has no misleading create action", async () => {
  await renderWorkspace();
  for (const [label, kind, actionLabel] of [["Mekânlar", "place", "Mekân ekle"], ["Etkinlikler", "event", "Etkinlik ekle"], ["Konaklama", "housing", "Yurt ekle"]]) {
    await ui.click(tab(label));
    assert.equal(primary().getAttribute("aria-label"), actionLabel);
    await ui.click(primary());
    assert.equal(activeDialog().dataset.campusForm, kind);
    assert.equal(ui.window.history.state.kampiraLayer.id, "campus.create");
    await ui.travel("back");
  }
  await ui.click(tab("Bugün"));
  assert.equal(primary(), null);
  assert.equal(activeDialog(), undefined);
  assert.ok(ui.host.querySelector("[data-action-id='campus.refresh']"));
});

test("controlled create drafts survive Back, reopen, workspace remount and stay isolated by form kind and owner", async () => {
  await renderWorkspace();
  await ui.click(primary());
  await ui.fill(formField("name"), "Synthetic place draft");
  await ui.fill(formField("description"), "Only a local controlled draft, never submitted.");
  await ui.fill(formField("category"), "library");
  const wifi = [...activeDialog().querySelectorAll("button")].find((item) => item.textContent === "Wi-Fi");
  await ui.click(wifi);
  await ui.travel("back");
  await ui.click(primary());
  assert.equal(formField("name").value, "Synthetic place draft");
  assert.equal(formField("category").value, "library");
  assert.equal(wifi.getAttribute("aria-pressed"), "true");
  await ui.travel("back");
  await ui.click(tab("Etkinlikler"));
  await ui.click(primary());
  assert.equal(formField("name").value, "");
  await ui.fill(formField("name"), "Separate event draft");
  await ui.travel("back");
  await ui.render(h("div", null, "Another workspace"));
  await renderWorkspace();
  await ui.click(primary());
  assert.equal(formField("name").value, "Synthetic place draft");
  assert.equal(formField("description").value, "Only a local controlled draft, never submitted.");
  assert.equal(JSON.stringify(ui.window.history.state).includes("Synthetic place draft"), false);
  await ui.travel("back");
  await ui.render(h("div", null, "Account changed"));
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("another-owner");
  await renderWorkspace("another-owner");
  await ui.click(primary());
  assert.equal(formField("name").value, "");
  assert.ok(requests.every(({ options }) => !options?.method), "Editing drafts sends no mutations");
});

test("pending create can close with system Back; a failed response retains controlled retry values", async () => {
  await renderWorkspace();
  await ui.click(primary());
  await ui.fill(formField("name"), "Synthetic failed submission");
  await ui.fill(formField("description"), "Synthetic description for mocked failure.");
  let failRequest;
  respond = async (_url, options) => options?.method === "POST" ? new Promise((resolve) => { failRequest = () => resolve({ ok: false, json: async () => ({ error: "Synthetic save failed" }) }); }) : { ok: true, json: async () => data };
  await act(async () => activeDialog().querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(activeDialog().querySelector("[type='submit']").disabled, true);
  await ui.travel("back");
  assert.equal(activeDialog(), undefined);
  assert.equal(primary().disabled, true);
  await act(async () => failRequest());
  await ui.click(primary());
  assert.equal(formField("name").value, "Synthetic failed submission");
  assert.match(activeDialog().querySelector("[role='alert']").textContent, /Synthetic save failed/);
  assert.equal(requests.filter(({ options }) => options?.method === "POST").length, 1);
});

});
