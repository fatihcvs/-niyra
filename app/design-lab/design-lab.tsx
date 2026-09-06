"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { FeedPost, type Post } from "../feed-post";
import { Avatar, KampiraMark } from "../social-primitives";
import { AppNavigationProvider } from "../app-navigation";
import { MobileHeader, MobileNavigation, MobileCampusHub, MobileAccountLinks, MobilePostComposer } from "../mobile-app";
import { WorkspaceHeader, WorkspaceEmpty } from "../workspace-ui";
import { Badge, Button, IconButton, InlineError, Sheet, Skeleton, Tabs, Toast } from "../ui-primitives";
import { UiIcon } from "../ui-icon";
import { MessageContextActions, type MessageActionTarget } from "../message-context-actions";
import { NotesWorkspace } from "../product-features";
import { ProfileRelationshipStats } from "../profile-relationships";
import { createNotesGalleryPreview, galleryCourses } from "./notes-example";
import type { SessionMessage } from "../../lib/message-drafts";
import messageStyles from "../direct-messages.module.css";
import styles from "./design-lab.module.css";

const screens = [
  ["feed", "Akış ve etkileşimler"], ["campus", "Kampüs araçları"], ["notes", "Başlık, arama, filtre"],
  ["messages", "Mesaj kontrolleri"], ["profile", "Profil boş durumu"], ["states", "Yükleniyor ve hata"],
] as const;
const fixturePosts: Post[] = [
  { id: "lab-image", authorId: "lab-deniz", name: "Deniz · Örnek öğrenci", initials: "D", avatarClass: "avatar-violet", school: "Örnek Üniversite", department: "Bilgisayar Mühendisliği", time: "2 dk", audience: "platform", course: "", text: "Kütüphane sonrası biraz mola. Proje üzerinde birlikte çalışmak isteyenler var mı?", likes: 18, comments: 0, media: [{ id: "lab-media", kind: "image", url: "/social-live/library-study.webp", contentType: "image/webp", fileName: "library-study.webp" }] },
  { id: "lab-text", authorId: "lab-ece", name: "Ece · Örnek öğrenci", initials: "E", avatarClass: "avatar-mint", school: "Örnek Üniversite", department: "Endüstriyel Tasarım", time: "12 dk", audience: "campus", course: "", text: "Farklı bölümlerden proje arkadaşları arıyorum. Veri görselleştirme üzerine çalışıyoruz; ilgilenenler yazabilir.", likes: 0, comments: 0 },
];

function useLabAppearance(theme: "light" | "dark", reducedMotion: boolean) {
  useEffect(() => {
    const previousTheme = document.documentElement.dataset.theme;
    const previousMotion = document.documentElement.dataset.reduceMotion;
    return () => {
      if (previousTheme === undefined) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = previousTheme;
      if (previousMotion === undefined) delete document.documentElement.dataset.reduceMotion; else document.documentElement.dataset.reduceMotion = previousMotion;
    };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; if (reducedMotion) document.documentElement.dataset.reduceMotion = "true"; else delete document.documentElement.dataset.reduceMotion; }, [theme, reducedMotion]);
}

export function DesignLab() {
  const [screen, setScreen] = useState("feed");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [width, setWidth] = useState(390);
  const [reducedMotion, setReducedMotion] = useState(false);
  useLabAppearance(theme, reducedMotion);
  const src = `/design-lab?canvas=1&screen=${screen}&theme=${theme}&motion=${reducedMotion ? "reduced" : "system"}`;
  return <main className={styles.lab}>
    <header className={styles.labHeader}><KampiraMark size={36}/><div><p>KAMPIRA · GELİŞTİRME GALERİSİ</p><h1>Gerçek bileşenler, yerel örnekler</h1></div><span className={styles.fixtureLabel}>Yalnız geliştirme</span></header>
    <div className={styles.workbench}>
      <aside className={styles.inspector}><p className={styles.direction}>Yön A · Görünür sekmeler</p><h2>Nötr yüzeyler.<br/>Yerinde mor vurgu.</h2><p>Bu galeri canlı içerik kullanmaz. Beğeni, yorum, paylaşım ve mesaj eylemleri yerel simülasyondur.</p>
        <fieldset><legend>Ekran</legend><div className={styles.screenChoices}>{screens.map(([id, label]) => <button key={id} type="button" aria-pressed={screen === id} onClick={() => setScreen(id)}>{label}</button>)}</div></fieldset>
        <fieldset><legend>Görünüm</legend><div className={styles.segment}>{(["dark", "light"] as const).map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === "dark" ? "Koyu" : "Açık"}</button>)}</div><label className={styles.widthControl}>Gerçek iframe genişliği<select value={width} onChange={(event) => setWidth(Number(event.target.value))}>{[320, 390, 780, 781, 1440].map((value) => <option key={value} value={value}>{value} px</option>)}</select></label><label className={styles.motionControl}><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)}/> Hareketi azalt</label></fieldset>
        <div className={styles.tokenRow} aria-label="Temel renkler"><i style={{ background: "var(--canvas)" }} title="Tuval"/><i style={{ background: "var(--card)" }} title="Kart"/><i style={{ background: "var(--surface-interactive)" }} title="Kontrol yüzeyi"/><i style={{ background: "var(--brand-solid)" }} title="Ana işlem"/></div>
        <p className={styles.spec}>Geist · gövde 16px · meta 12–13px<br/>Ana dokunma hedefi 48px · ikon 22–26px</p><a className={styles.canvasLink} href={src} target="_blank" rel="noreferrer">Tuvali ayrı sekmede aç ↗</a>
      </aside>
      <section className={styles.stage} aria-label="Bileşen önizlemesi"><div className={styles.stageCaption}><strong>{screens.find(([id]) => id === screen)?.[1]}</strong><span>{width}px · {theme === "dark" ? "koyu" : "açık"}</span></div><iframe key={src} src={src} width={width} height={860} title="Kampira geliştirme örneği" className={styles.canvasFrame}/></section>
    </div>
  </main>;
}

/** Uses the real DM stylesheet and shared avatar; authentication, polling and delivery are not mounted. */
export function MessageControlsExample({ onAction, open, onOpenChange }: { onAction: (label: string) => void; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [actionTarget, setActionTarget] = useState<MessageActionTarget | null>(null);
  const person = { publicId: "lab-ece", displayName: "Ece · Örnek öğrenci", handle: "galeri-ece", universityShortName: "ÖRNEK", departmentName: "Galeri simülasyonu" };
  const sample = (id: string, body: string, own: boolean): SessionMessage => ({ id, body, own, createdAt: "2026-09-05T09:00:00.000Z", attachmentType: null, attachmentId: null, attachment: null, read: false, removed: false, time: "Simülasyon" });
  return <section className={styles.messageExample} aria-label="Mesaj kontrolleri simülasyonu">{open ? <div className={`${messageStyles.thread} ${styles.messagePanel}`}>
    <header className={messageStyles.threadHeader}><button type="button" aria-label="Konuşma listesine dön" onClick={() => onOpenChange(false)}><ArrowLeft size={24}/></button><Avatar initials="E" className="avatar-mint"/><div><strong>Ece · Örnek öğrenci</strong><small>Yerel galeri konuşması</small></div><button type="button" aria-label="Galeri kişi seçenekleri" aria-haspopup="dialog" aria-expanded={Boolean(actionTarget && !actionTarget.message)} onClick={() => setActionTarget({ person })}><DotsThree size={24} weight="bold"/></button></header>
    <div className={messageStyles.messages}><div className={`${messageStyles.message} ${messageStyles.received}`}><div className={messageStyles.messageBubble}><p>Bu konuşma yalnız tasarım kontrolü için.</p></div><button className={messageStyles.messageActions} type="button" aria-label="Galeri gelen mesaj seçenekleri" aria-haspopup="dialog" aria-expanded={actionTarget?.message?.id === "lab-received"} onClick={() => setActionTarget({ person, message: sample("lab-received", "Bu konuşma yalnız tasarım kontrolü için.", false) })}><DotsThree size={22} weight="bold"/></button></div>{messages.map((message, index) => <div className={`${messageStyles.message} ${messageStyles.own}`} key={index}><div className={messageStyles.messageBubble}><p>{message}</p></div><footer><time>Simülasyon</time></footer><button className={messageStyles.messageActions} type="button" aria-label="Galeri giden mesaj seçenekleri" aria-haspopup="dialog" aria-expanded={actionTarget?.message?.id === `lab-own-${index}`} onClick={() => setActionTarget({ person, message: sample(`lab-own-${index}`, message, true) })}><DotsThree size={22} weight="bold"/></button></div>)}</div>
    <form className={messageStyles.composer} onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setMessages((current) => [...current, draft.trim()]); setDraft(""); onAction("Mesaj yalnız örnek konuşmaya eklendi."); }}><div><textarea rows={1} aria-label="Galeri mesaj taslağı" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Bir mesaj yaz…"/><button type="submit" className={messageStyles.sendButton} disabled={!draft.trim()} aria-label="Galeri mesajını ekle"><PaperPlaneTilt size={22}/></button></div></form>
  </div> : <div className={`${messageStyles.sidebar} ${styles.messagePanel}`}><header><div><h1>Mesajlar</h1></div><button type="button" onClick={() => onOpenChange(true)} aria-label="Örnek konuşmayı aç"><Plus size={24}/></button></header><label className={messageStyles.search}><MagnifyingGlass size={20}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Konuşmalarda ara" aria-label="Örnek konuşmalarda ara"/></label><div className={messageStyles.emptyList}><ChatCircleDots size={52}/><strong>{query ? "Eşleşen örnek yok" : "Bir merhaba ile başlar"}</strong><p>Gerçek mesaj göndermeden konuşma kontrollerini deneyebilirsin.</p><button type="button" onClick={() => onOpenChange(true)}>Örnek konuşmayı aç</button></div></div>}<MessageContextActions target={actionTarget} onClose={() => setActionTarget(null)} onRestore={(target) => { if (open) setActionTarget(target); }} onRestriction={() => {}} preview={{ mode: "gallery", onAction }}/></section>;
}

export function DesignLabCanvas({ initialScreen = "feed", theme = "dark", reducedMotion = false }: { initialScreen?: string; theme?: "light" | "dark"; reducedMotion?: boolean }) {
  const [screen, setScreen] = useState(screens.some(([id]) => id === initialScreen) ? initialScreen : "feed");
  const [feedTab, setFeedTab] = useState("Genel");
  const [messageOpen, setMessageOpen] = useState(false);
  const [posts, setPosts] = useState(fixturePosts);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<"platform" | "campus">("platform");
  const [media, setMedia] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const localMediaUrls = useRef(new Set<string>());
  const [notice, setNotice] = useState("Bütün içerik ve etkileşimler galeri simülasyonudur.");
  const notesPreview = useMemo(() => createNotesGalleryPreview(() => setNotice("Galeri simülasyonu: dosya yüklenmedi.")), []);
  useLabAppearance(theme, reducedMotion);
  useEffect(() => { const urls = localMediaUrls.current; return () => { for (const url of urls) URL.revokeObjectURL(url); }; }, []);
  const active = screen === "messages" ? "Mesajlar" : screen === "profile" ? "Profil" : screen === "feed" ? "Akış" : screen === "campus" ? "Keşfet" : "Notlar";
  function navigate(name: string) {
    if (name === "Gönderi oluştur") { setCompose(true); return; }
    const next = ({ Akış: "feed", Keşfet: "campus", Mesajlar: "messages", Profil: "profile", Notlar: "notes", Bildirimler: "states", Ayarlar: "states" } as Record<string, string>)[name];
    if (next) setScreen(next); else setNotice(`${name}: bu galeride yalnız eylem geri bildirimi gösterilir.`);
  }
  function chooseMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMedia(file);
    const url = file ? URL.createObjectURL(file) : "";
    if (url) localMediaUrls.current.add(url);
    setMediaUrl(url);
    event.target.value = "";
  }
  function publishExample() {
    if (!draft.trim() && !media) return;
    setPosts((current) => [{ ...fixturePosts[0], id: `lab-local-${Date.now()}`, text: draft || "Yerel medya örneği", audience, likes: 0, comments: 0, media: media && mediaUrl ? [{ id: "lab-local-media", kind: media.type.startsWith("video/") ? "video" : "image", url: mediaUrl, fileName: media.name, contentType: media.type }] : undefined }, ...current]);
    setCompose(false); setDraft(""); setMedia(null); setMediaUrl(""); setScreen("feed"); setNotice("Gönderi yalnız galeriye eklendi. Sunucuya gönderilmedi.");
  }
  return <AppNavigationProvider onBack={() => setScreen("feed")} ownerScope="" onSessionExpired={() => {}}>
    <main className={styles.canvas} data-design-lab="fixture" data-message-screen={screen === "messages"} data-message-detail={screen === "messages" && messageOpen}><div className={styles.canvasNotice} role="status"><strong>GALERİ SİMÜLASYONU</strong><span>{notice}</span></div>
      {screen !== "notes" && screen !== "states" && <MobileHeader active={active} onBack={() => setScreen("feed")} onNavigate={navigate}/>}
      <div className={styles.canvasContent}>
        {screen === "feed" && <><nav className="feed-tabs" role="tablist" aria-label="Örnek akış kapsamı">{["Genel", "Takip", "Kampüs"].map((tab) => <button type="button" role="tab" id={`lab-tab-${tab}`} aria-selected={feedTab === tab} aria-controls="lab-feed" className={feedTab === tab ? "active" : ""} key={tab} onClick={() => setFeedTab(tab)}>{tab}</button>)}</nav><div className="feed-list" id="lab-feed" role="tabpanel" aria-labelledby={`lab-tab-${feedTab}`}>{posts.filter((post) => feedTab !== "Kampüs" || post.audience === "campus").map((post) => <FeedPost post={post} key={post.id} viewerInitials="D" viewerId="lab-deniz" preview={{ onAction: (action) => setNotice(`${action}: yalnız galeri simülasyonu; canlı işlem yapılmadı.`) }} onPostUpdated={(id, text) => setPosts((current) => current.map((item) => item.id === id ? { ...item, text } : item))} onPostDeleted={(id) => setPosts((current) => current.filter((item) => item.id !== id))}/>)}</div></>}
        {screen === "campus" && <MobileCampusHub university="Örnek Üniversite · Galeri" onNavigate={navigate}/>}
        {screen === "notes" && <NotesWorkspace courses={galleryCourses} preview={notesPreview}/>}

        {screen === "messages" && <MessageControlsExample onAction={setNotice} open={messageOpen} onOpenChange={setMessageOpen}/>}
        {screen === "profile" && <><section className={styles.profileExample}><Avatar initials="D" className="avatar-violet"/><h2>Deniz · Örnek öğrenci</h2><p>Örnek Üniversite · Bilgisayar Mühendisliği</p><ProfileRelationshipStats targetId="lab-deniz" targetName="Deniz · Galeri simülasyonu" postCount={0} followerCount={3} followingCount={2} courseCount={1} preview={{ mode: "gallery" }}/></section><div className="workspace-filter-pills" role="group" aria-label="Profil örnek sekmeleri"><button type="button" className="active">Gönderiler</button><button type="button" onClick={() => setNotice("Görsel sekmesinin boş durum örneği.")}>Görseller</button><button type="button" onClick={() => setNotice("Video sekmesinin boş durum örneği.")}>Videolar</button></div><WorkspaceEmpty title="Henüz gönderi yok" description="Kampüs paylaşımları burada görünecek." action={<button type="button" onClick={() => setCompose(true)}>İlk paylaşımını oluştur</button>}/><MobileAccountLinks onNavigate={navigate}/></>}
        {screen === "states" && <SharedComponentExamples/>}
      </div>
      {!compose && !(screen === "messages" && messageOpen) && <MobileNavigation active={active} onNavigate={navigate} onCompose={() => setCompose(true)} initials="D" unread={2}/>}
      {compose && <div className={styles.composerExample}><p className={styles.composerLabel}>Galeri simülasyonu · Sunucuya gönderilmez</p><MobilePostComposer draft={draft} onDraftChange={setDraft} audience={audience} onAudienceChange={setAudience} name="Deniz · Örnek öğrenci" initials="D" media={media} mediaUrl={mediaUrl} onMediaChange={chooseMedia} onRemoveMedia={() => { setMedia(null); setMediaUrl(""); }} onClose={() => setCompose(false)} onPublish={publishExample} onNavigate={(name) => { setCompose(false); navigate(name); }} publishing={false} error=""/></div>}
    </main>
  </AppNavigationProvider>;
}

/** Every action stays inside this development-only example; no transport is mounted. */
export function SharedComponentExamples() {
  const [tab, setTab] = useState("error");
  const [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetDraft, setSheetDraft] = useState("");
  const [toastId, setToastId] = useState(0);
  const [toastOpen, setToastOpen] = useState(false);
  return <div className="workspace-view" data-shared-primitives="true">
    <WorkspaceHeader screenId="notes" section="Notlar" title="Durum bileşenleri" description="Gerçek ortak kontroller; bütün işlemler yalnız bu galeri içinde uygulanır." primaryAction={{ id: "gallery.create", label: "Yeni örnek oluştur", icon: <UiIcon name="plus"/>, onPress: () => setSheet(true) }} secondaryActions={[{ id: "gallery.refresh", label: "Örneği yenile", onPress: () => { setResolved(false); setTab("error"); } }]}/>
    <Tabs label="Durum örnekleri" value={tab} onChange={setTab} items={[{ value: "error", label: "Hata" }, { value: "loading", label: "Yükleniyor" }, { value: "empty", label: "Boş" }]}/>
    <div className={styles.primitiveExample}>
      {tab === "error" && (resolved ? <WorkspaceEmpty title="Örnek hazır" description="Yeniden deneme yalnız bu galeri durumunu değiştirdi."/> : <InlineError message="İçerik getirilemedi. Taslağın korunuyor; tekrar deneyebilirsin." onRetry={() => setResolved(true)}/>)}
      {tab === "loading" && <Skeleton label="Örnek içerik hazırlanıyor" shape="card"/>}
      {tab === "empty" && <WorkspaceEmpty title="Henüz içerik yok" description="Bir içerik paylaştığında burada görünecek."/>}
      <div className={styles.primitiveActions}><Button tone="primary" onClick={() => setSheet(true)}>Paneli aç</Button><Button onClick={() => { setToastId((value) => value + 1); setToastOpen(true); }}>Yerel bildirim göster</Button><IconButton label="Örnek kaydetme işlemi" busy={busy} onClick={() => setBusy(true)}><UiIcon name="bookmark"/></IconButton>{busy && <Button onClick={() => setBusy(false)}>Beklemeyi sıfırla</Button>}<Badge tone="accent" label="2 örnek bildirim">2</Badge></div>
      {toastOpen && <Toast id={String(toastId)} message="Bu bildirim yalnızca yerel galeri örneğidir." onDismiss={() => setToastOpen(false)}/>}
    </div>
    <Sheet id="gallery.shared-sheet" open={sheet} title="Örnek panel" description="Geri düğmesi veya kapat ile örneğe dön." onClose={() => setSheet(false)} onRestore={() => setSheet(true)} footer={(close) => <Button tone="primary" onClick={close}>Tamam</Button>}><label className={styles.primitiveField}>Örnek açıklama<input placeholder="Bu alana yazabilirsin" value={sheetDraft} onChange={(event) => setSheetDraft(event.target.value)}/></label><InlineError message="Bu, panel içindeki yerel hata örneğidir."/></Sheet>
  </div>;
}
