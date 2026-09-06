import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";
import { IDBFactory } from "../scripts/mobile-quality/node_modules/fake-indexeddb/build/esm/index.js";

test.describe("Campus tool layers and drafts", () => {
const area = { id: "area-a", name: "Sentetik Kütüphane", floorLabel: "1", zoneLabel: "Salon", description: "Yalnız test alanı", capacity: null, features: ["quiet"], placeId: null, placeName: null, latitude: null, longitude: null, coordinatesKnown: false, activeCount: 0, recentSignalCount: 0, hasRecentSignal: false, estimatedFreeSeats: null, occupancyPercent: null, lastSignalTime: null, viewerCheckin: null, own: false, updatedTime: "şimdi" };
const listing = (id) => ({ id, title: `Sentetik ilan ${id}`, ownerId: `owner-${id}`, ownerName: `Örnek ${id}`, own: false, kind: "sell", category: "books", description: "Yalnız test için ilan açıklaması", priceCents: 10000, condition: "used-good", meetupPlace: "Kampüs", status: "active", images: [], inquiryCount: 0, time: "şimdi", updatedTime: "şimdi" });
const match = (id) => ({ publicId: id, displayName: `Örnek ${id}`, handle: `test-${id}`, facultyShortName: "TEST", departmentName: "Test Bölümü", classYear: 1, interests: ["books", "music"], intents: ["coffee"], sharedInterests: ["books"], sharedIntents: ["coffee"], availability: "today", bio: "Sentetik eşleşme", score: 70, reasons: ["Ortak ilgi"] });
const pulse = { id: "pulse-a", kind: "live", category: "general", content: "Sentetik kampüs bilgisi", campusZone: "", imageUrl: null, anonymous: false, authorName: "Örnek Öğrenci", authorId: "other", own: false, expiresAt: null, time: "şimdi", supportCount: 0, confirmCount: 0, outdatedCount: 0, viewerReaction: null };
let ui;
let requests;
let mutation;
let payloads;
let Provider;
let ownerScope;
const dialog = () => ui.host.querySelector("[role='dialog']");
const field = (name) => dialog().querySelector(`[name='${name}']`);
const button = (text, scope = ui.host) => [...scope.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === text || item.textContent.trim() === text);
const navTab = (selector, label) => [...ui.host.querySelectorAll(`${selector} button`)].find((item) => item.querySelector("strong")?.textContent === label);
async function settleMarket() { if (!ui.host.querySelector('[aria-label="Pazar taslak durumu"]')) return; for(let index=0;index<200;index++){await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,3));});if(!["loading","saving"].includes(ui.host.querySelector('[aria-label="Pazar taslak durumu"]')?.dataset.state)&&!dialog()?.querySelector('button[type="submit"]')?.textContent.includes("Kaydediliyor"))return;}assert.fail("Market storage did not settle"); }
async function mount(file, name, props = {}) { const Component = ui.load(`app/${file}.tsx`)[name]; await ui.render(h(Provider, { ownerScope, onBack() {}, onSessionExpired() {} }, h(Component, { universityShortName: "TEST", ownerId: ownerScope, ...props }))); await settleMarket(); }
async function submit() { await act(async () => dialog().querySelector("form").dispatchEvent(new ui.window.Event("submit", { bubbles: true, cancelable: true }))); await settleMarket(); }

test.beforeEach(async () => {
  requests = [];
  ownerScope = "tool-owner";
  mutation = async () => Response.json({ error: "Sentetik istek hatası" }, { status: 400 });
  payloads = {
    "/api/library-occupancy": { areas: [area], places: [], viewerActiveAreaId: null },
    "/api/campus-market": { listings: [listing("a"), listing("b")], prices: [], inquiries: [], places: [] },
    "/api/social-match": { profile: { interests: ["music", "books"], intents: ["coffee"], bio: "Sunucudaki tanıtım", availability: "week", discoverable: true, configured: true }, matches: [match("a"), match("b")], requests: [] },
    "/api/campus-pulse": { items: [pulse], topics: [] },
    "/api/posts": { posts: [], nextCursor: null },
  };
  ui = await createMobileDom({ fetch: async (url, options) => { requests.push({ url, options }); if (options?.method && options.method !== "GET") return mutation(url, options); const path = new URL(url, "http://localhost").pathname; assert.ok(payloads[path], `Unexpected API ${url}`); return { ok: true, json: async () => payloads[path] }; } });
  Object.defineProperty(ui.window,"indexedDB",{value:new IDBFactory(),configurable:true});
  const BrowserFormData=ui.window.FormData;ui.window.File=File;
  ui.window.FormData=class extends BrowserFormData{
    durableFiles=new Map();
    append(name,value,filename){if(value instanceof File){const files=this.durableFiles.get(name)??[];files.push(value);this.durableFiles.set(name,files);}else if(filename!==undefined)super.append(name,value,filename);else super.append(name,value);}
    get(name){return this.durableFiles.has(name)?this.durableFiles.get(name)[0]:super.get(name);}
    getAll(name){return this.durableFiles.has(name)?this.durableFiles.get(name):super.getAll(name);}
  };
  Provider = ui.load("app/app-navigation.tsx").AppNavigationProvider;
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("tool-owner");
});
test.afterEach(async () => { await ui.close(); });

test("library creation retains controlled fields/features on Back and exposes a failed submission inside the layer", async () => {
  await mount("library-occupancy", "LibraryOccupancyWorkspace");
  assert.match(ui.host.textContent, /Doluluk bilinmiyor/);
  await ui.click(ui.host.querySelector("[data-action-id='library.create']"));
  await ui.fill(field("name"), "Taslak çalışma alanı");
  await ui.fill(field("zoneLabel"), "A salonu");
  await ui.fill(field("description"), "Sadece deneme açıklaması.");
  await ui.click(button("Wi-Fi", dialog()));
  await ui.travel("back");
  assert.equal(dialog(), null);
  await ui.click(ui.host.querySelector("[data-action-id='library.create']"));
  assert.equal(field("name").value, "Taslak çalışma alanı");
  assert.equal(button("Wi-Fi", dialog()).getAttribute("aria-pressed"), "true");
  await submit();
  assert.match(dialog().querySelector("[role='alert']").textContent, /Sentetik istek hatası/);
  assert.equal(field("capacity").value, "", "An unknown capacity stays unknown");
});

test("library Back/Forward never starts check-in; only the explicit action sends the selected duration", async () => {
  await mount("library-occupancy", "LibraryOccupancyWorkspace");
  await ui.click(button("Buradayım"));
  await ui.click(button("2 saat", dialog()));
  await ui.travel("back");
  for(let index=0;index<100&&dialog();index++)await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,5));});
  assert.ok(!dialog(), "Back must finish closing the layer before Forward starts");
  assert.equal(requests.filter(({ options }) => options?.method).length, 0);
  await ui.travel("forward");
  for(let index=0;index<100&&ui.window.history.state?.kampiraLayer?.id!=="library.checkin";index++)await act(async()=>{await new Promise((resolve)=>setTimeout(resolve,5));});
  assert.equal(ui.window.history.state.kampiraLayer.id, "library.checkin");
  assert.ok(button("2 saat", dialog()).classList.contains("active"));
  await ui.click(button("Check-in başlat", dialog()));
  const body = JSON.parse(requests.find(({ options }) => options?.method === "POST").options.body);
  assert.equal(body.areaId, "area-a");
  assert.equal(body.durationMinutes, 120);
});

test("pulse live/confession drafts are separate and Back preserves the chosen category and text", async () => {
  await mount("campus-pulse", "CampusPulseWorkspace");
  await ui.click(ui.host.querySelector("[data-action-id='pulse.create']"));
  await ui.fill(field("content"), "Canlı paylaşım için ayrı taslak.");
  await ui.fill(field("category"), "transport");
  await ui.travel("back");
  await ui.click(navTab(".pulse-tabs", "Anonim dertleşme"));
  await ui.click(ui.host.querySelector("[data-action-id='pulse.create']"));
  assert.equal(field("content").value, "");
  await ui.fill(field("content"), "Anonim paylaşım taslağı.");
  await ui.travel("back");
  await ui.click(navTab(".pulse-tabs", "Kampüs Anlık"));
  await ui.click(ui.host.querySelector("[data-action-id='pulse.create']"));
  assert.equal(field("content").value, "Canlı paylaşım için ayrı taslak.");
  assert.equal(field("category").value, "transport");
  assert.equal(requests.filter(({ options }) => options?.method).length, 0);
});

test("pulse reporting joins the common layer and retains retry details without reporting on Back", async () => {
  await mount("campus-pulse", "CampusPulseWorkspace");
  await ui.click(button("Şikâyet"));
  await ui.fill(field("details"), "Sentetik rapor taslağı");
  await ui.travel("back");
  await ui.click(button("Şikâyet"));
  assert.equal(field("details").value, "Sentetik rapor taslağı");
  assert.equal(ui.window.history.state.kampiraLayer.id, "pulse.report");
  await submit();
  assert.match(dialog().querySelector("[role='status']").textContent, /Sentetik istek hatası/);
});

test("market switches the real create action by tab and preserves separate listing/price drafts", async () => {
  await mount("campus-market", "CampusMarketWorkspace");
  await ui.click(ui.host.querySelector("[data-action-id='market.create']"));
  await ui.fill(field("title"), "Sentetik ilan taslağı");
  await ui.fill(field("description"), "Satılık ürünün yerel taslağı.");
  await ui.travel("back");
  await ui.click(navTab(".market-tabs", "Fiyatlar"));
  assert.equal(ui.host.querySelector("[data-action-id='market.create']").getAttribute("aria-label"), "Fiyat ekle");
  await ui.click(ui.host.querySelector("[data-action-id='market.create']"));
  await ui.fill(field("itemName"), "Öğrenci menüsü");
  await ui.travel("back");
  await ui.click(navTab(".market-tabs", "İlanlar"));
  await ui.click(ui.host.querySelector("[data-action-id='market.create']"));
  assert.equal(field("title").value, "Sentetik ilan taslağı");
  await submit();
  assert.match(dialog().querySelector("[role='alert']").textContent, /Sentetik istek hatası/);
  await ui.travel("back");
  await ui.click(navTab(".market-tabs", "Mesajlar"));
  assert.equal(ui.host.querySelector("[data-action-id='market.create']"), null);
});

test("market inquiry drafts are scoped to the listing and Back does not send a message", async () => {
  await mount("campus-market", "CampusMarketWorkspace");
  const contacts = () => [...ui.host.querySelectorAll(".listing-card footer button")];
  await ui.click(contacts()[0]);
  await ui.fill(field("message"), "A ilanı için yerel soru");
  await ui.travel("back");
  await ui.click(contacts()[1]);
  assert.equal(field("message").value, "");
  await ui.travel("back");
  await ui.click(contacts()[0]);
  assert.equal(field("message").value, "A ilanı için yerel soru");
  assert.equal(requests.filter(({ options }) => options?.method).length, 0);
});

test("match preference edits survive workspace remount and server hydration does not replace the unsaved draft", async () => {
  await mount("social-match", "SocialMatchWorkspace");
  await ui.click(ui.host.querySelector("[data-action-id='match.preferences']"));
  await ui.fill(ui.host.querySelector(".social-settings textarea"), "Kaydedilmemiş kişisel tercih taslağı");
  await ui.render(null);
  await mount("social-match", "SocialMatchWorkspace");
  assert.equal(ui.host.querySelector(".social-settings textarea").value, "Kaydedilmemiş kişisel tercih taslağı");
  assert.equal(requests.filter(({ options }) => options?.method).length, 0);
});

test("match request drafts stay with each target and a failed action exposes retry details inside the dialog", async () => {
  await mount("social-match", "SocialMatchWorkspace");
  const invites = () => [...ui.host.querySelectorAll(".social-match-card footer button")];
  await ui.click(invites()[0]);
  await ui.fill(field("message"), "Birinci kişi için sentetik davet");
  await ui.travel("back");
  await ui.click(invites()[1]);
  assert.equal(field("message").value, "");
  await ui.travel("back");
  await ui.click(invites()[0]);
  assert.equal(field("message").value, "Birinci kişi için sentetik davet");
  await submit();
  assert.match(dialog().querySelector("[role='alert']").textContent, /Sentetik istek hatası/);
  assert.equal(ui.window.history.state.kampiraLayer.id, "match.request");
});

test("saved queries and media filters survive remount and are cleared on account change", async () => {
  const props = { renderPost: () => null, onNavigate() {} };
  await mount("saved-workspace", "SavedWorkspace", props);
  await ui.fill(ui.host.querySelector(".workspace-search input"), "Sentetik arama");
  await ui.fill(ui.host.querySelector("select"), "image");
  await ui.render(null);
  await mount("saved-workspace", "SavedWorkspace", props);
  assert.equal(ui.host.querySelector(".workspace-search input").value, "Sentetik arama");
  assert.equal(ui.host.querySelector("select").value, "image");
  await ui.render(null);
  ui.load("lib/workspace-state.ts").setWorkspaceStateOwnerScope("new-owner");
  ownerScope = "new-owner";
  await mount("saved-workspace", "SavedWorkspace", props);
  assert.equal(ui.host.querySelector(".workspace-search input").value, "");
  assert.equal(requests.filter(({ options }) => options?.method).length, 0);
});

test("market submits cached photos after Back even when the reopened native file picker is empty", async () => {
  await mount("campus-market", "CampusMarketWorkspace");
  await ui.click(ui.host.querySelector("[data-action-id='market.create']"));
  await ui.fill(field("title"), "Fotoğraflı sentetik ilan");
  await ui.fill(field("description"), "Sentetik ürün açıklaması.");
  const photo = new ui.window.File(["synthetic-image-bytes"], "test-photo.png", { type: "image/png" });
  const picker = field("images");
  Object.defineProperty(picker, "files", { configurable: true, value: [photo] });
  await act(async () => picker.dispatchEvent(new ui.window.Event("change", { bubbles: true })));
  await ui.travel("back");
  await ui.click(ui.host.querySelector("[data-action-id='market.create']"));
  assert.equal(field("images").files.length, 0);
  assert.match(dialog().textContent, /1 fotoğraf seçili/);
  mutation = async (url) => ({ ok: true, json: async () => url === "/api/campus-market" ? { listing: { id: "created-fixture" } } : { uploaded: true } });
  await submit();
  const upload = requests.find(({ url }) => url === "/api/campus-market/images");
  assert.equal(upload.options.body.get("listingId"), "created-fixture");
  assert.equal(upload.options.body.get("images").name, "test-photo.png");
});

});
