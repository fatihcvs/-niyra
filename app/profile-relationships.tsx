"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { AppLink, useAppNavigation, type FollowChange } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { useScopedRequests } from "./use-scoped-requests";
import { useWorkspaceState } from "./use-workspace-state";
import { getProfileRelationshipRevision, subscribeProfileRelationships, unavailableRelationshipProfile, validRelationshipPage, type RelationshipKind, type RelationshipPage, type RelationshipPerson } from "../lib/profile-relationships";
import styles from "./profile-relationships.module.css";

type Props = {
  targetId: string; targetName: string; postCount: number; followerCount: number; followingCount: number; courseCount: number;
  preview?: { mode: "gallery"; state?: "full" | "empty" };
};
type View = { query: string; page: RelationshipPage | null; loading: boolean; error: string; scrollTop: number };
const blankView = (): View => ({ query: "", page: null, loading: false, error: "", scrollTop: 0 });
const labels: Record<RelationshipKind, string> = { followers: "Takipçiler", following: "Takip edilenler" };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
const directImageSource = ({ src }: { src: string }) => src;

export function ProfileRelationshipStats(props: Props) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  return <RelationshipStats key={JSON.stringify([ownerScope, props.targetId, props.preview?.mode, props.preview?.state])} {...props}/>;
}

function RelationshipStats({ targetId, targetName, postCount, followerCount, followingCount, courseCount, preview }: Props) {
  const navigation = useAppNavigation();
  const requests = useScopedRequests();
  const epoch = useSyncExternalStore(subscribeProfileRelationships, getProfileRelationshipRevision, () => 0);
  const acceptedEpoch = useRef(epoch);
  const [saved, setSaved] = useWorkspaceState(`relationships:${preview ? `gallery:${preview.state ?? "full"}:` : ""}${targetId}`, { kind: "followers" as RelationshipKind, followerCount, followingCount, epoch, views: { followers: blankView(), following: blankView() } });
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.history.state?.kampiraLayer?.id === `profile.relationships:${targetId}`);
  const [kind, setKind] = useState<RelationshipKind>(saved.kind);
  const [views, setViews] = useState<Record<RelationshipKind, View>>(() => saved.epoch === epoch && saved.followerCount === followerCount && saved.followingCount === followingCount ? saved.views : { followers: { ...saved.views.followers, page: null, scrollTop: 0 }, following: { ...saved.views.following, page: null, scrollTop: 0 } });
  const cache = useRef(views);
  const confirmedCounts = useRef({ followerCount, followingCount });
  const [revision, setRevision] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null), [actionError, setActionError] = useState("");
  const actionLock = useRef(false), generation = useRef(0), listRequest = useRef<AbortController | null>(null);
  const queryInput = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const removedFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  const { ref: layerRef, close } = useAppLayer({ id: `profile.relationships:${targetId}`, open, onClose: () => setOpen(false), onRestore: () => setOpen(true) });
  const changeView = useCallback((selected: RelationshipKind, update: (current: View) => View) => {
    cache.current = { ...cache.current, [selected]: update(cache.current[selected]) };
    setViews(cache.current);
  }, []);
  const cancelList = useCallback(() => { generation.current++; listRequest.current?.abort(); listRequest.current = null; }, []);
  const query = views[kind].query;
  useEffect(() => {
    if (acceptedEpoch.current === epoch || preview) return;
    acceptedEpoch.current = epoch;
    cancelList();
    for (const selected of ["followers", "following"] as const) changeView(selected, (current) => ({ ...current, page: null, loading: false, error: "", scrollTop: 0 }));
    setRevision((current) => current + 1);
  }, [cancelList, changeView, epoch, preview]);
  useEffect(() => {
    const previous = confirmedCounts.current;
    confirmedCounts.current = { followerCount, followingCount };
    if (previous.followerCount === followerCount && previous.followingCount === followingCount) return;
    cancelList();
    if (previous.followerCount !== followerCount) changeView("followers", (current) => ({ ...current, page: null, loading: false, error: "", scrollTop: 0 }));
    if (previous.followingCount !== followingCount) changeView("following", (current) => ({ ...current, page: null, loading: false, error: "", scrollTop: 0 }));
    setRevision((current) => current + 1);
  }, [cancelList, changeView, followerCount, followingCount]);
  useEffect(() => {
    const stored = (view: View) => ({ ...view, loading: false, ...(view.page && view.page.people.length > 200 ? { page: null, scrollTop: 0 } : {}) });
    setSaved({ kind, followerCount, followingCount, epoch, views: { followers: stored(views.followers), following: stored(views.following) } });
  }, [epoch, followerCount, followingCount, kind, setSaved, views]);
  useEffect(() => { if (open && contentRef.current) contentRef.current.scrollTop = cache.current[kind].scrollTop; }, [kind, open, query]);
  useEffect(() => {
    const removed = removedFocus.current;
    if (!removed || removed.isConnected) return;
    removedFocus.current = null;
    (contentRef.current?.querySelector<HTMLElement>("a[href]") ?? contentRef.current)?.focus({ preventScroll: true });
  }, [views]);

  const load = useCallback(async (more = false) => {
    if (listRequest.current || actionLock.current) return;
    const previous = cache.current[kind];
    const cursor = more ? previous.page?.nextCursor : null;
    if (more && !cursor) return;
    const currentGeneration = ++generation.current;
    const requestEpoch = getProfileRelationshipRevision();
    const controller = new AbortController(); listRequest.current = controller;
    changeView(kind, (current) => ({ ...current, loading: true, error: "" }));
    try {
      let page: RelationshipPage;
      const searchQuery = query.trim();
      if (preview) {
        const people: RelationshipPerson[] = preview.state === "empty" ? [] : [
          { publicId: targetId, displayName: "Galeri simülasyonu · Sen", handle: "galeri-sen", universityShortName: "Galeri", avatarUrl: null, isFollowing: false, isSelf: true },
          { publicId: "gallery-relation-1", displayName: "Galeri simülasyonu · Deniz", handle: "galeri-deniz", universityShortName: "Galeri", avatarUrl: null, isFollowing: true, isSelf: false },
          { publicId: "gallery-relation-2", displayName: "Galeri simülasyonu · Ece", handle: "galeri-ece", universityShortName: "Galeri", avatarUrl: null, isFollowing: false, isSelf: false },
        ];
        page = { targetId, kind, query: searchQuery, viewerId: targetId, people: people.filter((person) => `${person.displayName} ${person.handle}`.toLocaleLowerCase("tr-TR").includes(searchQuery.toLocaleLowerCase("tr-TR"))), nextCursor: null };
      } else {
        const params = new URLSearchParams({ id: targetId, kind, q: searchQuery });
        if (cursor) params.set("cursor", cursor);
        page = await requests.json<RelationshipPage>(`/api/profile-relationships?${params}`, { cache: "no-store", signal: controller.signal }, "Takip listesi alınamadı.");
        if (!validRelationshipPage(page, targetId, kind, searchQuery)) throw new Error("Liste yanıtı doğrulanamadı. Yeniden dene.");
      }
      if (controller.signal.aborted || generation.current !== currentGeneration || (!preview && requestEpoch !== getProfileRelationshipRevision())) return;
      changeView(kind, (current) => ({ ...current, loading: false, error: "", page: { ...page, people: more && current.page ? [...new Map([...current.page.people, ...page.people].map((person) => [person.publicId, person])).values()] : page.people } }));
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === currentGeneration && requests.isActive()) {
        const error = cause instanceof Error ? cause.message : "Takip listesi alınamadı.";
        if (error === unavailableRelationshipProfile) {
          for (const selected of ["followers", "following"] as const) changeView(selected, (current) => ({ ...current, loading: false, error, page: null, scrollTop: 0 }));
        } else changeView(kind, (current) => ({ ...current, loading: false, error }));
      }
    } finally {
      if (listRequest.current === controller) listRequest.current = null;
    }
  }, [changeView, kind, preview, query, requests, targetId]);

  useEffect(() => {
    if (!open) return;
    // Closing/reopening or browser Forward retains already loaded pages and the cursor.
    if (cache.current[kind].page && !cache.current[kind].error) return;
    const timer = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => { window.clearTimeout(timer); cancelList(); };
  }, [cancelList, kind, load, open, query, revision]);
  useEffect(() => () => cancelList(), [cancelList]);
  useEffect(() => {
    if (open) return;
    cancelList();
    for (const selected of ["followers", "following"] as const) {
      if (cache.current[selected].loading) changeView(selected, (current) => ({ ...current, loading: false }));
    }
  }, [cancelList, changeView, open]);

  function selectKind(next: RelationshipKind) {
    cancelList();
    for (const selected of ["followers", "following"] as const) {
      if (cache.current[selected].loading) changeView(selected, (current) => ({ ...current, loading: false }));
    }
    setKind(next); setActionError("");
  }
  function editQuery(value: string) {
    cancelList();
    changeView(kind, () => ({ query: value.trimStart().normalize("NFC").slice(0, 60), page: null, loading: false, error: "", scrollTop: 0 }));
  }
  function switchTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "followers" : event.key === "End" ? "following" : kind === "followers" ? "following" : "followers";
    selectKind(next); document.getElementById(`${id}-${next}`)?.focus();
  }

  async function follow(person: RelationshipPerson, control: HTMLButtonElement) {
    if (actionLock.current || person.isSelf) return;
    actionLock.current = true; setPendingId(person.publicId); setActionError(""); cancelList();
    for (const selected of ["followers", "following"] as const) changeView(selected, (current) => ({ ...current, loading: false }));
    const active = !person.isFollowing;
    try {
      let result: FollowChange;
      if (preview) result = { targetId: person.publicId, active, followerCount: 0, viewerFollowingCount: 0 };
      else {
        result = await requests.json<FollowChange & { error?: string }>("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId: person.publicId, active }) }, "Takip işlemi tamamlanamadı.");
        if (result.targetId !== person.publicId || typeof result.active !== "boolean" || !Number.isSafeInteger(result.followerCount) || result.followerCount < 0 || !Number.isSafeInteger(result.viewerFollowingCount) || result.viewerFollowingCount < 0) throw new Error("Takip sonucu doğrulanamadı. Yeniden dene.");
      }
      if (!requests.isActive()) return;
      if (!result.active && kind === "following" && cache.current.following.page?.viewerId === targetId && document.activeElement === control) removedFocus.current = control;
      if (Object.values(cache.current).some((current) => current.page?.viewerId === targetId)) confirmedCounts.current.followingCount = result.viewerFollowingCount;
      for (const selected of ["followers", "following"] as const) changeView(selected, (current) => ({ ...current, loading: false, page: current.page ? { ...current.page, people: current.page.people.filter((row) => !(selected === "following" && current.page?.viewerId === targetId && row.publicId === person.publicId && !result.active)).map((row) => row.publicId === person.publicId ? { ...row, isFollowing: result.active } : row) } : null }));
      if (!preview) {
        navigation?.onFollowChanged?.(result);
        // This list already applied its own confirmed result. Other mounted/cached lists must reload.
        acceptedEpoch.current = getProfileRelationshipRevision();
      }
    } catch (cause) {
      if (requests.isActive()) setActionError(cause instanceof Error ? cause.message : "Takip işlemi tamamlanamadı.");
    } finally {
      actionLock.current = false;
      if (requests.isActive()) { setPendingId(null); if (!cache.current[kind].page) setRevision((current) => current + 1); }
    }
  }

  const view = views[kind];
  const show = (selected: RelationshipKind) => { selectKind(selected); setOpen(true); };
  return <>
    <div className="profile-stats">
      <strong>{postCount}<span>Gönderi</span></strong>
      <strong><button type="button" className={styles.statButton} aria-label={`${followerCount} takipçi, listeyi aç`} aria-haspopup="dialog" aria-expanded={open && kind === "followers"} onClick={() => show("followers")}>{followerCount}<span>Takipçi</span></button></strong>
      <strong><button type="button" className={styles.statButton} aria-label={`${followingCount} takip edilen, listeyi aç`} aria-haspopup="dialog" aria-expanded={open && kind === "following"} onClick={() => show("following")}>{followingCount}<span>Takip</span></button></strong>
      <strong>{courseCount}<span>Ders çevresi</span></strong>
    </div>
    {open && createPortal(<div className={styles.overlay}>
      <section ref={layerRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} data-mobile-overlay="true">
        <header className={styles.header}><div><h2 id={`${id}-title`}>{targetName}</h2>{preview && <small>Galeri simülasyonu · Örnek veriler</small>}</div><button type="button" className={styles.iconButton} aria-label="Takip listesini kapat" onClick={() => close()}><X size={24} aria-hidden="true"/></button></header>
        <div className={styles.tabs} role="tablist" aria-label="Takip listeleri">{(["followers", "following"] as const).map((selected) => <button key={selected} type="button" role="tab" id={`${id}-${selected}`} aria-selected={kind === selected} tabIndex={kind === selected ? 0 : -1} aria-controls={`${id}-panel`} onKeyDown={switchTab} onClick={() => selectKind(selected)}>{labels[selected]}</button>)}</div>
        <label className={styles.search}><MagnifyingGlass size={20} aria-hidden="true"/><input ref={queryInput} aria-label="Takip listesinde ara" type="search" autoComplete="off" value={query} maxLength={60} onChange={(event) => editQuery(event.target.value)} placeholder="İsim veya kullanıcı adı ara"/></label>
        <div ref={contentRef} className={styles.content} id={`${id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${kind}`} aria-busy={view.loading} onScroll={(event) => { const scrollTop = event.currentTarget.scrollTop; if (scrollTop !== cache.current[kind].scrollTop) changeView(kind, (current) => ({ ...current, scrollTop })); }}>
          {view.error && <div className={styles.error} role="alert"><p>{view.error}</p><button type="button" onClick={() => void load(Boolean(view.page?.nextCursor))} disabled={view.loading}>Tekrar dene</button></div>}
          {actionError && <p className={styles.error} role="alert">{actionError}</p>}
          {view.page && <ul className={styles.list}>{view.page.people.map((person) => <li key={person.publicId}>
            <AppLink className={styles.person} href={`/?profile=${encodeURIComponent(person.publicId)}`} onClick={preview ? (event) => event.preventDefault() : undefined} aria-disabled={preview ? true : undefined}>
              <span className={styles.avatar}>{person.avatarUrl ? <Image src={person.avatarUrl} loader={directImageSource} alt="" width={48} height={48} unoptimized/> : initials(person.displayName)}</span>
              <span className={styles.identity}><strong>{person.displayName}</strong><span>@{person.handle}{person.isSelf ? " · Sen" : ""}</span><small>{person.universityShortName}</small></span>
            </AppLink>
            {!person.isSelf && <button className={styles.follow} type="button" data-active={person.isFollowing} aria-label={`${person.displayName}: ${person.isFollowing ? "Takibi bırak" : "Takip et"}`} disabled={pendingId !== null} onClick={(event) => void follow(person, event.currentTarget)}>{pendingId === person.publicId ? "İşleniyor…" : person.isFollowing ? "Takip ediliyor" : "Takip et"}</button>}
          </li>)}</ul>}
          {view.loading && <p className={styles.status} role="status">Liste yükleniyor…</p>}
          {!view.loading && !view.error && view.page?.people.length === 0 && <div className={styles.empty}><Users size={44} aria-hidden="true"/><h3>{query ? "Eşleşen öğrenci yok" : kind === "followers" ? "Henüz takipçi yok" : "Henüz takip edilen yok"}</h3><p>{query ? "Başka bir isim veya kullanıcı adı deneyebilirsin." : "Görüntüleyebildiğin öğrenciler bu listede yer alır."}</p>{query && <button type="button" onClick={() => { editQuery(""); queryInput.current?.focus(); }}>Aramayı temizle</button>}</div>}
          {view.page?.nextCursor && <button type="button" className={styles.more} disabled={view.loading || pendingId !== null} onClick={() => void load(true)}>{view.loading ? "Yükleniyor…" : "Daha fazla göster"}</button>}
          {Boolean(view.page?.people.length) && <p className={styles.visibilityNote}>Yalnızca görebildiğin öğrenci profilleri listelenir.</p>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
