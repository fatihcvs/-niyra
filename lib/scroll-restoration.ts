/** Restore after the destination's asynchronous content is ready; user input takes precedence. */
export function restoreAppScroll(top: number, isCurrent: () => boolean, onRestored: () => void) {
  let frame: number | null = null;
  let cancelled = false;
  let layout: string | null = null;
  const surface = document.querySelector(".feed-column");
  const stop = () => {
    cancelled = true;
    if (frame !== null) window.cancelAnimationFrame(frame);
    mutations?.disconnect();
    sizes?.disconnect();
    window.removeEventListener("wheel", userInput);
    window.removeEventListener("touchstart", userInput);
    window.removeEventListener("pointerdown", userInput);
  };
  const userInput = () => { stop(); onRestored(); };
  const restore = () => {
    frame = null;
    if (cancelled || !isCurrent()) { stop(); return; }
    if (surface?.querySelector('[data-scroll-pending="true"]')) return;
    const size = `${document.documentElement?.scrollHeight ?? 0}:${document.documentElement?.clientWidth ?? 0}`;
    if (layout !== size) { layout = size; schedule(); return; }
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    stop(); onRestored();
  };
  const schedule = () => { if (!cancelled && frame === null) frame = window.requestAnimationFrame(restore); };
  const mutations = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
  const sizes = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  if (surface) {
    mutations?.observe(surface, { attributes: true, attributeFilter: ["data-scroll-pending"], childList: true, subtree: true });
    sizes?.observe(surface);
  }
  window.addEventListener("wheel", userInput, { passive: true });
  window.addEventListener("touchstart", userInput, { passive: true });
  window.addEventListener("pointerdown", userInput, { passive: true });
  schedule();
  return stop;
}
