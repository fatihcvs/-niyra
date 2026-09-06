import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, Fragment, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

// Suite-scoped fixtures also restore globals under --test-isolation=none.
test.describe("Workspace header behavior", () => {
let ui;
let host;
let WorkspaceHeader;
let WorkspaceSearch;
let ownsWorkspaceMobileHeader;
let workspaceScreenIdFromSection;
let MobileHeader;
let AppNavigationProvider;
const icon = h("svg", { "aria-hidden": true, viewBox: "0 0 24 24" }, h("path", { d: "M12 4v16M4 12h16" }));
const button = (label) => [...host.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent.trim() === label);
const click = async (element) => ui.click(element);
const render = async (children, onBack = () => {}) => ui.render(h(AppNavigationProvider, { onBack }, children));
const header = (props = {}) => h(WorkspaceHeader, { screenId: props.screenId ?? workspaceScreenIdFromSection(props.section ?? "Notlar"), section: "Notlar", title: "Ders notları", description: "Ders kaynakları", ...props });

test.beforeEach(async () => {
  ui = await createMobileDom({ view: "notes" });
  host = ui.host;
  ({ WorkspaceHeader, WorkspaceSearch, ownsWorkspaceMobileHeader } = ui.load("app/workspace-ui.tsx"));
  ({ MobileHeader } = ui.load("app/mobile-app.tsx"));
  ({ workspaceScreenIdFromSection } = ui.load("lib/workspace-capabilities.ts"));
  ({ AppNavigationProvider } = ui.load("app/app-navigation.tsx"));
});
test.afterEach(async () => { await ui.close(); });

test("eleven secondary sections hand title ownership to WorkspaceHeader while shell roots remain independent", async () => {
  const sections = ["Notlar", "Kütüphane", "Topluluklar", "Eşleş", "Bildirimler", "Kaydedilenler", "Güvenlik", "Ayarlar", "Pazar", "Kampüs", "Kampüs Anlık"];
  for (const section of sections) {
    assert.equal(ownsWorkspaceMobileHeader(workspaceScreenIdFromSection(section)), true);
    await render(h(Fragment, null, h(MobileHeader, { active: section, onBack() {}, onNavigate() {} }), header({ section })));
    assert.equal(host.querySelectorAll("header").length, 1, section);
    assert.equal(host.querySelector("header").dataset.mobileHeader, "workspace");
    assert.equal(host.querySelectorAll("h1").length, 1);
    assert.ok(button("Geri dön"));
  }
  for (const section of ["Akış", "Keşfet", "Profil", "Öğrenci", "Mesajlar"]) assert.equal(ownsWorkspaceMobileHeader(workspaceScreenIdFromSection(section)), false);
  await render(h(Fragment, null, h(MobileHeader, { active: "Keşfet", onBack() {}, onNavigate() {} }), header({ section: "Keşfet" })));
  assert.equal(host.querySelectorAll(".app-mobile-header").length, 1);
  assert.equal(host.querySelector(".workspace-header").dataset.mobileHeader, "shell", "CSS hides the desktop-only workspace header, without using action count");
  assert.equal(host.querySelectorAll(".workspace-back-button").length, 0);
});

test("primary and back callbacks remain child/context owned and fire once", async () => {
  let opened = 0;
  let back = 0;
  await render(header({ primaryAction: { id: "notes.upload", label: "Çok uzun gerçek Türkçe not yükleme işlemi", icon, onPress: () => opened++ } }), () => back++);
  const primary = host.querySelector("[data-action-id='notes.upload']");
  assert.equal(primary.getAttribute("aria-label"), "Çok uzun gerçek Türkçe not yükleme işlemi");
  assert.equal(primary.dataset.hasIcon, "true");
  await click(primary);
  await click(button("Geri dön"));
  assert.equal(opened, 1);
  assert.equal(back, 1);
  assert.equal(host.querySelector(".workspace-more-toggle"), null);
});

test("profile toolbar identity leaves the composed hero as the single level-one heading", async () => {
  let back = 0;
  await render(h(Fragment, null,
    h(MobileHeader, { active: "Öğrenci", title: "@sentetik_ogrenci", titleAs: "p", onBack: () => back++, onNavigate() {} }),
    h("section", { className: "profile-hero" }, h("h1", null, "Sentetik Öğrenci"))));
  assert.equal(host.querySelectorAll("h1").length, 1);
  assert.equal(host.querySelector("h1").textContent, "Sentetik Öğrenci");
  assert.equal(host.querySelector("header .app-mobile-header-title").tagName, "P");
  assert.equal(host.querySelector("header .app-mobile-header-title").textContent, "@sentetik_ogrenci");
  await click(button("Geri dön"));
  assert.equal(back, 1);
  await render(h(MobileHeader, { active: "Keşfet", onBack() {}, onNavigate() {} }));
  assert.equal(host.querySelector("header .app-mobile-header-title").tagName, "H1", "Existing callers keep their heading by default");
});

test("explicit secondary actions open, activate, close and return keyboard focus", async () => {
  let refreshes = 0;
  await render(header({ secondaryActions: [{ id: "refresh", label: "İçeriği yenile", onPress: () => refreshes++ }] }));
  const toggle = host.querySelector(".workspace-more-toggle");
  await click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(host.querySelector(".workspace-action-panel.is-open").id, toggle.getAttribute("aria-controls"));
  await click(button("İçeriği yenile"));
  assert.equal(refreshes, 1);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, toggle);
  await click(toggle);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, toggle);
  await click(toggle);
  await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("disabled or busy actions cannot mutate and an absent action list cannot create an empty menu", async () => {
  let mutations = 0;
  await render(header({ primaryAction: { id: "read-all", label: "Tümünü okundu yap", disabled: true, onPress: () => mutations++ }, secondaryActions: [{ id: "refresh", label: "Yenile", busy: true, onPress: () => mutations++ }] }));
  await click(button("Tümünü okundu yap"));
  await click(host.querySelector(".workspace-more-toggle"));
  await click(button("Yenile"));
  assert.equal(mutations, 0);
  assert.equal(button("Yenile").getAttribute("aria-busy"), "true");
  assert.equal(host.querySelector(".workspace-more-toggle").getAttribute("aria-expanded"), "true");
  await render(header({ primaryAction: null, secondaryActions: [] }));
  assert.equal(host.querySelector(".workspace-header-actions"), null);
  assert.ok(button("Geri dön"));
});

test("tab changes replace both label and closure, and daily removes the primary action", async () => {
  const opened = [];
  function CampusHarness() {
    const [tab, setTab] = useState("places");
    const label = { places: "Mekân ekle", events: "Etkinlik ekle", housing: "Yurt ekle" }[tab];
    return h(Fragment, null, header({ section: "Kampüs", primaryAction: label ? { id: `campus.${tab}`, label, icon, onPress: () => opened.push(tab) } : null }), ...["places", "events", "housing", "daily"].map((value) => h("button", { key: value, onClick: () => setTab(value) }, value)));
  }
  await render(h(CampusHarness));
  await click(button("Mekân ekle"));
  await click(button("events"));
  assert.equal(button("Mekân ekle"), undefined);
  await click(button("Etkinlik ekle"));
  await click(button("housing"));
  await click(button("Yurt ekle"));
  await click(button("daily"));
  assert.equal(host.querySelector(".workspace-header-primary"), null);
  assert.deepEqual(opened, ["places", "events", "housing"]);
});

test("screen identity owns capabilities independently of translated display labels", async () => {
  await render(header({ screenId: "notes", section: "My course resources", title: "Translated title" }));
  assert.equal(host.querySelector("header").dataset.mobileHeader, "workspace");
  assert.equal(host.querySelector("header").dataset.screenId, "notes");
  assert.ok(button("Geri dön"));
  await render(header({ screenId: "discover", section: "Notlar" }));
  assert.equal(host.querySelector("header").dataset.mobileHeader, "shell");
  assert.equal(host.querySelector(".workspace-back-button"), null);
});

test("search filters remain below the header and keep their independent toggle state", async () => {
  await render(h(Fragment, null, header(), h(WorkspaceSearch, { value: "", onChange() {}, placeholder: "Notlarda ara", filterCount: 1 }, h("label", null, "Ders", h("select", null, h("option", null, "MAT101"))))));
  assert.equal(host.querySelector("header input"), null);
  assert.equal(host.querySelector("header select"), null);
  const filters = host.querySelector(".workspace-filter-toggle");
  await click(filters);
  assert.equal(filters.getAttribute("aria-expanded"), "true");
  assert.equal(host.querySelector(".workspace-more-toggle"), null);
  assert.ok(host.querySelector(".workspace-filter-panel.is-open select"));
});

});
