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
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { resolve, reject, promise }; };
const profile = { displayName: "Örnek Öğrenci", universityId: "omu", facultyId: "", departmentId: "", facultyName: "Mühendislik", departmentName: "Bilgisayar", classYear: 2, courses: [1, 2, 3].map((n) => ({ code: `DERS${n}`, name: `Örnek ders ${n}` })) };
const officialCatalog = { ...catalog([{ id: "engineering", name: "Mühendislik", type: "Fakülte", programCount: 1 }]), programs: [{ id: "computer", unitId: "engineering", name: "Bilgisayar", degreeLevel: "bachelor" }] };
const courseCatalog = (courses, available = true) => ({ available, courses, authority: "Resmî üniversite", sourceUrl: "https://example.invalid/courses", verifiedAt: "2026-09-08", coverage: "partial" });
const publishedCatalog = JSON.parse(readFileSync(new URL("../data/official-course-catalog-2026.json", import.meta.url), "utf8"));
const unknownScheduleCourse = Object.values(publishedCatalog.programs).flatMap((program) => program.courses).find((course) => course.semester === null && course.year === undefined && !course.offeredSemesters?.length);
assert.ok(unknownScheduleCourse, "The released catalog contains a real course without published year/semester metadata");

async function openCoursePicker(ui, classYear = 1) {
  await ui.renderAcademic({ initialProfile: { ...profile, facultyId: "engineering", departmentId: "computer", classYear, courses: [] }, mode: "edit" });
  await ui.until(() => ui.button("Devam et") && !ui.button("Devam et").disabled);
  for (let step = 1; step < 4; step++) await ui.click("Devam et");
  await ui.until(() => ui.host.querySelector(".official-course-picker, .course-catalog-unavailable"));
}

async function setup(fetch, { platformConfig = { registrationOpen: true, betaAccessOnly: false } } = {}) {
  const ui = await createMobileDom();
  // jsdom has no layout engine; only semantic focus is asserted, not scroll geometry.
  ui.window.HTMLElement.prototype.scrollIntoView = () => {};
  const context = { exports: {}, require: createRequire(import.meta.url), useEffect, useMemo, useRef, useState, document: ui.document, window: ui.window, FormData: ui.window.FormData, AbortController, Error, fetch: (url, options) => url === "/api/platform-config" && platformConfig ? Promise.resolve(response(platformConfig)) : fetch(url, options), universities, getUniversityById: (id) => universities.find((university) => university.id === id), degreeLabels: { bachelor: "Lisans" }, ...ui.load("lib/course-catalog-display.ts"), Logo: () => h("span", null, "Kampira"), UniversityMark: ({ university }) => h("span", { "aria-hidden": true }, university.shortName), Icon: () => h("span", { "aria-hidden": true }) };
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

test("public registration fails closed until settings are verified, and beta access keeps existing email login", async () => {
  const requests = [];
  const ui = await setup((url, options) => { const task = deferred(); requests.push({ url, options, ...task }); return task.promise; }, { platformConfig: null });
  try {
    await ui.renderAuth();
    assert.equal(ui.button("Kayıt ol"), undefined);
    assert.equal(ui.host.querySelector('[name="displayName"]'), null);
    assert.equal(ui.host.querySelector('a[href="/beta/basvur"]').textContent, "Teste başvur");
    const config = requests.findLast(item => item.url === "/api/platform-config");
    assert.equal(config.options.cache, "no-store");
    await act(async () => config.resolve(response({ registrationOpen: true, betaAccessOnly: true })));
    assert.match(ui.host.textContent, /Test hesabınla giriş yap/);
    assert.equal(ui.button("Kayıt ol"), undefined);
    await ui.fill(ui.host.querySelector('[name="email"]'), "existing@example.invalid");
    await ui.fill(ui.host.querySelector('[name="password"]'), "existing-password");
    await ui.submit(true);
    assert.equal(requests.filter(item => item.url === "/api/auth/session").length, 1);
    assert.equal(requests.some(item => item.url === "/api/auth/register"), false);
  } finally { await ui.close(); }
});

test("invalid public config never opens signup and retry can restore explicitly open registration", async () => {
  let configCalls = 0;
  const ui = await setup(async (url) => {
    assert.equal(url, "/api/platform-config");
    return response(++configCalls <= 2 ? { maintenanceMode: false } : { registrationOpen: true, betaAccessOnly: false });
  }, { platformConfig: null });
  try {
    await ui.renderAuth();
    assert.equal(ui.button("Kayıt ol"), undefined);
    assert.match(ui.host.textContent, /Yeni hesap erişimi doğrulanamadı/);
    await ui.click("Yeniden dene");
    assert.ok(ui.button("Kayıt ol"));
    assert.ok(ui.host.querySelector('[name="displayName"]'));
  } finally { await ui.close(); }
});

test("the real unknown-semester course remains selectable beside year matches without invented metadata", async () => {
  const calls = [];
  const firstYear = { code: "YEAR101", name: "Birinci sınıf dersi", semester: 1, kind: "required" };
  const secondYear = { code: "YEAR201", name: "İkinci sınıf dersi", semester: 3, kind: "required" };
  const ui = await setup(async (url, options) => {
    calls.push({ url, options });
    return response(url.startsWith("/api/academic-catalog") ? officialCatalog : courseCatalog([firstYear, unknownScheduleCourse, secondYear]));
  });
  try {
    await openCoursePicker(ui);
    const choices = () => [...ui.host.querySelectorAll(".official-course-grid > button")];
    assert.equal(choices().length, 2);
    const unknownChoice = choices().find((button) => button.textContent.includes(unknownScheduleCourse.code));
    assert.ok(unknownChoice);
    assert.match(unknownChoice.textContent, /Dönemi belirtilmemiş/);
    assert.equal(ui.button("1. sınıf").getAttribute("aria-pressed"), "true");
    assert.equal(ui.button("Tüm dönemler").getAttribute("aria-pressed"), "false");
    await ui.click(unknownChoice);
    assert.equal(unknownChoice.getAttribute("aria-pressed"), "true");
    assert.ok(ui.host.querySelector(".selected-course-tray").textContent.includes(unknownScheduleCourse.code));
    await ui.fill(ui.host.querySelector('[aria-label="Resmî derslerde ara"]'), "Olmayan arama sonucu xyz");
    assert.equal(choices().length, 0);
    assert.match(ui.host.textContent, /Aramanla eşleşen ders bulunamadı/);
    assert.doesNotMatch(ui.host.textContent, /Seçim yapabilmen için tüm dönemlerin/);
    assert.equal(ui.button("1. sınıf").getAttribute("aria-pressed"), "true");
    await ui.click("Aramayı temizle");
    assert.equal(choices().length, 2);
    await ui.click("Tüm dönemler");
    assert.equal(choices().length, 3);
    assert.ok(calls.filter(({ url }) => url.startsWith("/api/course-catalog")).every(({ options }) => options.cache === "no-cache"));
  } finally { await ui.close(); }
});

test("a missing academic year opens all real courses, while an empty search keeps its own recovery", async () => {
  const courses = [{ code: "YEAR101", name: "Birinci sınıf dersi", semester: 1, kind: null }, { code: "YEAR201", name: "İkinci sınıf dersi", semester: 3, kind: null }, unknownScheduleCourse];
  const ui = await setup(async (url) => response(url.startsWith("/api/academic-catalog") ? officialCatalog : courseCatalog(courses)));
  try {
    await openCoursePicker(ui, 6);
    assert.equal(ui.host.querySelectorAll(".official-course-grid > button").length, 3);
    assert.match(ui.host.textContent, /6\. sınıf için ders bulunamadı/);
    assert.equal(ui.button("6. sınıf").getAttribute("aria-pressed"), "false");
    assert.equal(ui.button("Tüm dönemler").getAttribute("aria-pressed"), "true");
    assert.equal(ui.button("Tüm dönemler").className, "active");
    await ui.fill(ui.host.querySelector('[aria-label="Resmî derslerde ara"]'), "Bulunmayan ders xyz");
    assert.equal(ui.host.querySelectorAll(".official-course-grid > button").length, 0);
    assert.match(ui.host.textContent, /Aramanla eşleşen ders bulunamadı/);
    assert.equal(ui.button("Tüm dönemler").getAttribute("aria-pressed"), "true");
    await ui.click("Aramayı temizle");
    assert.equal(ui.host.querySelectorAll(".official-course-grid > button").length, 3);
    await ui.click("Geri");
    await ui.click(ui.host.querySelector(".year-picker button"));
    await ui.click("Devam et");
    assert.equal(ui.host.querySelectorAll(".official-course-grid > button").length, 2);
    assert.equal(ui.button("1. sınıf").getAttribute("aria-pressed"), "true");
    assert.doesNotMatch(ui.host.textContent, /Seçim yapabilmen için tüm dönemlerin/);
  } finally { await ui.close(); }
});

test("missing and failed catalogs provide an empty manual row; retries refresh without losing typed choices", async () => {
  const requests = [];
  const ui = await setup((url, options) => {
    if (url.startsWith("/api/academic-catalog")) return Promise.resolve(response(officialCatalog));
    if (requests.length === 0) { requests.push({ options }); return Promise.resolve(response(courseCatalog([], false))); }
    const pending = deferred(); requests.push({ options, ...pending }); return pending.promise;
  });
  try {
    await openCoursePicker(ui);
    assert.ok(ui.host.querySelectorAll(".custom-course-row").length >= 1);
    // Remove every blank row so a failed retry must recover from the actual empty selection state.
    while (ui.host.querySelector(".custom-course-row > button")) await ui.click(ui.host.querySelector(".custom-course-row > button"));
    assert.equal(ui.host.querySelectorAll(".custom-course-row").length, 0);
    await ui.click("Ders listesini yeniden dene");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].options.cache, "no-store");
    assert.ok(ui.host.querySelector(".course-catalog-loading"));
    assert.equal(ui.button("Ders listesini yeniden dene"), undefined);
    await act(async () => requests[1].reject(new Error("Geçici ağ hatası")));
    assert.equal(ui.host.querySelectorAll(".custom-course-row").length, 1);
    assert.match(ui.host.textContent, /Ders listesi şu an yüklenemedi/);
    const fields = [...ui.host.querySelectorAll(".custom-course-row input")];
    await ui.fill(fields[0], "MAN101"); await ui.fill(fields[1], "Kendi gerçek dersim");
    await ui.click("Ders listesini yeniden dene");
    assert.equal(requests[2].options.cache, "no-store");
    assert.doesNotMatch(ui.host.textContent, /Geçici ağ hatası/);
    assert.equal(fields[0].value, "MAN101");
    await act(async () => requests[2].resolve(response(courseCatalog([], false))));
    assert.equal(ui.host.querySelectorAll(".custom-course-row").length, 1);
    assert.equal(ui.host.querySelector(".custom-course-row input").value, "MAN101");
    await ui.click("Ders listesini yeniden dene");
    await act(async () => requests[3].resolve(response(courseCatalog([unknownScheduleCourse]))));
    assert.ok(ui.host.querySelector(".official-course-picker"));
    assert.equal(ui.button("Tüm dönemler").getAttribute("aria-pressed"), "true", "A catalog containing only unspecified periods also opens all real courses");
    assert.equal(ui.host.querySelector(".custom-course-row input").value, "MAN101");
    assert.match(ui.host.querySelector(".selected-course-tray").textContent, /MAN101/);
    assert.doesNotMatch(ui.host.textContent, /Geçici ağ hatası|Ders listesi şu an yüklenemedi/);
  } finally { await ui.close(); }
});
