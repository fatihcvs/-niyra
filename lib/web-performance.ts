export const WEB_METRIC_LIMIT = 500;
export const WEB_METRIC_SESSION_MS = 5 * 60_000;
export const WEB_SCREEN_NAMES = ["feed", "profile", "notes", "search", "messages", "communities", "campus"] as const;
export type WebScreenName = typeof WEB_SCREEN_NAMES[number];
type Capability = "observing" | "unsupported" | "failed";
type Metric = {
  kind: "event" | "long-task" | "long-animation-frame" | "screen-pending" | "history-scroll" | "scroll";
  atMs: number;
  durationMs: number;
  event?: "click" | "pointer" | "keyboard" | "touch" | "other";
  inputDelayMs?: number;
  processingMs?: number;
  presentationDelayApproxMs?: number;
  blockingMs?: number;
  screen?: WebScreenName;
  startBoundary?: "busy-commit" | "dom-pending" | "opt-in-pending";
  outcome?: "ready" | "matched" | "timeout" | "interrupted" | "unmounted" | "idle-150ms";
  deltaPx?: number;
};
type NumericEntry = PerformanceEntry & { processingStart?: number; processingEnd?: number; blockingDuration?: number; target?: Element | null };
type ObserverConstructor = { new(callback: PerformanceObserverCallback): PerformanceObserver; supportedEntryTypes?: readonly string[] };
type Pending = { start: number; source: "dom" | "explicit"; boundary: NonNullable<Metric["startBoundary"]> };
export type WebPerformanceSnapshot = {
  schemaVersion: number; environment: string; running: boolean; elapsedMs: number;
  sampleLimit: number; maxSessionMs: number; observed: number; dropped: number;
  capabilities: Record<string, Capability>; readinessSources: string[];
  eventThresholdMs: number; eventDurationPrecisionMs: number; nativeFrameMetrics: false; automaticNetwork: false;
  samples: Metric[];
};
export type WebPerformanceSession = { screen: (screen: WebScreenName, ready: boolean | null) => void; stop: () => void; snapshot: () => WebPerformanceSnapshot };
const round = (value: number) => Math.round(value * 10) / 10;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
let activeSession: WebPerformanceSession | null = null;

/** Explicit semantic marker: busy commit to ready commit, never a guessed navigation/paint time. */
export function recordWebScreenState(screen: WebScreenName, ready: boolean | null) {
  if (process.env.NODE_ENV === "development" && WEB_SCREEN_NAMES.includes(screen)) activeSession?.screen(screen, ready);
}

/** No observer, buffer, storage or network exists before this explicit development-only call. */
export function startWebPerformanceSession(win: Window = window): WebPerformanceSession {
  if (process.env.NODE_ENV !== "development") throw new Error("Web measurement is available only in development.");
  activeSession?.stop();
  const doc = win.document;
  const start = win.performance.now();
  let visibleSince = start;
  let stopped = false;
  let endedAt: number | null = null;
  let dropped = 0;
  let observed = 0;
  const samples: Metric[] = [];
  const observers: PerformanceObserver[] = [];
  const pending = new Map<WebScreenName, Pending>();
  const capabilities: Record<string, Capability> = { event: "unsupported", longtask: "unsupported", "long-animation-frame": "unsupported" };
  const now = () => win.performance.now();
  const visible = () => doc.visibilityState !== "hidden";
  const append = (metric: Metric) => {
    if (stopped || !visible() || now() - start > WEB_METRIC_SESSION_MS || !finite(metric.atMs) || !finite(metric.durationMs)) return;
    observed++;
    if (samples.length === WEB_METRIC_LIMIT) { samples.shift(); dropped++; }
    samples.push(metric);
  };
  const stopPending = (outcome: "interrupted" | "unmounted", only?: WebScreenName) => {
    for (const [screen, item] of pending) {
      if (only && screen !== only) continue;
      append({ kind: "screen-pending", atMs: round(item.start - start), durationMs: round(now() - item.start), screen, startBoundary: item.boundary, outcome });
      pending.delete(screen);
    }
  };
  const screenState = (screen: WebScreenName, ready: boolean, source: Pending["source"] = "explicit", boundary: Pending["boundary"] = "busy-commit") => {
    if (stopped || !visible() || !WEB_SCREEN_NAMES.includes(screen)) return;
    if (!ready) { if (!pending.has(screen)) pending.set(screen, { start: now(), source, boundary }); return; }
    const item = pending.get(screen);
    if (!item) return; // An already-ready surface is not a zero-millisecond measurement.
    append({ kind: "screen-pending", atMs: round(item.start - start), durationMs: round(now() - item.start), screen, startBoundary: item.boundary, outcome: "ready" });
    pending.delete(screen);
  };
  const Observer = (win as Window & { PerformanceObserver?: ObserverConstructor }).PerformanceObserver;
  for (const type of Object.keys(capabilities)) {
    if (!Observer?.supportedEntryTypes?.includes(type)) continue;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new Observer(list => {
        if (stopped || !visible()) return;
        for (const raw of list.getEntries()) {
          const entry = raw as NumericEntry;
          if (!finite(entry.startTime) || !finite(entry.duration) || entry.startTime < visibleSince) continue;
          const base = { atMs: round(entry.startTime - start), durationMs: round(entry.duration) };
          if (type === "event") {
            if (entry.target?.closest('[data-web-performance-panel], input[type="password"], input[autocomplete="one-time-code"]')) continue;
            if (!finite(entry.processingStart) || !finite(entry.processingEnd) || entry.processingStart < entry.startTime || entry.processingEnd < entry.processingStart) continue;
            const event = entry.name === "click" ? "click" : ["pointerdown", "pointerup", "mousedown", "mouseup"].includes(entry.name) ? "pointer" : ["keydown", "keyup", "keypress"].includes(entry.name) ? "keyboard" : ["touchstart", "touchend"].includes(entry.name) ? "touch" : "other";
            append({ kind: "event", ...base, event, inputDelayMs: round(entry.processingStart - entry.startTime), processingMs: round(entry.processingEnd - entry.processingStart), presentationDelayApproxMs: round(Math.max(0, entry.startTime + entry.duration - entry.processingEnd)) });
          } else if (type === "longtask") append({ kind: "long-task", ...base });
          else append({ kind: "long-animation-frame", ...base, ...(finite(entry.blockingDuration) ? { blockingMs: round(entry.blockingDuration) } : {}) });
          // No entry serialization: target/id, attribution, scripts, URLs and names are never copied.
        }
      });
      observer.observe({ type, buffered: false, ...(type === "event" ? { durationThreshold: 16 } : {}) });
      observers.push(observer); capabilities[type] = "observing";
    } catch { observer?.disconnect(); capabilities[type] = "failed"; }
  }

  const selectors: Array<[WebScreenName, string]> = [["notes", ".notes-workspace[data-scroll-pending]"], ["profile", ".profile-content-panel[data-scroll-pending]"]];
  const readReady = (initial = false) => {
    for (const [name, selector] of selectors) {
      const element = doc.querySelector(selector);
      if (element) screenState(name, element.getAttribute("data-scroll-pending") !== "true", "dom", initial ? "opt-in-pending" : "dom-pending");
      else if (pending.get(name)?.source === "dom") stopPending("unmounted", name);
    }
  };
  const Mutation = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const readyObserver = Mutation ? new Mutation(() => readReady()) : null;
  readyObserver?.observe(doc.body, { attributes: true, attributeFilter: ["data-scroll-pending"], childList: true, subtree: true });
  capabilities["dom-readiness"] = readyObserver ? "observing" : "unsupported";
  readReady(true);

  let traversal: { start: number; target: number; stable: number } | null = null;
  let traversalFrame: number | null = null;
  const finishTraversal = (outcome: "matched" | "timeout" | "interrupted") => {
    if (!traversal) return;
    append({ kind: "history-scroll", atMs: round(traversal.start - start), durationMs: round(now() - traversal.start), deltaPx: round(win.scrollY - traversal.target), outcome });
    traversal = null;
    if (traversalFrame !== null) win.cancelAnimationFrame(traversalFrame);
    traversalFrame = null;
  };
  const checkTraversal = () => {
    traversalFrame = null;
    if (!traversal || stopped) return;
    if (now() - traversal.start >= 5000) { finishTraversal("timeout"); return; }
    const isPending = pending.size > 0 || Boolean(doc.querySelector('.feed-column [data-scroll-pending="true"]'));
    traversal.stable = !isPending && Math.abs(win.scrollY - traversal.target) <= 1 ? traversal.stable + 1 : 0;
    if (traversal.stable >= 2) { finishTraversal("matched"); return; }
    traversalFrame = win.requestAnimationFrame(checkTraversal);
  };
  const onTraversal = () => {
    finishTraversal("interrupted");
    const target = win.history.state?.kampiraScrollY;
    if (!visible() || !finite(target)) return;
    traversal = { start: now(), target, stable: 0 };
    traversalFrame = win.requestAnimationFrame(checkTraversal);
  };
  const interrupt = () => finishTraversal("interrupted");
  let scrolling: { start: number; lastAt: number; first: number; last: number } | null = null;
  let scrollTimer: number | null = null;
  const finishScroll = () => {
    if (scrolling) append({ kind: "scroll", atMs: round(scrolling.start - start), durationMs: round(scrolling.lastAt - scrolling.start), deltaPx: round(scrolling.last - scrolling.first), outcome: "idle-150ms" });
    scrolling = null; scrollTimer = null;
  };
  const onScroll = () => {
    if (!visible()) return;
    scrolling ??= { start: now(), lastAt: now(), first: win.scrollY, last: win.scrollY };
    scrolling.last = win.scrollY; scrolling.lastAt = now();
    if (scrollTimer !== null) win.clearTimeout(scrollTimer);
    scrollTimer = win.setTimeout(finishScroll, 150);
  };
  const onVisibility = () => { interrupt(); stopPending("interrupted"); scrolling = null; if (scrollTimer !== null) win.clearTimeout(scrollTimer); scrollTimer = null; visibleSince = now(); };
  win.addEventListener("popstate", onTraversal);
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("pointerdown", interrupt, { passive: true });
  win.addEventListener("wheel", interrupt, { passive: true });
  doc.addEventListener("visibilitychange", onVisibility);
  const autoStop = win.setTimeout(() => session.stop(), WEB_METRIC_SESSION_MS);
  const session: WebPerformanceSession = {
    screen: (screen: WebScreenName, ready: boolean | null) => ready === null ? stopPending("unmounted", screen) : screenState(screen, ready),
    stop: () => {
      if (stopped) return;
      interrupt(); stopPending("interrupted");
      stopped = true; endedAt = now();
      observers.forEach(observer => observer.disconnect()); readyObserver?.disconnect();
      win.clearTimeout(autoStop); if (scrollTimer !== null) win.clearTimeout(scrollTimer);
      scrolling = null;
      win.removeEventListener("popstate", onTraversal); win.removeEventListener("scroll", onScroll); win.removeEventListener("pointerdown", interrupt); win.removeEventListener("wheel", interrupt); doc.removeEventListener("visibilitychange", onVisibility);
      if (activeSession === session) activeSession = null;
    },
    snapshot: () => ({
      schemaVersion: 1, environment: "development-web", running: !stopped,
      elapsedMs: round((endedAt ?? now()) - start), sampleLimit: WEB_METRIC_LIMIT, maxSessionMs: WEB_METRIC_SESSION_MS,
      observed, dropped, capabilities: { ...capabilities }, readinessSources: ["notes-data-scroll-pending", "profile-data-scroll-pending", "explicit-screen-hook"],
      eventThresholdMs: 16, eventDurationPrecisionMs: 8, nativeFrameMetrics: false, automaticNetwork: false,
      samples: samples.map(sample => ({ ...sample })),
    }),
  };
  activeSession = session;
  return session;
}
