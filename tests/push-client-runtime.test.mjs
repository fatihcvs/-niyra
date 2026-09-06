import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const key = Buffer.from([4, ...Array(64).fill(1)]).toString("base64url");
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const button = (ui, label) => [...ui.host.querySelectorAll("button")].find((node) => node.textContent === label);

async function setup({ available = true, permission = "default", support = true, secure = true, permissionWait, subscribeWait, postStatus = 201 } = {}) {
  const calls = [], notices = [{ tag: "kampira:old", close() { calls.push("close"); } }];
  let subscription = null, registered = false, deviceId = null, subscriptionFingerprint = null, deleteStatus = 200, requests = [];
  const ui = await createMobileDom({ fetch: async (url, init = {}) => {
    requests.push({ url, init });
    if (init.method === "POST") { calls.push("POST"); if (postStatus === 201) { registered = true; const body = JSON.parse(init.body); deviceId = body.deviceId; subscriptionFingerprint = createHash("sha256").update(JSON.stringify(["web", body.subscription.endpoint, body.subscription.keys.p256dh, body.subscription.keys.auth])).digest("hex"); } return Response.json(postStatus === 201 ? { enabled: true, kind: "web", id: "server-subscription" } : { error: "Gönderim hizmeti kapalı" }, { status: postStatus }); }
    if (init.method === "DELETE") { calls.push("DELETE"); if (deleteStatus === 200) registered = false; return Response.json(deleteStatus === 200 ? { deleted: true } : { error: "Silme yanıtı alınamadı" }, { status: deleteStatus }); }
    return Response.json({ webPush: { available, publicKey: available ? key : null }, nativePush: { available: false }, subscriptions: registered ? [{ id: "server-subscription", kind: "web", deviceId, subscriptionFingerprint }] : [] });
  } });
  Object.defineProperty(ui.window, "isSecureContext", { value: secure, configurable: true });
  Object.defineProperty(ui.window, "crypto", { value: webcrypto, configurable: true });
  ui.window.TextEncoder = TextEncoder;
  const makeSubscription = () => ({ options: { applicationServerKey: Uint8Array.from(Buffer.from(key, "base64url")).buffer }, toJSON() { return { endpoint: "https://push.example/private-endpoint", keys: { p256dh: "private-p256dh", auth: "private-auth" } }; }, async unsubscribe() { calls.push("unsubscribe"); subscription = null; return true; } });
  const registration = {
    active: { postMessage(message, ports) { calls.push(message.type); if (message.type === "KAMPIRA_PUSH_CHECK") ports[0].postMessage({ pushVersion: 1 }); } },
    getNotifications: async () => notices,
    pushManager: { getSubscription: async () => subscription, async subscribe(options) { calls.push("subscribe"); assert.equal(options.userVisibleOnly, true); if (subscribeWait) await subscribeWait.promise; subscription = makeSubscription(); return subscription; } },
  };
  const sw = Object.assign(new ui.window.EventTarget(), { getRegistration: async () => registration, register: async () => { calls.push("register"); return registration; }, ready: Promise.resolve(registration) });
  Object.defineProperty(ui.window.navigator, "serviceWorker", { value: sw, configurable: true });
  if (support) ui.window.PushManager = function () {};
  ui.window.Notification = { permission, requestPermission() { calls.push("permission"); if (permissionWait) return permissionWait.promise.then((value) => { this.permission = value; return value; }); this.permission = "granted"; return Promise.resolve("granted"); } };
  ui.window.MessageChannel = class { constructor() { const first = { onmessage: null, close() {} }; this.port1 = first; this.port2 = { postMessage: (data) => first.onmessage?.({ data }), close() {} }; } };
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider, Component = ui.load("app/push-notifications.tsx").PushNotifications;
  const render = async (owner = "owner-a:1") => ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() {} }, h(Component)));
  const until = async (check) => { for (let index = 0; index < 100 && !check(); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2)); }); assert.ok(check(), ui.host.textContent); };
  return { ...ui, renderPush: render, calls, requests, until, registration, sw, api: ui.load("lib/push-client.ts"), state: () => ui.host.querySelector('[aria-label="Cihaz bildirimleri"]')?.dataset.state, setRegistered: (value) => { registered = value; }, setPostStatus: (value) => { postStatus = value; }, setDeleteStatus: (value) => { deleteStatus = value; }, subscription: () => subscription };
}

test("push UI truthfully reports unavailable, denied, unsupported and insecure without any permission prompt", async () => {
  for (const [options, expected] of [[{ available: false }, "unavailable"], [{ permission: "denied" }, "denied"], [{ support: false }, "unsupported"], [{ secure: false }, "insecure"]]) {
    const ui = await setup(options); try { await ui.renderPush(); await ui.until(() => ui.state() === expected); assert.equal(ui.calls.includes("permission"), false); assert.equal(ui.calls.includes("subscribe"), false); assert.equal(button(ui, "Bu cihazda bildirimleri aç"), undefined); assert.equal(ui.requests[0].init.headers["X-Account-Context"], "owner-a"); } finally { await ui.close(); }
  }
});

test("permission is requested only on explicit click and server acknowledgement is required before showing on", async () => {
  const permissionWait = deferred(), ui = await setup({ permissionWait });
  try {
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); assert.deepEqual(ui.calls, []);
    await ui.click(button(ui, "Bu cihazda bildirimleri aç")); assert.equal(ui.calls[0], "permission"); assert.equal(ui.calls.includes("POST"), false); assert.equal(ui.state(), "busy");
    await act(async () => permissionWait.resolve("granted")); await ui.until(() => ui.state() === "on");
    assert.equal(ui.calls.filter((call) => call === "permission").length, 1); assert.equal(ui.calls.filter((call) => call === "POST").length, 1);
    const payload = JSON.parse(ui.requests.find((request) => request.init.method === "POST").init.body); assert.equal(payload.kind, "web"); assert.match(payload.deviceId, /^web:/); assert.equal(payload.subscription.keys.auth, "private-auth");
    assert.deepEqual(Object.keys(ui.window.localStorage), ["kampira-push-device-v1"]); assert.ok(!ui.window.localStorage.getItem("kampira-push-device-v1").includes("private"));
  } finally { await ui.close(); }
});

test("dismissed permission never subscribes or posts", async () => {
  const permissionWait = deferred(), ui = await setup({ permissionWait });
  try { await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await act(async () => permissionWait.resolve("default")); await ui.until(() => ui.state() === "off"); assert.equal(ui.calls.includes("subscribe"), false); assert.equal(ui.calls.includes("POST"), false); } finally { await ui.close(); }
});

test("lost registration response stays error and explicit retry reuses the browser subscription and device ID", async () => {
  const ui = await setup({ postStatus: 503 });
  try {
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "error");
    const first = JSON.parse(ui.requests.find((request) => request.init.method === "POST").init.body);
    ui.setPostStatus(201); await ui.click(button(ui, "Durumu yenile")); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "on");
    const last = JSON.parse(ui.requests.filter((request) => request.init.method === "POST").at(-1).init.body); assert.equal(last.deviceId, first.deviceId); assert.deepEqual(last.subscription, first.subscription); assert.equal(ui.calls.filter((call) => call === "subscribe").length, 1);
  } finally { await ui.close(); }
});

test("account switch while permission dialog is open cannot enroll the previous owner", async () => {
  const permissionWait = deferred(), ui = await setup({ permissionWait });
  try { await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.renderPush("owner-b:2"); await ui.until(() => ui.state() === "off"); await act(async () => permissionWait.resolve("granted")); assert.equal(ui.calls.includes("POST"), false); assert.equal(ui.calls.includes("subscribe"), false); } finally { await ui.close(); }
});

test("a sibling-tab revocation cancels an already open permission prompt even when the account ID is unchanged", async () => {
  const permissionWait = deferred(), ui = await setup({ permissionWait });
  try {
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç"));
    await act(async () => ui.sw.dispatchEvent(new ui.window.MessageEvent("message", { data: { type: "KAMPIRA_PUSH_REVOKED" } })));
    await ui.until(() => ui.state() === "off"); await act(async () => permissionWait.resolve("granted")); assert.equal(ui.calls.includes("POST"), false); assert.equal(ui.calls.includes("subscribe"), false); assert.equal(ui.state(), "off");
  } finally { await ui.close(); }
});

test("an old service worker cannot falsely enable push before its capability is verified", async () => {
  const ui = await setup();
  try {
    ui.registration.active.postMessage = (_message, ports) => ports[0].postMessage({ pushVersion: 0 });
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "error");
    assert.match(ui.host.textContent, /tüm sekmelerini kapatıp yeniden aç/); assert.equal(ui.calls.includes("subscribe"), false); assert.equal(ui.calls.includes("POST"), false);
  } finally { await ui.close(); }
});

test("logout closes visible notifications and cleans a late subscription without registering it", async () => {
  const subscribeWait = deferred(), ui = await setup({ subscribeWait });
  try {
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.calls.includes("subscribe"));
    await ui.render(null); assert.equal((await ui.api.clearPushNotificationsOnLogout()).cleared, true); await act(async () => subscribeWait.resolve()); await ui.until(() => ui.calls.includes("unsubscribe"));
    assert.equal(ui.calls.includes("POST"), false); assert.equal(ui.calls.includes("KAMPIRA_PUSH_CLEAR"), true); assert.equal(ui.calls.includes("close"), true); assert.equal(ui.subscription(), null);
  } finally { await ui.close(); }
});

test("disable preserves browser subscription on server failure then revokes and unsubscribes on confirmed success", async () => {
  const ui = await setup();
  try {
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "on");
    ui.setDeleteStatus(503); await ui.click(button(ui, "Bu cihazda bildirimleri kapat")); await ui.until(() => ui.state() === "error"); assert.ok(ui.subscription()); assert.equal(ui.calls.includes("unsubscribe"), false);
    ui.setDeleteStatus(200); await ui.click(button(ui, "Durumu yenile")); await ui.until(() => ui.state() === "on"); await ui.click(button(ui, "Bu cihazda bildirimleri kapat")); await ui.until(() => ui.state() === "off"); assert.equal(ui.subscription(), null); assert.equal(ui.calls.filter((call) => call === "unsubscribe").length, 1);
  } finally { await ui.close(); }
});

test("status rejects a rotated endpoint, encryption secret or VAPID key despite the same installation ID", async () => {
  for (const rotated of ["endpoint", "encryption", "vapid"]) {
    const ui = await setup();
    try {
      await ui.renderPush(); await ui.until(() => ui.state() === "off"); await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "on");
      await ui.renderPush("owner-a:2"); await ui.until(() => ui.state() === "on");
      const subscription = ui.subscription(), original = subscription.toJSON();
      if (rotated === "vapid") subscription.options.applicationServerKey = Uint8Array.from([4, ...Array(64).fill(2)]).buffer;
      else subscription.toJSON = () => rotated === "endpoint" ? { ...original, endpoint: "https://push.example/new-endpoint" } : { ...original, keys: { ...original.keys, auth: "rotated-auth" } };
      await ui.renderPush("owner-a:3"); await ui.until(() => ui.state() === "off");
      assert.ok(button(ui, "Bu cihazda bildirimleri aç"), rotated); assert.equal(ui.calls.filter((call) => call === "POST").length, 1, "A status check never silently repairs an unconfirmed generation");
      assert.equal(ui.calls.filter((call) => call === "permission").length, 1);
    } finally { await ui.close(); }
  }
});

function nativeBridge(ui, handler = () => ({})) {
  const commands = [];
  ui.window.KampiraPush = { postMessage(value) {
    const request = JSON.parse(value); commands.push(request);
    const fields = handler(request);
    if (fields === null) return;
    this.onmessage({ data: JSON.stringify({ protocolVersion: 1, id: request.id, accountId: request.accountId ?? "", state: "off", available: true, permission: "prompt", enabled: false, ...fields }) });
  } };
  return commands;
}

test("native push uses only the scoped nonsensitive bridge and explicit enable/disable buttons", async () => {
  const ui = await setup({ support: false });
  try {
    const commands = nativeBridge(ui, ({ command }) => command === "enable" ? { state: "on", enabled: true, permission: "granted" } : {});
    await ui.renderPush(); await ui.until(() => ui.state() === "off"); assert.deepEqual(commands.map((item) => item.command), ["status"]); assert.equal(ui.requests.length, 0);
    await ui.click(button(ui, "Bu cihazda bildirimleri aç")); await ui.until(() => ui.state() === "on"); assert.deepEqual(commands.map((item) => item.command), ["status", "enable"]);
    await ui.click(button(ui, "Bu cihazda bildirimleri kapat")); await ui.until(() => ui.state() === "off"); assert.equal(commands.at(-1).command, "disable"); assert.ok(commands.every((item) => item.accountId === "owner-a"));
    assert.equal(ui.calls.includes("permission"), false); assert.equal(ui.calls.includes("subscribe"), false); assert.ok(commands.every((item) => Object.keys(item).every((name) => ["id", "accountId", "command"].includes(name))));
  } finally { await ui.close(); }
});

test("native unavailable and denied states never offer enable and mention Android settings accurately", async () => {
  for (const state of ["unavailable", "denied"]) {
    const ui = await setup(); try {
      nativeBridge(ui, () => ({ state, available: state !== "unavailable", permission: state === "denied" ? "denied" : "prompt" }));
      await ui.renderPush(); await ui.until(() => ui.state() === state); assert.equal(button(ui, "Bu cihazda bildirimleri aç"), undefined); assert.equal(ui.requests.length, 0);
      if (state === "denied") assert.match(ui.host.textContent, /Android ayarlarında/);
    } finally { await ui.close(); }
  }
});

test("native replies must match request ID, account and protocol, and cannot falsely claim enabled", async () => {
  const ui = await setup(); try {
    const commands = nativeBridge(ui, () => null), api = ui.load("lib/native-push-client.ts");
    let resolved = false; const pending = api.nativePushRequest("status", "owner-a").then((result) => { resolved = true; return result; });
    const message = { protocolVersion: 1, id: commands[0].id, accountId: "owner-b", state: "off", available: true, permission: "prompt", enabled: false };
    ui.window.KampiraPush.onmessage({ data: JSON.stringify(message) }); await Promise.resolve(); assert.equal(resolved, false);
    ui.window.KampiraPush.onmessage({ data: JSON.stringify({ ...message, accountId: "owner-a" }) }); assert.equal((await pending).state, "off");
    const invalid = api.nativePushRequest("enable", "owner-a"); ui.window.KampiraPush.onmessage({ data: JSON.stringify({ ...message, id: commands.at(-1).id, accountId: "owner-a", state: "on", available: false, enabled: true }) }); await assert.rejects(invalid, /doğrulanamadı/);
  } finally { await ui.close(); }
});

test("logout calls native clear without transferring account cookies or device tokens", async () => {
  const ui = await setup(); try {
    const commands = nativeBridge(ui); assert.equal((await ui.api.clearPushNotificationsOnLogout()).cleared, true);
    assert.equal(commands.length, 1); assert.equal(commands[0].command, "clear"); assert.deepEqual(Object.keys(commands[0]), ["id", "command"]);
  } finally { await ui.close(); }
});
