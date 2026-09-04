import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const marketSource = await readFile(new URL("../app/campus-market.tsx", import.meta.url), "utf8");

test("mobile shell keeps five stable primary actions", () => {
  const nav = pageSource.match(/<nav className="mobile-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
  assert.ok(nav, "mobile navigation must exist");
  assert.equal((nav.match(/<button/g) ?? []).length, 5);
  for (const label of ["Akış", "Keşfet", "Oluştur", "Kampüs Anlık", "Tüm alanlar"]) {
    assert.match(nav, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(nav, /navItems\.map/);
});

test("mobile menu exposes the complete secondary product surface", () => {
  for (const label of ["Eşleş", "Kampüs", "Kütüphane", "Pazar", "Notlar", "Topluluklar", "Bildirimler", "Kaydedilenler", "Güvenlik"]) {
    assert.match(pageSource, new RegExp(`label: "${label}"`));
  }
  assert.match(pageSource, /mobileMenuItems\.map/);
  assert.match(pageSource, /onClick=\{\(\) => navigateTo\("Profil"\)\}/);
});

test("mobile create sheet routes to real product flows", () => {
  for (const label of ["Gönderi paylaş", "Kampüs Anlık", "Not yükle", "İlan ver"]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /function openFeedComposer\(\)/);
  assert.match(pageSource, /role="dialog" aria-modal="true"/);
});

test("mobile home exposes the real campus-live social surface", () => {
  for (const label of ["Kampüsünde şimdi", "Kütüphane", "Yemekhane", "Etkinlik", "Bu bilgi hâlâ güncel mi?"]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /fetch\("\/api\/campus-pulse\?kind=live"/);
  assert.match(pageSource, /action: "react", id: item\.id, reaction/);
  assert.match(pageSource, /Canlı veri yok/);
  assert.match(cssSource, /\.campus-live-home/);
  assert.match(cssSource, /\.feed-tabs>button:nth-child\(3\) \{ display:block; \}/);
});

test("cafeteria shortcut opens campus prices instead of the student store", () => {
  assert.match(pageSource, /title: "Yemekhane", route: "Pazar"[^\n]+marketTab: "prices"/);
  assert.match(pageSource, /onNavigate\(route, marketTab\)/);
  assert.match(pageSource, /if \(name === "Pazar"\) setMarketTab\(targetMarketTab \?\? "store"\)/);
  assert.match(pageSource, /key=\{marketTab\}[^>]+initialTab=\{marketTab\}/);
  assert.match(marketSource, /useState<CampusMarketTab>\(initialTab\)/);
});

test("mobile layout protects touch, safe-area and reduced-motion behavior", () => {
  assert.match(cssSource, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(cssSource, /min-height:56px/);
  assert.match(cssSource, /env\(safe-area-inset-bottom\)/);
  assert.match(cssSource, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(cssSource.match(/\.mobile-nav \{[^}]+\}/)?.[0] ?? "", /overflow-x:auto/);
});
