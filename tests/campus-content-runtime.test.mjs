import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const item = (id) => ({ kind: "listing", item: { id, title: `[SYNTHETIC] ${id}`, description: "Test listing", priceCents: 1200, images: [], ownerId: "owner", ownerName: "Owner", own: false, status: "active", meetupPlace: "Library" } });
async function mount(t, fetch) {
  const dom = await createMobileDom({ view: "market", fetch }); t.after(() => dom.close());
  const { AppNavigationProvider } = dom.load("app/app-navigation.tsx");
  const { CampusContentDetail } = dom.load("app/campus-content-detail.tsx");
  await dom.render(h(AppNavigationProvider, { ownerScope: "viewer:0", onSessionExpired() {}, onBack() {} }, h(CampusContentDetail, { kind: "listing" })));
  const navigate = async (id) => { await act(async () => dom.load("lib/app-links.ts").navigateAppHref(`/?view=market&listing=${id}`)); };
  return { ...dom, navigate };
}

test("listing opens one history entry and Back/Forward restores the target without trapping", async (t) => {
  const dom = await mount(t, async (url) => Response.json({ content: item(new URL(url, "http://localhost").searchParams.get("id")) }));
  const before = dom.window.history.length;
  await dom.navigate("A"); assert.equal(dom.window.history.length, before + 1);
  assert.match(dom.document.querySelector('[role="dialog"]').textContent, /\[SYNTHETIC\] A/);
  await dom.travel("back"); assert.equal(dom.document.querySelector('[role="dialog"]'), null);
  await dom.travel("forward"); assert.match(dom.document.querySelector('[role="dialog"]').textContent, /\[SYNTHETIC\] A/);
});

test("stale A response cannot replace B; failures expose retry and retained target", async (t) => {
  let resolveA, fail = true;
  const dom = await mount(t, async (url) => url.endsWith("=A") ? new Promise((resolve) => { resolveA = resolve; }) : fail ? Response.json({ error: "Target unavailable" }, { status: 503 }) : Response.json({ content: item("B") }));
  await dom.navigate("A"); await dom.navigate("B");
  assert.match(dom.document.querySelector('[role="alert"]').textContent, /Target unavailable/);
  await act(async () => resolveA(Response.json({ content: item("A") })));
  assert.doesNotMatch(dom.host.textContent, /\[SYNTHETIC\] A/);
  fail = false; await dom.click([...dom.document.querySelectorAll('button')].find((node) => node.textContent.includes("Tekrar dene")));
  assert.match(dom.host.textContent, /\[SYNTHETIC\] B/);
  assert.match(dom.window.location.search, /listing=B/);
});
