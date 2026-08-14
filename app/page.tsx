"use client";

import { useEffect, useMemo, useState } from "react";
import {
  departments,
  getCourseById,
  getCoursesForDepartment,
  getDepartmentById,
  getUniversityById,
  universities,
  type AcademicCourse,
} from "../lib/academic-data";

type IconName =
  | "home" | "compass" | "notes" | "users" | "bell" | "bookmark"
  | "search" | "plus" | "image" | "file" | "sparkles" | "more"
  | "heart" | "comment" | "share" | "check" | "calendar" | "arrow"
  | "close" | "send";

type Post = {
  id: number | string;
  name: string;
  initials: string;
  avatarClass: string;
  school: string;
  department: string;
  time: string;
  course: string;
  text: string;
  likes: number;
  comments: number;
  liked?: boolean;
  saved?: boolean;
  attachment?: {
    title: string;
    meta: string;
    theme: string;
  };
  poll?: { label: string; value: number }[];
};

type StudentProfile = {
  displayName: string;
  handle: string;
  universityId: string;
  universityName: string;
  universityShortName: string;
  universityCity: string;
  departmentId: string;
  departmentName: string;
  classYear: number;
  onboardingCompleted: boolean;
  courses: AcademicCourse[];
};

type ProfileState =
  | "loading"
  | "ready"
  | "needs-onboarding"
  | "auth-required"
  | "unavailable";

const demoProfile: StudentProfile = {
  displayName: "Deniz Öztürk",
  handle: "denizoz",
  universityId: "bogazici",
  universityName: "Boğaziçi Üniversitesi",
  universityShortName: "BÜ",
  universityCity: "İstanbul",
  departmentId: "endustri",
  departmentName: "Endüstri Mühendisliği",
  classYear: 3,
  onboardingCompleted: true,
  courses: getCoursesForDepartment("endustri").slice(0, 6),
};

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
  { label: "Notlar", icon: "notes" },
  { label: "Topluluklar", icon: "users" },
  { label: "Bildirimler", icon: "bell" },
  { label: "Kaydedilenler", icon: "bookmark" },
];

const subjects = [
  { code: "MAT", label: "Matematik", tone: "coral", icon: "∑" },
  { code: "FİZ", label: "Fizik", tone: "violet", icon: "φ" },
  { code: "YAZ", label: "Yazılım", tone: "blue", icon: "</>" },
  { code: "HUK", label: "Hukuk", tone: "amber", icon: "§" },
  { code: "PSİ", label: "Psikoloji", tone: "mint", icon: "Ψ" },
  { code: "MİM", label: "Mimarlık", tone: "rose", icon: "△" },
];

const initialPosts: Post[] = [
  {
    id: 1,
    name: "Ece Yılmaz",
    initials: "EY",
    avatarClass: "avatar-coral",
    school: "İstanbul Teknik Üniversitesi",
    department: "Bilgisayar Mühendisliği",
    time: "18 dk",
    course: "MAT 101",
    text: "Lineer cebir finali için hazırladığım özet burada 🙌 Özdeğer–özvektör kısmını özellikle sadeleştirdim. Bir yerde hata görürseniz yorum bırakın, birlikte düzeltelim.",
    likes: 184,
    comments: 27,
    attachment: {
      title: "Lineer Cebir — Final Özeti",
      meta: "PDF · 24 sayfa · 8,4 MB",
      theme: "linear",
    },
  },
  {
    id: 2,
    name: "Mert Can",
    initials: "MC",
    avatarClass: "avatar-blue",
    school: "Ankara Üniversitesi",
    department: "Hukuk",
    time: "42 dk",
    course: "HUK 204",
    text: "Borçlar hukuku çalışırken en çok hangi kaynak işinize yaradı? Hocanın önerdiği kitap biraz ağır geldi. Başlangıç için daha anlaşılır bir kaynak arıyorum.",
    likes: 76,
    comments: 39,
  },
  {
    id: 3,
    name: "Selin Aras",
    initials: "SA",
    avatarClass: "avatar-mint",
    school: "Ege Üniversitesi",
    department: "Psikoloji",
    time: "1 sa",
    course: "KAMPÜS",
    text: "Yarınki boşluğu değerlendirelim: Kütüphanede birlikte çalışmak isteyen var mı? 📚",
    likes: 93,
    comments: 18,
    poll: [
      { label: "10.00 – 13.00", value: 58 },
      { label: "14.00 – 17.00", value: 31 },
      { label: "Akşam daha iyi", value: 11 },
    ],
  },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.3 8.7-2 4.6-4.6 2 2-4.6 4.6-2Z"/></>,
    notes: <><path d="M7 3h9l3 3v15H7z"/><path d="M16 3v4h4M10 11h6M10 15h6"/><path d="M4 7v13"/></>,
    users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 11a3 3 0 1 0-2.2-5M19 20v-1.5a4 4 0 0 0-2-3.5"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/></>,
    file: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></>,
    sparkles: <><path d="m12 3 1.1 3.2L16 8l-2.9 1.8L12 13l-1.1-3.2L8 8l2.9-1.8L12 3Z"/><path d="m18.5 13 .7 2.1 1.8 1.1-1.8 1.1-.7 2.2-.7-2.2-1.8-1.1 1.8-1.1.7-2.1ZM5.5 12l.8 2.3 2 1.2-2 1.2-.8 2.3-.8-2.3-2-1.2 2-1.2.8-2.3Z"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    heart: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>,
    comment: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-4-.9l-5 1.5 1.6-4.3A8.4 8.4 0 1 1 21 11.5Z"/>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function Avatar({ initials, className, small = false }: { initials: string; className: string; small?: boolean }) {
  return <span className={`avatar ${className} ${small ? "avatar-small" : ""}`}>{initials}</span>;
}

function AttachmentCard({ attachment }: { attachment: NonNullable<Post["attachment"]> }) {
  return (
    <button className={`attachment-card attachment-${attachment.theme}`} type="button" aria-label={`${attachment.title} notunu aç`}>
      <span className="attachment-preview" aria-hidden="true">
        <span className="paper paper-back" />
        <span className="paper paper-front">
          <span className="paper-kicker">MAT 101</span>
          <span className="paper-title">Lineer<br/>Cebir</span>
          <span className="paper-rule paper-rule-long" />
          <span className="paper-formula">Av = λv</span>
          <span className="paper-grid" />
          <span className="paper-page">01</span>
        </span>
      </span>
      <span className="attachment-info">
        <span className="attachment-type"><Icon name="file" size={15}/> Ders notu</span>
        <strong>{attachment.title}</strong>
        <span>{attachment.meta}</span>
        <span className="attachment-open">Notu görüntüle <Icon name="arrow" size={16}/></span>
      </span>
    </button>
  );
}

function FeedPost({ post, viewerInitials = "DÖ" }: { post: Post; viewerInitials?: string }) {
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [voted, setVoted] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [busyAction, setBusyAction] = useState<"like" | "save" | "comment" | null>(null);
  const [interactionError, setInteractionError] = useState("");
  const isPersistentPost = typeof post.id === "string";

  async function runAction(type: "like" | "save" | "comment", content?: string) {
    setInteractionError("");
    setBusyAction(type);

    try {
      const response = await fetch("/api/post-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: post.id, type, content }),
      });
      const data = (await response.json()) as { active?: boolean; count?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Etkileşim kaydedilemedi.");
      return data;
    } catch (actionError) {
      setInteractionError(actionError instanceof Error ? actionError.message : "Etkileşim kaydedilemedi.");
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleLike() {
    if (busyAction) return;
    if (!isPersistentPost) {
      const nextLiked = !liked;
      setLiked(nextLiked);
      setLikeCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));
      return;
    }

    const result = await runAction("like");
    if (!result) return;
    setLiked(Boolean(result.active));
    if (typeof result.count === "number") setLikeCount(result.count);
  }

  async function toggleSave() {
    if (busyAction) return;
    if (!isPersistentPost) {
      setSaved((current) => !current);
      return;
    }

    const result = await runAction("save");
    if (result) setSaved(Boolean(result.active));
  }

  async function sendComment() {
    const clean = commentText.trim();
    if (!clean || busyAction) return;
    if (!isPersistentPost) {
      setCommentCount((count) => count + 1);
      setCommentText("");
      setCommenting(false);
      return;
    }

    const result = await runAction("comment", clean);
    if (!result) return;
    if (typeof result.count === "number") setCommentCount(result.count);
    setCommentText("");
    setCommenting(false);
  }

  return (
    <article className="post-card">
      <header className="post-header">
        <Avatar initials={post.initials} className={post.avatarClass} />
        <div className="post-person">
          <div className="post-name-line">
            <strong>{post.name}</strong>
            <span className="verified" title="Doğrulanmış öğrenci"><Icon name="check" size={11}/></span>
          </div>
          <span>{post.school} · {post.department}</span>
          <span className="post-time">{post.time === "şimdi" ? post.time : `${post.time} önce`}</span>
        </div>
        <button className="icon-button post-menu" type="button" aria-label="Gönderi seçenekleri"><Icon name="more"/></button>
      </header>

      <div className="post-body">
        <button className="course-tag" type="button">{post.course}</button>
        <p>{post.text}</p>
        {post.attachment && <AttachmentCard attachment={post.attachment} />}
        {post.poll && (
          <div className="poll" aria-label="Anket">
            {post.poll.map((item, index) => (
              <button
                className={`poll-option ${voted === index ? "selected" : ""}`}
                key={item.label}
                onClick={() => setVoted(index)}
                type="button"
              >
                <span className="poll-fill" style={{ width: `${item.value}%` }} />
                <span className="poll-label">{voted === index && <Icon name="check" size={15}/>} {item.label}</span>
                <strong>{item.value}%</strong>
              </button>
            ))}
            <span className="poll-meta">236 oy · 21 saat kaldı</span>
          </div>
        )}
      </div>

      <footer className="post-footer">
        <div className="post-actions">
          <button className={`action-button ${liked ? "liked" : ""}`} onClick={() => void toggleLike()} type="button" aria-pressed={liked} disabled={busyAction === "like"}>
            <Icon name="heart" size={19}/><span>{likeCount}</span>
          </button>
          <button className="action-button" onClick={() => setCommenting(!commenting)} type="button" aria-expanded={commenting}>
            <Icon name="comment" size={19}/><span>{commentCount}</span>
          </button>
          <button className="action-button" type="button"><Icon name="share" size={19}/><span>Paylaş</span></button>
        </div>
        <button className={`action-button save-button ${saved ? "saved" : ""}`} onClick={() => void toggleSave()} type="button" aria-pressed={saved} aria-label="Gönderiyi kaydet" disabled={busyAction === "save"}>
          <Icon name="bookmark" size={19}/>
        </button>
      </footer>

      {commenting && (
        <div className="quick-comment">
          <Avatar initials={viewerInitials} className="avatar-violet" small />
          <label className="sr-only" htmlFor={`comment-${post.id}`}>Yorum yaz</label>
          <input id={`comment-${post.id}`} autoFocus maxLength={500} value={commentText} onChange={(event) => { setCommentText(event.target.value); setInteractionError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendComment(); } }} placeholder="Bir yorum yaz..." />
          <button type="button" onClick={() => void sendComment()} disabled={!commentText.trim() || busyAction === "comment"} aria-label="Yorumu gönder"><Icon name="send" size={17}/></button>
        </div>
      )}
      {interactionError && <p className="interaction-feedback" role="alert">{interactionError}</p>}
    </article>
  );
}

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="Üniyra ana sayfa">
      <span className="brand-mark"><span>ü</span></span>
      <span className="brand-name">üniyra</span>
    </a>
  );
}

const libraryNotes = [
  { code: "FİZ 101", title: "Mekanik — Formül Kağıdı", author: "Bora Akın", meta: "18 sayfa · 1,2 B görüntülenme", tone: "purple", symbol: "F = ma", saved: true },
  { code: "MAT 201", title: "Diferansiyel Denklemler", author: "İdil Şen", meta: "32 sayfa · 894 görüntülenme", tone: "blue", symbol: "dy/dx", saved: false },
  { code: "HUK 204", title: "Borçlar Hukuku Özeti", author: "Mert Can", meta: "46 sayfa · 986 görüntülenme", tone: "amber", symbol: "§ 49", saved: false },
  { code: "PSİ 202", title: "Gelişim Kuramları Tablosu", author: "Selin Aras", meta: "12 sayfa · 741 görüntülenme", tone: "mint", symbol: "Ψ", saved: true },
];

function ViewTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="view-title">
      <div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function NoteCard({ note }: { note: (typeof libraryNotes)[number] }) {
  const [saved, setSaved] = useState(note.saved);
  return (
    <article className="library-note-card">
      <button className={`note-cover note-${note.tone}`} type="button" aria-label={`${note.title} notunu aç`}>
        <span className="note-cover-code">{note.code}</span>
        <strong>{note.symbol}</strong>
        <span className="note-cover-lines" />
        <i>ÜNİYRA NOTES</i>
      </button>
      <div className="note-card-body">
        <div><span>{note.code}</span><button className={saved ? "active" : ""} type="button" onClick={() => setSaved(!saved)} aria-label="Notu kaydet"><Icon name="bookmark" size={17}/></button></div>
        <h3>{note.title}</h3>
        <p>{note.author}</p>
        <small>{note.meta}</small>
      </div>
    </article>
  );
}

function DiscoverView() {
  const [category, setCategory] = useState("Sana özel");
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="ÜNİYRA KEŞFET" title="Yeni şeyler keşfet" description="Kampüsünden ve Türkiye'nin dört bir yanından öğrencilerle buluş." />
      <label className="discover-search"><Icon name="search" size={20}/><input placeholder="Ders, konu, topluluk veya öğrenci ara"/><kbd>⌘ K</kbd></label>
      <div className="category-pills">
        {["Sana özel", "Gündem", "Dersler", "Kampüsler", "Topluluklar"].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} type="button" key={item}>{item}</button>)}
      </div>

      <section className="discover-hero">
        <div className="discover-hero-copy"><span><Icon name="sparkles" size={15}/> BU HAFTANIN KONUSU</span><h2>Final dönemini<br/>birlikte atlatıyoruz.</h2><p>4.800+ öğrenci çalışma planlarını, özetlerini ve motivasyonunu paylaşıyor.</p><button type="button">Sohbete katıl <Icon name="arrow" size={17}/></button></div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit-one">∑</span><span className="orbit-two">Ψ</span><span className="orbit-three">F</span><i/><strong>4.8K</strong><small>öğrenci</small></div>
      </section>

      <div className="section-heading workspace-heading"><div><span className="eyebrow">YÜKSELENLER</span><h2>Bugün konuşulanlar</h2></div><button type="button">Tümünü gör <Icon name="arrow" size={15}/></button></div>
      <div className="topic-grid">
        <button className="topic-card topic-coral" type="button"><span>#01</span><small>12,8 B gönderi</small><h3>Final haftası</h3><p>Planlar, notlar ve çalışma arkadaşları</p><div><Avatar initials="EY" className="avatar-coral" small/><Avatar initials="BA" className="avatar-blue" small/><Avatar initials="SA" className="avatar-mint" small/><i>+2K</i></div></button>
        <button className="topic-card topic-violet" type="button"><span>#02</span><small>8,4 B gönderi</small><h3>Staj Günlükleri</h3><p>Deneyimler, başvurular ve tavsiyeler</p><div><Avatar initials="NB" className="avatar-amber" small/><Avatar initials="MC" className="avatar-blue" small/><Avatar initials="İK" className="avatar-mint" small/><i>+960</i></div></button>
      </div>

      <div className="section-heading workspace-heading"><div><span className="eyebrow">KAMPÜSLER</span><h2>Öne çıkan topluluklar</h2></div><button type="button">Tümünü gör <Icon name="arrow" size={15}/></button></div>
      <div className="compact-community-list">
        <article><span className="community-logo community-logo-blue">İTÜ</span><div><strong>İTÜ Yazılım Çevresi</strong><small>3.246 üye · Bugün 38 gönderi</small></div><button type="button">Katıl</button></article>
        <article><span className="community-logo community-logo-red">ODTÜ</span><div><strong>ODTÜ Kampüs Dayanışma</strong><small>5.104 üye · Bugün 61 gönderi</small></div><button type="button">Katıl</button></article>
        <article><span className="community-logo community-logo-mint">BÜ</span><div><strong>Boğaziçi Kariyer Ağı</strong><small>2.870 üye · Bugün 24 gönderi</small></div><button type="button">Katıl</button></article>
      </div>
    </div>
  );
}

function NotesView({ onUpload }: { onUpload: () => void }) {
  const [filter, setFilter] = useState("Tüm notlar");
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="NOT KÜTÜPHANESİ" title="Aradığın bilgi burada" description="Öğrenciler tarafından hazırlanmış, ders ve okuluna göre düzenlenmiş notlar." action={<button className="view-primary" type="button" onClick={onUpload}><Icon name="plus" size={17}/> Not yükle</button>} />
      <section className="notes-ai-search">
        <div><span><Icon name="sparkles" size={16}/> Üniyra AI <i>Beta</i></span><h2>Ne aradığını doğal dilde anlat.</h2><p>Binlerce notun içinden sana en uygun olanları bulalım.</p></div>
        <label><Icon name="search" size={19}/><input placeholder="Örn. Geçen yılın MAT 101 final özetleri"/><button type="button">Ara <Icon name="arrow" size={15}/></button></label>
        <span className="notes-ai-decoration">ai</span>
      </section>
      <div className="library-toolbar">
        <div>{["Tüm notlar", "Derslerim", "Kampüsüm", "Kaydettiklerim"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} type="button" key={item}>{item}</button>)}</div>
        <button className="filter-button" type="button"><Icon name="more" size={18}/> Filtrele</button>
      </div>
      <div className="note-library-grid">{libraryNotes.map((note) => <NoteCard note={note} key={note.title}/>)}</div>
      <button className="load-more" type="button">Daha fazla not göster</button>
    </div>
  );
}

const communities = [
  { logo: "İTÜ", tone: "blue", name: "İTÜ Yazılım Çevresi", category: "Teknoloji · İstanbul", members: "3.246", posts: "38", joined: true },
  { logo: "PSİ", tone: "violet", name: "Psikoloji Öğrencileri", category: "Akademik · Türkiye", members: "8.920", posts: "72", joined: false },
  { logo: "MİM", tone: "coral", name: "Genç Mimarlar", category: "Tasarım · Türkiye", members: "4.108", posts: "41", joined: false },
  { logo: "ER", tone: "mint", name: "Erasmus Deneyimleri", category: "Seyahat · Global", members: "11.300", posts: "96", joined: true },
];

function CommunitiesView() {
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="TOPLULUKLAR" title="Birlikte daha güçlüyüz" description="İlgi alanına, dersine veya kampüsüne uygun çevreni bul." action={<button className="view-primary" type="button"><Icon name="plus" size={17}/> Topluluk kur</button>} />
      <section className="my-communities-banner"><div><span><Icon name="users" size={17}/></span><div><strong>5 topluluğa üyesin</strong><p>Bugün topluluklarında 32 yeni gönderi var.</p></div></div><button type="button">Üyeliklerim <Icon name="arrow" size={16}/></button></section>
      <div className="section-heading workspace-heading"><div><span className="eyebrow">SANA ÖZEL</span><h2>Keşfedebileceğin topluluklar</h2></div><button type="button">Kategoriler <Icon name="arrow" size={15}/></button></div>
      <div className="community-grid">
        {communities.map((community) => <CommunityCard community={community} key={community.name}/>) }
      </div>
      <section className="study-room-card"><div className="study-room-art"><span/><i/><strong>12</strong><small>canlı oda</small></div><div><span className="live-label"><i/> ŞİMDİ CANLI</span><h2>Birlikte çalışma odaları</h2><p>Kameranı açmak zorunda değilsin. Aynı derse çalışan öğrencilerle sessizce odaklan.</p><button type="button">Odaları gör <Icon name="arrow" size={16}/></button></div></section>
    </div>
  );
}

function CommunityCard({ community }: { community: (typeof communities)[number] }) {
  const [joined, setJoined] = useState(community.joined);
  return (
    <article className="community-card">
      <div className={`community-cover cover-${community.tone}`}><span className={`community-logo community-logo-${community.tone}`}>{community.logo}</span><i>● ● ●</i></div>
      <div className="community-body"><span>{community.category}</span><h3>{community.name}</h3><div><strong>{community.members}<small>üye</small></strong><strong>{community.posts}<small>bugün</small></strong></div><button className={joined ? "joined" : ""} onClick={() => setJoined(!joined)} type="button">{joined ? <><Icon name="check" size={15}/> Katıldın</> : "Topluluğa katıl"}</button></div>
    </article>
  );
}

const notifications = [
  { initials: "EY", avatar: "avatar-coral", title: "Ece Yılmaz notuna yorum yaptı", text: "“Özdeğer kısmındaki örnek gerçekten çok iyi olmuş.”", time: "5 dk", unread: true },
  { initials: "BA", avatar: "avatar-blue", title: "Bora Akın seni takip etmeye başladı", text: "YTÜ · Makine Mühendisliği", time: "28 dk", unread: true },
  { initials: "MAT", avatar: "avatar-violet", title: "MAT 101 çevresinde 7 yeni not var", text: "Son ziyaretinden beri yeni paylaşımlar yapıldı.", time: "1 sa", unread: true },
  { initials: "SA", avatar: "avatar-mint", title: "Selin Aras gönderini beğendi", text: "“Yarın MAT 101 için ortak çalışma grubu...”", time: "3 sa", unread: false },
  { initials: "Ü", avatar: "avatar-amber", title: "Final haftası yaklaşıyor", text: "Çalışma planını oluşturmak için 12 günün kaldı.", time: "Dün", unread: false },
];

function NotificationsView() {
  const [tab, setTab] = useState("Tümü");
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="BİLDİRİMLER" title="Gelişmeler" description="Notlarından, çevrelerinden ve kampüsünden haberler." action={<button className="text-action" type="button"><Icon name="check" size={15}/> Tümünü okundu işaretle</button>} />
      <div className="notification-tabs">{["Tümü", "Etkileşimler", "Dersler", "Topluluklar"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} type="button" key={item}>{item}</button>)}</div>
      <div className="notification-list">{notifications.map((item) => <article className={item.unread ? "unread" : ""} key={item.title}><Avatar initials={item.initials} className={item.avatar}/><div><strong>{item.title}</strong><p>{item.text}</p><small>{item.time} önce</small></div>{item.unread && <i/>}<button type="button" aria-label="Bildirim seçenekleri"><Icon name="more" size={18}/></button></article>)}</div>
    </div>
  );
}

function SavedView() {
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="KAYDEDİLENLER" title="Sonra bakacakların" description="Kaydettiğin notlar, gönderiler ve topluluklar tek yerde." />
      <section className="saved-summary"><div><span><Icon name="bookmark" size={22}/></span><div><strong>18 kayıt</strong><p>7 not · 9 gönderi · 2 topluluk</p></div></div><button type="button">Koleksiyon oluştur <Icon name="plus" size={16}/></button></section>
      <div className="saved-collections">
        <button type="button"><span className="collection-stack stack-purple"><i/><i/><i/></span><strong>Final Hazırlığı</strong><small>8 kayıt</small></button>
        <button type="button"><span className="collection-stack stack-coral"><i/><i/><i/></span><strong>Staj & Kariyer</strong><small>5 kayıt</small></button>
        <button type="button"><span className="collection-stack stack-mint"><i/><i/><i/></span><strong>Sonra Okurum</strong><small>5 kayıt</small></button>
      </div>
      <div className="section-heading workspace-heading"><div><span className="eyebrow">SON KAYDEDİLENLER</span><h2>Tüm kayıtlar</h2></div><button type="button">Sırala <Icon name="more" size={15}/></button></div>
      <div className="note-library-grid">{libraryNotes.filter((note) => note.saved).map((note) => <NoteCard note={note} key={note.title}/>)}</div>
    </div>
  );
}

function ProfileView({ profile, onEdit }: { profile: StudentProfile; onEdit: () => void }) {
  const initials = getInitials(profile.displayName);
  return (
    <div className="workspace-view profile-view">
      <section className="profile-hero"><div className="profile-cover"><span>∑</span><span>Ψ</span><span>λ</span><i/></div><div className="profile-main"><Avatar initials={initials} className="avatar-violet"/><div><h1>{profile.displayName} <span className="verified"><Icon name="check" size={11}/></span></h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.departmentName} · {profile.classYear}. sınıf</small></div><button type="button" onClick={onEdit}>Profili düzenle</button></div><p className="profile-bio">Öğrenmeyi, paylaşmayı ve iyi kahveyi seviyorum. ☕ Ders çevrelerimde birlikte çalışıyorum.</p><div className="profile-stats"><strong>126<span>Gönderi</span></strong><strong>2.4K<span>Takipçi</span></strong><strong>384<span>Takip</span></strong><strong>18.7K<span>Not görüntülenmesi</span></strong></div></section>
      <div className="profile-tabs"><button className="active" type="button">Gönderiler</button><button type="button">Notlarım</button><button type="button">Topluluklar</button><button type="button">Hakkımda</button></div>
      <FeedPost viewerInitials={initials} post={{...initialPosts[1], id: 92, name: profile.displayName, initials, avatarClass: "avatar-violet", school: profile.universityName, department: profile.departmentName, time: "2 gün", course: profile.courses[0]?.code ?? "GENEL", text: "Bu dönem seçtiğim dersler için çıkardığım kısa çözüm yöntemlerini akşam not olarak yükleyeceğim. Takıldığınız yerleri yorumlarda paylaşabilirsiniz."}} />
    </div>
  );
}

function SecondaryView({ name, onUpload, profile, onEditProfile }: { name: string; onUpload: () => void; profile: StudentProfile; onEditProfile: () => void }) {
  if (name === "Keşfet") return <DiscoverView/>;
  if (name === "Notlar") return <NotesView onUpload={onUpload}/>;
  if (name === "Topluluklar") return <CommunitiesView/>;
  if (name === "Bildirimler") return <NotificationsView/>;
  if (name === "Kaydedilenler") return <SavedView/>;
  if (name === "Profil") return <ProfileView profile={profile} onEdit={onEditProfile}/>;
  return <DiscoverView/>;
}

type ModalType = "note" | "ai";

function ProductModal({ type, onClose }: { type: ModalType; onClose: () => void }) {
  const [fileName, setFileName] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [completed, setCompleted] = useState(false);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`product-modal ${type === "ai" ? "ai-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <span className={type === "ai" ? "modal-icon modal-icon-ai" : "modal-icon modal-icon-note"}><Icon name={type === "ai" ? "sparkles" : "file"} size={20}/></span>
          <div><span>{type === "ai" ? "ÜNİYRA AI · BETA" : "NOT KÜTÜPHANESİ"}</span><h2 id="modal-title">{type === "ai" ? "Aradığın notu birlikte bulalım" : "Notunu Üniyra'ya ekle"}</h2><p>{type === "ai" ? "Neye çalıştığını anlat; en uygun kaynakları sıralayalım." : "Paylaşımın aynı dersi alan binlerce öğrenciye ulaşabilir."}</p></div>
          <button type="button" onClick={onClose} aria-label="Pencereyi kapat"><Icon name="close" size={19}/></button>
        </header>

        {type === "note" ? (
          completed ? <div className="modal-success"><span><Icon name="check" size={28}/></span><h3>Notun incelemeye hazır!</h3><p>Sonraki adımda ders bilgilerini doğrulayıp paylaşabileceksin.</p><button type="button" onClick={onClose}>Tamam</button></div> : <>
            <label className={`upload-dropzone ${fileName ? "has-file" : ""}`}>
              <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}/>
              <span><Icon name={fileName ? "check" : "file"} size={23}/></span>
              <strong>{fileName || "Dosyanı buraya bırak veya seç"}</strong>
              <small>{fileName ? "Dosya başarıyla seçildi" : "PDF, DOCX, PPTX veya görsel · En fazla 50 MB"}</small>
            </label>
            <label className="modal-field"><span>Not başlığı</span><input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Örn. Lineer Cebir Final Özeti"/></label>
            <div className="modal-field-row">
              <button type="button"><span>Ders</span><strong>MAT 101</strong><Icon name="arrow" size={14}/></button>
              <button type="button"><span>Not türü</span><strong>Ders özeti</strong><Icon name="arrow" size={14}/></button>
            </div>
            <label className="ai-assist-toggle"><span><Icon name="sparkles" size={17}/></span><div><strong>AI ile düzenle</strong><small>Başlığı, açıklamayı ve etiketleri otomatik hazırla.</small></div><input type="checkbox" defaultChecked/><i/></label>
            <footer className="modal-footer"><button type="button" onClick={onClose}>İptal</button><button type="button" onClick={() => setCompleted(true)} disabled={!fileName || !noteTitle.trim()}>Devam et <Icon name="arrow" size={16}/></button></footer>
          </>
        ) : (
          <>
            <label className="ai-query-box"><Icon name="sparkles" size={20}/><textarea value={query} onChange={(event) => { setQuery(event.target.value); setSearched(false); }} placeholder="Örn. Mikroekonomi finaline hazırlanıyorum; arz-talep ve esneklik için kısa, görsel bir özet arıyorum." rows={4}/><button type="button" onClick={() => setSearched(true)} disabled={!query.trim()}>Ara <Icon name="arrow" size={16}/></button></label>
            {!searched ? <div className="ai-suggestions"><span>Şunları deneyebilirsin</span><div>{["MAT 101 çıkmış sorular", "Organik kimya reaksiyon özeti", "Borçlar hukuku final notu"].map((item) => <button type="button" onClick={() => setQuery(item)} key={item}>{item}</button>)}</div></div> : <div className="ai-results"><div><span><Icon name="check" size={14}/> 12 not içinde en uygun 2 sonuç</span><small>Üniyra AI yanılabilir; kaynakları kontrol et.</small></div><button type="button"><i className="mini-doc mini-doc-purple">F</i><span><strong>Mikroekonomi — Final Özeti</strong><small>Ece Yılmaz · 28 sayfa · %96 eşleşme</small></span><Icon name="arrow" size={17}/></button><button type="button"><i className="mini-doc mini-doc-mint">E</i><span><strong>Esneklik ve Piyasa Dengesi</strong><small>Nazlı Bilgin · 16 sayfa · %91 eşleşme</small></span><Icon name="arrow" size={17}/></button></div>}
          </>
        )}
      </section>
    </div>
  );
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

function AcademicOnboarding({
  identityName,
  initialProfile,
  state,
  onComplete,
  onDemo,
  onRetry,
}: {
  identityName: string;
  initialProfile: StudentProfile | null;
  state: Exclude<ProfileState, "loading" | "ready">;
  onComplete: (profile: StudentProfile) => void;
  onDemo: () => void;
  onRetry: () => void;
}) {
  const [step, setStep] = useState(1);
  const [universityId, setUniversityId] = useState(initialProfile?.universityId ?? "");
  const [departmentId, setDepartmentId] = useState(initialProfile?.departmentId ?? "");
  const [classYear, setClassYear] = useState(initialProfile?.classYear ?? 1);
  const [courseIds, setCourseIds] = useState<string[]>(initialProfile?.courses.map((course) => course.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const departmentCourses = getCoursesForDepartment(departmentId);
  const selectedUniversity = getUniversityById(universityId);
  const selectedDepartment = getDepartmentById(departmentId);
  const selectedCourses = courseIds.map((courseId) => getCourseById(courseId)).filter((course): course is AcademicCourse => Boolean(course));
  const firstName = getFirstName(identityName);

  if (state === "auth-required") {
    return (
      <main className="onboarding-shell onboarding-state-shell">
        <div className="onboarding-state-card">
          <Logo/>
          <span className="onboarding-state-icon"><Icon name="users" size={27}/></span>
          <span className="onboarding-kicker">ÖĞRENCİ AĞIN SENİ BEKLİYOR</span>
          <h1>Üniyra’ya kimliğinle devam et.</h1>
          <p>Profilini ve seçtiğin dersleri güvenle saklayabilmemiz için önce giriş yapmalısın.</p>
          <a className="onboarding-signin" href="/signin-with-chatgpt?return_to=%2F">Giriş yap ve profilini oluştur <Icon name="arrow" size={17}/></a>
          <button className="onboarding-demo-link" type="button" onClick={onDemo}>Demo akışını aç</button>
        </div>
      </main>
    );
  }

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
          <button className="onboarding-demo-link" type="button" onClick={onDemo}>Demo akışını aç</button>
        </div>
      </main>
    );
  }

  function chooseDepartment(nextDepartmentId: string) {
    setDepartmentId(nextDepartmentId);
    setCourseIds([]);
    setError("");
  }

  function toggleCourse(courseId: string) {
    setCourseIds((current) => {
      if (current.includes(courseId)) return current.filter((id) => id !== courseId);
      if (current.length >= 8) return current;
      return [...current, courseId];
    });
    setError("");
  }

  async function saveProfile() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ universityId, departmentId, classYear, courseIds }),
      });
      const data = (await response.json()) as { profile?: StudentProfile; error?: string; signInPath?: string };

      if (response.status === 401 && data.signInPath) {
        window.location.assign(data.signInPath);
        return;
      }
      if (!response.ok || !data.profile) {
        throw new Error(data.error ?? "Profilin kaydedilemedi.");
      }

      onComplete(data.profile);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profilin kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const nextDisabled =
    (step === 1 && !universityId) ||
    (step === 2 && (!departmentId || !classYear)) ||
    (step === 3 && courseIds.length < 3) ||
    saving;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Logo/>
        <div className="onboarding-progress-copy"><span>Profil kurulumu</span><strong>{step} / 4</strong></div>
      </header>

      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <div className="onboarding-rail" aria-hidden="true">
          {[1, 2, 3, 4].map((item) => <span className={item <= step ? "active" : ""} key={item}><i/></span>)}
        </div>

        <div className="onboarding-copy">
          <span className="onboarding-kicker">
            {step === 1 && "ÖNCE KAMPÜSÜN"}
            {step === 2 && "AKADEMİK YOLUN"}
            {step === 3 && "DERS ÇEVRELERİN"}
            {step === 4 && "HER ŞEY HAZIR"}
          </span>
          <h1 id="onboarding-title">
            {step === 1 && `Merhaba ${firstName}, üniversiten hangisi?`}
            {step === 2 && "Bölümünü ve sınıfını seç."}
            {step === 3 && "Bu dönem hangi derslerdesin?"}
            {step === 4 && "Sana özel kampüsü kuralım."}
          </h1>
          <p>
            {step === 1 && "Kampüsündeki öğrencileri, notları ve toplulukları sana daha yakın göstereceğiz."}
            {step === 2 && "Akışını aynı akademik yolda yürüyen öğrencilerle eşleştireceğiz."}
            {step === 3 && "En az 3 ders seç. Ders çevrelerin akışının temelini oluşturacak."}
            {step === 4 && "Seçimlerini kontrol et. Profilin sonraki ziyaretlerinde de seni bekleyecek."}
          </p>
        </div>

        <div className="onboarding-content">
          {step === 1 && (
            <div className="university-grid">
              {universities.map((university) => (
                <button className={universityId === university.id ? "selected" : ""} type="button" onClick={() => { setUniversityId(university.id); setError(""); }} key={university.id}>
                  <span>{university.shortName}</span>
                  <div><strong>{university.name}</strong><small>{university.city}</small></div>
                  <i>{universityId === university.id && <Icon name="check" size={14}/>}</i>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="academic-step">
              <div className="onboarding-field-title"><span>Bölümün</span><small>Akışını ve önerilen derslerini belirler.</small></div>
              <div className="department-grid">
                {departments.map((department) => (
                  <button className={departmentId === department.id ? "selected" : ""} type="button" onClick={() => chooseDepartment(department.id)} key={department.id}>
                    <span>{department.name}</span>{departmentId === department.id && <Icon name="check" size={15}/>}
                  </button>
                ))}
              </div>
              <div className="onboarding-field-title class-title"><span>Kaçıncı sınıftasın?</span><small>Hazırlık dahil seçim yapabilirsin.</small></div>
              <div className="year-picker">
                {[1, 2, 3, 4, 5, 6].map((year) => <button className={classYear === year ? "selected" : ""} type="button" onClick={() => setClassYear(year)} key={year}>{year === 1 ? "Hazırlık / 1" : year}<small>{year === 6 ? "+" : ". sınıf"}</small></button>)}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="course-step">
              <div className="course-count"><span><strong>{courseIds.length}</strong> ders seçtin</span><small>En az 3 · En fazla 8</small></div>
              <div className="course-choice-grid">
                {departmentCourses.map((course, index) => (
                  <button className={courseIds.includes(course.id) ? "selected" : ""} type="button" onClick={() => toggleCourse(course.id)} key={course.id}>
                    <span className={`course-choice-icon course-tone-${index % 6}`}>{course.code.split(" ")[0].slice(0, 3)}</span>
                    <div><strong>{course.code}</strong><small>{course.name}</small></div>
                    <i>{courseIds.includes(course.id) ? <Icon name="check" size={14}/> : <Icon name="plus" size={14}/>}</i>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onboarding-summary">
              <div className="summary-identity">
                <span className="summary-avatar">{getInitials(identityName)}</span>
                <div><span>Üniyra profilin</span><h2>{identityName}</h2><p>{selectedDepartment?.name} · {classYear}. sınıf</p></div>
                <span className="summary-ready"><Icon name="check" size={15}/> Hazır</span>
              </div>
              <div className="summary-campus">
                <span>{selectedUniversity?.shortName}</span>
                <div><small>KAMPÜSÜN</small><strong>{selectedUniversity?.name}</strong><p>{selectedUniversity?.city} çevresindeki öğrencilerle buluş.</p></div>
              </div>
              <div className="summary-courses"><span>Ders çevrelerin</span><div>{selectedCourses.map((course) => <strong key={course.id}>{course.code}</strong>)}</div></div>
              <div className="summary-note"><Icon name="sparkles" size={18}/><p>Akışın bu seçimlere göre kişiselleşecek. Profilini daha sonra istediğin zaman güncelleyebilirsin.</p></div>
            </div>
          )}
        </div>

        {error && <p className="onboarding-error" role="alert">{error}</p>}

        <footer className="onboarding-actions">
          <button className="onboarding-demo-link" type="button" onClick={onDemo}>Demo akışını aç</button>
          <div>
            {step > 1 && <button className="onboarding-back" type="button" onClick={() => { setStep((current) => current - 1); setError(""); }} disabled={saving}>Geri</button>}
            <button className="onboarding-next" type="button" disabled={nextDisabled} onClick={() => { if (step < 4) { setStep((current) => current + 1); setError(""); } else { void saveProfile(); } }}>
              {saving ? "Kaydediliyor…" : step === 4 ? "Üniyra’ya gir" : "Devam et"}
              {!saving && <Icon name="arrow" size={17}/>}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Akış");
  const [feedTab, setFeedTab] = useState("Senin için");
  const [draft, setDraft] = useState("");
  const [posts, setPosts] = useState(initialPosts);
  const [showSearch, setShowSearch] = useState(false);
  const [modal, setModal] = useState<ModalType | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [identityName, setIdentityName] = useState(demoProfile.displayName);
  const [profileReloadToken, setProfileReloadToken] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState("");

  const dateLabel = useMemo(() => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);
  const profileSubjects = useMemo(() => {
    if (!studentProfile) return subjects;
    const tones = ["coral", "violet", "blue", "amber", "mint", "rose"];
    const symbols = ["∑", "φ", "</>", "§", "Ψ", "△"];

    return studentProfile.courses.slice(0, 6).map((course, index) => ({
      code: course.code,
      label: course.name,
      tone: tones[index % tones.length],
      icon: symbols[index % symbols.length],
    }));
  }, [studentProfile]);

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
          setProfileState("auth-required");
          return;
        }
        if (!response.ok) {
          setProfileState("unavailable");
          return;
        }
        if (data.profile) {
          setStudentProfile(data.profile);
          setIsDemoMode(false);
          setProfileState("ready");
          return;
        }
        setProfileState("needs-onboarding");
      } catch {
        if (active) setProfileState("unavailable");
      }
    }

    void loadProfile();
    return () => { active = false; };
  }, [profileReloadToken]);

  useEffect(() => {
    if (profileState !== "ready" || isDemoMode) return;
    let active = true;

    async function loadPosts() {
      try {
        const response = await fetch("/api/posts", { headers: { accept: "application/json" } });
        const data = (await response.json()) as { posts?: Post[] };
        if (!active || !response.ok || !data.posts) return;
        setPosts(data.posts.length > 0 ? [...data.posts, ...initialPosts] : initialPosts);
      } catch {
        // The sample feed remains usable while a transient request is retried on reload.
      }
    }

    void loadPosts();
    return () => { active = false; };
  }, [profileState, isDemoMode]);

  if (profileState === "loading") return <ProfileBoot/>;

  if (profileState !== "ready" || !studentProfile) {
    return (
      <AcademicOnboarding
        identityName={identityName}
        initialProfile={studentProfile}
        state={profileState}
        onComplete={(profile) => { setStudentProfile(profile); setIdentityName(profile.displayName); setIsDemoMode(false); setProfileState("ready"); }}
        onDemo={() => { setStudentProfile(demoProfile); setIdentityName(demoProfile.displayName); setIsDemoMode(true); setProfileState("ready"); }}
        onRetry={() => { setProfileState("loading"); setProfileReloadToken((current) => current + 1); }}
      />
    );
  }

  const initials = getInitials(studentProfile.displayName);

  async function publishPost() {
    const clean = draft.trim();
    if (!clean || publishing) return;
    setComposerError("");

    const optimisticPost: Post = {
      id: Date.now(),
      name: studentProfile.displayName,
      initials,
      avatarClass: "avatar-violet",
      school: studentProfile.universityName,
      department: studentProfile.departmentName,
      time: "şimdi",
      course: studentProfile.courses[0]?.code ?? "GENEL",
      text: clean,
      likes: 0,
      comments: 0,
    };

    if (isDemoMode) {
      setPosts((current) => [optimisticPost, ...current]);
      setDraft("");
      return;
    }

    setPublishing(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: clean,
          courseId: studentProfile.courses[0]?.id ?? null,
        }),
      });
      const data = (await response.json()) as { post?: Post; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderin paylaşılamadı.");

      setPosts((current) => [data.post as Post, ...current]);
      setDraft("");
    } catch (publishError) {
      setComposerError(publishError instanceof Error ? publishError.message : "Gönderin paylaşılamadı.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="site-shell" id="top">
      <aside className="left-sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Ana menü">
          {navItems.map((item) => (
            <button className={activeNav === item.label ? "active" : ""} key={item.label} onClick={() => setActiveNav(item.label)} type="button">
              <span className="nav-icon"><Icon name={item.icon}/>{item.label === "Bildirimler" && <i />}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="primary-create" type="button" onClick={() => document.querySelector<HTMLTextAreaElement>("#post-draft")?.focus()}>
          <Icon name="plus" size={19}/> Oluştur
        </button>
        <div className="semester-card">
          <span className="semester-icon"><Icon name="calendar" size={19}/></span>
          <div><strong>Final haftası</strong><span>12 gün kaldı</span></div>
          <span className="semester-progress"><i /></span>
        </div>
        <button className="profile-mini" type="button" onClick={() => setActiveNav("Profil")}>
          <Avatar initials={initials} className="avatar-violet" />
          <span><strong>{studentProfile.displayName}</strong><small>@{studentProfile.handle}</small></span>
          <Icon name="more" size={18}/>
        </button>
      </aside>

      <section className="feed-column">
        <header className="mobile-header">
          <Logo />
          <div>
            <button className="icon-button" type="button" onClick={() => setShowSearch(!showSearch)} aria-label="Ara"><Icon name="search"/></button>
            <button className="icon-button notification-button" type="button" aria-label="Bildirimler"><Icon name="bell"/><i /></button>
          </div>
        </header>

        {showSearch && (
          <div className="mobile-search">
            <Icon name="search" size={18}/><input autoFocus placeholder="Ders, not veya öğrenci ara"/><button onClick={() => setShowSearch(false)} aria-label="Aramayı kapat"><Icon name="close" size={17}/></button>
          </div>
        )}

        {activeNav === "Akış" ? <>
        <div className="feed-welcome">
          <div>
            <span>{dateLabel}</span>
            <h1>Günaydın, {getFirstName(studentProfile.displayName)} <span>👋</span></h1>
            <p>{studentProfile.universityShortName} çevrende bugün neler oluyor?</p>
          </div>
          <div className="welcome-stat">
            <span><Icon name="sparkles" size={17}/></span>
            <div><strong>7 yeni not</strong><small>takip ettiğin derslerde</small></div>
          </div>
        </div>

        <section className="subject-section" aria-labelledby="subjects-title">
          <div className="section-heading">
            <div><span className="eyebrow">Ders çevrelerin</span><h2 id="subjects-title">Bugün ne çalışıyorsun?</h2></div>
            <button type="button">Tümünü gör <Icon name="arrow" size={15}/></button>
          </div>
          <div className="subject-row">
            {profileSubjects.map((subject, index) => (
              <button className="subject-item" type="button" key={subject.code}>
                <span className={`subject-ring subject-${subject.tone}`}><span>{subject.icon}</span>{index < 3 && <i>{index + 2}</i>}</span>
                <strong>{subject.code}</strong><small>{subject.label}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="composer-card" aria-label="Gönderi oluştur">
          <div className="composer-main">
            <Avatar initials={initials} className="avatar-violet" />
            <label className="sr-only" htmlFor="post-draft">Gönderi metni</label>
            <textarea id="post-draft" value={draft} maxLength={1200} onChange={(event) => { setDraft(event.target.value); setComposerError(""); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void publishPost(); }} placeholder="Kampüsünde ne paylaşmak istersin?" rows={1}/>
          </div>
          <div className="composer-tools">
            <div>
              <button type="button"><span className="tool-icon tool-image"><Icon name="image" size={18}/></span><span>Fotoğraf</span></button>
              <button type="button" onClick={() => setModal("note")}><span className="tool-icon tool-note"><Icon name="file" size={18}/></span><span>Not yükle</span></button>
              <button type="button" onClick={() => setModal("ai")}><span className="tool-icon tool-ai"><Icon name="sparkles" size={18}/></span><span>Yapay zekâ</span><i>Beta</i></button>
            </div>
            <button className="publish-button" type="button" disabled={!draft.trim() || publishing} onClick={() => void publishPost()}>{publishing ? "Paylaşılıyor…" : "Paylaş"}</button>
          </div>
          {composerError && <p className="composer-feedback" role="alert">{composerError}</p>}
        </section>

        <div className="feed-tabs" role="tablist" aria-label="Akış türü">
          {["Senin için", "Takip ettiklerin", "Kampüsüm"].map((tab) => (
            <button key={tab} className={feedTab === tab ? "active" : ""} onClick={() => setFeedTab(tab)} type="button" role="tab" aria-selected={feedTab === tab}>{tab}</button>
          ))}
          <button className="feed-filter" type="button" aria-label="Akış seçenekleri"><Icon name="more"/></button>
        </div>

        <div className="feed-list">{posts.map((post) => <FeedPost post={post} viewerInitials={initials} key={post.id}/>)}</div>
        </> : <SecondaryView name={activeNav} onUpload={() => setModal("note")} profile={studentProfile} onEditProfile={() => setProfileState("needs-onboarding")}/>}
      </section>

      <aside className="right-sidebar">
        <label className="search-box">
          <Icon name="search" size={18}/><span className="sr-only">Ara</span><input placeholder="Ders, not veya öğrenci ara"/><kbd>⌘ K</kbd>
        </label>

        <section className="side-card ai-card">
          <span className="ai-orb"><Icon name="sparkles" size={20}/></span>
          <div className="side-card-title"><span>Üniyra AI</span><i>Beta</i></div>
          <h2>Aradığın notu saniyeler içinde bul.</h2>
          <p>“Geçen yılın mikroekonomi final özetlerini bul” gibi yazman yeterli.</p>
          <button type="button" onClick={() => setModal("ai")}>AI ile ara <Icon name="arrow" size={16}/></button>
          <span className="ai-glow ai-glow-one"/><span className="ai-glow ai-glow-two"/>
        </section>

        <section className="side-card">
          <div className="side-heading"><h2>Gündemdeki notlar</h2><button type="button">Tümü</button></div>
          <div className="trending-list">
            <button type="button"><span className="trend-rank">01</span><span><small>FİZ 101</small><strong>Mekanik — Formül Kağıdı</strong><em>1,2 B görüntülenme</em></span><i className="mini-doc mini-doc-purple">F</i></button>
            <button type="button"><span className="trend-rank">02</span><span><small>HUK 204</small><strong>Borçlar Hukuku Özeti</strong><em>986 görüntülenme</em></span><i className="mini-doc mini-doc-amber">H</i></button>
            <button type="button"><span className="trend-rank">03</span><span><small>PSİ 202</small><strong>Gelişim Kuramları Tablosu</strong><em>741 görüntülenme</em></span><i className="mini-doc mini-doc-mint">P</i></button>
          </div>
        </section>

        <section className="side-card">
          <div className="side-heading"><h2>Tanıyor olabilirsin</h2><button type="button">Tümü</button></div>
          <div className="people-list">
            <div><Avatar initials="NB" className="avatar-amber"/><span><strong>Nazlı Bilgin</strong><small>Boğaziçi · Ekonomi</small></span><button type="button">Takip et</button></div>
            <div><Avatar initials="BA" className="avatar-blue"/><span><strong>Bora Akın</strong><small>YTÜ · Makine</small></span><button type="button">Takip et</button></div>
            <div><Avatar initials="İK" className="avatar-mint"/><span><strong>İrem Koç</strong><small>Marmara · İletişim</small></span><button type="button">Takip et</button></div>
          </div>
        </section>

        <footer className="side-footer">
          <div><a href="#top">Hakkımızda</a><a href="#top">Güvenlik</a><a href="#top">Yardım</a><a href="#top">Gizlilik</a></div>
          <span>© 2026 Üniyra · Öğrencilerle, öğrenciler için.</span>
        </footer>
      </aside>

      <nav className="mobile-nav" aria-label="Mobil menü">
        {navItems.slice(0, 5).map((item) => (
          <button className={activeNav === item.label ? "active" : ""} onClick={() => setActiveNav(item.label)} type="button" key={item.label} aria-label={item.label}>
            {item.label === "Notlar" ? <span className="mobile-create"><Icon name="plus" size={23}/></span> : <><Icon name={item.icon} size={21}/><small>{item.label === "Topluluklar" ? "Gruplar" : item.label}</small></>}
          </button>
        ))}
      </nav>
      {modal && <ProductModal type={modal} onClose={() => setModal(null)}/>} 
    </main>
  );
}
