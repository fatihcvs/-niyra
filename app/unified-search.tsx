"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { AppLink, useAppNavigation } from "./app-navigation";
import { WorkspaceEmpty } from "./workspace-ui";
import { useWorkspaceState } from "./use-workspace-state";
import { notesHref } from "../lib/notes-navigation";
import { noteHref, communityHref } from "../lib/workspace-navigation";
import { useScopedRequests } from "./use-scoped-requests";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
type SearchData = {
  people: Array<{ public_id: string; display_name: string; handle: string; department_name: string }>;
  courses: Array<{ id: string; code: string; name: string; department_name: string }>;
  posts: Array<{ id: string; content: string; author_name: string; course_code: string; time: string }>;
  notes: Array<{ id: string; title: string; owner_name: string; course_code: string; view_count: number }>;
  communities: Array<{ id: string; name: string; description: string; member_count: number }>;
};


export function UnifiedSearchResults({ query, scope = "campus" }: { query: string; scope?: "platform" | "campus" }) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  const clean = query.trim();
  if (clean.length < 2) return null;
  return <SearchResults key={`${ownerScope}:${scope}:${clean}`} query={clean} scope={scope}/>;
}

function SearchResults({ query, scope }: { query: string; scope: "platform" | "campus" }) {
  const requests = useScopedRequests();
  const [data, setData] = useWorkspaceState<SearchData | null>(`search:${scope}:${query}`, null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (data && retry === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = await requests.json<SearchData & { error?: string }>(`/api/search?scope=${scope}&q=${encodeURIComponent(query)}`, { signal: controller.signal }, "Arama tamamlanamadı.");
        if (controller.signal.aborted) return;
        if (![body.people, body.courses, body.posts, body.notes, body.communities].every(Array.isArray)) throw new Error("Arama sonucu okunamadı. Yeniden deneyebilirsin.");
        setData(body);
      } catch (searchError) {
        if (!controller.signal.aborted) setError(!requests.isActive() ? "Oturumun sona erdi. Yeniden giriş yapabilirsin." : searchError instanceof Error ? searchError.message : "Arama tamamlanamadı.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 260);
    return () => { clearTimeout(timer); controller.abort(); };
  // Each query/scope/owner is a new keyed view. Data is its initial, session-scoped cache snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, retry, requests]);
  if (loading) return <div className="unified-results" data-scroll-pending="true"><WorkspaceEmpty title="Kampira’da aranıyor" description="Öğrenciler, dersler, gönderiler, notlar ve topluluklar taranıyor."/></div>;
  if (error) return <div className="unified-results"><WorkspaceEmpty error title="Arama tamamlanamadı" description={error} action={<button type="button" onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Tekrar dene</button>}/></div>;
  if (!data) return null;
  const total = data.people.length + data.courses.length + data.posts.length + data.notes.length + data.communities.length;
  if (!total) return <div className="unified-results"><WorkspaceEmpty title="Sonuç bulunamadı" description="Ders kodunu, konu adını veya öğrenci adını farklı yazmayı dene."/></div>;
  return <section className="unified-results" aria-label="Tüm arama sonuçları">
    <div className="workspace-result-summary unified-result-summary" role="status"><span><strong>{total}</strong> sonuç gösteriliyor · “{query.trim()}”</span></div>
    {data.people.length > 0 && <SearchGroup title="Öğrenciler">{data.people.map((person) => <AppLink href={`/?profile=${encodeURIComponent(person.public_id)}`} key={person.public_id}><span className="feature-avatar">{initials(person.display_name)}</span><div><strong>{person.display_name}</strong><small>@{person.handle} · {person.department_name}</small></div><i aria-hidden="true"><ArrowRight size={18}/></i></AppLink>)}</SearchGroup>}
    {data.courses.length > 0 && <SearchGroup title="Kampüsündeki dersler">{data.courses.map((course) => <AppLink href={notesHref(course)} key={course.id}><span className="feature-avatar">{course.code.slice(0, 2)}</span><div><strong>{course.code} · {course.name}</strong><small>{course.department_name}</small></div><i aria-hidden="true"><ArrowRight size={18}/></i></AppLink>)}</SearchGroup>}
    {data.notes.length > 0 && <SearchGroup title="Kampüsündeki notlar">{data.notes.map((note) => <AppLink href={noteHref(note.id)} key={note.id}><span className="feature-avatar">PDF</span><div><strong>{note.title}</strong><small>{note.course_code} · {note.owner_name} · {note.view_count} görüntülenme</small></div><i aria-hidden="true"><ArrowRight size={18}/></i></AppLink>)}</SearchGroup>}
    {data.posts.length > 0 && <SearchGroup title="Gönderiler">{data.posts.map((post) => <AppLink href={`/?post=${encodeURIComponent(post.id)}`} key={post.id}><span className="feature-avatar">{initials(post.author_name)}</span><div><strong>{post.author_name} · {post.course_code}</strong><small>{post.content.slice(0, 110)} · {post.time} önce</small></div><i aria-hidden="true"><ArrowRight size={18}/></i></AppLink>)}</SearchGroup>}
    {data.communities.length > 0 && <SearchGroup title="Kampüsündeki topluluklar">{data.communities.map((community) => <AppLink href={communityHref(community.id)} key={community.id}><span className="feature-avatar"><UsersThree size={22} aria-hidden="true"/></span><div><strong>{community.name}</strong><small>{community.member_count} üye · {community.description.slice(0, 90)}</small></div><i aria-hidden="true"><ArrowRight size={18}/></i></AppLink>)}</SearchGroup>}
  </section>;
}

function SearchGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="search-group"><h2>{title}</h2><div>{children}</div></div>;
}
