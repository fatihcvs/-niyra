import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../.."), base = "http://127.0.0.1:5193";
const output = path.join(root, "exports/beta-intake-qa", String(Date.now())); await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url), { chromium } = require("C:/Users/fatih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const student = await browser.newContext({ viewport: { width: 390, height: 844 } }), staff = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const caseId = randomUUID().slice(0, 8), studentLabel = `Sentetik Beta Öğrencisi ${caseId}`, feedbackTitle = `Sentetik not yükleme sorunu ${caseId}`;
const report = { origin: base, mockedTransport: false, cases: [], errors: [], screenshots: [] };
const page = await student.newPage(), admin = await staff.newPage();
for (const view of [page, admin]) view.on("pageerror", error => report.errors.push(error.message.slice(0, 200)));
const api = async (context, route, body) => { const response = await context.request.post(`${base}${route}`, { headers: { origin: base }, data: body }); const result = await response.json(); assert.ok(response.ok(), `${route}: ${response.status()} ${result.error ?? ""}`); return result; };
async function run(name, fn) { await fn(); report.cases.push({ name, passed: true }); console.log(`PASS ${name}`); }
async function screen(view, name) { await view.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)); const dimensions = await view.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })); assert.ok(dimensions.scrollWidth <= dimensions.width, `Horizontal overflow: ${name}`); const file = path.join(output, `${name}.png`); await view.screenshot({ path: file, fullPage: true }); report.screenshots.push({ name, ...dimensions }); }
let trackingUrl;
try {
  const credentialsFile = path.join(root, "exports/beta-intake-qa/synthetic-staff.json");
  let credentials;
  try { credentials = JSON.parse(await readFile(credentialsFile, "utf8")); } catch { credentials = { password: `QA!${randomUUID()}Aa7` }; }
  let session = await staff.request.post(`${base}/api/staff/session`, { headers: { origin: base }, data: { username: "admin", password: credentials.password } });
  if (session.status() === 401) {
    await api(staff, "/api/staff/session", { username: "admin", password: "admin123" });
    await api(staff, "/api/staff/password", { currentPassword: "admin123", newPassword: credentials.password });
    await writeFile(credentialsFile, JSON.stringify(credentials));
  } else assert.ok(session.ok(), "Synthetic staff login failed");
  await run("mobile landing opens application and real submission returns private receipt", async () => {
    await page.goto(`${base}/beta`); await page.getByRole("link", { name: "Test için başvur" }).click();
    await page.getByLabel("Adın (isteğe bağlı)").fill(studentLabel);
    await page.getByLabel("Google Play hesabının e-postası").fill(`beta.qa.${randomUUID()}@example.invalid`);
    await page.getByLabel("Cihaz modeli", { exact: true }).fill("Sentetik Android telefon");
    await page.getByRole("checkbox", { name: "18 yaşında veya üzerindeyim." }).check();
    await page.getByRole("checkbox", { name: /Android telefon veya tabletim var/ }).check();
    await page.getByRole("checkbox", { name: /14 gün boyunca/ }).check();
    await page.getByRole("checkbox", { name: /Bilgilerimin bu başvuruyu/ }).check();
    await screen(page, "application-mobile");
    await page.getByRole("button", { name: "Başvurumu gönder" }).click();
    await page.getByRole("heading", { name: "Başvurunu aldık." }).waitFor();
    trackingUrl = await page.getByRole("link", { name: "Durumumu ve yanıtları gör" }).getAttribute("href");
    assert.match(trackingUrl, /^\/beta\/takip#[\w-]{43}$/);
    await page.getByRole("link", { name: "Durumumu ve yanıtları gör" }).click();
    await page.getByRole("button", { name: "Durumumu göster" }).click();
    await page.getByText("Android kapalı test başvurusu", { exact: true }).waitFor();
  });
  await run("owner UI reviews a real request and its public reply appears on the private tracking page", async () => {
    await admin.goto(`${base}/owner?tab=beta`);
    await admin.getByRole("heading", { name: "Test başvuruları ve geri bildirimler" }).waitFor();
    const card = admin.locator("article").filter({ hasText: studentLabel }).first();
    await card.getByRole("button", { name: "İncele ve yanıtla" }).click();
    const detail = admin.getByRole("region", { name: "Başvuru incelemesi" });
    await detail.getByLabel("Yeni durum").selectOption("ready");
    await detail.getByLabel("Ekip notu — yalnız yönetim").fill("Sentetik özel ekip notu");
    await detail.getByLabel("Başvurana yanıt — takip sayfasında görünür").fill("Başvurunu inceledik. Test erişimi için sıradasın.");
    await detail.getByRole("button", { name: "Durumu ve yanıtı kaydet" }).click();
    await admin.locator("article").filter({ hasText: studentLabel }).first().getByText("Test erişimi için sırada", { exact: true }).waitFor();
    await screen(admin, "admin-desktop");
    await page.getByRole("button", { name: "Durumumu göster" }).click();
    await page.getByText("Başvurunu inceledik. Test erişimi için sıradasın.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Sentetik özel ekip notu").count(), 0);
    await page.getByLabel("Ek bilgi veya yanıtın").fill("Sentetik ek bilgi: cihaz sürümü Android 14.");
    await page.getByRole("button", { name: "Mesajımı gönder" }).click();
    await page.getByText("Sentetik ek bilgi: cihaz sürümü Android 14.", { exact: true }).waitFor();
    await screen(page, "tracking-mobile");
  });
  await run("anonymous feedback receives a separate trackable ticket", async () => {
    await page.goto(`${base}/geri-bildirim`);
    await page.getByLabel("Kısaca konu").fill(feedbackTitle);
    await page.getByLabel("Bize anlat", { exact: true }).fill("Sentetik deneme: not seçildikten sonra yükleme tamamlanmıyor.");
    await page.getByRole("checkbox", { name: /Bilgilerimin bu talebi/ }).check();
    await page.getByRole("button", { name: "Geri bildirimi gönder" }).click();
    await page.getByRole("heading", { name: "Geri bildirimin kaydedildi." }).waitFor();
    await admin.getByLabel("Kayıt türü").selectOption("feedback");
    await admin.getByRole("heading", { name: feedbackTitle }).waitFor();
    await admin.setViewportSize({ width: 390, height: 844 }); await screen(admin, "admin-mobile");
  });
  await run("withdrawal removes a submitted application's personal text and prevents new replies", async () => {
    await page.goto(`${base}${trackingUrl}`); await page.getByRole("button", { name: "Durumumu göster" }).click();
    await page.getByText("Başvurudan ayrıl", { exact: true }).click();
    await page.getByRole("checkbox", { name: /Bu talebi kapatıp/ }).check();
    await page.getByRole("button", { name: "Talebi kapat" }).click();
    await page.getByText("Başvurudan ayrıldın", { exact: true }).waitFor();
    assert.equal(await page.getByText("Sentetik ek bilgi: cihaz sürümü Android 14.", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Mesajımı gönder" }).count(), 0);
  });
  assert.deepEqual(report.errors, []);
} catch (error) { report.failure = error.message.replace(/#[A-Za-z0-9_-]{43}/g, "#[private-code]").slice(0, 500); await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {}); process.exitCode = 1; console.log(`FAIL ${report.failure}`); }
finally { await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); await browser.close(); console.log(`Report: ${output}`); }
