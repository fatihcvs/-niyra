import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const at = "2026-09-06T00:00:00.000Z";
const subject = { email: "synthetic-erasure@example.invalid", displayName: "[SYNTHETIC] Silme hedefi" };
const request = (status = "in_review", patch = {}) => ({ id: "request-synthetic-one", status, note: "[SYNTHETIC] Kullanıcının açık talebi", createdAt: at, updatedAt: at,
  history: [{ status: "requested", createdAt: at }, ...(status === "requested" ? [] : [{ status, createdAt: at }])], ...subject, publicId: "synthetic-subject", ...patch });
const job = (state = "storage_pending", patch = {}) => ({ id: "job-synthetic-one", requestId: "request-synthetic-one", state, createdAt: at, updatedAt: at, completedAt: state === "completed" ? at : null,
  removedObjectCount: 0, removedRowCount: 0, preservedContainerCount: 0, pendingObjectCount: state === "completed" ? 0 : 1, lastErrorCode: null, ...patch });
const json = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const buttons = (node) => [...node.querySelectorAll("button")];
const button = (node, matcher) => buttons(node).find((item) => typeof matcher === "string" ? item.textContent.trim() === matcher : matcher.test(item.textContent));
const deadlines = () => { const pending = new Map(); return { timers: { setTimeout(callback, delay) { if (delay >= 20_000) { const key = {}; pending.set(key, { callback, delay }); return key; } return setTimeout(callback, delay); }, clearTimeout(key) { if (!pending.delete(key)) clearTimeout(key); } }, fire(delay) { const item = [...pending.values()].find((value) => value.delay === delay); assert.ok(item, `Expected ${delay}ms deadline`); item.callback(); } }; };

async function setup({ canExecute = true, items = [request()], jobs = [], transport, timers } = {}) {
  const calls = []; let accesses = 0;
  const state = { requests: items, jobs, nextCursor: null, capabilities: { canExecute }, staffContext: "staff-session-synthetic-a" };
  const ui = await createMobileDom({ timers, packages: { "next/link": { __esModule: true, default: ({ children, href, ...props }) => h("a", { ...props, href }, children) } },
    fetch: async (url, options = {}) => { const call = { url, options, body: options.body ? JSON.parse(options.body) : null, method: options.method ?? "GET" }; calls.push(call); return transport ? transport(call, state) : json(state); } });
  const Component = ui.load("app/account-deletion-review.tsx").AccountDeletionReview;
  const onAccessChanged = async () => { accesses++; };
  const until = async (check) => { for (let i = 0; i < 100 && !check(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3)); }); assert.ok(check(), ui.host.textContent); };
  return { ...ui, calls, state, accesses: () => accesses, until,
    mount: async () => { await ui.render(h(Component, { onAccessChanged })); await until(() => calls.length > 0 && !ui.host.textContent.includes("Talepler yükleniyor")); } };
}
async function openConfirmation(ui) {
  const target = [...ui.host.querySelectorAll("article")].find((item) => item.textContent.includes(subject.email)); assert.ok(target, "Exact synthetic request card exists");
  await ui.click(button(target, /sil/i));
  const dialog = ui.host.querySelector('[role="dialog"]'); assert.ok(dialog, "Execution needs an app confirmation dialog");
  assert.match(dialog.textContent, /Silme hedefi/); assert.match(dialog.textContent, /synthetic-erasure@example.invalid/);
  return dialog;
}

test("rendering and reviewing a user request never executes erasure, and owner execution requires explicit unchecked confirmation", async () => {
  const ui = await setup({ items: [request("requested")], transport(call, state) {
    if (call.method === "GET") return json(state);
    assert.equal(call.body.action, "review"); state.requests = [request()]; return json({ request: request(), deletionExecuted: false });
  } });
  try {
    ui.window.confirm = () => { throw new Error("Use the in-app confirmation"); };
    await ui.mount(); assert.equal(ui.calls.filter((call) => call.method !== "GET").length, 0);
    await ui.click(button(ui.host, "İncelemeye al"));
    await ui.until(() => ui.host.textContent.includes("İncelemede"));
    assert.deepEqual(ui.calls.filter((call) => call.method !== "GET").map((call) => call.body.action), ["review"]);
    const dialog = await openConfirmation(ui);
    const checkbox = dialog.querySelector('input[type="checkbox"]'); assert.ok(checkbox); assert.equal(checkbox.checked, false);
    assert.ok(button(dialog, /sil/i).disabled, "Destructive action stays disabled before explicit confirmation");
    await ui.click(button(dialog, "Vazgeç")); await ui.until(() => !ui.host.querySelector('[role="dialog"]'));
    assert.equal(ui.calls.some((call) => call.body?.action === "execute"), false);
  } finally { await ui.close(); }
});

test("an admin without server execute capability cannot open execution confirmation or resume a job", async () => {
  const ui = await setup({ canExecute: false, jobs: [job("blocked")] });
  try {
    await ui.mount(); assert.equal(Boolean(button(ui.host, /Hesabı sil|kalıcı.*sil|silmeyi başlat|silme işlemini başlat/i)), false);
    assert.equal(Boolean(button(ui.host, /Temizliği sürdür|devam et|yeniden dene/i)), false); assert.equal(ui.calls.filter((call) => call.method !== "GET").length, 0);
  } finally { await ui.close(); }
});

test("same-frame owner execution is single-flight and a pending job never claims completed deletion", async () => {
  const gate = deferred();
  const ui = await setup({ transport(call, state) { return call.method === "GET" ? json(state) : gate.promise; } });
  try {
    await ui.mount(); const dialog = await openConfirmation(ui); await ui.click(dialog.querySelector('input[type="checkbox"]'));
    const execute = button(dialog, /sil/i); await act(async () => { execute.click(); execute.click(); });
    const sent = ui.calls.filter((call) => call.body?.action === "execute"); assert.equal(sent.length, 1); assert.equal(sent[0].body.id, "request-synthetic-one"); assert.equal(sent[0].body.confirm, true);
    assert.equal(new Headers(sent[0].options.headers).get("X-Staff-Context"), ui.state.staffContext);
    ui.state.jobs = [job()]; ui.state.requests = [request("in_review", { erasureJob: job() })];
    await act(async () => gate.resolve(json({ job: job(), deletionExecuted: false }, 202)));
    await ui.until(() => !!ui.host.querySelector('[data-erasure-job-id="job-synthetic-one"]'));
    const receipt = ui.host.querySelector('[data-erasure-job-id="job-synthetic-one"]'); assert.equal(receipt.dataset.state, "storage_pending"); assert.doesNotMatch(receipt.textContent, /Silme tamamlandı|Hesap silindi/i);
  } finally { gate.resolve(json({ job: job(), deletionExecuted: false }, 202)); await ui.close(); }
});

test("lost execute acknowledgement reconciles the saved job without replay; resume stays a separate explicit action", async () => {
  const ui = await setup({ transport(call, state) {
    if (call.method === "GET") return json(state);
    if (call.body.action === "execute") { state.requests = [request("in_review", { erasureJob: job() })]; state.jobs = [job()]; throw new Error("response lost after commit"); }
    assert.equal(call.body.action, "resume"); assert.equal(call.body.jobId, job().id); state.jobs = [job("completed")]; state.requests = []; return json({ job: job("completed"), deletionExecuted: true });
  } });
  try {
    await ui.mount(); const dialog = await openConfirmation(ui); await ui.click(dialog.querySelector('input[type="checkbox"]')); await ui.click(button(dialog, /sil/i));
    await ui.until(() => !!ui.host.querySelector('[data-state="storage_pending"]'));
    assert.match(ui.host.textContent, /tekrar gönderilmiyor/); assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
    await ui.click(button(ui.host, "Temizliği sürdür")); await ui.until(() => !!ui.host.querySelector('[data-state="completed"]'));
    assert.deepEqual(ui.calls.filter((call) => call.method === "PATCH").map((call) => call.body.action), ["execute", "resume"]);
    assert.equal(Boolean(button(ui.host, "Temizliği sürdür")), false);
  } finally { await ui.close(); }
});

test("a timed-out deferred execute JSON body cannot publish success and instead rechecks the canonical pending receipt", async () => {
  const body = deferred(); const clock = deadlines(); let bodyStarted = false;
  const ui = await setup({ timers: clock.timers, transport(call, state) {
    if (call.method === "GET") return json(state);
    return { ok: true, status: 200, json: () => { bodyStarted = true; return body.promise; } };
  } });
  try {
    await ui.mount(); const dialog = await openConfirmation(ui); await ui.click(dialog.querySelector('input[type="checkbox"]')); await ui.click(button(dialog, /sil/i));
    await ui.until(() => bodyStarted); await act(async () => clock.fire(30_000));
    assert.equal(ui.calls.find((call) => call.method === "PATCH").options.signal.aborted, true);
    ui.state.jobs = [job()]; ui.state.requests = [request("in_review", { erasureJob: job() })];
    await act(async () => body.resolve({ job: job("completed"), deletionExecuted: true }));
    await ui.until(() => !!ui.host.querySelector('[data-state="storage_pending"]'));
    assert.match(ui.host.textContent, /tekrar gönderilmiyor/); assert.doesNotMatch(ui.host.textContent, /verilerinin silindiği doğrulandı/);
    assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
  } finally { body.resolve({}); await ui.close(); }
});

test("staff session rotation clears an open confirmation and permission failure never reads a private response body", async () => {
  let denied = false; let parsed = false;
  const ui = await setup({ transport(call, state) { return denied ? { ok: false, status: 403, json() { parsed = true; throw new Error("Must not parse unauthorized body"); } } : json(state); } });
  try {
    await ui.mount(); const dialog = await openConfirmation(ui); await ui.click(dialog.querySelector('input[type="checkbox"]'));
    ui.state.staffContext = "staff-session-synthetic-b"; await ui.click(button(ui.host, "Kuyruğu yenile"));
    await ui.until(() => !ui.host.querySelector('[role="dialog"]') && !ui.window.history.state?.kampiraLayer);
    const fresh = await openConfirmation(ui); assert.equal(fresh.querySelector('input[type="checkbox"]').checked, false);
    await ui.click(button(fresh, "Vazgeç")); await ui.until(() => !ui.host.querySelector('[role="dialog"]'));
    denied = true; await ui.click(button(ui.host, "Kuyruğu yenile")); await ui.until(() => ui.accesses() === 1);
    assert.equal(parsed, false); assert.doesNotMatch(ui.host.textContent, /synthetic-erasure@example.invalid/);
    assert.equal(ui.calls.some((call) => call.method === "PATCH"), false);
  } finally { await ui.close(); }
});

async function setupPublic({ transport, items = [], timers } = {}) {
  const calls = []; const state = { account: subject, requests: items };
  const ui = await createMobileDom({ timers, fetch: async (url, options = {}) => { const call = { url, options, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null }; calls.push(call); return transport ? transport(call, state) : json(state); } });
  const Component = ui.load("app/account-deletion/request-panel.tsx").AccountDeletionPanel;
  const until = async (predicate) => { for (let index = 0; index < 120 && !predicate(); index++) await act(async () => new Promise((resolve) => setTimeout(resolve, 3))); assert.ok(predicate(), ui.host.textContent); };
  return { ...ui, state, calls, until, mount: async (account = subject) => { await ui.render(h(Component, { initialAccount: account })); await until(() => !ui.host.textContent.includes("Taleplerin yükleniyor")); } };
}

test("public request requires user confirmation, submits once, and an accepted erasure removes cancellation", async () => {
  const response = deferred();
  const ui = await setupPublic({ transport(call, state) { return call.method === "GET" ? json(state) : response.promise; } });
  try {
    await ui.mount(); assert.equal(ui.calls.some((call) => call.method !== "GET"), false);
    const submit = button(ui.host, "Hesap ve veri silme talebi gönder"); await ui.click(submit);
    assert.equal(ui.calls.some((call) => call.method !== "GET"), false, "Required checkbox rejects an unconfirmed form");
    await ui.click(ui.host.querySelector('[name="confirm"]')); await act(async () => { submit.click(); submit.click(); });
    const calls = ui.calls.filter((call) => call.method === "POST"); assert.equal(calls.length, 1); assert.equal(calls[0].body.confirm, true);
    assert.equal(new Headers(calls[0].options.headers).get("X-Account-Context"), subject.email);
    await act(async () => response.resolve(json({ request: request("in_review", { erasureJob: job() }) })));
    await ui.until(() => ui.host.textContent.includes("Silme işlemi başladı")); assert.equal(Boolean(button(ui.host, /iptal et/)), false);
  } finally { response.resolve(json({ request: request() })); await ui.close(); }
});

test("public mutation body timeout rechecks without replaying and account replacement clears the previous request", async () => {
  const body = deferred(); const clock = deadlines(); let bodyStarted = false;
  const ui = await setupPublic({ timers: clock.timers, transport(call, state) { return call.method === "GET" ? json(state) : { ok: true, status: 200, json: () => { bodyStarted = true; return body.promise; } }; } });
  try {
    await ui.mount(); await ui.click(ui.host.querySelector('[name="confirm"]')); await ui.click(button(ui.host, "Hesap ve veri silme talebi gönder"));
    await ui.until(() => bodyStarted); await act(async () => clock.fire(20_000));
    ui.state.requests = [request("requested")]; await act(async () => body.resolve({ request: request("cancelled") }));
    await ui.until(() => ui.host.textContent.includes("Talep alındı"));
    assert.match(ui.host.textContent, /tekrar gönderilmiyor/); assert.equal(ui.calls.filter((call) => call.method === "POST").length, 1);
    ui.state.account = { email: "second-synthetic@example.invalid", displayName: "Yeni hesap" }; ui.state.requests = [];
    await ui.mount(ui.state.account); assert.doesNotMatch(ui.host.textContent, /synthetic-erasure@example.invalid|request-synthetic-one/);
  } finally { body.resolve({}); await ui.close(); }
});

test("account replacement aborts a pending mutation and its late body cannot show the former account's request", async () => {
  const body = deferred(); let bodyStarted = false;
  const ui = await setupPublic({ transport(call, state) { return call.method === "GET" ? json(state) : { ok: true, status: 200, json: () => { bodyStarted = true; return body.promise; } }; } });
  try {
    await ui.mount(); await ui.click(ui.host.querySelector('[name="confirm"]')); await ui.click(button(ui.host, "Hesap ve veri silme talebi gönder")); await ui.until(() => bodyStarted);
    ui.state.account = { email: "second-synthetic@example.invalid", displayName: "Yeni hesap" }; ui.state.requests = [];
    await ui.mount(ui.state.account); assert.equal(ui.calls.find((call) => call.method === "POST").options.signal.aborted, true);
    await act(async () => body.resolve({ request: request("requested") }));
    assert.match(ui.host.textContent, /second-synthetic@example.invalid/); assert.doesNotMatch(ui.host.textContent, /synthetic-erasure@example.invalid|request-synthetic-one|Talebin kayda alındı/);
    assert.equal(ui.calls.filter((call) => call.method === "POST").length, 1);
  } finally { body.resolve({}); await ui.close(); }
});

test("cancellation rejection after erasure acceptance refreshes the request and cannot report cancelled", async () => {
  const ui = await setupPublic({ items: [request()], transport(call, state) {
    if (call.method === "GET") return json(state);
    assert.equal(call.body.action, "cancel"); state.requests = [request("in_review", { erasureJob: job() })]; return json({ error: "Silme başladıktan sonra iptal edilemez." }, 409);
  } });
  try {
    await ui.mount(); await ui.click(button(ui.host, "Talebi iptal et")); await ui.click(button(ui.host, "Evet, talebi iptal et"));
    await ui.until(() => ui.host.textContent.includes("Silme işlemi başladı")); assert.equal(Boolean(button(ui.host, /iptal et/)), false);
    assert.doesNotMatch(ui.host.textContent, /Silme talebin iptal edildi/); assert.equal(ui.calls.filter((call) => call.method === "PATCH").length, 1);
  } finally { await ui.close(); }
});
