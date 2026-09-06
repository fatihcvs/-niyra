import type { FeedPage, Post, Profile } from "./api";

export type Route = { name: "feed" | "messages" | "composer" } | { name: "profile"; id: string };
export type Draft = { text: string; audience: "campus" | "platform"; key: string | null };
const emptyDraft = (): Draft => ({ text: "", audience: "platform", key: null });

/** Pure memory state. No AsyncStorage, browser history, file, cookie or token storage. */
export function createSessionState() {
  let owner: string | null = null; let generation = 0;
  let routeStack: Route[] = [{ name: "feed" }];
  let draft = emptyDraft(); let feed: FeedPage = { posts: [], nextCursor: null }; let feedLoaded = false; let feedOffset = 0;
  const lanes = new Map<string,AbortController>();
  const publications = new Set<string>();
  function abortAll() { lanes.forEach((controller) => controller.abort()); lanes.clear(); generation++; }
  function clear() { abortAll(); publications.clear(); routeStack = [{ name: "feed" }]; draft = emptyDraft(); feed = { posts: [], nextCursor: null }; feedLoaded = false; feedOffset = 0; }
  return {
    setOwner(profile: Pick<Profile,"publicId"> | null) { const next = profile?.publicId ?? null; if (owner !== next || next === null) { clear(); owner = next; } },
    pause: abortAll,
    begin(lane: string) {
      lanes.get(lane)?.abort(); const controller = new AbortController(); lanes.set(lane,controller);
      const startedGeneration = generation; const startedOwner = owner;
      return { signal: controller.signal, current: () => !controller.signal.aborted && generation === startedGeneration && owner === startedOwner && lanes.get(lane) === controller, cancel() { controller.abort(); if (lanes.get(lane) === controller) lanes.delete(lane); }, finish() { if (lanes.get(lane) === controller) lanes.delete(lane); } };
    },
    get owner() { return owner; },
    get route() { return routeStack.at(-1)!; },
    navigate(route: Route) { if (route.name === "profile" || route.name === "composer") routeStack = [...routeStack.slice(-6),route]; else routeStack = [route]; },
    back() { if (routeStack.length > 1) { routeStack = routeStack.slice(0,-1); return true; } if (routeStack[0].name !== "feed") { routeStack = [{name:"feed"}]; return true; } return false; },
    get draft() { return { ...draft }; },
    editDraft(text: string, audience = draft.audience) { if (!owner) return; if (text !== draft.text || audience !== draft.audience) draft = { text: text.slice(0,1200), audience, key: null }; },
    publicationKey(generate: () => string) { if (!owner) throw new Error("Oturum doğrulanmadı."); if (!draft.key) { draft.key = generate(); publications.add(draft.key); if (publications.size > 16) publications.delete(publications.values().next().value!); } return draft.key; },
    confirmPublish(key: string, post: Post) { if (!owner || !publications.has(key)) return; publications.delete(key); if (draft.key === key) draft = emptyDraft(); feed = { ...feed, posts: [post,...feed.posts.filter((item) => item.id !== post.id)] }; },
    get feed() { return feed; },
    get feedLoaded() { return feedLoaded; },
    setFeed(page: FeedPage, append: boolean) {
      if (!owner) return;
      // Keep whole API pages, never trim and fabricate a cursor; stop additional reads at 200 posts.
      const byId = new Map((append ? feed.posts : []).map((post) => [post.id,post])); page.posts.forEach((post) => byId.set(post.id,post));
      feed = { posts: [...byId.values()], nextCursor: page.nextCursor }; feedLoaded = true;
    },
    get canLoadMore() { return feed.posts.length < 200 && Boolean(feed.nextCursor); },
    get feedOffset() { return feedOffset; },
    setFeedOffset(value: number) { if (Number.isFinite(value)) feedOffset = Math.max(0,value); },
  };
}
