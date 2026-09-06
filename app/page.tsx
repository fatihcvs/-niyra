"use client";

import { type ChangeEvent, type FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { FEED_SCOPES, feedScopeFromSearch, audienceLabel, type FeedScope, type PostAudience } from "../lib/feed-scope";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { SealCheck } from "@phosphor-icons/react/dist/csr/SealCheck";
import { MobileHeader, MobileNavigation, MobileCampusHub, MobileAccountLinks, MobilePostComposer, ComposerMediaPreview } from "./mobile-app";
import { mobileRootFor, pageLocationWithoutComposer, pushAppLocation } from "../lib/mobile-navigation";
import {
  getUniversityById,
  universities,
  type AcademicCourse,
  type University,
} from "../lib/academic-data";
import { curatedNotes, featuredCuratedNotes, getCuratedSources } from "../lib/curated-notes";
import {
  NotesWorkspace,
  NotificationsWorkspace,
  ProfileSafetyMenu,
  SafetyWorkspace,
  UnifiedSearchResults,
} from "./product-features";
import { CampusPulseWorkspace } from "./campus-pulse";
import { SocialMatchWorkspace } from "./social-match";
import { CampusGuideWorkspace } from "./campus-guide";
import { CampusMarketWorkspace, type CampusMarketTab } from "./campus-market";
import { LibraryOccupancyWorkspace } from "./library-occupancy";
import { DirectMessagesWorkspace, type DirectMessageRecipient } from "./direct-messages";
import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty, RefreshButton } from "./workspace-ui";
import { CourseHubLayers, useCourseHubLayers } from "./course-hub";
import { courseMatchesYear, courseScheduleLabel, type CourseSchedule } from "../lib/course-catalog-display";
import { SavedWorkspace } from "./saved-workspace";
import { workspaceFromSearch, workspaceRoutes } from "../lib/workspace-navigation";
import { notesHref, notesLocation, type NotesCourse, type NotesSource } from "../lib/notes-navigation";
import { ProfileContent } from "./profile-content";
import { useComposerMedia } from "./use-composer-media";
import { UiIcon as Icon, type UiIconName as IconName } from "./ui-icon";
import { FeedPost, type Post } from "./feed-post";
import { PostCommentTarget } from "./post-comment-target";
import { Avatar, formatCount, KampiraMark } from "./social-primitives";
import { sendPublishUpload, PublishUploadError, type PublishUploadProgress } from "../lib/publish-upload";
import { PublishStatus } from "./publish-status";
import { useScreenMotion } from "./use-screen-motion";
import { AppNavigationProvider, useAppNavigation, type FollowChange } from "./app-navigation";
import { ProfileRelationshipStats } from "./profile-relationships";
import { invalidateProfileRelationships } from "../lib/profile-relationships";
import { useScopedRequests } from "./use-scoped-requests";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { useFeedRefresh } from "./use-feed-refresh";
import { FeedRefreshNotice } from "./feed-refresh-notice";
import { useWebScreenTiming } from "./use-web-screen-timing";
import { FEED_READ_TIMEOUT_MS, readFeedPage, type FeedPage } from "../lib/feed-refresh";
import { setWorkspaceStateOwnerScope, workspaceState } from "../lib/workspace-state";
import { useWorkspaceState } from "./use-workspace-state";
import { setMessageOwnerScope } from "../lib/message-drafts";
import { createPublishAttempt, publishDraftMedia } from "../lib/publish-attempt";
import { usePublishDraft } from "./use-publish-draft";
import { clearMarketDraftsOnLogout } from "../lib/market-draft-store";
import { clearNativeFiles } from "../lib/native-files-client";
import { clearPushNotificationsOnLogout } from "../lib/push-client";
import { PublishDraftNotice } from "./publish-draft-notice";
import { restoreAppScroll } from "../lib/scroll-restoration";
import { createLatestRequest } from "../lib/latest-request";
import { setProfileContentOwnerScope, invalidateProfileContent, updateProfileContentPost, removeProfileContentPost } from "../lib/profile-content-state";

const CommunitiesWorkspace = dynamic(() => import("./communities-workspace").then((module) => module.CommunitiesWorkspace), {
  loading: () => <div className="empty-state"><strong>Topluluklar hazırlanıyor</strong><span>Kampüs çevren yükleniyor.</span></div>,
});

type ThemePreference = "light" | "dark" | "system";





type CampusLivePreview = {
  id: string;
  category: string;
  content: string;
  campusZone: string;
  imageUrl: string | null;
  authorName: string;
  expiresAt: string | null;
  time: string;
  confirmCount: number;
  outdatedCount: number;
  viewerReaction: "support" | "confirm" | "outdated" | null;
};

type StudentProfile = {
  publicId: string;
  displayName: string;
  handle: string;
  bio: string;
  links: Array<{ title: string; url: string }>;
  avatarUrl: string | null;
  universityId: string;
  universityName: string;
  universityShortName: string;
  universityCity: string;
  facultyId: string;
  facultyName: string;
  facultyShortName: string;
  departmentId: string;
  departmentName: string;
  classYear: number;
  onboardingCompleted: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  courses: AcademicCourse[];
};

type CampusPerson = {
  sameCampus?: boolean;
  publicId: string;
  displayName: string;
  handle: string;
  bio: string;
  links: Array<{ title: string; url: string }>;
  initials: string;
  avatarClass: string;
  avatarUrl: string | null;
  universityName: string;
  universityShortName: string;
  facultyName: string;
  facultyShortName: string;
  departmentName: string;
  classYear: number;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

type PublicProfile = CampusPerson & {
  courses: AcademicCourse[];
  posts: Post[];
};

type ProfileState =
  | "loading"
  | "ready"
  | "needs-onboarding"
  | "auth-required"
  | "unavailable";

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("") || "Ü";
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "öğrenci";
}



const navItems: { label: string; icon: IconName }[] = [
  { label: "Akış", icon: "home" },
  { label: "Keşfet", icon: "compass" },
  { label: "Kampüs Anlık", icon: "sparkles" },
  { label: "Eşleş", icon: "users" },
  { label: "Kampüs", icon: "compass" },
  { label: "Kütüphane", icon: "notes" },
  { label: "Pazar", icon: "bookmark" },
  { label: "Notlar", icon: "notes" },
  { label: "Topluluklar", icon: "users" },
  { label: "Mesajlar", icon: "message" },
  { label: "Bildirimler", icon: "bell" },
  { label: "Kaydedilenler", icon: "bookmark" },
  { label: "Güvenlik", icon: "check" },
  { label: "Ayarlar", icon: "settings" },
];


function UniversityMark({ university, variant = "catalog" }: { university: University; variant?: "catalog" | "campus" }) {
  const className = variant === "campus" ? "single-campus-mark" : "university-mark";
  return (
    <span className={`${className} ${university.logoPath ? "has-logo" : "has-initials"}`} aria-hidden="true">
      <b>{university.shortName}</b>
      {university.logoPath && (
        <Image
          src={university.logoPath}
          alt=""
          width={160}
          height={160}
          loading="lazy"
          decoding="async"
          unoptimized
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
      )}
    </span>
  );
}



function ProfileLinks({ links }: { links: Array<{ title: string; url: string }> }) {
  if (links.length === 0) return null;
  return <div className="profile-links">{links.map((link) => <a href={link.url} target="_blank" rel="noreferrer noopener" key={`${link.title}-${link.url}`}><Icon name="arrow" size={13}/>{link.title}</a>)}</div>;
}





function Logo() {
  return (
    <a className="brand" href="#top" aria-label="Kampira ana sayfa">
      <KampiraMark size={36} className="brand-mark" />
      <span className="brand-name">Kampira</span>
    </a>
  );
}

const sidebarNotes = featuredCuratedNotes.slice(0, 3).map((note) => ({
  id: note.id,
  code: note.courseCodes[0],
  title: note.title,
  publisher: getCuratedSources(note)[0].publisher,
  readingMinutes: note.readingMinutes,
}));

function DiscoverView({
  scope, onScopeChange,  profile,
  people,
  peopleStatus,
  query,
  followPendingId,
  onOpenPerson,
  onQueryChange,
  onToggleFollow,
  onNavigate,
}: {
  scope: "platform" | "campus";
  onScopeChange: (scope: "platform" | "campus") => void;
  profile: StudentProfile;
  people: CampusPerson[];
  peopleStatus: "loading" | "ready" | "empty" | "error";
  query: string;
  followPendingId: string | null;
  onOpenPerson: (person: CampusPerson) => void;
  onQueryChange: (query: string) => void;
  onToggleFollow: (publicId: string) => void;
  onNavigate: (name: string) => void;
}) {
  const [category, setCategory] = useState("Sana özel");
  const [mobileSection, setMobileSection] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("explore") === "campus" ? "campus" : "people");
  function changeMobileSection(next: string) {
    setMobileSection(next);
    const url = new URL(window.location.href);
    if (next === "campus") url.searchParams.set("explore", "campus"); else url.searchParams.delete("explore");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }
  const isSearching = query.trim().length >= 2;
  const visiblePeople = people.filter((person) => category === "Bölümüm" ? person.sameCampus !== false && person.departmentName === profile.departmentName : category === "Sınıfım" ? person.sameCampus !== false && person.classYear === profile.classYear : category === "Takip ettiklerim" ? person.isFollowing : true);
  return (
    <div className={`workspace-view discover-workspace explore-${mobileSection}`}>
      <div className="app-explore-tabs" role="tablist" aria-label="Keşfet bölümü">
        <button type="button" role="tab" id="explore-people-tab" aria-controls="explore-people" aria-selected={mobileSection === "people"} onClick={() => changeMobileSection("people")}>Öğrenciler</button>
        <button type="button" role="tab" id="explore-campus-tab" aria-controls="explore-campus" aria-selected={mobileSection === "campus"} onClick={() => changeMobileSection("campus")}>Kampüsüm</button>
      </div>
      <div className="app-explore-campus" id="explore-campus" role="tabpanel" aria-labelledby="explore-campus-tab"><MobileCampusHub university={profile.universityName} onNavigate={onNavigate}/></div>
      <div className="app-explore-people" id="explore-people">
      <WorkspaceHeader screenId="discover" section="Keşfet" eyebrow={profile.universityShortName} title="Keşfet" description="Yeni insanlarla tanış, kendi çevreni oluştur."/>
      <WorkspaceSearch value={query} onChange={onQueryChange} placeholder="Ders, not, topluluk veya öğrenci ara" resultCount={isSearching || peopleStatus === "loading" ? undefined : visiblePeople.length} onReset={query || category !== "Sana özel" ? () => { onQueryChange(""); setCategory("Sana özel"); } : undefined}>
      <div className="workspace-filter-pills" role="group" aria-label="Keşif alanı">{([['platform','Tüm üniversiteler'],['campus','Kampüsüm']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={scope === value} className={scope === value ? "active" : ""} onClick={() => { setCategory("Sana özel"); onScopeChange(value); }}>{label}</button>)}</div>
        <label>Çevre<select value={category} onChange={(event) => setCategory(event.target.value)}>{["Sana özel", "Bölümüm", "Sınıfım", "Takip ettiklerim"].map((item) => <option key={item}>{item}</option>)}</select></label>
      </WorkspaceSearch>

      <UnifiedSearchResults scope={scope} query={query}/>
      {!isSearching && <><div className="workspace-filter-pills" role="group" aria-label="Öğrenci çevresi">
        {["Sana özel", "Bölümüm", "Sınıfım", "Takip ettiklerim"].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} aria-pressed={category === item} type="button" key={item}>{item}</button>)}
      </div>

      <div className="workspace-context-links"><button type="button" onClick={() => onNavigate("Topluluklar")}><strong>Topluluklar ↗</strong><small>Birlikte üreteceğin çevreyi bul</small></button><button type="button" onClick={() => onNavigate("Notlar")}><strong>Notlar ↗</strong><small>Çalışmanı kolaylaştıran kaynaklar</small></button><button type="button" onClick={() => onNavigate("Kampüs")}><strong>Kampüs ↗</strong><small>Mekânlar ve yaklaşan etkinlikler</small></button></div>
      <div className="section-heading workspace-heading"><div><span className="eyebrow">ÖĞRENCİ AĞI</span><h2>{query ? `“${query}” için sonuçlar` : "Akademik çevreni genişlet"}</h2></div><span className="section-campus-label">{scope === "platform" ? "Tüm üniversiteler" : profile.universityShortName}</span></div>
      <div className="campus-people-grid">
        {peopleStatus === "loading" && <p className="campus-people-state">Öğrenci ağı getiriliyor…</p>}
        {peopleStatus === "empty" && <p className="campus-people-state">{query ? "Bu aramayla eşleşen öğrenci bulunamadı." : "Bu alanda henüz başka bir profil yok. Genel Akış’ta paylaşım yapan farklı kampüslerden öğrenciler burada görünecek."}</p>}
        {peopleStatus === "error" && <WorkspaceEmpty error title="Öğrenciler getirilemedi" description="Bağlantını kontrol edip tekrar deneyebilirsin." action={<RefreshButton onClick={() => onQueryChange(query)}/>}/>}
        {peopleStatus === "ready" && visiblePeople.length === 0 && <WorkspaceEmpty title="Bu çevrede henüz sonuç yok" action={<button type="button" onClick={() => setCategory("Sana özel")}>Tüm öğrencileri göster</button>}/>}
        {peopleStatus === "ready" && visiblePeople.map((person) => (
          <article className="campus-person-card" key={person.publicId}>
            <button className="campus-person-main" type="button" onClick={() => onOpenPerson(person)}>
              <Avatar initials={person.initials} className={person.avatarClass} imageUrl={person.avatarUrl}/>
              <span><strong>{person.displayName}</strong><small>{person.universityShortName} · {person.departmentName}</small><em>{person.classYear}. sınıf · {formatCount(person.followerCount)} takipçi</em></span>
              <Icon name="arrow" size={15}/>
            </button>
            <button className={person.isFollowing ? "following" : ""} type="button" disabled={followPendingId === person.publicId} onClick={() => onToggleFollow(person.publicId)}>{followPendingId === person.publicId ? "Bekle…" : person.isFollowing ? "Takiptesin" : "Takip et"}</button>
          </article>
        ))}
      </div>

      <section className="discover-empty-product"><span><Icon name="users" size={22}/></span><div><strong>Topluluklar gerçek üyelerle oluşur</strong><p>Üniversitene ait toplulukları açarak güncel üye ve gönderi sayılarını görebilirsin.</p></div><button type="button" onClick={() => onNavigate("Topluluklar")}>Topluluklara git <Icon name="arrow" size={15}/></button></section></>}
      </div>
    </div>
  );
}

function useProfileMediaPreview(file: File | null, fallback: string | null, removed: boolean) {
  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => {
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [objectUrl]);
  return removed ? null : objectUrl ?? fallback;
}

function ProfileEditor({ profile, onSaved, onCancel, onEditAcademic }: { profile: StudentProfile; onSaved: (profile: StudentProfile) => void; onCancel: () => void; onEditAcademic: () => void }) {
  const navigation = useAppNavigation();
  const authenticatedFetch = useAuthenticatedFetch();
  const [displayName, setDisplayName] = useWorkspaceState("profile-editor.name", profile.displayName);
  const [handle, setHandle] = useWorkspaceState("profile-editor.handle", profile.handle);
  const [bio, setBio] = useWorkspaceState("profile-editor.bio", profile.bio);
  const [links, setLinks] = useWorkspaceState("profile-editor.links", profile.links.length ? profile.links.map((link) => ({ ...link })) : []);
  const [avatarFile, setAvatarFile] = useWorkspaceState<File | null>("profile-editor.avatar", null);
  const [removeAvatar, setRemoveAvatar] = useWorkspaceState("profile-editor.remove-avatar", false);
  const [saving, setSaving] = useState(false);
  const saveBusy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function clearDraft() { for (const key of ["name", "handle", "bio", "links", "avatar", "remove-avatar"]) workspaceState.remove(navigation?.ownerScope ?? "", `profile-editor.${key}`); }
  function discardDraft() { clearDraft(); onCancel(); }
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const avatarPreview = useProfileMediaPreview(avatarFile, profile.avatarUrl, removeAvatar);
  const initials = getInitials(displayName || profile.displayName);

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
      setError("Yalnızca PNG, JPG veya WEBP görsel seçebilirsin.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Profil fotoğrafı en fazla 4 MB olabilir.");
      return;
    }
    setError("");
    setAvatarFile(file);
    setRemoveAvatar(false);
  }

  function updateLink(index: number, field: "title" | "url", value: string) {
    setLinks((current) => current.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link));
    setError("");
  }

  async function updateAvatar(file: File | null, removed: boolean) {
    if (file) {
      const form = new FormData();
      form.set("kind", "avatar");
      form.set("image", file);
      const response = await authenticatedFetch("/api/profile/media", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profil görseli kaydedilemedi.");
      return;
    }
    if (removed) {
      const response = await authenticatedFetch("/api/profile/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "avatar" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profil görseli kaldırılamadı.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveBusy.current) return;
    saveBusy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-details", displayName, handle, bio, links }),
      });
      const data = (await response.json()) as { profile?: StudentProfile; error?: string; authRequired?: boolean };
      if (!active.current) return;
      if (response.status === 401) {
        setError("Oturumun sona erdi. Devam etmek için yeniden giriş yap.");
        return;
      }
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Profil bilgilerin kaydedilemedi.");

      await updateAvatar(avatarFile, removeAvatar);
      if (!active.current) return;
      if (avatarFile || removeAvatar) {
        const freshResponse = await authenticatedFetch("/api/profile", { headers: { accept: "application/json" }, cache: "no-store" });
        const freshData = (await freshResponse.json()) as { profile?: StudentProfile; error?: string };
        if (!active.current) return;
        if (!freshResponse.ok || !freshData.profile) throw new Error(freshData.error ?? "Yeni profil görünümü getirilemedi.");
        clearDraft();
        onSaved(freshData.profile);
      } else {
        clearDraft();
        onSaved(data.profile);
      }
    } catch (saveError) {
      if (active.current) setError(saveError instanceof Error ? saveError.message : "Profil bilgilerin kaydedilemedi.");
    } finally {
      saveBusy.current = false;
      if (active.current) setSaving(false);
    }
  }

  return (
    <main className="profile-editor-page">
      <header className="profile-editor-topbar">
        <Logo/>
        <h1 className="profile-editor-mobile-title">Profili düzenle</h1>
        <div><button type="button" onClick={discardDraft} disabled={saving}>Vazgeç</button><button form="profile-editor-form" className="profile-editor-save" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </header>
      <form id="profile-editor-form" className="profile-editor-layout" onSubmit={save}>
        <fieldset disabled={saving} className="profile-editor-controls">
        <aside className="profile-editor-preview">
          <span className="profile-editor-kicker">PROFİL ÖNİZLEMESİ</span>
          <div className="profile-editor-card">
            <div className="profile-editor-identity"><Avatar initials={initials} className="avatar-violet" imageUrl={avatarPreview}/><div><strong>{displayName.trim() || "Görünen adın"}</strong><span>@{handle.trim() || "kullaniciadi"}</span></div></div>
            <p>{bio.trim() || `${profile.universityShortName} kampüsünde öğreniyor ve paylaşıyor.`}</p>
            <ProfileLinks links={links.filter((link) => link.title.trim() && link.url.trim())}/>
          </div>
          <div className="profile-media-controls">
            <section><div><Avatar initials={initials} className="avatar-violet" imageUrl={avatarPreview}/><span><strong>Profil fotoğrafı</strong><small>Gönderi ve yorumlarında da görünür.</small></span></div><footer><button type="button" onClick={() => avatarInput.current?.click()}>Fotoğraf seç</button>{avatarPreview && <button className="danger" type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }}>Kaldır</button>}</footer><input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} hidden/></section>
          </div>
        </aside>

        <section className="profile-editor-fields">
          <div className="profile-editor-heading"><span>PROFİLİNİ DÜZENLE</span><h1>Profili düzenle</h1><p>Profilini güncelle. Okul ve derslerini akademik bilgiler bölümünden düzenleyebilirsin.</p></div>
          <div className="profile-editor-field-grid">
            <label><span>Görünen ad</span><input value={displayName} onChange={(event) => { setDisplayName(event.target.value); setError(""); }} maxLength={50} autoComplete="name"/><small>Öğrencilerin seni tanıyacağı ad.</small></label>
            <label><span>Kullanıcı adı</span><div className="profile-handle-field"><b>@</b><input value={handle} onChange={(event) => { setHandle(event.target.value.toLocaleLowerCase("en-US").replace(/\s+/g, "")); setError(""); }} maxLength={30} autoCapitalize="none" autoCorrect="off"/></div><small>Profil bağlantında ve aramada kullanılır.</small></label>
          </div>
          <label className="profile-bio-field"><span>Biyografi <b>{bio.length}/150</b></span><textarea value={bio} onChange={(event) => { setBio(event.target.value); setError(""); }} maxLength={150} rows={4} placeholder="Bölümün, ilgi alanların veya kampüste aradığın şey…"/><small>Kısa, doğal ve sana ait bir tanıtım yazısı.</small></label>

          <section className="profile-link-editor">
            <header><div><strong>Bağlantılar</strong><small>Portfolyo, kulüp, proje veya sosyal hesaplarını ekle.</small></div><button type="button" disabled={links.length >= 5} onClick={() => setLinks((current) => [...current, { title: "", url: "" }])}><Icon name="plus" size={14}/> Bağlantı ekle</button></header>
            {links.length === 0 ? <button className="profile-link-empty" type="button" onClick={() => setLinks([{ title: "", url: "" }])}><Icon name="plus" size={16}/> İlk bağlantını ekle</button> : <div className="profile-link-list">{links.map((link, index) => <div className="profile-link-row" key={index}><label><span>Başlık</span><input value={link.title} onChange={(event) => updateLink(index, "title", event.target.value)} maxLength={40} placeholder="Örn. Portfolyom"/></label><label><span>Bağlantı</span><input value={link.url} onChange={(event) => updateLink(index, "url", event.target.value)} maxLength={500} inputMode="url" autoCapitalize="none" placeholder="https://…"/></label><button type="button" aria-label={`${index + 1}. bağlantıyı kaldır`} onClick={() => setLinks((current) => current.filter((_, linkIndex) => linkIndex !== index))}><Icon name="trash" size={15}/></button></div>)}</div>}
            <small className="profile-link-limit">En fazla 5 bağlantı ekleyebilirsin.</small>
          </section>

          <section className="profile-academic-summary"><div className="profile-academic-mark">{profile.universityShortName}</div><div><span>AKADEMİK BİLGİLER</span><strong>{profile.universityName}</strong><p>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</p><small>{profile.courses.length} ders çevresi bağlı</small></div><button type="button" onClick={onEditAcademic}><Icon name="edit" size={15}/> Okul ve bölümü düzenle</button></section>
          {error && <p className="profile-editor-error" role="alert">{error}</p>}
          <footer className="profile-editor-footer"><button type="button" onClick={discardDraft} disabled={saving}>Vazgeç</button><button className="profile-editor-save" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></footer>
        </section>
        </fieldset>
      </form>
    </main>
  );
}

function ProfileAbout({ profile }: { profile: Pick<StudentProfile, "bio" | "links" | "universityName" | "facultyName" | "departmentName" | "classYear" | "courses"> }) {
  return <div className="profile-about"><section><h2>Hakkında</h2><p>{profile.bio || "Henüz bir biyografi eklenmedi."}</p><ProfileLinks links={profile.links}/></section><section><h2>Akademik bilgiler</h2><dl><div><dt>Üniversite</dt><dd>{profile.universityName}</dd></div><div><dt>Fakülte</dt><dd>{profile.facultyName}</dd></div><div><dt>Bölüm</dt><dd>{profile.departmentName}</dd></div><div><dt>Sınıf</dt><dd>{profile.classYear}. sınıf</dd></div></dl></section><section><h2>Ders çevreleri</h2>{profile.courses.length ? <ul>{profile.courses.map((course) => <li key={course.id}><strong>{course.code}</strong><span>{course.name}</span></li>)}</ul> : <p>Henüz ders çevresi eklenmedi.</p>}</section></div>;
}

function ProfileView({ profile, shareable, onEdit, onSignOut, onPostUpdated, onPostDeleted, onNavigate }: { profile: StudentProfile; shareable: boolean; onEdit: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onNavigate: (name: string) => void }) {
  const navigation = useAppNavigation();
  const initials = getInitials(profile.displayName);
  const [copied, setCopied] = useState(false);

  async function shareOwnProfile() {
    const profileUrl = new URL(window.location.href);
    profileUrl.searchParams.set("profile", profile.publicId);
    const shareUrl = profileUrl.toString();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Profil bağlantını kopyala", shareUrl);
    }
  }

  return (
    <div className="workspace-view profile-view">
      <section className="profile-hero"><div className="profile-main"><Avatar initials={initials} className="avatar-violet" imageUrl={profile.avatarUrl}/><div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div><div className="profile-own-actions">{shareable && <button className="profile-own-share" type="button" onClick={() => void shareOwnProfile()}><Icon name={copied ? "check" : "share"} size={14}/>{copied ? "Kopyalandı" : "Paylaş"}</button>}<button type="button" onClick={onEdit}><Icon name="edit" size={14}/>Profili düzenle</button><button type="button" onClick={onSignOut}>Çıkış yap</button></div></div><p className={`profile-bio ${profile.bio ? "" : "profile-bio-muted"}`}>{profile.bio || `${profile.universityShortName} ders çevrelerin, gönderilerin ve bağlantıların burada bir araya gelir.`}</p><ProfileLinks links={profile.links}/><ProfileRelationshipStats targetId={profile.publicId} targetName={profile.displayName} postCount={profile.postCount} followerCount={profile.followerCount} followingCount={profile.followingCount} courseCount={profile.courses.length}/></section>
      <ProfileContent key={profile.publicId} ownerScope={navigation?.ownerScope ?? ""} onSessionExpired={navigation?.onSessionExpired} userId={profile.publicId} own about={<ProfileAbout profile={profile}/>} onNavigate={onNavigate} onCreate={() => onNavigate("Gönderi oluştur")} renderPost={(post, actions) => <FeedPost key={post.id} viewerInitials={initials} viewerId={profile.publicId} post={post} onInteractionUpdated={actions.onInteractionUpdated} onPostUpdated={(id, text) => { actions.onPostUpdated(id, text); onPostUpdated(id, text); }} onPostDeleted={(id) => { actions.onPostDeleted(id); onPostDeleted(id); }}/>} />
    </div>
  );
}

function PublicProfileView({
  profile,
  loading,
  shareable,
  viewerInitials,
  viewerId,
  followPending,
  onBack,
  onToggleFollow,
  onMessage,
}: {
  profile: PublicProfile | null;
  loading: boolean;
  shareable: boolean;
  viewerInitials: string;
  viewerId: string;
  followPending: boolean;
  onBack: () => void;
  onToggleFollow: (publicId: string) => void;
  onMessage: (person: DirectMessageRecipient) => void;
}) {
  const navigation = useAppNavigation();
  const [copied, setCopied] = useState(false);

  async function shareProfile() {
    if (!profile) return;
    const profileUrl = new URL(window.location.href);
    profileUrl.searchParams.set("profile", profile.publicId);
    const shareUrl = profileUrl.toString();

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Profil bağlantısını kopyala", shareUrl);
    }
  }

  if (loading) {
    return (
      <div className="workspace-view public-profile-state" aria-live="polite">
        <span className="profile-boot-line"><i/></span>
        <strong>Öğrenci profili getiriliyor…</strong>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="workspace-view">
        <button className="public-profile-back" type="button" onClick={onBack}><Icon name="arrow" size={15}/> Öğrenci ağına dön</button>
        <div className="public-profile-state"><span><Icon name="users" size={23}/></span><strong>Bu profile şu anda ulaşılamıyor.</strong><p>Öğrenci profilini güncellemiş veya görünürlük durumu değişmiş olabilir.</p></div>
      </div>
    );
  }

  return (
    <div className="workspace-view profile-view">
      <div className="public-profile-toolbar"><button className="public-profile-back" type="button" onClick={onBack}><Icon name="arrow" size={15}/> Öğrenci ağına dön</button><div>{profile.sameCampus !== false && <button className="public-profile-message" type="button" onClick={() => onMessage(profile)}><Icon name="message" size={15}/> Mesaj gönder</button>}{shareable && <button className="public-profile-share" type="button" onClick={() => void shareProfile()}><Icon name={copied ? "check" : "share"} size={15}/>{copied ? "Bağlantı kopyalandı" : "Profili paylaş"}</button>}{shareable && <ProfileSafetyMenu targetId={profile.publicId} targetName={profile.displayName}/>}</div></div>
      <section className="profile-hero">
        <div className="profile-main">
          <Avatar initials={profile.initials} className={profile.avatarClass} imageUrl={profile.avatarUrl}/>
          <div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div>
          <button className={profile.isFollowing ? "profile-following" : ""} type="button" disabled={followPending} onClick={() => onToggleFollow(profile.publicId)}>{followPending ? "Bekle…" : profile.isFollowing ? "Takiptesin" : "Takip et"}</button>
        </div>
        <p className={`profile-bio ${profile.bio ? "" : "profile-bio-muted"}`}>{profile.bio || `${profile.universityShortName} içindeki ders çevrelerinde öğreniyor ve paylaşıyor.`}</p>
        <ProfileLinks links={profile.links}/>
        <ProfileRelationshipStats targetId={profile.publicId} targetName={profile.displayName} postCount={profile.postCount} followerCount={profile.followerCount} followingCount={profile.followingCount} courseCount={profile.courses.length}/>
      </section>
      <ProfileContent key={profile.publicId} ownerScope={navigation?.ownerScope ?? ""} onSessionExpired={navigation?.onSessionExpired} userId={profile.publicId} own={false} about={<ProfileAbout profile={profile}/>} renderPost={(post, actions) => <FeedPost post={post} viewerInitials={viewerInitials} viewerId={viewerId} key={post.id} {...actions}/>} />
    </div>
  );
}

function ThemeSettings({ preference, onChange, onSignOut, onEditProfile, onNavigate }: { preference: ThemePreference; onChange: (preference: ThemePreference) => void; onSignOut: () => void; onEditProfile: () => void; onNavigate: (name: string) => void }) {
  const [reducedMotion, setReducedMotion] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "true");
  const [compact, setCompact] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.contentDensity === "compact");
  function saveReadingPreference(key: "reduceMotion" | "contentDensity", value: string) {
    document.documentElement.dataset[key] = value;
    try { window.localStorage.setItem(`kampira-${key}`, value); } catch { /* The current page still honors the preference when storage is unavailable. */ }
  }
  const options: Array<{ value: ThemePreference; icon: IconName; title: string; detail: string }> = [
    { value: "light", icon: "sun", title: "Açık", detail: "Aydınlık ve temiz görünüm" },
    { value: "dark", icon: "moon", title: "Koyu", detail: "Gece kullanımında daha rahat" },
    { value: "system", icon: "monitor", title: "Sistem", detail: "Cihazının görünümünü otomatik izle" },
  ];

  return (
    <div className="workspace-view settings-view">
      <WorkspaceHeader screenId="settings" section="Ayarlar" eyebrow="KİŞİSEL DENEYİMİN" title="Ayarlar" description="Görünümü ve okuma rahatlığını düzenle. Bu tercihler kullandığın cihazda otomatik olarak saklanır."/>
      <MobileAccountLinks onNavigate={onNavigate}/>
      <section className="settings-card app-account-settings" aria-label="Hesap ayarları"><h2>Hesabım</h2><button type="button" onClick={onEditProfile}>Profil ve üniversite bilgileri <Icon name="arrow" size={18}/></button><a href="/legal#help">Yardım ve destek <Icon name="arrow" size={18}/></a><a href="/account-deletion">Hesap ve veri silme talebi <Icon name="arrow" size={18}/></a></section>
      <section className="settings-card" aria-labelledby="theme-setting-title">
        <div className="settings-card-heading"><span className="settings-card-icon"><Icon name="settings" size={20}/></span><div><h2 id="theme-setting-title">Tema</h2><p>Uygulamanın renk görünümünü seç.</p></div></div>
        <div className="theme-choice-grid" role="radiogroup" aria-label="Tema seçimi">
          {options.map((option) => (
            <button className={preference === option.value ? "selected" : ""} key={option.value} type="button" role="radio" aria-checked={preference === option.value} onClick={() => onChange(option.value)}>
              <span className={`theme-preview theme-preview-${option.value}`} aria-hidden="true"><i/><b/><em/></span>
              <span className="theme-choice-copy"><i><Icon name={option.icon} size={18}/></i><span><strong>{option.title}</strong><small>{option.detail}</small></span></span>
              <span className="theme-choice-check">{preference === option.value && <Icon name="check" size={15}/>}</span>
            </button>
          ))}
        </div>
        <label className="settings-preference-row"><span><strong>Hareketi azalt</strong><small>Geçişleri ve animasyonları sadeleştir. Cihazının hareket azaltma tercihi de her zaman geçerlidir.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => { setReducedMotion(event.target.checked); saveReadingPreference("reduceMotion", String(event.target.checked)); }}/></label>
        <label className="settings-preference-row"><span><strong>Masaüstünde kompakt görünüm</strong><small>Daha az boşlukla daha fazla içerik gör. Telefonda dokunma alanları korunur.</small></span><input type="checkbox" checked={compact} onChange={(event) => { setCompact(event.target.checked); saveReadingPreference("contentDensity", event.target.checked ? "compact" : "comfortable"); }}/></label>
        <p className="settings-saved-note" role="status"><Icon name="check" size={15}/> Seçimin otomatik kaydedilir.</p>
      </section>
      <button className="app-sign-out" type="button" onClick={onSignOut}>Çıkış yap</button>
    </div>
  );
}

function SecondaryView({ name, profile, peopleScope, onPeopleScopeChange, people, peopleStatus, peopleQuery, shareableProfile, followPendingId, notesCourse, notesSource, marketTab, themePreference, messageRecipient, onMessagesUnreadChange, onThemeChange, onOpenPerson, onQueryPeople, onToggleFollow, onNavigate, onEditProfile, onSignOut, onPostUpdated, onPostDeleted, onSavedChange }: { name: string; profile: StudentProfile; peopleScope: "platform" | "campus"; onPeopleScopeChange: (scope: "platform" | "campus") => void; posts: Post[]; people: CampusPerson[]; peopleStatus: "loading" | "ready" | "empty" | "error"; peopleQuery: string; shareableProfile: boolean; followPendingId: string | null; notesCourse: NotesCourse | null; notesSource: NotesSource; marketTab: CampusMarketTab; themePreference: ThemePreference; messageRecipient: DirectMessageRecipient | null; onMessagesUnreadChange: (count: number) => void; onThemeChange: (preference: ThemePreference) => void; onOpenPerson: (person: CampusPerson) => void; onQueryPeople: (query: string) => void; onToggleFollow: (publicId: string) => void; onNavigate: (name: string) => void; onEditProfile: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onSavedChange: (post: Post, saved: boolean) => void }) {
  if (name === "Keşfet") return <DiscoverView scope={peopleScope} onScopeChange={onPeopleScopeChange} profile={profile} people={people} peopleStatus={peopleStatus} query={peopleQuery} followPendingId={followPendingId} onOpenPerson={onOpenPerson} onQueryChange={onQueryPeople} onToggleFollow={onToggleFollow} onNavigate={onNavigate}/>;
  if (name === "Mesajlar") return <DirectMessagesWorkspace initialRecipient={messageRecipient} onNavigate={onNavigate} onUnreadChange={onMessagesUnreadChange}/>;
  if (name === "Kampüs Anlık") return <CampusPulseWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Eşleş") return <SocialMatchWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kampüs") return <CampusGuideWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kütüphane") return <LibraryOccupancyWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Pazar") return <CampusMarketWorkspace key={marketTab} ownerId={profile.publicId} universityShortName={profile.universityShortName} initialTab={marketTab}/>;
  if (name === "Notlar") return <NotesWorkspace key={`${notesCourse?.id ?? "all"}:${notesSource}`} courses={profile.courses} initialCourse={notesCourse} initialSource={notesSource}/>;
  if (name === "Topluluklar") return <CommunitiesWorkspace courses={profile.courses}/>;
  if (name === "Bildirimler") return <NotificationsWorkspace/>;
  if (name === "Güvenlik") return <SafetyWorkspace/>;
  if (name === "Ayarlar") return <ThemeSettings preference={themePreference} onChange={onThemeChange} onSignOut={onSignOut} onEditProfile={onEditProfile} onNavigate={onNavigate}/>;
  if (name === "Kaydedilenler") return <SavedWorkspace onNavigate={onNavigate} renderPost={(post, onSaved, onUpdated, onDeleted) => <FeedPost post={post} onPostUpdated={(id, text) => { onUpdated(text); onPostUpdated(id, text); }} onPostDeleted={(id) => { onDeleted(); onPostDeleted(id); }} viewerInitials={getInitials(profile.displayName)} viewerId={profile.publicId} onSavedChange={(item, saved) => { onSaved(saved); onSavedChange(item, saved); }}/>} />;
  if (name === "Profil") return <ProfileView profile={profile} shareable={shareableProfile} onEdit={onEditProfile} onSignOut={onSignOut} onPostUpdated={onPostUpdated} onPostDeleted={onPostDeleted} onNavigate={onNavigate}/>;
  return <DiscoverView scope={peopleScope} onScopeChange={onPeopleScopeChange} profile={profile} people={people} peopleStatus={peopleStatus} query={peopleQuery} followPendingId={followPendingId} onOpenPerson={onOpenPerson} onQueryChange={onQueryPeople} onToggleFollow={onToggleFollow} onNavigate={onNavigate}/>;
}

function ProfileBoot() {
  return (
    <main className="profile-boot" aria-live="polite">
      <div className="profile-boot-brand"><Logo/></div>
      <span className="profile-boot-orb"><Icon name="sparkles" size={22}/></span>
      <h1>Kampüsün hazırlanıyor</h1>
      <p>Ders çevrelerini ve profilini getiriyoruz.</p>
      <span className="profile-boot-line"><i/></span>
    </main>
  );
}

function AuthGate({ onAuthenticated }: { onAuthenticated: (displayName: string) => void }) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [fields, setFields] = useState({ displayName: "", email: "", password: "", passwordConfirmation: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authRequest = useRef({ pending: false, generation: 0, controller: null as AbortController | null });
  useEffect(() => {
    const request = authRequest.current;
    return () => { request.generation++; request.pending = false; request.controller?.abort(); };
  }, []);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim());
  const authRequirements: Array<{ field: keyof typeof fields; message: string }> = [];
  if (mode === "register" && fields.displayName.trim().length < 2) authRequirements.push({ field: "displayName", message: "Adını ve soyadını en az 2 karakterle yaz." });
  if (!emailIsValid) authRequirements.push({ field: "email", message: mode === "register" ? "Geçerli bir e-posta adresi yaz." : "Geçerli e-posta adresini yaz." });
  if (fields.password.length < 10) authRequirements.push({ field: "password", message: mode === "register" ? "En az 10 karakterli bir parola oluştur." : "En az 10 karakterli parolanı yaz." });
  if (mode === "register" && (fields.passwordConfirmation.length < 10 || fields.passwordConfirmation !== fields.password)) {
    authRequirements.push({ field: "passwordConfirmation", message: "Parolanı aynı şekilde tekrar yaz." });
  }

  function updateAuthField(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function switchAuthMode(nextMode: "register" | "login") {
    if (authRequest.current.pending) return;
    setMode(nextMode);
    setShowPassword(false);
    setAttempted(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authRequest.current.pending) return;
    setAttempted(true);
    if (authRequirements.length) {
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${authRequirements[0].field}"]`)?.focus();
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (mode === "register" && password !== confirmation) {
      setError("Parolalar birbiriyle aynı olmalı.");
      return;
    }
    const request = authRequest.current;
    request.pending = true;
    const generation = ++request.generation;
    const controller = new AbortController();
    request.controller = controller;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/session", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: mode === "register" ? form.get("displayName") : undefined,
          email: form.get("email"),
          password,
        }),
      });
      const data = await response.json().catch(() => null) as { user?: { displayName?: string }; error?: string } | null;
      if (generation !== request.generation || controller.signal.aborted) return;
      if (!response.ok || !data?.user?.displayName) throw new Error(data?.error ?? "İşlem tamamlanamadı.");
      onAuthenticated(data.user.displayName);
    } catch (submitError) {
      if (generation !== request.generation || controller.signal.aborted) return;
      setError(submitError instanceof Error ? submitError.message : "İşlem tamamlanamadı.");
    } finally {
      if (generation === request.generation) { request.pending = false; request.controller = null; setBusy(false); }
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Logo/></div>
        <div className="auth-copy"><span>ÖĞRENCİ AĞIN</span><h1 id="auth-title">{mode === "register" ? "Kampira hesabını oluştur." : "Kampüsüne geri dön."}</h1><p>{mode === "register" ? "Hesabın anında açılır. Davet kodu veya yönetici onayı gerekmez." : "E-posta adresin ve parolanla kaldığın yerden devam et."}</p></div>
        <div className="auth-tabs" role="tablist" aria-label="Hesap işlemi">
          <button className={mode === "register" ? "active" : ""} type="button" role="tab" disabled={busy} aria-selected={mode === "register"} onClick={() => switchAuthMode("register")}>Kayıt ol</button>
          <button className={mode === "login" ? "active" : ""} type="button" role="tab" disabled={busy} aria-selected={mode === "login"} onClick={() => switchAuthMode("login")}>Giriş yap</button>
        </div>
        <form className="auth-form" aria-busy={busy} noValidate onSubmit={(event) => void submit(event)}>
          {mode === "register" && <label><span>Adın ve soyadın</span><input disabled={busy} name="displayName" value={fields.displayName} onChange={(event) => updateAuthField("displayName", event.target.value)} autoComplete="name" minLength={2} maxLength={60} required aria-invalid={attempted && fields.displayName.trim().length < 2} aria-describedby="auth-requirements" placeholder="Deniz Öztürk"/></label>}
          <label><span>E-posta adresin</span><input disabled={busy} name="email" type="email" value={fields.email} onChange={(event) => updateAuthField("email", event.target.value)} autoComplete="email" maxLength={254} required aria-invalid={attempted && !emailIsValid} aria-describedby="auth-requirements" placeholder="ogrenci@universite.edu.tr"/></label>
          <label htmlFor="auth-password"><span>Parolan</span></label><div className="auth-password-field"><input disabled={busy} id="auth-password" name="password" type={showPassword ? "text" : "password"} value={fields.password} onChange={(event) => updateAuthField("password", event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={10} maxLength={128} required aria-invalid={attempted && fields.password.length < 10} aria-describedby="auth-requirements" placeholder="En az 10 karakter"/><button type="button" disabled={busy} aria-label={showPassword ? "Parolan: parolayı gizle" : "Parolan: parolayı göster"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Gizle" : "Göster"}</button></div>
          {mode === "register" && <><label htmlFor="auth-passwordConfirmation"><span>Parolanı tekrar yaz</span></label><div className="auth-password-field"><input disabled={busy} id="auth-passwordConfirmation" name="passwordConfirmation" type={showPassword ? "text" : "password"} value={fields.passwordConfirmation} onChange={(event) => updateAuthField("passwordConfirmation", event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={attempted && (fields.passwordConfirmation.length < 10 || fields.passwordConfirmation !== fields.password)} aria-describedby="auth-requirements"/><button type="button" disabled={busy} aria-label={showPassword ? "Parolanı tekrar yaz: parolayı gizle" : "Parolanı tekrar yaz: parolayı göster"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Gizle" : "Göster"}</button></div></>}
          <div className={`auth-requirements${authRequirements.length ? "" : " ready"}`} id="auth-requirements" role="status" aria-live="polite">
            <span className="auth-requirements-icon"><Icon name={authRequirements.length ? "sparkles" : "check"} size={16}/></span>
            <div>
              <strong>{authRequirements.length ? "Devam etmek için" : "Bilgilerin hazır"}</strong>
              {authRequirements.length
                ? <ul>{authRequirements.map((requirement) => <li key={requirement.field}>{requirement.message}</li>)}</ul>
                : <p>{mode === "register" ? "Hesabını şimdi oluşturabilirsin." : "Hesabına şimdi giriş yapabilirsin."}</p>}
            </div>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy} aria-describedby="auth-requirements">{busy ? "İşlem tamamlanıyor…" : mode === "register" ? "Hesabımı oluştur" : "Giriş yap"}<Icon name="arrow" size={17}/></button>
        </form>
        <p className="auth-terms">Devam ederek <a href="/legal#terms">Kullanım Koşulları</a> ve <a href="/legal#privacy">Gizlilik Metni</a>&apos;ni kabul etmiş olursun.</p>
      </section>
      <aside className="auth-aside" aria-hidden="true" />
    </main>
  );
}

type CatalogUnit = {
  id: string;
  name: string;
  type: string;
  programCount: number;
};

type CatalogProgram = {
  id: string;
  unitId: string;
  name: string;
  degreeLevel: "associate" | "bachelor" | "integrated-master" | "master" | "doctorate";
  durationYears?: number | null;
  scoreType?: string | null;
  language?: string | null;
  accreditation?: string | null;
  validThrough?: string | null;
  curriculumUrls?: string[];
  curriculumAuthority?: string | null;
  curriculumPeriod?: string | null;
};

type CatalogPayload = {
  coverage: "official-programs" | "catalog-only";
  updatedAt: string;
  units: CatalogUnit[];
  referenceUnitCount: number;
  programs: CatalogProgram[];
  sources: Array<{ id: string; authority: string; title: string; url: string }>;
  limitations: string;
  error?: string;
};

type CourseCatalogItem = CourseSchedule & {
  code: string;
  name: string;
};

type CourseCatalogPayload = {
  available: boolean;
  catalogs?: Array<{ url: string; checkedAt: string }>;
  authority?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  curriculumPeriod?: string;
  coverage?: "partial" | "complete";
  courses: CourseCatalogItem[];
  limitations?: string;
  error?: string;
};

type CourseSelection = {
  code: string;
  name: string;
  source?: "catalog" | "manual";
};

const degreeLabels: Record<CatalogProgram["degreeLevel"], string> = {
  associate: "Önlisans",
  bachelor: "Lisans",
  "integrated-master": "Bütünleşik yüksek lisans",
  master: "Yüksek lisans",
  doctorate: "Doktora",
};

function normalizeCourseCode(value: string) {
  return value.replace(/\s+/g, "").toLocaleUpperCase("tr-TR");
}

function getCourseCover(course: Pick<AcademicCourse, "code" | "name">) {
  const haystack = `${course.code} ${course.name}`.toLocaleUpperCase("tr-TR");
  if (/FİZ|FIZ|MEKANİK|MEKANIK|PHYS/.test(haystack)) return "/course-covers/physics.jpg";
  if (/MAT|CEBİR|CEBIR|ANALİZ|ANALIZ|KALKÜLÜS|KALKULUS|CALCULUS|GEOMETRİ|GEOMETRI/.test(haystack)) return "/course-covers/mathematics.jpg";
  if (/BİL|BIL|YAZ|PROGRAM|ALGORİTMA|ALGORITMA|VERİ|VERI|KOD|COMPUTER|SOFTWARE/.test(haystack)) return "/course-covers/programming.jpg";
  return "/course-covers/study.jpg";
}

function AcademicOnboarding({
  identityName,
  initialProfile,
  state,
  mode = "onboarding",
  onComplete,
  onCancel,
  onRetry,
  onSessionExpired,
}: {
  identityName: string;
  initialProfile: StudentProfile | null;
  state: Extract<ProfileState, "needs-onboarding" | "unavailable">;
  mode?: "onboarding" | "edit";
  onComplete: (profile: StudentProfile) => void;
  onCancel?: () => void;
  onRetry: () => void;
  onSessionExpired?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? identityName);
  const [universityId, setUniversityId] = useState(initialProfile?.universityId ?? "omu");
  const [universityQuery, setUniversityQuery] = useState("");
  const [facultyId, setFacultyId] = useState(initialProfile?.facultyId ?? "");
  const [departmentId, setDepartmentId] = useState(initialProfile?.departmentId ?? "");
  const [customFacultyName, setCustomFacultyName] = useState(initialProfile?.facultyName ?? "");
  const [customDepartmentName, setCustomDepartmentName] = useState(initialProfile?.departmentName ?? "");
  const [classYear, setClassYear] = useState(initialProfile?.classYear ?? 1);
  const [customCourses, setCustomCourses] = useState<CourseSelection[]>(
    initialProfile?.courses.length
      ? initialProfile.courses.map((course) => ({ code: course.code, name: course.name, source: "manual" }))
      : [{ code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }],
  );
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [catalogRequestRevision, setCatalogRequestRevision] = useState(0);
  const [manualAcademic, setManualAcademic] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const [courseCatalog, setCourseCatalog] = useState<CourseCatalogPayload | null>(null);
  const [courseCatalogLoading, setCourseCatalogLoading] = useState(false);
  const [courseCatalogError, setCourseCatalogError] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [courseSemesterFilter, setCourseSemesterFilter] = useState<"recommended" | "all">("recommended");
  const [manualCourseEntry, setManualCourseEntry] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveRequest = useRef({ pending: false, generation: 0, controller: null as AbortController | null });
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    const request = saveRequest.current;
    return () => { request.generation++; request.pending = false; request.controller?.abort(); };
  }, []);
  useEffect(() => {
    if (step === previousStep.current) return;
    previousStep.current = step;
    stepTitle.current?.focus({ preventScroll: true });
    stepTitle.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [step]);

  const selectedUniversity = getUniversityById(universityId);
  const usesOfficialCatalog = !manualAcademic && Boolean(catalog?.units.length);
  const selectedFaculty = catalog?.units.find((unit) => unit.id === facultyId);
  const selectedDepartment = catalog?.programs.find((program) => program.id === departmentId);
  const facultyDepartments = catalog?.programs.filter((program) => program.unitId === facultyId) ?? [];
  const normalizedUnitQuery = unitQuery.trim().toLocaleLowerCase("tr-TR");
  const normalizedProgramQuery = programQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleUnits = (catalog?.units ?? []).filter((unit) => `${unit.name} ${unit.type}`.toLocaleLowerCase("tr-TR").includes(normalizedUnitQuery));
  const visiblePrograms = facultyDepartments.filter((program) => `${program.name} ${degreeLabels[program.degreeLevel]} ${program.scoreType ?? ""}`.toLocaleLowerCase("tr-TR").includes(normalizedProgramQuery));
  const validCustomCourses = customCourses
    .map((course) => ({ code: course.code.trim(), name: course.name.trim() }))
    .filter((course) => course.code && course.name);
  const selectedCourseCodes = new Set(validCustomCourses.map((course) => normalizeCourseCode(course.code)));
  const recommendedSemesters = classYear >= 1 && classYear <= 6 ? [classYear * 2 - 1, classYear * 2] : [];
  const normalizedCourseQuery = courseQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleCourseOptions = (courseCatalog?.courses ?? []).filter((course) => {
    const matchesPeriod = courseSemesterFilter === "all" || courseMatchesYear(course, classYear);
    const matchesQuery = !normalizedCourseQuery || `${course.code} ${course.name}`.toLocaleLowerCase("tr-TR").includes(normalizedCourseQuery);
    return matchesPeriod && matchesQuery;
  });
  const visibleUniversities = useMemo(() => {
    const query = universityQuery.trim().toLocaleLowerCase("tr-TR");
    const matches = query
      ? universities.filter((university) => `${university.name} ${university.shortName} ${university.region}`.toLocaleLowerCase("tr-TR").includes(query))
      : universities;
    return [...matches].sort((left, right) => {
      if (left.id === universityId) return -1;
      if (right.id === universityId) return 1;
      return left.name.localeCompare(right.name, "tr-TR");
    });
  }, [universityId, universityQuery]);
  const isEditing = mode === "edit";
  const firstName = getFirstName(displayName || identityName);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/academic-catalog?universityId=${encodeURIComponent(universityId)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as CatalogPayload;
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error ?? "Akademik katalog yüklenemedi.");
        setCatalog(payload);
        setFacultyId((current) => {
          if (!current || payload.units.some((unit) => unit.id === current)) return current;
          setManualAcademic(true);
          setDepartmentId("");
          return "";
        });
        if (payload.units.length === 0) setManualAcademic(true);
      })
      .catch((catalogLoadError) => {
        if (controller.signal.aborted) return;
        setCatalogError(catalogLoadError instanceof Error ? catalogLoadError.message : "Akademik katalog yüklenemedi.");
        setManualAcademic(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });

    return () => controller.abort();
  }, [universityId, catalogRequestRevision]);

  useEffect(() => {
    if (!usesOfficialCatalog || !departmentId) return;

    const controller = new AbortController();

    void fetch(`/api/course-catalog?universityId=${encodeURIComponent(universityId)}&programId=${encodeURIComponent(departmentId)}`, {
      headers: { accept: "application/json" },
      cache: "no-cache",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as CourseCatalogPayload;
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error ?? "Ders kataloğu yüklenemedi.");
        if (controller.signal.aborted) return;
        setCourseCatalog(payload);
        setManualCourseEntry(!payload.available);
        if (payload.available) {
          setCustomCourses((current) => current.some((course) => course.code.trim() || course.name.trim()) ? current : []);
        }
      })
      .catch((courseLoadError) => {
        if (controller.signal.aborted) return;
        setCourseCatalog(null);
        setCourseCatalogError(courseLoadError instanceof Error ? courseLoadError.message : "Ders kataloğu yüklenemedi.");
        setManualCourseEntry(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCourseCatalogLoading(false);
      });

    return () => controller.abort();
  }, [usesOfficialCatalog, universityId, departmentId]);

  if (state === "unavailable") {
    return (
      <main className="onboarding-shell onboarding-state-shell">
        <div className="onboarding-state-card">
          <Logo/>
          <span className="onboarding-state-icon onboarding-state-warning"><Icon name="sparkles" size={27}/></span>
          <span className="onboarding-kicker">KISA BİR ARA</span>
          <h1>Profil alanını hazırlıyoruz.</h1>
          <p>Akademik profil hizmetine şu an ulaşamadık. Yeniden deneyebilir veya ürün turuna devam edebilirsin.</p>
          <button className="onboarding-signin" type="button" onClick={onRetry}>Yeniden dene <Icon name="arrow" size={17}/></button>
        </div>
      </main>
    );
  }

  function chooseFaculty(nextFacultyId: string) {
    setFacultyId(nextFacultyId);
    setDepartmentId("");
    setCourseCatalog(null);
    setCourseCatalogLoading(false);
    setCourseCatalogError("");
    setCustomCourses([{ code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }]);
    setManualCourseEntry(true);
    setProgramQuery("");
    setError("");
  }

  function chooseUniversity(nextUniversityId: string) {
    if (nextUniversityId === universityId && (catalog || catalogLoading)) {
      setUniversityQuery("");
      setError("");
      return;
    }
    setUniversityId(nextUniversityId);
    setCatalog(null);
    setCatalogLoading(true);
    setCatalogError("");
    setFacultyId("");
    setDepartmentId("");
    setCustomFacultyName("");
    setCustomDepartmentName("");
    setCustomCourses([{ code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }]);
    setCourseCatalog(null);
    setCourseCatalogLoading(false);
    setCourseCatalogError("");
    setCourseQuery("");
    setManualCourseEntry(true);
    setManualAcademic(false);
    setUnitQuery("");
    setProgramQuery("");
    setError("");
    if (nextUniversityId === universityId) setCatalogRequestRevision((revision) => revision + 1);
  }

  function chooseDepartment(nextDepartmentId: string) {
    if (nextDepartmentId !== departmentId) {
      setCustomCourses([{ code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }, { code: "", name: "", source: "manual" }]);
      setCourseCatalog(null);
      setCourseCatalogLoading(true);
      setCourseCatalogError("");
      setCourseQuery("");
      setCourseSemesterFilter("recommended");
      setManualCourseEntry(true);
    }
    setDepartmentId(nextDepartmentId);
    setError("");
  }

  function updateCustomCourse(index: number, field: "code" | "name", value: string) {
    setCustomCourses((current) => current.map((course, courseIndex) => courseIndex === index ? { ...course, [field]: value } : course));
    setError("");
  }

  function toggleCatalogCourse(course: CourseCatalogItem) {
    const normalizedCode = normalizeCourseCode(course.code);
    if (selectedCourseCodes.has(normalizedCode)) {
      setCustomCourses((current) => current.filter((item) => normalizeCourseCode(item.code) !== normalizedCode));
      setError("");
      return;
    }
    if (validCustomCourses.length >= 8) {
      setError("En fazla 8 ders seçebilirsin. Yeni bir ders eklemek için önce seçtiklerinden birini kaldır.");
      return;
    }
    setCustomCourses((current) => [
      ...current.filter((item) => item.code.trim() || item.name.trim()),
      { code: course.code, name: course.name, source: "catalog" },
    ]);
    setError("");
  }

  function toggleManualCourseEntry() {
    setManualCourseEntry((current) => {
      const next = !current;
      if (next && !customCourses.some((course) => course.source !== "catalog")) {
        setCustomCourses((courses) => [...courses, { code: "", name: "", source: "manual" }]);
      }
      return next;
    });
    setError("");
  }

  async function saveProfile() {
    const request = saveRequest.current;
    if (request.pending) return;
    request.pending = true;
    const generation = ++request.generation;
    const controller = new AbortController();
    request.controller = controller;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          universityId,
          facultyId: usesOfficialCatalog ? facultyId : undefined,
          departmentId: usesOfficialCatalog ? departmentId : undefined,
          facultyName: usesOfficialCatalog ? undefined : customFacultyName,
          departmentName: usesOfficialCatalog ? undefined : customDepartmentName,
          classYear,
          customCourses: validCustomCourses,
        }),
      });
      const data = await response.json().catch(() => null) as { profile?: StudentProfile; error?: string } | null;
      if (generation !== request.generation || controller.signal.aborted) return;

      if (response.status === 401) {
        setError("Oturumun sona erdi. Devam etmek için yeniden giriş yap.");
        onSessionExpired?.();
        return;
      }
      if (!response.ok || !data?.profile) {
        throw new Error(data?.error ?? "Profilin kaydedilemedi.");
      }

      onComplete(data.profile);
    } catch (saveError) {
      if (generation !== request.generation || controller.signal.aborted) return;
      setError(saveError instanceof Error ? saveError.message : "Profilin kaydedilemedi.");
    } finally {
      if (generation === request.generation) { request.pending = false; request.controller = null; setSaving(false); }
    }
  }

  const stepRequirement =
    step === 1 && !universityId
      ? "Bir üniversite seç."
      : step === 2 && catalogLoading
        ? "Akademik birimlerin yüklenmesini bekle; ardından fakülte, yüksekokul veya enstitünü seç."
        : step === 2 && usesOfficialCatalog && !facultyId
          ? "Fakülte, yüksekokul veya akademik birimini listeden seç."
          : step === 2 && !usesOfficialCatalog && customFacultyName.trim().length < 2
            ? "Akademik biriminin adını en az 2 karakterle yaz."
            : step === 3 && usesOfficialCatalog && !departmentId
              ? "Bölüm veya programını listeden seç."
              : step === 3 && !usesOfficialCatalog && customDepartmentName.trim().length < 2
                ? "Bölüm veya program adını en az 2 karakterle yaz."
                : step === 4 && validCustomCourses.length < 3
                  ? `${3 - validCustomCourses.length} ders daha seç veya ders kodu ve adıyla ekle.`
                  : step === 5 && displayName.trim().length < 2
                    ? "Görünen adını en az 2 karakterle yaz."
                    : "";
  const nextDisabled = saving || (step === 2 && catalogLoading);

  function focusMissingOnboardingField() {
    const panel = document.querySelector<HTMLElement>(".onboarding-panel");
    const selector = step === 1
      ? ".university-search-field input"
      : step === 2
        ? usesOfficialCatalog ? ".catalog-inline-search input" : ".custom-academic-field input"
        : step === 3
          ? usesOfficialCatalog ? ".catalog-inline-search input" : ".custom-academic-field input"
          : step === 4
            ? manualCourseEntry ? ".custom-course-row input" : ".official-course-grid > button"
            : ".summary-name-field input";
    const target = step === 4 && manualCourseEntry
      ? [...(panel?.querySelectorAll<HTMLInputElement>(".custom-course-row input") ?? [])].find((input) => !input.value.trim()) ?? panel?.querySelector<HTMLElement>(selector)
      : panel?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ behavior: "auto", block: "center" });
    target?.focus({ preventScroll: true });
  }

  function continueOnboarding() {
    if (saveRequest.current.pending) return;
    if (stepRequirement) {
      focusMissingOnboardingField();
      return;
    }
    if (step < 5) {
      setStep(step + 1);
      setError("");
      return;
    }
    void saveProfile();
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Logo/>
        <div className="onboarding-progress-copy"><span>{selectedUniversity?.shortName ?? "Kampira"} {isEditing ? "profil düzenleme" : "profil kurulumu"}</span><strong>{step} / 5</strong></div>
      </header>

      <section className="onboarding-panel" aria-busy={saving} aria-labelledby="onboarding-title">
        <div className="onboarding-rail" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((item) => <span className={item <= step ? "active" : ""} key={item}><i/></span>)}
        </div>

        <div className="onboarding-copy">
          <span className="onboarding-kicker">
            {step === 1 && "ÜNİVERSİTENİ SEÇ"}
            {step === 2 && "FAKÜLTEN"}
            {step === 3 && "AKADEMİK YOLUN"}
            {step === 4 && "DERS ÇEVRELERİN"}
            {step === 5 && (isEditing ? "DEĞİŞİKLİKLERİN" : "HER ŞEY HAZIR")}
          </span>
          <h1 id="onboarding-title" tabIndex={-1} ref={stepTitle}>
            {step === 1 && (isEditing ? `${firstName}, kampüs bilgilerini güncelle.` : `Merhaba ${firstName}, kampüsünü bulalım.`)}
            {step === 2 && "Hangi fakültedesin?"}
            {step === 3 && "Bölümünü ve sınıfını seç."}
            {step === 4 && "Bu dönem hangi derslerdesin?"}
            {step === 5 && (isEditing ? "Profilini son kez kontrol et." : "Sana özel kampüsü kuralım.")}
          </h1>
          <p>
            {step === 1 && "Türkiye ve Kıbrıs’taki üniversiteler arasından okulunu ara ve seç."}
            {step === 2 && "Fakülten, sana gösterilecek bölüm çevrelerini ve kampüs önerilerini belirler."}
            {step === 3 && `Akışını ${selectedUniversity?.shortName ?? "kampüsündeki"} öğrencileriyle eşleştireceğiz.`}
            {step === 4 && "Bu dönem aldığın en az 3 dersi kodu ve adıyla ekle; not ve ders çevrelerin bunlarla kurulacak."}
            {step === 5 && (isEditing ? "Görünen adını ve akademik seçimlerini kontrol edip değişikliklerini kaydet." : "Seçimlerini kontrol et. Profilin sonraki ziyaretlerinde de seni bekleyecek.")}
          </p>
        </div>

        <div className="onboarding-content">
          {step === 1 && (
            <div className="academic-step university-catalog-step">
              <div className="university-visual-card">
                <span>TEMSİLİ KAMPÜS İLLÜSTRASYONU</span>
                <strong>{selectedUniversity?.name ?? "Kampüsünü seç, çevreni kur"}</strong>
                <small>Görsel herhangi bir üniversitenin resmî fotoğrafı veya yerleşkesinin birebir temsili değildir.</small>
              </div>
              <label className="university-search-field">
                <Icon name="search" size={18}/>
                <input aria-label="Üniversite ara" value={universityQuery} onChange={(event) => setUniversityQuery(event.target.value)} placeholder="Üniversite adı, kısaltma veya bölge ara" autoComplete="off"/>
                {universityQuery && <button type="button" onClick={() => setUniversityQuery("")} aria-label="Üniversite aramasını temizle"><Icon name="close" size={15}/></button>}
              </label>
              <div className="university-catalog-meta"><span>{universities.filter((university) => university.region === "Türkiye").length} Türkiye</span><span>{universities.filter((university) => university.region !== "Türkiye").length} Kıbrıs</span><small>Resmî katalog · 4 Eylül 2026</small></div>
              <div className="university-grid university-catalog-grid">
                {visibleUniversities.slice(0, 80).map((university) => (
                  <button className={universityId === university.id ? "selected" : ""} type="button" onClick={() => chooseUniversity(university.id)} key={university.id}>
                    <UniversityMark university={university}/><div><strong>{university.name}</strong><small>{university.city}</small></div><i>{universityId === university.id && <Icon name="check" size={14}/>}</i>
                  </button>
                ))}
              </div>
              {visibleUniversities.length === 0 && <p className="university-catalog-empty">Bu adla eşleşen üniversite bulunamadı.</p>}
              {visibleUniversities.length > 80 && <p className="university-catalog-hint">{visibleUniversities.length} sonuç var. Üniversite adını yazarak listeyi daraltabilirsin.</p>}
            </div>
          )}

          {step === 2 && (
            <div className="academic-step">
              <div className="onboarding-field-title"><span>Akademik birimin{stepRequirement && !catalogLoading ? <em>Seçim gerekli</em> : null}</span><small>{selectedUniversity?.name}</small></div>
              {catalogLoading && <div className="catalog-loading"><Icon name="sparkles" size={18}/> Resmî akademik katalog yükleniyor…</div>}
              {!catalogLoading && catalog?.units.length ? <>
                <div className="catalog-source-note"><Icon name="check" size={15}/><span><strong>{catalog.units.length} seçilebilir birim · {catalog.programs.length} resmî program</strong><small>{catalog.sources.map((source) => source.authority).filter((value, index, values) => values.indexOf(value) === index).join(" + ")} · {catalog.updatedAt}</small></span></div>
                {!manualAcademic && <label className="catalog-inline-search"><Icon name="search" size={16}/><input aria-label="Akademik birim ara" value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} placeholder="Fakülte, yüksekokul veya akademik birim ara"/></label>}
                {!manualAcademic && <div className="faculty-grid">
                {visibleUnits.map((faculty) => (
                  <button className={facultyId === faculty.id ? "selected" : ""} type="button" onClick={() => chooseFaculty(faculty.id)} key={faculty.id}>
                    <span>{faculty.type.slice(0, 3).toLocaleUpperCase("tr-TR")}</span><div><strong>{faculty.name}</strong><small>{faculty.type} · {faculty.programCount} program</small></div><i>{facultyId === faculty.id && <Icon name="check" size={14}/>}</i>
                  </button>
                ))}
                </div>}
                <button className="catalog-manual-toggle" type="button" onClick={() => { setManualAcademic((current) => !current); setFacultyId(""); setDepartmentId(""); setCourseCatalog(null); setCourseCatalogLoading(false); setCourseCatalogError(""); setManualCourseEntry(true); setError(""); }}>{manualAcademic ? "Resmî listeden seç" : "Birimim listede yok"}</button>
              </> : null}
              {!catalogLoading && (manualAcademic || !catalog?.units.length) && <label className="custom-academic-field"><span>Fakülte, yüksekokul veya enstitü adı</span><input value={customFacultyName} onChange={(event) => { setCustomFacultyName(event.target.value); setError(""); }} maxLength={100} aria-invalid={customFacultyName.trim().length < 2} aria-describedby="onboarding-requirement" placeholder="Örn. Mühendislik Fakültesi"/><small>Resmî öğrenci kaydında gördüğün akademik birim adını yaz.</small></label>}
              {!catalogLoading && (catalogError || !catalog?.units.length) && <p className="catalog-coverage-warning">{catalogError || "Bu kurum için merkezî resmî program kaydı bulunamadı; bilgini öğrenci kaydındaki biçimiyle yazabilirsin."}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="academic-step">
              <div className="onboarding-field-title"><span>Programın{stepRequirement ? <em>Seçim gerekli</em> : null}</span><small>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName}</small></div>
              {usesOfficialCatalog ? <>
                <label className="catalog-inline-search"><Icon name="search" size={16}/><input aria-label="Bölüm veya program ara" value={programQuery} onChange={(event) => setProgramQuery(event.target.value)} placeholder="Bölüm veya program ara"/></label>
                <div className="department-grid catalog-program-grid">
                {visiblePrograms.map((department) => (
                  <button className={departmentId === department.id ? "selected" : ""} type="button" onClick={() => chooseDepartment(department.id)} key={department.id}>
                    <span><strong>{department.name}</strong><small>{degreeLabels[department.degreeLevel]}{department.durationYears ? ` · ${department.durationYears} yıl` : ""}{department.scoreType ? ` · ${department.scoreType}` : ""}{department.language ? ` · ${department.language}` : ""}</small></span>{departmentId === department.id && <Icon name="check" size={15}/>}
                  </button>
                ))}
                </div>
                {visiblePrograms.length === 0 && <p className="university-catalog-empty">Bu birimde aramanla eşleşen program bulunamadı.</p>}
              </> : <label className="custom-academic-field"><span>Bölüm veya program adı</span><input value={customDepartmentName} onChange={(event) => { setCustomDepartmentName(event.target.value); setError(""); }} maxLength={100} aria-invalid={customDepartmentName.trim().length < 2} aria-describedby="onboarding-requirement" placeholder="Örn. Bilgisayar Mühendisliği"/><small>Önlisans, lisans veya lisansüstü program adını kullanabilirsin.</small></label>}
              <div className="onboarding-field-title class-title"><span>Kaçıncı sınıftasın?</span><small>Hazırlık dahil seçim yapabilirsin.</small></div>
              <div className="year-picker">
                {[1, 2, 3, 4, 5, 6].map((year) => <button className={classYear === year ? "selected" : ""} type="button" onClick={() => setClassYear(year)} key={year}>{year === 1 ? "Hazırlık / 1" : year}<small>{year === 6 ? "+" : ". sınıf"}</small></button>)}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="course-step">
              <div className={`course-count${validCustomCourses.length < 3 ? " needs-selection" : ""}`}><span><strong>{validCustomCourses.length}</strong> ders ekledin</span><small>{validCustomCourses.length < 3 ? `${3 - validCustomCourses.length} ders daha gerekli` : "En fazla 8 ders"}</small></div>
              {selectedDepartment?.curriculumUrls?.[0] && <a className="catalog-curriculum-link" href={selectedDepartment.curriculumUrls[0]} target="_blank" rel="noreferrer"><Icon name="file" size={16}/><span>Resmî ders / müfredat planını aç{(selectedDepartment.curriculumAuthority || selectedDepartment.curriculumPeriod) ? <small>{[selectedDepartment.curriculumAuthority, selectedDepartment.curriculumPeriod].filter(Boolean).join(" · ")}</small> : null}</span><Icon name="arrow" size={14}/></a>}
              {courseCatalogLoading && <div className="course-catalog-loading"><Icon name="sparkles" size={18}/> Bölümünün resmî dersleri hazırlanıyor…</div>}
              {!courseCatalogLoading && courseCatalog?.available && <section className="official-course-picker" aria-labelledby="official-course-picker-title">
                <header><div><span>DOĞRULANMIŞ DERS KATALOĞU</span><h2 id="official-course-picker-title">Derslerini listeden seç</h2><p>{courseCatalog.authority} tarafından yayımlanan programdan derlendi.</p></div><a href={courseCatalog.sourceUrl} target="_blank" rel="noreferrer">Kaynağı aç <Icon name="arrow" size={14}/></a></header>
                <div className="course-picker-tools">
                  <label><Icon name="search" size={17}/><input value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Ders kodu veya adı ara" aria-label="Resmî derslerde ara"/>{courseQuery && <button type="button" onClick={() => setCourseQuery("")} aria-label="Ders aramasını temizle"><Icon name="close" size={14}/></button>}</label>
                  <div role="group" aria-label="Ders dönemi filtresi"><button className={courseSemesterFilter === "recommended" ? "active" : ""} type="button" onClick={() => setCourseSemesterFilter("recommended")}>{recommendedSemesters.length ? `${classYear}. sınıf` : "Sınıfım"}</button><button className={courseSemesterFilter === "all" ? "active" : ""} type="button" onClick={() => setCourseSemesterFilter("all")}>Tüm dönemler</button></div>
                </div>
                <div className="official-course-grid">
                  {visibleCourseOptions.map((course) => {
                    const selected = selectedCourseCodes.has(normalizeCourseCode(course.code));
                    return <button className={selected ? "selected" : ""} type="button" aria-pressed={selected} onClick={() => toggleCatalogCourse(course)} key={course.code}><span><small>{course.code}</small><strong>{course.name}</strong><em>{courseScheduleLabel(course)}</em></span><i>{selected ? <Icon name="check" size={15}/> : <Icon name="plus" size={15}/>}</i></button>;
                  })}
                </div>
                {visibleCourseOptions.length === 0 && <p className="official-course-empty">Bu filtreyle eşleşen ders yok. Tüm dönemleri açabilir veya dersi elle ekleyebilirsin.</p>}
                <footer><Icon name="check" size={15}/><span>{courseCatalog.curriculumPeriod && <>Müfredat: {courseCatalog.curriculumPeriod}. </>}{courseCatalog.verifiedAt} tarihinde resmî kaynaktan kontrol edildi. {courseCatalog.coverage === "partial" && "Kaynakta okunabilen dersler listelenir; belirtilmeyen dönem ve ders türleri tahmin edilmez. "}Listede olmayan dersini elle ekleyebilirsin.</span></footer>
              </section>}
              {!courseCatalogLoading && !courseCatalog?.available && <div className="course-catalog-unavailable"><Icon name="file" size={18}/><span><strong>Bu programın ders listesi henüz yapılandırılmadı.</strong><small>{courseCatalogError || "Resmî bağlantı mevcutsa yukarıdan kontrol edebilir; derslerini aşağıya elle ekleyebilirsin."}</small></span></div>}
              {!courseCatalogLoading && !courseCatalog?.available && courseCatalog?.catalogs?.map((catalog, index) => <a key={catalog.url} className="catalog-curriculum-link" href={catalog.url} target="_blank" rel="noreferrer"><Icon name="file" size={16}/><span>Üniversitenin resmî ders kataloğunu aç{index > 0 ? ` (${index + 1})` : ""}<small>Katalogdan bölümünü seçebilirsin · {catalog.checkedAt} tarihinde kontrol edildi</small></span><Icon name="arrow" size={14}/></a>)}
              {validCustomCourses.length > 0 && <div className="selected-course-tray"><span>Seçtiklerin</span><div>{validCustomCourses.map((course) => <button type="button" onClick={() => setCustomCourses((current) => current.filter((item) => normalizeCourseCode(item.code) !== normalizeCourseCode(course.code)))} key={`${course.code}-${course.name}`}>{course.code}<Icon name="close" size={12}/></button>)}</div></div>}
              <button className="manual-course-toggle" type="button" onClick={toggleManualCourseEntry}><Icon name={manualCourseEntry ? "close" : "plus"} size={15}/>{manualCourseEntry ? "Elle ders ekleme alanını kapat" : "Dersim listede yok, elle ekle"}</button>
              {manualCourseEntry && <div className="custom-course-list">
                {customCourses.map((course, index) => course.source !== "catalog" && <div className="custom-course-row" key={index}>
                  <label><span>Ders kodu</span><input value={course.code} onChange={(event) => updateCustomCourse(index, "code", event.target.value)} maxLength={20} aria-invalid={Boolean(course.name.trim()) && !course.code.trim()} aria-describedby="onboarding-requirement" placeholder="BİL 101"/></label>
                  <label><span>Ders adı</span><input value={course.name} onChange={(event) => updateCustomCourse(index, "name", event.target.value)} maxLength={200} aria-invalid={Boolean(course.code.trim()) && !course.name.trim()} aria-describedby="onboarding-requirement" placeholder="Programlamaya Giriş"/></label>
                  <button type="button" onClick={() => setCustomCourses((current) => current.filter((_, courseIndex) => courseIndex !== index))} aria-label={`${index + 1}. dersi kaldır`}><Icon name="trash" size={16}/></button>
                </div>)}
                {validCustomCourses.length < 8 && <button className="custom-course-add" type="button" onClick={() => setCustomCourses((current) => [...current, { code: "", name: "", source: "manual" }])}><Icon name="plus" size={15}/> Başka ders ekle</button>}
              </div>}
            </div>
          )}

          {step === 5 && (
            <div className="onboarding-summary">
              <div className="summary-identity">
                <span className="summary-avatar">{getInitials(displayName || identityName)}</span>
                <label className="summary-name-field"><span>Görünen adın{stepRequirement ? <em>Gerekli</em> : null}</span><input disabled={saving} value={displayName} onChange={(event) => { setDisplayName(event.target.value); setError(""); }} maxLength={60} autoComplete="name" aria-label="Görünen ad" aria-invalid={displayName.trim().length < 2} aria-describedby="onboarding-requirement"/><small>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName} · {usesOfficialCatalog ? selectedDepartment?.name : customDepartmentName} · {classYear}. sınıf</small></label>
                <span className="summary-ready"><Icon name="check" size={15}/> Hazır</span>
              </div>
              <div className="summary-campus">
                {selectedUniversity && <UniversityMark university={selectedUniversity} variant="campus"/>}
                <div><small>KAMPÜSÜN</small><strong>{selectedUniversity?.name}</strong><p>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName} çevresindeki öğrencilerle buluş.</p></div>
              </div>
              <div className="summary-courses"><span>Ders çevrelerin</span><div>{validCustomCourses.map((course) => <strong key={`${course.code}-${course.name}`}>{course.code}</strong>)}</div></div>
              <div className="summary-note"><Icon name="sparkles" size={18}/><p>Akışın bu seçimlere göre kişiselleşecek. Profilini daha sonra istediğin zaman güncelleyebilirsin.</p></div>
            </div>
          )}
        </div>

        {stepRequirement && <div className={`onboarding-requirement${catalogLoading ? " loading" : ""}`} id="onboarding-requirement" role="status" aria-live="polite">
          <span><Icon name={catalogLoading ? "sparkles" : "arrow"} size={16}/></span>
          <div><strong>{catalogLoading ? "Seçenekler hazırlanıyor" : "Devam etmek için"}</strong><p>{stepRequirement}</p></div>
        </div>}
        {error && <p className="onboarding-error" role="alert">{error}</p>}

        <footer className="onboarding-actions">
          {isEditing && <button className="onboarding-cancel" type="button" onClick={onCancel} disabled={saving}>İptal</button>}
          <div>
            {step > 1 && <button className="onboarding-back" type="button" onClick={() => { setStep(step - 1); setError(""); }} disabled={saving}>Geri</button>}
            <button className="onboarding-next" type="button" disabled={nextDisabled} aria-describedby={stepRequirement ? "onboarding-requirement" : undefined} onClick={continueOnboarding}>
              {saving ? "Kaydediliyor…" : step === 5 ? isEditing ? "Değişiklikleri kaydet" : "Kampira’ya gir" : "Devam et"}
              {!saving && <Icon name="arrow" size={17}/>}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function campusLiveRemaining(expiresAt: string | null) {
  if (!expiresAt) return "Kalıcı";
  const remainingMinutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
  if (remainingMinutes < 60) return `${remainingMinutes} dk kaldı`;
  return `${Math.ceil(remainingMinutes / 60)} sa kaldı`;
}

function CampusLiveHome({
  items,
  status,
  universityShortName,
  reactionPendingId,
  onNavigate,
  onReact,
}: {
  items: CampusLivePreview[];
  status: "loading" | "ready" | "error";
  universityShortName: string;
  reactionPendingId: string | null;
  onNavigate: (name: string, marketTab?: CampusMarketTab) => void;
  onReact: (item: CampusLivePreview, reaction: "confirm" | "outdated") => void;
}) {
  const railItems = ([
    { category: "study", title: "Kütüphane", route: "Kütüphane", image: "/social-live/library-study.webp", icon: BookOpen, fallback: "Alanları gör" },
    { category: "food", title: "Yemekhane", route: "Pazar", image: "/social-live/cafeteria.webp", icon: ForkKnife, fallback: "Fiyatları gör", marketTab: "prices" },
    { category: "event", title: "Etkinlik", route: "Kampüs", image: "/social-live/campus-event.webp", icon: CalendarDots, fallback: "Etkinlikleri gör" },
  ] satisfies Array<{ category: string; title: string; route: string; image: string; icon: typeof BookOpen; fallback: string; marketTab?: CampusMarketTab }>).map((entry) => ({ ...entry, live: items.find((item) => item.category === entry.category) ?? null }));
  const featured = items[0] ?? null;
  const featuredImage = featured?.imageUrl ?? "/social-live/library-study.webp";

  return (
    <section className="campus-live-home" aria-labelledby="campus-live-home-title">
      <header className="campus-live-heading">
        <div><span>KAMPÜS CANLI</span><h1 id="campus-live-home-title">Kampüsünde şimdi</h1></div>
        <button type="button" onClick={() => onNavigate("Kampüs Anlık")}>
          <i className={items.length > 0 ? "is-live" : ""}/>{status === "loading" ? "Yükleniyor" : items.length > 0 ? "Canlı" : "Kampüs"}
        </button>
      </header>

      <div className="campus-live-rail" aria-label="Kampüs hızlı alanları">
        {railItems.map(({ category, title, route, image, icon: RailIcon, fallback, marketTab, live }) => (
          <button type="button" onClick={() => onNavigate(route, marketTab)} key={category} aria-label={`${title}: ${live?.time ?? fallback}`}>
            <span className={live ? "has-live" : ""}>
              <Image src={image} alt="" fill unoptimized sizes="88px"/>
              <i><RailIcon size={16} weight="fill"/></i>
            </span>
            <strong>{title}</strong>
            <small>{live?.time ?? fallback}</small>
          </button>
        ))}
        <button className="campus-live-more" type="button" onClick={() => onNavigate("Kampüs Anlık")} aria-label="Tüm kampüs anlık paylaşımlarını aç">
          <span><Plus size={24} weight="bold"/></span><strong>Tümünü gör</strong><small>Anlık akış</small>
        </button>
      </div>

      {featured ? (
        <article className="campus-feature-card">
          <header>
            <div className="campus-feature-avatar"><MapPin size={18} weight="fill"/></div>
            <div><span><strong>{featured.authorName}</strong><SealCheck size={15} weight="fill" aria-hidden="true"/></span><small>{featured.campusZone} · {featured.time}</small></div>
            <b><Clock size={13}/>{campusLiveRemaining(featured.expiresAt)}</b>
          </header>
          <button className="campus-feature-image" type="button" onClick={() => onNavigate("Kampüs Anlık")} aria-label="Kampüs Anlık paylaşımını aç">
            <Image src={featuredImage} alt={`${featured.campusZone} bölgesinden kampüs paylaşımı`} fill unoptimized sizes="(max-width: 780px) 100vw, 680px" priority/>
            <span>Öğrenci paylaşımı</span>
          </button>
          <div className="campus-feature-copy"><p>{featured.content}</p></div>
          <footer>
            <span>Bu bilgi hâlâ güncel mi?</span>
            <div>
              <button className={featured.viewerReaction === "confirm" ? "active" : ""} type="button" disabled={reactionPendingId === featured.id} onClick={() => onReact(featured, "confirm")}>Evet <b>{featured.confirmCount}</b></button>
              <button className={featured.viewerReaction === "outdated" ? "active warning" : ""} type="button" disabled={reactionPendingId === featured.id} onClick={() => onReact(featured, "outdated")}>Hayır <b>{featured.outdatedCount}</b></button>
            </div>
          </footer>
        </article>
      ) : (
        <article className="campus-feature-card campus-feature-empty">
          <div className="campus-feature-image" aria-hidden="true">
            <Image src="/social-live/library-study.webp" alt="" fill unoptimized sizes="(max-width: 780px) 100vw, 680px" priority/>
            <span>Canlı veri yok</span>
          </div>
          <div className="campus-feature-empty-copy">
            <span><SealCheck size={16} weight="fill"/>{universityShortName} kampüs rehberi</span>
            <h2>Kampüsünün canlı rehberini birlikte kur</h2>
            <p>Kütüphane, yemekhane ve etkinlik bilgileri öğrenciler güncelledikçe burada görünür.</p>
            {status === "error" && <small role="status">Canlı akış şu anda getirilemedi; diğer kampüs alanları kullanılabilir.</small>}
            <div><button type="button" onClick={() => onNavigate("Kampüs Anlık")}>İlk güncel bilgiyi paylaş</button><button type="button" onClick={() => onNavigate("Kütüphane")}>Kütüphaneyi aç</button></div>
          </div>
        </article>
      )}
    </section>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Akış");
  useScreenMotion(activeNav);
  const [marketTab, setMarketTab] = useState<CampusMarketTab>("store");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof document === "undefined") return "system";
    const saved = document.documentElement.dataset.themePreference;
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [feedTab, setFeedTab] = useState<FeedScope>("all");
  const feedGeneration = useRef(0);
  const feedReadController = useRef<AbortController | null>(null);
  const feedReadIdentity = useRef("");
  const feedPageRequest = useRef<{ controller: AbortController; generation: number } | null>(null);
  const feedPanel = useRef<HTMLDivElement>(null);
  const [linkedPostCandidate, setLinkedPost] = useState<Post | null>(null);
  const [peopleScope, setPeopleScope] = useState<"platform" | "campus">("platform");
  const [draftAudience, setDraftAudience] = useState<PostAudience>("platform");
  const [feedMediaFilter, setFeedMediaFilter] = useState("all");
  const [showFeedFilters, setShowFeedFilters] = useState(false);
  const [draft, setDraft] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const linkedPost = useMemo(() => linkedPostCandidate && !posts.some((post) => String(post.id) === String(linkedPostCandidate.id)) ? linkedPostCandidate : null, [linkedPostCandidate, posts]);
  const sharedPostParams = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const sharedPostId = sharedPostParams?.has("comment") ? "" : sharedPostParams?.get("post")?.trim() ?? "";
  const [postsLoading, setPostsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [mobileComposerOpen, setMobileComposerOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compose") === "1");
  const pageLocation = useRef("");
  const scrollPositions = useRef(new Map<string, number>());
  const scrollTransition = useRef<(() => void) | null>(null);
  const restoreScroll = useRef<{ top: number; destination: string; location: string } | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  useWebScreenTiming("feed", !postsLoading, { enabled: activeNav === "Akış" && profileState === "ready" });
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [identityName, setIdentityName] = useState("Öğrenci");
  const [editingProfile, setEditingProfile] = useState<"details" | "academic" | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileRevision, setProfileRevision] = useState(0);
  const [profileReloadToken, setProfileReloadToken] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  const publicProfileRequest = useRef(createLatestRequest());
  const profileOwnerId = useRef("");
  const [publishing, setPublishing] = useState(false);
  const [publishUncertain, setPublishUncertain] = useState(false);
  const publishAttempt = useRef(createPublishAttempt());
  const publishBusy = useRef(false);
  const publishGeneration = useRef(0);
  const publishController = useRef<AbortController | null>(null);
  const [publishProgress, setPublishProgress] = useState<PublishUploadProgress | null>(null);
  const [composerError, setComposerError] = useState("");
  const composerMedia = useComposerMedia({ locked: publishing || publishUncertain, onError: setComposerError });
  const draftMedia = composerMedia.files[0] ?? null;
  const draftMediaUrl = composerMedia.urls[0] ?? "";
  const [people, setPeople] = useState<CampusPerson[]>([]);
  const [peopleStatus, setPeopleStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [followPending, setFollowPending] = useState<{ owner: string; id: string } | null>(null);
  const followOwner = profileState === "ready" && studentProfile ? `${studentProfile.publicId}:${sessionRevision}` : "";
  const followPendingId = followPending?.owner === followOwner ? followPending.id : null;
  const followLock = useRef<object | null>(null);
  const [followError, setFollowError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const signingOut = useRef(false);
  const [messageRecipient, setMessageRecipient] = useState<DirectMessageRecipient | null>(null);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [notesCourse, setNotesCourse] = useState<NotesCourse | null>(null);
  const [notesSource, setNotesSource] = useState<NotesSource>("students");
  const [composerCourseId, setComposerCourseId] = useState<string | null>(null);
  const [campusLiveItems, setCampusLiveItems] = useState<CampusLivePreview[]>([]);
  const [campusLiveStatus, setCampusLiveStatus] = useState<"loading" | "ready" | "error">("loading");
  const [campusReactionPendingId, setCampusReactionPendingId] = useState<string | null>(null);
  const sharedPostFocused = useRef(false);
  const authenticatedFetch = useAuthenticatedFetch({ ownerScope: profileState === "ready" && studentProfile ? `${studentProfile.publicId}:${sessionRevision}` : "", onSessionExpired: () => expireSession() });
  const followRequests = useScopedRequests({ ownerScope: profileState === "ready" && studentProfile ? `${studentProfile.publicId}:${sessionRevision}` : "", onSessionExpired: () => expireSession() });
  useEffect(() => { followLock.current = null; }, [followRequests]);
  const feedRefresh = useFeedRefresh({
    ownerScope: profileState === "ready" && studentProfile ? `${studentProfile.publicId}:${sessionRevision}` : "",
    scope: feedTab, enabled: profileState === "ready" && activeNav === "Akış" && !postsLoading && !mobileComposerOpen && !editingProfile && !publishing,
    pollPaused: loadingMore, posts, generation: feedGeneration, fetcher: authenticatedFetch,
    onStart: () => {
      feedReadController.current?.abort(); feedPageRequest.current?.controller.abort(); feedPageRequest.current = null;
      setLoadingMore(false); setFeedError("");
      restoreScroll.current = null; scrollTransition.current?.(); scrollTransition.current = null;
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    onApply: (page) => {
      setPosts(page.posts); setNextCursor(page.nextCursor); setPostsLoading(false); setFeedError("");
      feedPanel.current?.focus({ preventScroll: true });
    },
    onError: setFeedError,
  });
  const durableDraft = usePublishDraft({
    ownerId: profileState === "ready" ? studentProfile?.publicId ?? null : null,
    draft: { content: draft, audience: draftAudience, courseId: composerCourseId, media: draftMedia, mediaFiles: composerMedia.files },
    paused: publishing || publishUncertain,
    onRestore: (record) => {
      publishAttempt.current.reset();
      if (record.immutableAttempt) publishAttempt.current.resume(record.immutableAttempt);
      setPublishUncertain(Boolean(record.immutableAttempt));
      setDraft(record.content); setDraftAudience(record.audience); setComposerCourseId(record.courseId);
      composerMedia.setFiles(publishDraftMedia(record));
      setComposerExpanded(true); setComposerError("");
    },
    onInvalidate: () => expireSession(),
  });

  function clearPublishingDraft() {
    durableDraft.suspend();
    publishGeneration.current++; publishController.current?.abort(); publishController.current = null; setPublishProgress(null); publishAttempt.current.reset(); publishBusy.current = false; setPublishing(false); setPublishUncertain(false);
    setDraft(""); composerMedia.setFiles([]); setComposerCourseId(null); setComposerError(""); setMobileComposerOpen(false);
  }

  const clearDraftAfterSessionChange = useEffectEvent(() => clearPublishingDraft());

  const restoreFeed = useEffectEvent(() => {
    const next = feedScopeFromSearch(window.location.search);
    // Returning from another workspace must retain every loaded page and its cursor.
    if (next !== feedTab) {
      feedGeneration.current++; setFeedTab(next); setPosts([]); setLinkedPost(null); setNextCursor(null); setLoadingMore(false); setPostsLoading(true);
    }
    if (!draft.trim() && !draftMedia && !composerCourseId) setDraftAudience(next === "campus" ? "campus" : "platform");
  });

  useEffect(() => () => { scrollTransition.current?.(); }, []);
  useEffect(() => () => { publishGeneration.current++; publishController.current?.abort(); }, []);

  useEffect(() => {
    try {
      document.documentElement.dataset.reduceMotion = window.localStorage.getItem("kampira-reduceMotion") === "true" ? "true" : "false";
      document.documentElement.dataset.contentDensity = window.localStorage.getItem("kampira-contentDensity") === "compact" ? "compact" : "comfortable";
    } catch { /* Keep the standard appearance when storage is unavailable. */ }
    window.history.replaceState({ kampiraDepth: 0, ...window.history.state }, "");
    window.history.scrollRestoration = "manual";
    pageLocation.current = pageLocationWithoutComposer(window.location.href);
    const restoreSearchContext = () => {
      const params = new URLSearchParams(window.location.search);
      const location = notesLocation(window.location.search);
      setNotesCourse(location.course); setNotesSource(location.source);
      setPeopleQuery((params.get("q") ?? "").slice(0, 60));
      setPeopleScope(params.get("searchScope") === "campus" ? "campus" : "platform");
    };
    restoreSearchContext();
    const restoreLocation = () => {
      setMobileComposerOpen(new URLSearchParams(window.location.search).get("compose") === "1");
      const editor = window.history.state?.kampiraEditor;
      setEditingProfile(editor === "details" || editor === "academic" ? editor : null);
      const nextPage = pageLocationWithoutComposer(window.location.href);
      if (nextPage === pageLocation.current) return;
      publicProfileRequest.current.cancel();
      pageLocation.current = nextPage;
      restoreFeed();
      const profileId = new URLSearchParams(window.location.search).get("profile")?.trim();
      const destination = profileId ? profileId === profileOwnerId.current ? "Profil" : "Öğrenci" : workspaceFromSearch(window.location.search);
      restoreScroll.current = { top: Math.max(0, Number(window.history.state?.kampiraScrollY) || 0), destination, location: nextPage };
      restoreSearchContext();
      sharedPostFocused.current = false;
      setFollowError(""); setPublicProfileLoading(destination === "Öğrenci");
      setActiveNav(destination);
      setPublicProfile(null);
      // Profile URLs still load, while history navigation no longer reloads the first feed page.
      setProfileReloadToken((value) => value + 1);
      const market = new URLSearchParams(window.location.search).get("market");
      setMarketTab(market === "prices" || market === "messages" ? market : "store");
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);

  useEffect(() => {
    const restore = () => restoreFeed();
    restore();
  }, []);

  useEffect(() => {
    const pending = restoreScroll.current;
    if (!pending || (pending.destination !== activeNav && !(pending.destination === "Öğrenci" && activeNav === "Profil"))) return;
    if ((activeNav === "Akış" && postsLoading) || (activeNav === "Öğrenci" && publicProfileLoading)) return;
    return restoreAppScroll(pending.top, () => restoreScroll.current === pending && pageLocationWithoutComposer(window.location.href) === pending.location, () => {
      if (restoreScroll.current !== pending) return;
      restoreScroll.current = null;
    });
  }, [postsLoading, activeNav, publicProfileLoading, profileReloadToken]);

  function changeFeed(next: FeedScope, replaceHistory = false) {
    if (next === feedTab) return;
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("feed"); else url.searchParams.set("feed", next);
    url.searchParams.delete("post");
    if (replaceHistory) window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    else pushAppLocation(`${url.pathname}${url.search}`);
    pageLocation.current = pageLocationWithoutComposer(window.location.href);
    feedGeneration.current++; setLinkedPost(null); setFeedTab(next); setNextCursor(null); setLoadingMore(false); setFeedError(""); setPosts([]); setPostsLoading(true);
    if (!draft.trim() && !draftMedia && !composerCourseId) setDraftAudience(next === "campus" ? "campus" : "platform");
  }

  const dateLabel = useMemo(() => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);
  const profileSubjects = useMemo(() => {
    if (!studentProfile) return [];
    const tones = ["coral", "violet", "blue", "amber", "mint", "rose"];

    return studentProfile.courses.map((course, index) => {
      const normalizedCode = normalizeCourseCode(course.code);
      return {
        id: course.id,
        code: course.code,
        label: course.name,
        tone: tones[index % tones.length],
        imageUrl: getCourseCover(course),
        noteCount: curatedNotes.filter((note) => note.courseCodes.some((code) => normalizeCourseCode(code) === normalizedCode)).length,
        postCount: posts.filter((post) => normalizeCourseCode(post.course) === normalizedCode).length,
      };
    });
  }, [posts, studentProfile]);
  const courseHub = useCourseHubLayers({ ownerScope: profileState === "ready" && studentProfile ? `${studentProfile.publicId}:${sessionRevision}` : null, subjects: profileSubjects });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = themePreference === "system" ? (media.matches ? "dark" : "light") : themePreference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = themePreference;
      document.documentElement.style.colorScheme = resolved;
      window.localStorage.setItem("kampira-theme", themePreference);
    };
    applyTheme();
    if (themePreference !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", { headers: { accept: "application/json" } });
        const data = (await response.json()) as {
          identity?: { displayName?: string };
          profile?: StudentProfile | null;
        };
        if (!active) return;

        if (data.identity?.displayName) setIdentityName(data.identity.displayName);
        if (response.status === 401) {
          clearDraftAfterSessionChange();
          setProfileContentOwnerScope(null); setWorkspaceStateOwnerScope(null); setMessageOwnerScope(null);
          setStudentProfile(null);
          setProfileState("auth-required");
          return;
        }
        if (!response.ok) {
          setProfileState("unavailable");
          return;
        }
        if (data.profile) {
          if (profileOwnerId.current && profileOwnerId.current !== data.profile.publicId) clearDraftAfterSessionChange();
          setProfileContentOwnerScope(`${data.profile.publicId}:${sessionRevision}`); setWorkspaceStateOwnerScope(`${data.profile.publicId}:${sessionRevision}`); setMessageOwnerScope(`${data.profile.publicId}:${sessionRevision}`);
          profileOwnerId.current = data.profile.publicId;
          setStudentProfile(data.profile);
          setProfileState("ready");
          const sharedProfileId = new URLSearchParams(window.location.search).get("profile")?.trim() ?? "";
          if (!sharedProfileId) {
            setActiveNav(new URLSearchParams(window.location.search).has("post") ? "Akış" : workspaceFromSearch(window.location.search));
            const market = new URLSearchParams(window.location.search).get("market");
            setMarketTab(market === "prices" || market === "messages" ? market : "store");
          } else {
            setActiveNav(sharedProfileId === data.profile.publicId ? "Profil" : "Öğrenci");
            setPublicProfileLoading(sharedProfileId !== data.profile.publicId);
          }
          return;
        }
        setProfileState("needs-onboarding");
      } catch {
        if (active) setProfileState("unavailable");
      }
    }

    void loadProfile();
    return () => { active = false; };
  }, [sessionRevision]);

  useEffect(() => {
    const requests = publicProfileRequest.current;
    requests.cancel();
    if (profileState !== "ready") return;
    const targetId = new URLSearchParams(window.location.search).get("profile")?.trim() ?? "";
    if (!targetId || targetId === studentProfile?.publicId) return;
    const request = requests.begin();
    const stillVisible = () => request.isCurrent() && new URLSearchParams(window.location.search).get("profile")?.trim() === targetId;
    async function loadPublicProfile() {
      try {
        const response = await authenticatedFetch(`/api/people?id=${encodeURIComponent(targetId)}`, { signal: request.signal, headers: { accept: "application/json" } });
        const data = (await response.json()) as { person?: PublicProfile; error?: string };
        if (!stillVisible()) return;
        if (!response.ok || !data.person) throw new Error(data.error ?? "Öğrenci profili açılamadı.");
        setPublicProfile(data.person);
      } catch (error) {
        if (stillVisible()) setFollowError(error instanceof Error ? error.message : "Öğrenci profili açılamadı.");
      } finally {
        if (stillVisible()) setPublicProfileLoading(false);
      }
    }
    void loadPublicProfile();
    return () => requests.cancel();
  }, [profileState, studentProfile?.publicId, profileReloadToken, authenticatedFetch]);

  const acceptLoadedFeed = useEffectEvent((page: FeedPage, replace: boolean) => {
    // Profile/search/safety revalidation must not replace an already-read, paginated feed.
    if (!replace && !postsLoading) feedRefresh.observe(page);
    else { setPosts(page.posts); setNextCursor(page.nextCursor); }
    setFeedError("");
  });

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    const controller = new AbortController();
    feedReadController.current = controller;
    const identity = `${studentProfile?.publicId}:${sessionRevision}|${feedTab}`;
    const replace = feedReadIdentity.current !== identity;
    feedReadIdentity.current = identity;
    const generation = ++feedGeneration.current;
    const timeout = window.setTimeout(() => controller.abort(), FEED_READ_TIMEOUT_MS);
    async function loadPosts() {
      try {
        const data = await readFeedPage(authenticatedFetch, feedTab, controller.signal);
        if (!active || generation !== feedGeneration.current) return;
        acceptLoadedFeed(data, replace);
      } catch {
        // A clear empty state remains available while a transient request is retried on reload.
        if (active && generation === feedGeneration.current) setFeedError("Akış şu anda yenilenemedi.");
      } finally {
        window.clearTimeout(timeout);
        if (feedReadController.current === controller) feedReadController.current = null;
        if (active && generation === feedGeneration.current) { setPostsLoading(false); setLoadingMore(false); }
      }
    }

    void loadPosts();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [profileState, studentProfile?.publicId, sessionRevision, feedTab, profileRevision, authenticatedFetch]);

  useEffect(() => () => {
    feedPageRequest.current?.controller.abort(); feedPageRequest.current = null;
    setLoadingMore(false);
  }, [activeNav, profileState, feedTab, authenticatedFetch]);

  useEffect(() => {
    if (profileState !== "ready") return;
    const controller = new AbortController();
    async function loadSharedPost() {
      // Shared links have their own read so Back never replaces a paginated feed.
      setLinkedPost(null);
      if (!sharedPostId) return;
      try {
        const response = await authenticatedFetch(`/api/posts?id=${encodeURIComponent(sharedPostId)}`, { signal: controller.signal, headers: { accept: "application/json" } });
        const data = (await response.json()) as { post?: Post };
        if (!controller.signal.aborted && response.ok && data.post && new URLSearchParams(window.location.search).get("post")?.trim() === sharedPostId) setLinkedPost(data.post);
      } catch { /* A missing shared post leaves the existing feed usable. */ }
    }
    void loadSharedPost();
    return () => controller.abort();
  }, [profileState, sharedPostId, authenticatedFetch]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadCampusLive() {
      try {
        const response = await authenticatedFetch("/api/campus-pulse?kind=live", { headers: { accept: "application/json" } });
        const data = (await response.json()) as { items?: CampusLivePreview[] };
        if (!active) return;
        if (!response.ok || !data.items) throw new Error("Kampüs canlı akışı getirilemedi.");
        setCampusLiveItems(data.items);
        setCampusLiveStatus("ready");
      } catch {
        if (active) setCampusLiveStatus("error");
      }
    }

    void loadCampusLive();
    return () => { active = false; };
  }, [profileState, profileRevision, authenticatedFetch]);

  useEffect(() => {
    if (postsLoading || sharedPostFocused.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("comment")) return;
    const sharedPostId = params.get("post")?.trim();
    if (!sharedPostId) return;
    const target = document.getElementById(`post-${sharedPostId}`);
    if (!target) return;
    sharedPostFocused.current = true;
    target.classList.add("shared-post-focus");
    const reduced = document.documentElement.dataset.reduceMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollTimer = window.setTimeout(() => target.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "center" }), 80);
    const highlightTimer = window.setTimeout(() => target.classList.remove("shared-post-focus"), 2400);
    return () => { window.clearTimeout(scrollTimer); window.clearTimeout(highlightTimer); target.classList.remove("shared-post-focus"); };
  }, [posts, linkedPost, postsLoading]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadPeople() {
      try {
        const queryString = `?scope=${peopleScope}&q=${encodeURIComponent(peopleQuery)}`;
        const response = await authenticatedFetch(`/api/people${queryString}`, { headers: { accept: "application/json" } });
        const data = (await response.json()) as { people?: CampusPerson[] };
        if (!active) return;
        if (!response.ok || !data.people) {
          setPeopleStatus("error");
          return;
        }
        setPeople(data.people);
        setPeopleStatus(data.people.length > 0 ? "ready" : "empty");
      } catch {
        if (active) setPeopleStatus("error");
      }
    }

    const timer = window.setTimeout(() => void loadPeople(), peopleQuery ? 240 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [profileState, peopleQuery, peopleScope, profileRevision, authenticatedFetch]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;
    async function loadUnreadMessages() {
      try {
        const response = await authenticatedFetch("/api/messages?summary=1", { cache: "no-store" });
        const data = await response.json() as { unreadCount?: number };
        if (active && response.ok) setMessageUnreadCount(Number(data.unreadCount ?? 0));
      } catch {
        // Mesaj ekranı kullanılabilir kalır; sayaç bir sonraki yenilemede tekrar denenir.
      }
    }
    void loadUnreadMessages();
    const interval = window.setInterval(() => void loadUnreadMessages(), 25000);
    return () => { active = false; window.clearInterval(interval); };
  }, [profileState, authenticatedFetch]);


  if (profileState === "loading") return <ProfileBoot/>;

  if (profileState === "auth-required") {
    return <AuthGate onAuthenticated={(displayName) => { setIdentityName(displayName); setProfileState("loading"); setSessionRevision((current) => current + 1); }}/>;
  }

  if (profileState !== "ready" || !studentProfile) {
    return (
      <AcademicOnboarding
        identityName={identityName}
        onSessionExpired={expireSession}
        initialProfile={studentProfile}
        state={profileState === "unavailable" ? "unavailable" : "needs-onboarding"}
        onComplete={(profile) => { profileOwnerId.current = profile.publicId; setProfileContentOwnerScope(`${profile.publicId}:${sessionRevision}`); setWorkspaceStateOwnerScope(`${profile.publicId}:${sessionRevision}`); setMessageOwnerScope(`${profile.publicId}:${sessionRevision}`); setStudentProfile(profile); setIdentityName(profile.displayName); setPosts([]); setPostsLoading(true); setNextCursor(null); setPeopleQuery(""); setPeopleStatus("loading"); setProfileState("ready"); }}
        onRetry={() => { setProfileState("loading"); setSessionRevision((current) => current + 1); }}
      />
    );
  }

  if (editingProfile === "details") {
    return (
      <AppNavigationProvider onBack={goBack} ownerScope={`${studentProfile.publicId}:${sessionRevision}`} onSessionExpired={expireSession}>
      <ProfileEditor
        key={`${studentProfile.publicId}:${sessionRevision}`}
        profile={studentProfile}
        onSaved={(profile) => {
          invalidateProfileContent(`${profile.publicId}:${sessionRevision}`);
          setStudentProfile(profile);
          setIdentityName(profile.displayName);
          setPosts([]);
          setPostsLoading(true);
          setPeopleQuery("");
          setPeopleStatus("loading");
          setProfileRevision((current) => current + 1);
          setActiveNav("Profil");
          finishProfileEditor();
          setProfileNotice("Profil görünümün güncellendi.");
        }}
        onCancel={closeProfileEditor}
        onEditAcademic={() => openProfileEditor("academic")}
      />
      </AppNavigationProvider>
    );
  }

  if (editingProfile === "academic") {
    return (
      <AcademicOnboarding
        identityName={studentProfile.displayName}
        onSessionExpired={expireSession}
        initialProfile={studentProfile}
        state="needs-onboarding"
        mode="edit"
        onComplete={(profile) => {
          setWorkspaceStateOwnerScope(null);
          setWorkspaceStateOwnerScope(`${profile.publicId}:${sessionRevision}`);
          invalidateProfileContent(`${profile.publicId}:${sessionRevision}`);
          setStudentProfile(profile);
          setIdentityName(profile.displayName);
          setPosts([]);
          setPostsLoading(true);
          setNextCursor(null);
          setPeopleQuery("");
          setPeopleStatus("loading");
          setProfileRevision((current) => current + 1);
          setActiveNav("Profil");
          finishProfileEditor();
          setProfileNotice("Akademik bilgilerin güncellendi.");
        }}
        onCancel={() => openProfileEditor("details")}
        onRetry={() => openProfileEditor("details")}
      />
    );
  }

  const visibleFeedPosts = posts.filter((post) => feedMediaFilter === "all" || post.media?.some((media) => media.kind === feedMediaFilter));
  const activeProfile = studentProfile;
  const activeFeed = FEED_SCOPES.find((scope) => scope.key === feedTab)!;
  const initials = getInitials(activeProfile.displayName);
  const composerCourse = activeProfile.courses.find((course) => course.id === composerCourseId) ?? null;
  const draftNotice = <PublishDraftNotice view={durableDraft.view} hasDraft={Boolean(draft || draftMedia)} onRestore={durableDraft.restore} onDiscard={() => void durableDraft.discard()} onRetry={() => void durableDraft.retry()}/>;
  const emptyFeedCopy = feedTab === "following"
    ? { title: "Takip akışın henüz boş", description: "Öğrenci ağından ilgini çeken kişileri takip ettiğinde paylaşımları burada görünecek." }
    : feedTab === "campus"
      ? { title: "Kampüsünde henüz paylaşım yok", description: `${activeProfile.universityShortName} akışındaki ilk gönderiyi paylaşarak kampüs sohbetini başlatabilirsin.` }
      : { title: "Genel Akış yeni paylaşımları bekliyor", description: "İlk paylaşımını tüm öğrencilerle buluştur. Kampüs içindeki paylaşımlarını Kampüsüm bölümünde bulabilirsin." };

  async function reactToCampusLive(item: CampusLivePreview, reaction: "confirm" | "outdated") {
    if (campusReactionPendingId) return;
    setCampusReactionPendingId(item.id);
    try {
      const response = await authenticatedFetch("/api/campus-pulse", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "react", id: item.id, reaction }),
      });
      const data = (await response.json()) as { active?: boolean; confirmCount?: number; outdatedCount?: number };
      if (!response.ok || typeof data.active !== "boolean") throw new Error("Tepki kaydedilemedi.");
      setCampusLiveItems((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        viewerReaction: data.active ? reaction : null,
        confirmCount: Number(data.confirmCount ?? entry.confirmCount),
        outdatedCount: Number(data.outdatedCount ?? entry.outdatedCount),
      } : entry));
    } catch {
      setCampusLiveStatus("error");
    } finally {
      setCampusReactionPendingId(null);
    }
  }

  async function publishPost() {
    const clean = draft.trim();
    if ((!clean && !draftMedia) || publishBusy.current || durableDraft.blocked) return;
    publishBusy.current = true;
    const generation = ++publishGeneration.current;
    const attempt = publishAttempt.current.begin({ content: clean, audience: composerCourseId ? "campus" : draftAudience, courseId: composerCourseId, media: draftMedia, mediaFiles: composerMedia.files });
    let responseStatus: number | undefined;
    setComposerError("");

    setPublishing(true);
    setPublishProgress(null);
    const controller = new AbortController();
    publishController.current = controller;
    try {
      const prepared = await durableDraft.prepare(attempt);
      if (generation !== publishGeneration.current) return;
      if (prepared.status !== "prepared") {
        if (!attempt.uncertain) publishAttempt.current.reset();
        setComposerError(prepared.status === "recovery-required" ? "Önce kaydedilmiş taslağı geri yükle veya sil." : "Taslak kaydedilemediği için gönderim başlamadı. Depolamayı yeniden dene.");
        return;
      }
      const { audience } = prepared.attempt.draft;
      // Show the exact persisted payload while the immutable attempt is in flight.
      setDraft(prepared.attempt.draft.content); setDraftAudience(audience); setComposerCourseId(prepared.attempt.draft.courseId);
      composerMedia.setFiles(publishDraftMedia(prepared.attempt.draft));
      const response = await sendPublishUpload<Post>(prepared.attempt, { signal: controller.signal, onProgress: (progress) => { if (generation === publishGeneration.current) setPublishProgress(progress); } });
      responseStatus = response.status;
      if (generation === publishGeneration.current && response.status === 401) { expireSession(); return; }
      const data = response.data;
      if (generation !== publishGeneration.current) return;
      if (response.status === 410 && data?.code === "POST_REMOVED") {
        await durableDraft.clearAttempt(attempt.key);
        if (generation !== publishGeneration.current) return;
        publishAttempt.current.complete();
        setPublishUncertain(false);
        setComposerError("Önceki gönderi kaldırılmış. Taslağını düzenleyerek yeniden paylaşabilirsin.");
        return;
      }
      if (!response.ok || !data?.post || !data.post.id) throw new Error(data?.error ?? "Gönderin paylaşılamadı.");
      await durableDraft.clearAttempt(attempt.key);
      if (generation !== publishGeneration.current) return;
      publishAttempt.current.complete();
      setPublishUncertain(false);

      invalidateProfileContent(`${activeProfile.publicId}:${sessionRevision}`, activeProfile.publicId, ["posts", "images", "videos"]);
      const destination = audience === "campus" ? "campus" : "all";
      if (feedTab !== destination) changeFeed(destination, mobileComposerOpen);
      else setPosts((current) => [data.post as Post, ...current.filter((post) => String(post.id) !== String(data.post!.id))]);
      if (response.replayed) {
        // A recovered attempt may already be included in the profile loaded after reopening.
        // Read its current count instead of incrementing a second time.
        void authenticatedFetch("/api/profile", { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) }).then(async (profileResponse) => {
          const fresh = await profileResponse.json() as { profile?: StudentProfile };
          if (generation !== publishGeneration.current) return;
          if (profileResponse.status === 401) { expireSession(); return; }
          if (!profileResponse.ok || fresh.profile?.publicId !== activeProfile.publicId || !Number.isSafeInteger(fresh.profile.postCount) || fresh.profile.postCount < 0) return;
          setStudentProfile((current) => current?.publicId === fresh.profile!.publicId ? { ...current, postCount: fresh.profile!.postCount } : current);
        }).catch(() => { /* Publication is confirmed; a count refresh must not offer another upload. */ });
      } else setStudentProfile((current) => current ? { ...current, postCount: current.postCount + 1 } : current);
      setDraft("");
      composerMedia.setFiles([]);
      setComposerCourseId(null);
      setComposerExpanded(false);
      if (mobileComposerOpen) {
        const url = new URL(window.location.href);
        for (const key of ["compose", "view", "profile", "post", "course", "courseCode", "courseName", "source", "community", "q", "searchScope", "market"]) url.searchParams.delete(key);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
        pageLocation.current = pageLocationWithoutComposer(window.location.href);
        setMobileComposerOpen(false);
        setPublicProfile(null);
        setPublicProfileLoading(false);
        setActiveNav("Akış");
        window.requestAnimationFrame(() => window.scrollTo({ top:0, behavior:"instant" }));
      }
    } catch (publishError) {
      if (generation !== publishGeneration.current) return;
      const uncertain = publishAttempt.current.failed(responseStatus);
      if (!uncertain) {
        await durableDraft.clearAttempt(attempt.key);
        if (generation !== publishGeneration.current) return;
        if (composerCourseId && !studentProfile?.courses.some((course) => course.id === composerCourseId)) setComposerCourseId(null);
      }
      setPublishUncertain(uncertain);
      setComposerError(uncertain ? publishError instanceof PublishUploadError ? publishError.message : "Gönderimin sonucu doğrulanamadı. Tekrar dene; aynı gönderiyi ikinci kez oluşturmadan sonucu kontrol edeceğiz. Taslağın korunuyor." : publishError instanceof Error ? publishError.message : "Gönderin paylaşılamadı.");
    } finally {
      if (generation === publishGeneration.current) { setPublishing(false); setPublishProgress(null); publishController.current = null; publishBusy.current = false; }
    }
  }

  async function loadMorePosts() {
    if (!nextCursor || loadingMore || postsLoading || feedRefresh.busy || feedPageRequest.current || activeNav !== "Akış") return;
    const generation = feedGeneration.current;
    const controller = new AbortController();
    const request = { controller, generation };
    feedPageRequest.current = request;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, FEED_READ_TIMEOUT_MS);
    const isCurrent = () => feedPageRequest.current === request && generation === feedGeneration.current;
    setLoadingMore(true);
    setFeedError("");

    try {
      const data = await readFeedPage(authenticatedFetch, feedTab, controller.signal, nextCursor);
      if (!isCurrent() || controller.signal.aborted) return;

      setPosts((current) => {
        const knownIds = new Set(current.map((post) => String(post.id)));
        return [...current, ...data.posts.filter((post) => !knownIds.has(String(post.id)))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (isCurrent() && (!controller.signal.aborted || timedOut)) setFeedError(timedOut ? "Gönderiler getirilemedi. Bağlantını kontrol edip tekrar dene." : loadError instanceof Error ? loadError.message : "Akışın devamı getirilemedi.");
    } finally {
      window.clearTimeout(timeout);
      if (isCurrent()) { feedPageRequest.current = null; setLoadingMore(false); }
    }
  }

  function updatePostInteraction(id: number | string, changes: Partial<Pick<Post, "liked" | "saved" | "likes" | "comments">>) {
    updateProfileContentPost(`${activeProfile.publicId}:${sessionRevision}`, id, changes);
    setPosts((current) => current.map((post) => String(post.id) === String(id) ? { ...post, ...changes } : post));
    setLinkedPost((current) => current && String(current.id) === String(id) ? { ...current, ...changes } : current);
  }

  function updatePost(id: number | string, text: string) {
    updateProfileContentPost(`${activeProfile.publicId}:${sessionRevision}`, id, { text, edited: true });
    setLinkedPost((current) => current?.id === id ? { ...current, text, edited: true } : current);
    setPosts((current) => current.map((post) => post.id === id ? { ...post, text, edited: true } : post));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((post) => post.id === id ? { ...post, text, edited: true } : post) } : current);
  }

  function deletePost(id: number | string) {
    removeProfileContentPost(`${activeProfile.publicId}:${sessionRevision}`, id);
    setLinkedPost((current) => current?.id === id ? null : current);
    const removedPost = posts.find((post) => post.id === id);
    setPosts((current) => current.filter((post) => post.id !== id));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.filter((post) => post.id !== id), postCount: Math.max(0, current.postCount - (current.posts.some((post) => post.id === id) ? 1 : 0)) } : current);
    if (removedPost?.authorId === activeProfile.publicId || activeNav === "Profil") {
      setStudentProfile((current) => current ? { ...current, postCount: Math.max(0, current.postCount - 1) } : current);
    }
  }

  function updateSavedPost(post: Post, saved: boolean) {
    updateProfileContentPost(`${activeProfile.publicId}:${sessionRevision}`, post.id, { saved });
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved } : item));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((item) => item.id === post.id ? { ...item, saved } : item) } : current);
  }

  function openPerson(person: CampusPerson) {
    publicProfileRequest.current.cancel();
    setActiveNav("Öğrenci");
    setPublicProfile(null);
    setPublicProfileLoading(true);
    setFollowError("");

    const profileUrl = new URL(window.location.href);
    profileUrl.searchParams.delete("post"); profileUrl.searchParams.delete("view"); profileUrl.searchParams.delete("market");
    profileUrl.searchParams.set("profile", person.publicId);
    pushAppLocation(`${profileUrl.pathname}${profileUrl.search}`);
    pageLocation.current = pageLocationWithoutComposer(window.location.href);

    setProfileReloadToken((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function queryPeople(query: string) {
    const nextQuery = query.slice(0, 60);
    setPeopleQuery(nextQuery);
    const url = new URL(window.location.href);
    if (nextQuery) url.searchParams.set("q", nextQuery); else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    setPeopleStatus("loading");
    if (nextQuery === peopleQuery) setProfileRevision((value) => value + 1);

  }

  function handleSafetyChange(targetId: string, action: "block" | "mute", active: boolean) {
    if (action === "block") invalidateProfileRelationships();
    invalidateProfileContent(`${activeProfile.publicId}:${sessionRevision}`);
    if (active) {
      setPosts((current) => current.filter((post) => post.authorId !== targetId));
      setLinkedPost((current) => current?.authorId === targetId ? null : current);
      if (action === "block") { setPeople((current) => current.filter((person) => person.publicId !== targetId)); setPublicProfile((current) => current?.publicId === targetId ? null : current); }
    }
    setProfileRevision((value) => value + 1);
  }


  function expireSession() {
    void clearNativeFiles().catch(() => {});
    clearPublishingDraft();
    publicProfileRequest.current.cancel();
    scrollTransition.current?.(); scrollTransition.current = null;
    setProfileContentOwnerScope(null); setWorkspaceStateOwnerScope(null); setMessageOwnerScope(null);
    profileOwnerId.current = "";
    setStudentProfile(null); setPublicProfile(null); setPublicProfileLoading(false);
    setPosts([]); setPeople([]); setMessageRecipient(null); setMessageUnreadCount(0);
    setProfileState("auth-required");
  }

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    void clearNativeFiles().catch(() => {});
    setSessionError("");
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Çıkış tamamlanamadı.");
    } catch {
      setSessionError("Çıkış tamamlanamadı. Bağlantını kontrol edip yeniden dene.");
      signingOut.current = false;
      return;
    }
    const [clearedDrafts, clearedMarketDrafts, clearedPush] = await Promise.all([
      durableDraft.logout(), clearMarketDraftsOnLogout(), clearPushNotificationsOnLogout().catch(() => ({ cleared: false })),
    ]);
    signingOut.current = false;
    expireSession();
    if (clearedDrafts.status !== "cleared" || clearedMarketDrafts.status !== "cleared") setSessionError("Çıkış yapıldı ancak cihazdaki taslaklar temizlenemedi. Tarayıcı depolama iznini kontrol et.");
    else if (!clearedPush.cleared) setSessionError("Çıkış yapıldı. Bu oturuma yeni bildirim gönderilmeyecek; cihazda görünen eski bildirimleri elle temizleyebilirsin.");
    setComposerExpanded(false);
    if (window.location.hostname === "chatgpt.site" || window.location.hostname.endsWith(".chatgpt.site")) {
      window.location.assign("/signout-with-chatgpt?return_to=%2F");
      return;
    }
    setStudentProfile(null);
    setIdentityName("Öğrenci");
    setPosts([]);
    setPeople([]);
    setProfileState("auth-required");
  }

  function changePeopleScope(scope: "platform" | "campus") {
    setPeopleScope(scope); setPeopleStatus("loading");
    const url = new URL(window.location.href);
    url.searchParams.set("searchScope", scope);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }

  function navigateTo(name: string, targetMarketTab?: CampusMarketTab, targetNotesCourse?: NotesCourse, targetNotesSource: NotesSource = "students") {
    if (name === "Gönderi oluştur") { openFeedComposer(); return; }
    publicProfileRequest.current.cancel();
    scrollPositions.current.set(activeNav, window.scrollY);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("compose");
    currentUrl.searchParams.delete("profile"); currentUrl.searchParams.delete("post"); currentUrl.searchParams.delete("comment"); currentUrl.searchParams.delete("market");
    for (const key of ["course", "courseCode", "courseName", "source", "community"]) currentUrl.searchParams.delete(key);
    if (name === "Notlar") {
      setNotesCourse(targetNotesCourse ?? null); setNotesSource(targetNotesSource);
      const target = new URL(notesHref(targetNotesCourse, targetNotesSource), currentUrl.origin);
      target.searchParams.forEach((value, key) => currentUrl.searchParams.set(key, value));
    }
    if (name === "Keşfet") {
      if (peopleQuery && !currentUrl.searchParams.has("q")) currentUrl.searchParams.set("q", peopleQuery);
      currentUrl.searchParams.set("searchScope", peopleScope);
    } else {
      currentUrl.searchParams.delete("q"); currentUrl.searchParams.delete("searchScope");
    }
    const slug = workspaceRoutes[name as keyof typeof workspaceRoutes];
    if (slug && slug !== "feed") currentUrl.searchParams.set("view", slug); else currentUrl.searchParams.delete("view");
    if (name === "Pazar" && targetMarketTab && targetMarketTab !== "store") currentUrl.searchParams.set("market", targetMarketTab);
    const nextLocation = `${currentUrl.pathname}${currentUrl.search}`;
    if (nextLocation !== `${window.location.pathname}${window.location.search}`) pushAppLocation(nextLocation);
    pageLocation.current = pageLocationWithoutComposer(nextLocation);
    sharedPostFocused.current = false;
    if (name === "Pazar") setMarketTab(targetMarketTab ?? "store");
    setPublicProfile(null);
    setPublicProfileLoading(false);
    setFollowError("");
    setActiveNav(name);
    setMessageRecipient(null);
    setMobileComposerOpen(false);
    const top = name === activeNav ? 0 : scrollPositions.current.get(name) ?? 0;
    scrollTransition.current?.();
    scrollTransition.current = restoreAppScroll(top, () => pageLocationWithoutComposer(window.location.href) === pageLocationWithoutComposer(nextLocation), () => { scrollTransition.current = null; });
  }

  function openMessages(person: DirectMessageRecipient) {
    navigateTo("Mesajlar");
    setMessageRecipient(person);
  }

  function goBack() {
    if (Number(window.history.state?.kampiraDepth) > 0) window.history.back();
    else navigateTo(mobileRootFor(activeNav));
  }

  function openProfileEditor(mode: "details" | "academic") {
    if (window.matchMedia("(max-width: 780px)").matches) {
      pageLocation.current = pageLocationWithoutComposer(window.location.href);
      if (!window.history.state?.kampiraEditor) pushAppLocation(`${window.location.pathname}${window.location.search}`);
      window.history.replaceState({ ...window.history.state, kampiraEditor: mode }, "");
    }
    setEditingProfile(mode);
    window.scrollTo({ top:0, behavior:"instant" });
  }

  function closeProfileEditor() {
    if (window.history.state?.kampiraEditor) window.history.back();
    else setEditingProfile(null);
  }

  function finishProfileEditor() {
    const state = { ...window.history.state };
    delete state.kampiraEditor;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "profile");
    url.searchParams.delete("profile");
    window.history.replaceState(state, "", `${url.pathname}${url.search}`);
    pageLocation.current = pageLocationWithoutComposer(window.location.href);
    setEditingProfile(null);
  }

  function closeMobileComposer() {
    if (publishing) return;
    if (new URLSearchParams(window.location.search).get("compose") === "1" && Number(window.history.state?.kampiraDepth) > 0) window.history.back();
    else {
      window.history.replaceState(window.history.state, "", pageLocationWithoutComposer(window.location.href));
      setMobileComposerOpen(false);
    }
  }

  function openFeedComposer() {
    if (window.matchMedia("(max-width: 780px)").matches) {
      pageLocation.current = pageLocationWithoutComposer(window.location.href);
      const url = new URL(window.location.href);
      url.searchParams.set("compose", "1");
      pushAppLocation(`${url.pathname}${url.search}`);
      setMobileComposerOpen(true);
      return;
    }
    setComposerExpanded(true);
    navigateTo("Akış");
    window.requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLTextAreaElement>("#post-draft");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => composer?.focus(), 260);
    });
  }

  function choosePostMedia(event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    if (publishBusy.current || publishing || publishUncertain || durableDraft.blocked) { event.currentTarget.value = ""; return; }
    composerMedia.choose(event, kind);
    setComposerExpanded(true);
  }

  function removePostMedia(index: number) {
    if (!publishBusy.current && !durableDraft.blocked) composerMedia.remove(index);
  }

  function movePostMedia(index: number, direction: -1 | 1) {
    if (!publishBusy.current && !durableDraft.blocked) composerMedia.move(index, direction);
  }

  function handleFollowChange(change: FollowChange) {
    invalidateProfileRelationships();
    setPeople((current) => current.map((person) => person.publicId === change.targetId ? { ...person, isFollowing: change.active, followerCount: change.followerCount } : person));
    setPublicProfile((current) => current?.publicId === change.targetId ? { ...current, isFollowing: change.active, followerCount: change.followerCount } : current);
    setStudentProfile((current) => current ? { ...current, followingCount: change.viewerFollowingCount } : current);
  }

  async function toggleFollow(publicId: string) {
    if (followLock.current) return;
    const knownTarget = people.find((person) => person.publicId === publicId) ?? (publicProfile?.publicId === publicId ? publicProfile : null);
    if (!knownTarget) return;
    const wasFollowing = knownTarget.isFollowing;
    const previousFollowerCount = knownTarget.followerCount;
    const active = !wasFollowing;
    const optimisticCount = Math.max(0, previousFollowerCount + (active ? 1 : -1));
    const lock = {};
    followLock.current = lock;
    setFollowPending({ owner: followOwner, id: publicId });
    setFollowError("");
    setPeople((current) => current.map((person) => person.publicId === publicId ? { ...person, isFollowing: active, followerCount: optimisticCount } : person));
    setPublicProfile((current) => current?.publicId === publicId ? { ...current, isFollowing: active, followerCount: optimisticCount } : current);
    try {
      const data = await followRequests.json<{ active?: boolean; followerCount?: number; viewerFollowingCount?: number; error?: string }>("/api/follows", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId: publicId, active }),
      }, "Takip işlemi tamamlanamadı.");
      if (!data || typeof data.active !== "boolean" || typeof data.followerCount !== "number" || typeof data.viewerFollowingCount !== "number") throw new Error("Takip işlemi tamamlanamadı.");
      handleFollowChange({ targetId: publicId, active: data.active, followerCount: data.followerCount, viewerFollowingCount: data.viewerFollowingCount });
    } catch (cause) {
      if (!followRequests.isActive()) return;
      setPeople((current) => current.map((person) => person.publicId === publicId ? { ...person, isFollowing: wasFollowing, followerCount: previousFollowerCount } : person));
      setPublicProfile((current) => current?.publicId === publicId ? { ...current, isFollowing: wasFollowing, followerCount: previousFollowerCount } : current);
      setFollowError(cause instanceof Error ? cause.message : "Takip işlemi tamamlanamadı.");
    } finally {
      if (followLock.current === lock) { followLock.current = null; if (followRequests.isActive()) setFollowPending(null); }
    }
  }

  return (
    <AppNavigationProvider key={`${studentProfile.publicId}:${sessionRevision}`} onBack={goBack} ownerScope={`${studentProfile.publicId}:${sessionRevision}`} onSessionExpired={expireSession} onPostInteraction={updatePostInteraction} onSafetyChanged={handleSafetyChange} onFollowChanged={handleFollowChange}>
    <PostCommentTarget viewerId={studentProfile.publicId} viewerInitials={initials} onPostUpdated={updatePost} onPostDeleted={deletePost}/>
    <main className={`site-shell has-mobile-page-header${activeNav === "Mesajlar" ? " site-shell-messages" : ""}`} data-mobile-view={activeNav} id="top">
      <aside className="left-sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Ana menü">
          {navItems.map((item) => (
            <button className={activeNav === item.label ? "active" : ""} aria-label={item.label} title={item.label} aria-current={activeNav === item.label ? "page" : undefined} key={item.label} onClick={() => navigateTo(item.label)} type="button">
              <span className="nav-icon"><Icon name={item.icon}/>{item.label === "Bildirimler" && <i />}</span>
              <span>{item.label}</span>
              {item.label === "Mesajlar" && messageUnreadCount > 0 && <b className="nav-count">{messageUnreadCount > 99 ? "99+" : messageUnreadCount}</b>}
            </button>
          ))}
        </nav>
        <button className="primary-create" type="button" aria-label="Gönderi oluştur" title="Gönderi oluştur" onClick={openFeedComposer}>
          <Icon name="plus" size={21}/> <span>Oluştur</span>
        </button>
        <button className="profile-mini" type="button" aria-label="Profilimi aç" title="Profilimi aç" onClick={() => navigateTo("Profil")}>
          <Avatar initials={initials} className="avatar-violet" imageUrl={activeProfile.avatarUrl}/>
          <span><strong>{studentProfile.displayName}</strong><small>@{studentProfile.handle}</small></span>
          <Icon name="more" size={18}/>
        </button>
      </aside>

      <section className="feed-column" inert={mobileComposerOpen}>
        <MobileHeader active={activeNav} titleAs={activeNav === "Öğrenci" || activeNav === "Profil" ? "p" : "h1"} title={activeNav === "Öğrenci" ? publicProfile?.handle ? `@${publicProfile.handle.replace(/^@/, "")}` : "Öğrenci profili" : undefined} onBack={goBack} onNavigate={navigateTo}/>

        {sessionError && <p className="feature-error" role="alert">{sessionError}</p>}

        {activeNav === "Akış" ? <>
        <div className="feed-welcome">
          <div>
            <h1>Akış</h1>
            <p>Çevrenden ve kampüslerden yeni paylaşımlar.</p>
          </div>
          <span className="feed-date">{dateLabel}</span>
        </div>
        <div className="feed-tabs" role="tablist" aria-label="Akış türü">
          {FEED_SCOPES.map((scope) => <button key={scope.key} id={`feed-tab-${scope.key}`} aria-controls="feed-posts" disabled={publishing} className={feedTab === scope.key ? "active" : ""} onClick={() => changeFeed(scope.key)} type="button" role="tab" aria-selected={feedTab === scope.key}>{scope.label}</button>)}
          <button className="feed-filter" type="button" aria-label="Akış seçenekleri" aria-expanded={showFeedFilters} onClick={() => setShowFeedFilters((value) => !value)}><Icon name="settings" size={18}/></button>
        </div>
        <FeedRefreshNotice available={feedRefresh.available} busy={feedRefresh.busy} announcement={feedRefresh.announcement} onRefresh={() => void feedRefresh.refresh()}/>
        <div className="feed-scope-context">{feedTab === "campus" ? <MapPin size={16}/> : <GlobeHemisphereWest size={16}/>}<span>{feedTab === "campus" ? `${activeProfile.universityShortName} · Kampüsündeki paylaşımlar` : feedTab === "following" ? "Takip ettiğin öğrencilerin paylaşımları" : "Tüm üniversiteler · Ortak öğrenci ağı"}</span></div>
        {feedTab === "campus" && <CampusLiveHome items={campusLiveItems} status={campusLiveStatus} universityShortName={activeProfile.universityShortName} reactionPendingId={campusReactionPendingId} onNavigate={navigateTo} onReact={(item, reaction) => void reactToCampusLive(item, reaction)}/>}
        {feedTab === "campus" && <section className="subject-section" aria-labelledby="subjects-title">
          <div className="section-heading">
            <div><span className="eyebrow">Ders çevrelerin</span><h2 id="subjects-title">Bugün ne çalışıyorsun?</h2></div>
            <button type="button" onClick={courseHub.openDirectory}>Tümünü gör <Icon name="arrow" size={15}/></button>
          </div>
          <div className="subject-row">
            {profileSubjects.slice(0, 6).map((subject) => (
              <button className="subject-item" type="button" key={subject.id} onClick={() => courseHub.openSubject(subject)} aria-label={`${subject.code} ${subject.label} dersini aç`}>
                <span className={`subject-cover subject-${subject.tone}`}><Image src={subject.imageUrl} alt="" fill unoptimized sizes="78px"/>{subject.noteCount > 0 && <i aria-label={`${subject.noteCount} doğrulanmış not`}>{subject.noteCount}</i>}</span>
                <strong>{subject.code}</strong><small>{subject.label}</small>
              </button>
            ))}
          </div>
        </section>}

        <section className={`composer-card${composerExpanded ? " is-expanded" : ""}`} aria-label="Gönderi oluştur">
          {draftNotice}
          {composerExpanded && <button className="composer-mobile-close" type="button" onClick={() => setComposerExpanded(false)} aria-label="Gönderi alanını kapat"><Icon name="close" size={17}/></button>}
          <div className="composer-main">
            <Avatar initials={initials} className="avatar-violet" imageUrl={activeProfile.avatarUrl}/>
            <label className="sr-only" htmlFor="post-draft">Gönderi metni</label>
            <textarea id="post-draft" disabled={publishing || publishUncertain || durableDraft.blocked} value={draft} maxLength={1200} onChange={(event) => { setDraft(event.target.value); setComposerError(""); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void publishPost(); }} placeholder={draftAudience === "platform" && !composerCourse ? "Kampira’da ne paylaşmak istersin?" : "Kampüsünle ne paylaşmak istersin?"} rows={1}/>
          </div>
          <div className="composer-audience"><label htmlFor="post-audience">{composerCourse || draftAudience === "campus" ? <MapPin size={16}/> : <GlobeHemisphereWest size={16}/>} Kimler görebilir?</label><select id="post-audience" disabled={publishing || publishUncertain || durableDraft.blocked || Boolean(composerCourse)} value={composerCourse ? "campus" : draftAudience} onChange={(event) => { setDraftAudience(event.target.value as PostAudience); setComposerError(""); }}><option value="platform">Tüm öğrenciler</option><option value="campus">Yalnızca kampüsüm</option></select><p>{composerCourse ? "Ders çevresi paylaşımları kampüs içinde kalır." : draftAudience === "platform" ? "Tüm üniversitelerde görünür. Öğrenciler paylaşımını ve temel profil bilgilerini görebilir." : `${activeProfile.universityShortName} öğrencilerine görünür.`}</p></div>
          {composerCourse && <div className="composer-course-chip"><span><Icon name="notes" size={15}/><strong>{composerCourse.code}</strong> ders çevresinde paylaşıyorsun</span><button type="button" disabled={publishing || publishUncertain || durableDraft.blocked} onClick={() => setComposerCourseId(null)} aria-label="Ders seçimini kaldır"><Icon name="close" size={14}/></button></div>}
          {composerMedia.files.length > 0 && <ComposerMediaPreview files={composerMedia.files} urls={composerMedia.urls} locked={publishing || publishUncertain || durableDraft.blocked} onRemove={removePostMedia} onMove={movePostMedia}/>}
          <input ref={imageInput} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choosePostMedia(event, "image")}/>
          <input ref={videoInput} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => choosePostMedia(event, "video")}/>
          <div className="composer-tools">
            <div>
              <button type="button" disabled={publishing || publishUncertain || durableDraft.blocked} onClick={() => imageInput.current?.click()}><span className="tool-icon tool-image"><Icon name="image" size={18}/></span><span>Fotoğraf</span></button>
              <button type="button" disabled={publishing || publishUncertain || durableDraft.blocked} onClick={() => videoInput.current?.click()}><span className="tool-icon tool-video"><Icon name="video" size={18}/></span><span>Video</span></button>
              <button type="button" aria-label="Not yükle" title="Not yükle" onClick={() => navigateTo("Notlar")}><span className="tool-icon tool-note"><Icon name="file" size={18}/></span><span>Not yükle</span></button>
            </div>
            <button className="publish-button" type="button" disabled={(!draft.trim() && !draftMedia) || publishing || durableDraft.blocked} onClick={() => void publishPost()}>{publishing ? "Paylaşılıyor…" : publishUncertain ? "Tekrar dene" : "Paylaş"}</button>
          </div>
          {publishing && <PublishStatus progress={publishProgress} onCancel={() => publishController.current?.abort()}/>}
          {composerError && <p className="composer-feedback" role="alert">{composerError}</p>}
        </section>

        {showFeedFilters && <div className="workspace-filter-pills" role="group" aria-label="Paylaşım türü">{([['all','Tüm paylaşımlar'],['image','Fotoğraflar'],['video','Videolar']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={feedMediaFilter === value} className={feedMediaFilter === value ? "active" : ""} onClick={() => setFeedMediaFilter(value)}>{label}</button>)}<RefreshButton onClick={() => void feedRefresh.refresh()} busy={postsLoading || feedRefresh.busy}/></div>}
        {feedMediaFilter !== "all" && !postsLoading && visibleFeedPosts.length === 0 && posts.length > 0 && <WorkspaceEmpty title="Yüklenen paylaşımlarda bu türde içerik yok" description={nextCursor ? "Daha fazla gönderi yükleyebilir veya tüm paylaşımlara dönebilirsin." : "Tüm paylaşım türlerine dönerek akışı görebilirsin."} action={<button type="button" onClick={() => setFeedMediaFilter("all")}>Tümünü göster</button>}/>}
        {!postsLoading && linkedPost && <section className="linked-post-preview" aria-label="Bağlantıyla açılan paylaşım"><p>Bağlantıyla açtığın paylaşım · {audienceLabel(linkedPost.audience)}</p><FeedPost post={linkedPost} viewerInitials={initials} viewerId={studentProfile.publicId} onPostUpdated={updatePost} onPostDeleted={deletePost}/></section>}
        <div className="feed-list" ref={feedPanel} tabIndex={-1} id="feed-posts" role="tabpanel" aria-labelledby={`feed-tab-${feedTab}`} aria-busy={feedRefresh.busy || undefined}>{postsLoading ? <div className="feed-empty feed-loading" aria-live="polite"><span className="profile-boot-line"><i/></span><strong>{activeFeed.label} hazırlanıyor…</strong></div> : posts.length > 0 ? visibleFeedPosts.map((post) => <FeedPost post={post} viewerInitials={initials} viewerId={studentProfile.publicId} onPostUpdated={updatePost} onPostDeleted={deletePost} key={post.id}/>) : <div className="feed-empty"><span><Icon name="users" size={22}/></span><strong>{emptyFeedCopy.title}</strong><p>{emptyFeedCopy.description}</p></div>}</div>
        {!postsLoading && feedError && <div className="feed-error"><p role="alert">{feedError}</p><RefreshButton onClick={() => void feedRefresh.refresh()} busy={feedRefresh.busy}/></div>}
        {!postsLoading && nextCursor && <button className="feed-load-more" type="button" onClick={() => void loadMorePosts()} disabled={loadingMore || feedRefresh.busy}>{loadingMore ? "Gönderiler getiriliyor…" : "Daha fazla gönderi göster"}</button>}
        </> : activeNav === "Öğrenci" ? <PublicProfileView profile={publicProfile} loading={publicProfileLoading} shareable viewerInitials={initials} viewerId={studentProfile.publicId} followPending={followPendingId === publicProfile?.publicId} onBack={goBack} onToggleFollow={(publicId) => void toggleFollow(publicId)} onMessage={openMessages}/> : <>{activeNav === "Profil" && profileNotice && <p className="profile-update-notice" role="status"><Icon name="check" size={16}/>{profileNotice}</p>}<SecondaryView peopleScope={peopleScope} onPeopleScopeChange={changePeopleScope} name={activeNav} profile={studentProfile} posts={posts} people={people} peopleStatus={peopleStatus} peopleQuery={peopleQuery} shareableProfile followPendingId={followPendingId} notesCourse={notesCourse} notesSource={notesSource} marketTab={marketTab} themePreference={themePreference} messageRecipient={messageRecipient} onMessagesUnreadChange={setMessageUnreadCount} onThemeChange={setThemePreference} onOpenPerson={(person) => void openPerson(person)} onQueryPeople={queryPeople} onToggleFollow={(publicId) => void toggleFollow(publicId)} onNavigate={navigateTo} onEditProfile={() => { setProfileNotice(""); openProfileEditor("details"); }} onSignOut={() => void signOut()} onPostUpdated={updatePost} onPostDeleted={deletePost} onSavedChange={updateSavedPost}/></>}
        {(activeNav === "Öğrenci" || activeNav === "Keşfet") && followError && <p className="profile-action-error" role="alert">{followError}</p>}
      </section>

      {activeNav !== "Mesajlar" && <aside className="right-sidebar">
        <div className="search-box">
          <Icon name="search" size={18}/><input aria-label="Kampira'da ara" value={peopleQuery} onChange={(event) => { queryPeople(event.target.value); if (activeNav !== "Keşfet") navigateTo("Keşfet"); }} placeholder="Ders, not veya öğrenci ara"/>{peopleQuery ? <button type="button" onClick={() => queryPeople("")} aria-label="Aramayı temizle"><Icon name="close" size={15}/></button> : <kbd>⌘ K</kbd>}
        </div>

        <section className="side-card campus-card">
          <span className="campus-orb"><Icon name="users" size={20}/></span>
          <div className="side-card-title"><span>{activeProfile.universityShortName} öğrenci ağı</span></div>
          <h2>Kampüsten tanışalım.</h2>
          <p>Aynı dersleri ve ilgi alanlarını paylaşan öğrencileri keşfet.</p>
          <button type="button" onClick={() => navigateTo("Keşfet")}>Kampüsü keşfet <Icon name="arrow" size={16}/></button>
        </section>

        <section className="side-card verified-notes" aria-labelledby="verified-notes-title">
          <div className="side-heading">
            <h2 id="verified-notes-title">Doğrulanmış notlar</h2>
            <button type="button" onClick={() => navigateTo("Notlar", undefined, undefined, "editorial")} aria-label="Tüm doğrulanmış notları gör">Tümü <Icon name="arrow" size={14}/></button>
          </div>
          <ul className="verified-notes-list">
            {sidebarNotes.map((note) => (
              <li key={note.id}>
                <button className="verified-note" type="button" onClick={() => navigateTo("Notlar", undefined, undefined, "editorial")}>
                  <span className="verified-note-topline">
                    <span className="verified-note-course">{note.code}</span>
                    <span className="verified-note-duration"><Clock size={13} aria-hidden="true"/>{note.readingMinutes} dk</span>
                  </span>
                  <strong className="verified-note-title">{note.title}</strong>
                  <span className="verified-note-source"><span>{note.publisher}</span><Icon name="arrow" size={15}/></span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="side-card">
          <div className="side-heading"><h2>Öğrenci ağı</h2><span>{peopleScope === "platform" ? "Kampira" : activeProfile.universityShortName}</span></div>
          <div className="people-list">
            {peopleStatus === "loading" && <p className="people-state">Öğrenci çevren hazırlanıyor…</p>}
            {peopleStatus === "empty" && <p className="people-state">Henüz bu alanda başka bir profil yok. Genel Akış’ta paylaşım yaparak ağı başlatabilirsin.</p>}
            {peopleStatus === "error" && <p className="people-state">Öğrenci önerileri şu anda getirilemedi.</p>}
            {peopleStatus === "ready" && people.slice(0, 3).map((person) => (
              <div key={person.publicId}>
                <Avatar initials={person.initials} className={person.avatarClass} imageUrl={person.avatarUrl}/>
                <button className="person-summary" type="button" onClick={() => void openPerson(person)}><strong>{person.displayName}</strong><small>{person.facultyShortName} · {person.departmentName}</small></button>
                <button className={person.isFollowing ? "following" : ""} type="button" disabled={followPendingId === person.publicId} onClick={() => void toggleFollow(person.publicId)}>{followPendingId === person.publicId ? "…" : person.isFollowing ? "Takipte" : "Takip et"}</button>
              </div>
            ))}
          </div>
          {activeNav !== "Öğrenci" && followError && <p className="people-error" role="alert">{followError}</p>}
        </section>

        <footer className="side-footer">
          <div><a href="/legal#about">Hakkımızda</a><button type="button" onClick={() => navigateTo("Güvenlik")}>Güvenlik</button><a href="/legal#help">Yardım</a><a href="/legal#privacy">Gizlilik</a></div>
          <span>© 2026 Kampira · Öğrencilerle, öğrenciler için.</span>
        </footer>
      </aside>}

      <MobileNavigation active={activeNav} onNavigate={navigateTo} onCompose={openFeedComposer} avatarUrl={activeProfile.avatarUrl} initials={initials} unread={messageUnreadCount}/>
      {mobileComposerOpen && <MobilePostComposer draft={draft} onDraftChange={setDraft} audience={draftAudience} onAudienceChange={setDraftAudience} courseName={studentProfile.courses.find((course) => course.id === composerCourseId)?.code} name={studentProfile.displayName} avatarUrl={activeProfile.avatarUrl} initials={initials} media={draftMedia} mediaUrl={draftMediaUrl} onMediaChange={choosePostMedia} mediaFiles={composerMedia.files} mediaUrls={composerMedia.urls} onRemoveMediaAt={removePostMedia} onReorderMedia={movePostMedia} onRemoveMedia={() => removePostMedia(0)} onClose={closeMobileComposer} onPublish={() => void publishPost()} onNavigate={(name) => { const url = pageLocationWithoutComposer(window.location.href); window.history.replaceState(window.history.state, "", url); navigateTo(name); }} publishing={publishing} progress={publishProgress} onCancelUpload={() => publishController.current?.abort()} locked={publishing || publishUncertain || durableDraft.blocked} publishBlocked={durableDraft.blocked} draftNotice={draftNotice} retry={publishUncertain} error={composerError}/>}

      <CourseHubLayers hub={courseHub} subjects={profileSubjects} onNotes={subject => navigateTo("Notlar", undefined, { id: subject.id, code: subject.code, name: subject.label })} onCompose={subject => { setDraftAudience("campus"); changeFeed("campus"); setComposerCourseId(subject.id); openFeedComposer(); }}/>
    </main>
    </AppNavigationProvider>
  );
}
