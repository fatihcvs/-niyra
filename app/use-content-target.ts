"use client";

import { useCallback, useSyncExternalStore } from "react";
import { contentTarget } from "../lib/workspace-navigation";

const subscribe = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };

export function useContentTarget(key: string, view: string) {
  const snapshot = useCallback(() => contentTarget(window.location.search, key, view), [key, view]);
  return useSyncExternalStore(subscribe, snapshot, () => "");
}

/** A stale A response/close must not remove a newer B navigation target. */
export function clearContentTarget(key: string, id: string, view: string, relatedKeys: readonly string[] = []) {
  if (contentTarget(window.location.search, key, view) !== id) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(key);
  for (const related of relatedKeys) url.searchParams.delete(related);
  const state = { ...window.history.state };
  delete state.kampiraLayer;
  window.history.replaceState(state, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}
