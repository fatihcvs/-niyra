import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This harness is deliberately restricted to the isolated local worker. It does
// not inject cookies, fabricate API responses, read browser storage, or access provider keys.
// Explicitly recorded faults drop real committed market responses before manual UI retries.
const base = "http://127.0.0.1:5180";
const phase = process.argv.includes("--final") ? "final" : "rehearsal";
const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7).split(",").map((value) => value.trim()).filter(Boolean) ?? null;
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/fatih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = fileURLToPath(new URL("../../", import.meta.url));
const stamp = `${Date.now()}`;
const output = path.join(root, "exports/isolated-mobile-qa/browser", `${phase}-${stamp}`);
await mkdir(output, { recursive: true });
const credentials = [];
const results = { phase, isolatedOrigin: base, startedAt: new Date().toISOString(), normalAuth: true, mockedTransport: false, reducedMotionForLayout: true, cases: [], screens: [], consoleErrors: [], pageErrors: [], failedRequests: [], injectedNetworkFailures: [], networkFaultInjection: [], assetFailures: [], fontResponses: [] };
const injectedRequests = new WeakSet();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const clean = (text) => credentials.reduce((value, credential) => value.replaceAll(credential.email, "[synthetic-account]").replaceAll(credential.password, "[redacted]"), String(text)).replace(/(^|\n)(\s*(?:-\s*)?(?:authorization|cookie|set-cookie|x-api-key)\s*:)\s*[^\r\n]*/gi, "$1$2 [redacted]");
function watchPage(browserPage) {
  browserPage.setDefaultTimeout(15000);
  browserPage.on("console", (message) => { if (message.type() === "error") results.consoleErrors.push({ text: clean(message.text()), location: { url: new URL(message.location().url || base, base).pathname, lineNumber: message.location().lineNumber } }); });
  browserPage.on("pageerror", (error) => results.pageErrors.push(clean(error.message)));
  browserPage.on("requestfailed", (request) => { const failure = { path: new URL(request.url()).pathname, error: request.failure()?.errorText }; if (injectedRequests.has(request)) results.injectedNetworkFailures.push(failure); else if (!request.failure()?.errorText.includes("ERR_ABORTED")) results.failedRequests.push(failure); });
  browserPage.on("response", (response) => { const pathname = new URL(response.url()).pathname; if (/\.(?:woff2?|ttf)$/.test(pathname)) results.fontResponses.push({ path: pathname, status: response.status() }); if (response.status() >= 400 && /\.(?:woff2?|ttf|css|js|png|jpg|webp|svg)$/.test(pathname) && !pathname.startsWith("/api/")) results.assetFailures.push({ path: pathname, status: response.status() }); });
}
watchPage(page);

async function run(name, action) {
  if (only && !only.some((value) => name.includes(value)) && name !== "isolated worker health" && name !== "normal registration, onboarding and browser UI login") return;
  try { const evidence = await action(); results.cases.push({ name, pass: true, ...(evidence ? { evidence } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { results.cases.push({ name, pass: false, error: clean(error.message).slice(0, 1400) }); console.log(`FAIL ${name}: ${clean(error.message).split("\n")[0]}`); }
}
async function api(request, route, method = "GET", data) {
  const response = await request.fetch(`${base}${route}`, { method, headers: { origin: base }, ...(data === undefined ? {} : { data }) });
  const body = await response.json();
  assert.ok(response.ok(), `${method} ${route} HTTP ${response.status()}: ${body.error ?? "Unexpected response"}`);
  return body;
}
async function account(otherCampus = false) {
  const credential = { email: `qa.${randomUUID()}@example.invalid`, password: `QA!${randomUUID()}Pass`, name: otherCampus ? "Sentetik Farklı Kampüs" : "Sentetik Kampira Kontrol" };
  credentials.push(credential);
  const temporary = await browser.newContext();
  try {
    await api(temporary.request, "/api/auth/register", "POST", { email: credential.email, password: credential.password, displayName: credential.name });
    const profile = await api(temporary.request, "/api/profile", "PUT", otherCampus ? { universityId: "tr-bogazici-universitesi", facultyName: "Mühendislik Fakültesi", departmentName: "Bilgisayar Mühendisliği", classYear: 2, customCourses: [{ code: "QA101", name: "Sentetik Temel Ders" }, { code: "QA102", name: "Sentetik İkinci Ders" }, { code: "QA103", name: "Sentetik Üçüncü Ders" }] } : { universityId: "omu", facultyId: "muhendislik", departmentId: "bilgisayar", classYear: 3, courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"] });
    credential.profile = profile.profile;
    await api(temporary.request, "/api/auth/session", "DELETE");
    return credential;
  } finally { await temporary.close(); }
}
async function login(credential, browserPage = page) {
  await browserPage.goto(base, { waitUntil: "domcontentloaded" });
  await browserPage.getByRole("tab", { name: "Giriş yap", exact: true }).click();
  await browserPage.locator('input[name="email"]').fill(credential.email);
  await browserPage.locator('input[name="password"]').fill(credential.password);
  const response = browserPage.waitForResponse((response) => response.url() === `${base}/api/auth/session` && response.request().method() === "POST");
  await browserPage.locator('.auth-submit').click();
  assert.equal((await response).status(), 200);
  await browserPage.locator(".auth-shell").waitFor({ state: "hidden" });
  await browserPage.locator(".app-mobile-nav").waitFor({ state: "attached" });
}
async function loginIsolatedStaff(browserPage) {
  assert.equal(new URL(base).origin, "http://127.0.0.1:5180", "Staff fixtures are restricted to the isolated worker");
  // This deterministic fixture password is exclusively for the isolated, local
  // synthetic DB; it is neither a production credential nor a password reset.
  const fixturePassword = `QA!${createHash("sha256").update("kampira-isolated-staff-fixture-v1").digest("hex").slice(0, 24)}aB`;
  const bootstrapPassword = "admin123";
  credentials.push({ email: "[isolated-staff-fixture]", password: fixturePassword }, { email: "[isolated-staff-bootstrap]", password: bootstrapPassword });
  await browserPage.goto(`${base}/owner`, { waitUntil: "domcontentloaded" });
  const submit = async (password) => {
    await browserPage.getByLabel("Kullanıcı adı", { exact: true }).fill("admin");
    await browserPage.getByLabel("Parola", { exact: true }).fill(password);
    const result = browserPage.waitForResponse((response) => response.url() === `${base}/api/staff/session` && response.request().method() === "POST");
    await browserPage.getByRole("button", { name: /^Güvenli giriş yap/ }).click();
    return result;
  };
  let response = await submit(fixturePassword);
  if (response.status() === 401) response = await submit(bootstrapPassword);
  assert.equal(response.status(), 200, "Isolated staff login unavailable; an unknown existing credential is never replaced");
  const identity = (await response.json()).staff;
  assert.equal(identity.role, "owner");
  if (identity.mustChangePassword) {
    await browserPage.getByRole("heading", { name: "Başlangıç parolanı değiştir", exact: true }).waitFor();
    await browserPage.getByLabel("Mevcut parola", { exact: true }).fill(bootstrapPassword);
    await browserPage.getByLabel("Yeni parola", { exact: true }).fill(fixturePassword);
    await browserPage.getByLabel("Yeni parolayı doğrula", { exact: true }).fill(fixturePassword);
    const changed = browserPage.waitForResponse((result) => result.url() === `${base}/api/staff/password` && result.request().method() === "POST");
    await browserPage.getByRole("button", { name: /^Parolayı değiştir ve devam et/ }).click();
    assert.equal((await changed).status(), 200);
  }
  const queue = browserPage.getByRole("button", { name: /Hesap silme talepleri/ });
  const mobileMenu = browserPage.getByRole("button", { name: "Yönetim menüsünü aç veya kapat", exact: true });
  await mobileMenu.waitFor();
  if (await mobileMenu.getAttribute("aria-expanded") !== "true") await mobileMenu.click();
  await queue.waitFor();
  return { role: "owner", normalUiLogin: true };
}
async function ready(route, browserPage = page) {
  await browserPage.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await browserPage.locator(".app-mobile-nav").waitFor({ state: "attached" });
  await browserPage.waitForLoadState("networkidle", { timeout: 30000 });
  await browserPage.evaluate(() => document.fonts.ready);
  await browserPage.waitForTimeout(150);
}
async function screenshot(name, browserPage = page) {
  const mask = [browserPage.locator('input[name="email"], input[name="password"], input[name="passwordConfirmation"]')];
  for (const credential of credentials) { mask.push(browserPage.getByText(credential.email, { exact: false })); if (credential.profile?.handle) mask.push(browserPage.getByText(`@${credential.profile.handle}`, { exact: false })); }
  await browserPage.screenshot({ path: path.join(output, name), fullPage: false, mask });
}
async function marketDraftSaved(browserPage = page) {
  await browserPage.locator('[aria-label="Pazar taslak durumu"][data-state="saved"]').first().waitFor();
}
async function marketFormGeometry(dialog) {
  return dialog.evaluate((element) => {
    const measure = (selector) => {
      const rect = element.querySelector(selector)?.getBoundingClientRect();
      return rect ? { top: rect.top, height: rect.height, width: rect.width } : null;
    };
    return { viewportWidth: innerWidth, status: measure('[aria-label="Pazar taslak durumu"]'), photos: measure(".market-image-field"), title: measure('[name="title"]'), horizontalOverflow: element.scrollWidth > element.clientWidth + 1 };
  });
}
async function openMarketCreate(kind = "listing", browserPage = page) {
  await browserPage.getByRole("navigation", { name: "Kampüs pazarı bölümleri" }).getByRole("button", { name: kind === "price" ? /^Fiyatlar/ : /^İlanlar/ }).click();
  await browserPage.getByRole("button", { name: kind === "price" ? "Fiyat ekle" : "İlan ver", exact: true }).first().click();
  const dialog = browserPage.getByRole("dialog", { name: kind === "price" ? "Kampüs fiyatı ekle" : "İlan ver", exact: true });
  await dialog.waitFor();
  return dialog;
}
async function uiLogout(browserPage = page) {
  await ready("/?view=settings", browserPage);
  const response = browserPage.waitForResponse((response) => response.url() === `${base}/api/auth/session` && response.request().method() === "DELETE");
  await browserPage.getByRole("button", { name: "Çıkış yap", exact: true }).click();
  assert.equal((await response).status(), 200);
  await browserPage.locator(".auth-shell").waitFor();
}
async function inspectScreen(view, width, suffix = "") {
  await page.setViewportSize({ width, height: width >= 800 ? 1000 : 844 });
  await ready(view === "feed" ? "/" : `/?view=${view}`);
  const geometry = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflow = [...document.querySelectorAll("body *")].filter((element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return rect.width && rect.height && style.visibility !== "hidden" && style.display !== "none" && !element.closest('[hidden], [aria-hidden="true"]') && (rect.right > width + 2 || rect.left < -2) && !element.closest('[class*="rail"], [class*="Rail"], [class*="carousel"]');
    }).slice(0, 8).map((element) => ({ tag: element.tagName, className: String(element.className).slice(0, 180), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) }));
    return { width, theme: document.documentElement.dataset.theme, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, heading: document.querySelector("main h1, main h2, .workspace-view h1, h1")?.textContent?.trim().slice(0, 100), overflow };
  });
  results.screens.push({ view, width, ...geometry });
  await screenshot(`${view}-${width}${suffix}.png`);
  assert.ok(geometry.scrollWidth <= width + 1, `${view} at ${width}px overflows to ${geometry.scrollWidth}px`);
  assert.equal(await page.locator(".auth-shell").count(), 0, "Authenticated screen unexpectedly returned to auth");
  return geometry;
}

function syntheticPdf() {
  const stream = "BT /F1 16 Tf 36 100 Td (Synthetic isolated Kampira QA document) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let source = "%PDF-1.4\n"; const offsets = [0];
  for (let index = 0; index < objects.length; index++) { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

function syntheticPng(color) {
  const chunk = (type, data) => {
    const label = Buffer.from(type); let crc = 0xffffffff;
    for (const value of Buffer.concat([label, data])) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, label, data, checksum]);
  };
  const width = 64, height = 48, header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) pixels[y * (1 + width * 3) + 1 + x * 3 + channel] = color[channel];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

async function marketPhotoRequest(request) {
  // Read only the application payload and operation header, never authentication
  // cookies or browser storage. Multipart boundaries can change after restart.
  const body = request.postDataBuffer();
  const contentType = request.headers()["content-type"];
  assert.ok(body && contentType, "Photo request must carry multipart bytes");
  const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  const images = await Promise.all(form.getAll("images").map(async (file) => ({
    name: file.name, type: file.type, size: file.size,
    sha256: createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"),
  })));
  return { key: request.headers()["idempotency-key"], listingId: form.get("listingId"), images, body, contentType };
}

let owner, peer, outsider, publishedPost;
try {
  await run("isolated worker health", async () => { const response = await context.request.get(`${base}/api/health`); assert.equal(response.status(), 200); return { status: response.status() }; });
  await run("normal registration, onboarding and browser UI login", async () => {
    owner = await account(); await login(owner);
    const manifestLinks = page.locator('link[rel="manifest"]');
    assert.equal(await manifestLinks.count(), 1, "The document must have exactly one app manifest");
    const manifestUrl = new URL(await manifestLinks.getAttribute("href"), page.url());
    assert.equal(manifestUrl.origin, base, "The app manifest must resolve on the isolated app origin");
    const manifest = await context.request.get(manifestUrl.href);
    assert.equal(manifest.status(), 200, "The actual same-origin manifest must load");
    return { uiLogin: true, profileCourses: owner.profile.courses.length, manifestCount: 1, manifestSameOrigin: true, manifestStatus: manifest.status() };
  });
  if (!owner || await page.locator(".auth-shell").count()) throw new Error("Authenticated browser setup failed; remaining checks were not run.");
  await run("avatar-only profile preserves photo upload and removal without a cover on mobile and desktop", async () => {
    const viewer = await account();
    const viewerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const viewerPage = await viewerContext.newPage(); watchPage(viewerPage);
    const layouts = [], screenshots = [], writes = [];
    const photo = syntheticPng([117, 78, 241]);
    const photoHash = createHash("sha256").update(photo).digest("hex");
    const publicRoute = `/?profile=${encodeURIComponent(owner.profile.publicId)}`;
    const watchWrite = request => {
      if (new URL(request.url()).pathname !== "/api/profile/media" || request.method() === "GET") return;
      writes.push({ method: request.method() });
    };
    const noCover = async browserPage => {
      assert.equal(await browserPage.locator(".profile-cover, .profile-banner-thumb").count(), 0, "Profile cover elements must be removed, including hidden placeholders");
      assert.equal(await browserPage.getByRole("button", { name: /Kapak seç|Kapak görseli|Kapak fotoğrafı/ }).count(), 0, "The editor must not offer a cover control");
    };
    const editor = async () => {
      await page.locator(".profile-own-actions").getByRole("button", { name: "Profili düzenle", exact: true }).click();
      await page.locator(".profile-editor-page").waitFor();
      await noCover(page);
      assert.equal(await page.locator('.profile-media-controls input[type="file"]').count(), 1, "Only the avatar picker remains");
      return page.locator(".profile-media-controls");
    };
    const save = async method => {
      const mediaResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile/media" && response.request().method() === method);
      const profileResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/profile" && response.request().method() === "PUT");
      await page.locator(".profile-editor-topbar").getByRole("button", { name: "Kaydet", exact: true }).click();
      assert.equal((await profileResponse).status(), 200);
      assert.equal((await mediaResponse).status(), method === "POST" ? 201 : 200);
      await page.locator(".profile-editor-page").waitFor({ state: "hidden" });
      await page.locator(".profile-hero").waitFor();
    };
    const geometry = async (browserPage, state, width, uploaded = true) => {
      await noCover(browserPage);
      const selector = state === "editor" ? ".profile-media-controls > section" : ".profile-hero";
      const section = browserPage.locator(selector).first();
      await section.waitFor(); await section.scrollIntoViewIfNeeded();
      if (uploaded) await section.locator(".avatar img").evaluate(image => image.decode());
      const dimensions = await section.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const avatar = element.querySelector(".avatar");
        const circle = avatar?.getBoundingClientRect();
        const image = avatar?.querySelector("img");
        const pixels = image?.getBoundingClientRect();
        const center = circle ? document.elementFromPoint(circle.left + circle.width / 2, circle.top + circle.height / 2) : null;
        return { width: innerWidth, section: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, avatar: circle ? { left: circle.left, right: circle.right, top: circle.top, bottom: circle.bottom, width: circle.width, height: circle.height } : null, image: pixels ? { left: pixels.left, right: pixels.right, top: pixels.top, bottom: pixels.bottom, width: pixels.width, height: pixels.height } : null, avatarOffsetTop: circle ? circle.top - rect.top : null, imageLoaded: Boolean(image?.complete && image.naturalWidth > 0), avatarUnobstructed: Boolean(avatar && center && avatar.contains(center)), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1 };
      });
      const file = `avatar-only-${state}-${width}.png`; await screenshot(file, browserPage); screenshots.push(file);
      layouts.push({ state, ...dimensions }); results.screens.push({ view: `avatar-only-${state}`, ...dimensions });
      assert.ok(dimensions.avatar, `${state} avatar exists`);
      assert.equal(dimensions.horizontalOverflow, false, `${state} at ${width}px must not overflow`);
      assert.equal(dimensions.avatarUnobstructed, true, `${state} avatar must not be covered`);
      assert.ok(dimensions.avatar.left >= Math.max(0, dimensions.section.left) - 1 && dimensions.avatar.right <= Math.min(width, dimensions.section.right) + 1, `${state} avatar fits horizontally`);
      assert.ok(dimensions.avatar.top >= dimensions.section.top - 1 && dimensions.avatar.bottom <= dimensions.section.bottom + 1, `${state} avatar fits inside its section`);
      assert.ok(dimensions.avatarOffsetTop >= -1 && dimensions.avatarOffsetTop <= 64, `${state} leaves no obsolete cover gap above the avatar`);
      assert.equal(dimensions.imageLoaded, uploaded, `${state} image state matches saved avatar`);
      if (uploaded) {
        assert.ok(dimensions.image.left >= dimensions.avatar.left - 1 && dimensions.image.right <= dimensions.avatar.right + 1 && dimensions.image.top >= dimensions.avatar.top - 1 && dimensions.image.bottom <= dimensions.avatar.bottom + 1, `${state} actual image must fit inside the avatar rather than fill its ancestor`);
      }
      if (state === "editor" && width >= 800) {
        const preview = browserPage.locator(".profile-editor-identity > .avatar");
        const fits = await preview.evaluate(element => {
          const rect = element.getBoundingClientRect(), image = element.querySelector("img")?.getBoundingClientRect();
          return Boolean(image && image.left >= rect.left - 1 && image.right <= rect.right + 1 && image.top >= rect.top - 1 && image.bottom <= rect.bottom + 1);
        });
        assert.equal(fits, true, "Desktop editor preview image remains inside its avatar");
      }
    };
    page.on("request", watchWrite);
    try {
      await login(viewer, viewerPage);
      await ready("/?view=profile"); await noCover(page);
      const mediaControls = await editor();
      const chooser = page.waitForEvent("filechooser");
      await mediaControls.getByRole("button", { name: "Fotoğraf seç", exact: true }).click();
      await (await chooser).setFiles({ name: "sentetik-profil-fotografi.png", mimeType: "image/png", buffer: photo });
      await mediaControls.locator(".avatar img").waitFor();
      await save("POST");
      const saved = (await api(context.request, "/api/profile")).profile;
      assert.ok(saved.avatarUrl); assert.equal(Object.hasOwn(saved, "bannerUrl"), false, "Own profile DTO does not expose a cover");
      const imageUrl = new URL(saved.avatarUrl, base); assert.equal(imageUrl.origin, base);
      const storedPhoto = await context.request.get(imageUrl.href); assert.equal(storedPhoto.status(), 200);
      assert.equal(createHash("sha256").update(await storedPhoto.body()).digest("hex"), photoHash, "Real R2 bytes match the selected avatar");
      await page.reload({ waitUntil: "networkidle" });
      assert.equal((await api(context.request, "/api/profile")).profile.avatarUrl, saved.avatarUrl, "Avatar persists after reload");
      await page.locator(".profile-main > .avatar img").waitFor();

      const rejected = await context.request.post(`${base}/api/profile/media`, { headers: { origin: base }, multipart: { kind: "banner", image: { name: "rejected-cover.png", mimeType: "image/png", buffer: photo } } });
      assert.equal(rejected.status(), 400, "Removed banner upload is rejected before storage");
      assert.equal((await api(context.request, "/api/profile")).profile.avatarUrl, saved.avatarUrl, "Rejected cover cannot affect the avatar");
      const publicData = await api(viewerContext.request, `/api/people?id=${encodeURIComponent(owner.profile.publicId)}`);
      assert.equal(publicData.person.publicId, owner.profile.publicId);
      assert.equal(publicData.person.avatarUrl, saved.avatarUrl);
      assert.equal(Object.hasOwn(publicData.person, "bannerUrl"), false, "Public DTO does not expose a cover");

      for (const width of [320, 390, 1280]) {
        const viewport = { width, height: width >= 800 ? 1000 : 844 };
        await page.setViewportSize(viewport); await viewerPage.setViewportSize(viewport);
        await ready("/?view=profile"); await page.locator(".profile-main > .avatar img").waitFor();
        await geometry(page, "own", width);
        await editor(); await geometry(page, "editor", width);
        await page.locator(".profile-editor-topbar").getByRole("button", { name: "Vazgeç", exact: true }).click();
        await ready(publicRoute, viewerPage); await viewerPage.locator(".profile-main > .avatar img").waitFor();
        await geometry(viewerPage, "public", width);
      }

      await page.setViewportSize({ width: 390, height: 844 }); await ready("/?view=profile");
      const removal = await editor(); await removal.getByRole("button", { name: "Kaldır", exact: true }).click();
      assert.equal(await removal.locator(".avatar img").count(), 0, "Removal previews initials before saving");
      await save("DELETE"); await page.reload({ waitUntil: "networkidle" });
      assert.equal((await api(context.request, "/api/profile")).profile.avatarUrl, null);
      assert.equal((await context.request.get(imageUrl.href)).status(), 404, "Removed photo is no longer served");
      await geometry(page, "own-removed", 390, false);
      await viewerPage.setViewportSize({ width: 390, height: 844 }); await ready(publicRoute, viewerPage);
      await geometry(viewerPage, "public-removed", 390, false);
      assert.deepEqual(writes.map(item => item.method), ["POST", "DELETE"], "Only explicit avatar save and removal mutate media");
      return { normalSyntheticAccounts: 2, normalFileChooser: true, realR2BytesVerified: true, avatarPersistedAfterReload: true, avatarRemovalPersisted: true, removedPhotoStatus: 404, rejectedBannerStatus: 400, coverElementsAbsent: true, layouts, screenshots, physicalAndroidPhotoTested: false };
    } finally { page.off("request", watchWrite); await viewerContext.close(); }
  });
  await run("exact meetup notification opens private detail with mobile history, drafts and truthful access", async () => {
    const partner = await account(), stranger = await account();
    const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const strangerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const partnerPage = await partnerContext.newPage(), strangerPage = await strangerContext.newPage();
    watchPage(partnerPage); watchPage(strangerPage);
    const socialWrites = [], screenshots = [], layouts = [];
    const watchWrite = request => {
      if (new URL(request.url()).pathname === "/api/social-match" && request.method() !== "GET") {
        const body = request.postDataJSON(); socialWrites.push({ method: request.method(), action: body.action, id: body.id, decision: body.decision });
      }
    };
    const href = id => `/?view=match&meetup=${encodeURIComponent(id)}`;
    const detail = browserPage => browserPage.getByRole("dialog", { name: "Buluşma isteği", exact: true });
    const shown = async (id, browserPage = page) => {
      const panel = detail(browserPage); await panel.waitFor();
      await browserPage.locator(`[role="dialog"][data-meetup-id="${id}"][data-state="ready"]`).waitFor();
      return panel;
    };
    const exact = async (request, id) => (await api(request, `/api/social-match?id=${encodeURIComponent(id)}`)).request;
    const invite = async (sender, recipient, label) => (await api(sender, "/api/social-match", "POST", {
      action: "request", targetPublicId: recipient.profile.publicId, activity: "coffee", message: `Sentetik özel buluşma ${label} ${stamp}`, campusPlace: "Sentetik kampüs kütüphanesi",
    })).request;
    const mobileDestination = async name => {
      if (name === "Bildirimler") {
        await page.getByRole("navigation", { name: "Mobil gezinme", exact: true }).getByRole("button", { name: "Akış", exact: true }).click();
        await page.locator(".app-mobile-header").getByRole("button", { name: "Bildirimler", exact: true }).click();
      } else {
        await page.getByRole("navigation", { name: "Mobil gezinme", exact: true }).getByRole("button", { name: "Keşfet", exact: true }).click();
        await page.getByRole("tablist", { name: "Keşfet bölümü", exact: true }).getByRole("tab", { name: "Kampüsüm", exact: true }).click();
        await page.getByRole("region", { name: "Kampüs bölümleri", exact: true }).getByRole("button", { name, exact: true }).click();
      }
    };
    const close = async browserPage => { await detail(browserPage).getByRole("button", { name: "Buluşma ayrıntısını kapat", exact: true }).click(); await detail(browserPage).waitFor({ state: "hidden" }); };
    try {
      await login(partner, partnerPage); await login(stranger, strangerPage);
      const preference = { action: "save-profile", interests: ["music", "books"], intents: ["coffee"], bio: "Sentetik tarayıcı eşleşme tercihi", availability: "week", discoverable: true };
      await api(context.request, "/api/social-match", "POST", preference); await api(partnerContext.request, "/api/social-match", "POST", preference);
      const initial = await invite(partnerContext.request, owner, "bildirim-hedefi");
      const before = await exact(context.request, initial.id); assert.equal(before.status, "pending");
      assert.ok((await api(context.request, "/api/notifications")).notifications.some(item => item.entityType === "meetup" && item.entityId === initial.id));

      page.on("request", watchWrite);
      await ready("/?view=match");
      await page.getByRole("button", { name: "Tercihlerim", exact: true }).click();
      const draft = `Kaydedilmemiş sentetik tercih ${stamp}`;
      await page.locator(".social-settings textarea").fill(draft);
      await page.getByRole("navigation", { name: "Sosyalleşme bölümleri", exact: true }).getByRole("button", { name: /^Buluşma istekleri/ }).click();
      const hiddenQuery = `eşleşmeyen-sentetik-filtre-${stamp}`;
      await page.getByPlaceholder("Buluşma isteklerinde ara", { exact: true }).fill(hiddenQuery);
      await mobileDestination("Bildirimler");
      await page.locator(`.notice-open[href="${href(initial.id)}"]`).click();
      let panel = await shown(initial.id); assert.ok((await panel.innerText()).includes(before.message));
      await page.waitForFunction(() => { const panel = document.querySelector('[role="dialog"][data-state="ready"][data-meetup-id]'); return panel?.contains(document.activeElement) && !document.activeElement.matches('input,textarea'); });
      assert.equal(socialWrites.length, 0, "Opening the exact target never creates or responds to a meetup");
      assert.equal((await exact(context.request, initial.id)).status, "pending");
      await screenshot("meetup-notification-exact.png"); screenshots.push("meetup-notification-exact.png");
      await page.goBack(); await panel.waitFor({ state: "hidden" }); assert.equal(new URL(page.url()).searchParams.get("view"), "notifications");
      await page.goForward(); await shown(initial.id); await close(page);
      assert.equal(new URL(page.url()).searchParams.get("view"), "notifications");
      await mobileDestination("Eşleş");
      assert.equal(await page.getByPlaceholder("Buluşma isteklerinde ara", { exact: true }).inputValue(), hiddenQuery);
      await page.getByRole("button", { name: "Tercihlerim", exact: true }).click();
      assert.equal(await page.locator(".social-settings textarea").inputValue(), draft);
      await page.getByRole("navigation", { name: "Sosyalleşme bölümleri", exact: true }).getByRole("button", { name: /^Buluşma istekleri/ }).click();
      await page.getByPlaceholder("Buluşma isteklerinde ara", { exact: true }).fill("");
      await page.locator(`a[href="${href(initial.id)}"]`).filter({ hasText: "Ayrıntıyı aç" }).click();
      panel = await shown(initial.id);
      await panel.getByRole("button", { name: "Şikâyet", exact: true }).click();
      const report = page.getByRole("dialog", { name: "Buluşma isteğini şikâyet et", exact: true }); await report.waitFor();
      const reportDraft = `Gönderilmeyen sentetik açıklama ${stamp}`;
      await report.locator('[name="details"]').fill(reportDraft); await report.getByRole("button", { name: "Pencereyi kapat", exact: true }).click(); await report.waitFor({ state: "hidden" });
      await (await shown(initial.id)).getByRole("button", { name: "Şikâyet", exact: true }).click();
      assert.equal(await report.locator('[name="details"]').inputValue(), reportDraft); await report.getByRole("button", { name: "Pencereyi kapat", exact: true }).click(); await report.waitFor({ state: "hidden" });
      const accepted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/social-match" && response.request().method() === "PATCH");
      await (await shown(initial.id)).getByRole("button", { name: "Kabul et", exact: true }).click(); assert.equal((await accepted).status(), 200);
      await detail(page).getByText("Kabul edildi", { exact: true }).waitFor(); assert.equal((await exact(context.request, initial.id)).status, "accepted");
      assert.deepEqual(socialWrites.map(item => ({ method: item.method, id: item.id, decision: item.decision })), [{ method: "PATCH", id: initial.id, decision: "accepted" }]);
      await close(page);

      const pending = await invite(partnerContext.request, owner, "mobil-ölçüm");
      for (const theme of ["light", "dark"]) {
        await ready("/?view=settings"); await page.getByRole("radio", { name: theme === "dark" ? /^Koyu/ : /^Açık/ }).click();
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 }); await ready(href(pending.id)); panel = await shown(pending.id);
          const measured = await panel.evaluate(element => {
            const rect=element.getBoundingClientRect(); return { width:innerWidth, theme:document.documentElement.dataset.theme,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
              horizontalOverflow:element.scrollWidth>element.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
              focusedInside:element.contains(document.activeElement),editableFocused:document.activeElement.matches('input,textarea') };
          });
          assert.ok(measured.left>=0&&measured.right<=width+1&&!measured.horizontalOverflow&&!measured.pageOverflow,JSON.stringify(measured));
          const controls=[];
          for(const button of await panel.getByRole("button").all()) {
            await button.scrollIntoViewIfNeeded(); const geometry=await button.evaluate(element=>{const rect=element.getBoundingClientRect();return {label:element.getAttribute('aria-label')||element.textContent.trim(),height:rect.height,left:rect.left,right:rect.right,unobstructed:element.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2))};});
            assert.ok(geometry.height>=48&&geometry.left>=0&&geometry.right<=width+1&&geometry.unobstructed,JSON.stringify(geometry)); controls.push(geometry);
          }
          layouts.push({...measured,controls}); const image=`meetup-detail-${theme}-${width}.png`; await screenshot(image); screenshots.push(image);
          const historyBefore=await page.evaluate(()=>history.length); await close(page); assert.equal(new URL(page.url()).searchParams.has('meetup'),false); assert.equal(await page.evaluate(()=>history.length),historyBefore,'Direct target close does not add history');
        }
      }
      await ready(href(pending.id)); panel=await shown(pending.id);
      const declined=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/social-match'&&response.request().method()==='PATCH');
      await panel.getByRole('button',{name:'Reddet',exact:true}).click(); assert.equal((await declined).status(),200); await detail(page).getByText('Reddedildi',{exact:true}).waitFor(); assert.equal((await exact(context.request,pending.id)).status,'declined'); await close(page);
      const outgoing=await invite(context.request,partner,'gönderen-iptali'); await ready(href(outgoing.id)); panel=await shown(outgoing.id);
      const cancelled=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/social-match'&&response.request().method()==='PATCH');
      await panel.getByRole('button',{name:'İptal et',exact:true}).click(); assert.equal((await cancelled).status(),200); await detail(page).getByText('İptal edildi',{exact:true}).waitFor(); assert.equal((await exact(context.request,outgoing.id)).status,'cancelled'); await close(page);

      const missingId=`missing-${randomUUID()}`;
      const missing=await context.request.get(`${base}/api/social-match?id=${missingId}`), outside=await strangerContext.request.get(`${base}/api/social-match?id=${initial.id}`);
      assert.equal(missing.status(),404); assert.equal(outside.status(),404); const generic=await missing.json(); assert.deepEqual(await outside.json(),generic);
      await ready(href(initial.id),strangerPage); const outsiderPanel=detail(strangerPage); await outsiderPanel.locator('[role="alert"]').waitFor(); assert.equal(await strangerPage.locator(`[data-state="ready"][data-meetup-id="${initial.id}"]`).count(),0); assert.ok(!(await outsiderPanel.innerText()).includes(before.message)); await screenshot('meetup-outsider-unavailable.png',strangerPage); screenshots.push('meetup-outsider-unavailable.png');
      await api(context.request,'/api/safety','POST',{action:'block',targetId:partner.profile.publicId,active:true});
      const blocked=await context.request.get(`${base}/api/social-match?id=${initial.id}`); assert.equal(blocked.status(),404); assert.deepEqual(await blocked.json(),generic);
      await ready(href(initial.id)); await detail(page).getByRole('alert').waitFor(); assert.equal(await page.locator(`[data-state="ready"][data-meetup-id="${initial.id}"]`).count(),0); assert.ok(!(await detail(page).innerText()).includes(before.message)); await screenshot('meetup-blocked-unavailable.png'); screenshots.push('meetup-blocked-unavailable.png');
      await api(context.request,'/api/safety','POST',{action:'block',targetId:partner.profile.publicId,active:false}); await ready(href(initial.id)); await shown(initial.id); assert.equal((await exact(context.request,initial.id)).status,'accepted'); await close(page);
      assert.deepEqual(socialWrites.map(item=>item.decision),['accepted','declined','cancelled']);
      return { source:'Actual notification UI anchor and authenticated SQLite-backed APIs',syntheticAccounts:3,exactTargetId:initial.id,automaticMeetupMutations:0,explicitDecisions:['accepted','declined','cancelled'],backForward:true,directClosePreservesHistory:true,preferenceAndReportDraftsPreserved:true,storedQueryPreserved:true,outsiderStatus:404,blockedStatus:404,missingStatus:404,inaccessibleBodiesGeneric:true,privateTargetOutside80BrowserTested:false,outside80Reason:'Normal API quota12/day; covered by actual SQLite API regression instead of database tampering',physicalNotificationTapTested:false,layouts,screenshots };
    } finally { page.off('request',watchWrite); await partnerContext.close(); await strangerContext.close(); }
  });
  await run("account erasure requires owner confirmation, recovers a lost response and preserves another user's message history", async () => {
    assert.equal(base, "http://127.0.0.1:5180");
    const subject = await account(); assert.match(subject.email, /^qa\.[a-f0-9-]+@example\.invalid$/); assert.notEqual(subject.email, owner.email);
    const subjectContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const subjectPage = await subjectContext.newPage(), staffPage = await staffContext.newPage(); watchPage(subjectPage); watchPage(staffPage);
    const screenshots = [], layouts = [], actions = []; let dropped = false, requestId = "", jobId = "";
    const trackAction = (request) => { if (new URL(request.url()).pathname === "/api/admin/account-deletion" && request.method() === "PATCH") { const data = request.postDataJSON(); actions.push({ action: data.action, id: data.id, jobId: data.jobId, confirm: data.confirm }); } };
    staffPage.on("request", trackAction);
    try {
      await login(subject, subjectPage);
      const { conversationId } = await api(subjectContext.request, "/api/messages", "POST", { recipientId: owner.profile.publicId, body: `Silinecek sentetik mesaj ${stamp}`, clientMessageKey: `qa_${randomUUID().replaceAll("-", "")}` });
      const ownText = `Korunacak sentetik mesaj ${stamp}`;
      const kept = await api(context.request, "/api/messages", "POST", { conversationId, body: ownText, clientMessageKey: `qa_${randomUUID().replaceAll("-", "")}` });
      const uploaded = await subjectContext.request.post(`${base}/api/notes`, { headers: { origin: base }, multipart: { title: `Silinecek sentetik not ${stamp}`, description: "Yalnızca izole hesap silme kabul kontrolü", courseId: "bilgisayar-mat101", noteType: "ders-notu", file: { name: "Sentetik silme kontrolü.pdf", mimeType: "application/pdf", buffer: syntheticPdf() } } });
      assert.equal(uploaded.status(), 201); const { note } = await uploaded.json(); assert.equal(note.status, "published");
      assert.equal((await context.request.get(new URL(note.fileUrl, base).href)).status(), 200);
      await subjectPage.goto(`${base}/account-deletion`, { waitUntil: "domcontentloaded" });
      await subjectPage.getByRole("heading", { name: "Silme talebi oluştur", exact: true }).waitFor();
      for (const width of [390, 320]) {
        await subjectPage.setViewportSize({ width, height: 844 });
        const submit = subjectPage.getByRole("button", { name: "Hesap ve veri silme talebi gönder", exact: true }); await submit.scrollIntoViewIfNeeded();
        const layout = await submit.evaluate((element) => { const rect = element.getBoundingClientRect(); return { width: innerWidth, height: rect.height, left: rect.left, right: rect.right, pageWidth: document.documentElement.scrollWidth }; });
        assert.ok(layout.height >= 48 && layout.left >= 0 && layout.right <= width + 1 && layout.pageWidth <= width + 1, JSON.stringify(layout)); layouts.push({ step: "request", ...layout });
        const image = `erasure-request-${width}.png`; await screenshot(image, subjectPage); screenshots.push(image);
      }
      assert.equal(await subjectPage.locator('input[name="confirm"]').isChecked(), false);
      await subjectPage.locator('textarea[name="note"]').fill(`Sentetik hesap silme kabul kontrolü ${stamp}`);
      await subjectPage.locator('input[name="confirm"]').check();
      const requested = subjectPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/account-deletion" && response.request().method() === "POST");
      await subjectPage.getByRole("button", { name: "Hesap ve veri silme talebi gönder", exact: true }).click();
      const requestResponse = await requested; assert.equal(requestResponse.status(), 202); requestId = (await requestResponse.json()).request.id;
      assert.ok(requestId); await subjectPage.getByRole("button", { name: "Talebi iptal et", exact: true }).waitFor();
      const staffLogin = await loginIsolatedStaff(staffPage);
      await staffPage.getByRole("button", { name: /Hesap silme talepleri/ }).click();
      const card = staffPage.locator("article").filter({ hasText: subject.email }).filter({ hasText: requestId });
      await card.getByRole("button", { name: "İncelemeye al", exact: true }).waitFor();
      assert.equal(actions.length, 0, "Listing user requests must never execute one");
      await card.getByRole("button", { name: "İncelemeye al", exact: true }).click();
      await card.getByRole("button", { name: "Hesabı sil…", exact: true }).waitFor();
      assert.deepEqual(actions.map((action) => action.action), ["review"]);
      assert.equal((await subjectContext.request.get(`${base}/api/profile`)).status(), 200, "Review must not freeze or delete the user");
      await card.getByRole("button", { name: "Hesabı sil…", exact: true }).click();
      let dialog = staffPage.getByRole("dialog", { name: "Hesabı kalıcı olarak sil", exact: true }); await dialog.waitFor();
      assert.match(await dialog.innerText(), new RegExp(requestId)); assert.ok((await dialog.innerText()).includes(subject.email));
      assert.equal(await dialog.getByRole("checkbox").isChecked(), false); assert.equal(await dialog.getByRole("button", { name: "Kalıcı silmeyi başlat", exact: true }).isDisabled(), true);
      await dialog.getByRole("button", { name: "Vazgeç", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(actions.some((action) => action.action === "execute"), false);
      for (const width of [390, 320]) {
        await staffPage.setViewportSize({ width, height: 844 }); await card.getByRole("button", { name: "Hesabı sil…", exact: true }).click();
        dialog = staffPage.getByRole("dialog", { name: "Hesabı kalıcı olarak sil", exact: true }); await dialog.waitFor();
        const layout = await dialog.evaluate((element) => { const rect = element.getBoundingClientRect(); return { width: innerWidth, left: rect.left, right: rect.right, pageWidth: document.documentElement.scrollWidth, overflow: element.scrollWidth > element.clientWidth + 1, controls: [...element.querySelectorAll("button")].map((button) => ({ text: button.textContent, height: button.getBoundingClientRect().height })) }; });
        assert.ok(layout.left >= 0 && layout.right <= width + 1 && !layout.overflow && layout.pageWidth <= width + 1 && layout.controls.every((control) => control.height >= 48), JSON.stringify(layout)); layouts.push({ step: "confirmation", ...layout });
        const image = `erasure-confirm-${width}.png`; await screenshot(image, staffPage); screenshots.push(image);
        if (width === 390) { await dialog.getByRole("button", { name: "Vazgeç", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); }
      }
      const dropAcknowledgement = async (route) => {
        if (route.request().method() !== "PATCH" || route.request().postDataJSON().action !== "execute" || dropped) return route.continue();
        assert.equal(route.request().postDataJSON().id, requestId, "Only the exact freshly requested synthetic account can be erased");
        const response = await route.fetch({ timeout: 60000 }); assert.ok([200, 202].includes(response.status())); const body = await response.json();
        assert.ok(body.job?.id); assert.equal(body.job.requestId, requestId); jobId = body.job.id; dropped = true;
        injectedRequests.add(route.request()); results.networkFaultInjection.push({ path: "/api/admin/account-deletion", actualServerStatus: response.status(), fault: "Actual accepted synthetic erasure response deliberately dropped; no response fabricated" }); await route.abort("failed");
      };
      await staffPage.route(`${base}/api/admin/account-deletion`, dropAcknowledgement);
      try {
        await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Kalıcı silmeyi başlat", exact: true }).click();
        await staffPage.getByText("Yanıt alınamadı. Son durum kontrol ediliyor; silme isteği tekrar gönderilmiyor.", { exact: true }).waitFor({ timeout: 65000 });
        assert.ok(dropped && jobId); await staffPage.locator(`[data-erasure-job-id="${jobId}"]`).waitFor();
      } finally { await staffPage.unroute(`${base}/api/admin/account-deletion`, dropAcknowledgement); }
      assert.equal(actions.filter((action) => action.action === "execute").length, 1);
      assert.equal((await subjectContext.request.get(`${base}/api/profile`)).status(), 401, "Accepted erasure revokes the original session");
      await subjectPage.getByRole("button", { name: "Durumu yenile", exact: true }).click();
      await subjectPage.getByRole("button", { name: "Giriş yap ve devam et", exact: true }).waitFor();
      assert.equal(await subjectPage.getByRole("button", { name: "Talebi iptal et", exact: true }).count(), 0);
      const receipt = staffPage.locator(`[data-erasure-job-id="${jobId}"]`); let resumes = 0;
      for (; resumes < 30 && await receipt.getAttribute("data-state") !== "completed"; resumes++) {
        const mutation = staffPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/admin/account-deletion" && response.request().method() === "PATCH");
        const refreshed = staffPage.waitForResponse((response) => new URL(response.url()).pathname === "/api/admin/account-deletion" && response.request().method() === "GET");
        await receipt.getByRole("button", { name: "Temizliği sürdür", exact: true }).click();
        const response = await mutation; assert.ok([200, 202].includes(response.status())); const body = await response.json(); assert.equal(body.job.id, jobId);
        assert.equal((await refreshed).status(), 200);
        if (body.job.state === "completed") await staffPage.locator(`[data-erasure-job-id="${jobId}"][data-state="completed"]`).waitFor();
        else await receipt.getByRole("button", { name: "Temizliği sürdür", exact: true }).waitFor();
      }
      assert.equal(await receipt.getAttribute("data-state"), "completed", "Pending or blocked work is never labelled completed by the harness");
      assert.equal(await receipt.getByRole("button", { name: "Temizliği sürdür", exact: true }).count(), 0);
      await receipt.scrollIntoViewIfNeeded(); await screenshot("erasure-completed-receipt.png", staffPage); screenshots.push("erasure-completed-receipt.png");
      const retained = await api(context.request, `/api/messages?conversationId=${encodeURIComponent(conversationId)}&messageId=${encodeURIComponent(kept.message.id)}`);
      assert.deepEqual(retained.messages.map((message) => message.body), [ownText]);
      const conversation = retained.conversations.find((item) => item.id === conversationId); assert.equal(conversation.readOnly, true); assert.equal(conversation.person.publicId, null); assert.equal(conversation.person.displayName, "Silinmiş hesap");
      assert.ok(!JSON.stringify(retained).includes(subject.email)); assert.ok(!JSON.stringify(retained).includes(subject.profile.publicId));
      assert.equal((await context.request.get(new URL(note.fileUrl, base).href)).status(), 404);
      await page.setViewportSize({ width: 320, height: 844 }); await ready(`/?view=messages&conversation=${encodeURIComponent(conversationId)}`);
      await page.getByRole("region", { name: "Silinmiş hesap ile mesajlar", exact: true }).waitFor();
      assert.equal(await page.locator("textarea").count(), 0); assert.equal(await page.getByRole("button", { name: "Kişi seçenekleri", exact: true }).count(), 0);
      assert.ok((await page.locator("body").innerText()).includes(ownText)); await screenshot("erasure-preserved-message-320.png"); screenshots.push("erasure-preserved-message-320.png");
      assert.equal(actions.filter((action) => action.action === "execute").length, 1);
      return { syntheticSubjectOnly: true, staffLogin, requestId, jobId, explicitUserRequest: true, reviewPreservedSession: true, cancelledConfirmationDidNotExecute: true, executeCount: 1, droppedActualExecuteResponse: dropped, manualResumeCount: resumes, canonicalState: "completed", formerSessionStatus: 401, erasedNoteFileStatus: 404, preservedPeerMessageCount: retained.messages.length, readOnlyAnonymousHistory: true, layouts, screenshots };
    } catch (error) {
      await screenshot("erasure-failure-staff.png", staffPage).catch(() => {});
      await screenshot("erasure-failure-subject.png", subjectPage).catch(() => {});
      const diagnostic = { actions, dropped, jobId, requestId, error: clean(error.message), staffPath: new URL(staffPage.url()).pathname,
        alerts: await staffPage.getByRole("alert").allTextContents(), receipts: await staffPage.locator("[data-erasure-job-id]").evaluateAll((items) => items.map((item) => ({ id: item.getAttribute("data-erasure-job-id"), state: item.getAttribute("data-state"), text: item.textContent }))) };
      await writeFile(path.join(output, "erasure-failure.json"), clean(JSON.stringify(diagnostic, null, 2)));
      throw error;
    } finally { staffPage.off("request", trackAction); await subjectContext.close(); await staffContext.close(); }
  });
  await run("push preferences preserve explicit consent, responsive layout and real configuration recovery", async () => {
    const before = await page.evaluate(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    await page.addInitScript(() => {
      window.__kampiraPushPermissionCalls = 0;
      if (typeof Notification !== "undefined") {
        const original = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = (...args) => { window.__kampiraPushPermissionCalls++; return original(...args); };
      }
    });
    const configResponse = await context.request.get(`${base}/api/push-subscriptions`, { headers: { origin: base, "X-Account-Context": owner.profile.publicId } });
    assert.equal(configResponse.status(), 200);
    const config = await configResponse.json();
    const expected = config.webPush.available && config.webPush.publicKey ? "off" : "unavailable";
    assert.equal(config.subscriptions.length, 0, "A fresh account is never automatically enrolled");
    const geometry = [], screenshots = [];
    for (const theme of ["light", "dark"]) {
      await ready("/?view=settings");
      await page.getByRole("radio", { name: theme === "dark" ? /^Koyu/ : /^Açık/ }).click();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await ready("/?view=notifications");
        const preference = page.getByRole("button", { name: /^Bildirim tercihleri/ });
        const discoverability = await preference.evaluate((button) => {
          const rect = button.getBoundingClientRect(), search = document.querySelector('input[placeholder="Bildirimlerde ara"]')?.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height, searchTop: search?.top,
            visible: rect.top >= 0 && rect.bottom <= innerHeight,
            unobstructed: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
        });
        assert.ok(discoverability.visible && discoverability.unobstructed && discoverability.height >= 48 && discoverability.bottom <= discoverability.searchTop, JSON.stringify(discoverability));
        await preference.click();
        const panel = page.locator(`[aria-label="Cihaz bildirimleri"][data-state="${expected}"]`); await panel.waitFor();
        await panel.getByRole("button").last().evaluate((button) => button.scrollIntoView({ block: "center" }));
        const measured = await panel.evaluate((element) => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return { width: innerWidth, theme: document.documentElement.dataset.theme, left: rect.left, right: rect.right, scrollWidth: document.documentElement.scrollWidth,
            panelOverflow: element.scrollWidth > element.clientWidth + 1, background: style.backgroundColor, foreground: style.color,
            controls: [...element.querySelectorAll("button")].map((button) => { const bounds = button.getBoundingClientRect(); return { label: button.textContent, height: bounds.height, width: bounds.width,
              unobstructed: button.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)) }; }) };
        });
        assert.ok(measured.left >= 0 && measured.right <= width + 1 && measured.scrollWidth <= width + 1 && !measured.panelOverflow, JSON.stringify(measured));
        assert.ok(measured.controls.every((control) => control.height >= 48 && control.unobstructed), JSON.stringify(measured.controls));
        assert.equal(await page.evaluate(() => window.__kampiraPushPermissionCalls), 0);
        if (expected === "unavailable") { await panel.getByRole("heading", { name: "Bildirimler hazırlanıyor", exact: true }).waitFor(); assert.equal(await panel.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true }).count(), 0); }
        geometry.push({ ...measured, discoverability }); const image = `push-preferences-${theme}-${width}.png`; await screenshot(image); screenshots.push(image);
      }
    }
    let intercepted = false;
    const handler = async (route) => {
      if (intercepted || route.request().method() !== "GET") return route.continue();
      intercepted = true;
      const actual = await route.fetch({ timeout: 10000 }); assert.equal(actual.status(), 200);
      injectedRequests.add(route.request()); results.networkFaultInjection.push({ path: "/api/push-subscriptions", actualServerStatus: actual.status(), fault: "Actual configuration response deliberately dropped; no API response fabricated" });
      await route.abort("failed");
    };
    await page.route(`${base}/api/push-subscriptions`, handler);
    try {
      await ready("/?view=notifications"); await page.getByRole("button", { name: /^Bildirim tercihleri/ }).click();
      const failed = page.locator('[aria-label="Cihaz bildirimleri"][data-state="error"]'); await failed.waitFor(); await failed.getByRole("alert").waitFor();
      await failed.getByRole("button").last().evaluate((button) => button.scrollIntoView({ block: "center" }));
      await screenshot("push-preferences-network-error.png"); screenshots.push("push-preferences-network-error.png");
    } finally { await page.unroute(`${base}/api/push-subscriptions`, handler); }
    await page.getByRole("button", { name: "Durumu yenile", exact: true }).click();
    await page.locator(`[aria-label="Cihaz bildirimleri"][data-state="${expected}"]`).waitFor();
    const wrong = await context.request.get(`${base}/api/push-subscriptions`, { headers: { origin: base, "X-Account-Context": "wrong-public-owner" } }); assert.equal(wrong.status(), 409);
    const finalConfig = await context.request.get(`${base}/api/push-subscriptions`, { headers: { origin: base, "X-Account-Context": owner.profile.publicId } }); assert.equal((await finalConfig.json()).subscriptions.length, 0);
    assert.equal(await page.evaluate(() => window.__kampiraPushPermissionCalls), 0); assert.equal(await page.evaluate(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission), before);
    await ready("/?view=settings"); await page.getByRole("radio", { name: /^Açık/ }).click();
    return { webConfigured: config.webPush.available, nativeConfigured: config.nativePush.available, expectedState: expected, layouts: geometry, screenshots, permissionRequests: 0, automaticEnrollment: false, droppedActualConfigurationResponse: intercepted, manualRetryRecovered: true, wrongAccountStatus: wrong.status(), actualProviderDeliveryTested: false };
  });
  await run("file actions download the real Unicode note and revalidate file access", async () => {
    const filename = "Ders notu – ölçüm 📄.pdf", bytes = syntheticPdf();
    const created = await context.request.post(`${base}/api/notes`, { headers: { origin: base }, multipart: {
      title: `Sentetik dosya kontrolü ${stamp}`, description: "Yalnızca yalıtılmış indirme kontrolü.", courseId: "bilgisayar-mat101", noteType: "ders-notu",
      file: { name: filename, mimeType: "application/pdf", buffer: bytes },
    } });
    assert.equal(created.status(), 201); const { note } = await created.json(); assert.equal(note.status, "published");
    const fileUrl = new URL(note.fileUrl, base); fileUrl.searchParams.set("download", "1");
    const response = await context.request.get(fileUrl.href, { headers: { "X-Account-Context": owner.profile.publicId } });
    assert.equal(response.status(), 200); assert.equal(response.headers()["content-type"], "application/pdf");
    assert.match(response.headers()["content-disposition"], /attachment;.*filename\*=UTF-8''/);
    assert.match(response.headers()["cache-control"], /private, no-store/); assert.deepEqual(await response.body(), bytes);
    const screenshots = [], layouts = [];
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await ready(`/?view=notes&note=${note.id}`);
      const detail = page.locator(".feature-detail"); await detail.getByRole("heading", { name: note.title, exact: true }).waitFor();
      const downloadLink = detail.locator('a[href*="/api/notes/file"][href*="download=1"]'); await downloadLink.waitFor();
      await downloadLink.evaluate((link) => link.scrollIntoView({ block: "center" }));
      const layout = await downloadLink.evaluate((link) => { const rect = link.getBoundingClientRect(); return { width: innerWidth, height: rect.height, left: rect.left, right: rect.right,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, unobstructed: link.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) }; });
      assert.ok(layout.height >= 48 && layout.left >= 0 && layout.right <= width + 1 && !layout.pageOverflow && layout.unobstructed, JSON.stringify(layout)); layouts.push(layout);
      const image = `file-note-actions-${width}.png`; await screenshot(image); screenshots.push(image);
    }
    const downloadEvent = page.waitForEvent("download");
    await page.locator('.feature-detail a[href*="/api/notes/file"][href*="download=1"]').click();
    const download = await downloadEvent; assert.equal(await download.failure(), null); assert.equal(download.suggestedFilename(), filename);
    const downloadedPath = path.join(output, "downloaded-synthetic-note.pdf"); await download.saveAs(downloadedPath);
    assert.deepEqual(await readFile(downloadedPath), bytes);
    const wrongOwner = await context.request.get(fileUrl.href, { headers: { "X-Account-Context": "wrong-public-owner" } }); assert.equal(wrongOwner.status(), 409);
    const unauthenticated = await browser.newContext();
    try { assert.equal((await unauthenticated.request.get(fileUrl.href)).status(), 401); } finally { await unauthenticated.close(); }
    await api(context.request, "/api/notes", "DELETE", { id: note.id }); assert.equal((await context.request.get(fileUrl.href)).status(), 404);
    return { actualDownload: true, suggestedFilename: filename, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, screenshots, layouts,
      wrongOwnerStatus: wrongOwner.status(), signedOutStatus: 401, deletedFileStatus: 404, nativeShareSheetTested: false, androidSafSaveTested: false };
  });
  await run("file actions preserve selected photo and text after an empty browser picker result", async () => {
    await page.setViewportSize({ width: 320, height: 844 }); await ready("/");
    await page.getByRole("navigation", { name: "Mobil gezinme" }).getByRole("button", { name: "Paylaş", exact: true }).click();
    const composer = page.getByRole("dialog", { name: "Yeni gönderi", exact: true }); await composer.waitFor();
    const text = `Sentetik dosya seçimi ${stamp}`; await composer.getByLabel("Gönderin", { exact: true }).fill(text);
    const input = composer.locator('input[type="file"][accept^="image/"]');
    await input.setInputFiles({ name: "qa-selection.png", mimeType: "image/png", buffer: syntheticPng([90, 60, 200]) });
    const media = composer.getByRole("region", { name: "Gönderi medyaları", exact: true }); await media.waitFor();
    assert.equal(await media.locator("li").count(), 1);
    await input.setInputFiles([]);
    assert.equal(await media.locator("li").count(), 1); assert.equal(await composer.getByLabel("Gönderin", { exact: true }).inputValue(), text);
    assert.equal(await media.locator("img").getAttribute("alt"), "1. fotoğraf: qa-selection.png");
    assert.ok(await composer.getByRole("button", { name: "Video", exact: true }).isDisabled());
    assert.ok(await composer.evaluate((element) => element.scrollWidth <= innerWidth + 1));
    await screenshot("file-picker-preserved-320.png");
    await composer.getByRole("button", { name: "Medyayı kaldır", exact: true }).click(); await composer.getByLabel("Gönderin", { exact: true }).fill("");
    await composer.getByRole("button", { name: "Gönderiyi kapat", exact: true }).click(); await composer.waitFor({ state: "hidden" });
    return { retainedPhotoCount: 1, retainedText: true, emptyFileInputResult: true, nativeCameraResultTested: false, screenshot: "file-picker-preserved-320.png" };
  });
  if (phase === "final") await run("all eleven self-hosted Geist faces load and are ready", async () => {
    const fontState = await page.evaluate(async () => {
      const faces = [...document.fonts].filter((face) => face.family.includes("Geist"));
      await Promise.all(faces.map((face) => face.load())); await document.fonts.ready;
      return { count: faces.length, loaded: faces.filter((face) => face.status === "loaded").length, status: document.fonts.status, bodyFamily: getComputedStyle(document.body).fontFamily };
    });
    assert.equal(fontState.count, 11); assert.equal(fontState.loaded, 11); assert.equal(fontState.status, "loaded"); assert.match(fontState.bodyFamily, /Geist/);
    return fontState;
  });
  const views = ["feed", "discover", "messages", "pulse", "match", "campus", "library", "market", "notes", "communities", "notifications", "saved", "safety", "settings", "profile"];
  for (const view of views) await run(`route ${view} at 390`, () => inspectScreen(view, 390));
  for (const width of [320, 800, 1440]) for (const view of ["feed", "notes", "messages", "profile"]) await run(`route ${view} at ${width}`, () => inspectScreen(view, width));
  await page.setViewportSize({ width: 390, height: 844 });
  if (phase === "final") {
    await ready("/?view=settings"); await page.getByRole("radio", { name: /^Koyu/ }).click();
    for (const [view, width] of [["notes", 320], ["profile", 390], ["messages", 390], ["feed", 800]]) await run(`dark route ${view} at ${width}`, () => inspectScreen(view, width, "-dark"));
    await ready("/?view=settings"); await page.getByRole("radio", { name: /^Açık/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await run("two photos reorder, publish through UI, and survive reload", async () => {
      await ready("/"); await page.getByRole("navigation", { name: "Mobil gezinme" }).getByRole("button", { name: "Paylaş", exact: true }).click();
      const composer = page.getByRole("dialog", { name: "Yeni gönderi", exact: true });
      await composer.waitFor();
      await composer.locator('input[type="file"][accept^="image/"]').setInputFiles([{ name: "qa-first.png", mimeType: "image/png", buffer: syntheticPng([90, 60, 200]) }, { name: "qa-second.png", mimeType: "image/png", buffer: syntheticPng([20, 150, 140]) }]);
      await composer.getByRole("button", { name: "2. fotoğrafı önceye taşı", exact: true }).click();
      const text = `Sentetik sıralı fotoğraf kontrolü ${stamp}`;
      await composer.getByLabel("Gönderin", { exact: true }).fill(text);
      await composer.locator(".app-post-audience select").selectOption("campus");
      await screenshot("ordered-photos-composer.png");
      const pending = page.waitForResponse((response) => response.url() === `${base}/api/posts` && response.request().method() === "POST", { timeout: 30000 });
      await composer.getByRole("button", { name: "Paylaş", exact: true }).click();
      const response = await pending; const data = await response.json();
      assert.equal(response.status(), 201, data.error ?? "Post was not created");
      publishedPost = data.post;
      assert.deepEqual(publishedPost.media.map((item) => item.fileName), ["qa-second.png", "qa-first.png"]);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText(text, { exact: true }).first().waitFor();
      const reloaded = await api(context.request, `/api/posts?id=${encodeURIComponent(publishedPost.id)}`);
      assert.deepEqual(reloaded.post.media.map((item) => item.fileName), ["qa-second.png", "qa-first.png"]);
      const post = page.locator("article").filter({ has: page.getByText(text, { exact: true }) }).first();
      await post.scrollIntoViewIfNeeded();
      const media = post.locator(".post-media img");
      assert.equal(await media.count(), 2);
      const expectedUrls = reloaded.post.media.map((item) => new URL(item.url, base).href);
      assert.deepEqual(await media.evaluateAll((images) => images.map((image) => image.src)), expectedUrls);
      await page.waitForFunction((urls) => urls.every((url) => [...document.querySelectorAll(".post-media img")].some((image) => image.src === url && image.complete && image.naturalWidth > 1)), expectedUrls);
      await screenshot("ordered-photos-reloaded.png");
      await post.getByRole("button", { name: "Fotoğrafı büyük aç", exact: true }).first().click();
      const viewer = page.getByRole("dialog", { name: "Gönderi medyası", exact: true });
      assert.equal(new URL(await viewer.locator(".post-media img").getAttribute("src"), base).href, expectedUrls[0]);
      await viewer.getByRole("button", { name: "Sonraki medya", exact: true }).click();
      assert.equal(new URL(await viewer.locator(".post-media img").getAttribute("src"), base).href, expectedUrls[1]);
      await screenshot("ordered-photos-viewer.png");
      await viewer.getByRole("button", { name: "Medyayı kapat", exact: true }).click();
      await viewer.waitFor({ state: "hidden" });
      return { mediaCount: publishedPost.media.length, order: publishedPost.media.map((item) => item.fileName), persisted: true, imagesDecoded: true, viewerNextPreservesOrder: true };
    });
    await run("real note target and browser Back/Forward", async () => {
      const response = await context.request.post(`${base}/api/notes`, { headers: { origin: base }, multipart: { title: `Sentetik not ${stamp}`, description: "Yalnızca yalıtılmış yerel kalite kontrol belgesi.", courseId: "bilgisayar-mat101", noteType: "ders-notu", file: { name: "qa-note.pdf", mimeType: "application/pdf", buffer: syntheticPdf() } } });
      assert.equal(response.status(), 201); const { note } = await response.json();
      await ready("/?view=profile");
      await page.locator(".profile-mobile-more select").selectOption("notes");
      const before = await page.evaluate(() => history.state.kampiraDepth);
      await page.locator(`.profile-note-list a[href="/?view=notes&note=${note.id}"]`).click();
      await page.locator(".feature-detail").getByRole("heading", { name: note.title, exact: true }).waitFor();
      const preview = page.locator(".feature-detail iframe");
      const fileUrl = await preview.getAttribute("src");
      const document = await context.request.get(`${base}${fileUrl}`);
      assert.equal(document.status(), 200); assert.match(document.headers()["content-type"], /application\/pdf/);
      assert.match((await document.body()).subarray(0, 8).toString(), /^%PDF/);
      await screenshot("note-target.png");
      await page.goBack(); await page.locator(".feature-detail").waitFor({ state: "hidden" });
      await page.goForward(); await page.locator(".feature-detail").getByRole("heading", { name: note.title, exact: true }).waitFor();
      return { exactTarget: true, fromProfileAnchor: true, backForward: true, previousDepth: before, pdfResponse: 200, embeddedPdfPaint: "Native PDF paint is not asserted by headless Chrome" };
    });
    await run("real listing and campus event target detail", async () => {
      const { listing } = await api(context.request, "/api/campus-market", "POST", { action: "listing", kind: "sell", category: "books", title: `Sentetik ilan ${stamp}`, description: "Yalnızca yalıtılmış yerel kalite kontrol ilanı.", price: 100, condition: "used-good", meetupPlace: "Sentetik kampüs" });
      await ready(`/?view=market&listing=${listing.id}`); await page.getByRole("dialog", { name: "İlan ayrıntısı", exact: true }).getByRole("heading", { name: listing.title, exact: true }).waitFor(); await screenshot("listing-target.png");
      const { event } = await api(context.request, "/api/campus-guide", "POST", { action: "event", name: `Sentetik etkinlik ${stamp}`, category: "social", description: "Yalnızca yalıtılmış yerel kalite kontrol etkinliği.", startsAt: new Date(Date.now() + 86400000).toISOString() });
      await ready(`/?view=campus&event=${event.id}`); await page.getByRole("dialog", { name: "Etkinlik ayrıntısı", exact: true }).getByRole("heading", { name: event.title, exact: true }).waitFor(); await screenshot("campus-event-target.png");
      return { listingTarget: true, eventTarget: true };
    });
    const checkMarketReplay = async (reloadBeforeRetry = false) => {
      const title = `Sentetik ${reloadBeforeRetry ? "kalıcı " : ""}kayıp yanıt ilanı ${stamp}`;
      const screenshotPrefix = reloadBeforeRetry ? "market-durable-replay" : "market-lost-response";
      const attempts = [];
      let committed = null, handlerFailure = "", finishFirst;
      const firstHandled = new Promise((resolve) => { finishFirst = resolve; });
      const handler = async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.continue();
        const body = request.postDataJSON();
        if (body.action !== "listing" || body.title !== title) return route.continue();
        attempts.push({ key: request.headers()["idempotency-key"], body: request.postData() });
        if (attempts.length > 1) return route.continue();
        try {
          const response = await route.fetch({ timeout: 10000 });
          const data = await response.json();
          committed = { status: response.status(), id: data.listing?.id };
          results.networkFaultInjection.push({ path: "/api/campus-market", action: "listing", actualServerStatus: response.status(), fault: "Real server response deliberately dropped after commit; API response was not fabricated" });
        } catch (error) { handlerFailure = clean(error.message); }
        try {
          injectedRequests.add(request);
          await route.abort("failed");
        } catch (error) { handlerFailure ||= clean(error.message); }
        finally { finishFirst(); }
      };
      await page.route(`${base}/api/campus-market`, handler);
      try {
        await ready("/?view=market");
        await page.getByRole("button", { name: "İlan ver", exact: true }).first().click();
        const dialog = page.getByRole("dialog", { name: "İlan ver", exact: true });
        await dialog.locator('[name="title"]').fill(title);
        await dialog.locator('[name="description"]').fill("Yalnızca yalıtılmış yerel gerçek yanıt kaybı kontrolü.");
        await dialog.locator('[name="price"]').fill("125");
        await dialog.locator('[name="meetupPlace"]').fill("Sentetik kampüs kontrol noktası");
        await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
        const retry = dialog.getByRole("button", { name: "Kaydı tekrar dene", exact: true });
        await retry.waitFor();
        await firstHandled;
        assert.equal(handlerFailure, "", "Network injection handler failed"); assert.equal(committed?.status, 201, "Actual server must have committed before response drop"); assert.ok(committed?.id);
        // Do not scroll here: a user submitting at the form footer must discover
        // the recovery notice through the application's own focus/scroll behavior.
        await page.waitForFunction(() => {
          const region = document.querySelector('.market-dialog [aria-label="Pazar kayıt kurtarma"]');
          return region && (document.activeElement === region || region.contains(document.activeElement));
        }, undefined, { timeout: 5000 });
        const recoveryGeometry = await dialog.evaluate((element) => {
          const region = element.querySelector('[aria-label="Pazar kayıt kurtarma"]');
          const retryButton = [...region.querySelectorAll("button")].find((button) => button.textContent === "Kaydı tekrar dene");
          const headerBottom = element.querySelector(":scope > header").getBoundingClientRect().bottom;
          const visible = (item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= Math.max(0, headerBottom) - 1 && rect.bottom <= innerHeight + 1;
          };
          const bounds = (item) => { const rect = item.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; };
          return { regionVisible: visible(region), retryVisible: visible(retryButton), focused: document.activeElement === region || region.contains(document.activeElement), region: bounds(region), retry: bounds(retryButton), headerBottom, viewport: { width: innerWidth, height: innerHeight } };
        });
        results.recoveryGeometry = recoveryGeometry;
        await screenshot(`${screenshotPrefix}-retry.png`);
        assert.equal(recoveryGeometry.regionVisible, true, "Recovery notice must become fully visible without manual scroll");
        assert.equal(recoveryGeometry.retryVisible, true, "Recovery retry must become visible without manual scroll");
        assert.equal(recoveryGeometry.focused, true); assert.equal(await retry.isEnabled(), true);
        assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "Recovery dialog overflows horizontally");
        if (reloadBeforeRetry) {
          await marketDraftSaved();
          await ready("/?view=market");
          await openMarketCreate();
          await retry.waitFor();
          assert.equal(await dialog.locator('[name="title"]').inputValue(), title);
          assert.equal(await dialog.locator('[name="description"]').inputValue(), "Yalnızca yalıtılmış yerel gerçek yanıt kaybı kontrolü.");
          assert.equal(attempts.length, 1, "Reload must not automatically resend an uncertain operation");
          await screenshot(`${screenshotPrefix}-restored.png`);
        }
        const pending = page.waitForResponse((response) => response.url() === `${base}/api/campus-market` && response.request().method() === "POST");
        await retry.click();
        const response = await pending; const replay = await response.json();
        assert.equal(response.status(), 201); assert.equal(replay.listing.id, committed.id);
        await dialog.waitFor({ state: "hidden" });
        assert.equal(attempts.length, 2); assert.ok(attempts[0].key); assert.equal(attempts[1].key, attempts[0].key); assert.equal(attempts[1].body, attempts[0].body);
        const data = await api(context.request, "/api/campus-market");
        const matching = data.listings.filter((item) => item.title === title);
        assert.equal(matching.length, 1); assert.equal(matching[0].id, committed.id);
        await page.locator(".listing-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await screenshot(`${screenshotPrefix}-recovered.png`);
        return { realCommitStatus: committed.status, replayStatus: response.status(), identicalKeyAndBody: true, persistedListings: matching.length, fabricatedResponses: false, deliberatelyDroppedResponses: 1, recoveryVisibleWithoutManualScroll: true, recoveryFocused: true, fullReloadBeforeRetry: reloadBeforeRetry, automaticResend: false };
      } finally { if (attempts.length) await firstHandled; await page.unroute(`${base}/api/campus-market`, handler); }
    };
    await run("market UI retry replays one real committed listing after its first response is dropped", () => checkMarketReplay());
    await run("market durable uncertain listing reload preserves the original key and body for one real replay", () => checkMarketReplay(true));
    await run("market durable listing fields and two ordered files survive closing their tab", async () => {
      const fields = { title: `Sentetik kalıcı fotoğraflı ilan ${stamp}`, description: "Yalnızca yalıtılmış yerel taslak ve dosya sırası kontrolü.", category: "electronics", price: "125.55", condition: "like-new", meetupPlace: "Sentetik kalıcı teslim noktası" };
      const files = [{ name: "qa-market-first.png", mimeType: "image/png", buffer: syntheticPng([40, 145, 155]) }, { name: "qa-market-second.png", mimeType: "image/png", buffer: syntheticPng([130, 65, 185]) }];
      const draftPage = await context.newPage(); watchPage(draftPage);
      try {
        await ready("/?view=market", draftPage);
        const dialog = await openMarketCreate("listing", draftPage);
        await dialog.getByRole("button", { name: "Aranıyor", exact: true }).click();
        for (const [key, value] of Object.entries(fields)) {
          if (key === "category" || key === "condition") await dialog.locator(`[name="${key}"]`).selectOption(value);
          else await dialog.locator(`[name="${key}"]`).fill(value);
        }
        await dialog.locator('input[name="images"]').setInputFiles(files);
        await marketDraftSaved(draftPage);
      } finally { await draftPage.close(); }
      // A new document in a different tab consumes only the normal signed-in
      // browser context. No storage state, cookie, or local draft is injected.
      await ready("/?view=market");
      const restored = await openMarketCreate();
      for (const [key, value] of Object.entries(fields)) assert.equal(await restored.locator(`[name="${key}"]`).inputValue(), value, `Restored listing ${key}`);
      assert.match(await restored.getByRole("button", { name: "Aranıyor", exact: true }).getAttribute("class"), /active/);
      const fileNames = await restored.locator('[aria-label="Taslak ürün fotoğrafları"] li').allTextContents();
      assert.equal(fileNames.length, 2); files.forEach((file, index) => assert.ok(fileNames[index].includes(file.name), "File selection order must survive tab closure"));
      const restoredLayout = await marketFormGeometry(restored);
      await screenshot("market-durable-files-restored.png");
      const responses = Promise.all([
        page.waitForResponse((response) => response.url() === `${base}/api/campus-market` && response.request().method() === "POST", { timeout: 30000 }),
        page.waitForResponse((response) => response.url() === `${base}/api/campus-market/images` && response.request().method() === "POST", { timeout: 30000 }),
      ]);
      await restored.getByRole("button", { name: "Kaydet", exact: true }).click();
      const [created, uploaded] = await responses;
      assert.equal(created.status(), 201); assert.equal(uploaded.status(), 201);
      const { listing } = await created.json();
      await restored.waitFor({ state: "hidden" });
      const data = await api(context.request, "/api/campus-market");
      const matching = data.listings.filter((item) => item.title === fields.title);
      assert.equal(matching.length, 1); assert.equal(matching[0].id, listing.id); assert.equal(matching[0].images.length, 2);
      for (let index = 0; index < files.length; index++) {
        const image = await context.request.get(new URL(matching[0].images[index].url, base).href);
        assert.equal(image.status(), 200); assert.match(image.headers()["content-type"], /image\/png/);
        assert.equal((await image.body()).equals(files[index].buffer), true, `Persisted File bytes and order ${index + 1}`);
      }
      const card = page.locator(".listing-card").filter({ has: page.getByRole("heading", { name: fields.title, exact: true }) });
      await card.scrollIntoViewIfNeeded();
      const expectedUrls = matching[0].images.map((image) => new URL(image.url, base).href);
      assert.deepEqual(await card.locator(".listing-gallery img").evaluateAll((images) => images.map((image) => image.src)), expectedUrls);
      await page.waitForFunction((urls) => urls.every((url) => [...document.querySelectorAll(".listing-gallery img")].some((image) => image.src === url && image.complete && image.naturalWidth > 1)), expectedUrls);
      await screenshot("market-durable-files-published.png");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const cleanDialog = await openMarketCreate();
      assert.equal(await cleanDialog.locator('[name="title"]').inputValue(), "");
      assert.equal(await cleanDialog.locator('[aria-label="Taslak ürün fotoğrafları"] li').count(), 0);
      await cleanDialog.getByRole("button", { name: "Pencereyi kapat", exact: true }).click();
      return { tabClosedAndRestoredInDifferentDocument: true, browserProcessRestarted: false, restoredFieldCount: Object.keys(fields).length, restoredKind: "wanted", orderedFiles: files.map((file) => file.name), realFileBytesAndOrderVerified: true, persistedListings: 1, completedDraftCleared: true, restoredLayout };
    });
    await run("market durable fields and two real files survive a complete isolated Chrome process restart", async () => {
      const processOwner = await account();
      const fields = { title: `Sentetik süreç sonrası ilan ${stamp}`, description: "Yalnızca yalıtılmış gerçek Chrome süreç kapanışı denemesi.", category: "hobby", price: "185.25", condition: "used-good", meetupPlace: "Sentetik süreç kontrol noktası" };
      const files = [{ name: "qa-process-first.png", mimeType: "image/png", buffer: syntheticPng([45, 145, 75]) }, { name: "qa-process-second.png", mimeType: "image/png", buffer: syntheticPng([170, 65, 125]) }];
      // This fresh private profile is inside ignored local QA outputs. Chrome
      // itself persists its normal session; the harness never reads or exports it.
      const profileDirectory = path.join(root, "outputs/isolated-mobile-qa", `private-chrome-profile-${stamp}`);
      const launch = () => chromium.launchPersistentContext(profileDirectory, { channel: "chrome", headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      let persistent = await launch();
      try {
        let processPage = persistent.pages()[0] ?? await persistent.newPage(); watchPage(processPage);
        await login(processOwner, processPage);
        await ready("/?view=market", processPage);
        const dialog = await openMarketCreate("listing", processPage);
        for (const [key, value] of Object.entries(fields)) {
          if (key === "category" || key === "condition") await dialog.locator(`[name="${key}"]`).selectOption(value);
          else await dialog.locator(`[name="${key}"]`).fill(value);
        }
        await dialog.locator('input[name="images"]').setInputFiles(files);
        await marketDraftSaved(processPage);
        await screenshot("market-durable-process-before-close.png", processPage);
        // Closing a persistent context terminates its separate browser process.
        // The main QA browser and its contexts remain running.
        await persistent.close(); persistent = null;
        persistent = await launch();
        processPage = persistent.pages()[0] ?? await persistent.newPage(); watchPage(processPage);
        await processPage.goto(base, { waitUntil: "domcontentloaded" });
        await processPage.waitForFunction(() => document.querySelector(".auth-shell") || document.querySelector(".app-mobile-nav"));
        const reloginNeeded = await processPage.locator(".auth-shell").count() > 0;
        if (reloginNeeded) await login(processOwner, processPage);
        await ready("/?view=market", processPage);
        const restored = await openMarketCreate("listing", processPage);
        for (const [key, value] of Object.entries(fields)) assert.equal(await restored.locator(`[name="${key}"]`).inputValue(), value, `Process-restored listing ${key}`);
        const restoredNames = await restored.locator('[aria-label="Taslak ürün fotoğrafları"] li').allTextContents();
        assert.equal(restoredNames.length, 2); files.forEach((file, index) => assert.ok(restoredNames[index].includes(file.name)));
        await processPage.setViewportSize({ width: 320, height: 844 });
        assert.ok(await restored.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        const restoredLayout = await marketFormGeometry(restored);
        await screenshot("market-durable-process-restored.png", processPage);
        const pending = Promise.all([
          processPage.waitForResponse((response) => response.url() === `${base}/api/campus-market` && response.request().method() === "POST", { timeout: 30000 }),
          processPage.waitForResponse((response) => response.url() === `${base}/api/campus-market/images` && response.request().method() === "POST", { timeout: 30000 }),
        ]);
        await restored.getByRole("button", { name: "Kaydet", exact: true }).click();
        const [created, uploaded] = await pending;
        assert.equal(created.status(), 201); assert.equal(uploaded.status(), 201);
        await restored.waitFor({ state: "hidden" });
        const data = await api(persistent.request, "/api/campus-market");
        const matching = data.listings.filter((item) => item.title === fields.title);
        assert.equal(matching.length, 1); assert.equal(matching[0].images.length, 2);
        for (let index = 0; index < files.length; index++) {
          const response = await persistent.request.get(new URL(matching[0].images[index].url, base).href);
          assert.equal(response.status(), 200); assert.equal((await response.body()).equals(files[index].buffer), true, `Process-restored File bytes/order ${index + 1}`);
        }
        await uiLogout(processPage);
        return { browserProcessRestarted: true, sameFreshProfileReopened: true, separateFromMainBrowser: true, normalUiAuth: true, reloginNeeded, restoredFieldCount: Object.keys(fields).length, restoredViewportWidth: 320, orderedFiles: files.map((file) => file.name), realFileBytesAndOrderVerified: true, persistedListings: 1, cookiesOrStorageReadExportedOrInjected: false, profilePrivateAndGitIgnored: true, restoredLayout };
      } finally { if (persistent) await persistent.close(); }
    });
    await run("market photo replay survives lost commit response and Chrome restart without duplicates or deleted-photo resurrection", async () => {
      const photoOwner = await account();
      // The focused run has no later cases using the setup browser. Release it
      // before the independent process test on memory-constrained Windows hosts.
      if (only === "market photo replay") await browser.close();
      const fields = { title: `Sentetik güvenli fotoğraf tekrarı ${stamp}`, description: "Yalnızca yalıtılmış yerel fotoğraf yanıt kaybı ve tekrar deneme kontrolü.", price: "165.25", meetupPlace: "Sentetik fotoğraf kontrol noktası" };
      const files = [{ name: "qa-replay-first.png", mimeType: "image/png", buffer: syntheticPng([25, 140, 175]) }, { name: "qa-replay-second.png", mimeType: "image/png", buffer: syntheticPng([185, 65, 100]) }];
      const expectedImages = files.map((file) => ({ name: file.name, type: file.mimeType, size: file.buffer.length, sha256: createHash("sha256").update(file.buffer).digest("hex") }));
      const profileDirectory = path.join(root, "outputs/isolated-mobile-qa", `private-photo-chrome-profile-${stamp}`);
      const launch = () => chromium.launchPersistentContext(profileDirectory, { channel: "chrome", headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const attempts = [];
      let persistent = await launch(), committed = null, handlerFailure = "", listingCreates = 0, finishFirst;
      const firstHandled = new Promise((resolve) => { finishFirst = resolve; });
      const handler = async (route) => {
        const request = route.request();
        if (request.method() !== "POST") return route.continue();
        try { attempts.push(await marketPhotoRequest(request)); }
        catch (error) { handlerFailure = clean(error.message); finishFirst(); return route.abort("failed"); }
        if (attempts.length > 1) return route.continue();
        try {
          const response = await route.fetch({ timeout: 10000 });
          const data = await response.json();
          committed = { status: response.status(), images: data.images, replayed: data.idempotentReplay };
          results.networkFaultInjection.push({ path: "/api/campus-market/images", action: "photos", actualServerStatus: response.status(), fault: "Real committed image response deliberately dropped; no API response was fabricated" });
        } catch (error) { handlerFailure = clean(error.message); }
        try { injectedRequests.add(request); await route.abort("failed"); }
        catch (error) { handlerFailure ||= clean(error.message); }
        finally { finishFirst(); }
      };
      const attach = async (processPage) => {
        watchPage(processPage);
        processPage.on("request", (request) => {
          if (request.url() === `${base}/api/campus-market` && request.method() === "POST" && request.postDataJSON()?.action === "listing") listingCreates++;
        });
        await processPage.route(`${base}/api/campus-market/images`, handler);
      };
      try {
        let processPage = persistent.pages()[0] ?? await persistent.newPage(); await attach(processPage);
        await login(photoOwner, processPage); await ready("/?view=market", processPage);
        const dialog = await openMarketCreate("listing", processPage);
        for (const [key, value] of Object.entries(fields)) await dialog.locator(`[name="${key}"]`).fill(value);
        await dialog.locator('input[name="images"]').setInputFiles(files);
        await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
        await dialog.getByRole("button", { name: "Fotoğrafları tekrar yükle", exact: true }).waitFor();
        await firstHandled;
        assert.equal(handlerFailure, "", "Photo network injection must complete successfully");
        assert.equal(committed?.status, 201); assert.equal(committed.images?.length, 2); assert.equal(committed.replayed, false);
        assert.match(attempts[0].key ?? "", /^[\x21-\x7e]{8,128}$/);
        assert.deepEqual(attempts[0].images, expectedImages, "Initial request must preserve ordered file bytes and metadata");
        assert.equal(await dialog.getByRole("checkbox", { name: "İlanı açıp fotoğrafları kontrol ettim.", exact: true }).count(), 0, "Keyed recovery must not require the legacy manual duplicate check");
        await marketDraftSaved(processPage);
        await screenshot("market-photo-unknown-before-process-close-390.png", processPage);
        await persistent.close(); persistent = null;
        persistent = await launch();
        processPage = persistent.pages()[0] ?? await persistent.newPage(); await attach(processPage);
        await processPage.goto(base, { waitUntil: "domcontentloaded" });
        await processPage.waitForFunction(() => document.querySelector(".auth-shell") || document.querySelector(".app-mobile-nav"));
        const reloginNeeded = await processPage.locator(".auth-shell").count() > 0;
        if (reloginNeeded) await login(photoOwner, processPage);
        await ready("/?view=market", processPage);
        const restored = await openMarketCreate("listing", processPage);
        const retry = restored.getByRole("button", { name: "Fotoğrafları tekrar yükle", exact: true });
        await retry.waitFor(); assert.equal(await retry.isEnabled(), true);
        assert.equal(attempts.length, 1, "Restoring a photo attempt must not automatically send it");
        assert.equal(listingCreates, 1, "Restoring photos must not create another listing");
        const restoredNames = await restored.locator('[aria-label="Taslak ürün fotoğrafları"] li').allTextContents();
        assert.equal(restoredNames.length, 2); files.forEach((file, index) => assert.ok(restoredNames[index].includes(file.name)));
        const recoveryLayouts = [];
        for (const width of [390, 320]) {
          await processPage.setViewportSize({ width, height: 844 });
          await retry.scrollIntoViewIfNeeded();
          const geometry = await retry.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const dialog = element.closest('[role="dialog"]');
            return { width: innerWidth, button: { left: rect.left, right: rect.right, height: rect.height }, dialogHorizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1, documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
          });
          assert.equal(geometry.dialogHorizontalOverflow, false); assert.equal(geometry.documentHorizontalOverflow, false);
          assert.ok(geometry.button.left >= -1 && geometry.button.right <= width + 1 && geometry.button.height >= 48, "Photo retry must fit mobile viewport with a 48px touch target");
          recoveryLayouts.push(geometry);
          await screenshot(`market-photo-restored-retry-${width}.png`, processPage);
        }
        const pending = processPage.waitForResponse((response) => response.url() === `${base}/api/campus-market/images` && response.request().method() === "POST", { timeout: 30000 });
        await retry.click();
        const response = await pending, replay = await response.json();
        assert.equal(response.status(), 201); assert.equal(response.headers()["idempotency-replayed"], "true"); assert.equal(replay.idempotentReplay, true);
        assert.deepEqual(replay.images, committed.images, "Photo replay must return exactly the original image identifiers in order");
        await restored.waitFor({ state: "hidden" });
        assert.equal(attempts.length, 2); assert.equal(attempts[1].key, attempts[0].key); assert.equal(attempts[1].listingId, attempts[0].listingId); assert.deepEqual(attempts[1].images, expectedImages);
        assert.equal(listingCreates, 1);
        const listingId = attempts[0].listingId;
        const data = await api(persistent.request, "/api/campus-market");
        const matching = data.listings.filter((item) => item.title === fields.title);
        assert.equal(matching.length, 1); assert.equal(matching[0].id, listingId); assert.equal(matching[0].images.length, 2);
        assert.deepEqual(matching[0].images.map((image) => image.id), committed.images.map((image) => image.id));
        for (let index = 0; index < files.length; index++) {
          const image = await persistent.request.get(new URL(matching[0].images[index].url, base).href);
          assert.equal(image.status(), 200); assert.equal((await image.body()).equals(files[index].buffer), true, `Replayed R2 object bytes/order ${index + 1}`);
        }
        const cleanDialog = await openMarketCreate("listing", processPage);
        assert.equal(await cleanDialog.locator('[name="title"]').inputValue(), "");
        assert.equal(await cleanDialog.locator('[aria-label="Taslak ürün fotoğrafları"] li').count(), 0);
        await cleanDialog.getByRole("button", { name: "Pencereyi kapat", exact: true }).click();
        const removed = await api(persistent.request, "/api/campus-market/images", "DELETE", { id: committed.images[0].id });
        assert.equal(removed.deleted, true);
        const oldAttempt = attempts[1];
        const ended = await persistent.request.post(`${base}/api/campus-market/images`, { headers: { origin: base, "content-type": oldAttempt.contentType, "Idempotency-Key": oldAttempt.key }, data: oldAttempt.body });
        assert.equal(ended.status(), 410, "A deleted photo must end the old upload attempt");
        const afterDelete = await api(persistent.request, "/api/campus-market");
        const remaining = afterDelete.listings.find((item) => item.id === listingId);
        assert.deepEqual(remaining.images.map((image) => image.id), [committed.images[1].id]);
        assert.equal((await persistent.request.get(new URL(committed.images[0].url, base).href)).status(), 404);
        const remainingObject = await persistent.request.get(new URL(committed.images[1].url, base).href);
        assert.equal(remainingObject.status(), 200); assert.equal((await remainingObject.body()).equals(files[1].buffer), true);
        await ready(`/?view=market&listing=${listingId}`, processPage);
        await processPage.getByRole("dialog", { name: "İlan ayrıntısı", exact: true }).getByRole("heading", { name: fields.title, exact: true }).waitFor();
        await screenshot("market-photo-deleted-not-resurrected-320.png", processPage);
        await uiLogout(processPage);
        return { browserProcessRestarted: true, samePrivateIgnoredProfileReopened: true, reloginNeeded, normalUiAuth: true, cookiesOrStorageReadExportedOrInjected: false, realCommitStatus: committed.status, replayStatus: response.status(), replayHeaderAndBodyVerified: true, identicalPhotoKey: true, orderedFileHashes: expectedImages, realR2BytesVerified: true, persistedListings: 1, photoCountAfterReplay: 2, photoCountAfterDeletionAndOldRetry: 1, oldRetryAfterDeletionStatus: ended.status(), removedPhotoGetStatus: 404, automaticResend: false, fabricatedResponses: false, completedDraftCleared: true, recoveryLayouts };
      } finally { if (attempts.length) await firstHandled; if (persistent) await persistent.close(); }
    });
    await run("market durable price fields survive a full reload and publish once", async () => {
      const fields = { placeName: `Sentetik kalıcı mekân ${stamp}`, itemName: `Sentetik kalıcı fiyat ${stamp}`, category: "drink", price: "35.75", observedAt: "", sourceNote: "Yalıtılmış yerel test için sentetik tarihli kaynak notu." };
      await ready("/?view=market");
      const draftDialog = await openMarketCreate("price");
      fields.observedAt = await draftDialog.locator('[name="observedAt"]').inputValue();
      assert.match(fields.observedAt, /^\d{4}-\d{2}-\d{2}$/, "The form must provide a concrete initial calendar date");
      for (const [key, value] of Object.entries(fields)) {
        if (key === "observedAt") continue; // Preserve the unedited default date through storage.
        if (key === "category") await draftDialog.locator(`[name="${key}"]`).selectOption(value);
        else await draftDialog.locator(`[name="${key}"]`).fill(value);
      }
      await marketDraftSaved();
      await ready("/?view=market");
      const restored = await openMarketCreate("price");
      for (const [key, value] of Object.entries(fields)) assert.equal(await restored.locator(`[name="${key}"]`).inputValue(), value, `Restored price ${key}`);
      await screenshot("market-durable-price-restored.png");
      const pending = page.waitForResponse((response) => response.url() === `${base}/api/campus-market` && response.request().method() === "POST");
      await restored.getByRole("button", { name: "Kaydet", exact: true }).click();
      assert.equal((await pending).status(), 201); await restored.waitFor({ state: "hidden" });
      const data = await api(context.request, "/api/campus-market");
      const matching = data.prices.filter((item) => item.itemName === fields.itemName && item.placeName === fields.placeName);
      assert.equal(matching.length, 1); assert.equal(matching[0].latestPriceCents, 3575); assert.equal(matching[0].sourceNote, fields.sourceNote);
      return { fullDocumentReload: true, restoredFieldCount: Object.keys(fields).length, persistedPriceGroups: 1, realPublishStatus: 201, observedAtEdited: false, initialObservedAtPreserved: true, initialObservedAt: fields.observedAt, browserClockAdvanced: false };
    });
    await run("market durable inquiry draft survives reload without automatically sending", async () => {
      const { listing } = await api(context.request, "/api/campus-market", "POST", { action: "listing", kind: "sell", category: "books", title: `Sentetik kalıcı mesaj ilanı ${stamp}`, description: "Yalnızca yalıtılmış yerel iletişim taslağı denemesi.", price: 80, condition: "used-good", meetupPlace: "Sentetik kampüs" });
      const buyer = await account();
      const buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const buyerPage = await buyerContext.newPage(); watchPage(buyerPage);
      const message = `Yalnızca yerel sentetik iletişim taslağı ${stamp}`;
      const openInquiry = async () => {
        await ready("/?view=market", buyerPage);
        const card = buyerPage.locator(".listing-card").filter({ has: buyerPage.getByRole("heading", { name: listing.title, exact: true }) });
        await card.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
        return buyerPage.getByRole("dialog", { name: listing.title, exact: true });
      };
      try {
        await login(buyer, buyerPage);
        const dialog = await openInquiry();
        await dialog.locator('[name="message"]').fill(message);
        await marketDraftSaved(buyerPage);
        const restored = await openInquiry();
        assert.equal(await restored.locator('[name="message"]').inputValue(), message);
        const before = await api(buyerContext.request, "/api/campus-market");
        assert.equal(before.inquiries.filter((item) => item.listingId === listing.id).length, 0, "Reload must not automatically send a draft");
        await screenshot("market-durable-inquiry-restored.png", buyerPage);
        const pending = buyerPage.waitForResponse((response) => response.url() === `${base}/api/campus-market` && response.request().method() === "POST");
        await restored.getByRole("button", { name: "Mesaj gönder", exact: true }).click();
        assert.equal((await pending).status(), 201); await restored.waitFor({ state: "hidden" });
        const after = await api(buyerContext.request, "/api/campus-market");
        assert.equal(after.inquiries.filter((item) => item.listingId === listing.id && item.message === message).length, 1);
        await uiLogout(buyerPage);
        return { fullDocumentReload: true, messagePreserved: true, automaticSend: false, realPublishStatus: 201, syntheticRecipientOnly: true, persistedMessages: 1 };
      } finally { await buyerContext.close(); }
    });
    await run("market durable explicit logout and account switch expose no private local draft", async () => {
      const privateTitle = `Sentetik özel çıkış taslağı ${stamp}`;
      await ready("/?view=market");
      const dialog = await openMarketCreate();
      await dialog.locator('[name="title"]').fill(privateTitle);
      await dialog.locator('[name="description"]').fill("Yalnızca yerel özel taslak; hiçbir zaman yayımlanmayacak.");
      await dialog.locator('input[name="images"]').setInputFiles([{ name: "qa-private-draft.png", mimeType: "image/png", buffer: syntheticPng([200, 80, 60]) }]);
      await marketDraftSaved();
      await uiLogout();
      const secondOwner = await account();
      await login(secondOwner);
      await ready("/?view=market");
      const clean = await openMarketCreate();
      assert.equal(await clean.locator('[name="title"]').inputValue(), "");
      assert.equal(await clean.locator('[name="description"]').inputValue(), "");
      assert.equal(await clean.locator('[aria-label="Taslak ürün fotoğrafları"] li').count(), 0);
      assert.equal(await page.getByText(privateTitle, { exact: true }).count(), 0);
      await screenshot("market-durable-owner-swap-empty.png");
      await uiLogout(); await login(owner);
      await ready("/?view=market");
      const returned = await openMarketCreate();
      assert.equal(await returned.locator('[name="title"]').inputValue(), "");
      assert.equal(await returned.locator('[aria-label="Taslak ürün fotoğrafları"] li').count(), 0);
      await returned.getByRole("button", { name: "Pencereyi kapat", exact: true }).click();
      const data = await api(context.request, "/api/campus-market");
      assert.equal(data.listings.filter((item) => item.title === privateTitle).length, 0);
      return { explicitUiLogout: true, otherAccountFieldsEmpty: true, otherAccountFilesEmpty: true, originalOwnerReloginEmpty: true, privateDraftNeverPublished: true, storageReadOrInjected: false };
    });
    await run("real community event resolves its parent and selects events", async () => {
      const { community } = await api(context.request, "/api/communities", "POST", { name: `Sentetik topluluk ${stamp}`, description: "Yalnızca yalıtılmış yerel kalite kontrol topluluğu.", category: "akademik", joinPolicy: "open", rules: "Sentetik yerel deneme." });
      const { event } = await api(context.request, "/api/community-events", "POST", { communityId: community.id, title: `Sentetik topluluk etkinliği ${stamp}`, description: "Yalnızca yalıtılmış yerel kalite kontrol buluşması.", location: "Sentetik kampüs", startsAt: new Date(Date.now() + 86400000).toISOString() });
      await ready(`/?view=communities&communityEvent=${event.id}`);
      const hub = page.getByRole("dialog", { name: community.name, exact: true });
      await hub.getByRole("heading", { name: community.name, exact: true }).waitFor();
      await hub.getByRole("heading", { name: event.title, exact: true }).waitFor();
      await screenshot("community-event-target.png");
      return { parentResolved: true, eventVisible: true };
    });
    await run("real DM message ID resolves its isolated recipient thread", async () => {
      peer = await account();
      const data = await api(context.request, "/api/messages", "POST", { recipientId: peer.profile.publicId, body: `Sentetik yerel mesaj ${stamp}`, clientMessageKey: `qa_${randomUUID().replaceAll("-", "")}` });
      await ready(`/?view=messages&message=${data.message.id}`);
      await page.getByLabel("Bağlantıdaki mesaj", { exact: true }).waitFor();
      assert.match(await page.getByLabel("Bağlantıdaki mesaj", { exact: true }).innerText(), /Sentetik yerel mesaj/);
      await screenshot("message-target.png");
      return { exactMessage: true, syntheticRecipientOnly: true };
    });
    await run("real comment notification opens an older exact comment and rechecks its removal on Forward", async () => {
      assert.ok(publishedPost?.id && peer, "Synthetic author post and peer account are required");
      const peerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const peerPage = await peerContext.newPage(); watchPage(peerPage);
      try {
        await login(peer, peerPage);
        const { comment } = await api(peerContext.request, "/api/post-actions", "POST", { type: "comment", postId: publishedPost.id, content: `Sentetik hedef yorum ${stamp}` });
        // created_at has second resolution; make the selected comment definitely older.
        await page.waitForTimeout(1100);
        for (let index = 0; index < 24; index++) await api(peerContext.request, "/api/post-actions", "POST", { type: "comment", postId: publishedPost.id, content: `Sentetik sonraki yorum ${index} ${stamp}` });
        const latest = await api(context.request, `/api/comments?postId=${publishedPost.id}`);
        assert.equal(latest.comments.length, 20); assert.equal(latest.comments.some((item) => item.id === comment.id), false);
        const notifications = await api(context.request, "/api/notifications");
        assert.ok(notifications.notifications.some((item) => item.entityType === "comment" && item.entityId === comment.id));
        await ready("/?view=notifications");
        await page.locator(`.notice-open[href="/?view=feed&comment=${comment.id}"]`).click();
        const dialog = page.getByRole("dialog", { name: "Yorum", exact: true });
        const focused = dialog.getByRole("article", { name: "Bağlantıdaki yorum", exact: true });
        await focused.waitFor();
        assert.match(await focused.innerText(), new RegExp(`Sentetik hedef yorum ${stamp}`));
        await page.waitForFunction((id) => document.activeElement?.getAttribute("data-comment-id") === id, comment.id);
        assert.equal(await dialog.locator(`[data-comment-id="${comment.id}"]`).count(), 1);
        assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
        await screenshot("comment-target.png");
        await page.goBack(); await dialog.waitFor({ state: "hidden" });
        assert.equal(new URL(page.url()).searchParams.get("view"), "notifications");
        await page.goForward(); await focused.waitFor();
        await api(peerContext.request, "/api/comments", "DELETE", { id: comment.id });
        await page.goBack(); await page.goForward();
        await dialog.getByRole("alert").waitFor();
        assert.equal(await dialog.locator(`[data-comment-id="${comment.id}"]`).count(), 0);
        assert.equal(await dialog.locator(".post-card").count(), 0);
        await screenshot("comment-target-removed.png");
        await dialog.getByRole("button", { name: "Yorumu kapat", exact: true }).click();
        await api(peerContext.request, "/api/auth/session", "DELETE");
        return { source: "Actual notification UI anchor", createdComments: 25, newestPageSize: 20, targetOutsideNewestPage: true, focusedWithoutKeyboard: true, backForward: true, removedTargetRevalidated: true };
      } finally { await peerContext.close(); }
    });
  }
  await run("logout returns 401 and login through UI restores own account", async () => {
    await api(context.request, "/api/auth/session", "DELETE");
    assert.equal((await context.request.get(`${base}/api/profile`)).status(), 401);
    await login(owner); return { afterLogout: 401, uiRelogin: true };
  });
  if (phase === "final" && publishedPost) await run("normal account switch refuses another campus private media", async () => {
    outsider = await account(true);
    const url = publishedPost.media[0].url;
    assert.equal((await context.request.get(`${base}${url}`)).status(), 200);
    await api(context.request, "/api/auth/session", "DELETE"); await login(outsider);
    const response = await context.request.get(`${base}${url}`); assert.ok([403, 404].includes(response.status()), `Private media returned ${response.status()}`);
    await ready(`/?post=${publishedPost.id}`); assert.equal(await page.getByText(`Sentetik sıralı fotoğraf kontrolü ${stamp}`, { exact: true }).count(), 0);
    return { otherCampusMediaStatus: response.status(), stalePostAbsent: true };
  });
} catch (error) {
  results.cases.push({ name: "harness completion", pass: false, error: clean(error.message).slice(0, 1200) });
} finally {
  results.cases.push({ name: "production assets and non-injected network requests load", pass: results.assetFailures.length === 0 && results.failedRequests.length === 0, evidence: { assetFailureCount: results.assetFailures.length, unexpectedFailedRequestCount: results.failedRequests.length } });
  results.completedAt = new Date().toISOString();
  if (only) results.caseFilter = only;
  results.pass = results.cases.every((item) => item.pass) && results.pageErrors.length === 0;
  results.summary = { passed: results.cases.filter((item) => item.pass).length, failed: results.cases.filter((item) => !item.pass).length, screens: results.screens.length, consoleErrors: results.consoleErrors.length, pageErrors: results.pageErrors.length };
  await writeFile(path.join(output, "report.json"), JSON.stringify(results, null, 2));
  await browser.close();
  console.log(JSON.stringify({ phase, report: path.join(output, "report.json"), ...results.summary }));
  process.exitCode = results.pass ? 0 : 1;
}
