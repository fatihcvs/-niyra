import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../app/mobile-runtime.tsx", import.meta.url), "utf8"), { fileName: "mobile-runtime.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type) { for (const callback of listeners.get(type) ?? []) callback(); },
  };
}
function harness({ visualViewport = true } = {}) {
  const writes = [];
  const frames = new Map();
  let sequence = 0;
  class Element {
    constructor(tagName, type = "text") { this.tagName = tagName; this.type = type; this.isContentEditable = false; }
    getAttribute(name) { return name === "type" ? this.type : null; }
  }
  const viewport = Object.assign(target(), { height: 800, offsetTop: 0, scale: 1 });
  const window = Object.assign(target(), {
    innerWidth: 390, innerHeight: 800, visualViewport: visualViewport ? viewport : undefined,
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const document = Object.assign(target(), {
    activeElement: new Element("BODY"),
    documentElement: {
      style: { setProperty: (name, value) => writes.push([name, value]) },
      dataset: new Proxy({}, { set(object, name, value) { writes.push([name, value]); object[name] = value; return true; } }),
    },
  });
  const exports = {};
  runInNewContext(source, { exports, window, document, HTMLElement: Element, require: () => ({ useEffect: () => {} }) });
  return {
    window, document, viewport, writes, frames, Element,
    start: () => exports.observeMobileViewport(),
    flush() { const batch = [...frames.values()]; frames.clear(); batch.forEach((callback) => callback()); },
  };
}

test("viewport resize and scroll bursts share one frame and unchanged values do not rewrite root styles", () => {
  const app = harness();
  const cleanup = app.start();
  assert.equal(app.writes.length, 3);
  app.viewport.height = 720;
  app.viewport.offsetTop = 12;
  for (let index = 0; index < 50; index++) { app.viewport.emit("resize"); app.viewport.emit("scroll"); app.window.emit("resize"); }
  assert.equal(app.frames.size, 1);
  assert.equal(app.writes.length, 3);
  app.flush();
  assert.deepEqual(app.writes.slice(3), [["--app-viewport-height", "720px"], ["--app-viewport-top", "12px"]]);
  app.viewport.emit("scroll"); app.flush();
  assert.equal(app.writes.length, 5);
  cleanup();
});

test("keyboard detection covers resizes-content without mistaking browser chrome or pinch zoom for a keyboard", () => {
  const app = harness();
  app.start();
  app.viewport.height = 710; app.viewport.emit("resize"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "false");
  app.document.activeElement = new app.Element("TEXTAREA");
  app.document.emit("focusin");
  app.window.innerHeight = 470; app.viewport.height = 470;
  app.viewport.emit("resize"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "true", "layout and visual viewport shrink together");
  app.viewport.scale = 2; app.viewport.height = 235;
  app.viewport.emit("resize"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "false", "zoom is not keyboard input");
  app.viewport.scale = 1;
  app.document.activeElement = new app.Element("BODY"); app.document.emit("focusout"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "false");
});

test("orientation changes reset the baseline and non-text controls never trigger keyboard state", () => {
  const app = harness();
  app.start();
  app.window.innerWidth = 844; app.window.innerHeight = 390; app.viewport.height = 390;
  app.document.activeElement = new app.Element("INPUT", "checkbox");
  app.window.emit("resize"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "false");
  app.document.activeElement = new app.Element("INPUT", "search");
  app.document.emit("focusin"); app.flush();
  assert.equal(app.document.documentElement.dataset.keyboardOpen, "false", "old portrait height must not survive orientation change");
});

test("fallback viewport and cleanup preserve sizing without leaving a frame or listeners behind", () => {
  const app = harness({ visualViewport: false });
  const cleanup = app.start();
  app.window.innerHeight = 740;
  app.window.emit("resize");
  assert.equal(app.frames.size, 1);
  cleanup();
  assert.equal(app.frames.size, 0);
  app.flush();
  assert.equal(app.writes.length, 3);
  for (const surface of [app.window, app.document]) for (const callbacks of surface.listeners.values()) assert.equal(callbacks.size, 0);
});
