import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { IDBFactory } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

async function setup() {
  const ui = await createMobileDom();
  Object.defineProperty(ui.window, "indexedDB", { value: new IDBFactory(), configurable: true });
  const api = ui.load("lib/market-draft-store.ts");
  const createStore = api.createMarketDraftStore;
  let nextSaveGate = null;
  api.createMarketDraftStore = (...args) => {
    const store = createStore(...args), save = store.save;
    store.save = async (...values) => { const gate = nextSaveGate; nextSaveGate = null; const result = await save(...values); if (gate) { gate.started(); await gate.released; } return result; };
    return store;
  };
  const { useMarketDraft } = ui.load("app/use-market-draft.ts");
  function Harness() {
    const [snapshot, setSnapshot] = useState(api.emptyMarketDraft);
    const draft = useMarketDraft({ ownerId: "owner-a", snapshot, paused: false, onRestore: setSnapshot, onInvalidate() {} });
    return h("section", null,
      h("output", { "data-state": draft.view.state }, draft.view.message),
      h("input", { "aria-label": "İlan başlığı", value: snapshot.forms.listing?.title ?? "", disabled: draft.blocked,
        onChange: (event) => setSnapshot((current) => ({ ...current, forms: { ...current.forms, listing: { title: event.target.value } } })) }));
  }
  const until = async (predicate) => { for (let count = 0; count < 150; count++) { if (predicate()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(predicate(), ui.host.textContent); };
  const inspect = async () => { const store = api.createMarketDraftStore(); store.setOwner({ publicId: "owner-a", confirmed: true }); try { return (await store.load()).record; } finally { store.dispose(); } };
  await ui.render(h(Harness)); await until(() => !ui.host.querySelector("input").disabled);
  function holdNextSave() { let started, release; const entered = new Promise((resolve) => { started = resolve; }); const released = new Promise((resolve) => { release = resolve; }); nextSaveGate = { started, released }; return { entered, release }; }
  return { ...ui, until, inspect, holdNextSave, clearDrafts: () => api.clearMarketDraftsOnLogout(), renderDraft: () => ui.render(h(Harness)), phase: () => ui.host.querySelector("output").dataset.state };
}

test("saved status disappears immediately when a previously durable field changes", async () => {
  const ui = await setup(); try {
    await ui.fill(ui.host.querySelector("input"), "İlk kaydedilen başlık"); await ui.until(() => ui.phase() === "saved");
    await ui.fill(ui.host.querySelector("input"), "Henüz kaydedilmemiş yeni başlık");
    assert.notEqual(ui.phase(), "saved", "A stale saved label must not encourage closing before the latest edit is durable");
    await ui.until(() => ui.phase() === "saved");
    assert.equal((await ui.inspect()).forms.listing.title, "Henüz kaydedilmemiş yeni başlık");
  } finally { await ui.close(); }
});

test("leaving the workspace immediately after typing preserves the last field edit", async () => {
  const ui = await setup(); try {
    await ui.fill(ui.host.querySelector("input"), "Son harf de korunmalı");
    await ui.render(null);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    await ui.renderDraft(); await ui.until(() => !ui.host.querySelector("input").disabled);
    assert.equal(ui.host.querySelector("input").value, "Son harf de korunmalı");
  } finally { await ui.close(); }
});

test("a slow completed autosave cannot replace newer keystrokes with its older fields", async () => {
  const ui = await setup(); try {
    const gate = ui.holdNextSave();
    await ui.fill(ui.host.querySelector("input"), "İlk sürüm");
    await act(async () => { await gate.entered; });
    await ui.fill(ui.host.querySelector("input"), "Daha yeni kullanıcı metni");
    await act(async () => gate.release());
    assert.equal(ui.host.querySelector("input").value, "Daha yeni kullanıcı metni");
    await ui.until(() => ui.phase() === "saved");
    assert.equal((await ui.inspect()).forms.listing.title, "Daha yeni kullanıcı metni");
  } finally { await ui.close(); }
});

test("logout while an unmounted workspace drains its writes never restores the private draft", async () => {
  const ui = await setup(); try {
    const gate = ui.holdNextSave();
    await ui.fill(ui.host.querySelector("input"), "Çıkışta silinecek özel metin");
    await ui.render(null); await gate.entered;
    assert.equal((await ui.clearDrafts()).status, "cleared");
    gate.release();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(await ui.inspect(), null);
  } finally { await ui.close(); }
});
