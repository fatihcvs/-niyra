/** Pause playback when media leaves the viewport, its screen closes, or the app is backgrounded. Never autoplay on return. */
export function observeMediaPlayback(root: HTMLElement) {
  const videos = new Set<HTMLVideoElement>();
  const pause = (video: HTMLVideoElement) => { if (!video.paused) video.pause(); };
  const pauseAll = () => { for (const video of videos) pause(video); };
  const visibility = () => { if (document.visibilityState !== "visible") pauseAll(); };
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
    for (const entry of entries) if (!entry.isIntersecting) pause(entry.target as HTMLVideoElement);
  });
  const refresh = () => {
    const current = new Set(root.querySelectorAll<HTMLVideoElement>("video"));
    for (const video of videos) if (!current.has(video)) { pause(video); observer?.unobserve(video); videos.delete(video); }
    for (const video of current) if (!videos.has(video)) { videos.add(video); observer?.observe(video); }
    visibility();
  };
  refresh();
  // Retry and attachment changes can replace a <video> without remounting its gallery.
  const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(refresh);
  mutations?.observe(root, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pauseAll);
  return () => { mutations?.disconnect(); observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pauseAll); pauseAll(); videos.clear(); };
}
