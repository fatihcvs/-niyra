"use client";

import { type ChangeEvent, type ReactNode, useEffect, useRef } from "react";
import Image from "next/image";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { FileText } from "@phosphor-icons/react/dist/csr/FileText";
import { GearSix } from "@phosphor-icons/react/dist/csr/GearSix";
import { GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { Lightning } from "@phosphor-icons/react/dist/csr/Lightning";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { PlusSquare } from "@phosphor-icons/react/dist/csr/PlusSquare";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { Storefront } from "@phosphor-icons/react/dist/csr/Storefront";
import { User } from "@phosphor-icons/react/dist/csr/User";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { VideoCamera } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { mobileRootFor } from "../lib/mobile-navigation";
import { ownsWorkspaceMobileHeader } from "./workspace-ui";
import { KampiraMark } from "./social-primitives";
import { PublishStatus } from "./publish-status";
import type { PublishUploadProgress } from "../lib/publish-upload";
import { workspaceScreenIdFromSection } from "../lib/workspace-capabilities";
import mediaStyles from "./composer-media.module.css";

type Navigate = (name: string) => void;

function MobileAvatar({ avatarUrl, initials, size = 36 }: { avatarUrl?: string | null; initials: string; size?: number }) {
  return <span className="app-mobile-avatar" aria-hidden="true">{avatarUrl ? <Image src={avatarUrl} alt="" width={size} height={size} unoptimized/> : <span>{initials}</span>}</span>;
}

export function MobileHeader({ active, title, titleAs: Title = "h1", onBack, onNavigate }: { active: string; title?: string; titleAs?: "h1" | "p"; onBack: () => void; onNavigate: Navigate }) {
  const screenId = workspaceScreenIdFromSection(active);
  if (active === "Mesajlar" || (screenId && ownsWorkspaceMobileHeader(screenId))) return null;
  const root = active === "Akış" || active === "Keşfet" || active === "Profil";
  return <header className="app-mobile-header">
    {active === "Akış" ? <div className="app-mobile-header-brand"><KampiraMark/><span>Kampira</span><h1 className="sr-only">Akış</h1></div> : <>
      {!root && <button className="app-mobile-icon" type="button" onClick={onBack} aria-label="Geri dön"><ArrowLeft size={24}/></button>}
      <Title className="app-mobile-header-title">{title ?? active}</Title>
    </>}
    {active === "Akış" && <button className="app-mobile-icon" type="button" onClick={() => onNavigate("Bildirimler")} aria-label="Bildirimler"><Bell size={24}/></button>}
    {active === "Profil" && <button className="app-mobile-icon" type="button" onClick={() => onNavigate("Ayarlar")} aria-label="Ayarlar"><GearSix size={24}/></button>}
  </header>;
}

export function MobileNavigation({ active, onNavigate, onCompose, avatarUrl, initials, unread }: { active: string; onNavigate: Navigate; onCompose: () => void; avatarUrl?: string | null; initials: string; unread: number }) {
  const root = mobileRootFor(active);
  const index = root === "Keşfet" ? 1 : root === "Mesajlar" ? 3 : root === "Profil" ? 4 : 0;
  return <nav className="app-mobile-nav" aria-label="Mobil gezinme">
    <span className="app-mobile-nav-indicator" aria-hidden="true" style={{ transform:`translateX(${index * 100}%)` }}/>
    <button type="button" className={`app-mobile-nav-item${root === "Akış" ? " is-active" : ""}`} aria-label="Akış" aria-current={root === "Akış" ? "page" : undefined} onClick={() => onNavigate("Akış")}><House size={25} weight={root === "Akış" ? "fill" : "regular"}/><span>Akış</span></button>
    <button type="button" className={`app-mobile-nav-item${root === "Keşfet" ? " is-active" : ""}`} aria-label="Keşfet" aria-current={root === "Keşfet" ? "page" : undefined} onClick={() => onNavigate("Keşfet")}><Compass size={25} weight={root === "Keşfet" ? "fill" : "regular"}/><span>Keşfet</span></button>
    <button type="button" className="app-mobile-nav-item is-compose" aria-label="Paylaş" onClick={onCompose}><PlusSquare size={28}/><span>Paylaş</span></button>
    <button type="button" className={`app-mobile-nav-item${root === "Mesajlar" ? " is-active" : ""}`} aria-label="Mesajlar" aria-current={root === "Mesajlar" ? "page" : undefined} onClick={() => onNavigate("Mesajlar")}><span className="app-mobile-nav-symbol"><ChatCircleDots size={25} weight={root === "Mesajlar" ? "fill" : "regular"}/>{unread > 0 && <span className="app-mobile-badge" aria-label={`${unread} okunmamış mesaj`}>{unread > 99 ? "99+" : unread}</span>}</span><span>Mesajlar</span></button>
    <button type="button" className={`app-mobile-nav-item${root === "Profil" ? " is-active" : ""}`} aria-label="Profil" aria-current={root === "Profil" ? "page" : undefined} onClick={() => onNavigate("Profil")}>{avatarUrl || initials ? <MobileAvatar avatarUrl={avatarUrl} initials={initials} size={28}/> : <User size={25} weight={root === "Profil" ? "fill" : "regular"}/>}<span>Profil</span></button>
  </nav>;
}

const campusDestinations = [
  { name: "Notlar", detail: "Ders kaynakların", icon: FileText },
  { name: "Topluluklar", detail: "Ortak ilgi alanların", icon: UsersThree },
  { name: "Kampüs Anlık", detail: "Şu an neler oluyor?", icon: Lightning },
  { name: "Kütüphane", detail: "Çalışacak yer bul", icon: Books },
  { name: "Kampüs", detail: "Çevreni keşfet", icon: MapPin },
  { name: "Pazar", detail: "Öğrenciden öğrenciye", icon: Storefront },
  { name: "Eşleş", detail: "Yeni insanlarla tanış", icon: UsersThree },
];

export function MobileCampusHub({ university, onNavigate }: { university: string; onNavigate: Navigate }) {
  return <section className="app-campus-hub" aria-label="Kampüs bölümleri"><header><div><h2>Kampüsün</h2><p>{university}</p></div></header><div className="app-campus-grid">{campusDestinations.map(({ name, detail, icon: Icon }) => <button className="app-campus-item" aria-label={name} key={name} type="button" onClick={() => onNavigate(name)}><span className="app-campus-icon"><Icon size={23}/></span><span className="app-campus-copy"><strong>{name}</strong><small>{detail}</small></span><CaretRight size={18}/></button>)}</div></section>;
}

export function MobileAccountLinks({ onNavigate }: { onNavigate: Navigate }) {
  return <nav className="app-account-links" aria-label="Hesap kısayolları">{[{ name: "Kaydedilenler", icon: BookmarkSimple }, { name: "Güvenlik", icon: ShieldCheck }].map(({ name, icon: Icon }) => <button key={name} type="button" onClick={() => onNavigate(name)}><Icon size={22}/><span>{name}</span><CaretRight size={18}/></button>)}</nav>;
}

type MobilePostComposerProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  audience: "platform" | "campus";
  onAudienceChange: (audience: "platform" | "campus") => void;
  courseName?: string;
  name: string;
  avatarUrl?: string | null;
  initials: string;
  media: File | null;
  mediaUrl: string;
  mediaFiles?: readonly File[];
  mediaUrls?: readonly string[];
  onRemoveMediaAt?: (index: number) => void;
  onReorderMedia?: (index: number, direction: -1 | 1) => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") => void;
  onRemoveMedia: () => void;
  onClose: () => void;
  onPublish: () => void;
  onNavigate: Navigate;
  publishing: boolean;
  progress?: PublishUploadProgress | null;
  onCancelUpload?: () => void;
  locked?: boolean;
  retry?: boolean;
  error: string;
  draftNotice?: ReactNode;
  publishBlocked?: boolean;
};

export function MobilePostComposer({ draft, onDraftChange, audience, onAudienceChange, courseName, name, avatarUrl, initials, media, mediaUrl, mediaFiles, mediaUrls, onRemoveMediaAt, onReorderMedia, onMediaChange, onRemoveMedia, onClose, onPublish, onNavigate, publishing, progress = null, onCancelUpload, locked = publishing, retry = false, error, draftNotice, publishBlocked = false }: MobilePostComposerProps) {
  const files = mediaFiles ?? (media ? [media] : []);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]):not([type="file"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return <section className="app-post-composer" role="dialog" aria-modal="true" aria-labelledby="app-post-composer-title" data-mobile-overlay="true" ref={dialogRef}>
    <header className="app-post-composer-header"><button className="app-mobile-icon" type="button" ref={closeButtonRef} onClick={onClose} aria-label="Gönderiyi kapat"><X size={24}/></button><h1 id="app-post-composer-title">Yeni gönderi</h1><button className="app-post-publish" type="button" onClick={onPublish} disabled={publishing || publishBlocked || (!draft.trim() && !files.length)}>{publishing ? "Paylaşılıyor…" : retry ? "Tekrar dene" : "Paylaş"}</button></header>
    <div className="app-post-composer-body">
      {draftNotice}
      <div className="app-post-author"><MobileAvatar avatarUrl={avatarUrl} initials={initials} size={44}/><div><strong>{name}</strong><label className="app-post-audience"><GlobeHemisphereWest size={15}/><span className="sr-only">Gönderiyi kimler görebilir?</span><select value={audience} disabled={Boolean(courseName) || locked} onChange={(event) => onAudienceChange(event.target.value as "platform" | "campus")}><option value="platform">Herkes</option><option value="campus">Kampüsüm</option></select></label>{courseName && <span className="app-post-course">{courseName}</span>}</div></div>
      <label className="sr-only" htmlFor="app-post-draft">Gönderin</label><textarea id="app-post-draft" className="app-post-draft" value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Ne paylaşmak istersin?" maxLength={1200} rows={5} disabled={locked} style={{ fontSize:16 }}/>
      {files.length > 0 && <ComposerMediaPreview files={files} urls={mediaUrls ?? [mediaUrl]} locked={locked} onRemove={onRemoveMediaAt ?? (() => onRemoveMedia())} onMove={onReorderMedia}/>}
      {publishing && onCancelUpload && <PublishStatus progress={progress} onCancel={onCancelUpload}/>}
      {error && <p className="app-post-error" role="alert">{error}</p>}
    </div>
    <footer className="app-post-composer-tools"><div className="app-post-media-actions"><button type="button" onClick={() => imageInputRef.current?.click()} disabled={locked || files.length >= 4 || files.some((file) => file.type.startsWith("video/"))}><ImageSquare size={23}/><span>Fotoğraf</span></button><button type="button" onClick={() => videoInputRef.current?.click()} disabled={locked || files.length > 0}><VideoCamera size={23}/><span>Video</span></button></div><input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => onMediaChange(event,"image")}/><input ref={videoInputRef} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => onMediaChange(event,"video")}/><details className="app-post-other"><summary>Diğer</summary><div><button type="button" onClick={() => onNavigate("Notlar")} disabled={locked}><FileText size={20}/> Not paylaş</button><button type="button" onClick={() => onNavigate("Pazar")} disabled={locked}><Storefront size={20}/> İlan ekle</button><button type="button" onClick={() => onNavigate("Kampüs Anlık")} disabled={locked}><Lightning size={20}/> Kampüs Anlık</button></div></details></footer>
  </section>;
}

export function ComposerMediaPreview({ files, urls, locked, onRemove, onMove }: { files: readonly File[]; urls: readonly string[]; locked: boolean; onRemove: (index: number) => void; onMove?: (index: number, direction: -1 | 1) => void }) {
  return <section className={mediaStyles.media} aria-label="Gönderi medyaları"><p className={mediaStyles.hint}>En fazla 4 fotoğraf veya tek video · Toplam 20 MB</p><ol className={mediaStyles.list}>{files.map((file, index) => <li className={mediaStyles.item} key={`${file.name}-${file.lastModified}-${file.size}-${index}`}><div className={mediaStyles.preview}>
    {urls[index] ? (file.type.startsWith("video/") ? <video src={urls[index]} controls playsInline preload="metadata" aria-label="Gönderi videosu"/> : <Image src={urls[index]} alt={`${index + 1}. fotoğraf: ${file.name}`} width={480} height={360} unoptimized/>) : <p>Önizleme açılamadı. Dosyan taslakta korunuyor.</p>}
    <span className={mediaStyles.number}>{index + 1}/{files.length}</span></div><p className={mediaStyles.name} title={file.name}>{file.name}</p><div className={mediaStyles.controls}>
    {onMove && files.length > 1 && <><button type="button" disabled={locked || index === 0} onClick={() => onMove(index, -1)} aria-label={`${index + 1}. fotoğrafı önceye taşı`}><ArrowUp size={20}/></button><button type="button" disabled={locked || index === files.length - 1} onClick={() => onMove(index, 1)} aria-label={`${index + 1}. fotoğrafı sonraya taşı`}><ArrowDown size={20}/></button></>}
    <button type="button" disabled={locked} onClick={() => onRemove(index)} aria-label={files.length === 1 ? "Medyayı kaldır" : `${index + 1}. fotoğrafı kaldır`}><X size={20}/><span className="sr-only">Kaldır</span></button>
  </div></li>)}</ol></section>;
}
