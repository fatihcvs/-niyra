import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

test.describe("Design lab behavior", () => {
const post = { id: "fixture-string-id", authorId: "fixture-owner", name: "Galeri öğrencisi", initials: "G", avatarClass: "avatar-violet", school: "Örnek Üniversite", department: "Tasarım", time: "şimdi", audience: "platform", course: "", text: "Yalnız yerel galeri örneği.", likes: 2, comments: 0 };
let ui;
let requests;
let transport;
let nativeCalls;
let FeedPost;
let Provider;
const byLabel = (label, scope = ui.host) => [...scope.querySelectorAll("button,a")].find((element) => element.getAttribute("aria-label") === label || element.textContent.trim() === label);
const renderPost = (props = {}, onPostInteraction = () => {}) => ui.render(h(Provider, { ownerScope: "", onBack() {}, onSessionExpired() {}, onPostInteraction }, h(FeedPost, { post, ...props })));

test.beforeEach(async () => {
  requests = [];
  nativeCalls = [];
  transport = async () => { throw new Error("Unexpected gallery transport"); };
  ui = await createMobileDom({ fetch: async (url, options) => { requests.push({ url, options }); return transport(url, options); } });
  ui.window.navigator.share = async () => nativeCalls.push("share");
  Object.defineProperty(ui.window.navigator, "clipboard", { configurable: true, value: { writeText: async () => nativeCalls.push("clipboard") } });
  ui.window.confirm = () => { nativeCalls.push("confirm"); return true; };
  ui.window.prompt = () => { nativeCalls.push("prompt"); return ""; };
  FeedPost = ui.load("app/feed-post.tsx").FeedPost;
  Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
});
test.afterEach(async () => { await ui.close(); });

test("preview like, save, comments, share and author activation stay local even with a persistent-looking string ID", async () => {
  const actions = [];
  await renderPost({ preview: { onAction: (action) => actions.push(action) }, viewerId: "fixture-owner" });
  const initialUrl = ui.window.location.href;
  await ui.click(byLabel("Beğen, 2 beğeni"));
  assert.equal(byLabel("Beğeniyi geri al, 3 beğeni").getAttribute("aria-pressed"), "true");
  await ui.click(byLabel("Gönderiyi kaydet"));
  assert.equal(byLabel("Gönderiyi kaydet").getAttribute("aria-pressed"), "true");
  await ui.click(byLabel("Yorumlar, 0 yorum"));
  await ui.fill(ui.host.querySelector(".quick-comment input"), "Yalnız örnek yorum");
  await ui.click(byLabel("Yorumu gönder"));
  assert.match(ui.host.querySelector(".comment-list").textContent, /Yalnız örnek yorum/);
  await ui.click(byLabel("Yorumu sil"));
  assert.equal(ui.host.querySelector(".comment-list"), null);
  await ui.click(byLabel("Gönderiyi paylaş"));
  assert.ok(byLabel("Paylaşım simülasyonu tamamlandı"));
  await ui.click(ui.host.querySelector(".post-name-line a"));
  assert.equal(ui.window.location.href, initialUrl);
  assert.deepEqual(actions, ["share", "profile"]);
  assert.equal(requests.length, 0);
  assert.deepEqual(nativeCalls, []);
});

test("preview edit, delete and report never invoke fetch, native confirmation or a live safety action", async () => {
  const changes = [];
  const actions = [];
  await renderPost({ preview: { onAction: (action) => actions.push(action) }, viewerId: "fixture-owner", onPostUpdated: (_id, text) => changes.push(text), onPostDeleted: (id) => changes.push(id) });
  await ui.click(byLabel("Gönderi seçenekleri"));
  await ui.click(byLabel("Düzenle"));
  await ui.fill(ui.host.querySelector(".post-edit-box textarea"), "Yerel düzenleme");
  await ui.click(byLabel("Değişiklikleri kaydet"));
  assert.match(ui.host.querySelector(".post-body").textContent, /Yerel düzenleme/);
  await ui.click(byLabel("Gönderi seçenekleri"));
  await ui.click(byLabel("Sil"));
  // The app dismisses through asynchronous browser history. Complete that user
  // action before replacing the entire owner fixture with an unrelated post.
  for (let attempt = 0; attempt < 40 && ui.host.querySelector('[role="dialog"]'); attempt++) {
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
  }
  assert.equal(ui.host.querySelector('[role="dialog"]'), null);
  assert.deepEqual(changes, ["Yerel düzenleme", "fixture-string-id"]);
  await ui.render(null);
  await renderPost({ preview: { onAction: (action) => actions.push(action) }, viewerId: "another-fixture-owner" });
  await ui.click(byLabel("Gönderi seçenekleri"));
  await ui.click(byLabel("Şikâyet et"));
  await ui.fill(ui.host.querySelector(".post-report-dialog textarea"), "Sentetik rapor ayrıntısı");
  await ui.click(byLabel("Şikâyeti gönder"));
  assert.match(ui.host.querySelector(".post-report-dialog [role='status']").textContent, /Galeri simülasyonu: bildirim gönderilmedi/);
  assert.deepEqual(actions, ["delete", "report"]);
  assert.equal(requests.length, 0);
  assert.deepEqual(nativeCalls, []);
});

test("default FeedPost still reports interactions to both real owners only after server confirmation", async () => {
  let resolveRequest;
  transport = async () => new Promise((resolve) => { resolveRequest = resolve; });
  const rootReports = [];
  const profileReports = [];
  await renderPost({ onInteractionUpdated: (id, change) => profileReports.push({ id, change }) }, (id, change) => rootReports.push({ id, change }));
  await ui.click(byLabel("Beğen, 2 beğeni"));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/post-actions");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(rootReports.length, 0);
  assert.equal(profileReports.length, 0);
  await act(async () => resolveRequest({ ok: true, json: async () => ({ active: true, count: 19 }) }));
  assert.ok(byLabel("Beğeniyi geri al, 19 beğeni"));
  for (const reports of [rootReports, profileReports]) { assert.equal(reports.length, 1); assert.equal(reports[0].id, post.id); assert.equal(reports[0].change.likes, 19); assert.equal(reports[0].change.liked, true); }
});

test("default FeedPost rolls back a rejected action and does not publish an optimistic success to owners", async () => {
  transport = async () => ({ ok: false, json: async () => ({ error: "Synthetic denied request" }) });
  let reported = 0;
  await renderPost({ onInteractionUpdated: () => reported++ }, () => reported++);
  await ui.click(byLabel("Beğen, 2 beğeni"));
  assert.ok(byLabel("Beğen, 2 beğeni"));
  assert.equal(reported, 0);
  assert.match(ui.host.querySelector("[role='alert']").textContent, /Synthetic denied request/);
});

test("real gallery canvas renders fixture labels and composer/navigation/message controls mutate only gallery state", async () => {
  const { DesignLabCanvas } = ui.load("app/design-lab/design-lab.tsx");
  await ui.render(h(DesignLabCanvas));
  assert.match(ui.host.querySelector("[data-design-lab] [role='status']").textContent, /GALERİ SİMÜLASYONU/);
  assert.equal(ui.host.querySelectorAll(".feed-tabs [role='tab']").length, 3);
  assert.equal(ui.host.querySelector(".app-mobile-header-brand img").getAttribute("src"), "/brand/kampira-mark-128.png");
  await ui.click(ui.host.querySelector(".app-mobile-nav [aria-label='Paylaş']"));
  assert.ok(ui.host.querySelector(".app-post-composer"));
  await ui.fill(ui.host.querySelector("#app-post-draft"), "Galeri gönderisi, gerçek paylaşım değil.");
  await ui.click(ui.host.querySelector(".app-post-publish"));
  assert.equal(ui.host.querySelector(".app-post-composer"), null);
  assert.match(ui.host.querySelector(".feed-list").textContent, /Galeri gönderisi, gerçek paylaşım değil/);
  await ui.click(ui.host.querySelector(".app-mobile-nav [aria-label='Mesajlar']"));
  await ui.click(byLabel("Örnek konuşmayı aç"));
  assert.equal(ui.host.querySelector(".app-mobile-nav"), null, "The message detail owns the canvas height");
  assert.equal(ui.host.querySelector("[data-message-detail]").dataset.messageDetail, "true");
  await ui.fill(ui.host.querySelector("textarea"), "Yerel mesaj örneği");
  await ui.click(byLabel("Galeri mesajını ekle"));
  assert.match(ui.host.textContent, /Yerel mesaj örneği/);
  await ui.click(byLabel("Konuşma listesine dön"));
  assert.ok(ui.host.querySelector(".app-mobile-nav"));
  assert.equal(requests.length, 0);
  assert.deepEqual(nativeCalls, []);
});

test("workbench controls change the real iframe viewport, scenario, theme and reduced-motion query", async () => {
  const { DesignLab } = ui.load("app/design-lab/design-lab.tsx");
  await ui.render(h(DesignLab));
  assert.equal(ui.host.querySelector("iframe").getAttribute("width"), "390");
  await ui.click(byLabel("Başlık, arama, filtre"));
  await ui.click(byLabel("Açık"));
  await ui.fill(ui.host.querySelector("select"), "781");
  await ui.click(ui.host.querySelector("input[type='checkbox']"));
  const frame = ui.host.querySelector("iframe");
  assert.equal(frame.getAttribute("width"), "781");
  assert.match(frame.getAttribute("src"), /screen=notes&theme=light&motion=reduced/);
  assert.equal(ui.document.documentElement.dataset.theme, "light");
  assert.equal(ui.document.documentElement.dataset.reduceMotion, "true");
  assert.equal(requests.length, 0);
});

test("gallery Notes uses the real filters/detail/comment form without live fetch, file preview or upload", async () => {
  const { DesignLabCanvas } = ui.load("app/design-lab/design-lab.tsx");
  ui.window.XMLHttpRequest = class { constructor() { throw new Error("Gallery must not create an upload transport"); } };
  const until = async (predicate) => { for (let i = 0; i < 80 && !predicate(); i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 5))); assert.ok(predicate(), ui.host.textContent); };
  await ui.render(h(DesignLabCanvas, { initialScreen: "notes" }));
  await until(() => ui.host.querySelectorAll(".feature-note-card").length === 2);
  await ui.click(byLabel("Görsel hiyerarşi ve tasarım ilkeleri"));
  await until(() => ui.host.querySelector(".note-comments-panel textarea")?.disabled === false);
  await ui.fill(ui.host.querySelector(".note-comments-panel textarea"), "Galeri taslağı");
  await ui.travel("back"); await until(() => !ui.host.querySelector(".feature-detail"));
  await ui.travel("forward"); await until(() => ui.host.querySelector(".note-comments-panel textarea")?.disabled === false);
  assert.equal(ui.host.querySelector(".note-comments-panel textarea").value, "Galeri taslağı");
  await ui.click(byLabel("Yorum yap")); await until(() => ui.host.querySelector(".note-comment-list"));
  assert.match(ui.host.querySelector(".note-comment-list").textContent, /Galeri taslağı/);
  assert.equal(ui.host.querySelector(".feature-detail iframe, .feature-detail a[href*='note-file']"), null);
  await ui.travel("back"); await until(() => !ui.host.querySelector(".feature-detail"));
  await ui.click(ui.host.querySelector('[data-action-id="notes.upload"]'));
  await act(async () => ui.host.querySelector(".feature-dialog form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
  assert.match(ui.host.textContent, /Galeri simülasyonu: dosya sunucuya yüklenmedi/);
  assert.equal(requests.length, 0); assert.deepEqual(nativeCalls, []);
});

test("the design-lab route denies production, test and unknown environments before reading search parameters", async () => {
  await ui.close();
  for (const environment of ["production", "test", ""]) {
    let notFoundCalls = 0;
    let paramsRead = false;
    ui = await createMobileDom({ environment, packages: { "next/navigation": { notFound: () => { notFoundCalls++; throw new Error("EXPECTED_NOT_FOUND"); } } } });
    const route = ui.load("app/design-lab/page.tsx").default;
    await assert.rejects(route({ searchParams: { then() { paramsRead = true; } } }), /EXPECTED_NOT_FOUND/);
    assert.equal(notFoundCalls, 1);
    assert.equal(paramsRead, false);
    await ui.close();
  }
  ui = await createMobileDom({ environment: "development", packages: { "next/navigation": { notFound: () => { throw new Error("Development route should be open"); } } } });
  const route = ui.load("app/design-lab/page.tsx").default;
  const page = await route({ searchParams: Promise.resolve({ canvas: "1", theme: "light", screen: "messages" }) });
  assert.equal(page.props.initialScreen, "messages");
  assert.equal(page.props.theme, "light");
});

});
