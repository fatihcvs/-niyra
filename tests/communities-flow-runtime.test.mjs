import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const community = (id, patch = {}) => ({ id, name: `[SYNTHETIC] ${id} çalışma topluluğu`, slug: id, description: "[SYNTHETIC] Yalnız izole bileşen testi.", category: "akademik", joinPolicy: "open", rules: "[SYNTHETIC] Saygılı ol.", status: "active", courseId: null, courseCode: null, creatorId: "founder", creatorName: "[SYNTHETIC] Kurucu", memberCount: 3, postCount: 0, weeklyPostCount: 0, eventCount: 0, lastActive: "şimdi", joined: true, pending: false, role: "founder", notificationLevel: "all", canManage: true, nextEvent: null, ...patch });
const post = { id: "post-a", authorId: "person-a", authorName: "[SYNTHETIC] Deniz", authorHandle: "deniz", departmentName: "Bölüm", avatarUrl: null, content: "[SYNTHETIC] İlgili paylaşım", postType: "discussion", pinned: false, own: false, liked: false, saved: false, likeCount: 0, commentCount: 0, time: "şimdi", edited: false, createdAt: "2026-09-05T09:00:00.000Z" };
const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

describe("actual community DOM, shared Back layers and session drafts", () => {
  let ui, Workspace, Provider, respond, calls;
  const all = [community("a"), community("b")];
  const baseResponse = (url) => {
    const parsed = new URL(url, "http://localhost"); const id = parsed.searchParams.get("id");
    if (parsed.pathname === "/api/communities" && id) return json({ community: all.find((item) => item.id === id), members: [{ publicId: "member-a", displayName: "[SYNTHETIC] Üye", handle: "uye", role: "member", status: "active", departmentName: "Bölüm", avatarUrl: null }], bans: [] });
    if (parsed.pathname === "/api/community-posts") return json({ posts: parsed.searchParams.get("communityId") === "a" ? [post] : [] });
    if (parsed.pathname === "/api/community-events") return json({ events: [] });
    return json({ communities: all, stats: { total: 2, joined: 2, newThisWeek: 0, upcomingEvents: 0 } });
  };
  const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  const button = (label, within = ui.host) => [...within.querySelectorAll("button")].find((node) => node.textContent.trim() === label);
  const detail = () => ui.host.querySelector('[aria-labelledby="community-title"]');
  const create = () => ui.host.querySelector('[aria-labelledby="create-community-title"]');
  const events = () => ui.host.querySelector('[aria-labelledby="event-create-title"]');
  const open = async (id) => { await ui.click(ui.host.querySelector(`[aria-label='${community(id).name} topluluğunu aç']`)); await settle(); };
  const render = async (owner = "viewer:1") => { await ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() {} }, h(Workspace, { courses: [] }))); await settle(); };
  beforeEach(async () => {
    calls = []; respond = async (url) => baseResponse(url);
    const packages = {};
    ui = await createMobileDom({ view: "communities", packages, fetch: async (url, options) => { calls.push({ url, options }); return respond(url, options); } });
    for (const name of ["latest-request", "community-requests", "profile-content-state"]) packages[`@/lib/${name}`] = ui.load(`lib/${name}.ts`);
    Workspace = ui.load("app/communities-workspace.tsx").CommunitiesWorkspace;
    Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
    ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("viewer:1");
  });
  afterEach(async () => { await ui.close(); });

  test("native community sharing uses a canonical link and cancels when the community view unmounts", async () => {
    const commands = []; ui.window.KampiraFiles = { postMessage(value) { commands.push(JSON.parse(value)); } };
    await render(); await open("a"); assert.equal(commands.length, 0);
    await ui.click(button("Paylaş", detail().querySelector(".postCard")));
    const request = commands[0]; assert.equal(request.command, "shareLink"); assert.equal(request.url, "http://localhost/?post=post-a"); assert.equal(request.accountId, "viewer");
    await ui.render(h("main", null, "Another workspace"));
    assert.equal(commands.at(-1).command, "cancel"); assert.equal(commands.at(-1).requestId, request.id);
    await act(async () => ui.window.KampiraFiles.onmessage({ data: JSON.stringify({ protocolVersion: 1, id: request.id, accountId: request.accountId, state: "shareOpened" }) }));
    assert.equal(ui.host.textContent, "Another workspace");
  });

  test("create form Back retains actual multi-step draft and filter state through remount, isolated by owner", async () => {
    await render();
    await ui.fill(ui.host.querySelector(".search input"), "İğdır");
    await ui.click(ui.host.querySelector('[data-action-id="communities.create"]'));
    await ui.fill(create().querySelector("input"), "[SYNTHETIC] İğdır Grubu");
    await ui.fill(create().querySelector("textarea"), "[SYNTHETIC] Ayrıntılı çalışma amacı");
    await ui.click(button("Devam et", create()));
    assert.match(create().textContent, /Kiminle buluşacağını/);
    await ui.travel("back"); assert.equal(create(), null);
    await ui.render(h("div", null, "Another workspace")); await render();
    assert.equal(ui.host.querySelector(".search input").value, "İğdır");
    await ui.click(ui.host.querySelector('[data-action-id="communities.create"]'));
    assert.match(create().textContent, /Kiminle buluşacağını/);
    await ui.click(button("Geri", create())); assert.equal(create().querySelector("input").value, "[SYNTHETIC] İğdır Grubu");
    assert.equal(JSON.stringify(ui.window.history.state).includes("İğdır Grubu"), false);
    await ui.travel("back"); await ui.render(h("div", null, "Account switch"));
    ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("other:1"); await render("other:1");
    await ui.click(ui.host.querySelector('[data-action-id="communities.create"]')); assert.equal(create().querySelector("input").value, "");
    assert.ok(calls.every(({ options }) => !options?.method));
  });

  test("nested event closes first, focus returns, recipient-specific event/post drafts and tabs survive revisit", async () => {
    await render(); await open("a");
    await ui.fill(detail().querySelector('[aria-label="Topluluğunla paylaşımın"]'), "[SYNTHETIC] Draft A");
    await ui.click(button("Etkinlikler", detail())); await ui.click(button("Etkinlik oluştur", detail()));
    await ui.fill(events().querySelector('[name="title"]'), "[SYNTHETIC] Etkinlik A");
    assert.equal(ui.window.history.state.kampiraLayer.id, "communities.event:a");
    await ui.travel("back"); assert.equal(events(), null); assert.ok(detail());
    assert.equal(ui.document.activeElement, button("Etkinlik oluştur", detail()));
    await ui.click(button("Etkinlik oluştur", detail())); assert.equal(events().querySelector('[name="title"]').value, "[SYNTHETIC] Etkinlik A");
    await ui.travel("back"); await ui.travel("back"); assert.equal(detail(), null);
    await open("b"); assert.equal(detail().querySelector('[aria-label="Topluluğunla paylaşımın"]').value, "");
    await ui.travel("back"); await open("a"); assert.ok(button("Etkinlik oluştur", detail()));
    await ui.click(button("Akış", detail())); assert.equal(detail().querySelector('[aria-label="Topluluğunla paylaşımın"]').value, "[SYNTHETIC] Draft A");
    const historyLength = ui.window.history.length;
    await ui.render(h("div", null, "Profile visit")); await render();
    assert.equal(ui.window.history.length, historyLength, "a remounted detail adopts the existing shared layer instead of pushing again");
    assert.equal(detail().querySelector('[aria-label="Topluluğunla paylaşımın"]').value, "[SYNTHETIC] Draft A");
  });

  test("member search shows a real read failure and retry, then discards a late result after a new query", async () => {
    await render(); await open("a");
    respond = async (url) => url.includes("memberQ=") ? json({ error: "[SYNTHETIC] Member fetch failed" },503) : baseResponse(url);
    await ui.click(button("Üyeler",detail())); await settle();
    assert.match(detail().textContent,/Member fetch failed/);
    respond = async (url) => baseResponse(url);
    await ui.click(button("Üyeleri yeniden yükle",detail())); await settle();
    assert.equal(detail().textContent.includes("Member fetch failed"),false);
    let release;
    respond = async (url) => url.includes("memberQ=old") ? new Promise((resolve) => { release = resolve; }) : baseResponse(url);
    await ui.fill(detail().querySelector('input[placeholder="Üye ara"]'),"old");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve,280)); });
    await ui.fill(detail().querySelector('input[placeholder="Üye ara"]'),"Üye");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve,280)); });
    await act(async () => release(json({ members: [] })));
    assert.ok(detail().querySelector('a[href="/?profile=member-a"]'));
  });

  test("create rejects a same-tick double submit, keeps failed values and replaces the form with its actual created detail", async () => {
    await render(); await ui.click(ui.host.querySelector('[data-action-id="communities.create"]'));
    await ui.fill(create().querySelector("input"), "[SYNTHETIC] New group"); await ui.fill(create().querySelector("textarea"), "[SYNTHETIC] Description for test");
    await ui.click(button("Devam et", create())); await ui.click(button("Devam et", create()));
    let finish;
    respond = async (url, options) => options?.method === "POST" ? new Promise((resolve) => { finish = resolve; }) : baseResponse(url);
    const submit = button("Topluluğu kur", create());
    await act(async () => { submit.click(); submit.click(); });
    assert.equal(calls.filter(({ options }) => options?.method === "POST").length, 1);
    await act(async () => finish(json({ error: "[SYNTHETIC] Temporary error" }, 503)));
    assert.match(create().textContent, /Temporary error/); assert.match(create().textContent, /New group/);
    await ui.click(button("Topluluğu kur", create()));
    await act(async () => finish(json({ community: all[0] }, 201))); await settle(); await settle();
    assert.equal(create(), null); assert.equal(detail().querySelector("h2").textContent, all[0].name);
    await ui.travel("back"); assert.equal(detail(), null); assert.equal(create(), null, "Back cannot resurrect an empty successful create form");
  });

  test("late detail from A cannot replace B, and real member/author links keep the person identity", async () => {
    await render(); let release; const delayed = new Promise((resolve) => { release = resolve; });
    respond = async (url) => url === "/api/communities?id=a" ? delayed : baseResponse(url);
    await ui.click(ui.host.querySelector(`[aria-label='${community("a").name} topluluğunu aç']`));
    await ui.travel("back"); await open("b");
    await act(async () => release(baseResponse("/api/communities?id=a")));
    assert.equal(detail().querySelector("h2").textContent, all[1].name);
    await ui.click(button("Üyeler", detail())); assert.ok(detail().querySelector('a[href="/?profile=member-a"]'));
    await ui.travel("back"); respond = async (url) => baseResponse(url); await open("a");
    assert.ok(detail().querySelector('a[href="/?profile=person-a"]'));
    await ui.click(detail().querySelector('[aria-label="Gönderi seçenekleri"]'));
    await ui.click(button("Şikâyet et", detail()));
    assert.ok(ui.host.querySelector('[role="dialog"][aria-label="Gönderiyi şikâyet et"]'));
    await ui.travel("back"); assert.ok(detail()); assert.equal(ui.host.querySelector('[role="dialog"][aria-label="Gönderiyi şikâyet et"]'), null);
  });

  test("comment and nested report failures stay visible, preserve drafts and can be retried", async () => {
    await render(); await open("a");
    respond = async (url, options) => url.startsWith("/api/comments") ? json({ error: "[SYNTHETIC] Read failed" },503) : options?.method ? json({ error: "[SYNTHETIC] Write failed" },503) : baseResponse(url);
    await ui.click(detail().querySelector('[aria-label^="Yorumları göster"]'));
    assert.ok(button("Yorumları yeniden yükle",detail())); assert.match(detail().textContent,/Read failed/);
    respond = async (url,options) => url.startsWith("/api/comments") ? json({comments:[]}) : options?.method ? json({error:"[SYNTHETIC] Write failed"},503) : baseResponse(url);
    await ui.click(button("Yorumları yeniden yükle",detail()));
    await ui.fill(detail().querySelector('[aria-label="Yorumun"]'),"[SYNTHETIC] Retained comment");
    await ui.click(detail().querySelector('[aria-label="Yorumu gönder"]'));
    assert.equal(detail().querySelector('[aria-label="Yorumun"]').value,"[SYNTHETIC] Retained comment"); assert.match(detail().textContent,/Write failed/);
    await ui.click(detail().querySelector('[aria-label="Gönderi seçenekleri"]'));await ui.click(button("Şikâyet et",detail()));
    const report=ui.host.querySelector('[role="dialog"][aria-label="Gönderiyi şikâyet et"]');
    await ui.fill(report.querySelector("textarea"),"[SYNTHETIC] Report draft");
    await act(async()=>report.dispatchEvent(new ui.window.Event("submit",{bubbles:true,cancelable:true})));
    assert.match(report.textContent,/Write failed/);assert.equal(report.querySelector("textarea").value,"[SYNTHETIC] Report draft");
    await ui.travel("back");assert.ok(detail());
  });
});
