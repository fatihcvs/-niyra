"use client";

import { useLayoutEffect, useRef } from "react";

/** Animate only the visible content. Fixed navigation and overlays keep their geometry. */
export function useScreenMotion(destination: string) {
  const previous = useRef(destination);
  useLayoutEffect(() => {
    if (previous.current === destination) return;
    previous.current = destination;
    if (document.documentElement.dataset.reduceMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const column = document.querySelector(".feed-column");
    if (!column) return;
    const surfaces = [...column.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.classList.contains("app-mobile-header"));
    const animations = surfaces.map((element) => element.animate?.([{ opacity:.65 }, { opacity:1 }], { duration:160, easing:"cubic-bezier(.2,0,0,1)" })).filter(Boolean);
    return () => animations.forEach((animation) => animation?.cancel());
  }, [destination]);
}
