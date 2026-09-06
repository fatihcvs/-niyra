import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { act, createElement as h, StrictMode, useEffect, useMemo, useRef, useState } from "react";
import ts from "typescript";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["AuthGate", "AcademicOnboarding", "getInitials", "getFirstName", "normalizeCourseCode"];
const declarations = names.map((name) => { const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name); assert.ok(declaration, `Actual component/helper ${name} exists`); return declaration.getText(ast); }).join("\n");
const code = ts.transpileModule(`${declarations}\nglobalThis.components = {AuthGate, AcademicOnboarding};`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const universities = [{ id: "omu", name: "Örnek Üniversite A", shortName: "ÖÜA", region: "Türkiye", city: "Örnek A" }, { id: "second", name: "Örnek Üniversite B", shortName: "ÖÜB", region: "Türkiye", city: "Örnek B" }];
const catalog = (units = []) => ({ units, programs: [], sources: [], updatedAt: "2026-09-05", coverage: "catalog-only" });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
const profile = { displayName: "Örnek Öğrenci", universityId: "omu", facultyId: "", departmentId: "", facultyName: "Mühendislik", departmentName: "Bilgisayar", classYear: 2, courses: [1, 2, 3].map((n) => ({ code: `DERS${n}`, name: `Örnek ders ${n}` })) };

async function setup(fetch) {
  const ui = await createMobileDom();
  // jsdom has no layout engine; only semantic focus is asserted, not scroll geometry.
  ui.window.HTMLElement.prototype.scrollIntoView = () => {};
  const context = { exports: {}, require: createRequire(import.meta.url), useEffect, useMemo, useRef, useState, document: ui.document, window: ui.window, FormData: ui.window.FormData, AbortController, Error, fetch, universities, getUniversityById: (id) => universities.find((university) => university.id === id), degreeLabels: { bachelor: "Lisans" }, courseMatchesYear: () => true, courseScheduleLabel: () => "", Logo: () => h("span", null, "Kampira"), UniversityMark: ({ university }) => h("span", { "aria-hidden": true }, university.shortName), Icon: () => h("span", { "aria-hidden": true }) };
  runInNewContext(code, context);
  const button = (label) => [...ui.host.querySelectorAll("button")].find((element) => element.textContent === label);
  const click = async (target) => ui.click(typeof target === "string" ? button(target) : target);
  const until = async (predicate) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(predicate(), ui.host.textContent); };
  const renderAuth = (props = {}) => ui.render(h(StrictMode, null, h(context.components.AuthGate, { onAuthenticated() {}, ...props })));
  const renderAcademic = (props = {}) => ui.render(h(StrictMode, null, h(context.components.AcademicOnboarding, { identityName: "Örnek Öğrenci", initialProfile: null, state: "needs-onboarding", onComplete() {}, onRetry() {}, ...props })));
  const submit = async (twice = false) => act(async () => { const form = ui.host.querySelector("form"); for (let i = 0; i < (twice ? 2 : 1); i++) form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); });
  return { ...ui, button, click, until, renderAuth, renderAcademic, submit, hide: () => ui.render(null) };
}

test("registration validation focuses the first missing field and password visibility never submits", async () => {
  let calls = 0;
  const ui = await setup(async () => { calls++; throw new Error("No request should start"); });
  try {
    await ui.renderAuth(); await ui.submit();
    assert.equal(ui.document.activeElement.name, "displayName");
    await ui.fill(ui.host.querySelector('[name="displayName"]'), "Örnek Öğrenci"); await ui.submit();
    assert.equal(ui.document.activeElement.name, "email");
    await ui.fill(ui.host.querySelector('[name="email"]'), "student@example.invalid"); await ui.submit();
    assert.equal(ui.document.activeElement.name, "password");
    await ui.fill(ui.host.querySelector('[name="password"]'), "synthetic-password");
    await ui.click(ui.host.querySelector('[aria-label="Parolan: parolayı göster"]'));
    assert.equal(ui.host.querySelector('[name="password"]').type, "text"); await ui.submit();
    assert.equal(ui.document.activeElement.name, "passwordConfirmation");
    await ui.click(ui.host.querySelector('[role="tab"][aria-selected="false"]'));
    assert.equal(ui.host.querySelector('[name="email"]').value, "student@example.invalid");
    assert.equal(ui.host.querySelector('[name="password"]').type, "password");
    assert.equal(calls, 0);
  } finally { await ui.close(); }
});

test("login rejection retains inputs; duplicate submits make one request and unmount ignores late success", async () => {
  const requests = [], pending = [];
  const ui = await setup((url, options) => { const task = deferred(); requests.push({ url, options }); pending.push(task); return task.promise; });
  let authenticated = 0;
  try {
    await ui.renderAuth({ onAuthenticated() { authenticated++; } });
    await ui.click(ui.host.querySelector('[role="tab"][aria-selected="false"]'));
    await ui.fill(ui.host.querySelector('[name="email"]'), "student@example.invalid");
    await ui.fill(ui.host.querySelector('[name="password"]'), "synthetic-password");
    await ui.submit(true); assert.equal(requests.length, 1);
    assert.equal(ui.host.querySelector('[role="tab"][aria-selected="false"]').disabled, true);
    assert.equal(ui.host.querySelector('[name="email"]').disabled, true);
    await act(async () => pending[0].resolve(response({ error: "Bilgilerini kontrol et." }, 401)));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /Bilgilerini kontrol/);
    assert.equal(ui.host.querySelector('[name="email"]').value, "student@example.invalid");
    assert.equal(ui.host.querySelector('[name="password"]').value, "synthetic-password");
    await ui.submit(true); assert.equal(requests.length, 2); await ui.hide();
    assert.equal(requests[1].options.signal.aborted, true);
    await act(async () => pending[1].resolve(response({ user: { displayName: "Örnek Öğrenci" } })));
    assert.equal(authenticated, 0);
    await ui.renderAuth({ onAuthenticated() { authenticated++; } });
    assert.equal(ui.host.querySelector('[name="password"]').value, "", "Password is not retained outside the mounted form");
    await ui.click(ui.host.querySelector('[role="tab"][aria-selected="false"]'));
    await ui.fill(ui.host.querySelector('[name="email"]'), "student@example.invalid");
    await ui.fill(ui.host.querySelector('[name="password"]'), "synthetic-password");
    await ui.submit(true);
    await act(async () => pending[2].resolve(response({ user: { displayName: "Örnek Öğrenci" } })));
    assert.equal(authenticated, 1);
  } finally { await ui.close(); }
});

test("obsolete university response cannot replace current choices; next/back preserve fields and focus exact missing course", async () => {
  const pending = [];
  const ui = await setup((url, options) => { const task = deferred(); pending.push({ url, options, ...task }); return task.promise; });
  try {
    await ui.renderAcademic();
    await ui.click([...ui.host.querySelectorAll(".university-grid button")].find((button) => button.textContent.includes("Üniversite B")));
    const current = pending.findLast((request) => request.url.endsWith("universityId=second"));
    await act(async () => current.resolve(response(catalog())));
    await act(async () => { for (const request of pending.filter((request) => request.url.endsWith("universityId=omu"))) request.resolve(response(catalog([{ id: "obsolete", name: "Eski fakülte", type: "Fakülte", programCount: 0 }]))); });
    await act(async () => { ui.button("Devam et").click(); ui.button("Devam et").click(); });
    assert.match(ui.host.querySelector("h1").textContent, /Hangi fakültedesin/);
    assert.equal(ui.document.activeElement, ui.host.querySelector("h1"));
    assert.doesNotMatch(ui.host.textContent, /Eski fakülte/);
    await ui.click("Devam et"); assert.equal(ui.document.activeElement, ui.host.querySelector(".custom-academic-field input"));
    await ui.fill(ui.host.querySelector(".custom-academic-field input"), "Mühendislik"); await ui.click("Devam et");
    await ui.fill(ui.host.querySelector(".custom-academic-field input"), "Bilgisayar"); await ui.click("Geri");
    assert.equal(ui.host.querySelector(".custom-academic-field input").value, "Mühendislik");
    await ui.click("Devam et"); assert.equal(ui.host.querySelector(".custom-academic-field input").value, "Bilgisayar");
    await ui.click("Devam et");
    const inputs = [...ui.host.querySelectorAll(".custom-course-row input")];
    for (let i = 0; i < 5; i++) await ui.fill(inputs[i], `Ders ${i}`);
    await ui.click("Devam et"); assert.equal(ui.document.activeElement, inputs[5]);
    await ui.click("Geri"); await ui.click("Devam et");
    assert.equal(ui.host.querySelector(".custom-course-row input").value, "Ders 0");
  } finally { await ui.close(); }
});

test("academic save is single-flight, 400 keeps draft, 401 requests session recovery, and unmount fences late success", async () => {
  const saves = [];
  const ui = await setup((url, options) => {
    if (url.startsWith("/api/academic-catalog")) return Promise.resolve(response(catalog()));
    assert.equal(url, "/api/profile"); assert.equal(options.method, "PUT");
    const task = deferred(); saves.push({ ...task, options }); return task.promise;
  });
  let completed = 0, expired = 0;
  try {
    await ui.renderAcademic({ initialProfile: profile, mode: "edit", onComplete() { completed++; }, onSessionExpired() { expired++; } });
    await ui.until(() => ui.button("Devam et") && !ui.host.querySelector(".catalog-loading"));
    for (let step = 1; step < 5; step++) { await ui.click("Devam et"); await ui.until(() => !ui.button("Devam et") || !ui.button("Devam et").disabled); }
    await ui.fill(ui.host.querySelector('[aria-label="Görünen ad"]'), "Düzenlenmiş Öğrenci");
    const save = async () => act(async () => { ui.button("Değişiklikleri kaydet").click(); ui.button("Değişiklikleri kaydet").click(); });
    await save(); assert.equal(saves.length, 1);
    assert.equal(ui.host.querySelector('[aria-label="Görünen ad"]').disabled, true);
    await act(async () => saves[0].resolve(response({ error: "Derslerini kontrol et." }, 400)));
    assert.equal(ui.host.querySelector('[aria-label="Görünen ad"]').value, "Düzenlenmiş Öğrenci");
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /Derslerini kontrol/);
    await save(); await act(async () => saves[1].resolve(response(null, 401)));
    assert.equal(expired, 1); assert.equal(completed, 0);
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /Oturumun sona erdi/);
    await save(); assert.equal(saves.length, 3); await ui.hide();
    assert.equal(saves[2].options.signal.aborted, true);
    await act(async () => saves[2].resolve(response({ profile })));
    assert.equal(completed, 0);
  } finally { await ui.close(); }
});
