import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const peer = (id) => ({ publicId: id, displayName: `Öğrenci ${id}`, handle: id, universityShortName: "TEST", departmentName: "Test" });
const conversation = (id) => ({ id, person: peer(id), preview: "Örnek sohbet", lastMessageOwn: false, unreadCount: 0, time: "şimdi" });
const payload = (id, messageId) => ({ conversationId: id, conversations: [conversation(id)], messages: [], shareables: [], olderCursor: null, ...(messageId ? { linkedMessage: { id: messageId, body: `Seçilen ${messageId}`, own: false, createdAt: "2025-01-01T00:00:00Z" } } : {}) });
async function setup({ direct = "", targetReply } = {}) {
  const calls = [];
  const ui = await createMobileDom({ view: "messages", fetch: async (url, init) => {
    calls.push({ url, init }); const params = new URL(url, "http://localhost").searchParams;
    const id = params.get("conversationId") ?? params.get("messageId")?.replace("message", "thread");
    const data = id ? await targetReply?.(id, params.get("messageId"), init) ?? payload(id, params.get("messageId")) : { conversations: [], messages: [], shareables: [] };
    return { ok: !data.error, status: data.error ? 404 : 200, json: async () => data };
  } });
  if (direct) ui.window.history.replaceState({ kampiraDepth: 0 }, "", direct);
  ui.load("lib/message-drafts.ts").setMessageOwnerScope("owner");
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("owner");
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const Component = ui.load("app/direct-messages.tsx").DirectMessagesWorkspace;
  const links = ui.load("lib/app-links.ts");
  await ui.render(h(Provider, { ownerScope: "owner", onBack() {}, onSessionExpired() {} }, h(Component, { initialRecipient: null, onNavigate() {}, onUnreadChange() {} })));
  const until = async (predicate) => { for (let index = 0; index < 130 && !predicate(); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); assert.ok(predicate(), ui.host.textContent); };
  return { ...ui, calls, until, navigate: (href) => act(async () => links.navigateAppHref(href)) };
}

test("message links resolve the actual thread, show the linked message and preserve a single Back/Forward step", async () => {
  const ui = await setup();
  try {
    await ui.navigate("/?view=messages&message=message-a");
    await ui.until(() => ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]')?.textContent.includes("Seçilen message-a"));
    assert.ok(ui.host.querySelector('[aria-label="Öğrenci thread-a ile mesajlar"]'));
    assert.equal(ui.window.history.state.kampiraDepth, 1);
    await ui.travel("back"); await ui.until(() => ui.host.querySelector('[data-message-thread="false"]'));
    assert.equal(ui.window.location.search, "?view=messages");
    await ui.travel("forward"); await ui.until(() => ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]'));
    assert.equal(ui.window.history.state.kampiraDepth, 1);
    assert.equal(ui.calls.some((call) => call.init.method === "POST"), false);
  } finally { await ui.close(); }
});

test("direct conversation link closes to its list in place; hidden links never render a cached thread", async () => {
  const ui = await setup({ direct: "/?view=messages&conversation=thread-a", targetReply: (id, messageId) => id === "hidden" ? { error: "Mesaj bulunamadı veya erişim iznin yok." } : payload(id, messageId) });
  try {
    await ui.until(() => ui.host.querySelector('[data-message-thread="true"]'));
    assert.equal(ui.window.history.length, 1);
    await ui.click(ui.host.querySelector('[aria-label="Konuşmalara dön"]'));
    await ui.until(() => ui.host.querySelector('[data-message-thread="false"]'));
    assert.equal(ui.window.location.search, "?view=messages"); assert.equal(ui.window.history.length, 1);
    await ui.navigate("/?view=messages&conversation=hidden"); await ui.until(() => ui.host.querySelector('[role="alert"]')?.textContent.includes("Mesaj bulunamadı"));
    assert.equal(ui.host.querySelector('[data-message-thread="true"]'), null);
  } finally { await ui.close(); }
});

test("late target resolution cannot change another message link or return private data after owner replacement", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ui = await setup({ targetReply: (id, messageId) => id === "thread-a" ? pending : payload(id, messageId) });
  try {
    await ui.navigate("/?view=messages&message=message-a"); await ui.until(() => ui.calls.some((call) => call.url.includes("messageId=message-a")));
    await ui.navigate("/?view=messages&message=message-b"); await ui.until(() => ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]')?.textContent.includes("message-b"));
    await act(async () => release(payload("thread-a", "message-a")));
    assert.match(ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]').textContent, /message-b/);
    await act(async () => ui.load("lib/message-drafts.ts").setMessageOwnerScope("different-owner"));
    assert.equal(ui.host.querySelector('[data-message-thread="true"]'), null);
  } finally { await ui.close(); }
});

test("rechecking a removed linked message clears its preview and private thread content", async () => {
  let removed = false;
  const ui = await setup({ direct: "/?view=messages&message=message-a", targetReply: (id, messageId) => removed ? { error: "Mesaj bulunamadı veya erişim iznin yok." } : payload(id, messageId) });
  try {
    await ui.until(() => ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]'));
    removed = true;
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    await ui.until(() => !ui.host.querySelector('[aria-label="Bağlantıdaki mesaj"]'));
    assert.doesNotMatch(ui.host.textContent, /Seçilen message-a/);
  } finally { await ui.close(); }
});
