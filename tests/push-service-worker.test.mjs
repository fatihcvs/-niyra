import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://kampira.example";
const identity = { v: 1, notificationId: "notification-one", subscriptionId: "subscription-one", accountId: "owner-a" };
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };

function setup() {
  const events = new Map(), shown = [], requests = [], navigation = [], notices = [];
  const state = { receipt: { ...identity, href: "/?view=messages&message=message-one" }, status: 200, windows: [], subscription: {}, wait: null };
  const clients = { async matchAll() { return state.windows; }, async openWindow(href) { navigation.push(["open", href]); } };
  const self = {
    location: { origin }, clients, addEventListener: (event, handler) => events.set(event, handler),
    registration: { pushManager: { async getSubscription() { return state.subscription; } }, async getNotifications({ tag } = {}) { return notices.filter((notice) => !tag || notice.tag === tag); }, async showNotification(title, options) { shown.push({ title, options }); const notice = { tag: options.tag, closed: false, close() { this.closed = true; } }; notices.push(notice); } },
  };
  runInNewContext(source, { self, URL, URLSearchParams, Response, Map, Set, Promise, fetch: async (url, options) => { requests.push({ url, options }); if (state.wait) await state.wait.promise; return Response.json({ receipt: state.receipt }, { status: state.status }); } });
  const dispatch = async (type, extra) => { let result; events.get(type)({ ...extra, waitUntil(work) { result = work; } }); await result; };
  return { state, shown, requests, navigation, notices, push: (payload = identity) => dispatch("push", { data: { json: () => payload } }), click: (data = state.receipt) => dispatch("notificationclick", { notification: { data, close() { navigation.push(["close"]); } } }), clear: (url = origin) => dispatch("message", { data: { type: "KAMPIRA_PUSH_CLEAR" }, source: { url } }), change: (newSubscription) => dispatch("pushsubscriptionchange", { newSubscription }), dispatch };
}

test("push uses authenticated exact receipt, generic private preview and stable notification tag", async () => {
  const ui = setup(); await ui.push({ ...identity, title: "private actor", body: "private message", href: "https://evil.example/" });
  assert.equal(ui.shown.length, 1); assert.equal(ui.shown[0].title, "Kampira"); assert.equal(ui.shown[0].options.body, "Yeni bir bildirimin var."); assert.equal(ui.shown[0].options.tag, "kampira:notification-one"); assert.equal(ui.shown[0].options.renotify, false); assert.equal(ui.shown[0].options.data.href, ui.state.receipt.href);
  assert.equal(ui.requests[0].options.headers["X-Account-Context"], "owner-a"); assert.equal(ui.requests[0].options.credentials, "include"); assert.equal(ui.requests[0].options.cache, "no-store"); assert.match(ui.requests[0].url, /notificationId=notification-one&subscriptionId=subscription-one/);
  assert.equal(new URL(ui.requests[0].url, origin).searchParams.has("purpose"), false, "Background delivery never requests read-notification navigation access");
  await ui.push(); assert.equal(ui.shown[1].options.tag, ui.shown[0].options.tag);
});

test("missing, revoked and wrong-owner receipts never show a notification or open a target", async () => {
  for (const receipt of [null, { ...identity, accountId: "owner-b", href: "/" }, { ...identity, subscriptionId: "wrong", href: "/" }]) {
    const ui = setup(); ui.state.receipt = receipt; await ui.push(); await ui.click(identity); assert.equal(ui.shown.length, 0); assert.equal(ui.navigation.some(([action]) => action !== "close"), false);
  }
  const ui = setup(); await ui.push({ v: 1 }); assert.equal(ui.requests.length, 0); ui.state.subscription = null; await ui.push(); assert.equal(ui.requests.length, 0);
});

test("external, injected and non-app destinations fail closed even in an otherwise valid server receipt", async () => {
  for (const href of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "javascript:alert(1)", "data:text/html,x", "/api/session", "/?view=evil", "/?view=messages&redirect=https://evil.example", "/?view=messages&view=feed", "/#external", "/?message=%0A"] ) {
    const ui = setup(); ui.state.receipt = { ...identity, href }; await ui.push(); await ui.click(identity); assert.equal(ui.shown.length, 0, href); assert.equal(ui.navigation.some(([action]) => action !== "close"), false, href);
  }
});

test("click revalidates owner and focuses an existing app window at the exact safe target", async () => {
  const ui = setup(); ui.state.windows = [{ url: `${origin}/?view=feed`, focused: true, async navigate(href) { ui.navigation.push(["navigate", href]); return this; }, async focus() { ui.navigation.push(["focus"]); } }];
  await ui.click(); assert.deepEqual(ui.navigation, [["close"], ["navigate", `${origin}/?view=messages&message=message-one`], ["focus"]]);
  assert.equal(new URL(ui.requests[0].url, origin).searchParams.get("purpose"), "click", "An explicit tap may still navigate an already-read notification after access revalidation");
  ui.state.status = 401; await ui.click(); assert.equal(ui.navigation.filter(([action]) => action === "navigate").length, 1);
});

test("click opens a new app window only when no same-origin app client exists", async () => {
  const ui = setup(); ui.state.windows = [{ url: "https://external.example/" }, { url: `${origin}/legal` }]; await ui.click(); assert.deepEqual(ui.navigation, [["close"], ["open", `${origin}/?view=messages&message=message-one`]]);
});

test("meetup taps open the exact revalidated target and revoked access cannot navigate", async () => {
  const ui = setup();
  ui.state.receipt = { ...identity, href: "/?view=match&meetup=meetup-one" };
  await ui.push();
  assert.equal(ui.shown[0].options.data.href, "/?view=match&meetup=meetup-one");
  await ui.click({ ...identity, href: "/?view=match&meetup=untrusted-other" });
  assert.deepEqual(ui.navigation, [["close"], ["open", `${origin}/?view=match&meetup=meetup-one`]]);
  ui.navigation.length = 0;
  ui.state.status = 404;
  await ui.click();
  assert.deepEqual(ui.navigation, [["close"]]);
});

test("logout generation fences in-flight delivery and closes old visible notifications", async () => {
  const ui = setup(); await ui.push(); assert.equal(ui.notices[0].closed, false); ui.state.wait = deferred(); const pending = ui.push(); await new Promise((resolve) => setTimeout(resolve, 0)); await ui.clear(); ui.state.wait.resolve(); await pending; assert.equal(ui.shown.length, 1); assert.equal(ui.notices[0].closed, true);
  const other = setup(); await other.push(); await other.clear("https://evil.example/"); assert.equal(other.notices[0].closed, false);
});

test("subscription change never auto-enrolls a later account and asks open clients for a truthful refresh", async () => {
  const ui = setup(), calls = []; ui.state.windows = [{ postMessage: (message) => calls.push(message.type) }]; await ui.push(); await ui.change({ async unsubscribe() { calls.push("unsubscribe"); } });
  assert.deepEqual(calls, ["unsubscribe", "KAMPIRA_PUSH_REFRESH_REQUIRED"]); assert.equal(ui.notices[0].closed, true); assert.equal(ui.requests.length, 1, "No registration network mutation on subscription change");
});
