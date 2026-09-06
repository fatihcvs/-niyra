"use client";

import { useEffect } from "react";
import { WebPerformancePanel } from "./web-performance-panel";

/** Read the visual viewport once per frame and avoid invalidating unchanged root styles. */
export function observeMobileViewport() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  let frame: number | null = null;
  let lastHeight = "";
  let lastTop = "";
  let lastKeyboard: boolean | null = null;
  let baselineHeight = window.innerHeight;
  let baselineWidth = window.innerWidth;
  const update = () => {
    frame = null;
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    const active = document.activeElement;
    const editable = active instanceof HTMLElement && (active.isContentEditable || active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && ["text", "search", "email", "url", "tel", "password", "number"].includes(active.getAttribute("type")?.toLowerCase() || "text")));
    const normalScale = Math.abs((viewport?.scale ?? 1) - 1) < .01;
    if (Math.abs(window.innerWidth - baselineWidth) > 60) {
      baselineWidth = window.innerWidth;
      baselineHeight = window.innerHeight;
    }
    if (!editable && normalScale) baselineHeight = Math.max(baselineHeight, window.innerHeight, height);
    // With resizes-content, innerHeight can shrink along with visualViewport.height.
    const keyboard = editable && normalScale && Math.max(baselineHeight, window.innerHeight) - height > 150;
    const nextHeight = `${height}px`;
    const nextTop = `${top}px`;
    if (nextHeight !== lastHeight) { root.style.setProperty("--app-viewport-height", nextHeight); lastHeight = nextHeight; }
    if (nextTop !== lastTop) { root.style.setProperty("--app-viewport-top", nextTop); lastTop = nextTop; }
    if (keyboard !== lastKeyboard) { root.dataset.keyboardOpen = String(keyboard); lastKeyboard = keyboard; }
  };
  const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(update); };
  update();
  viewport?.addEventListener("resize", schedule, { passive: true });
  viewport?.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
  };
}

export function MobileRuntime() {
  useEffect(observeMobileViewport, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installation is optional: a failed worker must never block the app.
    });
  }, []);
  return process.env.NODE_ENV === "development" ? <WebPerformancePanel/> : null;
}
