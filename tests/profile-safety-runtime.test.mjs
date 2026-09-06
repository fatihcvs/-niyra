import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const preferences = { blocked: [], muted: [{ public_id: "target" }] };
async function setup(transport) {
  const calls = [], changes = [];
  const ui = await createMobileDom({ fetch: async (url, options) => { calls.push({ url, options }); return transport(url, options); } });
  const Safety = ui.load("app/profile-safety-menu.tsx").ProfileSafetyMenu;
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const store = ui.load("lib/workspace-state.ts");
  store.setWorkspaceStateOwnerScope("owner-a");
  const render = (owner = "owner-a", target = "target") => ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() {}, onSafetyChanged(...args) { changes.push(args); } }, h(Safety, { targetId: target, targetName: "Örnek öğrenci" })));
  const button = (name) => [...ui.host.querySelectorAll("button")].find((el) => el.textContent.trim() === name || el.getAttribute("aria-label") === name);
  return { ...ui, calls, changes, render, button, store };
}

test("safety opens with server preferences and sends an explicit desired state, once while pending", async () => {
  let resolve;
  const ui = await setup(async (_url, options) => options.method === "POST" ? new Promise((finish) => { resolve = finish; }) : { ok: true, status: 200, json: async () => preferences });
  try {
    await ui.render(); await ui.click(ui.button("Güvenlik"));
    const mute = [...ui.host.querySelectorAll("button")].find((el) => el.querySelector("strong")?.textContent === "Sessizi kaldır");
    assert.ok(mute); assert.equal(mute.disabled, false);
    await ui.click(mute); await ui.click(mute);
    const posts = ui.calls.filter((call) => call.options.method === "POST");
    assert.equal(posts.length, 1);
    assert.deepEqual(JSON.parse(posts[0].options.body), { action: "mute", targetId: "target", active: false });
    await act(async () => resolve({ ok: true, status: 200, json: async () => ({ active: false }) }));
    assert.deepEqual(ui.changes, [["target", "mute", false]]);
    assert.match(ui.host.textContent, /Kısıtlama kaldırıldı/);
  } finally { await ui.close(); }
});

test("report draft survives Back/reopen and async server success clears it without touching a stale event target", async () => {
  const ui = await setup(async (_url, options) => ({ ok: true, status: options.method === "POST" ? 201 : 200, json: async () => options.method === "POST" ? { report: { id: "fixture-report" } } : preferences }));
  try {
    await ui.render(); await ui.click(ui.button("Güvenlik"));
    await ui.fill(ui.host.querySelector("textarea"), "Sentetik rapor açıklaması");
    await ui.travel("back"); await ui.click(ui.button("Güvenlik"));
    assert.equal(ui.host.querySelector("textarea").value, "Sentetik rapor açıklaması");
    await ui.click(ui.button("Şikâyeti gönder"));
    assert.equal(ui.host.querySelector("textarea").value, "");
    assert.match(ui.host.textContent, /Şikâyetin kaydedildi/);
  } finally { await ui.close(); }
});

test("account change never restores another account's report draft or accepts its late action", async () => {
  let resolve;
  const ui = await setup(async (_url, options) => options.method === "POST" ? new Promise((finish) => { resolve = finish; }) : { ok: true, status: 200, json: async () => preferences });
  try {
    await ui.render(); await ui.click(ui.button("Güvenlik"));
    await ui.fill(ui.host.querySelector("textarea"), "Owner A private fixture");
    await ui.click(ui.button("Şikâyeti gönder"));
    ui.store.setWorkspaceStateOwnerScope("owner-b"); await ui.render("owner-b");
    await ui.click(ui.button("Güvenlik"));
    await act(async () => resolve({ ok: true, status: 201, json: async () => ({ report: { id: "late-a" } }) }));
    assert.equal(ui.host.querySelector("textarea").value, "");
    assert.doesNotMatch(ui.host.textContent, /Şikâyetin kaydedildi|Owner A/);
  } finally { await ui.close(); }
});
