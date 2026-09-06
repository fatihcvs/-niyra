"use client";

import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty } from "./workspace-ui";
import type { ProfilePost } from "../lib/profile-content";
import { useWorkspaceState } from "./use-workspace-state";
import { matchesSearch } from "../lib/workspace-navigation";

export function SavedWorkspace({ renderPost, onNavigate }: { renderPost: (post: ProfilePost, onSaved: (saved: boolean) => void, onUpdated: (text: string) => void, onDeleted: () => void) => ReactNode; onNavigate: (name: string) => void }) {
  const fetch = useAuthenticatedFetch();
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [query, setQuery] = useWorkspaceState("saved:query", "");
  const [kind, setKind] = useWorkspaceState("saved:kind", "all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); requestRef.current = controller;
    fetch("/api/posts?feed=saved", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kayıtların getirilemedi.");
      if (!controller.signal.aborted) { setPosts(data.posts ?? []); setNextCursor(data.nextCursor ?? null); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kayıtların getirilemedi."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, [revision, fetch]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController(); requestRef.current = controller;
    setLoadingMore(true); setError("");
    try {
      const response = await fetch(`/api/posts?feed=saved&cursor=${encodeURIComponent(nextCursor)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Diğer kayıtların getirilemedi.");
      if (!controller.signal.aborted) { setPosts((current) => [...current, ...(data.posts as ProfilePost[]).filter((post) => !current.some((item) => item.id === post.id))]); setNextCursor(data.nextCursor ?? null); }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Diğer kayıtların getirilemedi."); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }
  const visible = posts.filter((post) => matchesSearch(query, post.text, post.name, post.course) && (kind === "all" || post.media?.some((media) => media.kind === kind)));
  return <div className="workspace-view saved-workspace"><WorkspaceHeader screenId="saved" section="Kaydedilenler" eyebrow="KİŞİSEL ARŞİVİN" title="Kaydedilenler" description="Faydalı paylaşımlarını bul, yeniden oku veya kayıtlarından çıkar. Bu liste yalnızca sana görünür." secondaryActions={[{ id: "saved.refresh", label: "İçeriği yenile", busy: loading || loadingMore, onPress: () => { setLoading(true); setError(""); setRevision((value) => value + 1); } }]} />
    <WorkspaceSearch value={query} onChange={setQuery} placeholder="Kayıtlarında içerik, kişi veya ders ara" resultCount={loading ? undefined : visible.length} onReset={query || kind !== "all" ? () => { setQuery(""); setKind("all"); } : undefined}><label><span className="sr-only">Kayıt türü</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Tüm paylaşımlar</option><option value="image">Görseller</option><option value="video">Videolar</option></select></label></WorkspaceSearch>
    {error && <WorkspaceEmpty error title="Kayıtların yenilenemedi" description={error}/>}
    {loading ? <WorkspaceEmpty title="Kayıtların yükleniyor…" description="Kişisel arşivin hazırlanıyor."/> : !posts.length && !error ? <WorkspaceEmpty title="İlk kaydın için yer hazır" description="Bir gönderideki yer imine dokun. İhtiyaç duyduğunda buradan kolayca geri dönebilirsin." action={<button type="button" onClick={() => onNavigate("Akış")}>Akışa göz at</button>}/> : !visible.length && !error ? <WorkspaceEmpty description={nextCursor ? "Yüklenen kayıtlarda eşleşme yok. Daha fazla kayıt yükleyebilir veya filtrelerini değiştirebilirsin." : undefined}/> : <div className="feed-list">{visible.map((post) => <div key={post.id}>{renderPost(post, (saved) => { setPosts((current) => saved ? current.some((item) => item.id === post.id) ? current : [post, ...current] : current.filter((item) => item.id !== post.id)); }, (text) => setPosts((current) => current.map((item) => item.id === post.id ? { ...item, text, edited: true } : item)), () => setPosts((current) => current.filter((item) => item.id !== post.id)))}</div>)}</div>}
    {!loading && nextCursor && <button className="feed-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Yükleniyor…" : "Daha fazla kayıt göster"}</button>}
  </div>;
}
