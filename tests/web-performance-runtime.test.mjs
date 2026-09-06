import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import * as React from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

async function setup({ support = ["event", "longtask", "long-animation-frame"], fail = "", environment = "development", packages = {} } = {}) {
  const ui = await createMobileDom({ environment, packages });
  let clock = 100, y = 0, next = 0;
  const instances = [], frames = new Map(), timers = new Map();
  Object.defineProperty(ui.window.performance, "now", { value: () => clock });
  Object.defineProperty(ui.window, "scrollY", { get: () => y });
  ui.window.requestAnimationFrame = fn => { const id = ++next; frames.set(id, fn); return id; };
  ui.window.cancelAnimationFrame = id => frames.delete(id);
  ui.window.setTimeout = (fn, delay) => { const id = ++next; timers.set(id, { at: clock + delay, fn }); return id; };
  ui.window.clearTimeout = id => timers.delete(id);
  class Observer {
    static supportedEntryTypes = support;
    constructor(callback) { this.callback = callback; instances.push(this); }
    observe(options) { this.options = options; if (options.type === fail) throw Error("Unsupported observer option"); }
    disconnect() { this.disconnected = true; }
  }
  if (support !== null) ui.window.PerformanceObserver = Observer;
  const api = ui.load("lib/web-performance.ts");
  return {
    ...ui, api, instances, frames, timers,
    time: value => { clock = value; },
    scroll: value => { y = value; ui.window.dispatchEvent(new ui.window.Event("scroll")); },
    emit: (type, entries) => instances.find(x => x.options.type === type).callback({ getEntries: () => entries }),
    frame: () => { clock += 16; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(clock)); },
    timersAt: value => { clock = value; const due = [...timers].filter(([, item]) => item.at <= clock); for (const [id, item] of due) { timers.delete(id); item.fn(); } },
  };
}

test("development query only exposes controls; Start opts in and production cannot collect", async () => {
  const ui = await setup();
  try {
    const { WebPerformancePanel } = ui.load("app/web-performance-panel.tsx");
    await ui.render(h(WebPerformancePanel));
    assert.equal(ui.host.querySelector("aside"), null);
    assert.equal(ui.instances.length, 0);
    await act(async () => { ui.window.history.pushState({}, "", "/?devMetrics=1&profile=private-id"); ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate")); });
    assert.ok(ui.host.querySelector("aside"));
    assert.equal(ui.instances.length, 0, "The URL never starts recording by itself");
    const button = label => [...ui.host.querySelectorAll("button")].find(b => b.textContent === label);
    await ui.click(button("Ölçümü başlat"));
    assert.equal(ui.instances.length, 3);
    ui.window.history.pushState({}, "", "/?view=notes");
    await ui.click(button("Raporu yenile"));
    assert.ok(ui.host.querySelector("aside"), "An explicitly started session survives app URLs dropping the panel query");
    await ui.click(button("Durdur"));
    assert.ok(ui.instances.every(x => x.disconnected));
    await ui.click(button("Sil"));
    assert.equal(ui.host.querySelector("aside"), null);
    assert.equal(ui.timers.size, 0);
    await act(async () => { ui.window.history.replaceState({}, "", "/?devMetrics=1"); ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate")); });
    await ui.click(button("Ölçümü başlat"));
    await ui.render(null);
    assert.ok(ui.instances.every(x => x.disconnected), "Unmount disconnects an actively recording panel");
    assert.equal(ui.timers.size, 0);
  } finally { await ui.close(); }
  const prod = await setup({ environment: "production" });
  try {
    prod.window.history.replaceState({}, "", "/?devMetrics=1");
    await prod.render(h(prod.load("app/web-performance-panel.tsx").WebPerformancePanel));
    assert.equal(prod.host.querySelector("aside"), null);
    assert.throws(() => prod.api.startWebPerformanceSession(prod.window), /only in development/);
    assert.equal(prod.instances.length, 0);
  } finally { await prod.close(); }
});

test("effect cleanup and replay preserves a stopped report instead of a stale running snapshot", async () => {
  let revision = 0;
  // Deliberate effect replay adapter: the supplied dependency list gains a test revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ui = await setup({ packages: { react: { ...React, useEffect: (effect, dependencies) => React.useEffect(effect, [...dependencies, revision]) } } });
  try {
    ui.window.history.replaceState({}, "", "/?devMetrics=1");
    const { WebPerformancePanel } = ui.load("app/web-performance-panel.tsx");
    const button = label => [...ui.host.querySelectorAll("button")].find(b => b.textContent === label);
    const report = () => JSON.parse(ui.host.querySelector("pre").textContent);
    await ui.render(h(WebPerformancePanel));
    await ui.click(button("Ölçümü başlat"));
    ui.time(200); ui.emit("longtask", [{ startTime: 120, duration: 80 }]);
    assert.equal(report().running, true);
    // Exercise React's cleanup/setup with retained component state and refs;
    // this is not an end-to-end test of the Vite Fast Refresh transport.
    revision += 1;
    await ui.render(h(WebPerformancePanel));
    assert.equal(report().running, false);
    assert.equal(report().samples.length, 1);
    assert.ok(ui.instances.every(instance => instance.disconnected));
    await ui.click(button("Raporu yenile"));
    await ui.click(button("Durdur"));
    assert.equal(report().samples.length, 1);
    assert.equal(ui.instances.length, 3, "Replay never starts collection without another Start click");
    await ui.click(button("Ölçümü başlat"));
    assert.equal(report().running, true);
    assert.equal(report().samples.length, 0);
    assert.equal(ui.instances.length, 6);
  } finally { await ui.close(); }
});

test("observer entries are allowlisted numeric samples, bounded and never serialize private attribution", async () => {
  const ui = await setup();
  try {
    const session = ui.api.startWebPerformanceSession(ui.window);
    assert.deepEqual(JSON.parse(JSON.stringify(ui.instances[0].options)), { type: "event", buffered: false, durationThreshold: 16 });
    const entry = { startTime: 120, duration: 40, processingStart: 124, processingEnd: 134, name: "click", target: null, toJSON() { throw Error("Never serialize PerformanceEntry"); } };
    Object.defineProperty(entry, "scripts", { get() { throw Error("Never read script attribution"); } });
    ui.time(200); ui.emit("event", [entry]);
    const password = ui.document.createElement("input"); password.type = "password"; password.value = "secret";
    ui.emit("event", [{ ...entry, name: "keydown", target: password }]);
    ui.emit("long-animation-frame", [{ ...entry, name: "https://private.invalid/?token=secret", blockingDuration: 8 }]);
    ui.emit("longtask", [{ ...entry, name: "private account", attribution: [{ containerSrc: "secret" }] }]);
    let report = JSON.parse(JSON.stringify(session.snapshot()));
    assert.deepEqual(report.samples[0], { kind: "event", atMs: 20, durationMs: 40, event: "click", inputDelayMs: 4, processingMs: 10, presentationDelayApproxMs: 26 });
    assert.equal(report.samples[1].blockingMs, 8);
    assert.doesNotMatch(JSON.stringify(report), /private|token|secret|attribution|containerSrc/);
    ui.emit("event", Array.from({ length: 510 }, () => entry));
    report = session.snapshot();
    assert.equal(report.samples.length, 500); assert.equal(report.dropped, 13); assert.equal(report.observed, 513);
    assert.equal(report.nativeFrameMetrics, false); assert.equal(report.automaticNetwork, false);
    session.stop(); ui.emit("event", [entry]); assert.equal(session.snapshot().observed, 513);
    assert.equal(ui.timers.size, 0); assert.equal(ui.frames.size, 0);
  } finally { await ui.close(); }
});

test("unsupported and failed observers remain explicit, hidden-page entries and pre-opt-in entries are excluded", async () => {
  const absent = await setup({ support: null });
  try {
    absent.window.MutationObserver = undefined;
    const session = absent.api.startWebPerformanceSession(absent.window);
    assert.ok(Object.values(session.snapshot().capabilities).every(value => value === "unsupported"));
    assert.equal(session.snapshot().samples.length, 0); session.stop();
  } finally { await absent.close(); }
  const ui = await setup({ fail: "long-animation-frame" });
  try {
    const session = ui.api.startWebPerformanceSession(ui.window);
    assert.equal(session.snapshot().capabilities["long-animation-frame"], "failed");
    ui.emit("longtask", [{ startTime: 90, duration: 80 }]);
    Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "hidden" });
    ui.window.document.dispatchEvent(new ui.window.Event("visibilitychange"));
    ui.emit("longtask", [{ startTime: 130, duration: 80 }]);
    ui.time(400); Object.defineProperty(ui.document, "visibilityState", { configurable: true, value: "visible" });
    ui.document.dispatchEvent(new ui.window.Event("visibilitychange"));
    ui.emit("longtask", [{ startTime: 200, duration: 80 }, { startTime: 420, duration: 80 }]);
    assert.equal(session.snapshot().samples.length, 1);
    session.stop(); assert.ok(ui.instances.every(x => x.disconnected));
  } finally { await ui.close(); }
});

test("history observes the saved scroll target after two frames, with timeout/interruption and full cleanup", async () => {
  const ui = await setup({ support: null });
  try {
    await ui.render(h("main", { className: "feed-column" }, h("div", { "data-scroll-pending": "true" })));
    const session = ui.api.startWebPerformanceSession(ui.window);
    ui.window.history.replaceState({ kampiraScrollY: 1984, privateBody: "must not export" }, "", "/?profile=secret");
    ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate"));
    ui.scroll(1984); ui.frame(); ui.frame();
    assert.equal(session.snapshot().samples.filter(x => x.kind === "history-scroll").length, 0);
    await ui.render(h("main", { className: "feed-column" }, h("div", { "data-scroll-pending": "false" })));
    ui.frame(); ui.frame();
    assert.equal(session.snapshot().samples.find(x => x.kind === "history-scroll").outcome, "matched");
    assert.equal(session.snapshot().samples.find(x => x.kind === "history-scroll").deltaPx, 0);
    ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate"));
    ui.window.dispatchEvent(new ui.window.Event("pointerdown"));
    assert.equal(session.snapshot().samples.at(-1).outcome, "interrupted");
    ui.scroll(0); ui.window.dispatchEvent(new ui.window.PopStateEvent("popstate")); ui.time(6000); ui.frame();
    assert.equal(session.snapshot().samples.at(-1).outcome, "timeout");
    assert.doesNotMatch(JSON.stringify(session.snapshot()), /secret|must not export|privateBody|profile=/);
    session.stop(); assert.equal(ui.frames.size, 0); assert.equal(ui.timers.size, 0);
  } finally { await ui.close(); }
});

test("actual screen hook measures busy to ready, ignores ready cache, and cancels hidden/unmounted work", async () => {
  const ui = await setup({ support: null });
  try {
    const { useWebScreenTiming } = ui.load("app/use-web-screen-timing.ts");
    function Screen({ ready, enabled = true }) { useWebScreenTiming("feed", ready, { enabled }); return h("main"); }
    const session = ui.api.startWebPerformanceSession(ui.window);
    await ui.render(h(Screen, { ready: true }));
    assert.equal(session.snapshot().samples.length, 0, "Cached-ready is not a fabricated zero-millisecond result");
    ui.time(200); await ui.render(h(Screen, { ready: false }));
    ui.time(350); await ui.render(h(Screen, { ready: true }));
    assert.equal(session.snapshot().samples[0].durationMs, 150); assert.equal(session.snapshot().samples[0].outcome, "ready");
    assert.equal(session.snapshot().samples[0].startBoundary, "busy-commit");
    ui.time(400); await ui.render(h(Screen, { ready: false }));
    ui.time(500); await ui.render(h(Screen, { ready: false, enabled: false }));
    assert.equal(session.snapshot().samples.at(-1).outcome, "unmounted");
    ui.time(600); await ui.render(h(Screen, { ready: false })); ui.time(650); await ui.render(null);
    assert.equal(session.snapshot().samples.at(-1).outcome, "unmounted");
    await ui.render(h("section", { className: "notes-workspace", "data-scroll-pending": "true" }));
    ui.time(750); await ui.render(h("section", { className: "notes-workspace", "data-scroll-pending": "false" }));
    assert.equal(session.snapshot().samples.at(-1).screen, "notes"); assert.equal(session.snapshot().samples.at(-1).outcome, "ready");
    assert.equal(session.snapshot().samples.at(-1).startBoundary, "dom-pending");
    session.stop();
  } finally { await ui.close(); }
});

test("scroll dispatch bursts and the five-minute stop have explicit boundaries, without FPS inference", async () => {
  const ui = await setup();
  try {
    const session = ui.api.startWebPerformanceSession(ui.window);
    ui.time(150); ui.scroll(100); ui.time(190); ui.scroll(250); ui.timersAt(340);
    const sample = session.snapshot().samples[0];
    assert.equal(sample.kind, "scroll"); assert.equal(sample.durationMs, 40); assert.equal(sample.deltaPx, 150); assert.equal(sample.outcome, "idle-150ms");
    ui.timersAt(300100);
    assert.equal(session.snapshot().running, false); assert.equal(ui.timers.size, 0); assert.ok(ui.instances.every(x => x.disconnected));
    ui.scroll(900); assert.equal(session.snapshot().samples.length, 1);
  } finally { await ui.close(); }
});
