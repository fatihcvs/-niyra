import { workspaceRoutes } from "./workspace-navigation";
import { pushAppLocation } from "./mobile-navigation";

type LinkActivation = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">;

export function isPlainLinkActivation(event: LinkActivation, target?: string, download?: string | boolean) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!target || target === "_self") && (download === undefined || download === false);
}

/** Only the existing app surface belongs to the client router; files/auth/external pages retain native links. */
export function appLocationFor(href: string, currentHref: string): string | null {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (!/^https?:$/.test(target.protocol) || target.origin !== current.origin || target.pathname !== "/" || target.hash || target.username || target.password) return null;
    const view = target.searchParams.get("view");
    if (view && !Object.values(workspaceRoutes).some((slug) => slug === view)) return null;
    const allowed = new Set(["view", "profile", "post", "comment", "feed", "q", "searchScope", "explore", "market", "course", "courseCode", "courseName", "source", "community", "communityEvent", "note", "conversation", "message", "listing", "event", "meetup", "compose"]);
    if ([...target.searchParams.keys()].some((key) => !allowed.has(key))) return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export function navigateAppHref(href: string): boolean {
  const location = appLocationFor(href, window.location.href);
  if (!location) return false;
  if (location === `${window.location.pathname}${window.location.search}`) return true;
  pushAppLocation(location);
  // Every URL consumer, including DM and community detail, observes the same history transition.
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  return true;
}
