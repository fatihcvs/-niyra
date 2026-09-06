"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import { pushAppLocation } from "../lib/mobile-navigation";

const inertOwners = new Map<HTMLElement, { count: number; original: boolean }>();
const dialogIsolations: { dialog: HTMLElement; refresh: () => void }[] = [];
let bodyLocks = 0;
let originalOverflow = "";

/** Lock siblings along the dialog path, including the mobile bar, without hiding the dialog's ancestors. */
function isolateDialog(dialog: HTMLElement) {
  const siblings = new Set<HTMLElement>();
  let parents = new Set<HTMLElement>();
  let released = false;
  const releaseSibling = (sibling: HTMLElement) => {
    const current = inertOwners.get(sibling);
    if (current && --current.count === 0) { sibling.inert = current.original; inertOwners.delete(sibling); }
    siblings.delete(sibling);
  };
  const refresh = () => {
    if (released) return;
    const nextSiblings = new Set<HTMLElement>();
    const nextParents = new Set<HTMLElement>();
    const higherDialogs = dialogIsolations.slice(dialogIsolations.findIndex((layer) => layer.dialog === dialog) + 1).map((layer) => layer.dialog);
    if (dialog.isConnected) {
      for (let node: HTMLElement | null = dialog; node?.parentElement && node !== document.body; node = node.parentElement) {
        nextParents.add(node.parentElement);
        for (const sibling of node.parentElement.children) {
          // A later layer can be a sibling/portal, not just a descendant. Its
          // own isolation hides this layer; this layer must not hide it back.
          if (sibling instanceof HTMLElement && sibling !== node && !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName) && !higherDialogs.some((higher) => sibling.contains(higher))) nextSiblings.add(sibling);
        }
      }
    }
    for (const sibling of siblings) if (!nextSiblings.has(sibling)) releaseSibling(sibling);
    for (const sibling of nextSiblings) {
      if (siblings.has(sibling)) continue;
      const current = inertOwners.get(sibling) ?? { count: 0, original: sibling.inert };
      current.count++;
      inertOwners.set(sibling, current);
      sibling.inert = true;
      siblings.add(sibling);
    }
    if (parents.size !== nextParents.size || [...parents].some((parent) => !nextParents.has(parent))) {
      observer?.disconnect();
      // Observe only direct children along the dialog path. Changes inside an
      // already inert subtree inherit isolation and need no additional work.
      for (const parent of nextParents) observer?.observe(parent, { childList: true });
      parents = nextParents;
    }
  };
  const observer = typeof window.MutationObserver === "function" ? new window.MutationObserver(refresh) : null;
  const isolation = { dialog, refresh };
  dialogIsolations.push(isolation);
  for (const layer of dialogIsolations) layer.refresh();
  if (bodyLocks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  return () => {
    released = true;
    observer?.disconnect();
    dialogIsolations.splice(dialogIsolations.indexOf(isolation), 1);
    for (const sibling of siblings) releaseSibling(sibling);
    parents.clear();
    for (const layer of dialogIsolations) layer.refresh();
    if (--bodyLocks === 0) document.body.style.overflow = originalOverflow;
  };
}

type LayerOptions = { id: string; open: boolean; onClose: () => void; onRestore?: () => void; busy?: boolean; history?: "layer" | "route" };

/** Web Back closes the top layer before changing workspace. Form owners retain their own draft values. */
export function useAppLayer({ id, open, onClose, onRestore, busy = false, history = "layer" }: LayerOptions) {
  const instance = useId();
  const routeLocation = history === "route" && typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null;
  const canRestore = Boolean(onRestore);
  const ref = useRef<HTMLElement | null>(null);
  const entry = useRef<{ key: string; depth: number; location: string } | null>(null);
  const previousOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const closeFromHistory = useEffectEvent(() => { if (open) onClose(); });
  const restoreFromHistory = useEffectEvent(() => { if (!open) onRestore?.(); });
  const requestClose = useEffectEvent(() => {
    if (!open || busy) return;
    if (entry.current && entry.current.depth > 0 && entry.current.key === window.history.state?.kampiraLayer?.key) window.history.back();
    else onClose();
  });

  useEffect(() => {
    // A long feed owns many unopened menus/media viewers. Only an opened layer
    // needs keyboard handling; a closed, visited layer only listens for Forward.
    if (!open && (!entry.current || !canRestore)) return;
    const historyChanged = () => {
      const current = entry.current;
      if (!current) return;
      if (window.history.state?.kampiraLayer?.key === current.key) restoreFromHistory();
      else if (`${window.location.pathname}${window.location.search}` !== current.location || Number(window.history.state?.kampiraDepth ?? 0) < current.depth) closeFromHistory();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!entry.current || entry.current.key !== window.history.state?.kampiraLayer?.key || !ref.current) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); requestClose(); }
      if (event.key !== "Tab") return;
      const targets = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((item) => !item.hidden && !item.closest("[inert]") && item.getClientRects().length > 0);
      const first = targets[0] ?? ref.current;
      const last = targets.at(-1) ?? ref.current;
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("popstate", historyChanged);
    if (open) document.addEventListener("keydown", keydown, true);
    return () => { window.removeEventListener("popstate", historyChanged); if (open) document.removeEventListener("keydown", keydown, true); };
  }, [open, canRestore]);

  useEffect(() => {
    if (open && (!previousOpen.current || (history === "route" && entry.current?.location !== `${window.location.pathname}${window.location.search}`))) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const restored = window.history.state?.kampiraLayer;
      // A route remount can return to an existing detail entry; adopt it instead of pushing a second Back step.
      if (!entry.current && restored?.id === id && typeof restored.key === "string") {
        entry.current = { key: restored.key, depth: Number(window.history.state?.kampiraDepth ?? 0), location: `${window.location.pathname}${window.location.search}` };
      }
      if (!entry.current || entry.current.key !== window.history.state?.kampiraLayer?.key) {
        const location = `${window.location.pathname}${window.location.search}`;
        const key = `${id}:${instance}:${Date.now()}`;
        // A deep link already owns a navigation entry. Reuse it so one Back
        // returns to its caller; a direct URL with no app history closes in place.
        if (history !== "route") pushAppLocation(location);
        entry.current = { key, depth: Number(window.history.state?.kampiraDepth ?? 0), location };
        window.history.replaceState({ ...window.history.state, kampiraLayer: { id, key } }, "");
      }
    } else if (!open && previousOpen.current) {
      if (entry.current && entry.current.depth > 0 && entry.current.key === window.history.state?.kampiraLayer?.key) window.history.back();
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    }
    previousOpen.current = open;
  }, [id, instance, open, history, routeLocation]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const release = isolateDialog(dialog);
    // Focus the heading/container first so a mobile keyboard does not cover the opening context.
    if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
    return release;
  }, [open]);

  return { ref, close: () => {
    if (!open || busy) return;
    if (entry.current && entry.current.depth > 0 && entry.current.key === window.history.state?.kampiraLayer?.key) window.history.back();
    else onClose();
  } };
}
