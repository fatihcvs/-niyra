"use client";

import { useLayoutEffect } from "react";
import { recordWebScreenState, type WebScreenName } from "../lib/web-performance";

/** Caller supplies actual data readiness; this measures the busy commit, not navigation intent. */
export function useWebScreenTiming(screen: WebScreenName, ready: boolean, { enabled = true }: { enabled?: boolean } = {}) {
  useLayoutEffect(() => { recordWebScreenState(screen, enabled ? ready : null); }, [screen, ready, enabled]);
  useLayoutEffect(() => () => recordWebScreenState(screen, null), [screen]);
}
