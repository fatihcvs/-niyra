import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../lib/scroll-restoration.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness() {
  let pending = true, current = true, completed = 0, sequence = 0;
  const frames = new Map(), events = new Map(), observers = [], scrolls = [];
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const context = { exports: {}, document: { querySelector: () => ({ querySelector: () => pending ? {} : null }) }, MutationObserver: Observer, ResizeObserver: Observer,
    window: { requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: (id) => frames.delete(id), addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name), scrollTo: (position) => scrolls.push(position) } };
  runInNewContext(code, context);
  const stop = context.exports.restoreAppScroll(900, () => current, () => { completed++; });
  return { frames, events, observers, scrolls, stop, completed: () => completed, ready: () => { pending = false; observers.forEach((observer) => observer.callback()); }, leave: () => { current = false; }, flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); } };
}
test("async placeholder never receives a clamped restoration; loaded content wakes it once", () => {
  const h = harness(); h.flush();
  assert.equal(h.scrolls.length, 0);
  h.ready(); h.flush(); h.flush();
  assert.equal(h.scrolls[0].top, 900); assert.equal(h.scrolls.length, 1); assert.equal(h.completed(), 1);
  assert.equal(h.events.size, 0); assert.ok(h.observers.every((observer) => observer.disconnected));
});
test("a newer destination or effect cleanup cannot scroll the old target", () => {
  for (const action of ["leave", "stop"]) {
    const h = harness(); h.flush(); h[action](); h.ready(); h.flush();
    assert.equal(h.scrolls.length, 0); assert.equal(h.completed(), 0);
  }
});
test("manual touch/wheel interaction takes priority over delayed restoration", () => {
  for (const name of ["touchstart", "wheel", "pointerdown"]) {
    const h = harness(); h.flush(); h.events.get(name)(); h.ready(); h.flush();
    assert.equal(h.scrolls.length, 0); assert.equal(h.completed(), 1);
  }
});
