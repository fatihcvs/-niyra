"use client";
/* eslint-disable @next/next/no-img-element -- authenticated post media uses same-origin storage routes */

import { type ReactNode, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { FilmStrip } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Stack } from "@phosphor-icons/react/dist/csr/Stack";
import { Note } from "@phosphor-icons/react/dist/csr/Note";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import type { ProfilePost, ProfileContentTab } from "../lib/profile-content";
import { emptyProfileTabState, inactiveProfileContentSnapshot, profileContentState, type ProfileTab } from "../lib/profile-content-state";
import { useAppLayer } from "./use-app-layer";
import { AppLink } from "./app-navigation";
import { noteHref, communityHref } from "../lib/workspace-navigation";

type Tab = ProfileTab;
function ProfileMediaPreview({ kind, url, alt }: { kind: "image" | "video"; url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const inspect = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && (!element.naturalWidth || (element.naturalWidth === 1 && element.naturalHeight === 1))) setFailed(true);
  }, []);
  if (failed) return <span className="profile-media-unavailable" role="img" aria-label={kind === "image" ? "Görsel önizlemesi yüklenemedi" : "Video önizlemesi yüklenemedi"} style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", justifyItems: "center", gap: 8, padding: 12, background: "var(--card)", color: "var(--muted)", fontSize: 12 }}>{kind === "image" ? <ImageSquare size={28} aria-hidden="true"/> : <FilmStrip size={28} aria-hidden="true"/>}<span>Önizleme yüklenemedi</span></span>;
  return kind === "image" ? <img src={url} alt={alt} loading="lazy" ref={inspect} onLoad={(event) => inspect(event.currentTarget)} onError={() => setFailed(true)}/> : <><video src={`${url}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" onError={() => setFailed(true)}/><span className="profile-video-play"><Play size={23} weight="fill"/></span></>;
}

type PostActions = { onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onInteractionUpdated: (id: number | string, changes: Partial<Pick<ProfilePost, "liked" | "saved" | "likes" | "comments">>) => void };
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "posts", label: "Gönderiler" }, { id: "images", label: "Görseller" }, { id: "videos", label: "Videolar" },
  { id: "notes", label: "Notlar" }, { id: "communities", label: "Topluluklar" }, { id: "about", label: "Hakkında" },
];
const emptyCopy: Record<Exclude<Tab, "about">, [string, string]> = {
  posts: ["Henüz gönderi yok", "Kampüs paylaşımları burada görünecek."],
  images: ["Henüz görsel paylaşılmadı", "Fotoğraflı paylaşımlar burada görünür."],
  videos: ["Henüz video paylaşılmadı", "Video paylaşımları burada yer alır. İzlemek için bir videoya dokun."],
  notes: ["Henüz not yok", "Paylaşılan ders notları burada listelenir."],
  communities: ["Henüz topluluk yok", "Katılınan ve sana görünür olan topluluklar burada listelenir."],
};

type ProfileContentProps = {
  ownerScope: string; userId: string; own: boolean; about: ReactNode;
  renderPost: (post: ProfilePost, actions: PostActions) => ReactNode;
  onCreate?: () => void; onNavigate?: (name: string) => void;
  onSessionExpired?: () => void;
};

export function ProfileContent(props: ProfileContentProps) {
  // Local dialog state must never transfer to another target or auth session.
  return <ProfileContentView key={JSON.stringify([props.ownerScope, props.userId])} {...props}/>;
}

function ProfileContentView({ ownerScope, userId, own, about, renderPost, onCreate, onNavigate, onSessionExpired }: ProfileContentProps) {
  const getSnapshot = useCallback(() => profileContentState.getSnapshot(ownerScope, userId), [ownerScope, userId]);
  const snapshot = useSyncExternalStore(profileContentState.subscribe, getSnapshot, () => inactiveProfileContentSnapshot);
  const tab = snapshot.tab;
  const tabState = tab === "about" ? emptyProfileTabState : snapshot.tabs[tab] ?? emptyProfileTabState;
  const { content, loadingMore, error } = tabState;
  const loading = tabState.loading || (!tabState.loaded && !error);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const contentId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewerTrigger = useRef<HTMLButtonElement | null>(null);
  const lastSelectedId = useRef<string | null>(null);
  const selectedIndex = content.posts.findIndex((post) => String(post.id) === selectedId);
  const selectedPost = content.posts[selectedIndex];
  const viewerOpen = Boolean(selectedPost);
  const { ref: viewerLayerRef, close: closeViewer } = useAppLayer({ id: `profile.viewer:${userId}`, open: viewerOpen, onClose: () => setSelectedId(null), onRestore: () => {
    if (content.posts.some((post) => String(post.id) === lastSelectedId.current)) setSelectedId(lastSelectedId.current);
  } });
  function selectPost(id: string) { lastSelectedId.current = id; setSelectedId(id); }
  const requestTab = useCallback((targetTab: ProfileContentTab, mode: "initial" | "more" = "initial") => {
    void profileContentState.load(ownerScope, userId, targetTab, mode).then((outcome) => { if (outcome === "session-expired") onSessionExpired?.(); });
  }, [ownerScope, userId, onSessionExpired]);

  useEffect(() => profileContentState.attach(ownerScope, userId), [ownerScope, userId, snapshot.active]);

  useEffect(() => {
    if (snapshot.active && tab !== "about" && !tabState.loaded && !tabState.loading && !error) requestTab(tab);
  }, [tab, snapshot.active, tabState.loaded, tabState.loading, error, requestTab]);

  useEffect(() => {
    if (!viewerOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { dialog.close(); if (viewerTrigger.current?.isConnected) viewerTrigger.current.focus({ preventScroll: true }); };
  }, [viewerOpen]);

  function chooseTab(next: Tab) {
    if (next === tab) return;
    profileContentState.chooseTab(ownerScope, userId, next); setSelectedId(null);
  }

  const actions: PostActions = {
    onInteractionUpdated: (id, changes) => profileContentState.updatePost(ownerScope, id, changes),
    onPostUpdated: (id, text) => profileContentState.updatePost(ownerScope, id, { text, edited: true }),
    onPostDeleted: (id) => { profileContentState.removePost(ownerScope, id); setSelectedId(null); },
  };
  const empty = tab === "notes" ? content.notes.length === 0 : tab === "communities" ? content.communities.length === 0 : content.posts.length === 0;
  const primaryTabs = tabs.slice(0, 3);
  const primarySelected = primaryTabs.some((item) => item.id === tab);
  const labelFor = (item: { id: Tab; label: string }) => own && item.id === "notes" ? "Notlarım" : own && item.id === "about" ? "Hakkımda" : item.label;
  const currentLabel = labelFor(tabs.find((item) => item.id === tab)!);

  return <>
    <div className="profile-tabs profile-desktop-tabs" role="tablist" aria-label="Profil bölümleri">
      {tabs.map((item, index) => <button key={item.id} id={`${contentId}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${contentId}-panel`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => chooseTab(item.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); chooseTab(tabs[next].id); document.getElementById(`${contentId}-tab-${tabs[next].id}`)?.focus();
      }}>{item.id === "images" && <ImageSquare size={16}/>} {item.id === "videos" && <FilmStrip size={16}/>} {labelFor(item)}</button>)}
    </div>
    <div className="profile-mobile-controls">
      <div className="profile-mobile-tabs" role="tablist" aria-label="Gönderi türleri">{primaryTabs.map((item, index) => <button key={item.id} id={`${contentId}-mobile-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${contentId}-panel`} tabIndex={tab === item.id || (!primarySelected && index === 0) ? 0 : -1} className={tab === item.id ? "active" : ""} onClick={() => chooseTab(item.id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % primaryTabs.length : event.key === "ArrowLeft" ? (index + primaryTabs.length - 1) % primaryTabs.length : event.key === "Home" ? 0 : event.key === "End" ? primaryTabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); chooseTab(primaryTabs[next].id); document.getElementById(`${contentId}-mobile-tab-${primaryTabs[next].id}`)?.focus();
      }}>{item.label}</button>)}</div>
      <label className="profile-mobile-more"><span className="sr-only">Diğer profil bölümleri</span><select value={primarySelected ? "" : tab} aria-controls={`${contentId}-panel`} onChange={(event) => { if (event.target.value) chooseTab(event.target.value as Tab); }}><option value="" disabled>Diğer profil bölümleri</option>{tabs.slice(3).map((item) => <option key={item.id} value={item.id}>{labelFor(item)}</option>)}</select></label>
    </div>
    <span className="sr-only" id={`${contentId}-panel-label`}>{currentLabel}</span>
    <section data-scroll-pending={tab !== "about" && loading} className="profile-content-panel" id={`${contentId}-panel`} role="tabpanel" aria-labelledby={`${contentId}-panel-label`} tabIndex={0} aria-busy={tab !== "about" && (loading || loadingMore)}>
      {tab === "about" ? about : loading ? <div className="profile-empty-posts" role="status"><strong>İçerik yükleniyor…</strong></div> : <>
        {error && <div className="profile-content-error" role="alert"><p>{error}</p><button type="button" onClick={() => {
          if (snapshot.sessionExpired) { if (onSessionExpired) onSessionExpired(); else window.location.reload(); return; }
          requestTab(tab, tabState.errorKind === "more" ? "more" : "initial");
        }}>Tekrar dene</button></div>}
        {!error && empty ? <div className="profile-empty-posts"><span>{tab === "videos" ? <FilmStrip size={24}/> : tab === "images" ? <ImageSquare size={24}/> : tab === "notes" ? <Note size={24}/> : tab === "communities" ? <UsersThree size={24}/> : <Stack size={24}/>}</span><strong>{emptyCopy[tab][0]}</strong><p>{emptyCopy[tab][1]}</p>{own && onCreate && ["posts", "images", "videos"].includes(tab) && <button className="profile-content-action" type="button" onClick={onCreate}>Paylaşım oluştur</button>}{own && onNavigate && tab === "notes" && <button className="profile-content-action" type="button" onClick={() => onNavigate("Notlar")}>Not yükle</button>}{onNavigate && tab === "communities" && <button className="profile-content-action" type="button" onClick={() => onNavigate("Topluluklar")}>Toplulukları keşfet</button>}</div> : null}
        {tab === "posts" && content.posts.map((post) => <div key={post.id}>{renderPost(post, actions)}</div>)}
        {(tab === "images" || tab === "videos") && content.posts.length > 0 && <div className={`profile-media-grid ${tab === "videos" ? "profile-video-grid" : ""}`}>
          {content.posts.map((post) => {
            const media = post.media?.find((item) => item.kind === (tab === "videos" ? "video" : "image"));
            if (!media) return null;
            return <button className="profile-media-tile" type="button" key={post.id} onClick={(event) => { viewerTrigger.current = event.currentTarget; selectPost(String(post.id)); }} aria-label={`${tab === "videos" ? "Videoyu" : "Görseli"} aç: ${post.text || post.name}`}>
              <ProfileMediaPreview key={`${media.kind}:${media.url}`} kind={media.kind} url={media.url} alt={post.text || `${post.name} tarafından paylaşılan fotoğraf`}/>
              <span className="profile-media-caption"><span>{post.text || (tab === "videos" ? "Video paylaşımı" : "Fotoğraf paylaşımı")}</span><small><Heart size={13} aria-hidden="true" style={{ verticalAlign: "-2px" }}/><span className="sr-only">Beğeni: </span> {post.likes} · {post.comments} yorum</small></span>
            </button>;
          })}
        </div>}
        {tab === "notes" && <div className="profile-note-list">{content.notes.map((note) => <article key={note.id}><span className="profile-note-mark">{note.contentType === "application/pdf" ? "PDF" : "NOT"}</span><div><small>{note.courseCode} · {note.time} önce</small><h2>{note.title}</h2><p>{note.description}</p><span>{note.status === "published" ? "Yayında" : note.status === "processing" ? "İşleniyor" : "Reddedildi"}</span></div><AppLink href={noteHref(note.id)}>Notu aç <ArrowUpRight size={16} aria-hidden="true"/></AppLink></article>)}</div>}
        {tab === "communities" && <div className="profile-community-list">{content.communities.map((community) => <article key={community.id}><span className="profile-community-mark">{community.name.slice(0, 2).toLocaleUpperCase("tr-TR")}</span><div><h2><AppLink href={communityHref(community.id)}>{community.name}</AppLink></h2><p>{community.description}</p><small>{community.memberCount} üye{community.courseCode ? ` · ${community.courseCode}` : ""}{community.joined ? " · Üyesin" : ""}</small></div></article>)}{content.communities.length > 0 && onNavigate && <button className="profile-content-action" type="button" onClick={() => onNavigate("Topluluklar")}>Topluluklara git</button>}</div>}
        {content.nextCursor && <button className="feed-load-more" type="button" disabled={loadingMore} onClick={() => requestTab(tab, "more")}>{loadingMore ? "Yükleniyor…" : "Daha fazla göster"}</button>}
      </>}
    </section>
    {selectedPost && <dialog className={`profile-media-viewer ${tab === "videos" ? "is-video" : ""}`} data-mobile-overlay="true" ref={(node) => { dialogRef.current = node; viewerLayerRef.current = node; }} aria-label={tab === "videos" ? "Video paylaşımı" : "Görsel paylaşımı"} onCancel={(event) => { event.preventDefault(); closeViewer(); }} onClose={() => setSelectedId(null)} onClick={(event) => { if (event.target === event.currentTarget) closeViewer(); }} onKeyDown={(event) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('[role="dialog"]') || (event.target as HTMLElement).tagName === "VIDEO" || (event.target as HTMLElement).matches("input, textarea")) return;
      if (event.key === "ArrowLeft" && selectedIndex > 0) { event.preventDefault(); selectPost(String(content.posts[selectedIndex - 1].id)); }
      if (event.key === "ArrowRight" && selectedIndex < content.posts.length - 1) { event.preventDefault(); selectPost(String(content.posts[selectedIndex + 1].id)); }
    }}>
      <header><strong>{tab === "videos" ? "Videolar" : "Görseller"} <small>{selectedIndex + 1} / {content.posts.length}</small></strong><div><button type="button" disabled={selectedIndex === 0} onClick={() => selectPost(String(content.posts[selectedIndex - 1].id))} aria-label="Önceki paylaşım"><ArrowLeft size={20}/></button><button type="button" disabled={selectedIndex === content.posts.length - 1} onClick={() => selectPost(String(content.posts[selectedIndex + 1].id))} aria-label="Sonraki paylaşım"><ArrowRight size={20}/></button><button type="button" onClick={() => closeViewer()} aria-label="Görüntüleyiciyi kapat" autoFocus><X size={22}/></button></div></header>
      <div key={selectedPost.id}>{renderPost(selectedPost, actions)}</div>
    </dialog>}
  </>;
}
