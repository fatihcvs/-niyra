import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const screenDialog = ".feature-detail, #community-title, #community-target-title";
const note = (id) => ({ id, ownerName: "Örnek öğrenci", courseId: "course-a", courseCode: "MAT 101", courseName: "Matematik", title: `Not ${id}`, description: "Örnek açıklama", noteType: "ders-notu", examYear: null, examTerm: null, examKind: null, tags: [], originalFileName: "note.pdf", contentType: "application/pdf", byteSize: 2048, pageCount: null, status: "published", rejectionReason: null, time: "şimdi", saved: false, saveCount: 0, viewCount: 2, feedback: null, helpfulCount: 0, unhelpfulCount: 0, commentCount: 0, own: true, fileUrl: "/api/notes/file?id=example" });
const community = (id) => ({ id, name: `Topluluk ${id}`, description: "Örnek kampüs topluluğu", category: "akademik", joinPolicy: "open", rules: "", status: "active", creatorName: "Örnek", memberCount: 3, postCount: 0, eventCount: 1, weeklyPostCount: 0, joined: true, canManage: false, role: "member", lastActive: "şimdi", notificationLevel: "all" });
const event = (id) => ({ id, title: `Etkinlik ${id}`, description: "Örnek buluşma", location: "Kütüphane", startsAt: "2025-01-01T12:00:00Z", endsAt: null, capacity: null, status: "cancelled", creatorName: "Örnek", attendeeCount: 0, going: false });

async function setup({ screen = "notes", direct = "", replyTarget } = {}) {
  const calls = [];
  const ui = await createMobileDom({ view: screen, fetch: async (url, init) => {
    calls.push({ url, init }); const target = new URL(url, "http://localhost");
    let data;
    if (target.pathname === "/api/notes" && target.searchParams.has("id")) data = await replyTarget?.(target.searchParams.get("id"), init) ?? { note: note(target.searchParams.get("id")) };
    else if (target.pathname === "/api/note-comments") data = { comments: [] };
    else if (target.pathname === "/api/notes") data = { notes: [] };
    else if (target.pathname === "/api/community-events" && target.searchParams.has("id")) data = await replyTarget?.(target.searchParams.get("id"), init) ?? { communityId: "a", event: event(target.searchParams.get("id")) };
    else if (target.pathname === "/api/communities" && target.searchParams.has("id")) data = { community: community(target.searchParams.get("id")), members: [], bans: [] };
    else if (target.pathname === "/api/communities") data = { communities: [community("a"), community("b")] };
    else if (target.pathname === "/api/community-posts") data = { posts: [] };
    else if (target.pathname === "/api/community-events") data = { events: [] };
    else throw new Error(`Unexpected test route ${url}`);
    return { ok: !data.error, status: data.error ? 404 : 200, json: async () => data };
  } });
  if (direct) ui.window.history.replaceState({ kampiraDepth: 0 }, "", direct);
  const owner = "target-owner";
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope(owner);
  const Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  const Component = ui.load(screen === "notes" ? "app/product-features.tsx" : "app/communities-workspace.tsx")[screen === "notes" ? "NotesWorkspace" : "CommunitiesWorkspace"];
  const links = ui.load("lib/app-links.ts");
  const until = async (predicate) => { for (let index = 0; index < 100 && !predicate(); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); assert.ok(predicate(), ui.host.textContent); };
  const navigate = async (href) => { await act(async () => links.navigateAppHref(href)); };
  await ui.render(h(Provider, { ownerScope: owner, onBack() {}, onSessionExpired() {} }, h(Component, { courses: [] })));
  const button = (label) => [...(ui.host.querySelector(".feature-detail") ?? ui.host).querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent.trim() === label);
  return { ...ui, calls, until, navigate, button };
}

test("twenty note links preserve their exact target with one Back and one Forward, without accumulating history", async () => {
  const ui = await setup();
  try {
    for (let index = 0; index < 20; index++) {
      const id = `target-${index}`;
      await ui.navigate(`/?view=notes&note=${id}`);
      await ui.until(() => ui.host.querySelector("#note-detail-title")?.textContent === `Not ${id}`);
      assert.equal(ui.window.history.state.kampiraDepth, 1);
      await ui.travel("back"); await ui.until(() => !ui.host.querySelector(screenDialog));
      assert.equal(ui.window.location.search, "?view=notes");
      await ui.travel("forward"); await ui.until(() => ui.host.querySelector("#note-detail-title")?.textContent === `Not ${id}`);
      assert.equal(ui.window.history.state.kampiraDepth, 1);
      await ui.travel("back"); await ui.until(() => !ui.host.querySelector(screenDialog));
    }
  } finally { await ui.close(); }
});

test("direct note URL closes in place and a removed target Forward never restores stale detail", async () => {
  let removed = false;
  const ui = await setup({ direct: "/?view=notes&note=a", replyTarget: async (id) => removed ? { error: "Not bulunamadı veya bu nota erişim iznin yok." } : { note: note(id) } });
  try {
    await ui.until(() => ui.host.querySelector("#note-detail-title"));
    assert.equal(ui.window.history.length, 1);
    await ui.click(ui.button("Pencereyi kapat")); await ui.until(() => !ui.host.querySelector(screenDialog));
    assert.equal(ui.window.location.search, "?view=notes"); assert.equal(ui.window.history.length, 1);
    await ui.navigate("/?view=notes&note=a"); await ui.until(() => ui.host.querySelector("#note-detail-title"));
    await ui.travel("back"); removed = true;
    await ui.travel("forward"); await ui.until(() => ui.host.querySelector('[role="alert"]')?.textContent.includes("Not bulunamadı"));
    assert.equal(ui.host.querySelector("#note-detail-title"), null);
    await ui.click(ui.button("Pencereyi kapat")); await ui.until(() => !ui.host.querySelector(screenDialog));
  } finally { await ui.close(); }
});

test("a delayed note A cannot replace B when same-workspace targets change", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ui = await setup({ replyTarget: (id) => id === "a" ? pending : { note: note(id) } });
  try {
    await ui.navigate("/?view=notes&note=a"); await ui.until(() => ui.calls.some((call) => call.url === "/api/notes?id=a"));
    await ui.navigate("/?view=notes&note=b"); await ui.until(() => ui.host.querySelector("#note-detail-title")?.textContent === "Not b");
    await act(async () => release({ note: note("a") }));
    assert.equal(ui.host.querySelector("#note-detail-title").textContent, "Not b");
    assert.equal(ui.window.history.state.kampiraDepth, 2);
    await ui.click(ui.button("Pencereyi kapat"));
    await ui.until(() => ui.host.querySelector("#note-detail-title")?.textContent === "Not a");
    assert.equal(ui.window.location.search, "?view=notes&note=a");
    assert.equal(ui.window.history.state.kampiraDepth, 1);
  } finally { await ui.close(); }
});

test("a community event link resolves its parent, shows a past or cancelled target and returns in one Back", async () => {
  const ui = await setup({ screen: "communities" });
  try {
    await ui.navigate("/?view=communities&communityEvent=old-event");
    await ui.until(() => ui.host.querySelector("#community-title")?.textContent === "Topluluk a" && ui.host.textContent.includes("Etkinlik old-event"));
    assert.equal(ui.window.history.state.kampiraDepth, 1);
    assert.ok(ui.calls.some((call) => call.url === "/api/community-events?id=old-event"));
    await ui.travel("back"); await ui.until(() => !ui.host.querySelector(screenDialog));
    await ui.travel("forward"); await ui.until(() => ui.host.textContent.includes("Etkinlik old-event"));
    assert.equal(ui.window.history.state.kampiraDepth, 1);
  } finally { await ui.close(); }
});

test("same-workspace community A/B targets and inaccessible event links do not show another cached community", async () => {
  const ui = await setup({ screen: "communities", replyTarget: () => ({ error: "Etkinlik bulunamadı veya erişim iznin yok." }) });
  try {
    for (const id of ["a", "b"]) {
      await ui.navigate(`/?view=communities&community=${id}`); await ui.until(() => ui.host.querySelector("#community-title")?.textContent === `Topluluk ${id}`);
    }
    await ui.navigate("/?view=communities&communityEvent=hidden");
    await ui.until(() => ui.host.querySelector('[role="dialog"] [role="alert"]')?.textContent.includes("Etkinlik bulunamadı"));
    assert.equal(ui.host.querySelector("#community-title"), null);
    assert.equal(ui.window.history.state.kampiraDepth, 3);
  } finally { await ui.close(); }
});

test("real profile note and community rows expose app target links instead of a file or generic directory", async () => {
  const ui = await createMobileDom({ view: "profile", fetch: async (url) => {
    const tab = new URL(url, "http://localhost").searchParams.get("tab");
    return { ok: true, status: 200, json: async () => ({ posts: [], notes: tab === "notes" ? [note("profile-note")] : [], communities: tab === "communities" ? [community("profile-group")] : [], nextCursor: null }) };
  } });
  try {
    const cache = ui.load("lib/profile-content-state.ts"); cache.setProfileContentOwnerScope("profile-owner");
    const Component = ui.load("app/profile-content.tsx").ProfileContent;
    await ui.render(h(Component, { ownerScope: "profile-owner", userId: "profile-user", own: true, about: "About", renderPost: () => null }));
    await act(async () => cache.profileContentState.chooseTab("profile-owner", "profile-user", "notes"));
    const noteLink = ui.host.querySelector('.profile-note-list a'); assert.ok(noteLink); assert.equal(noteLink.getAttribute("href"), "/?view=notes&note=profile-note"); assert.equal(noteLink.target, "");
    await act(async () => cache.profileContentState.chooseTab("profile-owner", "profile-user", "communities"));
    const groupLink = ui.host.querySelector('.profile-community-list a'); assert.ok(groupLink); assert.equal(groupLink.getAttribute("href"), "/?view=communities&community=profile-group");
  } finally { await ui.close(); }
});
