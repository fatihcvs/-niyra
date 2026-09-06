import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function setup() {
  const requests = [], expired = [];
  const ui = await createMobileDom({ packages: { "@/lib/curated-notes": { curatedNotes: [], getCuratedSources: () => [] } }, fetch: (url, options) => { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; } });
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const scopes = ui.load("lib/workspace-state.ts");
  let switchOwner;
  function Harness({ Component, props }) {
    const [owner, setOwner] = useState("owner-a:1");
    switchOwner = (next) => { scopes.setWorkspaceStateOwnerScope(next); setOwner(next); };
    return owner ? h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() { expired.push(owner); switchOwner(null); } }, h(Component, props)) : h("h1", null, "Giriş gerekli");
  }
  const render = async (file, name, props) => { scopes.setWorkspaceStateOwnerScope("owner-a:1"); await ui.render(h(Harness, { Component: ui.load(file)[name], props })); };
  const until = async (condition) => { for (let i = 0; i < 160; i++) { if (condition()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); } assert.ok(condition(), ui.host.textContent); };
  return { ...ui, requests, expired, render, until, switchOwner: (next) => act(async () => switchOwner(next)), resolve: (request, data, status = 200) => act(async () => request.resolve(Response.json(data, { status }))) };
}

test("actual Notes GET and note-upload XHR 401 return to session recovery; expired upload callbacks cannot update another owner", async () => {
  const ui = await setup(), uploads = [];
  ui.window.XMLHttpRequest = class {
    upload = {};
    responseType = "";
    open(method, url) { this.method = method; this.url = url; }
    send(body) { this.body = body; uploads.push(this); }
    abort() { this.aborted = true; }
  };
  try {
    await ui.render("app/product-features.tsx", "NotesWorkspace", { courses: [] });
    await ui.until(() => ui.requests.length === 1);
    await ui.resolve(ui.requests[0], { error: "Oturum gerekli" }, 401);
    assert.equal(ui.host.textContent, "Giriş gerekli"); assert.deepEqual(ui.expired, ["owner-a:1"]);
    await ui.switchOwner("owner-b:2"); await ui.until(() => ui.requests.length === 2);
    await ui.resolve(ui.requests[1], { notes: [] });
    await ui.click(ui.host.querySelector('[data-action-id="notes.upload"]'));
    const submit = () => act(async () => ui.host.querySelector('[role="dialog"] form').dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true })));
    await submit(); assert.equal(uploads.length, 1); assert.equal(uploads[0].url, "/api/notes");
    await act(async () => { uploads[0].status = 401; uploads[0].response = { error: "Oturum gerekli" }; uploads[0].onload(); });
    assert.equal(ui.host.textContent, "Giriş gerekli"); assert.deepEqual(ui.expired, ["owner-a:1", "owner-b:2"]);
    await ui.switchOwner("owner-c:3"); await ui.until(() => ui.requests.length === 3); await ui.resolve(ui.requests[2], { notes: [] });
    await ui.click(ui.host.querySelector('[data-action-id="notes.upload"]')); await submit();
    const lateLoad = uploads[1].onload;
    await ui.switchOwner("owner-d:4"); assert.equal(uploads[1].aborted, true);
    await act(async () => { uploads[1].status = 401; lateLoad(); });
    assert.deepEqual(ui.expired, ["owner-a:1", "owner-b:2"]);
    assert.notEqual(ui.host.textContent, "Giriş gerekli");
  } finally { await ui.close(); }
});

test("actual Campus ignores old-owner 401, while active Housing directory 401 clears the current session", async () => {
  const ui = await setup();
  try {
    await ui.render("app/campus-guide.tsx", "CampusGuideWorkspace", { universityShortName: "TEST" });
    await ui.until(() => ui.requests.length === 1);
    const old = ui.requests[0];
    await ui.switchOwner("owner-b:2"); await ui.until(() => ui.requests.length === 2);
    await ui.resolve(ui.requests[1], { places: [], events: [], suggestion: null });
    await ui.resolve(old, { error: "Eski oturum" }, 401);
    assert.deepEqual(ui.expired, []); assert.notEqual(ui.host.textContent, "Giriş gerekli");
    const housing = [...ui.host.querySelectorAll(".campus-guide-tabs button")].find((button) => button.textContent.includes("Yurt"));
    await ui.click(housing); await ui.until(() => ui.requests.some((request) => request.url.startsWith("/api/housing/catalog")));
    await ui.resolve(ui.requests.find((request) => request.url.startsWith("/api/housing/catalog")), { error: "Oturum gerekli" }, 401);
    assert.equal(ui.host.textContent, "Giriş gerekli"); assert.deepEqual(ui.expired, ["owner-b:2"]);
  } finally { await ui.close(); }
});
