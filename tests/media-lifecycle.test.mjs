import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("leaving the viewport, backgrounding and unmounting pause video without autoplaying on return", () => {
  const callbacks = new Map(), observed = [];
  let observerCallback, disconnected = false, pauses = 0;
  const video = { paused: false, pause() { pauses++; this.paused = true; } };
  const document = { visibilityState: "visible", addEventListener: (id, fn) => callbacks.set(id, fn), removeEventListener: (id) => callbacks.delete(id) };
  const window = { addEventListener: (id, fn) => callbacks.set(id, fn), removeEventListener: (id) => callbacks.delete(id) };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../lib/media-lifecycle.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, document, window, IntersectionObserver: class { constructor(fn) { observerCallback = fn; } observe(target) { observed.push(target); } disconnect() { disconnected = true; } } });
  const cleanup = exports.observeMediaPlayback({ querySelectorAll: () => [video] });
  assert.equal(observed[0], video);
  observerCallback([{ target: video, isIntersecting: false }]); assert.equal(pauses, 1);
  observerCallback([{ target: video, isIntersecting: true }]); assert.equal(video.paused, true);
  video.paused = false; document.visibilityState = "hidden"; callbacks.get("visibilitychange")(); assert.equal(pauses, 2);
  document.visibilityState = "visible"; callbacks.get("visibilitychange")(); assert.equal(video.paused, true);
  video.paused = false; cleanup(); assert.equal(pauses, 3);
  assert.equal(disconnected, true); assert.equal(callbacks.size, 0);
});

test("retry replacement videos are observed and removed playback is stopped", () => {
  const watched = new Set(); let changed, clean = false, list = [];
  const video = () => ({ paused: false, pause() { this.paused = true; } });
  const original = video(), retry = video(); list = [original];
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../lib/media-lifecycle.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports,
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }, window: { addEventListener() {}, removeEventListener() {} },
    IntersectionObserver: class { observe(v) { watched.add(v); } unobserve(v) { watched.delete(v); } disconnect() { watched.clear(); } },
    MutationObserver: class { constructor(fn) { changed = fn; } observe() {} disconnect() { clean = true; } },
  });
  const cleanup = exports.observeMediaPlayback({ querySelectorAll: () => list });
  list = [retry]; changed();
  assert.equal(original.paused, true); assert.equal(watched.has(original), false); assert.equal(watched.has(retry), true);
  cleanup(); assert.equal(retry.paused, true); assert.equal(watched.size, 0); assert.equal(clean, true);
});
