import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const post = { id: "post-a", authorId: "author-a", name: "Örnek öğrenci", initials: "ÖÖ", avatarClass: "avatar-violet", school: "Üniversite", department: "Tasarım", time: "şimdi", course: "", text: "İlk içerik", likes: 4, comments: 0, liked: false, saved: true };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
async function setup(transport = async () => response({})) {
  const calls = [], reports = [], saved = [], edits = [], deletions = [], expired = [];
  const ui = await createMobileDom({ fetch: async (url, init) => { calls.push({ url, init }); return transport(url, init); } });
  const FeedPost = ui.load("app/feed-post.tsx").FeedPost;
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const render = (next = post, ownerScope = "owner-a", own = false) => ui.render(h(Provider, { ownerScope, onBack() {}, onSessionExpired: () => expired.push(ownerScope), onPostInteraction: (...args) => reports.push(args) }, h(FeedPost, { post: next, viewerId: own ? next.authorId : ownerScope, onSavedChange: (...args) => saved.push(args), onPostUpdated: (...args) => edits.push(args), onPostDeleted: (...args) => deletions.push(args) })));
  const button = (label) => [...ui.host.querySelectorAll("button")].find((el) => el.getAttribute("aria-label") === label || el.textContent.trim() === label);
  return { ...ui, render, button, calls, reports, saved, edits, deletions, expired };
}

test("same-frame duplicate like stays one request and a refresh cannot replace its pending optimistic state", async () => {
  let finish;
  const ui = await setup(() => new Promise((resolve) => { finish = resolve; }));
  try {
    await ui.render();
    const like = ui.button("Beğen, 4 beğeni");
    await act(async () => { like.click(); like.click(); });
    assert.equal(ui.calls.length, 1);
    assert.equal(JSON.parse(ui.calls[0].init.body).active, true);
    await ui.render({ ...post, likes: 8, text: "Ara okuma", comments: 2 });
    assert.ok(ui.button("Beğeniyi geri al, 5 beğeni"));
    assert.match(ui.host.querySelector(".post-body").textContent, /Ara okuma/);
    assert.ok(ui.button("Yorumlar, 2 yorum"));
    await act(async () => finish(response({ active: true, count: 9 })));
    assert.ok(ui.button("Beğeniyi geri al, 9 beğeni"));
    assert.equal(ui.reports.length, 1);
    await ui.render({ ...post, likes: 12, liked: true, text: "Son içerik", comments: 3 });
    assert.ok(ui.button("Beğeniyi geri al, 12 beğeni"));
    assert.ok(ui.button("Yorumlar, 3 yorum"));
    assert.match(ui.host.querySelector(".post-body").textContent, /Son içerik/);
  } finally { await ui.close(); }
});

test("unsave waits for server confirmation before the saved workspace may evict the card", async () => {
  let finish;
  const ui = await setup(() => new Promise((resolve) => { finish = resolve; }));
  try {
    await ui.render(); await ui.click(ui.button("Gönderiyi kaydet"));
    assert.equal(ui.saved.length, 0);
    await act(async () => finish(response({ error: "Kaydetme reddedildi" }, 503)));
    assert.equal(ui.saved.length, 0); assert.equal(ui.button("Gönderiyi kaydet").getAttribute("aria-pressed"), "true");
    await ui.click(ui.button("Gönderiyi kaydet"));
    await act(async () => finish(response({ active: false })));
    assert.equal(ui.saved.length, 1); assert.equal(ui.saved[0][1], false);
  } finally { await ui.close(); }
});

test("owner change and delayed JSON invalidate old post action callbacks and abort the request", async () => {
  let finishBody;
  const ui = await setup(async () => ({ ok: true, status: 200, json: () => new Promise((resolve) => { finishBody = resolve; }) }));
  try {
    await ui.render(); await ui.click(ui.button("Beğen, 4 beğeni"));
    await ui.render({ ...post, id: "post-b", text: "Yeni hesap" }, "owner-b");
    assert.equal(ui.calls[0].init.signal.aborted, true);
    await act(async () => finishBody({ active: true, count: 99 }));
    assert.equal(ui.reports.length, 0); assert.ok(ui.button("Beğen, 4 beğeni"));
    assert.doesNotMatch(ui.host.textContent, /İstek artık aktif değil/);
  } finally { await ui.close(); }
});

test("401 expires the active owner once and never parses its private response body", async () => {
  let reads = 0;
  const ui = await setup(async () => ({ status: 401, ok: false, json: async () => { reads++; return { error: "expired" }; } }));
  try {
    await ui.render(); await ui.click(ui.button("Beğen, 4 beğeni"));
    assert.deepEqual(ui.expired, ["owner-a"]); assert.equal(reads, 0); assert.equal(ui.reports.length, 0);
  } finally { await ui.close(); }
});

test("comment load prevents duplicate reads and sending before the initial list; comment submit is single-flight", async () => {
  let finish;
  const ui = await setup(() => new Promise((resolve) => { finish = resolve; }));
  try {
    await ui.render(); const comments = ui.button("Yorumlar, 0 yorum");
    await act(async () => { comments.click(); comments.click(); });
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.host.querySelector(".quick-comment input").disabled, true);
    await act(async () => finish(response({ comments: [], hasMore: false })));
    await ui.fill(ui.host.querySelector(".quick-comment input"), "Yeni yorum");
    const send = ui.button("Yorumu gönder");
    await act(async () => { send.click(); send.click(); });
    assert.equal(ui.calls.length, 2);
    await act(async () => finish(response({ comment: { id: "comment-a", authorName: "Sen", initials: "ÖÖ", content: "Yeni yorum", time: "şimdi", own: true }, count: 1 })));
    assert.equal(ui.host.querySelectorAll(".comment-list article").length, 1);
    assert.ok(ui.button("Yorumlar, 1 yorum"));
  } finally { await ui.close(); }
});

test("report sheet Back restores focus and Forward retains draft; success needs a real report record", async () => {
  let finish;
  const ui = await setup(() => new Promise((resolve) => { finish = resolve; }));
  try {
    await ui.render(); const opener = ui.button("Gönderi seçenekleri");
    await ui.click(opener); await ui.click(ui.button("Şikâyet et"));
    await ui.fill(ui.host.querySelector(".post-report-dialog textarea"), "Taslak açıklama");
    assert.equal(ui.document.body.style.overflow, "hidden");
    await ui.travel("back"); assert.equal(ui.host.querySelector("[role=dialog]"), null);
    assert.equal(ui.document.activeElement, opener); assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward"); assert.equal(ui.host.querySelector("textarea").value, "Taslak açıklama");
    const submit = ui.button("Şikâyeti gönder"); await act(async () => { submit.click(); submit.click(); });
    assert.equal(ui.calls.length, 1);
    await act(async () => finish(response({})));
    assert.match(ui.host.querySelector("[role=status]").textContent, /doğrulanamadı/);
    assert.equal(ui.host.querySelector("textarea").value, "Taslak açıklama");
    await ui.click(ui.button("Şikâyeti gönder")); await act(async () => finish(response({ report: { id: "report-a" } })));
    assert.match(ui.host.querySelector("[role=status]").textContent, /inceleme kuyruğuna/);
    assert.equal(ui.button("Şikâyeti gönder"), undefined);
  } finally { await ui.close(); }
});

test("post deletion requires the app confirmation and retains a failed request for retry", async () => {
  let finish;
  const ui = await setup(() => new Promise((resolve) => { finish = resolve; }));
  try {
    ui.window.confirm = () => { throw new Error("Native confirm should not be invoked"); };
    await ui.render(post, "owner-a", true);
    await ui.click(ui.button("Gönderi seçenekleri")); await ui.click(ui.button("Sil"));
    assert.equal(ui.calls.length, 0); assert.match(ui.host.querySelector("[role=dialog]").textContent, /geri alamazsın/);
    await ui.click(ui.button("Gönderiyi sil")); await act(async () => finish(response({ error: "Silme reddedildi" }, 503)));
    assert.equal(ui.deletions.length, 0); assert.match(ui.host.querySelector("[role=alert]").textContent, /Silme reddedildi/);
    await ui.click(ui.button("Gönderiyi sil")); await act(async () => finish(response({ deleted: true })));
    assert.equal(ui.deletions.length, 1); assert.equal(ui.host.querySelector("[role=dialog]"), null);
  } finally { await ui.close(); }
});

test("clipboard failure displays a failure rather than a copied state or blocking prompt", async () => {
  const ui = await setup();
  try {
    Object.defineProperty(ui.window.navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    ui.window.prompt = () => { throw new Error("No native prompt"); };
    await ui.render(); await ui.click(ui.button("Gönderiyi paylaş"));
    assert.match(ui.host.querySelector("[role=alert]").textContent, /paylaşılamadı/);
    assert.ok(ui.button("Gönderiyi paylaş")); assert.equal(ui.calls.length, 0);
  } finally { await ui.close(); }
});

test("native post share is cancelled when its real card unmounts and late replies cannot update the next screen", async () => {
  const ui = await createMobileDom(); const commands = [];
  try {
    ui.window.KampiraFiles = { postMessage(value) { commands.push(JSON.parse(value)); } };
    const FeedPost = ui.load("app/feed-post.tsx").FeedPost, Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
    await ui.render(h(Provider, { ownerScope: "owner-a:1", onBack() {}, onSessionExpired() {} }, h(FeedPost, { post, viewerId: "owner-a" })));
    assert.equal(commands.length, 0);
    await ui.click(ui.host.querySelector('[aria-label="Gönderiyi paylaş"]'));
    const request = commands[0]; assert.equal(request.command, "shareLink"); assert.equal(request.accountId, "owner-a"); assert.equal(request.url, "http://localhost/?post=post-a");
    await ui.render(h("main", null, "New screen"));
    assert.equal(commands.at(-1).command, "cancel"); assert.equal(commands.at(-1).requestId, request.id);
    await act(async () => ui.window.KampiraFiles.onmessage({ data: JSON.stringify({ protocolVersion: 1, id: request.id, accountId: request.accountId, state: "shareOpened" }) }));
    assert.equal(ui.host.textContent, "New screen");
  } finally { await ui.close(); }
});

for (const count of [1, 2]) test(`confirmed removal of ${count === 1 ? "the last card" : "a card"} restores connected focus after the real parent unmount`, async () => {
  const ui = await createMobileDom({ fetch: async () => response({ deleted: true }) });
  try {
    const FeedPost = ui.load("app/feed-post.tsx").FeedPost;
    const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
    function List() {
      const [items, setItems] = useState(Array.from({ length: count }, (_, index) => ({ ...post, id: `item-${index}` })));
      return h(Provider, { ownerScope: "owner-a", onBack() {}, onSessionExpired() {} }, h("section", { role: "tabpanel", tabIndex: 0 }, items.map(item => h(FeedPost, { key: item.id, post: item, viewerId: item.authorId, onPostUpdated() {}, onPostDeleted: id => setItems(current => current.filter(entry => entry.id !== id)) }))));
    }
    await ui.render(h(List));
    const button = (label) => [...ui.host.querySelectorAll("button")].find(el => el.getAttribute("aria-label") === label || el.textContent.trim() === label);
    await ui.click(button("Gönderi seçenekleri")); await ui.click(button("Sil")); await ui.click(button("Gönderiyi sil"));
    await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
    assert.equal(ui.host.querySelectorAll(".post-card").length, count - 1);
    assert.equal(ui.document.activeElement, count === 1 ? ui.host.querySelector('[role="tabpanel"]') : ui.host.querySelector(".post-menu"));
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.window.history.state?.kampiraLayer, undefined);
  } finally { await ui.close(); }
});

for (const phase of ["transport", "body"]) test(`timeout releases the post even when ${phase} ignores abort; a late success cannot publish`, async () => {
  let finish, timeout;
  const deferred = new Promise(resolve => { finish = resolve; });
  const ui = await setup(async () => phase === "transport" ? deferred : { ok: true, status: 200, json: () => deferred });
  try {
    const originalTimer = ui.window.setTimeout.bind(ui.window);
    ui.window.setTimeout = (callback, delay, ...args) => delay === 20_000 ? (timeout = callback, -1) : originalTimer(callback, delay, ...args);
    await ui.render(); await ui.click(ui.button("Beğen, 4 beğeni"));
    await act(async () => timeout());
    assert.equal(ui.calls[0].init.signal.aborted, true);
    assert.equal(ui.button("Beğen, 4 beğeni").disabled, false);
    assert.match(ui.host.querySelector("[role=alert]").textContent, /Yanıt alınamadı/);
    await act(async () => finish(phase === "transport" ? response({ active: true, count: 99 }) : { active: true, count: 99 }));
    assert.equal(ui.reports.length, 0); assert.ok(ui.button("Beğen, 4 beğeni"));
  } finally { await ui.close(); }
});
