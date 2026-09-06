import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const peer = (id) => ({ publicId: id, displayName: `Öğrenci ${id}`, handle: id, universityShortName: "TEST", departmentName: "Test" });
const conversation = (id, erased = false) => ({ id, person: erased ? { publicId: null, deleted: true, displayName: "Silinmiş hesap", handle: "", universityShortName: "", departmentName: "", avatarUrl: null } : peer(id), readOnly: erased, preview: `Kendi mesajım ${id}`, lastMessageOwn: true, unreadCount: 0, time: "şimdi" });
const message = (id, own = true) => ({ id, own, body: own ? `Korunan kendi mesajım ${id}` : `Silinecek özel mesaj ${id}`, createdAt: "2026-09-01T00:00:00.000Z", attachmentType: null, attachmentId: null, attachment: null, read: false, removed: false, time: "şimdi" });
async function setup({ erased = true } = {}) {
  const state = { erased }; const calls = [];
  const rows = () => [conversation("thread-a", state.erased), conversation("thread-b", true)];
  const ui = await createMobileDom({ view: "messages", fetch: async (url, options = {}) => {
    calls.push({ url, options }); const query = new URL(url, "http://localhost").searchParams; const id = query.get("conversationId");
    return { ok: true, status: 200, json: async () => options.method === "PATCH" ? { read: true } : { conversations: rows(), conversationId: id, messages: id ? [message(id), ...(!state.erased && id === "thread-a" ? [message("old-subject", false)] : [])] : [], shareables: [], olderCursor: null } };
  } });
  const drafts = ui.load("lib/message-drafts.ts"); drafts.setMessageOwnerScope("owner");
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("owner");
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider; const Component = ui.load("app/direct-messages.tsx").DirectMessagesWorkspace;
  const until = async (predicate) => { for (let index = 0; index < 120 && !predicate(); index++) await act(async () => new Promise((resolve) => setTimeout(resolve, 4))); assert.ok(predicate(), ui.host.textContent); };
  await ui.render(h(Provider, { ownerScope: "owner", onBack() {}, onSessionExpired() {} }, h(Component, { initialRecipient: null, onNavigate() {}, onUnreadChange() {} })));
  await until(() => [...ui.host.querySelectorAll('aside[aria-label="Konuşmalar"] button')].some((item) => item.textContent.includes("Kendi mesajım thread-a")));
  const open = async (id) => { await ui.click([...ui.host.querySelectorAll('aside[aria-label="Konuşmalar"] button')].find((item) => item.textContent.includes(`Kendi mesajım ${id}`))); await until(() => ui.host.textContent.includes(`Korunan kendi mesajım ${id}`)); };
  return { ...ui, calls, state, drafts: drafts.messageSessionState, until, open };
}

test("two erased peers have distinct read-only histories without composer, person menu or profile identity", async () => {
  const ui = await setup();
  try {
    await ui.open("thread-a");
    assert.ok(ui.host.querySelector('[aria-label="Silinmiş hesap ile mesajlar"]'));
    assert.equal(ui.host.querySelector("textarea"), null); assert.equal(ui.host.querySelector('[aria-label="Kişi seçenekleri"]'), null);
    assert.match(ui.host.textContent, /Bu hesap silindi/); assert.doesNotMatch(ui.host.textContent, /@erased|Öğrenci thread-a/);
    await ui.open("thread-b"); assert.doesNotMatch(ui.host.querySelector('[aria-label="Silinmiş hesap ile mesajlar"]').textContent, /Korunan kendi mesajım thread-a/);
    await ui.open("thread-a"); assert.doesNotMatch(ui.host.querySelector('[aria-label="Silinmiş hesap ile mesajlar"]').textContent, /Korunan kendi mesajım thread-b/);
    assert.ok(ui.drafts.readThread("owner", "erased:thread-a")); assert.ok(ui.drafts.readThread("owner", "erased:thread-b"));
    assert.equal(ui.calls.some((call) => call.options.method === "POST"), false);
  } finally { await ui.close(); }
});

test("an active-to-erased peer refresh clears stale peer messages and the former draft before showing canonical own history", async () => {
  const ui = await setup({ erased: false });
  try {
    await ui.open("thread-a"); assert.match(ui.host.textContent, /Silinecek özel mesaj old-subject/);
    await ui.fill(ui.host.querySelector("textarea"), "Gönderilmeyecek özel taslak"); assert.equal(ui.drafts.readThread("owner", "thread-a")?.text, "Gönderilmeyecek özel taslak");
    ui.state.erased = true;
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "hidden" }); await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" }); await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    await ui.until(() => ui.host.textContent.includes("Bu hesap silindi") && ui.host.textContent.includes("Korunan kendi mesajım thread-a"));
    assert.doesNotMatch(ui.host.textContent, /Silinecek özel mesaj|Gönderilmeyecek özel taslak|Öğrenci thread-a/);
    assert.equal(ui.host.querySelector("textarea"), null); assert.equal(ui.drafts.readThread("owner", "thread-a"), undefined);
    assert.equal(ui.drafts.readThread("owner", "erased:thread-a")?.text, "");
    await ui.open("thread-b"); await ui.open("thread-a"); assert.doesNotMatch(ui.host.textContent, /Silinecek özel mesaj/);
  } finally { await ui.close(); }
});
