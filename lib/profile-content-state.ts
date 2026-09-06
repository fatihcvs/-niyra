import type { ProfileContentResponse, ProfileContentTab, ProfilePost } from "./profile-content";

export type ProfileTab = ProfileContentTab | "about";
export type ProfilePostChanges = Partial<Pick<ProfilePost, "text" | "edited" | "liked" | "saved" | "likes" | "comments">>;
type Content = ProfileContentResponse;
type TabState = { content: Content; loaded: boolean; loading: boolean; loadingMore: boolean; error: string; errorKind: "initial" | "more" | null };
export type ProfileContentSnapshot = { active: boolean; sessionExpired?: boolean; tab: ProfileTab; tabs: Partial<Record<ProfileContentTab, TabState>> };
type Entry = { snapshot: ProfileContentSnapshot; pages: Partial<Record<ProfileContentTab, Content[]>>; requests: Map<ProfileContentTab, AbortController>; leases: number; lastUsed: number };
type LoadPage = (request: { userId: string; tab: ProfileContentTab; cursor: string | null; signal: AbortSignal }) => Promise<Content>;
const apiTabs: ProfileContentTab[] = ["posts", "images", "videos", "notes", "communities"];
const postTabs: ProfileContentTab[] = ["posts", "images", "videos"];
const emptyContent = (): Content => ({ posts: [], notes: [], communities: [], nextCursor: null });
export const emptyProfileTabState: TabState = { content: emptyContent(), loaded: false, loading: false, loadingMore: false, error: "", errorKind: null };
export const inactiveProfileContentSnapshot: ProfileContentSnapshot = { active: false, tab: "posts", tabs: {} };
const initialSnapshot: ProfileContentSnapshot = { active: true, tab: "posts", tabs: {} };
const expiredSnapshot: ProfileContentSnapshot = { active: false, sessionExpired: true, tab: "posts", tabs: { posts: { ...emptyProfileTabState, error: "Oturumun sona erdi. Devam etmek için oturumunu yeniden kontrol et.", errorKind: "initial" } } };

function mergePages(pages: Content[]): Content {
  const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [String(item.id), item])).values()];
  return {
    posts: unique(pages.flatMap((page) => page.posts)),
    notes: unique(pages.flatMap((page) => page.notes)),
    communities: unique(pages.flatMap((page) => page.communities)),
    nextCursor: pages.at(-1)?.nextCursor ?? null,
  };
}

async function loadProfilePage({ userId, tab, cursor, signal }: Parameters<LoadPage>[0]): Promise<Content> {
  const response = await fetch(`/api/profile/content?${new URLSearchParams({ user: userId, tab, ...(cursor ? { cursor } : {}) })}`, { signal, credentials: "same-origin", cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Profil içeriği getirilemedi."), { status: response.status });
  return {
    posts: Array.isArray(data.posts) ? data.posts : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    communities: Array.isArray(data.communities) ? data.communities : [],
    nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
  };
}

/** Client session memory only. Owner activation is authoritative and never occurs during render. */
export function createProfileContentState({ loadPage = loadProfilePage, now = Date.now, maxCachedProfiles = 8, maxCachedItemsPerTab = 240, ttlMs = 5 * 60_000 }: {
  loadPage?: LoadPage; now?: () => number; maxCachedProfiles?: number; maxCachedItemsPerTab?: number; ttlMs?: number;
} = {}) {
  for (const limit of [maxCachedProfiles, maxCachedItemsPerTab, ttlMs]) if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Profile cache limits must be positive integers.");
  let ownerScope: string | null = null;
  let expiredScope: string | null = null;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const allowed = (scope: string) => Boolean(scope) && scope === ownerScope;
  const expired = (entry: Entry) => entry.leases === 0 && now() - entry.lastUsed >= ttlMs;
  const state = (entry: Entry, tab: ProfileContentTab) => entry.snapshot.tabs[tab] ?? emptyProfileTabState;
  const replace = (entry: Entry, tab: ProfileContentTab, next: TabState) => { entry.snapshot = { ...entry.snapshot, tabs: { ...entry.snapshot.tabs, [tab]: next } }; };
  function cancel(entry: Entry, tab: ProfileContentTab) {
    entry.requests.get(tab)?.abort();
    entry.requests.delete(tab);
    const current = state(entry, tab);
    if (current.loading || current.loadingMore) replace(entry, tab, { ...current, loading: false, loadingMore: false });
  }
  function discard(entry: Entry) { apiTabs.forEach((tab) => cancel(entry, tab)); }
  function prune() {
    const inactive = [...entries].filter(([, entry]) => entry.leases === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (inactive.length > maxCachedProfiles) {
      const [id, entry] = inactive.shift()!;
      discard(entry); entries.delete(id);
    }
  }
  function ensure(scope: string, userId: string): Entry | null {
    if (!allowed(scope) || !userId) return null;
    let entry = entries.get(userId);
    if (entry && expired(entry)) { discard(entry); entries.delete(userId); entry = undefined; }
    if (!entry) {
      entry = { snapshot: { active: true, tab: "posts", tabs: {} }, pages: {}, requests: new Map(), leases: 0, lastUsed: now() };
      entries.set(userId, entry);
    }
    entry.lastUsed = now();
    return entry;
  }
  function resetTabs(entry: Entry, tabs: ProfileContentTab[]) {
    for (const tab of tabs) { cancel(entry, tab); delete entry.pages[tab]; replace(entry, tab, { ...emptyProfileTabState, content: emptyContent() }); }
  }
  function changePosts(scope: string, id: string | number, changes: ProfilePostChanges | null) {
    if (!allowed(scope)) return;
    for (const entry of entries.values()) for (const tab of postTabs) {
      // A read started before the confirmed mutation must never overwrite it.
      cancel(entry, tab);
      const pages = entry.pages[tab];
      if (!pages) continue;
      entry.pages[tab] = pages.map((page) => ({ ...page, posts: changes === null ? page.posts.filter((post) => String(post.id) !== String(id)) : page.posts.map((post) => String(post.id) === String(id) ? { ...post, ...changes } : post) }));
      replace(entry, tab, { ...state(entry, tab), content: mergePages(entry.pages[tab]!) });
    }
    emit();
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setOwnerScope(scope: string | null) {
      if (scope === ownerScope && !expiredScope) return;
      ownerScope = scope;
      expiredScope = null;
      entries.forEach(discard); entries.clear(); emit();
    },
    getSnapshot(scope: string, userId: string): ProfileContentSnapshot {
      if (!allowed(scope)) return scope === expiredScope ? expiredSnapshot : inactiveProfileContentSnapshot;
      const entry = entries.get(userId);
      return entry && !expired(entry) ? entry.snapshot : initialSnapshot;
    },
    attach(scope: string, userId: string) {
      const entry = ensure(scope, userId);
      if (!entry) return () => {};
      entry.leases++; prune(); emit();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (!allowed(scope) || entries.get(userId) !== entry) return;
        entry.leases = Math.max(0, entry.leases - 1);
        if (entry.leases) return;
        entry.lastUsed = now(); discard(entry);
        for (const tab of apiTabs) {
          const pages = entry.pages[tab];
          if (!pages) continue;
          let retainedItems = 0;
          const retained: Content[] = [];
          for (const page of pages) {
            const size = page.posts.length + page.notes.length + page.communities.length;
            if (retainedItems + size > maxCachedItemsPerTab) break;
            retainedItems += size; retained.push(page);
          }
          entry.pages[tab] = retained;
          replace(entry, tab, { ...state(entry, tab), content: mergePages(retained), loaded: retained.length > 0, error: "", errorKind: null });
        }
        prune(); emit();
      };
    },
    chooseTab(scope: string, userId: string, tab: ProfileTab) {
      const entry = ensure(scope, userId);
      if (!entry || entry.snapshot.tab === tab || (tab !== "about" && !apiTabs.includes(tab))) return;
      apiTabs.forEach((key) => cancel(entry, key));
      entry.snapshot = { ...entry.snapshot, tab }; emit();
    },
    async load(scope: string, userId: string, tab: ProfileContentTab, mode: "initial" | "more" = "initial") {
      const entry = ensure(scope, userId);
      if (!entry || !apiTabs.includes(tab)) return;
      const current = state(entry, tab);
      if (entry.requests.has(tab) || (mode === "initial" && current.loaded) || (mode === "more" && !current.content.nextCursor)) return;
      const cursor = mode === "more" ? current.content.nextCursor : null;
      const controller = new AbortController();
      entry.requests.set(tab, controller);
      replace(entry, tab, { ...current, loading: mode === "initial", loadingMore: mode === "more", error: "", errorKind: null }); emit();
      const isCurrent = () => allowed(scope) && entries.get(userId) === entry && entry.requests.get(tab) === controller && !controller.signal.aborted;
      try {
        const page = await loadPage({ userId, tab, cursor, signal: controller.signal });
        if (!isCurrent()) return;
        if (mode === "more" && page.nextCursor === cursor) throw new Error("Profil geçmişi ilerleyemedi. Tekrar deneyebilirsin.");
        entry.pages[tab] = mode === "more" ? [...(entry.pages[tab] ?? []), page] : [page];
        replace(entry, tab, { content: mergePages(entry.pages[tab]!), loaded: true, loading: false, loadingMore: false, error: "", errorKind: null });
      } catch (cause) {
        if (!isCurrent()) return;
        const status = cause && typeof cause === "object" && "status" in cause ? cause.status : null;
        if (status === 401) { this.setOwnerScope(null); expiredScope = scope; emit(); return "session-expired" as const; }
        if (status === 403 || status === 404) resetTabs(entry, apiTabs);
        replace(entry, tab, { ...state(entry, tab), loading: false, loadingMore: false, error: cause instanceof Error ? cause.message : "Profil içeriği getirilemedi.", errorKind: mode });
      } finally {
        if (isCurrent()) { entry.requests.delete(tab); emit(); }
        // A 403/404 cancels the ticket while clearing all private target data.
        else if (allowed(scope) && entries.get(userId) === entry && !entry.requests.has(tab)) emit();
      }
    },
    invalidate(scope: string, userId?: string, tabs: ProfileContentTab[] = apiTabs) {
      if (!allowed(scope)) return;
      for (const [id, entry] of entries) if (!userId || id === userId) resetTabs(entry, tabs);
      emit();
    },
    updatePost(scope: string, id: string | number, changes: ProfilePostChanges) { changePosts(scope, id, changes); },
    removePost(scope: string, id: string | number) { changePosts(scope, id, null); },
  };
}

export const profileContentState = createProfileContentState();
export const setProfileContentOwnerScope = (scope: string | null) => profileContentState.setOwnerScope(scope);
export const invalidateProfileContent = (scope: string, userId?: string, tabs?: ProfileContentTab[]) => profileContentState.invalidate(scope, userId, tabs);
export const updateProfileContentPost = (scope: string, id: string | number, changes: ProfilePostChanges) => profileContentState.updatePost(scope, id, changes);
export const removeProfileContentPost = (scope: string, id: string | number) => profileContentState.removePost(scope, id);
