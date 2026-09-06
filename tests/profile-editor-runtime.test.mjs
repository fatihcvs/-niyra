import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { act, createElement as h, useState, useEffect, useRef, useMemo } from "react";
import ts from "typescript";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

// Execute the actual editor and its local helpers without bootstrapping the entire Home/API tree.
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["getInitials", "ProfileLinks", "Logo", "useProfileMediaPreview", "ProfileEditor"];
const declarations = names.map((name) => ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join("\n");
const code = ts.transpileModule(`${declarations}\nglobalThis.Editor = ProfileEditor;`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const profile = { publicId: "student-a", displayName: "Örnek Öğrenci", handle: "ornek", bio: "Özgün biyografi", links: [], avatarUrl: null, universityShortName: "ÖÜ", universityName: "Örnek Üniversite", facultyName: "Mühendislik", departmentName: "Bilgisayar", classYear: 2, courses: [] };
const NativeFormData = globalThis.FormData;
async function setup(fetch = async () => { throw new Error("Unexpected request"); }) {
  const ui = await createMobileDom({ fetch });
  const navigation = ui.load("app/app-navigation.tsx"), state = ui.load("lib/workspace-state.ts");
  const context = { exports: {}, require: createRequire(import.meta.url), useState, useEffect, useRef, useMemo, window: ui.window, document: ui.document, URL, FormData: NativeFormData, fetch, useAuthenticatedFetch: ui.load("app/use-authenticated-fetch.ts").useAuthenticatedFetch, useAppNavigation: navigation.useAppNavigation, useWorkspaceState: ui.load("app/use-workspace-state.ts").useWorkspaceState, workspaceState: state.workspaceState, ...ui.load("app/social-primitives.tsx"), Icon: ui.load("app/ui-icon.tsx").UiIcon, Image: (props) => { const attributes = { ...props }; delete attributes.fill; delete attributes.unoptimized; return h("img", attributes); } };
  runInNewContext(code, context);
  let saved = 0, canceled = 0, expired = 0;
  const render = (owner = "student-a:0", data = profile) => { state.setWorkspaceStateOwnerScope(owner); return ui.render(h(navigation.AppNavigationProvider, { ownerScope: owner, onBack() {}, onSessionExpired() { expired++; } }, h(context.Editor, { key: owner, profile: data, onSaved() { saved++; }, onCancel() { canceled++; }, onEditAcademic() {} }))); };
  return { ...ui, render, hide: () => ui.render(null), state, saved: () => saved, canceled: () => canceled, expired: () => expired };
}

test("Back-style remount preserves profile edits; explicit cancel removes them and another account starts clean", async () => {
  const ui = await setup();
  try {
    await ui.render(); await ui.fill(ui.host.querySelector("textarea"), "Yarım kalan düzenleme");
    await ui.hide(); await ui.render();
    assert.equal(ui.host.querySelector("textarea").value, "Yarım kalan düzenleme");
    await ui.click([...ui.host.querySelectorAll("button")].find((button) => button.textContent === "Vazgeç"));
    assert.equal(ui.canceled(), 1);
    await ui.hide(); await ui.render();
    assert.equal(ui.host.querySelector("textarea").value, profile.bio);
    await ui.fill(ui.host.querySelector("textarea"), "Birinci hesap taslağı");
    await ui.render("student-b:0", { ...profile, publicId: "student-b", bio: "İkinci hesap" });
    assert.equal(ui.host.querySelector("textarea").value, "İkinci hesap");
  } finally { await ui.close(); }
});

test("duplicate profile saves make one request and a closed editor cannot navigate on a late success", async () => {
  let finish, calls = 0;
  const ui = await setup(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  try {
    await ui.render();
    const form = ui.host.querySelector("form");
    await act(async () => { form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(calls, 1);
    await ui.hide();
    await act(async () => finish({ ok: true, status: 200, json: async () => ({ profile }) }));
    assert.equal(ui.saved(), 0);
  } finally { await ui.close(); }
});

test("profile save 401 requests session recovery once without saving or reloading", async () => {
  const ui = await setup(async () => ({ ok: false, status: 401, json: async () => ({ authRequired: true }) }));
  try {
    await ui.render();
    await act(async () => ui.host.querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(ui.expired(), 1);
    assert.equal(ui.saved(), 0);
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /yeniden giriş/);
  } finally { await ui.close(); }
});

test("server rejection retains the draft and a confirmed save clears its cached edit", async () => {
  let succeeds = false;
  const ui = await setup(async () => ({ ok: succeeds, status: succeeds ? 200 : 409, json: async () => succeeds ? { profile } : { error: "Kullanıcı adı kullanılıyor." } }));
  try {
    await ui.render(); await ui.fill(ui.host.querySelector("textarea"), "Düzenlenen biyografi");
    const submit = async () => act(async () => { ui.host.querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })); });
    await submit();
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /Kullanıcı adı/);
    await ui.hide(); await ui.render(); assert.equal(ui.host.querySelector("textarea").value, "Düzenlenen biyografi");
    succeeds = true; await submit(); assert.equal(ui.saved(), 1);
    await ui.hide(); await ui.render(); assert.equal(ui.host.querySelector("textarea").value, profile.bio);
  } finally { await ui.close(); }
});

async function selectAvatar(ui, file) {
  const input = ui.host.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new ui.window.Event("change", { bubbles: true })));
}

test("avatar-only editor previews the real file and saves details, avatar bytes and refreshed profile", async () => {
  const calls = [];
  const ui = await setup(async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ profile: { ...profile, avatarUrl: "/api/profile/media?kind=avatar" } }) };
  });
  try {
    await ui.render();
    assert.equal(ui.host.querySelectorAll('input[type="file"]').length, 1);
    assert.equal(ui.host.querySelectorAll(".profile-cover,.profile-banner-thumb").length, 0);
    assert.doesNotMatch(ui.host.textContent, /Kapak/);
    await ui.fill(ui.host.querySelector("textarea"), "Fotoğrafla birlikte kaydedilen biyografi");
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "profil.png", { type: "image/png" });
    await selectAvatar(ui, file);
    const previewUrl = ui.host.querySelector(".profile-media-controls .avatar img").getAttribute("src");
    assert.match(previewUrl, /^blob:/);
    assert.equal(ui.host.querySelector(".profile-editor-identity .avatar img").getAttribute("src"), previewUrl);
    assert.equal(calls.length, 0, "selecting only creates a local preview");
    await act(async () => ui.host.querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(ui.saved(), 1);
    assert.deepEqual(calls.map(({ url, options }) => [url, options.method ?? "GET"]), [["/api/profile", "PUT"], ["/api/profile/media", "POST"], ["/api/profile", "GET"]]);
    assert.equal(JSON.parse(calls[0].options.body).bio, "Fotoğrafla birlikte kaydedilen biyografi");
    assert.equal(calls[1].options.body.get("kind"), "avatar");
    const uploaded = calls[1].options.body.get("image");
    assert.equal(uploaded.name, file.name);
    assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
    assert.equal(ui.state.workspaceState.read("student-a:0", "profile-editor.avatar", null), null);
  } finally { await ui.close(); }
});

test("removing the current avatar immediately clears its preview and saves only the avatar removal", async () => {
  const calls = [];
  const ui = await setup(async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ profile }) };
  });
  try {
    await ui.render("student-a:0", { ...profile, avatarUrl: "/api/profile/media?kind=avatar" });
    await ui.click([...ui.host.querySelectorAll(".profile-media-controls button")].find((button) => button.textContent === "Kaldır"));
    assert.equal(ui.host.querySelectorAll(".profile-media-controls .avatar img,.profile-editor-identity .avatar img").length, 0);
    assert.equal(calls.length, 0);
    await act(async () => ui.host.querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(ui.saved(), 1);
    const mediaCalls = calls.filter(({ url }) => url === "/api/profile/media");
    assert.equal(mediaCalls.length, 1);
    assert.equal(mediaCalls[0].options.method, "DELETE");
    assert.deepEqual(JSON.parse(mediaCalls[0].options.body), { kind: "avatar" });
  } finally { await ui.close(); }
});

test("invalid avatar selections preserve the valid photo draft and its file bytes", async () => {
  const ui = await setup();
  try {
    await ui.render();
    const file = new File(["avatar"], "profil.jpg", { type: "image/jpeg" });
    await selectAvatar(ui, file);
    const preview = () => ui.host.querySelector(".profile-media-controls .avatar img").getAttribute("src");
    const originalPreview = preview();
    await selectAvatar(ui, new File(["text"], "document.txt", { type: "text/plain" }));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /PNG, JPG veya WEBP/);
    assert.equal(preview(), originalPreview);
    await selectAvatar(ui, new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /en fazla 4 MB/);
    assert.equal(preview(), originalPreview);
    assert.equal(ui.state.workspaceState.read("student-a:0", "profile-editor.avatar", null), file);
  } finally { await ui.close(); }
});
