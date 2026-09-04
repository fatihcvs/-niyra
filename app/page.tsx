"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getUniversityById,
  universities,
  type AcademicCourse,
} from "../lib/academic-data";
import { curatedNotes, featuredCuratedNotes, getCuratedSources } from "../lib/curated-notes";
import {
  CommunitiesWorkspace,
  NotesWorkspace,
  NotificationsWorkspace,
  ProfileSafetyMenu,
  SafetyWorkspace,
  UnifiedSearchResults,
} from "./product-features";
import { CampusPulseWorkspace } from "./campus-pulse";
import { SocialMatchWorkspace } from "./social-match";
import { CampusGuideWorkspace } from "./campus-guide";
import { CampusMarketWorkspace } from "./campus-market";
import { LibraryOccupancyWorkspace } from "./library-occupancy";

type IconName =
  | "home" | "compass" | "notes" | "users" | "bell" | "bookmark"
  | "search" | "plus" | "image" | "file" | "sparkles" | "more"
  | "heart" | "comment" | "share" | "check" | "calendar" | "arrow"
  | "close" | "send" | "edit" | "trash";

type Post = {
  id: number | string;
  authorId?: string;
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
  edited?: boolean;
  attachment?: {
    title: string;
    meta: string;
    theme: string;
  };
  poll?: { label: string; value: number }[];
};

type PostComment = {
  id: string;
  authorId?: string;
  authorName: string;
  initials: string;
  content: string;
  time: string;
  edited?: boolean;
  own?: boolean;
  pending?: boolean;
};

type StudentProfile = {
  publicId: string;
  displayName: string;
  handle: string;
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
  publicId: string;
  displayName: string;
  handle: string;
  initials: string;
  avatarClass: string;
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

function formatCount(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
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
  { label: "Bildirimler", icon: "bell" },
  { label: "Kaydedilenler", icon: "bookmark" },
  { label: "Güvenlik", icon: "check" },
];

const subjects = [
  { code: "MAT", label: "Matematik", tone: "coral", icon: "∑" },
  { code: "FİZ", label: "Fizik", tone: "violet", icon: "φ" },
  { code: "YAZ", label: "Yazılım", tone: "blue", icon: "</>" },
  { code: "HUK", label: "Hukuk", tone: "amber", icon: "§" },
  { code: "PSİ", label: "Psikoloji", tone: "mint", icon: "Ψ" },
  { code: "MİM", label: "Mimarlık", tone: "rose", icon: "△" },
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
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
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

function FeedPost({
  post,
  viewerInitials = "DÖ",
  viewerId,
  onPostUpdated,
  onPostDeleted,
  onSavedChange,
}: {
  post: Post;
  viewerInitials?: string;
  viewerId?: string;
  onPostUpdated?: (id: number | string, text: string) => void;
  onPostDeleted?: (id: number | string) => void;
  onSavedChange?: (post: Post, saved: boolean) => void;
}) {
  const [liked, setLiked] = useState(post.liked ?? false);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [voted, setVoted] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentItems, setCommentItems] = useState<PostComment[]>([]);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"like" | "save" | "comment" | null>(null);
  const [interactionError, setInteractionError] = useState("");
  const [currentText, setCurrentText] = useState(post.text);
  const [editText, setEditText] = useState(post.text);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(post.edited ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyMutation, setBusyMutation] = useState<"edit" | "delete" | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("misinformation");
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState("");
  const isPersistentPost = typeof post.id === "string";
  const isOwnPost = Boolean(
    viewerId && post.authorId === viewerId && onPostUpdated && onPostDeleted,
  );

  async function runAction(type: "like" | "save" | "comment", content?: string) {
    setInteractionError("");
    setBusyAction(type);

    try {
      const response = await fetch("/api/post-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: post.id, type, content }),
      });
      const data = (await response.json()) as {
        active?: boolean;
        count?: number;
        comment?: PostComment;
        error?: string;
      };
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
    const previousLiked = liked;
    const previousCount = likeCount;
    const optimisticLiked = !previousLiked;
    setLiked(optimisticLiked);
    setLikeCount(Math.max(0, previousCount + (optimisticLiked ? 1 : -1)));

    if (!isPersistentPost) {
      return;
    }

    const result = await runAction("like");
    if (!result) {
      setLiked(previousLiked);
      setLikeCount(previousCount);
      return;
    }
    setLiked(Boolean(result.active));
    if (typeof result.count === "number") setLikeCount(result.count);
  }

  async function toggleSave() {
    if (busyAction) return;
    const previousSaved = saved;
    const optimisticSaved = !previousSaved;
    setSaved(optimisticSaved);
    onSavedChange?.({ ...post, text: currentText, edited }, optimisticSaved);

    if (!isPersistentPost) {
      return;
    }

    const result = await runAction("save");
    if (!result) {
      setSaved(previousSaved);
      onSavedChange?.({ ...post, text: currentText, edited }, previousSaved);
      return;
    }
    const active = Boolean(result.active);
    setSaved(active);
    if (active !== optimisticSaved) onSavedChange?.({ ...post, text: currentText, edited }, active);
  }

  async function loadComments(force = false) {
    if (!force && commentsState !== "idle") return;
    if (!isPersistentPost) {
      setCommentItems([]);
      setCommentsState("ready");
      return;
    }

    setCommentsState("loading");
    try {
      const response = await fetch(`/api/comments?postId=${encodeURIComponent(String(post.id))}`, {
        headers: { accept: "application/json" },
      });
      const data = (await response.json()) as { comments?: PostComment[]; hasMore?: boolean; error?: string };
      if (!response.ok || !data.comments) throw new Error(data.error ?? "Yorumlar getirilemedi.");
      setCommentItems(data.comments);
      setHasMoreComments(Boolean(data.hasMore));
      setCommentsState("ready");
    } catch (commentsError) {
      setCommentsState("error");
      setInteractionError(commentsError instanceof Error ? commentsError.message : "Yorumlar getirilemedi.");
    }
  }

  function toggleComments() {
    const nextOpen = !commenting;
    setCommenting(nextOpen);
    if (nextOpen) void loadComments();
  }

  async function sendComment() {
    const clean = commentText.trim();
    if (!clean || busyAction) return;
    const optimisticId = `pending-${Date.now()}`;
    const optimisticComment: PostComment = {
      id: optimisticId,
      authorId: viewerId,
      authorName: "Sen",
      initials: viewerInitials,
      content: clean,
      time: "şimdi",
      own: true,
      pending: isPersistentPost,
    };
    setCommentItems((current) => [...current, optimisticComment]);
    setCommentCount((count) => count + 1);
    setCommentsState("ready");
    setCommentText("");

    if (!isPersistentPost) {
      return;
    }

    const result = await runAction("comment", clean);
    if (!result || !result.comment) {
      setCommentItems((current) => current.filter((comment) => comment.id !== optimisticId));
      setCommentCount((count) => Math.max(0, count - 1));
      setCommentText(clean);
      return;
    }
    if (typeof result.count === "number") setCommentCount(result.count);
    setCommentItems((current) => current.map((comment) => comment.id === optimisticId ? result.comment! : comment));
  }

  async function deleteComment(comment: PostComment) {
    if (deletingCommentId || !comment.own) return;
    const previousItems = commentItems;
    const previousCount = commentCount;
    setDeletingCommentId(comment.id);
    setInteractionError("");
    setCommentItems((current) => current.filter((item) => item.id !== comment.id));
    setCommentCount((count) => Math.max(0, count - 1));

    if (!isPersistentPost) {
      setDeletingCommentId(null);
      return;
    }

    try {
      const response = await fetch("/api/comments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: comment.id }),
      });
      const data = (await response.json()) as { deleted?: boolean; count?: number; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "Yorum silinemedi.");
      if (typeof data.count === "number") setCommentCount(data.count);
    } catch (deleteError) {
      setCommentItems(previousItems);
      setCommentCount(previousCount);
      setInteractionError(deleteError instanceof Error ? deleteError.message : "Yorum silinemedi.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function sharePost() {
    if (!isPersistentPost) return;
    const postUrl = new URL(window.location.href);
    postUrl.searchParams.delete("profile");
    postUrl.searchParams.set("post", String(post.id));
    const shareUrl = postUrl.toString();

    try {
      if (navigator.share) {
        await navigator.share({ title: `${post.name} · Üniyra`, text: currentText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 1800);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      window.prompt("Gönderi bağlantısını kopyala", shareUrl);
    }
  }

  async function saveEdit() {
    const clean = editText.trim();
    if (!clean || clean.length > 1200 || busyMutation) return;
    setInteractionError("");

    if (!isPersistentPost) {
      setCurrentText(clean);
      setEdited(true);
      setEditing(false);
      onPostUpdated?.(post.id, clean);
      return;
    }

    setBusyMutation("edit");
    try {
      const response = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: post.id, content: clean }),
      });
      const data = (await response.json()) as { post?: { id: string; text: string }; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderi güncellenemedi.");
      setCurrentText(data.post.text);
      setEditText(data.post.text);
      setEdited(true);
      setEditing(false);
      onPostUpdated?.(post.id, data.post.text);
    } catch (editError) {
      setInteractionError(editError instanceof Error ? editError.message : "Gönderi güncellenemedi.");
    } finally {
      setBusyMutation(null);
    }
  }

  async function deletePost() {
    if (busyMutation || !window.confirm("Bu gönderiyi silmek istediğine emin misin? Bu işlem akıştan kaldırır.")) return;
    setInteractionError("");

    if (!isPersistentPost) {
      onPostDeleted?.(post.id);
      return;
    }

    setBusyMutation("delete");
    try {
      const response = await fetch("/api/posts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      const data = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? "Gönderi silinemedi.");
      onPostDeleted?.(post.id);
    } catch (deleteError) {
      setInteractionError(deleteError instanceof Error ? deleteError.message : "Gönderi silinemedi.");
    } finally {
      setBusyMutation(null);
      setMenuOpen(false);
    }
  }

  async function reportPost() {
    if (!isPersistentPost || reportState === "Gönderiliyor…") return;
    setReportState("Gönderiliyor…");
    try {
      const response = await fetch("/api/safety", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "report", entityType: "post", entityId: post.id, reason: reportReason, details: reportDetails }),
      });
      const data = (await response.json()) as { report?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Şikâyet kaydedilemedi.");
      setReportState("Şikâyetin inceleme kuyruğuna alındı.");
      setReportDetails("");
    } catch (reportError) {
      setReportState(reportError instanceof Error ? reportError.message : "Şikâyet kaydedilemedi.");
    }
  }

  return (
    <article className="post-card" id={`post-${post.id}`}>
      <header className="post-header">
        <Avatar initials={post.initials} className={post.avatarClass} />
        <div className="post-person">
          <div className="post-name-line">
            <strong>{post.name}</strong>
          </div>
          <span>{post.school} · {post.department}</span>
          <span className="post-time">{post.time === "şimdi" ? post.time : `${post.time} önce`}</span>
        </div>
        {isPersistentPost && <div className="post-menu-wrap"><button className="icon-button post-menu" type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="Gönderi seçenekleri" aria-expanded={menuOpen}><Icon name="more"/></button>{menuOpen && <div className="post-owner-menu" role="menu">{isOwnPost ? <><button type="button" role="menuitem" onClick={() => { setEditText(currentText); setEditing(true); setMenuOpen(false); }}><Icon name="edit" size={15}/> Düzenle</button><button className="danger" type="button" role="menuitem" onClick={() => void deletePost()} disabled={busyMutation === "delete"}><Icon name="trash" size={15}/> {busyMutation === "delete" ? "Siliniyor…" : "Sil"}</button></> : <button className="danger" type="button" role="menuitem" onClick={() => { setReportOpen(true); setMenuOpen(false); }}><Icon name="more" size={15}/> Şikâyet et</button>}</div>}</div>}
      </header>

      <div className="post-body">
        <button className="course-tag" type="button">{post.course}</button>
        {editing ? <div className="post-edit-box"><textarea aria-label="Gönderi metnini düzenle" autoFocus maxLength={1200} value={editText} onChange={(event) => setEditText(event.target.value)} rows={4}/><div><span>{editText.trim().length}/1200</span><button type="button" onClick={() => { setEditing(false); setEditText(currentText); }}>Vazgeç</button><button type="button" onClick={() => void saveEdit()} disabled={!editText.trim() || busyMutation === "edit"}>{busyMutation === "edit" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div></div> : <p>{currentText}{edited && <small className="post-edited"> · düzenlendi</small>}</p>}
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
          <button className="action-button" onClick={toggleComments} type="button" aria-expanded={commenting} aria-controls={`comments-${post.id}`}>
            <Icon name="comment" size={19}/><span>{commentCount}</span>
          </button>
          <button className="action-button" type="button" onClick={() => void sharePost()} disabled={!isPersistentPost}><Icon name={shareState === "copied" ? "check" : "share"} size={19}/><span>{shareState === "copied" ? "Kopyalandı" : "Paylaş"}</span></button>
        </div>
        <button className={`action-button save-button ${saved ? "saved" : ""}`} onClick={() => void toggleSave()} type="button" aria-pressed={saved} aria-label="Gönderiyi kaydet" disabled={busyAction === "save"}>
          <Icon name="bookmark" size={19}/>
        </button>
      </footer>

      {reportOpen && <div className="feature-overlay"><section className="feature-dialog post-report-dialog" role="dialog" aria-modal="true" aria-labelledby={`report-${post.id}`}><header><div><span>GÜVENLİK MERKEZİ</span><h2 id={`report-${post.id}`}>Gönderiyi şikâyet et</h2></div><button type="button" onClick={() => setReportOpen(false)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={(event) => { event.preventDefault(); void reportPost(); }}><label>Neden<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="misinformation">Yanıltıcı akademik içerik</option><option value="spam">Spam</option><option value="harassment">Taciz veya zorbalık</option><option value="privacy">Kişisel veri ihlali</option><option value="copyright">Telif ihlali</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label>{reportState && <p className="feature-feedback-state" role="status">{reportState}</p>}<footer><button type="button" onClick={() => setReportOpen(false)}>Kapat</button><button className="feature-danger" type="submit">Şikâyeti gönder</button></footer></form></section></div>}

      {commenting && (
        <section className="comment-thread" id={`comments-${post.id}`} aria-label="Gönderi yorumları">
          {commentsState === "loading" && <p className="comments-status" aria-live="polite">Yorumlar getiriliyor…</p>}
          {commentsState === "error" && <button className="comments-retry" type="button" onClick={() => { setInteractionError(""); void loadComments(true); }}>Yorumları yeniden dene</button>}
          {commentsState === "ready" && commentItems.length === 0 && <p className="comments-status">İlk yorumu sen bırak.</p>}
          {commentItems.length > 0 && <div className="comment-list">
            {hasMoreComments && <p className="comments-status">En son 20 yorum gösteriliyor.</p>}
            {commentItems.map((comment) => (
              <article className={comment.pending ? "pending" : ""} key={comment.id}>
                <Avatar initials={comment.initials} className="avatar-violet" small />
                <div><strong>{comment.authorName}</strong><span>{comment.time === "şimdi" ? comment.time : `${comment.time} önce`}</span><p>{comment.content}{comment.edited && <small> · düzenlendi</small>}</p></div>
                {comment.own && <button type="button" onClick={() => void deleteComment(comment)} disabled={comment.pending || deletingCommentId === comment.id} aria-label="Yorumu sil"><Icon name="trash" size={14}/></button>}
              </article>
            ))}
          </div>}
          <div className="quick-comment">
            <Avatar initials={viewerInitials} className="avatar-violet" small />
            <label className="sr-only" htmlFor={`comment-${post.id}`}>Yorum yaz</label>
            <input id={`comment-${post.id}`} autoFocus maxLength={500} value={commentText} disabled={commentsState === "loading"} onChange={(event) => { setCommentText(event.target.value); setInteractionError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendComment(); } }} placeholder="Bir yorum yaz..." />
            <button type="button" onClick={() => void sendComment()} disabled={!commentText.trim() || commentsState === "loading" || busyAction === "comment"} aria-label="Yorumu gönder"><Icon name="send" size={17}/></button>
          </div>
        </section>
      )}
      {interactionError && <p className="interaction-feedback" role="alert">{interactionError}</p>}
    </article>
  );
}

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="Üniyra ana sayfa">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">üniyra</span>
    </a>
  );
}

const noteTones = ["purple", "blue", "amber", "mint"];
const noteSymbols: Record<string, string> = { "limit-sureklilik": "lim", "algoritmik-dusunme": "</>", "vektor-kinematik": "v⃗", stp: "STP", "hukuki-kaynak-okuma": "§", "bellek-sistemleri": "Ψ", "turkce-yazim": "Aa", "anatomi-yon-duzlem": "↔" };
const libraryNotes = featuredCuratedNotes.slice(0, 8).map((note, index) => ({
  code: note.courseCodes[0],
  title: note.title,
  author: "Üniyra Editoryal",
  meta: `${getCuratedSources(note)[0].publisher} · ${note.readingMinutes} dk`,
  tone: noteTones[index % noteTones.length],
  symbol: noteSymbols[note.id] ?? "✓",
  saved: index < 2,
}));

function ViewTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="view-title">
      <div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function DiscoverView({
  profile,
  people,
  peopleStatus,
  query,
  followPendingId,
  onOpenPerson,
  onQueryChange,
  onToggleFollow,
  onNavigate,
}: {
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
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow={`${profile.universityShortName} KEŞFET`} title="Kampüsünü keşfet" description={`${profile.universityName} içindeki öğrenciler, ders çevreleri ve topluluklarla buluş.`} />
      <div className="discover-search"><Icon name="search" size={20}/><input aria-label={`${profile.universityShortName} öğrencisi ara`} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Ad, kullanıcı adı, fakülte veya bölüm ara"/>{query ? <button type="button" onClick={() => onQueryChange("")} aria-label="Aramayı temizle"><Icon name="close" size={16}/></button> : <kbd>⌘ K</kbd>}</div>
      <UnifiedSearchResults query={query} onNavigate={onNavigate}/>
      <div className="category-pills">
        {["Sana özel", "Gündem", "Dersler", "Kampüsler", "Topluluklar"].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} type="button" key={item}>{item}</button>)}
      </div>

      <section className="discover-hero">
        <div className="discover-hero-copy"><span><Icon name="sparkles" size={15}/> AKADEMİK ÇEVREN</span><h2>Derslerini<br/>birlikte büyüt.</h2><p>Aynı üniversitedeki gerçek profilleri bul, ders çevrelerine ve paylaşımlara katıl.</p><button type="button" onClick={() => onNavigate("Topluluklar")}>Toplulukları keşfet <Icon name="arrow" size={17}/></button></div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit-one">∑</span><span className="orbit-two">Ψ</span><span className="orbit-three">F</span><i/><strong>{profile.universityShortName}</strong><small>üniversite çevresi</small></div>
        <small className="discover-visual-label">Temsili kampüs illüstrasyonu</small>
      </section>

      <div className="section-heading workspace-heading"><div><span className="eyebrow">ÖĞRENCİ AĞI</span><h2>{query ? `“${query}” için sonuçlar` : "Akademik çevreni genişlet"}</h2></div><span className="section-campus-label">{profile.universityShortName}</span></div>
      <div className="campus-people-grid">
        {peopleStatus === "loading" && <p className="campus-people-state">Bölümüne yakın öğrenciler getiriliyor…</p>}
        {peopleStatus === "empty" && <p className="campus-people-state">{query ? "Bu aramayla eşleşen bir kampüs öğrencisi bulunamadı." : "Henüz aynı üniversiteden başka bir profil yok. İlk gönderinle öğrenci ağını başlatabilirsin."}</p>}
        {peopleStatus === "error" && <p className="campus-people-state">Öğrenci ağı şu anda getirilemedi. Biraz sonra yeniden deneyebilirsin.</p>}
        {peopleStatus === "ready" && people.slice(0, 6).map((person) => (
          <article className="campus-person-card" key={person.publicId}>
            <button className="campus-person-main" type="button" onClick={() => onOpenPerson(person)}>
              <Avatar initials={person.initials} className={person.avatarClass}/>
              <span><strong>{person.displayName}</strong><small>{person.facultyShortName} · {person.departmentName}</small><em>{person.classYear}. sınıf · {formatCount(person.followerCount)} takipçi</em></span>
              <Icon name="arrow" size={15}/>
            </button>
            <button className={person.isFollowing ? "following" : ""} type="button" disabled={followPendingId === person.publicId} onClick={() => onToggleFollow(person.publicId)}>{followPendingId === person.publicId ? "Bekle…" : person.isFollowing ? "Takiptesin" : "Takip et"}</button>
          </article>
        ))}
      </div>

      <section className="discover-empty-product"><span><Icon name="users" size={22}/></span><div><strong>Topluluklar gerçek üyelerle oluşur</strong><p>Üniversitene ait toplulukları açarak güncel üye ve gönderi sayılarını görebilirsin.</p></div><button type="button" onClick={() => onNavigate("Topluluklar")}>Topluluklara git <Icon name="arrow" size={15}/></button></section>
    </div>
  );
}

function SavedView({
  posts,
  loading,
  error,
  viewerInitials,
  viewerId,
  universityShortName,
  onSavedChange,
}: {
  posts: Post[];
  loading: boolean;
  error: string;
  viewerInitials: string;
  viewerId: string;
  universityShortName: string;
  onSavedChange: (post: Post, saved: boolean) => void;
}) {
  return (
    <div className="workspace-view">
      <ViewTitle eyebrow="KAYDEDİLENLER" title="Sonra bakacakların" description="Kaydettiğin gönderiler hesabında kalır ve burada bir araya gelir." />
      <section className="saved-summary"><div><span><Icon name="bookmark" size={22}/></span><div><strong>{posts.length} gönderi</strong><p>Kalıcı olarak kaydettiğin {universityShortName} paylaşımları</p></div></div></section>
      <div className="section-heading workspace-heading"><div><span className="eyebrow">KAYDEDİLEN GÖNDERİLER</span><h2>Akademik arşivin</h2></div></div>
      <div className="feed-list">
        {loading ? <div className="feed-empty feed-loading" aria-live="polite"><span className="profile-boot-line"><i/></span><strong>Kayıtların getiriliyor…</strong></div>
          : error ? <div className="feed-empty"><span><Icon name="bookmark" size={22}/></span><strong>Kayıtlarına ulaşılamadı</strong><p>{error}</p></div>
            : posts.length > 0 ? posts.map((post) => <FeedPost post={post} viewerInitials={viewerInitials} viewerId={viewerId} onSavedChange={onSavedChange} key={post.id}/>)
              : <div className="feed-empty"><span><Icon name="bookmark" size={22}/></span><strong>Henüz kaydettiğin gönderi yok</strong><p>Akışta yer imine dokunduğun paylaşımlar burada görünecek.</p></div>}
      </div>
    </div>
  );
}

function ProfileView({ profile, posts, shareable, onEdit, onSignOut, onPostUpdated, onPostDeleted }: { profile: StudentProfile; posts: Post[]; shareable: boolean; onEdit: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void }) {
  const initials = getInitials(profile.displayName);
  const profilePosts = posts.filter((post) => post.authorId === profile.publicId);
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
      <section className="profile-hero"><div className="profile-cover"><span>∑</span><span>Ψ</span><span>λ</span><i/></div><div className="profile-main"><Avatar initials={initials} className="avatar-violet"/><div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div><div className="profile-own-actions">{shareable && <button className="profile-own-share" type="button" onClick={() => void shareOwnProfile()}><Icon name={copied ? "check" : "share"} size={14}/>{copied ? "Kopyalandı" : "Paylaş"}</button>}<button type="button" onClick={onEdit}>Profili düzenle</button><button type="button" onClick={onSignOut}>Çıkış yap</button></div></div><p className="profile-bio">{profile.universityShortName} ders çevrelerin, gönderilerin ve bağlantıların burada bir araya gelir.</p><div className="profile-stats"><strong>{formatCount(profile.postCount)}<span>Gönderi</span></strong><strong>{formatCount(profile.followerCount)}<span>Takipçi</span></strong><strong>{formatCount(profile.followingCount)}<span>Takip</span></strong><strong>{profile.courses.length}<span>Ders çevresi</span></strong></div></section>
      <div className="profile-tabs"><button className="active" type="button">Gönderiler</button><button type="button">Notlarım</button><button type="button">Topluluklar</button><button type="button">Hakkımda</button></div>
      {profilePosts.length > 0 ? profilePosts.map((post) => <FeedPost viewerInitials={initials} viewerId={profile.publicId} post={post} onPostUpdated={onPostUpdated} onPostDeleted={onPostDeleted} key={post.id}/>) : <div className="profile-empty-posts"><span><Icon name="send" size={20}/></span><strong>Henüz gönderin yok</strong><p>İlk kampüs paylaşımın burada görünecek.</p></div>}
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
}: {
  profile: PublicProfile | null;
  loading: boolean;
  shareable: boolean;
  viewerInitials: string;
  viewerId: string;
  followPending: boolean;
  onBack: () => void;
  onToggleFollow: (publicId: string) => void;
}) {
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
      <div className="public-profile-toolbar"><button className="public-profile-back" type="button" onClick={onBack}><Icon name="arrow" size={15}/> Öğrenci ağına dön</button><div>{shareable && <button className="public-profile-share" type="button" onClick={() => void shareProfile()}><Icon name={copied ? "check" : "share"} size={15}/>{copied ? "Bağlantı kopyalandı" : "Profili paylaş"}</button>}{shareable && <ProfileSafetyMenu targetId={profile.publicId} targetName={profile.displayName}/>}</div></div>
      <section className="profile-hero">
        <div className="profile-cover"><span>∑</span><span>Ψ</span><span>λ</span><i/></div>
        <div className="profile-main">
          <Avatar initials={profile.initials} className={profile.avatarClass}/>
          <div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div>
          <button className={profile.isFollowing ? "profile-following" : ""} type="button" disabled={followPending} onClick={() => onToggleFollow(profile.publicId)}>{followPending ? "Bekle…" : profile.isFollowing ? "Takiptesin" : "Takip et"}</button>
        </div>
        <p className="profile-bio">{profile.universityShortName} içindeki ders çevrelerinde öğreniyor ve paylaşıyor.</p>
        <div className="profile-stats"><strong>{formatCount(profile.postCount)}<span>Gönderi</span></strong><strong>{formatCount(profile.followerCount)}<span>Takipçi</span></strong><strong>{formatCount(profile.followingCount)}<span>Takip</span></strong><strong>{profile.courses.length}<span>Ders çevresi</span></strong></div>
      </section>
      <div className="profile-tabs"><button className="active" type="button">Gönderiler</button><button type="button">Ders çevreleri</button><button type="button">Hakkında</button></div>
      {profile.posts.length > 0 ? profile.posts.map((post) => <FeedPost post={post} viewerInitials={viewerInitials} viewerId={viewerId} key={post.id}/>) : <div className="profile-empty-posts"><span><Icon name="send" size={20}/></span><strong>Henüz gönderi yok</strong><p>{profile.displayName} ilk paylaşımını yaptığında burada görünecek.</p></div>}
    </div>
  );
}

function SecondaryView({ name, profile, posts, people, peopleStatus, peopleQuery, shareableProfile, followPendingId, savedPosts, savedPostsLoading, savedPostsError, onOpenPerson, onQueryPeople, onToggleFollow, onNavigate, onEditProfile, onSignOut, onPostUpdated, onPostDeleted, onSavedChange }: { name: string; profile: StudentProfile; posts: Post[]; people: CampusPerson[]; peopleStatus: "loading" | "ready" | "empty" | "error"; peopleQuery: string; shareableProfile: boolean; followPendingId: string | null; savedPosts: Post[]; savedPostsLoading: boolean; savedPostsError: string; onOpenPerson: (person: CampusPerson) => void; onQueryPeople: (query: string) => void; onToggleFollow: (publicId: string) => void; onNavigate: (name: string) => void; onEditProfile: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onSavedChange: (post: Post, saved: boolean) => void }) {
  if (name === "Keşfet") return <DiscoverView profile={profile} people={people} peopleStatus={peopleStatus} query={peopleQuery} followPendingId={followPendingId} onOpenPerson={onOpenPerson} onQueryChange={onQueryPeople} onToggleFollow={onToggleFollow} onNavigate={onNavigate}/>;
  if (name === "Kampüs Anlık") return <CampusPulseWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Eşleş") return <SocialMatchWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kampüs") return <CampusGuideWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kütüphane") return <LibraryOccupancyWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Pazar") return <CampusMarketWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Notlar") return <NotesWorkspace courses={profile.courses}/>;
  if (name === "Topluluklar") return <CommunitiesWorkspace courses={profile.courses}/>;
  if (name === "Bildirimler") return <NotificationsWorkspace/>;
  if (name === "Güvenlik") return <SafetyWorkspace/>;
  if (name === "Kaydedilenler") return <SavedView posts={savedPosts} loading={savedPostsLoading} error={savedPostsError} viewerInitials={getInitials(profile.displayName)} viewerId={profile.publicId} universityShortName={profile.universityShortName} onSavedChange={onSavedChange}/>;
  if (name === "Profil") return <ProfileView profile={profile} posts={posts} shareable={shareableProfile} onEdit={onEditProfile} onSignOut={onSignOut} onPostUpdated={onPostUpdated} onPostDeleted={onPostDeleted}/>;
  return <DiscoverView profile={profile} people={people} peopleStatus={peopleStatus} query={peopleQuery} followPendingId={followPendingId} onOpenPerson={onOpenPerson} onQueryChange={onQueryPeople} onToggleFollow={onToggleFollow} onNavigate={onNavigate}/>;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (mode === "register" && password !== confirmation) {
      setError("Parolalar birbiriyle aynı olmalı.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: mode === "register" ? form.get("displayName") : undefined,
          email: form.get("email"),
          password,
        }),
      });
      const data = await response.json() as { user?: { displayName?: string }; error?: string };
      if (!response.ok || !data.user?.displayName) throw new Error(data.error ?? "İşlem tamamlanamadı.");
      onAuthenticated(data.user.displayName);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><Logo/><span>MVP v1.6</span></div>
        <div className="auth-copy"><span>ÖĞRENCİ AĞIN</span><h1 id="auth-title">{mode === "register" ? "Üniyra hesabını oluştur." : "Kampüsüne geri dön."}</h1><p>{mode === "register" ? "Hesabın anında açılır. Davet kodu veya yönetici onayı gerekmez." : "E-posta adresin ve parolanla kaldığın yerden devam et."}</p></div>
        <div className="auth-tabs" role="tablist" aria-label="Hesap işlemi">
          <button className={mode === "register" ? "active" : ""} type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Kayıt ol</button>
          <button className={mode === "login" ? "active" : ""} type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>Giriş yap</button>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === "register" && <label><span>Adın ve soyadın</span><input name="displayName" autoComplete="name" minLength={2} maxLength={60} required placeholder="Deniz Öztürk"/></label>}
          <label><span>E-posta adresin</span><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="ogrenci@universite.edu.tr"/></label>
          <label><span>Parolan</span><input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={10} maxLength={128} required placeholder="En az 10 karakter"/></label>
          {mode === "register" && <label><span>Parolanı tekrar yaz</span><input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required/></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "İşlem tamamlanıyor…" : mode === "register" ? "Hesabımı oluştur" : "Giriş yap"}<Icon name="arrow" size={17}/></button>
        </form>
        <p className="auth-terms">Devam ederek <a href="/legal#terms">Kullanım Koşulları</a> ve <a href="/legal#privacy">Gizlilik Metni</a>&apos;ni kabul etmiş olursun.</p>
      </section>
      <aside className="auth-aside" aria-hidden="true"><span>∑</span><span>λ</span><div><small>TÜRKİYE + KIBRIS</small><strong>Derslerini, notlarını ve kampüs çevreni tek yerde bul.</strong><p>Gerçek hesabınla başlayan, sana ait akademik alan.</p></div></aside>
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

const degreeLabels: Record<CatalogProgram["degreeLevel"], string> = {
  associate: "Önlisans",
  bachelor: "Lisans",
  "integrated-master": "Bütünleşik yüksek lisans",
  master: "Yüksek lisans",
  doctorate: "Doktora",
};

function AcademicOnboarding({
  identityName,
  initialProfile,
  state,
  onComplete,
  onRetry,
}: {
  identityName: string;
  initialProfile: StudentProfile | null;
  state: Extract<ProfileState, "needs-onboarding" | "unavailable">;
  onComplete: (profile: StudentProfile) => void;
  onRetry: () => void;
}) {
  const [step, setStep] = useState(1);
  const [universityId, setUniversityId] = useState(initialProfile?.universityId ?? "omu");
  const [universityQuery, setUniversityQuery] = useState("");
  const [facultyId, setFacultyId] = useState(initialProfile?.facultyId ?? "");
  const [departmentId, setDepartmentId] = useState(initialProfile?.departmentId ?? "");
  const [customFacultyName, setCustomFacultyName] = useState(initialProfile?.facultyName ?? "");
  const [customDepartmentName, setCustomDepartmentName] = useState(initialProfile?.departmentName ?? "");
  const [classYear, setClassYear] = useState(initialProfile?.classYear ?? 1);
  const [customCourses, setCustomCourses] = useState<Array<{ code: string; name: string }>>(
    initialProfile?.courses.length
      ? initialProfile.courses.map((course) => ({ code: course.code, name: course.name }))
      : [{ code: "", name: "" }, { code: "", name: "" }, { code: "", name: "" }],
  );
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [manualAcademic, setManualAcademic] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
  const firstName = getFirstName(identityName);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/academic-catalog?universityId=${encodeURIComponent(universityId)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as CatalogPayload;
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
  }, [universityId]);

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
    setProgramQuery("");
    setError("");
  }

  function chooseUniversity(nextUniversityId: string) {
    setUniversityId(nextUniversityId);
    setCatalog(null);
    setCatalogLoading(true);
    setCatalogError("");
    setFacultyId("");
    setDepartmentId("");
    setCustomFacultyName("");
    setCustomDepartmentName("");
    setCustomCourses([{ code: "", name: "" }, { code: "", name: "" }, { code: "", name: "" }]);
    setManualAcademic(false);
    setUnitQuery("");
    setProgramQuery("");
    setError("");
  }

  function chooseDepartment(nextDepartmentId: string) {
    setDepartmentId(nextDepartmentId);
    setError("");
  }

  function updateCustomCourse(index: number, field: "code" | "name", value: string) {
    setCustomCourses((current) => current.map((course, courseIndex) => courseIndex === index ? { ...course, [field]: value } : course));
    setError("");
  }

  async function saveProfile() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          universityId,
          facultyId: usesOfficialCatalog ? facultyId : undefined,
          departmentId: usesOfficialCatalog ? departmentId : undefined,
          facultyName: usesOfficialCatalog ? undefined : customFacultyName,
          departmentName: usesOfficialCatalog ? undefined : customDepartmentName,
          classYear,
          customCourses: validCustomCourses,
        }),
      });
      const data = (await response.json()) as { profile?: StudentProfile; error?: string; authRequired?: boolean };

      if (response.status === 401 && data.authRequired) {
        window.location.reload();
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
    (step === 2 && (catalogLoading || (usesOfficialCatalog ? !facultyId : customFacultyName.trim().length < 2))) ||
    (step === 3 && (usesOfficialCatalog ? !departmentId : customDepartmentName.trim().length < 2)) ||
    (step === 4 && validCustomCourses.length < 3) ||
    saving;

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <Logo/>
        <div className="onboarding-progress-copy"><span>{selectedUniversity?.shortName ?? "Üniyra"} profil kurulumu</span><strong>{step} / 5</strong></div>
      </header>

      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <div className="onboarding-rail" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((item) => <span className={item <= step ? "active" : ""} key={item}><i/></span>)}
        </div>

        <div className="onboarding-copy">
          <span className="onboarding-kicker">
            {step === 1 && "ÜNİVERSİTENİ SEÇ"}
            {step === 2 && "FAKÜLTEN"}
            {step === 3 && "AKADEMİK YOLUN"}
            {step === 4 && "DERS ÇEVRELERİN"}
            {step === 5 && "HER ŞEY HAZIR"}
          </span>
          <h1 id="onboarding-title">
            {step === 1 && `Merhaba ${firstName}, kampüsünü bulalım.`}
            {step === 2 && "Hangi fakültedesin?"}
            {step === 3 && "Bölümünü ve sınıfını seç."}
            {step === 4 && "Bu dönem hangi derslerdesin?"}
            {step === 5 && "Sana özel kampüsü kuralım."}
          </h1>
          <p>
            {step === 1 && "Türkiye ve Kıbrıs’taki üniversiteler arasından okulunu ara ve seç."}
            {step === 2 && "Fakülten, sana gösterilecek bölüm çevrelerini ve kampüs önerilerini belirler."}
            {step === 3 && `Akışını ${selectedUniversity?.shortName ?? "kampüsündeki"} öğrencileriyle eşleştireceğiz.`}
            {step === 4 && "Bu dönem aldığın en az 3 dersi kodu ve adıyla ekle; not ve ders çevrelerin bunlarla kurulacak."}
            {step === 5 && "Seçimlerini kontrol et. Profilin sonraki ziyaretlerinde de seni bekleyecek."}
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
                <input value={universityQuery} onChange={(event) => setUniversityQuery(event.target.value)} placeholder="Üniversite adı, kısaltma veya bölge ara" autoComplete="off"/>
                {universityQuery && <button type="button" onClick={() => setUniversityQuery("")} aria-label="Üniversite aramasını temizle"><Icon name="close" size={15}/></button>}
              </label>
              <div className="university-catalog-meta"><span>{universities.filter((university) => university.region === "Türkiye").length} Türkiye</span><span>{universities.filter((university) => university.region !== "Türkiye").length} Kıbrıs</span><small>Resmî katalog · 4 Eylül 2026</small></div>
              <div className="university-grid university-catalog-grid">
                {visibleUniversities.slice(0, 80).map((university) => (
                  <button className={universityId === university.id ? "selected" : ""} type="button" onClick={() => chooseUniversity(university.id)} key={university.id}>
                    <span>{university.shortName}</span><div><strong>{university.name}</strong><small>{university.city}</small></div><i>{universityId === university.id && <Icon name="check" size={14}/>}</i>
                  </button>
                ))}
              </div>
              {visibleUniversities.length === 0 && <p className="university-catalog-empty">Bu adla eşleşen üniversite bulunamadı.</p>}
              {visibleUniversities.length > 80 && <p className="university-catalog-hint">{visibleUniversities.length} sonuç var. Üniversite adını yazarak listeyi daraltabilirsin.</p>}
            </div>
          )}

          {step === 2 && (
            <div className="academic-step">
              <div className="onboarding-field-title"><span>Akademik birimin</span><small>{selectedUniversity?.name}</small></div>
              {catalogLoading && <div className="catalog-loading"><Icon name="sparkles" size={18}/> Resmî akademik katalog yükleniyor…</div>}
              {!catalogLoading && catalog?.units.length ? <>
                <div className="catalog-source-note"><Icon name="check" size={15}/><span><strong>{catalog.units.length} seçilebilir birim · {catalog.programs.length} resmî program</strong><small>{catalog.sources.map((source) => source.authority).filter((value, index, values) => values.indexOf(value) === index).join(" + ")} · {catalog.updatedAt}</small></span></div>
                {!manualAcademic && <label className="catalog-inline-search"><Icon name="search" size={16}/><input value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} placeholder="Fakülte, yüksekokul veya akademik birim ara"/></label>}
                {!manualAcademic && <div className="faculty-grid">
                {visibleUnits.map((faculty) => (
                  <button className={facultyId === faculty.id ? "selected" : ""} type="button" onClick={() => chooseFaculty(faculty.id)} key={faculty.id}>
                    <span>{faculty.type.slice(0, 3).toLocaleUpperCase("tr-TR")}</span><div><strong>{faculty.name}</strong><small>{faculty.type} · {faculty.programCount} program</small></div><i>{facultyId === faculty.id && <Icon name="check" size={14}/>}</i>
                  </button>
                ))}
                </div>}
                <button className="catalog-manual-toggle" type="button" onClick={() => { setManualAcademic((current) => !current); setFacultyId(""); setDepartmentId(""); setError(""); }}>{manualAcademic ? "Resmî listeden seç" : "Birimim listede yok"}</button>
              </> : null}
              {!catalogLoading && (manualAcademic || !catalog?.units.length) && <label className="custom-academic-field"><span>Fakülte, yüksekokul veya enstitü adı</span><input value={customFacultyName} onChange={(event) => { setCustomFacultyName(event.target.value); setError(""); }} maxLength={100} placeholder="Örn. Mühendislik Fakültesi"/><small>Resmî öğrenci kaydında gördüğün akademik birim adını yaz.</small></label>}
              {!catalogLoading && (catalogError || !catalog?.units.length) && <p className="catalog-coverage-warning">{catalogError || "Bu kurum için merkezî resmî program kaydı bulunamadı; bilgini öğrenci kaydındaki biçimiyle yazabilirsin."}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="academic-step">
              <div className="onboarding-field-title"><span>Programın</span><small>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName}</small></div>
              {usesOfficialCatalog ? <>
                <label className="catalog-inline-search"><Icon name="search" size={16}/><input value={programQuery} onChange={(event) => setProgramQuery(event.target.value)} placeholder="Bölüm veya program ara"/></label>
                <div className="department-grid catalog-program-grid">
                {visiblePrograms.map((department) => (
                  <button className={departmentId === department.id ? "selected" : ""} type="button" onClick={() => chooseDepartment(department.id)} key={department.id}>
                    <span><strong>{department.name}</strong><small>{degreeLabels[department.degreeLevel]}{department.durationYears ? ` · ${department.durationYears} yıl` : ""}{department.scoreType ? ` · ${department.scoreType}` : ""}{department.language ? ` · ${department.language}` : ""}</small></span>{departmentId === department.id && <Icon name="check" size={15}/>}
                  </button>
                ))}
                </div>
                {visiblePrograms.length === 0 && <p className="university-catalog-empty">Bu birimde aramanla eşleşen program bulunamadı.</p>}
              </> : <label className="custom-academic-field"><span>Bölüm veya program adı</span><input value={customDepartmentName} onChange={(event) => { setCustomDepartmentName(event.target.value); setError(""); }} maxLength={100} placeholder="Örn. Bilgisayar Mühendisliği"/><small>Önlisans, lisans veya lisansüstü program adını kullanabilirsin.</small></label>}
              <div className="onboarding-field-title class-title"><span>Kaçıncı sınıftasın?</span><small>Hazırlık dahil seçim yapabilirsin.</small></div>
              <div className="year-picker">
                {[1, 2, 3, 4, 5, 6].map((year) => <button className={classYear === year ? "selected" : ""} type="button" onClick={() => setClassYear(year)} key={year}>{year === 1 ? "Hazırlık / 1" : year}<small>{year === 6 ? "+" : ". sınıf"}</small></button>)}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="course-step">
              <div className="course-count"><span><strong>{validCustomCourses.length}</strong> ders ekledin</span><small>En az 3 · En fazla 8</small></div>
              {selectedDepartment?.curriculumUrls?.[0] && <a className="catalog-curriculum-link" href={selectedDepartment.curriculumUrls[0]} target="_blank" rel="noreferrer"><Icon name="file" size={16}/><span>Resmî ders / müfredat planını aç{(selectedDepartment.curriculumAuthority || selectedDepartment.curriculumPeriod) ? <small>{[selectedDepartment.curriculumAuthority, selectedDepartment.curriculumPeriod].filter(Boolean).join(" · ")}</small> : null}</span><Icon name="arrow" size={14}/></a>}
              <div className="custom-course-list">
                {customCourses.map((course, index) => <div className="custom-course-row" key={index}>
                  <label><span>Ders kodu</span><input value={course.code} onChange={(event) => updateCustomCourse(index, "code", event.target.value)} maxLength={20} placeholder="BİL 101"/></label>
                  <label><span>Ders adı</span><input value={course.name} onChange={(event) => updateCustomCourse(index, "name", event.target.value)} maxLength={100} placeholder="Programlamaya Giriş"/></label>
                  {customCourses.length > 3 && <button type="button" onClick={() => setCustomCourses((current) => current.filter((_, courseIndex) => courseIndex !== index))} aria-label={`${index + 1}. dersi kaldır`}><Icon name="trash" size={16}/></button>}
                </div>)}
                {customCourses.length < 8 && <button className="custom-course-add" type="button" onClick={() => setCustomCourses((current) => [...current, { code: "", name: "" }])}><Icon name="plus" size={15}/> Ders ekle</button>}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="onboarding-summary">
              <div className="summary-identity">
                <span className="summary-avatar">{getInitials(identityName)}</span>
                <div><span>Üniyra profilin</span><h2>{identityName}</h2><p>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName} · {usesOfficialCatalog ? selectedDepartment?.name : customDepartmentName} · {classYear}. sınıf</p></div>
                <span className="summary-ready"><Icon name="check" size={15}/> Hazır</span>
              </div>
              <div className="summary-campus">
                <span>{selectedUniversity?.shortName}</span>
                <div><small>KAMPÜSÜN</small><strong>{selectedUniversity?.name}</strong><p>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName} çevresindeki öğrencilerle buluş.</p></div>
              </div>
              <div className="summary-courses"><span>Ders çevrelerin</span><div>{validCustomCourses.map((course) => <strong key={`${course.code}-${course.name}`}>{course.code}</strong>)}</div></div>
              <div className="summary-note"><Icon name="sparkles" size={18}/><p>Akışın bu seçimlere göre kişiselleşecek. Profilini daha sonra istediğin zaman güncelleyebilirsin.</p></div>
            </div>
          )}
        </div>

        {error && <p className="onboarding-error" role="alert">{error}</p>}

        <footer className="onboarding-actions">
          <div>
            {step > 1 && <button className="onboarding-back" type="button" onClick={() => { setStep((current) => current - 1); setError(""); }} disabled={saving}>Geri</button>}
            <button className="onboarding-next" type="button" disabled={nextDisabled} onClick={() => { if (step < 5) { setStep((current) => current + 1); setError(""); } else { void saveProfile(); } }}>
              {saving ? "Kaydediliyor…" : step === 5 ? "Üniyra’ya gir" : "Devam et"}
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [identityName, setIdentityName] = useState("Öğrenci");
  const [profileReloadToken, setProfileReloadToken] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [people, setPeople] = useState<CampusPerson[]>([]);
  const [peopleStatus, setPeopleStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [followPendingId, setFollowPendingId] = useState<string | null>(null);
  const [followError, setFollowError] = useState("");
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [savedPostsLoading, setSavedPostsLoading] = useState(false);
  const [savedPostsError, setSavedPostsError] = useState("");
  const sharedPostFocused = useRef(false);

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
          setPosts([]);
          setPostsLoading(true);
          setProfileState("ready");
          const sharedProfileId = new URLSearchParams(window.location.search).get("profile")?.trim() ?? "";
          if (sharedProfileId) {
            if (sharedProfileId === data.profile.publicId) {
              setActiveNav("Profil");
            } else {
              setActiveNav("Öğrenci");
              setPublicProfileLoading(true);
              try {
                const profileResponse = await fetch(`/api/people?id=${encodeURIComponent(sharedProfileId)}`, { headers: { accept: "application/json" } });
                const profileData = (await profileResponse.json()) as { person?: PublicProfile; error?: string };
                if (active && profileResponse.ok && profileData.person) setPublicProfile(profileData.person);
                if (active && (!profileResponse.ok || !profileData.person)) setFollowError(profileData.error ?? "Paylaşılan öğrenci profili açılamadı.");
              } catch {
                if (active) setFollowError("Paylaşılan öğrenci profili açılamadı.");
              } finally {
                if (active) setPublicProfileLoading(false);
              }
            }
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
  }, [profileReloadToken]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadPosts() {
      try {
        const feedQuery = feedTab === "Takip ettiklerin" ? "following" : feedTab === "Kampüsüm" ? "campus" : "all";
        const sharedPostId = new URLSearchParams(window.location.search).get("post")?.trim() ?? "";
        const sharedPostRequest = sharedPostId
          ? fetch(`/api/posts?id=${encodeURIComponent(sharedPostId)}`, { headers: { accept: "application/json" } })
          : null;
        const response = await fetch(`/api/posts?feed=${feedQuery}`, { headers: { accept: "application/json" } });
        const data = (await response.json()) as { posts?: Post[]; nextCursor?: string | null; error?: string };
        if (!active) return;
        if (!response.ok || !data.posts) {
          setFeedError(data.error ?? "Akış şu anda yenilenemedi.");
          return;
        }
        let nextPosts = data.posts;
        if (sharedPostRequest) {
          try {
            const sharedResponse = await sharedPostRequest;
            const sharedData = (await sharedResponse.json()) as { post?: Post };
            if (active && sharedResponse.ok && sharedData.post && !nextPosts.some((post) => String(post.id) === String(sharedData.post!.id))) {
              nextPosts = [sharedData.post, ...nextPosts];
            }
          } catch {
            // The regular feed remains usable when an old or malformed shared link cannot be resolved.
          }
        }
        setPosts(nextPosts);
        setNextCursor(data.nextCursor ?? null);
        setFeedError("");
      } catch {
        // A clear empty state remains available while a transient request is retried on reload.
        if (active) setFeedError("Akış şu anda yenilenemedi.");
      } finally {
        if (active) setPostsLoading(false);
      }
    }

    void loadPosts();
    return () => { active = false; };
  }, [profileState, feedTab]);

  useEffect(() => {
    if (profileState !== "ready" || activeNav !== "Kaydedilenler") return;
    let active = true;

    async function loadSavedPosts() {
      try {
        const response = await fetch("/api/posts?feed=saved", { headers: { accept: "application/json" } });
        const data = (await response.json()) as { posts?: Post[]; error?: string };
        if (!active) return;
        if (!response.ok || !data.posts) throw new Error(data.error ?? "Kaydedilen gönderiler getirilemedi.");
        setSavedPosts(data.posts);
      } catch (savedError) {
        if (active) setSavedPostsError(savedError instanceof Error ? savedError.message : "Kaydedilen gönderiler getirilemedi.");
      } finally {
        if (active) setSavedPostsLoading(false);
      }
    }

    void loadSavedPosts();
    return () => { active = false; };
  }, [activeNav, profileState]);

  useEffect(() => {
    if (postsLoading || sharedPostFocused.current) return;
    const sharedPostId = new URLSearchParams(window.location.search).get("post")?.trim();
    if (!sharedPostId) return;
    const target = document.getElementById(`post-${sharedPostId}`);
    if (!target) return;
    sharedPostFocused.current = true;
    target.classList.add("shared-post-focus");
    window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    window.setTimeout(() => target.classList.remove("shared-post-focus"), 2400);
  }, [posts, postsLoading]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadPeople() {
      try {
        const queryString = peopleQuery ? `?q=${encodeURIComponent(peopleQuery)}` : "";
        const response = await fetch(`/api/people${queryString}`, { headers: { accept: "application/json" } });
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
  }, [profileState, peopleQuery]);

  useEffect(() => {
    function handleHistoryChange() {
      const sharedProfileId = new URLSearchParams(window.location.search).get("profile");
      if (!sharedProfileId) {
        setActiveNav("Akış");
        setPublicProfile(null);
        setPublicProfileLoading(false);
        setFollowError("");
        return;
      }
      window.location.reload();
    }

    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, []);

  if (profileState === "loading") return <ProfileBoot/>;

  if (profileState === "auth-required") {
    return <AuthGate onAuthenticated={(displayName) => { setIdentityName(displayName); setProfileState("loading"); setProfileReloadToken((current) => current + 1); }}/>;
  }

  if (profileState !== "ready" || !studentProfile) {
    return (
      <AcademicOnboarding
        identityName={identityName}
        initialProfile={studentProfile}
        state={profileState === "unavailable" ? "unavailable" : "needs-onboarding"}
        onComplete={(profile) => { setStudentProfile(profile); setIdentityName(profile.displayName); setPosts([]); setPostsLoading(true); setNextCursor(null); setSavedPosts([]); setSavedPostsError(""); setPeopleQuery(""); setPeopleStatus("loading"); setProfileState("ready"); }}
        onRetry={() => { setProfileState("loading"); setProfileReloadToken((current) => current + 1); }}
      />
    );
  }

  const activeProfile = studentProfile;
  const initials = getInitials(activeProfile.displayName);
  const emptyFeedCopy = feedTab === "Takip ettiklerin"
    ? { title: "Takip akışın henüz boş", description: "Öğrenci ağından ilgini çeken kişileri takip ettiğinde paylaşımları burada görünecek." }
    : feedTab === "Kampüsüm"
      ? { title: "Kampüsünde henüz paylaşım yok", description: `${activeProfile.universityShortName} akışındaki ilk gönderiyi paylaşarak kampüs sohbetini başlatabilirsin.` }
      : { title: `${activeProfile.universityShortName} akışın henüz sakin`, description: "İlk gönderiyi paylaşabilir veya öğrenci ağından bağlantılar kurabilirsin." };

  async function publishPost() {
    const clean = draft.trim();
    if (!clean || publishing) return;
    setComposerError("");

    setPublishing(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: clean,
          courseId: activeProfile.courses[0]?.id ?? null,
        }),
      });
      const data = (await response.json()) as { post?: Post; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderin paylaşılamadı.");

      setPosts((current) => [data.post as Post, ...current]);
      setStudentProfile((current) => current ? { ...current, postCount: current.postCount + 1 } : current);
      setDraft("");
    } catch (publishError) {
      setComposerError(publishError instanceof Error ? publishError.message : "Gönderin paylaşılamadı.");
    } finally {
      setPublishing(false);
    }
  }

  async function loadMorePosts() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFeedError("");

    try {
      const feedQuery = feedTab === "Takip ettiklerin" ? "following" : feedTab === "Kampüsüm" ? "campus" : "all";
      const response = await fetch(`/api/posts?feed=${feedQuery}&cursor=${encodeURIComponent(nextCursor)}`, { headers: { accept: "application/json" } });
      const data = (await response.json()) as { posts?: Post[]; nextCursor?: string | null; error?: string };
      if (!response.ok || !data.posts) throw new Error(data.error ?? "Akışın devamı getirilemedi.");

      setPosts((current) => {
        const knownIds = new Set(current.map((post) => String(post.id)));
        return [...current, ...data.posts!.filter((post) => !knownIds.has(String(post.id)))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      setFeedError(loadError instanceof Error ? loadError.message : "Akışın devamı getirilemedi.");
    } finally {
      setLoadingMore(false);
    }
  }

  function updatePost(id: number | string, text: string) {
    setPosts((current) => current.map((post) => post.id === id ? { ...post, text, edited: true } : post));
    setSavedPosts((current) => current.map((post) => post.id === id ? { ...post, text, edited: true } : post));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((post) => post.id === id ? { ...post, text, edited: true } : post) } : current);
  }

  function deletePost(id: number | string) {
    const removedPost = posts.find((post) => post.id === id);
    setPosts((current) => current.filter((post) => post.id !== id));
    setSavedPosts((current) => current.filter((post) => post.id !== id));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.filter((post) => post.id !== id), postCount: Math.max(0, current.postCount - (current.posts.some((post) => post.id === id) ? 1 : 0)) } : current);
    if (removedPost?.authorId === activeProfile.publicId) {
      setStudentProfile((current) => current ? { ...current, postCount: Math.max(0, current.postCount - 1) } : current);
    }
  }

  function updateSavedPost(post: Post, saved: boolean) {
    setSavedPosts((current) => saved
      ? current.some((item) => item.id === post.id) ? current : [{ ...post, saved: true }, ...current]
      : current.filter((item) => item.id !== post.id));
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved } : item));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((item) => item.id === post.id ? { ...item, saved } : item) } : current);
  }

  async function openPerson(person: CampusPerson) {
    setActiveNav("Öğrenci");
    setPublicProfile(null);
    setPublicProfileLoading(true);
    setFollowError("");

    const profileUrl = new URL(window.location.href);
    profileUrl.searchParams.set("profile", person.publicId);
    window.history.pushState({}, "", `${profileUrl.pathname}${profileUrl.search}`);

    try {
      const response = await fetch(`/api/people?id=${encodeURIComponent(person.publicId)}`, {
        headers: { accept: "application/json" },
      });
      const data = (await response.json()) as { person?: PublicProfile; error?: string };
      if (!response.ok || !data.person) throw new Error(data.error ?? "Öğrenci profili açılamadı.");
      setPublicProfile(data.person);
    } catch (profileError) {
      setFollowError(profileError instanceof Error ? profileError.message : "Öğrenci profili açılamadı.");
    } finally {
      setPublicProfileLoading(false);
    }
  }

  function queryPeople(query: string) {
    const nextQuery = query.slice(0, 60);
    setPeopleQuery(nextQuery);
    setPeopleStatus("loading");

  }

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE", headers: { accept: "application/json" } }).catch(() => undefined);
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

  function navigateTo(name: string) {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has("profile") || currentUrl.searchParams.has("post")) {
      currentUrl.searchParams.delete("profile");
      currentUrl.searchParams.delete("post");
      window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}`);
    }
    sharedPostFocused.current = false;
    if (name === "Kaydedilenler" && activeNav !== name) {
      setSavedPostsLoading(true);
      setSavedPostsError("");
    }
    setPublicProfile(null);
    setPublicProfileLoading(false);
    setFollowError("");
    setActiveNav(name);
  }

  async function toggleFollow(publicId: string) {
    if (followPendingId) return;
    const knownTarget = people.find((person) => person.publicId === publicId) ?? publicProfile;
    const wasFollowing = knownTarget?.isFollowing ?? false;
    const previousFollowerCount = knownTarget?.followerCount ?? 0;
    const optimisticActive = !wasFollowing;
    const optimisticFollowerCount = Math.max(0, previousFollowerCount + (optimisticActive ? 1 : -1));
    const optimisticFollowingDelta = optimisticActive ? 1 : -1;
    setFollowPendingId(publicId);
    setFollowError("");
    setPeople((current) => current.map((person) => person.publicId === publicId ? { ...person, isFollowing: optimisticActive, followerCount: optimisticFollowerCount } : person));
    setPublicProfile((current) => current?.publicId === publicId ? { ...current, isFollowing: optimisticActive, followerCount: optimisticFollowerCount } : current);
    setStudentProfile((current) => current ? { ...current, followingCount: Math.max(0, current.followingCount + optimisticFollowingDelta) } : current);

    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId: publicId }),
      });
      const data = (await response.json()) as { active?: boolean; followerCount?: number; error?: string };
      if (!response.ok || typeof data.active !== "boolean" || typeof data.followerCount !== "number") {
        throw new Error(data.error ?? "Takip işlemi tamamlanamadı.");
      }

      setPeople((current) => current.map((person) => person.publicId === publicId ? { ...person, isFollowing: data.active!, followerCount: data.followerCount! } : person));
      setPublicProfile((current) => current?.publicId === publicId ? { ...current, isFollowing: data.active!, followerCount: data.followerCount! } : current);
      const correction = (data.active ? 1 : 0) - (optimisticActive ? 1 : 0);
      if (correction) setStudentProfile((current) => current ? { ...current, followingCount: Math.max(0, current.followingCount + correction) } : current);
    } catch (followActionError) {
      setPeople((current) => current.map((person) => person.publicId === publicId ? { ...person, isFollowing: wasFollowing, followerCount: previousFollowerCount } : person));
      setPublicProfile((current) => current?.publicId === publicId ? { ...current, isFollowing: wasFollowing, followerCount: previousFollowerCount } : current);
      setStudentProfile((current) => current ? { ...current, followingCount: Math.max(0, current.followingCount - optimisticFollowingDelta) } : current);
      setFollowError(followActionError instanceof Error ? followActionError.message : "Takip işlemi tamamlanamadı.");
    } finally {
      setFollowPendingId(null);
    }
  }

  return (
    <main className="site-shell" id="top">
      <aside className="left-sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Ana menü">
          {navItems.map((item) => (
            <button className={activeNav === item.label ? "active" : ""} key={item.label} onClick={() => navigateTo(item.label)} type="button">
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
          <div><strong>Üniyra v1.6</strong><span>Akademik katalog yayında</span></div>
          <span className="semester-progress"><i /></span>
        </div>
        <button className="profile-mini" type="button" onClick={() => navigateTo("Profil")}>
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
            <button className="icon-button notification-button" type="button" onClick={() => navigateTo("Bildirimler")} aria-label="Bildirimler"><Icon name="bell"/><i /></button>
          </div>
        </header>

        {showSearch && (
          <div className="mobile-search">
            <Icon name="search" size={18}/><input autoFocus value={peopleQuery} onChange={(event) => { queryPeople(event.target.value); if (activeNav !== "Keşfet") navigateTo("Keşfet"); }} placeholder="Ders, not, topluluk veya öğrenci ara"/><button onClick={() => setShowSearch(false)} aria-label="Aramayı kapat"><Icon name="close" size={17}/></button>
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
            <div><strong>{curatedNotes.length} doğrulanmış not</strong><small>Üniyra Editoryal&apos;de</small></div>
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
              <button type="button" onClick={() => navigateTo("Notlar")}><span className="tool-icon tool-note"><Icon name="file" size={18}/></span><span>Not yükle</span></button>
            </div>
            <button className="publish-button" type="button" disabled={!draft.trim() || publishing} onClick={() => void publishPost()}>{publishing ? "Paylaşılıyor…" : "Paylaş"}</button>
          </div>
          {composerError && <p className="composer-feedback" role="alert">{composerError}</p>}
        </section>

        <div className="feed-tabs" role="tablist" aria-label="Akış türü">
          {["Senin için", "Takip ettiklerin", "Kampüsüm"].map((tab) => (
            <button key={tab} className={feedTab === tab ? "active" : ""} onClick={() => { setFeedTab(tab); setNextCursor(null); setFeedError(""); setPostsLoading(true); }} type="button" role="tab" aria-selected={feedTab === tab}>{tab}</button>
          ))}
          <button className="feed-filter" type="button" aria-label="Akış seçenekleri"><Icon name="more"/></button>
        </div>

        <div className="feed-list">{postsLoading ? <div className="feed-empty feed-loading" aria-live="polite"><span className="profile-boot-line"><i/></span><strong>{activeProfile.universityShortName} akışın hazırlanıyor…</strong></div> : posts.length > 0 ? posts.map((post) => <FeedPost post={post} viewerInitials={initials} viewerId={studentProfile.publicId} onPostUpdated={updatePost} onPostDeleted={deletePost} key={post.id}/>) : <div className="feed-empty"><span><Icon name="users" size={22}/></span><strong>{emptyFeedCopy.title}</strong><p>{emptyFeedCopy.description}</p></div>}</div>
        {!postsLoading && feedError && <p className="feed-error" role="alert">{feedError}</p>}
        {!postsLoading && nextCursor && <button className="feed-load-more" type="button" onClick={() => void loadMorePosts()} disabled={loadingMore}>{loadingMore ? "Gönderiler getiriliyor…" : "Daha fazla gönderi göster"}</button>}
        </> : activeNav === "Öğrenci" ? <PublicProfileView profile={publicProfile} loading={publicProfileLoading} shareable viewerInitials={initials} viewerId={studentProfile.publicId} followPending={followPendingId === publicProfile?.publicId} onBack={() => navigateTo("Keşfet")} onToggleFollow={(publicId) => void toggleFollow(publicId)}/> : <SecondaryView name={activeNav} profile={studentProfile} posts={posts} people={people} peopleStatus={peopleStatus} peopleQuery={peopleQuery} shareableProfile followPendingId={followPendingId} savedPosts={savedPosts} savedPostsLoading={savedPostsLoading} savedPostsError={savedPostsError} onOpenPerson={(person) => void openPerson(person)} onQueryPeople={queryPeople} onToggleFollow={(publicId) => void toggleFollow(publicId)} onNavigate={navigateTo} onEditProfile={() => setProfileState("needs-onboarding")} onSignOut={() => void signOut()} onPostUpdated={updatePost} onPostDeleted={deletePost} onSavedChange={updateSavedPost}/>}
        {(activeNav === "Öğrenci" || activeNav === "Keşfet") && followError && <p className="profile-action-error" role="alert">{followError}</p>}
      </section>

      <aside className="right-sidebar">
        <div className="search-box">
          <Icon name="search" size={18}/><input aria-label="Üniyra'da ara" value={peopleQuery} onChange={(event) => { queryPeople(event.target.value); if (activeNav !== "Keşfet") navigateTo("Keşfet"); }} placeholder="Ders, not veya öğrenci ara"/>{peopleQuery ? <button type="button" onClick={() => queryPeople("")} aria-label="Aramayı temizle"><Icon name="close" size={15}/></button> : <kbd>⌘ K</kbd>}
        </div>

        <section className="side-card campus-card">
          <span className="campus-orb"><Icon name="users" size={20}/></span>
          <div className="side-card-title"><span>{activeProfile.universityShortName} öğrenci ağı</span><i>Kampüs</i></div>
          <h2>Kendi akademik çevreni kur.</h2>
          <p>Fakültene ve bölümüne yakın öğrencileri bul, paylaşımlarını takip et.</p>
          <button type="button" onClick={() => navigateTo("Keşfet")}>Kampüsü keşfet <Icon name="arrow" size={16}/></button>
          <span className="campus-glow campus-glow-one"/><span className="campus-glow campus-glow-two"/>
        </section>

        <section className="side-card">
          <div className="side-heading"><h2>Doğrulanmış notlar</h2><button type="button" onClick={() => navigateTo("Notlar")}>Tümü</button></div>
          <div className="trending-list">
            {libraryNotes.slice(0, 3).map((note, index) => <button type="button" onClick={() => navigateTo("Notlar")} key={note.title}><span className="trend-rank">{String(index + 1).padStart(2, "0")}</span><span><small>{note.code}</small><strong>{note.title}</strong><em>{note.meta}</em></span><i className={`mini-doc mini-doc-${note.tone}`}>{note.symbol.slice(0, 1)}</i></button>)}
          </div>
        </section>

        <section className="side-card">
          <div className="side-heading"><h2>Tanıyor olabilirsin</h2><span>{activeProfile.universityShortName}</span></div>
          <div className="people-list">
            {peopleStatus === "loading" && <p className="people-state">Öğrenci çevren hazırlanıyor…</p>}
            {peopleStatus === "empty" && <p className="people-state">Henüz aynı üniversiteden başka bir profil yok. İlk paylaşımınla ağı başlatabilirsin.</p>}
            {peopleStatus === "error" && <p className="people-state">Öğrenci önerileri şu anda getirilemedi.</p>}
            {peopleStatus === "ready" && people.slice(0, 3).map((person) => (
              <div key={person.publicId}>
                <Avatar initials={person.initials} className={person.avatarClass}/>
                <button className="person-summary" type="button" onClick={() => void openPerson(person)}><strong>{person.displayName}</strong><small>{person.facultyShortName} · {person.departmentName}</small></button>
                <button className={person.isFollowing ? "following" : ""} type="button" disabled={followPendingId === person.publicId} onClick={() => void toggleFollow(person.publicId)}>{followPendingId === person.publicId ? "…" : person.isFollowing ? "Takipte" : "Takip et"}</button>
              </div>
            ))}
          </div>
          {activeNav !== "Öğrenci" && followError && <p className="people-error" role="alert">{followError}</p>}
        </section>

        <footer className="side-footer">
          <div><a href="/legal#about">Hakkımızda</a><button type="button" onClick={() => navigateTo("Güvenlik")}>Güvenlik</button><a href="/legal#help">Yardım</a><a href="/legal#privacy">Gizlilik</a></div>
          <span>© 2026 Üniyra · Öğrencilerle, öğrenciler için.</span>
        </footer>
      </aside>

      <nav className="mobile-nav" aria-label="Mobil menü">
        {navItems.map((item) => (
          <button className={activeNav === item.label ? "active" : ""} onClick={() => navigateTo(item.label)} type="button" key={item.label} aria-label={item.label}>
            {item.label === "Notlar" ? <span className="mobile-create"><Icon name="plus" size={23}/></span> : <><Icon name={item.icon} size={21}/><small>{item.label === "Topluluklar" ? "Gruplar" : item.label}</small></>}
          </button>
        ))}
      </nav>
    </main>
  );
}
