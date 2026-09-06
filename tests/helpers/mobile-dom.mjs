import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { act, createElement as h } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const tooling = createRequire(new URL("../../scripts/mobile-quality/package.json", import.meta.url));
// Deliberately throws if npm ci --prefix scripts/mobile-quality has not run.
const { JSDOM } = tooling("jsdom");
const project = path.resolve(import.meta.dirname, "../..");

/** Real ReactDOM and browser-history semantics; geometry and native inert are not device evidence. */
export async function createMobileDom({ width = 390, view = "campus", modules = {}, packages = {}, timers = {}, environment = "development", fetch = async () => { throw new Error("Unexpected network request in DOM test"); } } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><button id='outside'>Outside</button><div id='test-root'></div><nav id='bottom-nav'>Navigation</nav></body></html>", { url: `http://localhost/?view=${view}`, pretendToBeVisual: true });
  const { window } = dom;
  const globalKeys = ["window", "document", "Node", "HTMLElement", "MouseEvent", "KeyboardEvent", "Event", "PopStateEvent", "FormData", "navigator", "IS_REACT_ACT_ENVIRONMENT"];
  const previousGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globalKeys.slice(0, -2)) globalThis[key] = window[key];
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const mediaListeners = new Set();
  window.matchMedia = () => ({ get matches() { return width <= 780; }, media: "(max-width: 780px)", addEventListener: (_type, fn) => mediaListeners.add(fn), removeEventListener: (_type, fn) => mediaListeners.delete(fn) });
  // jsdom has no layout engine or native inert reflection. Keep focus tests explicit and deterministic.
  Object.defineProperty(window.HTMLElement.prototype, "inert", { configurable: true, get() { return this.hasAttribute("inert"); }, set(value) { this.toggleAttribute("inert", value); } });
  window.HTMLElement.prototype.getClientRects = function () { return this.isConnected && !this.closest("[hidden]") ? [{ width: 10, height: 10 }] : []; };
  const { createRoot } = await import("react-dom/client");
  const host = window.document.getElementById("test-root");
  const root = createRoot(host);
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(project, relative);
    const key = path.relative(project, file).split(path.sep).join("/");
    if (key in modules) return modules[key];
    if (file.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, window, document: window.document, navigator: window.navigator, PopStateEvent: window.PopStateEvent, Node: window.Node, HTMLElement: window.HTMLElement, FormData: window.FormData, File, Blob, DOMException: window.DOMException, AbortController, URL, URLSearchParams, btoa: window.btoa.bind(window), atob: window.atob.bind(window), Error, console, fetch, setTimeout: timers.setTimeout ?? setTimeout, clearTimeout: timers.clearTimeout ?? clearTimeout, process: { env: { NODE_ENV: environment } }, require: (specifier) => {
      if (specifier in packages) return packages[specifier];
      if (specifier === "next/image") return { __esModule: true, default: (props) => { const attributes = { ...props }; for (const key of ["unoptimized", "loader", "fill", "priority"]) delete attributes[key]; return h("img", attributes); } };
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return require(specifier);
      const base = specifier.startsWith("@/") ? path.resolve(project, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const resolved = [base, `${base}.tsx`, `${base}.ts`].find(existsSync);
      assert.ok(resolved, `Missing local import: ${specifier}`);
      return load(resolved);
    } });
    return loadedModule.exports;
  }
  return {
    window, document: window.document, host, load,
    render: async (node) => { await act(async () => root.render(node)); },
    click: async (element) => { assert.ok(element, "Expected a DOM control"); await act(async () => { element.focus(); element.click(); }); },
    key: async (key, options = {}) => { await act(async () => { window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); if (key === "Escape") await new Promise((resolve) => setTimeout(resolve, 35)); }); },
    fill: async (element, value) => { assert.ok(element, "Expected a DOM input"); await act(async () => { const prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value); element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); },
    travel: async (direction) => { await act(async () => { window.history[direction](); await new Promise((resolve) => setTimeout(resolve, 35)); }); },
    resize: async (nextWidth) => { width = nextWidth; await act(async () => { for (const listener of mediaListeners) listener(); }); },
    close: async () => { try { await act(async () => root.unmount()); } finally { dom.window.close(); for (const [key, descriptor] of previousGlobals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } },
  };
}
