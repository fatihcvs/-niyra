import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { act, createElement as h, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import ts from "typescript";
import postcss from "postcss";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Home");
const declarations = (name) => home.body.statements.find((statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations.some((node) => node.name.getText(ast) === name));
const effect = (text) => home.body.statements.find((statement) => ts.isExpressionStatement(statement) && statement.getText(ast).startsWith("useEffect(") && statement.getText(ast).includes(text));
const actual = (node, name) => { assert.ok(node, `${name} is wired in Home`); return node.getText(ast); };
const stateNames = ["[activeNav, setActiveNav]", "[feedTab, setFeedTab]", "feedGeneration", "feedReadController", "feedReadIdentity", "feedPageRequest", "feedPanel", "[posts, setPosts]", "[postsLoading, setPostsLoading]", "[nextCursor, setNextCursor]", "[loadingMore, setLoadingMore]", "[feedError, setFeedError]"];
// Mount the actual Home feed state, first read, refresh integration and pagination.
// Unrelated auth forms, campus catalog and composer UI are outside this bounded fixture.
const harnessCode = ts.transpileModule(`
function Harness({owner = 'owner-a', revision = 0, revalidation = 0, onState, onExpired}) {
  ${stateNames.map((name) => actual(declarations(name), name)).join("\n")}
  const [linkedPost, setLinkedPost] = useState(null);
  const profileState = owner ? 'ready' : 'auth-required';
  const studentProfile = owner ? {publicId:owner} : null;
  const sessionRevision = revision, profileRevision = revalidation;
  const mobileComposerOpen = false, editingProfile = null, publishing = false;
  const draft = '', draftMedia = null, composerCourseId = null;
  const setDraftAudience = () => {};
  const restoreScroll = useRef(null), scrollTransition = useRef(null), pageLocation = useRef('');
  ${actual(declarations("authenticatedFetch"), "authenticatedFetch")}
  function expireSession() { onExpired(); }
  ${actual(declarations("feedRefresh"), "feedRefresh")}
  ${actual(declarations("restoreFeed"), "restoreFeed")}
  ${actual(declarations("acceptLoadedFeed"), "acceptLoadedFeed")}
  ${actual(effect("async function loadPosts()"), "loadPosts effect")}
  ${actual(effect("feedPageRequest.current?.controller.abort()"), "pagination cleanup effect")}
  ${actual(home.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "loadMorePosts"), "loadMorePosts")}
  ${actual(home.body.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "changeFeed"), "changeFeed")}
  useEffect(() => {
    const back = () => { restoreFeed(); setActiveNav(new URLSearchParams(window.location.search).get('view') === 'messages' ? 'Mesajlar' : 'Akış'); };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useLayoutEffect(() => onState({posts, nextCursor, postsLoading, loadingMore, feedError, feedTab, feedGeneration, feedRefresh, loadMorePosts, changeFeed, setActiveNav}));
  return activeNav === 'Akış' ? h('section', null,
    h(FeedRefreshNotice, {...feedRefresh, onRefresh:() => void feedRefresh.refresh()}),
    h('div', {id:'feed-posts', ref:feedPanel, tabIndex:-1, 'aria-busy':feedRefresh.busy || undefined}, posts.map(post => h('article', {key:post.id, 'data-post-id':post.id}, post.text))),
    feedError && h('p', {role:'alert'}, feedError),
    h('button', {onClick:() => void feedRefresh.refresh(), disabled:feedRefresh.busy}, 'Yenile'),
    nextCursor && h('button', {onClick:() => void loadMorePosts(), disabled:loadingMore || feedRefresh.busy}, 'Devamı')) : h('div', null, activeNav);
}
globalThis.Harness = Harness;`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const post = (id) => ({ id, text: `SENTETİK test gönderisi ${id}`, name: "SENTETİK Öğrenci", initials: "SÖ", avatarClass: "", school: "Test", department: "Test", time: "Şimdi", course: "GENEL", likes: 0, comments: 0 });
const page = (ids, cursor = null) => ({ posts: ids.map(post), nextCursor: cursor });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const flush = async (callback = () => {}) => act(async () => { callback(); await new Promise((resolve) => setImmediate(resolve)); });

async function setup() {
  const requests = [];
  const ui = await createMobileDom({ view: "feed", fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) });
  const timers = new Map();
  let time = 0, timerId = 0, state, owner = "owner-a", revision = 0, revalidation = 0, expired = 0, visible = true;
  const scrolls = [];
  ui.window.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { due: time + delay, callback }); return id; };
  ui.window.clearTimeout = (id) => timers.delete(id);
  ui.window.scrollTo = (options) => scrolls.push(options);
  Object.defineProperty(ui.document, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
  const context = {
    h, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, window: ui.window, document: ui.document, AbortController, URL, URLSearchParams, Error,
    require: createRequire(import.meta.url), exports: {},
    ...ui.load("app/use-authenticated-fetch.ts"), ...ui.load("app/use-feed-refresh.ts"), ...ui.load("app/feed-refresh-notice.tsx"), ...ui.load("lib/feed-refresh.ts"),
    ...ui.load("lib/mobile-navigation.ts"), ...ui.load("lib/feed-scope.ts"),
  };
  runInNewContext(harnessCode, context);
  const render = () => ui.render(h(context.Harness, { owner, revision, revalidation, onState: (current) => { state = current; }, onExpired: () => { expired++; } }));
  const tick = async (milliseconds) => {
    const target = time + milliseconds;
    for (let turn = 0; turn < 100; turn++) {
      const next = [...timers].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) { time = target; return; }
      time = next[1].due; timers.delete(next[0]); await flush(next[1].callback);
    }
    throw new Error("Unexpected timer loop");
  };
  await render();
  return {
    ...ui, requests, timers, scrolls, state: () => state, expired: () => expired, tick,
    async resolve(index, data, status = 200) { await flush(() => requests[index].resolve(response(data, status))); },
    async visibility(value) { visible = value; await flush(() => ui.document.dispatchEvent(new ui.window.Event("visibilitychange"))); },
    async account(value, nextRevision = revision) { owner = value; revision = nextRevision; await render(); },
    async revalidate() { revalidation++; await render(); },
    async route(name) { await flush(() => { ui.window.history.pushState({}, "", name === "Mesajlar" ? "/?view=messages" : "/"); state.setActiveNav(name); }); },
    async back() { await ui.travel("back"); await tick(0); },
    async twoPages() { await this.resolve(0, page(["p12", "p11"], "older:page2")); await flush(() => void state.loadMorePosts()); await this.resolve(1, page(["p10", "p9"], "older:page3")); },
  };
}

test("new server items show one named CTA without changing two cached pages, cursor or scroll; click performs a fresh read", async () => {
  const ui = await setup();
  try {
    await ui.twoPages();
    const posts = ui.state().posts;
    await ui.tick(45_000);
    assert.equal(ui.requests[2].url, "/api/posts?feed=all");
    assert.equal(ui.requests[2].options.cache, "no-store");
    await ui.resolve(2, page(["p13", "p12"], "check-only-cursor"));
    assert.equal(ui.state().posts, posts);
    assert.equal(ui.state().nextCursor, "older:page3");
    assert.equal(ui.scrolls.length, 0);
    const cta = ui.host.querySelector('[aria-label="Yeni paylaşımları göster ve akışı yenile"]');
    assert.equal(cta.textContent, "Yeni paylaşımlar");
    assert.equal(cta.getAttribute("aria-controls"), "feed-posts");
    assert.equal(ui.host.querySelector('[role="status"]').textContent, "Yeni paylaşımlar var.");
    await ui.click(cta);
    assert.equal(ui.requests.length, 4, "do not reuse an aging background response as authoritative refresh");
    assert.equal(ui.state().posts, posts);
    assert.equal(ui.state().nextCursor, "older:page3");
    assert.equal(ui.host.querySelector("#feed-posts").getAttribute("aria-busy"), "true");
    assert.equal(ui.scrolls.length, 1);
    assert.equal(ui.scrolls[0].top, 0);
    await ui.resolve(3, page(["p14", "p13"], "refreshed:page2"));
    assert.deepEqual(Array.from(ui.state().posts, (item) => item.id), ["p14", "p13"]);
    assert.equal(ui.state().nextCursor, "refreshed:page2");
    assert.equal(ui.host.querySelector('[aria-label="Yeni paylaşımları göster ve akışı yenile"]'), null);
    assert.equal(ui.document.activeElement.id, "feed-posts");
  } finally { await ui.close(); }
});

test("the notice does not allocate a new list row and keeps a 48px keyboard-accessible target", () => {
  const css = postcss.parse(readFileSync(new URL("../app/feed-refresh-notice.module.css", import.meta.url), "utf8"));
  const layer = css.nodes.find((rule) => rule.selector === ".layer");
  const button = css.nodes.find((rule) => rule.selector === ".button");
  const declaration = (rule, property) => rule.nodes.find((node) => node.prop === property)?.value;
  assert.equal(declaration(layer, "height"), "0");
  assert.equal(declaration(layer, "position"), "sticky");
  assert.equal(declaration(layer, "pointer-events"), "none");
  assert.equal(declaration(button, "position"), "absolute");
  assert.equal(declaration(button, "min-height"), "48px");
  assert.equal(declaration(button, "pointer-events"), "auto");
  assert.ok(css.nodes.some((rule) => rule.selector === ".button:focus-visible"));
});

test("refresh rejection and timeout retain loaded pages and the retry cursor; duplicate actions are single-flight", async () => {
  const ui = await setup();
  try {
    await ui.twoPages(); const posts = ui.state().posts;
    await flush(() => { void ui.state().feedRefresh.refresh(); void ui.state().feedRefresh.refresh(); });
    assert.equal(ui.requests.length, 3);
    await ui.resolve(2, { error: "SENTETİK bağlantı hatası" }, 503);
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /bağlantı hatası/);
    await flush(() => void ui.state().feedRefresh.refresh());
    await ui.tick(20_000);
    assert.equal(ui.requests[3].options.signal.aborted, true);
    assert.equal(ui.state().feedRefresh.busy, false, "abort-ignoring transports must not leave an infinite spinner");
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    await ui.resolve(3, page(["late"], "wrong"));
    assert.equal(ui.state().posts, posts);
    await flush(() => void ui.state().feedRefresh.refresh());
    await ui.resolve(4, page(["recovered"], "retry:page2"));
    assert.equal(ui.state().posts[0].id, "recovered"); assert.equal(ui.state().feedError, "");
  } finally { await ui.close(); }
});

test("hidden tabs abort checks and manual refresh; Back keeps the notice, loaded second page and cursor", async () => {
  const ui = await setup();
  try {
    await ui.twoPages(); const posts = ui.state().posts;
    await ui.tick(45_000); await ui.visibility(false);
    assert.equal(ui.requests[2].options.signal.aborted, true);
    await ui.resolve(2, page(["hidden-result"]));
    await ui.tick(90_000); assert.equal(ui.requests.length, 3);
    assert.equal(ui.state().feedRefresh.available, false);
    await ui.visibility(true); await ui.tick(45_000); await ui.resolve(3, page(["fresh", "p12"]));
    const generation = ui.state().feedGeneration.current;
    await ui.route("Mesajlar"); await ui.tick(90_000); assert.equal(ui.requests.length, 4);
    await ui.back();
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    assert.equal(ui.state().feedGeneration.current, generation);
    assert.equal(ui.state().feedRefresh.available, true);
    assert.equal(ui.requests.length, 4, "returning to the feed must not fetch and replace page one");
    await flush(() => void ui.state().feedRefresh.refresh());
    await ui.visibility(false); assert.equal(ui.requests[4].options.signal.aborted, true);
    await ui.resolve(4, page(["hidden-manual"]));
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().feedRefresh.busy, false);
  } finally { await ui.close(); }
});

test("refresh aborts pending pagination; a late old page cannot attach to the refreshed cursor", async () => {
  const ui = await setup();
  try {
    await ui.resolve(0, page(["p12", "p11"], "older:page2"));
    await flush(() => { void ui.state().loadMorePosts(); void ui.state().loadMorePosts(); });
    assert.equal(ui.requests.length, 2);
    await ui.tick(45_000); // pagination times out at 20s; no background check until 45s after that.
    assert.equal(ui.requests.length, 2); assert.equal(ui.state().nextCursor, "older:page2");
    await flush(() => void ui.state().loadMorePosts());
    assert.equal(ui.requests[2].url, "/api/posts?feed=all&cursor=older%3Apage2");
    await flush(() => void ui.state().feedRefresh.refresh());
    assert.equal(ui.requests[2].options.signal.aborted, true);
    await ui.resolve(3, page(["fresh"], "new-page2"));
    await ui.resolve(2, page(["stale-older"], "wrong-page3"));
    assert.deepEqual(Array.from(ui.state().posts, (item) => item.id), ["fresh"]);
    assert.equal(ui.state().nextCursor, "new-page2");
  } finally { await ui.close(); }
});

test("scope and account changes invalidate delayed reads and isolate the notice", async () => {
  const ui = await setup();
  try {
    await ui.twoPages(); await ui.tick(45_000); await ui.resolve(2, page(["fresh-a"]));
    await flush(() => void ui.state().feedRefresh.refresh());
    await flush(() => ui.state().changeFeed("campus"));
    assert.equal(ui.requests[3].options.signal.aborted, true);
    assert.equal(ui.state().feedRefresh.available, false);
    assert.equal(ui.requests[4].url, "/api/posts?feed=campus");
    await ui.resolve(4, page(["campus-a"], "campus-cursor"));
    await ui.resolve(3, page(["stale-all"], "wrong"));
    assert.equal(ui.state().posts[0].id, "campus-a");
    await ui.tick(45_000); // check starts for owner A
    await ui.account("owner-b", 1);
    assert.equal(ui.requests[5].options.signal.aborted, true);
    await ui.resolve(6, page(["campus-b"], "b-cursor"));
    await ui.resolve(5, page(["private-a"]));
    assert.equal(ui.state().posts[0].id, "campus-b");
    assert.equal(ui.state().feedRefresh.available, false);
    await ui.tick(45_000); await ui.resolve(7, { error: "Expired" }, 401);
    assert.equal(ui.expired(), 1);
    await ui.account("");
    assert.equal(ui.state().feedRefresh.available, false);
    await ui.tick(90_000); assert.equal(ui.requests.length, 8);
  } finally { await ui.close(); }
});

test("unrelated revalidation while away from the feed never replaces cached pagination on return", async () => {
  const ui = await setup();
  try {
    await ui.twoPages(); const posts = ui.state().posts;
    await ui.route("Mesajlar"); await ui.revalidate();
    await ui.resolve(2, page(["revalidated-new", "p12"], "first-page-cursor"));
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    await ui.back();
    assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    assert.equal(ui.state().feedRefresh.available, true);
    assert.equal(ui.scrolls.length, 0);
  } finally { await ui.close(); }
});

test("a ready empty feed also waits for a deliberate refresh; a new owner clears the old notice", async () => {
  const ui = await setup();
  try {
    await ui.resolve(0, page([])); await ui.revalidate();
    await ui.resolve(1, page(["first-post"]));
    assert.equal(ui.state().posts.length, 0); assert.equal(ui.state().nextCursor, null);
    assert.equal(ui.state().feedRefresh.available, true);
    await ui.account("owner-b", 1); await ui.resolve(2, page(["owner-b-post"]));
    assert.equal(ui.state().posts[0].id, "owner-b-post");
    assert.equal(ui.state().feedRefresh.available, false);
    await ui.account("owner-a", 2); await ui.resolve(3, page([]));
    assert.equal(ui.state().feedRefresh.available, false, "revisiting the old identity must not resurrect an obsolete notice");
  } finally { await ui.close(); }
});

test("deletions, updates, malformed successes and failed background checks never manufacture a notice or overwrite pages", async () => {
  const ui = await setup();
  try {
    await ui.twoPages(); const posts = ui.state().posts;
    const samples = [page(["p11", "older-refill"]), { posts: [{ ...post("p12"), text: "SENTETİK düzenleme" }], nextCursor: null }, { posts: [{ id: "malformed" }] }, page(["duplicate", "duplicate"]), { posts: [post("unknown")], nextCursor: 42 }];
    for (const sample of samples) {
      await ui.tick(45_000); await ui.resolve(ui.requests.length - 1, sample);
      assert.equal(ui.state().feedRefresh.available, false);
      assert.equal(ui.state().posts, posts); assert.equal(ui.state().nextCursor, "older:page3");
    }
    await ui.tick(45_000); await ui.resolve(ui.requests.length - 1, { error: "offline" }, 503);
    assert.equal(ui.state().feedError, "");
    await ui.tick(45_000); const pending = ui.requests.at(-1);
    await ui.close(); assert.equal(pending.options.signal.aborted, true);
    assert.equal(ui.timers.size, 0);
    pending.resolve(response(page(["after-unmount"])));
  } finally { if (ui.host.isConnected) await ui.close(); }
});
