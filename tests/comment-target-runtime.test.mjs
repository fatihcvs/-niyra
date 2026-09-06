import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const comment = (id) => ({ id, authorId: "author", authorName: "Örnek öğrenci", initials: "ÖÖ", content: `Seçilen yorum ${id}`, time: "şimdi", own: true });
const focus = (id, postId = `post-${id}`) => ({ postId, comment: comment(id), comments: [comment("recent-a"), comment("recent-b")], hasMore: true });
const post = (id) => ({ id, authorId: "author", name: "Örnek öğrenci", initials: "ÖÖ", avatarClass: "avatar-violet", school: "Üniversite", department: "Tasarım", time: "şimdi", course: "", text: `Üst gönderi ${id}`, likes: 0, comments: 35 });
const response = (data, status = data.error ? 404 : 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

async function setup({ direct = "", reply = async (_url, _init, id) => focus(id) } = {}) {
  const calls = [], copied = [], expired = [];
  const ui = await createMobileDom({ view: "notifications", fetch: async (url, init) => {
    calls.push({ url, init });
    const target = new URL(url, "http://localhost");
    if (target.pathname === "/api/posts") return response({ post: post(target.searchParams.get("id")) });
    const result = await reply(url, init, target.searchParams.get("commentId"));
    return result?.json ? result : response(result);
  } });
  if (direct) ui.window.history.replaceState({ kampiraDepth: 0 }, "", direct);
  let scope = "owner-a";
  Object.defineProperty(ui.window.navigator, "clipboard", { configurable: true, value: { writeText: async (value) => copied.push(value) } });
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope(scope);
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const Component = ui.load("app/post-comment-target.tsx").PostCommentTarget;
  const links = ui.load("lib/app-links.ts");
  const render = () => ui.render(h(Provider, { ownerScope: scope, onBack() {}, onSessionExpired() { expired.push(scope); } }, h("main", {}, "Bildirimler"), h(Component, { viewerId: "author", viewerInitials: "ÖÖ", onPostUpdated() {}, onPostDeleted() {} })));
  const until = async (predicate) => { for (let n = 0; n < 120 && !predicate(); n++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); assert.ok(predicate(), ui.host.textContent); };
  const target = () => ui.host.querySelector('[aria-label="Bağlantıdaki yorum"]');
  const button = (label) => [...ui.host.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === label || element.textContent.trim() === label);
  await render();
  return { ...ui, calls, copied, expired, target, until, button, render, navigate: (href) => act(async () => links.navigateAppHref(href)), async owner(next) { scope = next; ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope(next); await render(); } };
}

test("twenty exact comment notifications preserve one Back/Forward step and focus the comment instead of opening the keyboard", async () => {
  const ui = await setup();
  try {
    const { notificationHref } = ui.load("lib/workspace-navigation.ts");
    for (let index = 0; index < 20; index++) {
      const id = `target-${index}`;
      await ui.navigate(notificationHref("comment", id));
      await ui.until(() => ui.target()?.textContent.includes(`Seçilen yorum ${id}`));
      assert.match(ui.host.textContent, new RegExp(`Üst gönderi post-${id}`));
      assert.equal(ui.host.querySelectorAll(`[data-comment-id="${id}"]`).length, 1);
      await ui.until(() => ui.document.activeElement === ui.target());
      assert.equal(ui.window.history.state.kampiraDepth, 1);
      assert.equal(ui.host.querySelector("main").inert, true);
      await ui.travel("back"); await ui.until(() => !ui.target());
      assert.equal(ui.window.location.search, "?view=notifications");
      await ui.travel("forward"); await ui.until(() => ui.target()?.textContent.includes(`Seçilen yorum ${id}`));
      assert.equal(ui.window.history.state.kampiraDepth, 1);
      await ui.travel("back"); await ui.until(() => !ui.target());
    }
  } finally { await ui.close(); }
});

test("direct comment links close in place, remove the related post key, and reject a mismatched parent", async () => {
  const ui = await setup({ direct: "/?comment=a&post=post-a", reply: async (_url, _init, id) => focus(id) });
  try {
    await ui.until(() => ui.target());
    assert.equal(ui.window.history.length, 1);
    await ui.click(ui.button("Yorumu kapat")); await ui.until(() => !ui.host.querySelector('[role="dialog"]'));
    assert.equal(ui.window.location.search, ""); assert.equal(ui.window.history.length, 1);
    await ui.navigate("/?view=feed&comment=a&post=wrong");
    await ui.until(() => ui.host.querySelector('[role="alert"]'));
    assert.equal(ui.target(), null); assert.doesNotMatch(ui.host.textContent, /Üst gönderi/);
    assert.equal(ui.calls.some((call) => call.url === "/api/posts?id=wrong"), false);
  } finally { await ui.close(); }
});

test("late A cannot replace B; closing B returns to A without losing or deleting its target", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ui = await setup({ reply: async (_url, _init, id) => id === "a" ? pending : focus(id) });
  try {
    await ui.navigate("/?view=feed&comment=a"); await ui.until(() => ui.calls.length > 0);
    await ui.navigate("/?view=feed&comment=b"); await ui.until(() => ui.target()?.textContent.includes("Seçilen yorum b"));
    await act(async () => release(focus("a")));
    assert.match(ui.target().textContent, /Seçilen yorum b/); assert.equal(ui.window.history.state.kampiraDepth, 2);
    await ui.click(ui.button("Yorumu kapat")); await ui.until(() => ui.target()?.textContent.includes("Seçilen yorum a"));
    assert.equal(ui.window.location.search, "?view=feed&comment=a"); assert.equal(ui.window.history.state.kampiraDepth, 1);
  } finally { await ui.close(); }
});

test("removed targets are rechecked on Forward and visibility, and cannot restore a cached comment or post", async () => {
  let removed = false;
  const ui = await setup({ reply: async (_url, _init, id) => removed ? { error: "Yorum bulunamadı veya erişim iznin yok." } : focus(id) });
  try {
    await ui.navigate("/?view=feed&comment=a"); await ui.until(() => ui.target());
    await ui.travel("back"); removed = true;
    await ui.travel("forward"); await ui.until(() => ui.host.querySelector('[role="alert"]'));
    assert.equal(ui.target(), null); assert.doesNotMatch(ui.host.textContent, /Üst gönderi/);
    removed = false; await ui.click(ui.button("Tekrar dene")); await ui.until(() => ui.target());
    removed = true;
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => ui.document.dispatchEvent(new ui.window.Event("visibilitychange")));
    await ui.until(() => !ui.target()); assert.doesNotMatch(ui.host.textContent, /Üst gönderi|Seçilen yorum/);
  } finally { await ui.close(); }
});

test("switching owner aborts the comment request including late bodies; a new owner's 401 body remains unread", async () => {
  let release, parsed = 0, call = 0;
  const ui = await setup({ direct: "/?comment=a", reply: async () => ++call === 1 ? { ok: true, status: 200, json: () => new Promise((resolve) => { release = resolve; }) } : { ok: false, status: 401, json: async () => { parsed++; return {}; } } });
  try {
    await ui.until(() => Boolean(release)); await ui.owner("owner-b");
    assert.equal(ui.calls[0].init.signal.aborted, true);
    await act(async () => release(focus("a")));
    await ui.until(() => ui.expired.length === 1);
    assert.equal(parsed, 0); assert.equal(ui.target(), null); assert.doesNotMatch(ui.host.textContent, /Üst gönderi|Seçilen yorum/);
  } finally { await ui.close(); }
});

test("copying a comment preserves its parent while sharing the post clears unrelated comment and workspace keys", async () => {
  const ui = await setup({ direct: "/?view=feed&comment=a&post=post-a" });
  try {
    await ui.until(() => ui.target());
    await ui.click(ui.target().querySelector('[aria-label="Yorum bağlantısını kopyala"]'));
    assert.equal(ui.copied[0], "http://localhost/?view=feed&comment=a&post=post-a");
    await ui.click(ui.button("Gönderiyi paylaş"));
    assert.equal(ui.copied[1], "http://localhost/?post=post-a");
    assert.equal(ui.calls.some((call) => call.init.method === "POST"), false);
  } finally { await ui.close(); }
});

test("confirmed deletion of the targeted comment clears its detail and remains retryable without a cached restore", async () => {
  let removed = false;
  const ui = await setup({ direct: "/?comment=a", reply: async (_url, init, id) => { if (init.method === "DELETE") { removed = true; return { deleted: true, id: "a", count: 34 }; } return removed ? { error: "Yorum bulunamadı." } : focus(id); } });
  try {
    await ui.until(() => ui.target()); await ui.click(ui.target().querySelector('[aria-label="Yorumu sil"]'));
    await ui.until(() => ui.host.querySelector('[role="alert"]')?.textContent.includes("kaldırıldı"));
    assert.equal(ui.target(), null); assert.doesNotMatch(ui.host.textContent, /Üst gönderi/);
    await ui.click(ui.button("Tekrar dene")); await ui.until(() => ui.host.querySelector('[role="alert"]')?.textContent.includes("bulunamadı"));
    assert.equal(ui.target(), null);
  } finally { await ui.close(); }
});
