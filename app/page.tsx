"use client";

import { useMemo, useState } from "react";

type IconName =
  | "home" | "compass" | "notes" | "users" | "bell" | "bookmark"
  | "search" | "plus" | "image" | "file" | "sparkles" | "more"
  | "heart" | "comment" | "share" | "check" | "calendar" | "arrow"
  | "close" | "send";

type Post = {
  id: number;
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
  attachment?: {
    title: string;
    meta: string;
    theme: string;
  };
  poll?: { label: string; value: number }[];
};

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

function FeedPost({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [voted, setVoted] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(false);

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
          <button className={`action-button ${liked ? "liked" : ""}`} onClick={() => setLiked(!liked)} type="button" aria-pressed={liked}>
            <Icon name="heart" size={19}/><span>{post.likes + (liked ? 1 : 0)}</span>
          </button>
          <button className="action-button" onClick={() => setCommenting(!commenting)} type="button" aria-expanded={commenting}>
            <Icon name="comment" size={19}/><span>{post.comments}</span>
          </button>
          <button className="action-button" type="button"><Icon name="share" size={19}/><span>Paylaş</span></button>
        </div>
        <button className={`action-button save-button ${saved ? "saved" : ""}`} onClick={() => setSaved(!saved)} type="button" aria-pressed={saved} aria-label="Gönderiyi kaydet">
          <Icon name="bookmark" size={19}/>
        </button>
      </footer>

      {commenting && (
        <div className="quick-comment">
          <Avatar initials="DÖ" className="avatar-violet" small />
          <label className="sr-only" htmlFor={`comment-${post.id}`}>Yorum yaz</label>
          <input id={`comment-${post.id}`} autoFocus placeholder="Bir yorum yaz..." />
          <button type="button" aria-label="Yorumu gönder"><Icon name="send" size={17}/></button>
        </div>
      )}
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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Akış");
  const [feedTab, setFeedTab] = useState("Senin için");
  const [draft, setDraft] = useState("");
  const [posts, setPosts] = useState(initialPosts);
  const [showSearch, setShowSearch] = useState(false);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);

  function publishPost() {
    const clean = draft.trim();
    if (!clean) return;
    setPosts([
      {
        id: Date.now(),
        name: "Deniz Öztürk",
        initials: "DÖ",
        avatarClass: "avatar-violet",
        school: "Boğaziçi Üniversitesi",
        department: "Endüstri Mühendisliği",
        time: "şimdi",
        course: "GENEL",
        text: clean,
        likes: 0,
        comments: 0,
      },
      ...posts,
    ]);
    setDraft("");
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
        <button className="profile-mini" type="button">
          <Avatar initials="DÖ" className="avatar-violet" />
          <span><strong>Deniz Öztürk</strong><small>@denizoz</small></span>
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

        <div className="feed-welcome">
          <div>
            <span>{dateLabel}</span>
            <h1>Günaydın, Deniz <span>👋</span></h1>
            <p>Kampüsünde bugün neler oluyor?</p>
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
            {subjects.map((subject, index) => (
              <button className="subject-item" type="button" key={subject.code}>
                <span className={`subject-ring subject-${subject.tone}`}><span>{subject.icon}</span>{index < 3 && <i>{index + 2}</i>}</span>
                <strong>{subject.code}</strong><small>{subject.label}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="composer-card" aria-label="Gönderi oluştur">
          <div className="composer-main">
            <Avatar initials="DÖ" className="avatar-violet" />
            <label className="sr-only" htmlFor="post-draft">Gönderi metni</label>
            <textarea id="post-draft" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") publishPost(); }} placeholder="Kampüsünde ne paylaşmak istersin?" rows={1}/>
          </div>
          <div className="composer-tools">
            <div>
              <button type="button"><span className="tool-icon tool-image"><Icon name="image" size={18}/></span><span>Fotoğraf</span></button>
              <button type="button"><span className="tool-icon tool-note"><Icon name="file" size={18}/></span><span>Not yükle</span></button>
              <button type="button"><span className="tool-icon tool-ai"><Icon name="sparkles" size={18}/></span><span>Yapay zekâ</span><i>Beta</i></button>
            </div>
            <button className="publish-button" type="button" disabled={!draft.trim()} onClick={publishPost}>Paylaş</button>
          </div>
        </section>

        <div className="feed-tabs" role="tablist" aria-label="Akış türü">
          {["Senin için", "Takip ettiklerin", "Kampüsüm"].map((tab) => (
            <button key={tab} className={feedTab === tab ? "active" : ""} onClick={() => setFeedTab(tab)} type="button" role="tab" aria-selected={feedTab === tab}>{tab}</button>
          ))}
          <button className="feed-filter" type="button" aria-label="Akış seçenekleri"><Icon name="more"/></button>
        </div>

        <div className="feed-list">{posts.map((post) => <FeedPost post={post} key={post.id}/>)}</div>
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
          <button type="button">AI ile ara <Icon name="arrow" size={16}/></button>
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
    </main>
  );
}
