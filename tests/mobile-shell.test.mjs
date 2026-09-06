import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (file.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
  if (cache.has(file)) return cache.get(file).exports;
  const testModule = { exports: {} };
  cache.set(file, testModule);
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: testModule, exports: testModule.exports, URL, URLSearchParams, console, require: (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const target = path.resolve(path.dirname(file), specifier);
    const resolved = [target, `${target}.tsx`, `${target}.ts`].find(existsSync);
    assert.ok(resolved, `Missing module ${specifier}`);
    return load(resolved);
  } });
  return testModule.exports;
}

const { MobileNavigation, MobileCampusHub, MobileAccountLinks, MobileHeader, MobilePostComposer } = load("app/mobile-app.tsx");
const labels = ["Akış", "Keşfet", "Paylaş", "Mesajlar", "Profil"];
const noop = () => {};
function elements(node, predicate) {
  return Children.toArray(node).flatMap((child) => isValidElement(child)
    ? [...(predicate(child) ? [child] : []), ...elements(child.props.children, predicate)]
    : []);
}
function textOf(node) {
  return Children.toArray(node).map((child) => isValidElement(child) ? textOf(child.props.children) : String(child)).join("");
}
function navigation(active, overrides = {}) {
  return MobileNavigation({ active, onNavigate: noop, onCompose: noop, initials: "DE", unread: 0, ...overrides });
}
function composer(overrides = {}) {
  return renderToStaticMarkup(createElement(MobilePostComposer, {
    draft: "", onDraftChange: noop, audience: "platform", onAudienceChange: noop,
    name: "Deniz", initials: "DE", media: null, mediaUrl: "", onMediaChange: noop,
    onRemoveMedia: noop, onClose: noop, onPublish: noop, onNavigate: noop,
    publishing: false, error: "", ...overrides,
  }));
}

test("mobile navigation renders exactly five named destinations in the accepted order", () => {
  const tree = navigation("Akış");
  const buttons = elements(tree, (element) => element.type === "button");
  assert.equal(tree.type, "nav");
  assert.equal(tree.props["aria-label"], "Mobil gezinme");
  assert.deepEqual(buttons.map((button) => button.props["aria-label"]), labels);
  assert.equal(buttons.filter((button) => button.props["aria-current"] === "page").length, 1);
  const html = renderToStaticMarkup(tree);
  for (const label of labels) assert.ok(html.includes('aria-label="' + label + '"'));
  assert.doesNotMatch(html, /Tüm alanlar|>Menü<|>Oluştur</);
});

test("Paylaş invokes the composer immediately while other navigation targets stay independent", () => {
  const navigated = [];
  let composerOpened = 0;
  const buttons = elements(navigation("Keşfet", {
    onNavigate: (destination) => navigated.push(destination),
    onCompose: () => { composerOpened += 1; },
  }), (element) => element.type === "button");
  buttons[2].props.onClick();
  assert.equal(composerOpened, 1);
  assert.deepEqual(navigated, [], "opening the composer must not first navigate to another workspace");
  for (const index of [0, 1, 3, 4]) buttons[index].props.onClick();
  assert.deepEqual(navigated, ["Akış", "Keşfet", "Mesajlar", "Profil"]);
});

test("secondary screens retain the correct single selected bottom navigation parent", () => {
  for (const [active, parent] of [
    ["Notlar", "Keşfet"], ["Kampüs Anlık", "Keşfet"], ["Kütüphane", "Keşfet"],
    ["Güvenlik", "Profil"], ["Kaydedilenler", "Profil"], ["Ayarlar", "Profil"],
    ["Mesajlar", "Mesajlar"], ["Bildirimler", "Akış"],
  ]) {
    const buttons = elements(navigation(active), (element) => element.type === "button");
    const selected = buttons.filter((button) => button.props["aria-current"] === "page");
    assert.equal(selected.length, 1, active);
    assert.equal(selected[0].props["aria-label"], parent, active);
    assert.equal(buttons[2].props["aria-current"], undefined, "Paylaş is an action, not a selected page");
  }
});

test("message badges keep the exact unread count accessible while capping the visual badge", () => {
  const html = renderToStaticMarkup(navigation("Mesajlar", { unread: 128 }));
  assert.match(html, /aria-label="128 okunmamış mesaj">99\+/);
  assert.doesNotMatch(renderToStaticMarkup(navigation("Mesajlar")), /app-mobile-badge/);
});

test("Keşfet campus shortcuts expose all seven real destinations and dispatch each one", () => {
  const expected = ["Notlar", "Topluluklar", "Kampüs Anlık", "Kütüphane", "Kampüs", "Pazar", "Eşleş"];
  const navigated = [];
  const tree = MobileCampusHub({ university: "ODTÜ", onNavigate: (name) => navigated.push(name) });
  const buttons = elements(tree, (element) => element.type === "button");
  assert.deepEqual(buttons.map((button) => button.props["aria-label"]), expected);
  assert.deepEqual(buttons.map((button) => textOf(elements(button.props.children, (element) => element.type === "strong")[0]?.props.children)), expected);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(navigated, expected);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-label="Kampüs bölümleri"/);
  assert.match(html, /<p>ODTÜ<\/p>/);
});

test("account settings shortcuts preserve saved content and safety without duplicating settings", () => {
  const navigated = [];
  const tree = MobileAccountLinks({ onNavigate: (name) => navigated.push(name) });
  const buttons = elements(tree, (element) => element.type === "button");
  assert.deepEqual(buttons.map((button) => textOf(button.props.children)), ["Kaydedilenler", "Güvenlik"]);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(navigated, ["Kaydedilenler", "Güvenlik"]);
  const profileHeader = MobileHeader({ active: "Profil", onBack: noop, onNavigate: (name) => navigated.push(name) });
  const settings = elements(profileHeader, (element) => element.type === "button" && element.props["aria-label"] === "Ayarlar");
  assert.equal(settings.length, 1, "profile should retain one direct settings entry");
  settings[0].props.onClick();
  assert.equal(navigated.at(-1), "Ayarlar");
});

test("only shell-owned detail headers render here, workspaces and messages own their headers", () => {
  let backCount = 0;
  const tree = MobileHeader({ active: "Öğrenci", onBack: () => { backCount += 1; }, onNavigate: noop });
  assert.deepEqual(elements(tree, (element) => element.type === "h1").map((heading) => textOf(heading.props.children)), ["Öğrenci"]);
  const back = elements(tree, (element) => element.type === "button" && element.props["aria-label"] === "Geri dön");
  assert.equal(back.length, 1);
  back[0].props.onClick();
  assert.equal(backCount, 1);
  for (const active of ["Akış", "Keşfet", "Profil"]) {
    assert.equal(elements(MobileHeader({ active, onBack: noop, onNavigate: noop }), (element) => element.type === "button" && element.props["aria-label"] === "Geri dön").length, 0, active);
  }
  assert.equal(MobileHeader({ active: "Mesajlar", onBack: noop, onNavigate: noop }), null);
  for (const active of ["Notlar", "Topluluklar", "Kampüs", "Kampüs Anlık", "Pazar", "Kütüphane", "Eşleş", "Bildirimler", "Kaydedilenler", "Güvenlik", "Ayarlar"]) assert.equal(MobileHeader({ active, onBack: noop, onNavigate: noop }), null, active);
});

test("full-screen composer renders a named dialog with real text and attachment controls", () => {
  const html = composer();
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="app-post-composer-title"/);
  assert.match(html, /id="app-post-composer-title">Yeni gönderi/);
  assert.match(html, /<label class="sr-only" for="app-post-draft">Gönderin<\/label>/);
  assert.match(html, /<textarea[^>]+id="app-post-draft"/);
  assert.match(html, /aria-label="Gönderiyi kapat"/);
  assert.match(html, /type="file" accept="image\/png,image\/jpeg,image\/webp" multiple=""/);
  assert.match(html, /type="file" accept="video\/mp4,video\/webm"/);
  assert.equal((html.match(/class="app-post-composer"/g) ?? []).length, 1);
});

test("composer publishing rules allow text or media and block empty or in-flight posts", () => {
  const publishButton = (html) => html.match(/<button\b[^>]*class="app-post-publish"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(publishButton(composer({ draft: "   " })), /disabled=""/);
  assert.doesNotMatch(publishButton(composer({ draft: "Kampüsten merhaba" })), /disabled=/);
  assert.doesNotMatch(publishButton(composer({ media: { name: "kampus.png", type: "image/png" } })), /disabled=/);
  const busy = composer({ draft: "Kampüsten merhaba", publishing: true });
  assert.match(publishButton(busy), /disabled=""/);
  assert.match(publishButton(busy), /Paylaşılıyor/);
  assert.match(busy, /<textarea[^>]*disabled=""/);
});

test("course composer keeps its audience locked and preserves visible errors", () => {
  const html = composer({ courseName: "MAT 101", audience: "campus", draft: "Çalışma grubu", error: "Bağlantı kurulamadı." });
  assert.match(html, /<select disabled=""/);
  assert.match(html, /<option value="campus" selected="">Kampüsüm<\/option>/);
  assert.match(html, /class="app-post-course">MAT 101/);
  assert.match(html, /role="alert">Bağlantı kurulamadı\./);
});
