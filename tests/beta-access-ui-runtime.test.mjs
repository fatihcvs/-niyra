import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const account = (id = "generated") => ({ id, loginEmail: `${id}@test.kampira.net`, displayName: `Test ${id}`, kind: "generated", status: "active", createdAt: "2026-09-08 12:00:00", applicationId: null });
const queue = (items, extra = {}) => ({ items, nextCursor: null, staffContext: "staff-a", ...extra });
async function setup(fetch) {
  const ui = await createMobileDom({ fetch, packages: { "next/link": { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } } });
  const button = text => [...ui.host.querySelectorAll("button")].find(element => element.textContent === text);
  const click = target => ui.click(typeof target === "string" ? button(target) : target);
  const submit = async (count = 1) => act(async () => { for (let i = 0; i < count; i++) ui.host.querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); });
  const until = async predicate => { for (let i = 0; i < 100 && !predicate(); i++) await act(async () => new Promise(resolve => setTimeout(resolve, 5))); assert.ok(predicate(), ui.host.textContent); };
  return { ...ui, button, click, submit, until };
}

test("test-account creation is single-flight, secrets are ephemeral, and reset requires an explicit second action", async () => {
  const posts = [], pending = [], gets = [];
  const existing = { ...account("old"), kind: "existing-beta" };
  const ui = await setup((url, options) => {
    if (options.method === "POST") { const task = deferred(); posts.push({ ...options, body: JSON.parse(options.body) }); pending.push(task); return task.promise; }
    gets.push({ url, options });
    return Promise.resolve(response(url.includes("cursor=next-page") ? queue([account("next")]) : queue([existing, account()], { nextCursor: "next-page" })));
  });
  try {
    const { TestAccounts } = ui.load("app/test-accounts.tsx");
    await ui.render(h(TestAccounts, { onAccessChanged: async () => {} }));
    await ui.until(() => ui.button("Test hesabı oluştur")?.disabled === false);
    assert.match(ui.host.textContent, /Mevcut hesap ve giriş bilgileri korunuyor/);
    assert.equal(ui.host.querySelectorAll('input[type="password"]').length, 0);
    await ui.fill(ui.host.querySelector("form input"), "Yeni katılımcı"); await ui.submit(2);
    assert.equal(posts.length, 1); assert.equal(posts[0].cache, "no-store");
    assert.equal(posts[0].headers["X-Staff-Context"], "staff-a");
    await act(async () => pending[0].resolve(response({ account: account("new"), credentials: { loginEmail: "new@test.kampira.net", password: "synthetic-only-password" }, replayed: false })));
    assert.equal(ui.host.querySelector('input[type="password"]').value, "synthetic-only-password");
    assert.equal(ui.window.localStorage.length, 0); assert.equal(ui.window.sessionStorage.length, 0);
    await ui.click("Bilgileri kapat");
    assert.equal(ui.host.querySelector('input[type="password"]'), null);
    const reset = [...ui.host.querySelectorAll("button")].find(element => element.textContent === "Yeni parola oluştur");
    await ui.click(reset); assert.equal(posts.length, 1);
    assert.match(ui.host.textContent, /Önceki parola ve tüm açık oturumlar geçersizleşir/);
    await ui.click("Evet, yeni parola oluştur"); assert.equal(posts.length, 2); assert.equal(posts[1].body.action, "reset");
    await act(async () => pending[1].resolve(response({ account: account("new"), credentials: { loginEmail: "new@test.kampira.net", password: "new-synthetic-password" }, replayed: false })));
    await ui.click("Sonraki hesaplar");
    assert.equal(ui.host.querySelector('input[type="password"]'), null);
    await ui.until(() => ui.host.textContent.includes("next@test.kampira.net"));
    assert.ok(gets.some(request => request.url.includes("cursor=next-page")));
    assert.ok(gets.every(request => request.options.cache === "no-store"));
  } finally { await ui.close(); }
});

test("an uncertain create retries its same request ID without restoring a password from account metadata", async () => {
  const posts = [];
  const ui = await setup(async (_url, options) => {
    if (options.method !== "POST") return response(queue([]));
    posts.push(JSON.parse(options.body));
    if (posts.length === 1) throw new Error("Bağlantı kesildi");
    return response({ account: account(), credentials: null, replayed: true });
  });
  try {
    const { TestAccounts } = ui.load("app/test-accounts.tsx");
    await ui.render(h(TestAccounts, { onAccessChanged: async () => {} })); await ui.submit();
    assert.equal(ui.button("Test hesabı oluştur").disabled, true);
    await ui.click("Aynı işlemin sonucunu kontrol et");
    assert.deepEqual(posts[0], posts[1]);
    assert.match(ui.host.textContent, /Önceki işlem bulundu/);
    assert.equal(ui.host.querySelector('input[type="password"]'), null);
    assert.equal(ui.button("Test hesabı oluştur").disabled, false);
  } finally { await ui.close(); }
});

test("staff focus revalidation fences an old account-creation response and hides secrets on backgrounding", async () => {
  const pending = deferred(); let gets = 0, mutationOptions;
  const ui = await setup((_url, options) => {
    if (options.method === "POST") { mutationOptions = options; return pending.promise; }
    return Promise.resolve(response(queue([account(gets++ === 0 ? "old" : "current")], { staffContext: gets === 1 ? "staff-a" : "staff-b" })));
  });
  try {
    const { TestAccounts } = ui.load("app/test-accounts.tsx");
    await ui.render(h(TestAccounts, { onAccessChanged: async () => {} })); await ui.submit();
    await act(async () => ui.window.dispatchEvent(new ui.window.Event("focus")));
    assert.equal(mutationOptions.signal.aborted, true);
    await act(async () => pending.resolve(response({ account: account("old-created"), credentials: { loginEmail: "old@test.kampira.net", password: "must-not-reappear" } })));
    assert.doesNotMatch(ui.host.textContent, /old-created|must-not-reappear/);
    assert.equal(ui.host.querySelector('input[type="password"]'), null);
    assert.match(ui.host.textContent, /current@test/);
    assert.equal(ui.button("Test hesabı oluştur").disabled, false);
  } finally { await ui.close(); }
});

test("activation reads only a fragment token, validates confirmation, and clears passwords after success", async () => {
  const token = "A".repeat(43), calls = [], pending = deferred();
  const ui = await setup(async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body });
    return body.action === "inspect" ? response({ valid: true, loginEmail: "applicant@test.kampira.net", expiresAt: "2026-09-11T12:00:00Z" }) : pending.promise;
  });
  try {
    ui.window.history.replaceState(null, "", `/beta/etkinlestir#${token}`);
    const { TestActivation } = ui.load("app/beta/etkinlestir/test-activation.tsx"); await ui.render(h(TestActivation));
    assert.equal(ui.window.location.hash, ""); assert.equal(calls[0].body.token, token);
    assert.equal(calls[0].url, "/api/auth/test-activation"); assert.equal(calls[0].options.cache, "no-store");
    await ui.fill(ui.host.querySelector('[name="password"]'), "synthetic-activation-password");
    await ui.fill(ui.host.querySelector('[name="confirmation"]'), "different-password"); await ui.submit();
    assert.equal(calls.length, 1); assert.equal(ui.document.activeElement.name, "confirmation");
    await ui.fill(ui.host.querySelector('[name="confirmation"]'), "synthetic-activation-password"); await ui.submit(2);
    assert.equal(calls.length, 2); assert.equal(calls[1].body.action, "activate");
    await act(async () => pending.resolve(response({ activated: true, loginEmail: "applicant@test.kampira.net" })));
    assert.match(ui.host.textContent, /Teste hoş geldin/); assert.equal(ui.host.querySelector('input[type="password"]'), null);
    assert.equal(ui.window.localStorage.length, 0); assert.equal(ui.window.sessionStorage.length, 0);
    assert.equal(ui.host.querySelector('a[href="/"]').textContent, "Kampira’ya devam et →");
  } finally { await ui.close(); }
});

test("an expired activation has no password form and late inspect responses cannot repaint after unmount", async () => {
  const pending = deferred(); let calls = 0;
  const ui = await setup(async () => ++calls === 1 ? response({ error: "Bağlantının süresi doldu." }, 410) : pending.promise);
  try {
    ui.window.history.replaceState(null, "", `/beta/etkinlestir#${"B".repeat(43)}`);
    const { TestActivation } = ui.load("app/beta/etkinlestir/test-activation.tsx"); await ui.render(h(TestActivation));
    assert.match(ui.host.textContent, /Bağlantının süresi doldu/); assert.equal(ui.host.querySelector("form"), null);
    await ui.click("Bağlantıyı yeniden kontrol et"); await ui.render(null);
    await act(async () => pending.resolve(response({ valid: true, loginEmail: "must-not-reappear@test.kampira.net" })));
    assert.equal(ui.host.textContent, "");
  } finally { await ui.close(); }
});

test("web beta asks no Android device or 14-day confirmation; Android restores both requirements", async () => {
  const ui = await setup(async () => { throw new Error("No incomplete submission"); });
  try {
    const { BetaForm } = ui.load("app/beta/beta-form.tsx"); await ui.render(h(BetaForm, { kind: "application" }));
    const platform = ui.host.querySelector('[name="platform"]'); assert.equal(platform.required, true);
    await ui.fill(platform, "web");
    for (const name of ["deviceModel", "android", "participation"]) assert.equal(ui.host.querySelector(`[name="${name}"]`), null);
    assert.equal(ui.host.querySelector('[name="adult"]').required, true); assert.equal(ui.host.querySelector('[name="consent"]').required, true);
    await ui.fill(platform, "both");
    for (const name of ["deviceModel", "android", "participation"]) assert.equal(ui.host.querySelector(`[name="${name}"]`).required, true);
    await ui.fill(platform, "android"); assert.equal(ui.host.querySelector('[name="deviceModel"]').required, true);
    await ui.render(h(BetaForm, { kind: "feedback" }));
    assert.equal(ui.host.querySelector('[name="platform"]'), null); assert.equal(ui.host.querySelector('[name="deviceModel"]').required, false);
    assert.equal(ui.host.querySelector('[name="subject"]').required, true); assert.equal(ui.host.querySelector('[name="email"]').required, false);
  } finally { await ui.close(); }
});

test("web application submits the selected platform once and reports email delivery as pending", async () => {
  const calls = [], pending = deferred();
  const ui = await setup((url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return pending.promise; });
  try {
    const { BetaForm } = ui.load("app/beta/beta-form.tsx"); await ui.render(h(BetaForm, { kind: "application" }));
    await ui.submit(); assert.equal(calls.length, 0); assert.equal(ui.document.activeElement.name, "platform");
    await ui.fill(ui.host.querySelector('[name="platform"]'), "web");
    await ui.fill(ui.host.querySelector('[name="email"]'), "applicant@example.invalid");
    await ui.click(ui.host.querySelector('[name="adult"]')); await ui.click(ui.host.querySelector('[name="consent"]'));
    await ui.submit(2); assert.equal(calls.length, 1);
    assert.equal(calls[0].body.platform, "web"); assert.equal(calls[0].body.android, false); assert.equal(calls[0].body.participation, false);
    assert.equal(calls[0].body.deviceModel, undefined); assert.equal(calls[0].url, "/api/beta/requests");
    await act(async () => pending.resolve(response({ received: true, accountDelivery: "email" }, 201)));
    assert.match(ui.host.textContent, /etkinleştirme bilgileri e-posta ile iletilecek/);
    assert.doesNotMatch(ui.host.textContent, /e-posta gönderildi|mail gönderildi|Zoho/i);
    assert.ok(ui.host.querySelector(`a[href="/beta/takip#${calls[0].body.token}"]`));
    assert.equal(ui.window.localStorage.getItem("kampira.beta.lastReceipt"), calls[0].body.token);
  } finally { await ui.close(); }
});

test("web-only tracking neither offers Play joining nor presents it as a requirement", async () => {
  let platform = "web";
  const ui = await setup(async () => response({ request: { id: "application", kind: "application", platform, status: "invited", subject: "Test başvurusu", message: "", playUrl: "https://play.google.com/apps/testing/app.kampira.mobile", updatedAt: "2026-09-08 12:00:00" }, messages: [] }));
  try {
    ui.window.history.replaceState(null, "", `/beta/takip#${"T".repeat(43)}`);
    const { BetaTracking } = ui.load("app/beta/beta-tracking.tsx"); await ui.render(h(BetaTracking)); await ui.submit();
    assert.match(ui.host.textContent, /Web testine başvurdun/);
    assert.equal(ui.button("Google Play’de teste katıldım"), undefined);
    assert.equal(ui.host.querySelector('a[href^="https://play.google.com"]'), null);
    assert.match(ui.host.textContent, /test hesabının erişimi kapanır ve oturumları sonlanır/);
    platform = "both"; await ui.submit();
    assert.ok(ui.button("Google Play’de teste katıldım"));
    assert.ok(ui.host.querySelector('a[href^="https://play.google.com"]'));
  } finally { await ui.close(); }
});

test("staff web review excludes Android-only confirmations and Play email exports", async () => {
  const item = { id: "web-application", kind: "application", platform: "web", status: "ready", email: "web@example.invalid", displayName: "Web katılımcısı", subject: "Web test başvurusu", deviceModel: "", androidVersion: "", university: "", category: "", message: "", priority: "normal", createdAt: "2026-09-08 12:00:00", expiresAt: "2026-12-07 12:00:00", revision: 1, internalNote: "", playUrl: "", adultConfirmed: 1, androidConfirmed: 0, participationConfirmed: 0 };
  const ui = await setup(async () => response({ items: [item], nextCursor: null, staffContext: "staff-a", detail: { messages: [] } }));
  try {
    const { BetaReview } = ui.load("app/beta-review.tsx"); await ui.render(h(BetaReview, { onAccessChanged: async () => {} }));
    assert.equal(ui.button("Bu sayfanın hazır Play e-postalarını indir").disabled, true);
    await ui.click("İncele ve yanıtla");
    assert.match(ui.host.querySelector('[aria-label="Başvuru incelemesi"]').textContent, /Yalnız web testi/);
    assert.equal(ui.host.querySelector('input[type="url"]'), null);
    const status = [...ui.host.querySelectorAll("select")].find(element => element.value === "ready");
    await ui.fill(status, "invited");
    assert.equal(ui.host.querySelector('[aria-label="Başvuru incelemesi"] input[type="checkbox"]'), null);
  } finally { await ui.close(); }
});

test("public config exposes effective registration policy and fails closed on unavailable settings", async () => {
  const input = readFileSync(new URL("../app/api/platform-config/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let settings = { maintenanceMode: false, maintenanceMessage: "", betaAccessOnly: true, registrationOpen: true }, fails = false;
  const context = { exports: {}, Response, require: name => name.endsWith("/platform-settings") ? { getPlatformSettings: async () => { if (fails) throw new Error("offline"); return settings; } } : { getRuntime: async () => ({ DB: {} }) } };
  runInNewContext(code, context);
  const closed = await context.exports.GET(); assert.equal(closed.headers.get("cache-control"), "no-store"); assert.equal((await closed.json()).registrationOpen, false);
  settings = { ...settings, betaAccessOnly: false }; assert.equal((await (await context.exports.GET()).json()).registrationOpen, true);
  fails = true; const unavailable = await context.exports.GET(); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).registrationOpen, false);
});
