"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FEED_CHECK_INTERVAL_MS, FEED_READ_TIMEOUT_MS, hasUnseenFeedPrefix, readFeedPage, type FeedPage } from "../lib/feed-refresh";
import type { FeedScope } from "../lib/feed-scope";
import type { Post } from "./feed-post";

type Options = {
  ownerScope: string;
  scope: FeedScope;
  enabled: boolean;
  pollPaused: boolean;
  posts: readonly Post[];
  generation: RefObject<number>;
  fetcher: typeof fetch;
  onStart: () => void;
  onApply: (page: FeedPage) => void;
  onError: (message: string) => void;
};
type Notice = { context: object; available: boolean; busy: boolean; announcement: string };

/** Home keeps the read pages in memory; this hook holds no private persistent cache. */
export function useFeedRefresh(options: Options) {
  const key = `${options.ownerScope}|${options.scope}`;
  const context = useMemo(() => ({ key }), [key]);
  const [notice, setNotice] = useState<Notice>({ context, available: false, busy: false, announcement: "" });
  const latest = useRef(options);
  const poll = useRef<AbortController | null>(null);
  const manual = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const identity = useRef(context);

  useLayoutEffect(() => {
    latest.current = options;
    if (identity.current !== context) {
      identity.current = context;
      poll.current?.abort(); manual.current?.abort(); manual.current = null;
    } else if (!options.enabled) {
      poll.current?.abort(); manual.current?.abort(); manual.current = null;
    }
    if (options.pollPaused) poll.current?.abort();
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; poll.current?.abort(); manual.current?.abort(); manual.current = null; };
  }, []);

  useEffect(() => {
    if (!options.ownerScope || !options.enabled || options.pollPaused) return;
    let stopped = false;
    let timer: number | undefined;
    const clear = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; poll.current?.abort(); };
    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = window.setTimeout(() => void check(), FEED_CHECK_INTERVAL_MS);
    };
    async function check() {
      const current = latest.current;
      if (stopped || !current.enabled || current.pollPaused || manual.current || document.visibilityState !== "visible" || document.querySelector('[role="dialog"][aria-modal="true"]')) { schedule(); return; }
      const generation = current.generation.current;
      const controller = new AbortController();
      poll.current?.abort(); poll.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), FEED_READ_TIMEOUT_MS);
      try {
        const page = await readFeedPage(current.fetcher, current.scope, controller.signal);
        if (stopped || controller.signal.aborted || identity.current !== context || generation !== current.generation.current || !latest.current.enabled || document.visibilityState !== "visible") return;
        const available = hasUnseenFeedPrefix(latest.current.posts, page.posts);
        setNotice((previous) => ({ context, available, busy: false, announcement: available ? "Yeni paylaşımlar var." : previous.context === context && previous.announcement === "Akış yenilendi." ? previous.announcement : "" }));
      } catch { /* A background read cannot replace content or turn a cached feed into an error screen. */ }
      finally {
        window.clearTimeout(timeout);
        if (poll.current === controller) poll.current = null;
        schedule();
      }
    }
    const visibility = () => {
      clear();
      if (document.visibilityState !== "visible") {
        manual.current?.abort(); manual.current = null;
      } else schedule();
    };
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => { stopped = true; clear(); document.removeEventListener("visibilitychange", visibility); };
  }, [context, options.ownerScope, options.enabled, options.pollPaused]);

  const observe = useCallback((page: FeedPage) => {
    const current = latest.current;
    if (!current.ownerScope) return;
    const available = hasUnseenFeedPrefix(current.posts, page.posts);
    setNotice({ context: identity.current, available, busy: Boolean(manual.current), announcement: available ? "Yeni paylaşımlar var." : "" });
  }, []);

  const refresh = useCallback(async () => {
    const current = latest.current;
    if (!mounted.current || !current.ownerScope || !current.enabled || manual.current || document.visibilityState !== "visible") return;
    const currentContext = identity.current;
    const generation = ++current.generation.current;
    const controller = new AbortController();
    manual.current = controller; poll.current?.abort();
    controller.signal.addEventListener("abort", () => {
      if (mounted.current && identity.current === currentContext) setNotice((previous) => previous.context === currentContext && previous.busy ? { ...previous, busy: false } : previous);
    }, { once: true });
    current.onStart();
    setNotice((previous) => ({ context: currentContext, available: previous.context === currentContext && previous.available, busy: true, announcement: "Akış yenileniyor." }));
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, FEED_READ_TIMEOUT_MS);
    const isCurrent = () => mounted.current && manual.current === controller && identity.current === currentContext && generation === current.generation.current && latest.current.enabled && document.visibilityState === "visible";
    try {
      const page = await readFeedPage(current.fetcher, current.scope, controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      current.onApply(page);
      setNotice({ context: currentContext, available: false, busy: false, announcement: "Akış yenilendi." });
    } catch (error) {
      if (isCurrent() && (!controller.signal.aborted || timedOut)) {
        const message = timedOut ? "Akış yenilenemedi. Bağlantını kontrol edip tekrar dene." : error instanceof Error ? error.message : "Akış şu anda yenilenemedi.";
        current.onError(message);
        setNotice((previous) => ({ ...previous, busy: false, announcement: "Akış yenilenemedi. Yüklediğin paylaşımlar korunuyor." }));
      }
    } finally {
      window.clearTimeout(timeout);
      if (manual.current === controller) {
        manual.current = null;
        if (mounted.current && identity.current === currentContext) setNotice((previous) => previous.busy ? { ...previous, busy: false } : previous);
      }
    }
  }, []);

  return { available: notice.context === context && notice.available, busy: options.enabled && notice.context === context && notice.busy, announcement: notice.context === context ? notice.announcement : "", refresh, observe };
}
