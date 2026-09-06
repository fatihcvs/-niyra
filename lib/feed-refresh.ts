import type { Post } from "../app/feed-post";
import type { FeedScope } from "./feed-scope";

export type FeedPage = { posts: Post[]; nextCursor: string | null };
export const FEED_CHECK_INTERVAL_MS = 45_000;
export const FEED_READ_TIMEOUT_MS = 20_000;

/** Compare only the server's newest prefix; an older refill after deletion is not new. */
export function hasUnseenFeedPrefix(current: readonly Pick<Post, "id">[], latest: readonly Pick<Post, "id">[]): boolean {
  if (!latest.length) return false;
  const known = new Set(current.map((post) => String(post.id)));
  return !known.has(String(latest[0].id));
}

/** First-page checks, explicit refresh and pagination use the same authenticated GET contract. */
export async function readFeedPage(fetcher: typeof fetch, scope: FeedScope, signal: AbortSignal, cursor?: string | null): Promise<FeedPage> {
  const request = async (): Promise<FeedPage> => {
    const response = await fetcher(`/api/posts?feed=${scope}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
      signal, cache: "no-store", headers: { accept: "application/json" },
    });
    const data = await response.json() as Partial<FeedPage> & { error?: string };
    if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Akış şu anda yenilenemedi.");
    if (!data || !Array.isArray(data.posts)
      || data.posts.some((post) => !post || !["string", "number"].includes(typeof post.id) || !String(post.id).trim() || typeof post.text !== "string" || typeof post.name !== "string")
      || new Set(data.posts.map((post) => String(post.id))).size !== data.posts.length
      || (data.nextCursor !== undefined && data.nextCursor !== null && (typeof data.nextCursor !== "string" || !data.nextCursor || data.nextCursor.length > 400))) {
      throw new Error("Akış yanıtı tamamlanamadı. Yeniden deneyebilirsin.");
    }
    return { posts: data.posts, nextCursor: data.nextCursor ?? null };
  };
  return new Promise<FeedPage>((resolve, reject) => {
    const aborted = () => reject(new DOMException("Akış isteği iptal edildi.", "AbortError"));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    void request().then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}
