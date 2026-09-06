import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createAssetLinks, createTwaManifest, loadConfig, normalizeOrigin, raiseTargetSdk } from "../scripts/android/config.mjs";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://kampira.example";

function workerHarness() {
  const events = new Map();
  const stores = new Map();
  const requests = [];
  const state = { offline: false, status: 200, claimed: false, redirectedAsset: false };
  class WorkerRequest {
    constructor(url, options = {}) { this.url = new URL(url, origin).href; Object.assign(this, options); }
  }
  const cacheApi = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        async put(key, response) { stores.get(name).set(key, response.clone()); },
        async match(key) { return stores.get(name).get(key)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    URL, Map, Promise, Response, Request: WorkerRequest, caches: cacheApi,
    self: { location: { origin }, addEventListener: (name, callback) => events.set(name, callback), clients: { claim: async () => { state.claimed = true; } } },
    fetch: async (request, options) => {
      requests.push({ url: request.url, credentials: options?.credentials ?? request.credentials, cache: options?.cache ?? request.cache });
      if (state.offline) throw new TypeError("Offline");
      const url = new URL(request.url);
      const contentType = url.pathname.endsWith(".png") ? "image/png" : url.pathname.endsWith(".webmanifest") ? "application/manifest+json" : "text/html";
      const response = new Response(url.pathname === "/offline.html" ? "Public offline fallback" : "Private network content", { status: state.status, headers: { "content-type": contentType } });
      if (state.redirectedAsset) Object.defineProperty(response, "redirected", { value: true });
      return response;
    },
  });
  vm.runInContext(workerSource, context);
  return {
    stores, requests, state,
    async lifecycle(name) { let completion; events.get(name)({ waitUntil: (promise) => { completion = promise; } }); await completion; },
    async request(path, { method = "GET", mode = "navigate" } = {}) {
      let response;
      events.get("fetch")({ request: { url: new URL(path, origin).href, method, mode }, respondWith: (promise) => { response = promise; } });
      return response ? await response : null;
    },
  };
}

test("install manifest uses real PNG dimensions and existing app routes", async () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.name, "Kampira");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  for (const size of ["192x192", "512x512"]) assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  assert.deepEqual(manifest.shortcuts.map((shortcut) => shortcut.url), ["/", "/?view=messages", "/?view=notes", "/?view=pulse"]);
});

test("TWA configuration preserves the hosted SSR origin without inventing trust or push support", async () => {
  const config = await loadConfig({});
  const twa = createTwaManifest(config, manifest);
  assert.equal(twa.host, "web-production-da44f.up.railway.app");
  assert.equal(twa.startUrl, "/?source=app");
  assert.equal(twa.packageId, "app.kampira.mobile");
  assert.equal(twa.enableNotifications, false);
  assert.equal(twa.fallbackType, "customtabs");
  assert.deepEqual(twa.fingerprints, []);
  assert.deepEqual(twa.additionalTrustedOrigins, []);
  assert.equal(config.requiredTargetSdkVersion, 36);
  assert.throws(() => createTwaManifest(config, { ...manifest, start_url: "https://other.example/" }), /configured origin/);
});

test("production origin and certificate validation reject local, injected and placeholder identity data", () => {
  for (const value of ["http://example.com", "https://localhost", "https://127.0.0.1", "https://example.com/path", "https://name:password@example.com", "https://example.com/?x=1"]) {
    assert.throws(() => normalizeOrigin(value));
  }
  assert.equal(normalizeOrigin("https://kampira.example/"), "https://kampira.example");
  assert.throws(() => createAssetLinks("app.kampira.mobile", []), /real Play/);
  assert.throws(() => createAssetLinks("app.kampira.mobile", ["00".repeat(32)]), /Invalid/);
  const fixture = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");
  const links = createAssetLinks("app.kampira.mobile", [fixture, fixture]);
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 1);
  assert.equal(links[0].target.package_name, "app.kampira.mobile");
});

test("SDK preparation upgrades only explicit declarations and rejects unrecognized templates", () => {
  assert.equal(raiseTargetSdk("compileSdkVersion 35\ntargetSdkVersion 35", 36), "compileSdkVersion 36\ntargetSdkVersion 36");
  assert.equal(raiseTargetSdk("compileSdk = 37\ntargetSdk = 37", 36), "compileSdk = 37\ntargetSdk = 37");
  assert.throws(() => raiseTargetSdk("compileSdk = version\ntargetSdk = version", 36), /safely locate/);
});

test("service worker installs only six allowlisted public resources without credentials", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  assert.equal(worker.requests.length, 6);
  assert.ok(worker.requests.every((request) => request.credentials === "omit"));
  const entries = [...worker.stores.values()][0];
  assert.equal(entries.size, 6);
  assert.ok([...entries.keys()].every((key) => key === "/offline.html" || key === "/manifest.webmanifest" || key.startsWith("/app-icons/")));
  worker.state.offline = true;
  assert.equal((await worker.request("/app-icons/kampira-192.png", { mode: "no-cors" })).status, 200);
});

test("service worker never intercepts authenticated API/media or mutation requests", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  worker.state.offline = true;
  for (const route of ["/api/messages", "/api/profile", "/api/files/private", "/_vinext/image?url=/api/files/private", "/uploads/private.png", "/media/private.mp4", "https://other.example/"]) {
    assert.equal(await worker.request(route), null, route);
  }
  assert.equal(await worker.request("/api/posts", { method: "POST", mode: "cors" }), null);
  assert.equal(await worker.request("/?view=messages", { mode: "cors" }), null);
});

test("private navigation stays network-only and generic offline fallback contains no account content", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  for (const route of ["/", "/?view=messages", "/?view=profile", "/admin", "/owner"]) {
    assert.equal(await (await worker.request(route)).text(), "Private network content");
  }
  assert.ok(worker.requests.slice(6).every((request) => request.cache === "no-store"));
  assert.equal([...worker.stores.values()][0].size, 6);
  worker.state.offline = true;
  assert.equal(await (await worker.request("/?view=messages")).text(), "Public offline fallback");
  assert.equal([...worker.stores.values()][0].size, 6);
});

test("server authorization errors are preserved and redirected install resources fail closed", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  worker.state.status = 401;
  assert.equal((await worker.request("/?view=profile")).status, 401);
  const invalid = workerHarness();
  invalid.state.redirectedAsset = true;
  await assert.rejects(invalid.lifecycle("install"), /unavailable/);
});

test("activation removes only old Kampira install caches", async () => {
  const worker = workerHarness();
  await worker.lifecycle("install");
  worker.stores.set("kampira-install-old", new Map());
  worker.stores.set("another-app-cache", new Map());
  await worker.lifecycle("activate");
  assert.equal(worker.stores.has("kampira-install-old"), false);
  assert.equal(worker.stores.has("another-app-cache"), true);
  assert.equal(worker.state.claimed, true);
});
