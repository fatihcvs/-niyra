import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const text = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Home");
const effects = home.body.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(syntax) === "useEffect").map((node) => node.expression.arguments[0]);
function declaration(name, root = home.body) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(syntax) === name) result = node;
    ts.forEachChild(node, visit);
  }
  visit(root);
  assert.ok(result, name);
  return result;
}
function execute(arrow, context) {
  const code = ts.transpileModule(`globalThis.run = ${arrow.getText(syntax)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, context);
  return context.run();
}
const restoreFeed = declaration("restoreFeed").initializer.arguments[0];
const restoreLocation = declaration("restoreLocation").initializer;
const restoreScroll = effects.find((node) => node.getText(syntax).includes("const pending = restoreScroll.current"));
const sharedRead = effects.find((node) => node.getText(syntax).includes("async function loadSharedPost"));

function state() {
  const context = {
    URLSearchParams, URL, AbortController,
    window: { location: new URL("https://kampira.example/?view=notes"), history: { state: { kampiraScrollY: 620 } }, addEventListener() {}, removeEventListener() {} },
    document: { querySelector: () => null }, exports: {},
    feedScopeFromSearch: (search) => new URLSearchParams(search).get("feed") || "all",
    pageLocationWithoutComposer: (href) => { const url = new URL(href); url.searchParams.delete("compose"); return `${url.pathname}${url.search}`; },
    workspaceFromSearch: (search) => ({ notes: "Notlar", messages: "Mesajlar", profile: "Profil" })[new URLSearchParams(search).get("view")] || "Akış",
    feedTab: "all", posts: [{ id: "page-one" }, { id: "page-two" }], nextCursor: "page-three", postsLoading: false,
    loadingMore: true, linkedPost: null, feedGeneration: { current: 7 }, draft: "Draft", draftMedia: null, composerCourseId: null,
    pageLocation: { current: "/?view=messages" }, restoreScroll: { current: null }, sharedPostFocused: { current: true },
    activeNav: "Mesajlar", publicProfileLoading: false, profileReloadToken: 0, profileRevision: 0,
    restoreSearchContext: () => {},
    publicProfileRequest: { current: { cancel() {} } },
    profileOwnerId: { current: "own" },
  };
  for (const name of ["FeedTab", "Posts", "LinkedPost", "NextCursor", "LoadingMore", "PostsLoading", "DraftAudience", "MobileComposerOpen", "EditingProfile", "FollowError", "PublicProfileLoading", "ActiveNav", "PublicProfile", "ProfileReloadToken", "MarketTab"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    context[`set${name}`] = (value) => { context[key] = typeof value === "function" ? value(context[key]) : value; };
  }
  context.setProfileRevision = () => { throw new Error("History must not force a first-page feed refresh"); };
  context.restoreFeed = () => execute(restoreFeed, context);
  runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/scroll-restoration.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  context.restoreAppScroll = context.exports.restoreAppScroll;
  return context;
}

test("same-feed Back keeps loaded pages, cursor and in-flight pagination generation", () => {
  const context = state();
  const posts = context.posts;
  execute(restoreLocation, context);
  assert.equal(context.posts, posts);
  assert.equal(context.nextCursor, "page-three");
  assert.equal(context.loadingMore, true);
  assert.equal(context.feedGeneration.current, 7);
  assert.equal(context.postsLoading, false);
  assert.equal(context.profileReloadToken, 1, "public profile URL loading remains active");
  assert.equal(context.activeNav, "Notlar");
  assert.deepEqual({ ...context.restoreScroll.current }, { top: 620, destination: "Notlar", location: "/?view=notes" });
});

test("a different feed scope still resets its list and invalidates late pagination replies", () => {
  const context = state();
  context.window.location = new URL("https://kampira.example/?feed=campus");
  execute(restoreLocation, context);
  assert.equal(context.feedTab, "campus");
  assert.equal(context.posts.length, 0);
  assert.equal(context.nextCursor, null);
  assert.equal(context.loadingMore, false);
  assert.equal(context.postsLoading, true);
  assert.equal(context.feedGeneration.current, 8);
});

test("same-URL message/editor and composer history steps bypass workspace resets", () => {
  const context = state();
  context.pageLocation.current = "/?view=messages";
  context.window.location = new URL("https://kampira.example/?view=messages&compose=1");
  context.window.history.state.kampiraEditor = "details";
  const posts = context.posts;
  execute(restoreLocation, context);
  assert.equal(context.mobileComposerOpen, true);
  assert.equal(context.editingProfile, "details");
  assert.equal(context.posts, posts);
  assert.equal(context.profileReloadToken, 0);
  assert.equal(context.restoreScroll.current, null);
  assert.equal(context.feedGeneration.current, 7);
});

function scrollHarness(context) {
  const frames = new Map();
  let id = 0;
  const scrolls = [];
  context.window.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id; };
  context.window.cancelAnimationFrame = (key) => frames.delete(key);
  context.window.scrollTo = (options) => scrolls.push(options);
  return { frames, scrolls, flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); } };
}

test("non-feed scroll is independent of feed loading and survives a canceled pre-paint frame", () => {
  const context = state();
  context.activeNav = "Notlar";
  context.postsLoading = true;
  const pending = { top: 620, destination: "Notlar", location: "/?view=notes" };
  context.restoreScroll.current = pending;
  const browser = scrollHarness(context);
  const cleanup = execute(restoreScroll, context);
  assert.equal(browser.frames.size, 1);
  cleanup();
  assert.equal(context.restoreScroll.current, pending);
  execute(restoreScroll, context);
  browser.flush();
  assert.equal(browser.scrolls.length, 0, "restoration waits for a stable destination layout");
  browser.flush();
  assert.equal(browser.scrolls[0].top, 620);
  assert.equal(context.restoreScroll.current, null);
});

test("feed and public profile restoration wait for their own content, and a newer location cancels stale scroll", () => {
  const context = state();
  context.activeNav = "Akış"; context.postsLoading = true;
  context.restoreScroll.current = { top: 620, destination: "Akış", location: "/" };
  const browser = scrollHarness(context);
  execute(restoreScroll, context);
  assert.equal(browser.frames.size, 0);
  context.activeNav = "Öğrenci"; context.publicProfileLoading = true;
  context.restoreScroll.current = { top: 620, destination: "Öğrenci", location: "/?profile=a" };
  execute(restoreScroll, context);
  assert.equal(browser.frames.size, 0);
  context.publicProfileLoading = false;
  execute(restoreScroll, context);
  browser.flush();
  assert.equal(browser.scrolls.length, 0, "the actual current URL no longer matches the pending destination");
});

test("a shared-post read never requests the first feed page or mutates pagination", async () => {
  const context = state();
  context.profileState = "ready"; context.sharedPostId = "shared-post";
  context.window.location = new URL("https://kampira.example/?post=shared-post");
  const requests = [];
  context.authenticatedFetch = async (url) => { requests.push(url); return { ok: true, json: async () => ({ post: { id: "shared-post" } }) }; };
  const posts = context.posts;
  const cleanup = execute(sharedRead, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, ["/api/posts?id=shared-post"]);
  assert.equal(context.linkedPost.id, "shared-post");
  assert.equal(context.posts, posts);
  assert.equal(context.nextCursor, "page-three");
  cleanup();
});

test("closing a shared link invalidates its delayed read", async () => {
  const context = state();
  context.profileState = "ready"; context.sharedPostId = "shared-post";
  context.window.location = new URL("https://kampira.example/?post=shared-post");
  let finish;
  context.authenticatedFetch = () => new Promise((resolve) => { finish = resolve; });
  const cleanup = execute(sharedRead, context);
  cleanup();
  finish({ ok: true, json: async () => ({ post: { id: "shared-post" } }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.linkedPost, null);
});
