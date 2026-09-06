import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const person = { publicId: "peer", displayName: "[SYNTHETIC] Deniz", handle: "synthetic-deniz", universityShortName: "TEST", departmentName: "Test" };
const message = (id, own = false) => ({ id, own, body: `[SYNTHETIC] ${id}\nİğdır, Şişli`, createdAt: "2026-09-05T09:00:00.000Z", read: false, removed: false, attachment: null, attachmentType: null, attachmentId: null, time: "şimdi" });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const dialog = (ui) => [...ui.host.querySelectorAll('[role="dialog"]')].at(-1);
const button = (container, text) => [...container.querySelectorAll("button")].find((item) => item.textContent === text);
async function until(ui, check) { for (let i = 0; i < 160; i++) { if (check()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(check(), ui.host.textContent); }
const submit = (ui) => act(async () => dialog(ui).querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));

async function setup() {
  const requests = [], restrictions = [], safetyChanges = [], expired = [];
  const ui = await createMobileDom({ view: "messages", fetch: (url, options) => { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; } });
  const { AppNavigationProvider: Provider } = ui.load("app/app-navigation.tsx");
  const { MessageContextActions: Actions } = ui.load("app/message-context-actions.tsx");
  const workspace = ui.load("lib/workspace-state.ts");
  let setOwner;
  function Content() {
    const [target, setTarget] = useState(null);
    return h("main", null,
      h("button", { id: "received", onClick: () => setTarget({ person, message: message("received") }) }, "Received"),
      h("button", { id: "own", onClick: () => setTarget({ person, message: message("own", true) }) }, "Own"),
      h("button", { id: "person", onClick: () => setTarget({ person }) }, "Person"),
      h(Actions, { target, onClose: () => setTarget(null), onRestore: setTarget, onRestriction: (target, active) => restrictions.push([target.publicId, active]) }));
  }
  function Harness() {
    const [owner, updateOwner] = useState("owner-a:1");
    setOwner = (next) => { workspace.setWorkspaceStateOwnerScope(next); updateOwner(next); };
    return owner ? h(Provider, { key: owner, ownerScope: owner, onBack() {}, onSessionExpired() { expired.push(owner); setOwner(null); }, onSafetyChanged: (...args) => safetyChanges.push(args) }, h(Content)) : h("p", null, "Giriş gerekli");
  }
  workspace.setWorkspaceStateOwnerScope("owner-a:1");
  await ui.render(h(Harness));
  return { ...ui, requests, restrictions, safetyChanges, expired,
    switchOwner: (next) => act(async () => setOwner(next)),
    resolve: (request, body, status = 200) => act(async () => request.resolve(Response.json(body, { status }))) };
}

test("message menu copies exact text only after clipboard success, reports denial, and Back restores the visible opener", async () => {
  const ui = await setup(); const clipboard = [];
  Object.defineProperty(ui.window.navigator, "clipboard", { configurable: true, value: { writeText: (text) => { const write = { text, ...deferred() }; clipboard.push(write); return write.promise; } } });
  try {
    await ui.click(ui.host.querySelector("#received"));
    assert.ok(button(dialog(ui), "Mesajı şikâyet et"));
    assert.equal(button(dialog(ui), "Sil"), undefined);
    await ui.click(button(dialog(ui), "Metni kopyala"));
    assert.equal(clipboard[0].text, message("received").body);
    assert.doesNotMatch(dialog(ui).textContent, /kopyalandı/);
    await act(async () => clipboard[0].resolve());
    assert.match(dialog(ui).querySelector('[role="status"]').textContent, /kopyalandı/);
    await ui.click(button(dialog(ui), "Metni kopyala"));
    await act(async () => clipboard[1].reject(new Error("Permission denied")));
    assert.match(dialog(ui).querySelector('[role="alert"]').textContent, /kopyalanamadı/);
    await ui.travel("back");
    assert.equal(dialog(ui), undefined); assert.equal(ui.document.activeElement.id, "received");
    await ui.click(ui.host.querySelector("#own"));
    assert.ok(button(dialog(ui), "Metni kopyala"));
    assert.equal(button(dialog(ui), "Mesajı şikâyet et"), undefined, "own messages have no report or fake delete action");
    await ui.key("Escape"); assert.equal(dialog(ui), undefined); assert.equal(ui.document.activeElement.id, "own");
    assert.equal(ui.requests.length, 0, "text copy does not upload message content");
  } finally { await ui.close(); }
});

test("nested report keeps its controlled draft on Back and failure, sends the exact received target once, and requires a server report ID", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.host.querySelector("#received")); await ui.click(button(dialog(ui), "Mesajı şikâyet et"));
    await ui.fill(dialog(ui).querySelector("select"), "privacy");
    await ui.fill(dialog(ui).querySelector("textarea"), "[SYNTHETIC] Selected message only");
    await ui.travel("back");
    assert.equal(dialog(ui).getAttribute("aria-labelledby"), "dm-context-title");
    assert.equal(ui.document.activeElement.textContent, "Mesajı şikâyet et");
    await ui.travel("forward");
    assert.equal(dialog(ui).querySelector("textarea").value, "[SYNTHETIC] Selected message only");
    await submit(ui); await submit(ui);
    assert.equal(ui.requests.length, 1);
    assert.deepEqual(JSON.parse(ui.requests[0].options.body), { action: "report", entityType: "direct-message", entityId: "received", reason: "privacy", details: "[SYNTHETIC] Selected message only" });
    await ui.resolve(ui.requests[0], { error: "Sentetik geçici hata" }, 503);
    assert.match(dialog(ui).querySelector('[role="alert"]').textContent, /geçici hata/);
    assert.equal(dialog(ui).querySelector("textarea").value, "[SYNTHETIC] Selected message only");
    await submit(ui); await ui.resolve(ui.requests[1], {});
    assert.match(dialog(ui).querySelector('[role="alert"]').textContent, /doğrulanamadı/);
    assert.equal(dialog(ui).querySelector("textarea").value, "[SYNTHETIC] Selected message only");
    await submit(ui); await ui.resolve(ui.requests[2], { report: { id: "synthetic-report", status: "open" } }, 201);
    assert.match(dialog(ui).querySelector('[role="status"]').textContent, /kaydedildi/);
    assert.equal(dialog(ui).querySelector("textarea").value, "");
    assert.equal(button(dialog(ui), "Şikâyeti gönder").disabled, true);
    await submit(ui); assert.equal(ui.requests.length, 3, "a confirmed report cannot be submitted twice");
  } finally { await ui.close(); }
});

test("person block loads server state, requires confirmation, never applies failure, and removes the explicit preference on unblock", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.host.querySelector("#person"));
    assert.equal(button(dialog(ui), "Kişiyi engelle").disabled, true);
    await ui.resolve(ui.requests[0], { blocked: [] });
    assert.deepEqual(ui.restrictions, [["peer", false]]);
    await ui.click(button(dialog(ui), "Kişiyi engelle"));
    assert.equal(ui.requests.length, 1, "opening confirmation sends no mutation");
    await ui.click(button(dialog(ui), "Engelle"));
    assert.deepEqual(JSON.parse(ui.requests[1].options.body), { action: "block", targetId: "peer", active: true });
    await ui.resolve(ui.requests[1], { error: "Sentetik sunucu hatası" }, 503);
    assert.deepEqual(ui.restrictions, [["peer", false]]);
    await ui.click(button(dialog(ui), "Engelle")); await ui.resolve(ui.requests[2], { active: true });
    assert.deepEqual(ui.restrictions, [["peer", false], ["peer", true]]);
    assert.deepEqual(ui.safetyChanges, [["peer", "block", true]]);
    await ui.travel("back"); await ui.click(button(dialog(ui), "Engeli kaldır"));
    await ui.click(button(dialog(ui), "Engeli kaldır"));
    assert.deepEqual(JSON.parse(ui.requests[3].options.body), { action: "block", targetId: "peer", active: false });
    await ui.resolve(ui.requests[3], { active: false });
    assert.deepEqual(ui.safetyChanges.at(-1), ["peer", "block", false]);
    await ui.travel("back"); await ui.click(button(dialog(ui), "Kişiyi şikâyet et")); await submit(ui);
    assert.deepEqual(JSON.parse(ui.requests[4].options.body), { action: "report", entityType: "user", entityId: "peer", reason: "harassment", details: "" });
    await ui.resolve(ui.requests[4], { report: { id: "synthetic-user-report" } }, 201);
  } finally { await ui.close(); }
});

test("Back during a block request dismisses its layers but still applies a confirmed server preference to the same owner", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.host.querySelector("#person")); await ui.resolve(ui.requests[0], { error: "Sentetik durum hatası" }, 503);
    assert.equal(button(dialog(ui), "Kişiyi engelle").disabled, true);
    await ui.click(button(dialog(ui), "Durumu yeniden dene")); await ui.resolve(ui.requests[1], { blocked: [] });
    await ui.click(button(dialog(ui), "Kişiyi engelle")); await ui.click(button(dialog(ui), "Engelle"));
    await ui.travel("back"); await ui.travel("back"); assert.equal(dialog(ui), undefined);
    await ui.resolve(ui.requests[2], { active: true });
    assert.deepEqual(ui.restrictions, [["peer", false], ["peer", true]]);
    assert.deepEqual(ui.safetyChanges, [["peer", "block", true]]);
    assert.equal(dialog(ui), undefined, "late success does not reopen a dismissed dialog");
  } finally { await ui.close(); }
});

test("owner changes fence pending clipboard, report and safety responses; active 401 expires the current session", async () => {
  const ui = await setup(); const copy = deferred();
  Object.defineProperty(ui.window.navigator, "clipboard", { value: { writeText: () => copy.promise }, configurable: true });
  try {
    await ui.click(ui.host.querySelector("#received")); await ui.click(button(dialog(ui), "Metni kopyala"));
    await ui.switchOwner("owner-b:2"); await act(async () => copy.resolve());
    assert.equal(dialog(ui), undefined); assert.doesNotMatch(ui.host.textContent, /kopyalandı/);
    await ui.click(ui.host.querySelector("#received")); await ui.click(button(dialog(ui), "Mesajı şikâyet et")); await submit(ui);
    await ui.switchOwner("owner-c:3"); await ui.resolve(ui.requests[0], { report: { id: "old-report" } }, 201);
    assert.doesNotMatch(ui.host.textContent, /kaydedildi/);
    await ui.click(ui.host.querySelector("#person")); const old = ui.requests[1];
    await ui.switchOwner("owner-d:4"); await ui.resolve(old, { blocked: [{ public_id: "peer" }] });
    assert.deepEqual(ui.restrictions, []);
    await ui.click(ui.host.querySelector("#person"));
    let bodyReads = 0;
    await act(async () => ui.requests[2].resolve({ status: 401, ok: false, json: async () => { bodyReads++; return { error: "Oturum gerekli" }; } }));
    assert.equal(bodyReads, 0, "an expired owner's response body is not consumed");
    assert.deepEqual(ui.expired, ["owner-d:4"]); assert.equal(ui.host.textContent, "Giriş gerekli");
  } finally { await ui.close(); }
});

test("report body parsing is owner-fenced, timed-out requests release busy state, and unmount aborts pending transport", async () => {
  const ui = await setup(); const timers = new Map(); let timerId = 9000;
  const originalTimeout = ui.window.setTimeout.bind(ui.window), originalClear = ui.window.clearTimeout.bind(ui.window);
  ui.window.setTimeout = (callback, duration, ...args) => { if (duration !== 20000) return originalTimeout(callback, duration, ...args); const id = ++timerId; timers.set(id, callback); return id; };
  ui.window.clearTimeout = (id) => { if (!timers.delete(id)) originalClear(id); };
  let closed = false;
  try {
    await ui.click(ui.host.querySelector("#received")); await ui.click(button(dialog(ui), "Mesajı şikâyet et"));
    await ui.fill(dialog(ui).querySelector("textarea"), "[SYNTHETIC] Recoverable report draft");
    await submit(ui);
    await act(async () => { [...timers.values()][0](); });
    assert.equal(ui.requests[0].options.signal.aborted, true);
    assert.match(dialog(ui).querySelector('[role="alert"]').textContent, /zaman aşımına/);
    assert.equal(dialog(ui).querySelector("textarea").value, "[SYNTHETIC] Recoverable report draft");
    assert.equal(button(dialog(ui), "Şikâyeti gönder").disabled, false);
    let lateReads = 0;
    await act(async () => ui.requests[0].resolve({ status: 201, ok: true, json: async () => { lateReads++; return { report: { id: "late-timeout" } }; } }));
    assert.equal(lateReads, 0, "an abort-ignoring late transport cannot consume or apply its body");
    await submit(ui);
    const hangingBody = deferred();
    await act(async () => ui.requests[1].resolve({ status: 201, ok: true, json: () => hangingBody.promise }));
    await act(async () => { [...timers.values()][0](); });
    assert.equal(button(dialog(ui), "Şikâyeti gönder").disabled, false, "a body parser that ignores AbortSignal is still bounded");
    assert.match(dialog(ui).querySelector('[role="alert"]').textContent, /zaman aşımına/);
    await act(async () => hangingBody.resolve({ report: { id: "late-json" } }));
    assert.doesNotMatch(dialog(ui).textContent, /kaydedildi/);
    await submit(ui);
    const parsed = deferred(); let reads = 0;
    await act(async () => ui.requests[2].resolve({ status: 201, ok: true, json: () => { reads++; return parsed.promise; } }));
    assert.equal(reads, 1);
    await ui.switchOwner("owner-b:2");
    assert.equal(ui.requests[2].options.signal.aborted, true);
    await act(async () => parsed.resolve({ report: { id: "old-owner-report" } }));
    assert.doesNotMatch(ui.host.textContent, /kaydedildi/);
    await ui.click(ui.host.querySelector("#person"));
    const pending = ui.requests[3];
    await ui.close(); closed = true;
    assert.equal(pending.options.signal.aborted, true);
    await act(async () => pending.reject(new DOMException("Unmounted", "AbortError")));
  } finally { if (!closed) await ui.close(); }
});

test("the actual gallery DM menu labels simulations and never invokes network, clipboard or live safety callbacks", async () => {
  const calls = [], native = [];
  const ui = await createMobileDom({ view: "messages", fetch: async (...args) => { calls.push(args); throw new Error("Gallery must never request the server"); } });
  Object.defineProperty(ui.window.navigator, "clipboard", { configurable: true, value: { writeText: async (...args) => native.push(args) } });
  try {
    const { DesignLabCanvas } = ui.load("app/design-lab/design-lab.tsx");
    await ui.render(h(DesignLabCanvas, { initialScreen: "messages" }));
    await ui.click(button(ui.host, "Örnek konuşmayı aç"));
    await ui.click(ui.host.querySelector('[aria-label="Galeri gelen mesaj seçenekleri"]'));
    assert.match(dialog(ui).textContent, /Galeri simülasyonu/);
    await ui.click(button(dialog(ui), "Metni kopyala")); assert.match(dialog(ui).querySelector('[role="status"]').textContent, /gerçek panoya yazılmadı/);
    await ui.click(button(dialog(ui), "Mesajı şikâyet et"));
    await ui.fill(dialog(ui).querySelector("textarea"), "Yalnız galeri formu"); await submit(ui);
    assert.match(dialog(ui).querySelector('[role="status"]').textContent, /sunucuda kayıt oluşturulmadı/);
    await ui.travel("back"); await ui.travel("back");
    await ui.click(ui.host.querySelector('[aria-label="Galeri kişi seçenekleri"]'));
    await ui.click(button(dialog(ui), "Kişiyi engelle")); await ui.click(button(dialog(ui), "Engelle"));
    assert.match(dialog(ui).querySelector('[role="status"]').textContent, /gerçek hesap durumu değişmedi/);
    await ui.travel("back"); await ui.click(button(dialog(ui), "Engeli kaldır")); await ui.click(button(dialog(ui), "Engeli kaldır"));
    assert.match(dialog(ui).textContent, /Galeri simülasyonu/);
    assert.deepEqual(calls, []); assert.deepEqual(native, []);
  } finally { await ui.close(); }
});

test("actual DM workspace clears confirmed blocked recipient cache and draft, rejects an already pending send response, and offers unblock", async () => {
  const packages = {}, requests = [];
  const conversation = { id: "conversation-peer", person, preview: "[SYNTHETIC] Preview", lastMessageOwn: false, unreadCount: 1, time: "şimdi" };
  const ui = await createMobileDom({ view: "messages", packages, fetch: (url, options) => {
    if (url.startsWith("/api/messages") && options?.method !== "POST") return Promise.resolve(Response.json({ conversations: [conversation], messages: [message("received"), message("own", true), { ...message("removed"), removed: true }], olderCursor: null, shareables: [] }));
    const request = { url, options, ...deferred() }; requests.push(request); return request.promise;
  } });
  try {
    for (const name of ["message-scroll", "latest-request", "mobile-navigation"]) packages[`@/lib/${name}`] = ui.load(`lib/${name}.ts`);
    const store = ui.load("lib/message-drafts.ts").createMessageSessionState({ createKey: () => "synthetic-send-key" });
    packages["@/lib/message-drafts"] = { messageSessionState: store };
    store.setOwnerScope("owner-a:1");
    ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("owner-a:1");
    const { AppNavigationProvider: Provider } = ui.load("app/app-navigation.tsx");
    const { DirectMessagesWorkspace: Workspace } = ui.load("app/direct-messages.tsx");
    await ui.render(h(Provider, { ownerScope: "owner-a:1", onBack() {} }, h(Workspace, { initialRecipient: person, onNavigate() {}, onUnreadChange() {} })));
    await until(ui, () => ui.host.querySelectorAll(".messageActions").length === 2);
    await ui.fill(ui.host.querySelector('textarea[aria-label="Mesajın"]'), "[SYNTHETIC] Unsaved private draft");
    await ui.click(ui.host.querySelector('[aria-label="Mesajı gönder"]'));
    assert.equal(requests[0].url, "/api/messages"); assert.equal(store.attempt("owner-a:1", "peer").status, "sending");
    await ui.click(ui.host.querySelector('[aria-label="Kişi seçenekleri"]'));
    await act(async () => requests[1].resolve(Response.json({ blocked: [] })));
    await ui.click(button(dialog(ui), "Kişiyi engelle")); await ui.click(button(dialog(ui), "Engelle"));
    await act(async () => requests[2].resolve(Response.json({ active: true })));
    assert.equal(store.isRestricted("owner-a:1", "peer"), true);
    assert.equal(store.readThread("owner-a:1", "peer"), undefined); assert.equal(store.attempt("owner-a:1", "peer"), undefined);
    assert.equal(store.readSession("owner-a:1").conversations.length, 0);
    assert.equal(ui.host.querySelector('textarea[aria-label="Mesajın"]').value, "");
    assert.equal(ui.host.querySelector('textarea[aria-label="Mesajın"]').disabled, true);
    await ui.travel("back"); await ui.click(button(dialog(ui), "Engeli kaldır")); await ui.click(button(dialog(ui), "Engeli kaldır"));
    await act(async () => requests[3].resolve(Response.json({ active: false })));
    await until(ui, () => !ui.host.querySelector('textarea[aria-label="Mesajın"]').disabled);
    await act(async () => requests[0].resolve(Response.json({ conversationId: conversation.id, message: message("late-commit", true) })));
    assert.doesNotMatch(ui.host.textContent, /late-commit/);
    assert.equal(store.attempt("owner-a:1", "peer"), undefined, "block then unblock cannot revive an invalidated attempt");
  } finally { await ui.close(); }
});
