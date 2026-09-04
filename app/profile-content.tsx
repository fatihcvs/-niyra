"use client";
/* eslint-disable @next/next/no-img-element -- authenticated post media uses same-origin storage routes */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { FilmStrip } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import type { ProfilePost, ProfileNote, ProfileCommunity } from "../lib/profile-content";

type Tab = "posts" | "images" | "videos" | "notes" | "communities" | "about";
type Content = { posts: ProfilePost[]; notes: ProfileNote[]; communities: ProfileCommunity[]; nextCursor: string | null };
type PostActions = { onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onInteractionUpdated: (id: number | string, changes: Partial<Pick<ProfilePost, "liked" | "saved" | "likes" | "comments">>) => void };
const emptyContent: Content = { posts: [], notes: [], communities: [], nextCursor: null };
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "posts", label: "Gönderiler" }, { id: "images", label: "Görseller" }, { id: "videos", label: "Videolar" },
  { id: "notes", label: "Notlar" }, { id: "communities", label: "Topluluklar" }, { id: "about", label: "Hakkında" },
];
const emptyCopy: Record<Exclude<Tab, "about">, [string, string]> = {
  posts: ["Henüz gönderi yok", "Kampüs paylaşımları burada görünecek."],
  images: ["Henüz görsel paylaşılmadı", "Fotoğraflı paylaşımlar burada üçlü kare galeri olarak bir araya gelir."],
  videos: ["Henüz video paylaşılmadı", "Video paylaşımları burada yer alır. İzlemek için bir videoya dokun."],
  notes: ["Henüz not yok", "Paylaşılan ders notları burada listelenir."],
  communities: ["Henüz topluluk yok", "Katılınan ve sana görünür olan topluluklar burada listelenir."],
};

export function ProfileContent({ userId, own, about, renderPost, onCreate, onNavigate }: {
  userId: string; own: boolean; about: ReactNode;
  renderPost: (post: ProfilePost, actions: PostActions) => ReactNode;
  onCreate?: () => void; onNavigate?: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("posts");
  const [content, setContent] = useState<Content>(emptyContent);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewerTrigger = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const selectedIndex = content.posts.findIndex((post) => String(post.id) === selectedId);
  const selectedPost = content.posts[selectedIndex];
  const viewerOpen = Boolean(selectedId);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (tab === "about") return;
    const controller = new AbortController();
    requestRef.current = controller;
    fetch(`/api/profile/content?${new URLSearchParams({ user: userId, tab })}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Profil içeriği getirilemedi.");
        if (!controller.signal.aborted) setContent({ ...emptyContent, ...data });
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Profil içeriği getirilemedi."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, tab, revision]);

  useEffect(() => {
    if (!viewerOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; viewerTrigger.current?.focus(); };
  }, [viewerOpen]);

  function chooseTab(next: Tab) {
    if (next === tab) return;
    requestRef.current?.abort();
    setTab(next); setContent(emptyContent); setLoading(true); setLoadingMore(false); setError(""); setSelectedId(null);
  }

  async function loadMore() {
    if (!content.nextCursor || loadingMore) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoadingMore(true); setError("");
    try {
      const response = await fetch(`/api/profile/content?${new URLSearchParams({ user: userId, tab, cursor: content.nextCursor })}`, { signal: controller.signal });
      const data = await response.json() as Content & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Diğer paylaşımlar getirilemedi.");
      if (controller.signal.aborted) return;
      setContent((current) => ({
        posts: [...current.posts, ...(data.posts ?? []).filter((post) => !current.posts.some((item) => item.id === post.id))],
        notes: [...current.notes, ...(data.notes ?? []).filter((note) => !current.notes.some((item) => item.id === note.id))],
        communities: [...current.communities, ...(data.communities ?? []).filter((community) => !current.communities.some((item) => item.id === community.id))],
        nextCursor: data.nextCursor,
      }));
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Diğer paylaşımlar getirilemedi."); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  const actions: PostActions = {
    onInteractionUpdated: (id, changes) => setContent((current) => ({ ...current, posts: current.posts.map((post) => post.id === id ? { ...post, ...changes } : post) })),
    onPostUpdated: (id, text) => setContent((current) => ({ ...current, posts: current.posts.map((post) => post.id === id ? { ...post, text, edited: true } : post) })),
    onPostDeleted: (id) => { setContent((current) => ({ ...current, posts: current.posts.filter((post) => post.id !== id) })); setSelectedId(null); },
  };
  const empty = tab === "notes" ? content.notes.length === 0 : tab === "communities" ? content.communities.length === 0 : content.posts.length === 0;

  return <>
    <div className="profile-tabs" role="tablist" aria-label="Profil bölümleri">
      {tabs.map((item, index) => <button key={item.id} id={`profile-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`profile-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => chooseTab(item.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); chooseTab(tabs[next].id); document.getElementById(`profile-tab-${tabs[next].id}`)?.focus();
      }}>{item.id === "images" && <ImageSquare size={16}/>} {item.id === "videos" && <FilmStrip size={16}/>} {own && item.id === "notes" ? "Notlarım" : own && item.id === "about" ? "Hakkımda" : item.label}</button>)}
    </div>
    <section className="profile-content-panel" id={`profile-panel-${tab}`} role="tabpanel" aria-labelledby={`profile-tab-${tab}`} tabIndex={0} aria-busy={tab !== "about" && loading}>
      {tab === "about" ? about : loading ? <div className="profile-empty-posts" role="status"><strong>İçerik yükleniyor…</strong></div> : <>
        {error && <div className="profile-content-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Tekrar dene</button></div>}
        {!error && empty ? <div className="profile-empty-posts"><span>{tab === "videos" ? <FilmStrip size={24}/> : tab === "images" ? <ImageSquare size={24}/> : "◇"}</span><strong>{emptyCopy[tab][0]}</strong><p>{emptyCopy[tab][1]}</p>{own && onCreate && ["posts", "images", "videos"].includes(tab) && <button className="profile-content-action" type="button" onClick={onCreate}>Paylaşım oluştur</button>}{own && onNavigate && tab === "notes" && <button className="profile-content-action" type="button" onClick={() => onNavigate("Notlar")}>Not yükle</button>}{onNavigate && tab === "communities" && <button className="profile-content-action" type="button" onClick={() => onNavigate("Topluluklar")}>Toplulukları keşfet</button>}</div> : null}
        {tab === "posts" && content.posts.map((post) => <div key={post.id}>{renderPost(post, actions)}</div>)}
        {(tab === "images" || tab === "videos") && content.posts.length > 0 && <div className={`profile-media-grid ${tab === "videos" ? "profile-video-grid" : ""}`}>
          {content.posts.map((post) => {
            const media = post.media?.find((item) => item.kind === (tab === "videos" ? "video" : "image"));
            if (!media) return null;
            return <button className="profile-media-tile" type="button" key={post.id} onClick={(event) => { viewerTrigger.current = event.currentTarget; setSelectedId(String(post.id)); }} aria-label={`${tab === "videos" ? "Videoyu" : "Görseli"} aç: ${post.text || post.name}`}>
              {media.kind === "image" ? <img src={media.url} alt={post.text || `${post.name} tarafından paylaşılan fotoğraf`} loading="lazy"/> : <><video src={`${media.url}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true"/><span className="profile-video-play"><Play size={23} weight="fill"/></span></>}
              <span className="profile-media-caption"><span>{post.text || (tab === "videos" ? "Video paylaşımı" : "Fotoğraf paylaşımı")}</span><small>♡ {post.likes} · {post.comments} yorum</small></span>
            </button>;
          })}
        </div>}
        {tab === "notes" && <div className="profile-note-list">{content.notes.map((note) => <article key={note.id}><span className="profile-note-mark">{note.contentType === "application/pdf" ? "PDF" : "NOT"}</span><div><small>{note.courseCode} · {note.time} önce</small><h2>{note.title}</h2><p>{note.description}</p><span>{note.status === "published" ? "Yayında" : note.status === "processing" ? "İşleniyor" : "Reddedildi"}</span></div><a href={note.fileUrl} target="_blank" rel="noreferrer">Notu aç ↗</a></article>)}</div>}
        {tab === "communities" && <div className="profile-community-list">{content.communities.map((community) => <article key={community.id}><span className="profile-community-mark">{community.name.slice(0, 2).toLocaleUpperCase("tr-TR")}</span><div><h2>{community.name}</h2><p>{community.description}</p><small>{community.memberCount} üye{community.courseCode ? ` · ${community.courseCode}` : ""}{community.joined ? " · Üyesin" : ""}</small></div></article>)}{content.communities.length > 0 && onNavigate && <button className="profile-content-action" type="button" onClick={() => onNavigate("Topluluklar")}>Topluluklara git</button>}</div>}
        {content.nextCursor && <button className="feed-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Yükleniyor…" : "Daha fazla göster"}</button>}
      </>}
    </section>
    {selectedPost && <dialog className={`profile-media-viewer ${tab === "videos" ? "is-video" : ""}`} ref={dialogRef} aria-label={tab === "videos" ? "Video paylaşımı" : "Görsel paylaşımı"} onCancel={() => setSelectedId(null)} onClose={() => setSelectedId(null)} onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }} onKeyDown={(event) => {
      if ((event.target as HTMLElement).tagName === "VIDEO" || (event.target as HTMLElement).matches("input, textarea")) return;
      if (event.key === "ArrowLeft" && selectedIndex > 0) setSelectedId(String(content.posts[selectedIndex - 1].id));
      if (event.key === "ArrowRight" && selectedIndex < content.posts.length - 1) setSelectedId(String(content.posts[selectedIndex + 1].id));
    }}>
      <header><strong>{tab === "videos" ? "Videolar" : "Görseller"} <small>{selectedIndex + 1} / {content.posts.length}</small></strong><div><button type="button" disabled={selectedIndex === 0} onClick={() => setSelectedId(String(content.posts[selectedIndex - 1].id))} aria-label="Önceki paylaşım"><ArrowLeft size={20}/></button><button type="button" disabled={selectedIndex === content.posts.length - 1} onClick={() => setSelectedId(String(content.posts[selectedIndex + 1].id))} aria-label="Sonraki paylaşım"><ArrowRight size={20}/></button><button type="button" onClick={() => setSelectedId(null)} aria-label="Görüntüleyiciyi kapat" autoFocus><X size={22}/></button></div></header>
      <div key={selectedPost.id}>{renderPost(selectedPost, actions)}</div>
    </dialog>}
  </>;
}
