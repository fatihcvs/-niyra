"use client";

import { type ChangeEvent, type FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { ForkKnife } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { FEED_SCOPES, feedScopeFromSearch, audienceLabel, type FeedScope, type PostAudience } from "../lib/feed-scope";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { SealCheck } from "@phosphor-icons/react/dist/csr/SealCheck";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
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
import { SavedWorkspace } from "./saved-workspace";
import { workspaceFromSearch, workspaceRoutes } from "../lib/workspace-navigation";
import { ProfileContent } from "./profile-content";
import { POST_IMAGE_MAX_BYTES, POST_VIDEO_MAX_BYTES, type PostMedia } from "../lib/post-media";

const CommunitiesWorkspace = dynamic(() => import("./communities-workspace").then((module) => module.CommunitiesWorkspace), {
  loading: () => <div className="empty-state"><strong>Topluluklar hazırlanıyor</strong><span>Kampüs çevren yükleniyor.</span></div>,
});

type IconName =
  | "home" | "compass" | "notes" | "users" | "bell" | "bookmark"
  | "search" | "plus" | "image" | "file" | "sparkles" | "more"
  | "heart" | "comment" | "share" | "check" | "calendar" | "arrow"
  | "close" | "send" | "message" | "edit" | "trash" | "settings" | "sun" | "moon" | "monitor";

type ThemePreference = "light" | "dark" | "system";

type Post = {
  audience?: PostAudience;
  id: number | string;
  authorId?: string;
  name: string;
  initials: string;
  avatarClass: string;
  avatarUrl?: string | null;
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
  media?: PostMedia[];
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
  avatarUrl?: string | null;
  content: string;
  time: string;
  edited?: boolean;
  own?: boolean;
  pending?: boolean;
};

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
  bannerUrl: string | null;
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

type CourseSubject = {
  id: string;
  code: string;
  label: string;
  tone: string;
  imageUrl: string;
  noteCount: number;
  postCount: number;
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
  bannerUrl: string | null;
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
  { label: "Mesajlar", icon: "message" },
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
  { label: "Ayarlar", icon: "settings" },
];

const mobileMenuItems = navItems.filter((item) => !["Akış", "Keşfet", "Kampüs Anlık"].includes(item.label));

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
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-4-.9l-5 1.5 1.6-4.3A8.4 8.4 0 1 1 21 11.5Z"/><path d="M8 10h8M8 14h5"/></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.3.37.52.7.6 1 .1.35.13.72.1 1.1v1.8c.03.38 0 .75-.1 1.1-.08.3-.3.63-.6 1Z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></>,
    moon: <path d="M20.5 14.2A8 8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

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

function Avatar({ initials, className, small = false, imageUrl = null }: { initials: string; className: string; small?: boolean; imageUrl?: string | null }) {
  return <span className={`avatar ${className} ${small ? "avatar-small" : ""}`}>{initials}{imageUrl && <Image src={imageUrl} alt="" fill sizes={small ? "32px" : "72px"} unoptimized onError={(event) => { event.currentTarget.hidden = true; }}/>}</span>;
}

function ProfileCover({ imageUrl }: { imageUrl?: string | null }) {
  return <div className={`profile-cover ${imageUrl ? "has-image" : ""}`}><span>∑</span><span>Ψ</span><span>λ</span><i/>{imageUrl && <Image src={imageUrl} alt="" fill sizes="(max-width: 780px) 100vw, 710px" unoptimized priority onError={(event) => { event.currentTarget.hidden = true; }}/>}</div>;
}

function ProfileLinks({ links }: { links: Array<{ title: string; url: string }> }) {
  if (links.length === 0) return null;
  return <div className="profile-links">{links.map((link) => <a href={link.url} target="_blank" rel="noreferrer noopener" key={`${link.title}-${link.url}`}><Icon name="arrow" size={13}/>{link.title}</a>)}</div>;
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
  onInteractionUpdated,
}: {
  post: Post;
  viewerInitials?: string;
  viewerId?: string;
  onPostUpdated?: (id: number | string, text: string) => void;
  onPostDeleted?: (id: number | string) => void;
  onSavedChange?: (post: Post, saved: boolean) => void;
  onInteractionUpdated?: (id: number | string, changes: Partial<Pick<Post, "liked" | "saved" | "likes" | "comments">>) => void;
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
    onInteractionUpdated?.(post.id, { liked: Boolean(result.active), likes: result.count ?? previousCount });
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
    onInteractionUpdated?.(post.id, { saved: active });
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
    onInteractionUpdated?.(post.id, { comments: result.count ?? commentCount + 1 });
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
      onInteractionUpdated?.(post.id, { comments: data.count ?? Math.max(0, previousCount - 1) });
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
        await navigator.share({ title: `${post.name} · Kampira`, text: currentText, url: shareUrl });
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
    if ((!clean && !post.media?.length) || clean.length > 1200 || busyMutation) return;
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
        <Avatar initials={post.initials} className={post.avatarClass} imageUrl={post.avatarUrl}/>
        <div className="post-person">
          <div className="post-name-line">
            <strong>{post.authorId ? <a href={`/?profile=${encodeURIComponent(post.authorId)}`}>{post.name}</a> : post.name}</strong>
          </div>
          <span>{post.school} · {post.department}</span>
          <span className="post-audience" title={post.audience === "platform" ? "Tüm üniversitelerde görünür" : "Yalnızca yazarın kampüsünde görünür"}>{post.audience === "platform" ? <GlobeHemisphereWest size={12}/> : <MapPin size={12}/>} {audienceLabel(post.audience)}</span><span className="post-time">{post.time === "şimdi" ? post.time : `${post.time} önce`}</span>
        </div>
        {isPersistentPost && <div className="post-menu-wrap"><button className="icon-button post-menu" type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="Gönderi seçenekleri" aria-expanded={menuOpen}><Icon name="more"/></button>{menuOpen && <div className="post-owner-menu" role="menu">{isOwnPost ? <><button type="button" role="menuitem" onClick={() => { setEditText(currentText); setEditing(true); setMenuOpen(false); }}><Icon name="edit" size={15}/> Düzenle</button><button className="danger" type="button" role="menuitem" onClick={() => void deletePost()} disabled={busyMutation === "delete"}><Icon name="trash" size={15}/> {busyMutation === "delete" ? "Siliniyor…" : "Sil"}</button></> : <button className="danger" type="button" role="menuitem" onClick={() => { setReportOpen(true); setMenuOpen(false); }}><Icon name="more" size={15}/> Şikâyet et</button>}</div>}</div>}
      </header>

      <div className="post-body">
        <span className="course-tag">{post.course}</span>
        {editing ? <div className="post-edit-box"><textarea aria-label="Gönderi metnini düzenle" autoFocus maxLength={1200} value={editText} onChange={(event) => setEditText(event.target.value)} rows={4}/><div><span>{editText.trim().length}/1200</span><button type="button" onClick={() => { setEditing(false); setEditText(currentText); }}>Vazgeç</button><button type="button" onClick={() => void saveEdit()} disabled={(!editText.trim() && !post.media?.length) || busyMutation === "edit"}>{busyMutation === "edit" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div></div> : <p>{currentText}{edited && <small className="post-edited"> · düzenlendi</small>}</p>}
        {post.attachment && <AttachmentCard attachment={post.attachment} />}
        {post.media?.map((media) => <div className={`post-media post-media-${media.kind}`} key={media.id}>{media.kind === "image" ? <Image src={media.url} alt={currentText || `${post.name} tarafından paylaşılan fotoğraf`} width={900} height={900} sizes="(max-width: 780px) 100vw, 650px" unoptimized/> : <video src={media.url} controls playsInline preload="metadata" aria-label={currentText || `${post.name} tarafından paylaşılan video`}/>}</div>)}
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
                <Avatar initials={comment.initials} className="avatar-violet" imageUrl={comment.avatarUrl} small />
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
    <a className="brand" href="#top" aria-label="Kampira ana sayfa">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">Kampira</span>
    </a>
  );
}

const noteTones = ["purple", "blue", "amber", "mint"];
const noteSymbols: Record<string, string> = { "limit-sureklilik": "lim", "algoritmik-dusunme": "</>", "vektor-kinematik": "v⃗", stp: "STP", "hukuki-kaynak-okuma": "§", "bellek-sistemleri": "Ψ", "turkce-yazim": "Aa", "anatomi-yon-duzlem": "↔" };
const libraryNotes = featuredCuratedNotes.slice(0, 8).map((note, index) => ({
  code: note.courseCodes[0],
  title: note.title,
  author: "Kampira Editoryal",
  meta: `${getCuratedSources(note)[0].publisher} · ${note.readingMinutes} dk`,
  tone: noteTones[index % noteTones.length],
  symbol: noteSymbols[note.id] ?? "✓",
  saved: index < 2,
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
  const visiblePeople = people.filter((person) => category === "Bölümüm" ? person.sameCampus !== false && person.departmentName === profile.departmentName : category === "Sınıfım" ? person.sameCampus !== false && person.classYear === profile.classYear : category === "Takip ettiklerim" ? person.isFollowing : true);
  return (
    <div className="workspace-view">
      <WorkspaceHeader section="Keşfet" eyebrow={profile.universityShortName} title="Kampüslerin ötesinde yeni bağlantılar" description="Tüm üniversitelerde paylaşım yapan öğrencileri keşfet veya kendi kampüs çevrene dön."/>
      <div className="workspace-filter-pills" role="group" aria-label="Keşif alanı">{([['platform','Tüm üniversiteler'],['campus','Kampüsüm']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={scope === value} className={scope === value ? "active" : ""} onClick={() => { setCategory("Sana özel"); onScopeChange(value); }}>{label}</button>)}</div>
      <WorkspaceSearch value={query} onChange={onQueryChange} placeholder="Ad, kullanıcı adı, fakülte veya bölüm ara" resultCount={peopleStatus === "loading" ? undefined : visiblePeople.length} onReset={query || category !== "Sana özel" ? () => { onQueryChange(""); setCategory("Sana özel"); } : undefined}/>

      <UnifiedSearchResults scope={scope} query={query} onNavigate={onNavigate}/>
      <div className="workspace-filter-pills" role="group" aria-label="Öğrenci çevresi">
        {["Sana özel", "Bölümüm", "Sınıfım", "Takip ettiklerim"].map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} aria-pressed={category === item} type="button" key={item}>{item}</button>)}
      </div>

      <div className="workspace-context-links"><button type="button" onClick={() => onNavigate("Topluluklar")}><strong>Topluluklar ↗</strong><small>Birlikte üreteceğin çevreyi bul</small></button><button type="button" onClick={() => onNavigate("Notlar")}><strong>Ders notları ↗</strong><small>Çalışmanı kolaylaştıran kaynaklar</small></button><button type="button" onClick={() => onNavigate("Kampüs")}><strong>Kampüs rehberi ↗</strong><small>Mekânlar ve yaklaşan etkinlikler</small></button></div>
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

      <section className="discover-empty-product"><span><Icon name="users" size={22}/></span><div><strong>Topluluklar gerçek üyelerle oluşur</strong><p>Üniversitene ait toplulukları açarak güncel üye ve gönderi sayılarını görebilirsin.</p></div><button type="button" onClick={() => onNavigate("Topluluklar")}>Topluluklara git <Icon name="arrow" size={15}/></button></section>
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
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [links, setLinks] = useState(profile.links.length ? profile.links.map((link) => ({ ...link })) : []);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const avatarPreview = useProfileMediaPreview(avatarFile, profile.avatarUrl, removeAvatar);
  const bannerPreview = useProfileMediaPreview(bannerFile, profile.bannerUrl, removeBanner);
  const initials = getInitials(displayName || profile.displayName);

  function chooseMedia(event: ChangeEvent<HTMLInputElement>, kind: "avatar" | "banner") {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) {
      setError("Yalnızca PNG, JPG veya WEBP görsel seçebilirsin.");
      return;
    }
    const maxBytes = kind === "avatar" ? 4 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(kind === "avatar" ? "Profil fotoğrafı en fazla 4 MB olabilir." : "Kapak görseli en fazla 8 MB olabilir.");
      return;
    }
    setError("");
    if (kind === "avatar") {
      setAvatarFile(file);
      setRemoveAvatar(false);
    } else {
      setBannerFile(file);
      setRemoveBanner(false);
    }
  }

  function updateLink(index: number, field: "title" | "url", value: string) {
    setLinks((current) => current.map((link, linkIndex) => linkIndex === index ? { ...link, [field]: value } : link));
    setError("");
  }

  async function updateMedia(kind: "avatar" | "banner", file: File | null, removed: boolean) {
    if (file) {
      const form = new FormData();
      form.set("kind", kind);
      form.set("image", file);
      const response = await fetch("/api/profile/media", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profil görseli kaydedilemedi.");
      return;
    }
    if (removed) {
      const response = await fetch("/api/profile/media", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Profil görseli kaldırılamadı.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update-details", displayName, handle, bio, links }),
      });
      const data = (await response.json()) as { profile?: StudentProfile; error?: string; authRequired?: boolean };
      if (response.status === 401 && data.authRequired) {
        window.location.reload();
        return;
      }
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Profil bilgilerin kaydedilemedi.");

      await Promise.all([
        updateMedia("avatar", avatarFile, removeAvatar),
        updateMedia("banner", bannerFile, removeBanner),
      ]);
      if (avatarFile || bannerFile || removeAvatar || removeBanner) {
        const freshResponse = await fetch("/api/profile", { headers: { accept: "application/json" }, cache: "no-store" });
        const freshData = (await freshResponse.json()) as { profile?: StudentProfile; error?: string };
        if (!freshResponse.ok || !freshData.profile) throw new Error(freshData.error ?? "Yeni profil görünümü getirilemedi.");
        onSaved(freshData.profile);
      } else {
        onSaved(data.profile);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil bilgilerin kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="profile-editor-page">
      <header className="profile-editor-topbar">
        <Logo/>
        <div><button type="button" onClick={onCancel}>Vazgeç</button><button form="profile-editor-form" className="profile-editor-save" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </header>
      <form id="profile-editor-form" className="profile-editor-layout" onSubmit={save}>
        <aside className="profile-editor-preview">
          <span className="profile-editor-kicker">PROFİL ÖNİZLEMESİ</span>
          <div className="profile-editor-card">
            <ProfileCover imageUrl={bannerPreview}/>
            <div className="profile-editor-identity"><Avatar initials={initials} className="avatar-violet" imageUrl={avatarPreview}/><div><strong>{displayName.trim() || "Görünen adın"}</strong><span>@{handle.trim() || "kullaniciadi"}</span></div></div>
            <p>{bio.trim() || `${profile.universityShortName} kampüsünde öğreniyor ve paylaşıyor.`}</p>
            <ProfileLinks links={links.filter((link) => link.title.trim() && link.url.trim())}/>
          </div>
          <div className="profile-media-controls">
            <section><div><Avatar initials={initials} className="avatar-violet" imageUrl={avatarPreview}/><span><strong>Profil fotoğrafı</strong><small>Gönderi ve yorumlarında da görünür.</small></span></div><footer><button type="button" onClick={() => avatarInput.current?.click()}>Fotoğraf seç</button>{avatarPreview && <button className="danger" type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); }}>Kaldır</button>}</footer><input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseMedia(event, "avatar")} hidden/></section>
            <section><div><span className="profile-banner-thumb">{bannerPreview ? <Image src={bannerPreview} alt="" fill sizes="70px" unoptimized/> : <Icon name="image" size={21}/>}</span><span><strong>Kapak görseli</strong><small>Kampira profilini kampüsüne özgü yapar.</small></span></div><footer><button type="button" onClick={() => bannerInput.current?.click()}>Kapak seç</button>{bannerPreview && <button className="danger" type="button" onClick={() => { setBannerFile(null); setRemoveBanner(true); }}>Kaldır</button>}</footer><input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseMedia(event, "banner")} hidden/></section>
          </div>
        </aside>

        <section className="profile-editor-fields">
          <div className="profile-editor-heading"><span>PROFİLİNİ DÜZENLE</span><h1>Kendini kampüsüne anlat.</h1><p>Kim olduğunu gösteren alanları tek yerden güncelle; okul ve ders bilgilerin akademik bölümde ayrı kalır.</p></div>
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
          <footer className="profile-editor-footer"><button type="button" onClick={onCancel}>Vazgeç</button><button className="profile-editor-save" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></footer>
        </section>
      </form>
    </main>
  );
}

function ProfileAbout({ profile }: { profile: Pick<StudentProfile, "bio" | "links" | "universityName" | "facultyName" | "departmentName" | "classYear" | "courses"> }) {
  return <div className="profile-about"><section><h2>Hakkında</h2><p>{profile.bio || "Henüz bir biyografi eklenmedi."}</p><ProfileLinks links={profile.links}/></section><section><h2>Akademik bilgiler</h2><dl><div><dt>Üniversite</dt><dd>{profile.universityName}</dd></div><div><dt>Fakülte</dt><dd>{profile.facultyName}</dd></div><div><dt>Bölüm</dt><dd>{profile.departmentName}</dd></div><div><dt>Sınıf</dt><dd>{profile.classYear}. sınıf</dd></div></dl></section><section><h2>Ders çevreleri</h2>{profile.courses.length ? <ul>{profile.courses.map((course) => <li key={course.id}><strong>{course.code}</strong><span>{course.name}</span></li>)}</ul> : <p>Henüz ders çevresi eklenmedi.</p>}</section></div>;
}

function ProfileView({ profile, shareable, onEdit, onSignOut, onPostUpdated, onPostDeleted, onNavigate }: { profile: StudentProfile; shareable: boolean; onEdit: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onNavigate: (name: string) => void }) {
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
      <section className="profile-hero"><ProfileCover imageUrl={profile.bannerUrl}/><div className="profile-main"><Avatar initials={initials} className="avatar-violet" imageUrl={profile.avatarUrl}/><div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div><div className="profile-own-actions">{shareable && <button className="profile-own-share" type="button" onClick={() => void shareOwnProfile()}><Icon name={copied ? "check" : "share"} size={14}/>{copied ? "Kopyalandı" : "Paylaş"}</button>}<button type="button" onClick={onEdit}><Icon name="edit" size={14}/>Profili düzenle</button><button type="button" onClick={onSignOut}>Çıkış yap</button></div></div><p className={`profile-bio ${profile.bio ? "" : "profile-bio-muted"}`}>{profile.bio || `${profile.universityShortName} ders çevrelerin, gönderilerin ve bağlantıların burada bir araya gelir.`}</p><ProfileLinks links={profile.links}/><div className="profile-stats"><strong>{formatCount(profile.postCount)}<span>Gönderi</span></strong><strong>{formatCount(profile.followerCount)}<span>Takipçi</span></strong><strong>{formatCount(profile.followingCount)}<span>Takip</span></strong><strong>{profile.courses.length}<span>Ders çevresi</span></strong></div></section>
      <ProfileContent key={profile.publicId} userId={profile.publicId} own about={<ProfileAbout profile={profile}/>} onNavigate={onNavigate} onCreate={() => onNavigate("Gönderi oluştur")} renderPost={(post, actions) => <FeedPost key={post.id} viewerInitials={initials} viewerId={profile.publicId} post={post} onInteractionUpdated={actions.onInteractionUpdated} onPostUpdated={(id, text) => { actions.onPostUpdated(id, text); onPostUpdated(id, text); }} onPostDeleted={(id) => { actions.onPostDeleted(id); onPostDeleted(id); }}/>} />
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
        <ProfileCover imageUrl={profile.bannerUrl}/>
        <div className="profile-main">
          <Avatar initials={profile.initials} className={profile.avatarClass} imageUrl={profile.avatarUrl}/>
          <div><h1>{profile.displayName}</h1><p>@{profile.handle} · {profile.universityName}</p><small>{profile.facultyName} · {profile.departmentName} · {profile.classYear}. sınıf</small></div>
          <button className={profile.isFollowing ? "profile-following" : ""} type="button" disabled={followPending} onClick={() => onToggleFollow(profile.publicId)}>{followPending ? "Bekle…" : profile.isFollowing ? "Takiptesin" : "Takip et"}</button>
        </div>
        <p className={`profile-bio ${profile.bio ? "" : "profile-bio-muted"}`}>{profile.bio || `${profile.universityShortName} içindeki ders çevrelerinde öğreniyor ve paylaşıyor.`}</p>
        <ProfileLinks links={profile.links}/>
        <div className="profile-stats"><strong>{formatCount(profile.postCount)}<span>Gönderi</span></strong><strong>{formatCount(profile.followerCount)}<span>Takipçi</span></strong><strong>{formatCount(profile.followingCount)}<span>Takip</span></strong><strong>{profile.courses.length}<span>Ders çevresi</span></strong></div>
      </section>
      <ProfileContent key={profile.publicId} userId={profile.publicId} own={false} about={<ProfileAbout profile={profile}/>} renderPost={(post, actions) => <FeedPost post={post} viewerInitials={viewerInitials} viewerId={viewerId} key={post.id} {...actions}/>} />
    </div>
  );
}

function ThemeSettings({ preference, onChange }: { preference: ThemePreference; onChange: (preference: ThemePreference) => void }) {
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
      <WorkspaceHeader section="Ayarlar" eyebrow="KİŞİSEL DENEYİMİN" title="Kampira sana göre" description="Görünümü ve okuma rahatlığını düzenle. Bu tercihler kullandığın cihazda otomatik olarak saklanır."/>
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
    </div>
  );
}

function SecondaryView({ name, profile, peopleScope, onPeopleScopeChange, people, peopleStatus, peopleQuery, shareableProfile, followPendingId, notesCourseId, marketTab, themePreference, messageRecipient, onMessagesUnreadChange, onThemeChange, onOpenPerson, onQueryPeople, onToggleFollow, onNavigate, onEditProfile, onSignOut, onPostUpdated, onPostDeleted, onSavedChange }: { name: string; profile: StudentProfile; peopleScope: "platform" | "campus"; onPeopleScopeChange: (scope: "platform" | "campus") => void; posts: Post[]; people: CampusPerson[]; peopleStatus: "loading" | "ready" | "empty" | "error"; peopleQuery: string; shareableProfile: boolean; followPendingId: string | null; notesCourseId: string; marketTab: CampusMarketTab; themePreference: ThemePreference; messageRecipient: DirectMessageRecipient | null; onMessagesUnreadChange: (count: number) => void; onThemeChange: (preference: ThemePreference) => void; onOpenPerson: (person: CampusPerson) => void; onQueryPeople: (query: string) => void; onToggleFollow: (publicId: string) => void; onNavigate: (name: string) => void; onEditProfile: () => void; onSignOut: () => void; onPostUpdated: (id: number | string, text: string) => void; onPostDeleted: (id: number | string) => void; onSavedChange: (post: Post, saved: boolean) => void }) {
  if (name === "Keşfet") return <DiscoverView scope={peopleScope} onScopeChange={onPeopleScopeChange} profile={profile} people={people} peopleStatus={peopleStatus} query={peopleQuery} followPendingId={followPendingId} onOpenPerson={onOpenPerson} onQueryChange={onQueryPeople} onToggleFollow={onToggleFollow} onNavigate={onNavigate}/>;
  if (name === "Mesajlar") return <DirectMessagesWorkspace initialRecipient={messageRecipient} onNavigate={onNavigate} onUnreadChange={onMessagesUnreadChange}/>;
  if (name === "Kampüs Anlık") return <CampusPulseWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Eşleş") return <SocialMatchWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kampüs") return <CampusGuideWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Kütüphane") return <LibraryOccupancyWorkspace universityShortName={profile.universityShortName}/>;
  if (name === "Pazar") return <CampusMarketWorkspace key={marketTab} universityShortName={profile.universityShortName} initialTab={marketTab}/>;
  if (name === "Notlar") return <NotesWorkspace courses={profile.courses} initialCourseId={notesCourseId}/>;
  if (name === "Topluluklar") return <CommunitiesWorkspace courses={profile.courses}/>;
  if (name === "Bildirimler") return <NotificationsWorkspace/>;
  if (name === "Güvenlik") return <SafetyWorkspace/>;
  if (name === "Ayarlar") return <ThemeSettings preference={themePreference} onChange={onThemeChange}/>;
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
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    setMode(nextMode);
    setAttempted(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (authRequirements.length) {
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${authRequirements[0].field}"]`)?.focus();
      return;
    }
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
        <div className="auth-brand"><Logo/></div>
        <div className="auth-copy"><span>ÖĞRENCİ AĞIN</span><h1 id="auth-title">{mode === "register" ? "Kampira hesabını oluştur." : "Kampüsüne geri dön."}</h1><p>{mode === "register" ? "Hesabın anında açılır. Davet kodu veya yönetici onayı gerekmez." : "E-posta adresin ve parolanla kaldığın yerden devam et."}</p></div>
        <div className="auth-tabs" role="tablist" aria-label="Hesap işlemi">
          <button className={mode === "register" ? "active" : ""} type="button" role="tab" aria-selected={mode === "register"} onClick={() => switchAuthMode("register")}>Kayıt ol</button>
          <button className={mode === "login" ? "active" : ""} type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchAuthMode("login")}>Giriş yap</button>
        </div>
        <form className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
          {mode === "register" && <label><span>Adın ve soyadın</span><input name="displayName" value={fields.displayName} onChange={(event) => updateAuthField("displayName", event.target.value)} autoComplete="name" minLength={2} maxLength={60} required aria-invalid={attempted && fields.displayName.trim().length < 2} aria-describedby="auth-requirements" placeholder="Deniz Öztürk"/></label>}
          <label><span>E-posta adresin</span><input name="email" type="email" value={fields.email} onChange={(event) => updateAuthField("email", event.target.value)} autoComplete="email" maxLength={254} required aria-invalid={attempted && !emailIsValid} aria-describedby="auth-requirements" placeholder="ogrenci@universite.edu.tr"/></label>
          <label><span>Parolan</span><input name="password" type="password" value={fields.password} onChange={(event) => updateAuthField("password", event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={10} maxLength={128} required aria-invalid={attempted && fields.password.length < 10} aria-describedby="auth-requirements" placeholder="En az 10 karakter"/></label>
          {mode === "register" && <label><span>Parolanı tekrar yaz</span><input name="passwordConfirmation" type="password" value={fields.passwordConfirmation} onChange={(event) => updateAuthField("passwordConfirmation", event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={attempted && (fields.passwordConfirmation.length < 10 || fields.passwordConfirmation !== fields.password)} aria-describedby="auth-requirements"/></label>}
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

type CourseCatalogItem = {
  code: string;
  name: string;
  semester: number;
  kind: "required" | "elective";
};

type CourseCatalogPayload = {
  available: boolean;
  authority?: string;
  sourceUrl?: string;
  verifiedAt?: string;
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
}: {
  identityName: string;
  initialProfile: StudentProfile | null;
  state: Extract<ProfileState, "needs-onboarding" | "unavailable">;
  mode?: "onboarding" | "edit";
  onComplete: (profile: StudentProfile) => void;
  onCancel?: () => void;
  onRetry: () => void;
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
  const recommendedSemesters = classYear >= 1 && classYear <= 4 ? [classYear * 2 - 1, classYear * 2] : [];
  const normalizedCourseQuery = courseQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleCourseOptions = (courseCatalog?.courses ?? []).filter((course) => {
    const matchesPeriod = courseSemesterFilter === "all" || recommendedSemesters.includes(course.semester);
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
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as CourseCatalogPayload;
        if (!response.ok) throw new Error(payload.error ?? "Ders kataloğu yüklenemedi.");
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
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
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
    const target = panel?.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  function continueOnboarding() {
    if (stepRequirement) {
      focusMissingOnboardingField();
      return;
    }
    if (step < 5) {
      setStep((current) => current + 1);
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
            {step === 5 && (isEditing ? "DEĞİŞİKLİKLERİN" : "HER ŞEY HAZIR")}
          </span>
          <h1 id="onboarding-title">
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
                <input value={universityQuery} onChange={(event) => setUniversityQuery(event.target.value)} placeholder="Üniversite adı, kısaltma veya bölge ara" autoComplete="off"/>
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
                {!manualAcademic && <label className="catalog-inline-search"><Icon name="search" size={16}/><input value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} placeholder="Fakülte, yüksekokul veya akademik birim ara"/></label>}
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
                <label className="catalog-inline-search"><Icon name="search" size={16}/><input value={programQuery} onChange={(event) => setProgramQuery(event.target.value)} placeholder="Bölüm veya program ara"/></label>
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
                    return <button className={selected ? "selected" : ""} type="button" aria-pressed={selected} onClick={() => toggleCatalogCourse(course)} key={`${course.semester}-${course.code}`}><span><small>{course.code}</small><strong>{course.name}</strong><em>{course.semester}. dönem · {course.kind === "required" ? "Zorunlu" : "Seçmeli"}</em></span><i>{selected ? <Icon name="check" size={15}/> : <Icon name="plus" size={15}/>}</i></button>;
                  })}
                </div>
                {visibleCourseOptions.length === 0 && <p className="official-course-empty">Bu filtreyle eşleşen ders yok. Tüm dönemleri açabilir veya dersi elle ekleyebilirsin.</p>}
                <footer><Icon name="check" size={15}/><span>{courseCatalog.verifiedAt} tarihinde resmî program sayfasından kontrol edildi. Dönemsel seçmeliler değişebileceği için listede olmayan dersini elle ekleyebilirsin.</span></footer>
              </section>}
              {!courseCatalogLoading && !courseCatalog?.available && <div className="course-catalog-unavailable"><Icon name="file" size={18}/><span><strong>Bu programın ders listesi henüz yapılandırılmadı.</strong><small>{courseCatalogError || "Resmî bağlantı mevcutsa yukarıdan kontrol edebilir; derslerini aşağıya elle ekleyebilirsin."}</small></span></div>}
              {validCustomCourses.length > 0 && <div className="selected-course-tray"><span>Seçtiklerin</span><div>{validCustomCourses.map((course) => <button type="button" onClick={() => setCustomCourses((current) => current.filter((item) => normalizeCourseCode(item.code) !== normalizeCourseCode(course.code)))} key={`${course.code}-${course.name}`}>{course.code}<Icon name="close" size={12}/></button>)}</div></div>}
              <button className="manual-course-toggle" type="button" onClick={toggleManualCourseEntry}><Icon name={manualCourseEntry ? "close" : "plus"} size={15}/>{manualCourseEntry ? "Elle ders ekleme alanını kapat" : "Dersim listede yok, elle ekle"}</button>
              {manualCourseEntry && <div className="custom-course-list">
                {customCourses.map((course, index) => course.source !== "catalog" && <div className="custom-course-row" key={index}>
                  <label><span>Ders kodu</span><input value={course.code} onChange={(event) => updateCustomCourse(index, "code", event.target.value)} maxLength={20} aria-invalid={Boolean(course.name.trim()) && !course.code.trim()} aria-describedby="onboarding-requirement" placeholder="BİL 101"/></label>
                  <label><span>Ders adı</span><input value={course.name} onChange={(event) => updateCustomCourse(index, "name", event.target.value)} maxLength={100} aria-invalid={Boolean(course.code.trim()) && !course.name.trim()} aria-describedby="onboarding-requirement" placeholder="Programlamaya Giriş"/></label>
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
                <label className="summary-name-field"><span>Görünen adın{stepRequirement ? <em>Gerekli</em> : null}</span><input value={displayName} onChange={(event) => { setDisplayName(event.target.value); setError(""); }} maxLength={60} autoComplete="name" aria-label="Görünen ad" aria-invalid={displayName.trim().length < 2} aria-describedby="onboarding-requirement"/><small>{usesOfficialCatalog ? selectedFaculty?.name : customFacultyName} · {usesOfficialCatalog ? selectedDepartment?.name : customDepartmentName} · {classYear}. sınıf</small></label>
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
            {step > 1 && <button className="onboarding-back" type="button" onClick={() => { setStep((current) => current - 1); setError(""); }} disabled={saving}>Geri</button>}
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
  const [marketTab, setMarketTab] = useState<CampusMarketTab>("store");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof document === "undefined") return "system";
    const saved = document.documentElement.dataset.themePreference;
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [feedTab, setFeedTab] = useState<FeedScope>("all");
  const feedGeneration = useRef(0);
  const [linkedPost, setLinkedPost] = useState<Post | null>(null);
  const [peopleScope, setPeopleScope] = useState<"platform" | "campus">("platform");
  const [draftAudience, setDraftAudience] = useState<PostAudience>("platform");
  const [feedMediaFilter, setFeedMediaFilter] = useState("all");
  const [showFeedFilters, setShowFeedFilters] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftMedia, setDraftMedia] = useState<File | null>(null);
  const [draftMediaUrl, setDraftMediaUrl] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showMobileCreate, setShowMobileCreate] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [identityName, setIdentityName] = useState("Öğrenci");
  const [editingProfile, setEditingProfile] = useState<"details" | "academic" | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileRevision, setProfileRevision] = useState(0);
  const [profileReloadToken, setProfileReloadToken] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [people, setPeople] = useState<CampusPerson[]>([]);
  const [peopleStatus, setPeopleStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [followPendingId, setFollowPendingId] = useState<string | null>(null);
  const [followError, setFollowError] = useState("");
  const [messageRecipient, setMessageRecipient] = useState<DirectMessageRecipient | null>(null);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<CourseSubject | null>(null);
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [notesCourseId, setNotesCourseId] = useState("");
  const [composerCourseId, setComposerCourseId] = useState<string | null>(null);
  const [campusLiveItems, setCampusLiveItems] = useState<CampusLivePreview[]>([]);
  const [campusLiveStatus, setCampusLiveStatus] = useState<"loading" | "ready" | "error">("loading");
  const [campusReactionPendingId, setCampusReactionPendingId] = useState<string | null>(null);
  const sharedPostFocused = useRef(false);

  useEffect(() => () => { if (draftMediaUrl) URL.revokeObjectURL(draftMediaUrl); }, [draftMediaUrl]);

  useEffect(() => {
    try {
      document.documentElement.dataset.reduceMotion = window.localStorage.getItem("kampira-reduceMotion") === "true" ? "true" : "false";
      document.documentElement.dataset.contentDensity = window.localStorage.getItem("kampira-contentDensity") === "compact" ? "compact" : "comfortable";
    } catch { /* Keep the standard appearance when storage is unavailable. */ }
    const restoreLocation = () => {
      sharedPostFocused.current = false;
      setFollowError(""); setPublicProfileLoading(false);
      setActiveNav(workspaceFromSearch(window.location.search));
      setEditingProfile(null); setPublicProfile(null); setShowMobileCreate(false); setShowMobileMenu(false); setShowSearch(false);
      setProfileReloadToken((value) => value + 1); setProfileRevision((value) => value + 1);
      const market = new URLSearchParams(window.location.search).get("market");
      setMarketTab(market === "prices" || market === "messages" ? market : "store");
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);

  const restoreFeed = useEffectEvent(() => {
    const next = feedScopeFromSearch(window.location.search);
    feedGeneration.current++; setFeedTab(next); setPosts([]); setLinkedPost(null); setNextCursor(null); setLoadingMore(false); setPostsLoading(true);
    if (!draft.trim() && !draftMedia && !composerCourseId) setDraftAudience(next === "campus" ? "campus" : "platform");
  });

  useEffect(() => {
    const restore = () => restoreFeed();
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function changeFeed(next: FeedScope) {
    if (next === feedTab) return;
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("feed"); else url.searchParams.set("feed", next);
    url.searchParams.delete("post");
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
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
    if (!showMobileCreate && !showMobileMenu && !showAllSubjects && !selectedSubject) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowMobileCreate(false);
        setShowMobileMenu(false);
        setShowAllSubjects(false);
        setSelectedSubject(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedSubject, showAllSubjects, showMobileCreate, showMobileMenu]);

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
          if (!sharedProfileId) {
            setActiveNav(new URLSearchParams(window.location.search).has("post") ? "Akış" : workspaceFromSearch(window.location.search));
            const market = new URLSearchParams(window.location.search).get("market");
            setMarketTab(market === "prices" || market === "messages" ? market : "store");
          }
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

    const controller = new AbortController();
    feedGeneration.current++;
    async function loadPosts() {
      try {
        const feedQuery = feedTab === "following" ? "following" : feedTab === "campus" ? "campus" : "all";
        const sharedPostId = new URLSearchParams(window.location.search).get("post")?.trim() ?? "";
        const sharedPostRequest = sharedPostId
          ? fetch(`/api/posts?id=${encodeURIComponent(sharedPostId)}`, { signal: controller.signal, headers: { accept: "application/json" } }).catch(() => null)
          : null;
        const response = await fetch(`/api/posts?feed=${feedQuery}`, { signal: controller.signal, headers: { accept: "application/json" } });
        const data = (await response.json()) as { posts?: Post[]; nextCursor?: string | null; error?: string };
        if (!active) return;
        if (!response.ok || !data.posts) {
          setFeedError(data.error ?? "Akış şu anda yenilenemedi.");
          return;
        }
        const nextPosts = data.posts;
        setLinkedPost(null);
        if (sharedPostRequest) {
          try {
            const sharedResponse = await sharedPostRequest;
            const sharedData = sharedResponse ? (await sharedResponse.json()) as { post?: Post } : {};
            if (active && sharedResponse?.ok && sharedData.post && !nextPosts.some((post) => String(post.id) === String(sharedData.post!.id))) {
              setLinkedPost(sharedData.post);
            }
          } catch {
            // The regular feed remains usable when an old or malformed shared link cannot be resolved.
          }
        }
        if (!active) return;
        setPosts(nextPosts);
        setNextCursor(data.nextCursor ?? null);
        setFeedError("");
      } catch {
        // A clear empty state remains available while a transient request is retried on reload.
        if (active) setFeedError("Akış şu anda yenilenemedi.");
      } finally {
        if (active) { setPostsLoading(false); setLoadingMore(false); }
      }
    }

    void loadPosts();
    return () => { active = false; controller.abort(); };
  }, [profileState, feedTab, profileRevision]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadCampusLive() {
      try {
        const response = await fetch("/api/campus-pulse?kind=live", { headers: { accept: "application/json" } });
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
  }, [profileState, profileRevision]);

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
  }, [posts, linkedPost, postsLoading]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;

    async function loadPeople() {
      try {
        const queryString = `?scope=${peopleScope}&q=${encodeURIComponent(peopleQuery)}`;
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
  }, [profileState, peopleQuery, peopleScope, profileRevision]);

  useEffect(() => {
    if (profileState !== "ready") return;
    let active = true;
    async function loadUnreadMessages() {
      try {
        const response = await fetch("/api/messages?summary=1", { cache: "no-store" });
        const data = await response.json() as { unreadCount?: number };
        if (active && response.ok) setMessageUnreadCount(Number(data.unreadCount ?? 0));
      } catch {
        // Mesaj ekranı kullanılabilir kalır; sayaç bir sonraki yenilemede tekrar denenir.
      }
    }
    void loadUnreadMessages();
    const interval = window.setInterval(() => void loadUnreadMessages(), 25000);
    return () => { active = false; window.clearInterval(interval); };
  }, [profileState]);


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
        onComplete={(profile) => { setStudentProfile(profile); setIdentityName(profile.displayName); setPosts([]); setPostsLoading(true); setNextCursor(null); setPeopleQuery(""); setPeopleStatus("loading"); setProfileState("ready"); }}
        onRetry={() => { setProfileState("loading"); setProfileReloadToken((current) => current + 1); }}
      />
    );
  }

  if (editingProfile === "details") {
    return (
      <ProfileEditor
        profile={studentProfile}
        onSaved={(profile) => {
          setStudentProfile(profile);
          setIdentityName(profile.displayName);
          setPosts([]);
          setPostsLoading(true);
          setPeopleQuery("");
          setPeopleStatus("loading");
          setProfileRevision((current) => current + 1);
          setActiveNav("Profil");
          setEditingProfile(null);
          setProfileNotice("Profil görünümün güncellendi.");
        }}
        onCancel={() => setEditingProfile(null)}
        onEditAcademic={() => setEditingProfile("academic")}
      />
    );
  }

  if (editingProfile === "academic") {
    return (
      <AcademicOnboarding
        identityName={studentProfile.displayName}
        initialProfile={studentProfile}
        state="needs-onboarding"
        mode="edit"
        onComplete={(profile) => {
          setStudentProfile(profile);
          setIdentityName(profile.displayName);
          setPosts([]);
          setPostsLoading(true);
          setNextCursor(null);
          setPeopleQuery("");
          setPeopleStatus("loading");
          setProfileRevision((current) => current + 1);
          setActiveNav("Profil");
          setEditingProfile(null);
          setProfileNotice("Akademik bilgilerin güncellendi.");
        }}
        onCancel={() => setEditingProfile("details")}
        onRetry={() => setEditingProfile("details")}
      />
    );
  }

  const visibleFeedPosts = posts.filter((post) => feedMediaFilter === "all" || post.media?.some((media) => media.kind === feedMediaFilter));
  const activeProfile = studentProfile;
  const activeFeed = FEED_SCOPES.find((scope) => scope.key === feedTab)!;
  const initials = getInitials(activeProfile.displayName);
  const composerCourse = activeProfile.courses.find((course) => course.id === composerCourseId) ?? null;
  const emptyFeedCopy = feedTab === "following"
    ? { title: "Takip akışın henüz boş", description: "Öğrenci ağından ilgini çeken kişileri takip ettiğinde paylaşımları burada görünecek." }
    : feedTab === "campus"
      ? { title: "Kampüsünde henüz paylaşım yok", description: `${activeProfile.universityShortName} akışındaki ilk gönderiyi paylaşarak kampüs sohbetini başlatabilirsin.` }
      : { title: "Genel Akış yeni paylaşımları bekliyor", description: "İlk paylaşımını tüm öğrencilerle buluştur. Kampüs içindeki paylaşımlarını Kampüsüm bölümünde bulabilirsin." };

  async function reactToCampusLive(item: CampusLivePreview, reaction: "confirm" | "outdated") {
    if (campusReactionPendingId) return;
    setCampusReactionPendingId(item.id);
    try {
      const response = await fetch("/api/campus-pulse", {
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
    if ((!clean && !draftMedia) || publishing) return;
    setComposerError("");

    setPublishing(true);
    try {
      const audience = composerCourseId ? "campus" : draftAudience;
      const payload = { content: clean, courseId: composerCourseId, audience };
      const form = new FormData();
      form.set("content", clean);
      form.set("audience", audience);
      if (payload.courseId) form.set("courseId", payload.courseId);
      if (draftMedia) form.set("media", draftMedia);
      const response = await fetch("/api/posts", draftMedia ? { method: "POST", body: form } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { post?: Post; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error ?? "Gönderin paylaşılamadı.");

      const destination = audience === "campus" ? "campus" : "all";
      if (feedTab !== destination) changeFeed(destination);
      else setPosts((current) => [data.post as Post, ...current]);
      setStudentProfile((current) => current ? { ...current, postCount: current.postCount + 1 } : current);
      setDraft("");
      setDraftMedia(null);
      setDraftMediaUrl("");
      setComposerCourseId(null);
      setComposerExpanded(false);
    } catch (publishError) {
      setComposerError(publishError instanceof Error ? publishError.message : "Gönderin paylaşılamadı.");
    } finally {
      setPublishing(false);
    }
  }

  async function loadMorePosts() {
    if (!nextCursor || loadingMore) return;
    const generation = feedGeneration.current;
    setLoadingMore(true);
    setFeedError("");

    try {
      const feedQuery = feedTab === "following" ? "following" : feedTab === "campus" ? "campus" : "all";
      const response = await fetch(`/api/posts?feed=${feedQuery}&cursor=${encodeURIComponent(nextCursor)}`, { headers: { accept: "application/json" } });
      const data = (await response.json()) as { posts?: Post[]; nextCursor?: string | null; error?: string };
      if (generation !== feedGeneration.current) return;
      if (!response.ok || !data.posts) throw new Error(data.error ?? "Akışın devamı getirilemedi.");

      setPosts((current) => {
        const knownIds = new Set(current.map((post) => String(post.id)));
        return [...current, ...data.posts!.filter((post) => !knownIds.has(String(post.id)))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (generation === feedGeneration.current) setFeedError(loadError instanceof Error ? loadError.message : "Akışın devamı getirilemedi.");
    } finally {
      if (generation === feedGeneration.current) setLoadingMore(false);
    }
  }

  function updatePost(id: number | string, text: string) {
    setLinkedPost((current) => current?.id === id ? { ...current, text, edited: true } : current);
    setPosts((current) => current.map((post) => post.id === id ? { ...post, text, edited: true } : post));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((post) => post.id === id ? { ...post, text, edited: true } : post) } : current);
  }

  function deletePost(id: number | string) {
    setLinkedPost((current) => current?.id === id ? null : current);
    const removedPost = posts.find((post) => post.id === id);
    setPosts((current) => current.filter((post) => post.id !== id));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.filter((post) => post.id !== id), postCount: Math.max(0, current.postCount - (current.posts.some((post) => post.id === id) ? 1 : 0)) } : current);
    if (removedPost?.authorId === activeProfile.publicId || activeNav === "Profil") {
      setStudentProfile((current) => current ? { ...current, postCount: Math.max(0, current.postCount - 1) } : current);
    }
  }

  function updateSavedPost(post: Post, saved: boolean) {
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, saved } : item));
    setPublicProfile((current) => current ? { ...current, posts: current.posts.map((item) => item.id === post.id ? { ...item, saved } : item) } : current);
  }

  async function openPerson(person: CampusPerson) {
    setActiveNav("Öğrenci");
    setPublicProfile(null);
    setPublicProfileLoading(true);
    setFollowError("");

    const profileUrl = new URL(window.location.href);
    profileUrl.searchParams.delete("post"); profileUrl.searchParams.delete("view"); profileUrl.searchParams.delete("market");
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
    if (nextQuery === peopleQuery) setProfileRevision((value) => value + 1);

  }

  async function signOut() {
    setDraft("");
    setDraftMedia(null);
    setDraftMediaUrl("");
    setComposerCourseId(null);
    setComposerExpanded(false);
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

  function navigateTo(name: string, targetMarketTab?: CampusMarketTab) {
    if (name === "Gönderi oluştur") { openFeedComposer(); return; }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("profile"); currentUrl.searchParams.delete("post"); currentUrl.searchParams.delete("market");
    const slug = workspaceRoutes[name as keyof typeof workspaceRoutes];
    if (slug && slug !== "feed") currentUrl.searchParams.set("view", slug); else currentUrl.searchParams.delete("view");
    if (name === "Pazar" && targetMarketTab && targetMarketTab !== "store") currentUrl.searchParams.set("market", targetMarketTab);
    const nextLocation = `${currentUrl.pathname}${currentUrl.search}`;
    if (nextLocation !== `${window.location.pathname}${window.location.search}`) window.history.pushState({}, "", nextLocation);
    sharedPostFocused.current = false;
    if (name === "Pazar") setMarketTab(targetMarketTab ?? "store");
    setPublicProfile(null);
    setPublicProfileLoading(false);
    setFollowError("");
    setActiveNav(name);
    setShowMobileCreate(false);
    setShowMobileMenu(false);
    setShowSearch(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openMessages(person: DirectMessageRecipient) {
    setMessageRecipient(person);
    navigateTo("Mesajlar");
  }

  function openFeedComposer() {
    setComposerExpanded(true);
    navigateTo("Akış");
    window.requestAnimationFrame(() => {
      const composer = document.querySelector<HTMLTextAreaElement>("#post-draft");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => composer?.focus(), 260);
    });
  }

  function choosePostMedia(event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const allowed = kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : ["video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) { setComposerError(kind === "image" ? "PNG, JPG veya WebP formatında bir fotoğraf seç." : "MP4 veya WebM formatında bir video seç."); return; }
    if (file.size > (kind === "image" ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES)) { setComposerError(kind === "image" ? "Fotoğraf en fazla 8 MB olabilir." : "Video en fazla 20 MB olabilir."); return; }
    setDraftMediaUrl(URL.createObjectURL(file)); setDraftMedia(file); setComposerError(""); setComposerExpanded(true);
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
            <button className={activeNav === item.label ? "active" : ""} aria-current={activeNav === item.label ? "page" : undefined} key={item.label} onClick={() => navigateTo(item.label)} type="button">
              <span className="nav-icon"><Icon name={item.icon}/>{item.label === "Bildirimler" && <i />}</span>
              <span>{item.label}</span>
              {item.label === "Mesajlar" && messageUnreadCount > 0 && <b className="nav-count">{messageUnreadCount > 99 ? "99+" : messageUnreadCount}</b>}
            </button>
          ))}
        </nav>
        <button className="primary-create" type="button" onClick={openFeedComposer}>
          <Icon name="plus" size={19}/> Oluştur
        </button>
        <div className="semester-card">
          <span className="semester-icon"><Icon name="calendar" size={19}/></span>
          <div><strong>Kampira v1.8</strong><span>Topluluk merkezi yayında</span></div>
          <span className="semester-progress"><i /></span>
        </div>
        <button className="profile-mini" type="button" onClick={() => navigateTo("Profil")}>
          <Avatar initials={initials} className="avatar-violet" imageUrl={activeProfile.avatarUrl}/>
          <span><strong>{studentProfile.displayName}</strong><small>@{studentProfile.handle}</small></span>
          <Icon name="more" size={18}/>
        </button>
      </aside>

      <section className="feed-column">
        <header className="mobile-header">
          <Logo />
          <div className="mobile-header-actions">
            <button className="mobile-campus-selector" type="button" onClick={() => setEditingProfile("academic")} aria-label={`Üniversiteyi değiştir: ${activeProfile.universityShortName}`}><MapPin size={14} weight="fill"/><span>{activeProfile.universityShortName}</span></button>
            <button className="icon-button" type="button" onClick={() => setShowSearch(!showSearch)} aria-label="Ara"><MagnifyingGlass size={22}/></button>
            <button className="icon-button message-button" type="button" onClick={() => navigateTo("Mesajlar")} aria-label={`Mesajlar${messageUnreadCount ? `, ${messageUnreadCount} okunmamış` : ""}`}><ChatCircleDots size={22}/>{messageUnreadCount > 0 && <b>{messageUnreadCount > 9 ? "9+" : messageUnreadCount}</b>}</button>
            <button className="icon-button notification-button" type="button" onClick={() => navigateTo("Bildirimler")} aria-label="Bildirimler"><Bell size={22}/><i /></button>
          </div>
        </header>

        {showSearch && (
          <div className="mobile-search">
            <Icon name="search" size={18}/><input autoFocus value={peopleQuery} onChange={(event) => { queryPeople(event.target.value); if (activeNav !== "Keşfet") navigateTo("Keşfet"); }} placeholder="Ders, not, topluluk veya öğrenci ara"/><button onClick={() => setShowSearch(false)} aria-label="Aramayı kapat"><Icon name="close" size={17}/></button>
          </div>
        )}

        {activeNav === "Akış" ? <>
        <div className="workspace-mobile-title"><div><h1>{activeFeed.label}</h1><p>{feedTab === "campus" ? activeProfile.universityShortName : "Tüm üniversiteler · Tek öğrenci ağı"}</p></div></div>
        <div className="feed-welcome">
          <div>
            <span>{dateLabel}</span>
            <h1>Merhaba, {getFirstName(studentProfile.displayName)} <span>👋</span></h1>
            <p>{activeFeed.description}</p>
          </div>
          <div className="welcome-stat">
            <span><Icon name="sparkles" size={17}/></span>
            <div><strong>{curatedNotes.length} doğrulanmış not</strong><small>Kampira Editoryal&apos;de</small></div>
          </div>
        </div>
        <div className="feed-tabs" role="tablist" aria-label="Akış türü">
          {FEED_SCOPES.map((scope) => <button key={scope.key} id={`feed-tab-${scope.key}`} aria-controls="feed-posts" disabled={publishing} className={feedTab === scope.key ? "active" : ""} onClick={() => changeFeed(scope.key)} type="button" role="tab" aria-selected={feedTab === scope.key}>{scope.label}</button>)}
          <button className="feed-filter" type="button" aria-label="Akış seçenekleri" aria-expanded={showFeedFilters} onClick={() => setShowFeedFilters((value) => !value)}><Icon name="settings" size={18}/></button>
        </div>
        <div className="feed-scope-context">{feedTab === "campus" ? <MapPin size={18}/> : <GlobeHemisphereWest size={18}/>}<div><strong>{activeFeed.title}</strong><p>{feedTab === "campus" ? `${activeProfile.universityShortName} · ${activeFeed.description}` : activeFeed.description}</p></div></div>
        {feedTab === "campus" && <CampusLiveHome items={campusLiveItems} status={campusLiveStatus} universityShortName={activeProfile.universityShortName} reactionPendingId={campusReactionPendingId} onNavigate={navigateTo} onReact={(item, reaction) => void reactToCampusLive(item, reaction)}/>}
        {feedTab === "campus" && <section className="subject-section" aria-labelledby="subjects-title">
          <div className="section-heading">
            <div><span className="eyebrow">Ders çevrelerin</span><h2 id="subjects-title">Bugün ne çalışıyorsun?</h2></div>
            <button type="button" onClick={() => setShowAllSubjects(true)}>Tümünü gör <Icon name="arrow" size={15}/></button>
          </div>
          <div className="subject-row">
            {profileSubjects.slice(0, 6).map((subject) => (
              <button className="subject-item" type="button" key={subject.id} onClick={() => setSelectedSubject(subject)} aria-label={`${subject.code} ${subject.label} dersini aç`}>
                <span className={`subject-cover subject-${subject.tone}`}><Image src={subject.imageUrl} alt="" fill unoptimized sizes="78px"/>{subject.noteCount > 0 && <i aria-label={`${subject.noteCount} doğrulanmış not`}>{subject.noteCount}</i>}</span>
                <strong>{subject.code}</strong><small>{subject.label}</small>
              </button>
            ))}
          </div>
        </section>}

        <section className={`composer-card${composerExpanded ? " is-expanded" : ""}`} aria-label="Gönderi oluştur">
          {composerExpanded && <button className="composer-mobile-close" type="button" onClick={() => setComposerExpanded(false)} aria-label="Gönderi alanını kapat"><Icon name="close" size={17}/></button>}
          <div className="composer-main">
            <Avatar initials={initials} className="avatar-violet" imageUrl={activeProfile.avatarUrl}/>
            <label className="sr-only" htmlFor="post-draft">Gönderi metni</label>
            <textarea id="post-draft" value={draft} maxLength={1200} onChange={(event) => { setDraft(event.target.value); setComposerError(""); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void publishPost(); }} placeholder={draftAudience === "platform" && !composerCourse ? "Kampira’da ne paylaşmak istersin?" : "Kampüsünle ne paylaşmak istersin?"} rows={1}/>
          </div>
          <div className="composer-audience"><label htmlFor="post-audience">{composerCourse || draftAudience === "campus" ? <MapPin size={16}/> : <GlobeHemisphereWest size={16}/>} Kimler görebilir?</label><select id="post-audience" disabled={publishing || Boolean(composerCourse)} value={composerCourse ? "campus" : draftAudience} onChange={(event) => { setDraftAudience(event.target.value as PostAudience); setComposerError(""); }}><option value="platform">Tüm öğrenciler</option><option value="campus">Yalnızca kampüsüm</option></select><p>{composerCourse ? "Ders çevresi paylaşımları kampüs içinde kalır." : draftAudience === "platform" ? "Tüm üniversitelerde görünür. Öğrenciler paylaşımını ve temel profil bilgilerini görebilir." : `${activeProfile.universityShortName} öğrencilerine görünür.`}</p></div>
          {composerCourse && <div className="composer-course-chip"><span><Icon name="notes" size={15}/><strong>{composerCourse.code}</strong> ders çevresinde paylaşıyorsun</span><button type="button" onClick={() => setComposerCourseId(null)} aria-label="Ders seçimini kaldır"><Icon name="close" size={14}/></button></div>}
          {draftMedia && <div className="composer-media-preview">{draftMediaUrl && (draftMedia.type.startsWith("image/") ? <Image src={draftMediaUrl} alt="Seçilen fotoğraf" width={600} height={400} unoptimized/> : <video src={draftMediaUrl} controls playsInline preload="metadata"/>)}<div><span>{draftMedia.name}</span><button type="button" disabled={publishing} onClick={() => { setDraftMedia(null); setDraftMediaUrl(""); }} aria-label="Seçilen medyayı kaldır"><Icon name="close" size={17}/></button></div></div>}
          <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choosePostMedia(event, "image")}/>
          <input ref={videoInput} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => choosePostMedia(event, "video")}/>
          <div className="composer-tools">
            <div>
              <button type="button" disabled={publishing} onClick={() => imageInput.current?.click()}><span className="tool-icon tool-image"><Icon name="image" size={18}/></span><span>Fotoğraf</span></button>
              <button type="button" disabled={publishing} onClick={() => videoInput.current?.click()}><span className="tool-icon tool-video">▷</span><span>Video</span></button>
              <button type="button" onClick={() => navigateTo("Notlar")}><span className="tool-icon tool-note"><Icon name="file" size={18}/></span><span>Not yükle</span></button>
            </div>
            <button className="publish-button" type="button" disabled={(!draft.trim() && !draftMedia) || publishing} onClick={() => void publishPost()}>{publishing ? "Paylaşılıyor…" : "Paylaş"}</button>
          </div>
          {composerError && <p className="composer-feedback" role="alert">{composerError}</p>}
        </section>

        {showFeedFilters && <div className="workspace-filter-pills" role="group" aria-label="Paylaşım türü">{([['all','Tüm paylaşımlar'],['image','Fotoğraflar'],['video','Videolar']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={feedMediaFilter === value} className={feedMediaFilter === value ? "active" : ""} onClick={() => setFeedMediaFilter(value)}>{label}</button>)}<RefreshButton onClick={() => { setPostsLoading(true); setProfileRevision((value) => value + 1); }} busy={postsLoading}/></div>}
        {feedMediaFilter !== "all" && !postsLoading && visibleFeedPosts.length === 0 && posts.length > 0 && <WorkspaceEmpty title="Yüklenen paylaşımlarda bu türde içerik yok" description={nextCursor ? "Daha fazla gönderi yükleyebilir veya tüm paylaşımlara dönebilirsin." : "Tüm paylaşım türlerine dönerek akışı görebilirsin."} action={<button type="button" onClick={() => setFeedMediaFilter("all")}>Tümünü göster</button>}/>}
        {!postsLoading && linkedPost && <section className="linked-post-preview" aria-label="Bağlantıyla açılan paylaşım"><p>Bağlantıyla açtığın paylaşım · {audienceLabel(linkedPost.audience)}</p><FeedPost post={linkedPost} viewerInitials={initials} viewerId={studentProfile.publicId} onPostUpdated={updatePost} onPostDeleted={deletePost}/></section>}
        <div className="feed-list" id="feed-posts" role="tabpanel" aria-labelledby={`feed-tab-${feedTab}`}>{postsLoading ? <div className="feed-empty feed-loading" aria-live="polite"><span className="profile-boot-line"><i/></span><strong>{activeFeed.label} hazırlanıyor…</strong></div> : posts.length > 0 ? visibleFeedPosts.map((post) => <FeedPost post={post} viewerInitials={initials} viewerId={studentProfile.publicId} onPostUpdated={updatePost} onPostDeleted={deletePost} key={post.id}/>) : <div className="feed-empty"><span><Icon name="users" size={22}/></span><strong>{emptyFeedCopy.title}</strong><p>{emptyFeedCopy.description}</p></div>}</div>
        {!postsLoading && feedError && <p className="feed-error" role="alert">{feedError}</p>}
        {!postsLoading && nextCursor && <button className="feed-load-more" type="button" onClick={() => void loadMorePosts()} disabled={loadingMore}>{loadingMore ? "Gönderiler getiriliyor…" : "Daha fazla gönderi göster"}</button>}
        </> : activeNav === "Öğrenci" ? <PublicProfileView profile={publicProfile} loading={publicProfileLoading} shareable viewerInitials={initials} viewerId={studentProfile.publicId} followPending={followPendingId === publicProfile?.publicId} onBack={() => navigateTo("Keşfet")} onToggleFollow={(publicId) => void toggleFollow(publicId)} onMessage={openMessages}/> : <>{activeNav === "Profil" && profileNotice && <p className="profile-update-notice" role="status"><Icon name="check" size={16}/>{profileNotice}</p>}<SecondaryView peopleScope={peopleScope} onPeopleScopeChange={(scope) => { setPeopleScope(scope); setPeopleStatus("loading"); }} name={activeNav} profile={studentProfile} posts={posts} people={people} peopleStatus={peopleStatus} peopleQuery={peopleQuery} shareableProfile followPendingId={followPendingId} notesCourseId={notesCourseId} marketTab={marketTab} themePreference={themePreference} messageRecipient={messageRecipient} onMessagesUnreadChange={setMessageUnreadCount} onThemeChange={setThemePreference} onOpenPerson={(person) => void openPerson(person)} onQueryPeople={queryPeople} onToggleFollow={(publicId) => void toggleFollow(publicId)} onNavigate={navigateTo} onEditProfile={() => { setProfileNotice(""); setEditingProfile("details"); }} onSignOut={() => void signOut()} onPostUpdated={updatePost} onPostDeleted={deletePost} onSavedChange={updateSavedPost}/></>}
        {(activeNav === "Öğrenci" || activeNav === "Keşfet") && followError && <p className="profile-action-error" role="alert">{followError}</p>}
      </section>

      <aside className="right-sidebar">
        <div className="search-box">
          <Icon name="search" size={18}/><input aria-label="Kampira'da ara" value={peopleQuery} onChange={(event) => { queryPeople(event.target.value); if (activeNav !== "Keşfet") navigateTo("Keşfet"); }} placeholder="Ders, not veya öğrenci ara"/>{peopleQuery ? <button type="button" onClick={() => queryPeople("")} aria-label="Aramayı temizle"><Icon name="close" size={15}/></button> : <kbd>⌘ K</kbd>}
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
      </aside>

      <nav className="mobile-nav" aria-label="Mobil ana menü">
        <button className={activeNav === "Akış" ? "active" : ""} onClick={() => navigateTo("Akış")} type="button" aria-label="Akış" aria-current={activeNav === "Akış" ? "page" : undefined}>
          <House size={23} weight={activeNav === "Akış" ? "fill" : "regular"}/><small>Akış</small>
        </button>
        <button className={activeNav === "Keşfet" || activeNav === "Öğrenci" ? "active" : ""} onClick={() => navigateTo("Keşfet")} type="button" aria-label="Keşfet" aria-current={activeNav === "Keşfet" || activeNav === "Öğrenci" ? "page" : undefined}>
          <Compass size={23} weight={activeNav === "Keşfet" || activeNav === "Öğrenci" ? "fill" : "regular"}/><small>Keşfet</small>
        </button>
        <button className="mobile-create-action" onClick={() => { setShowMobileMenu(false); setShowMobileCreate(true); }} type="button" aria-label="Oluştur" aria-expanded={showMobileCreate} aria-controls="mobile-create-sheet">
          <span className="mobile-create"><Plus size={25} weight="bold"/></span><small>Oluştur</small>
        </button>
        <button className={activeNav === "Kampüs Anlık" ? "active" : ""} onClick={() => navigateTo("Kampüs Anlık")} type="button" aria-label="Kampüs Anlık" aria-current={activeNav === "Kampüs Anlık" ? "page" : undefined}>
          <ChatCircleDots size={23} weight={activeNav === "Kampüs Anlık" ? "fill" : "regular"}/><small>Anlık</small>
        </button>
        <button className={!['Akış', 'Keşfet', 'Öğrenci', 'Kampüs Anlık'].includes(activeNav) ? "active" : ""} onClick={() => { setShowMobileCreate(false); setShowMobileMenu(true); }} type="button" aria-label="Tüm alanlar" aria-expanded={showMobileMenu} aria-controls="mobile-menu-sheet">
          <SquaresFour size={23} weight={!['Akış', 'Keşfet', 'Öğrenci', 'Kampüs Anlık'].includes(activeNav) ? "fill" : "regular"}/><small>Menü</small>
        </button>
      </nav>

      {(showMobileCreate || showMobileMenu) && (
        <button className="mobile-sheet-backdrop" type="button" aria-label="Paneli kapat" onClick={() => { setShowMobileCreate(false); setShowMobileMenu(false); }}/>
      )}

      {showMobileCreate && (
        <section className="mobile-sheet mobile-create-sheet" id="mobile-create-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-create-title">
          <span className="mobile-sheet-handle" aria-hidden="true"/>
          <header><div><span>Hızlı oluştur</span><h2 id="mobile-create-title">Ne paylaşmak istersin?</h2></div><button type="button" onClick={() => setShowMobileCreate(false)} aria-label="Oluştur panelini kapat"><Icon name="close" size={20}/></button></header>
          <div className="mobile-create-grid">
            <button type="button" onClick={openFeedComposer}><span className="mobile-sheet-icon violet"><Icon name="edit" size={22}/></span><strong>Gönderi paylaş</strong><small>Öğrencilerle buluş</small></button>
            <button type="button" onClick={() => navigateTo("Kampüs Anlık")}><span className="mobile-sheet-icon coral"><Icon name="sparkles" size={22}/></span><strong>Kampüs Anlık</strong><small>Şu an olanı paylaş</small></button>
            <button type="button" onClick={() => navigateTo("Notlar")}><span className="mobile-sheet-icon blue"><Icon name="file" size={22}/></span><strong>Not yükle</strong><small>Ders kaynağı ekle</small></button>
            <button type="button" onClick={() => navigateTo("Pazar")}><span className="mobile-sheet-icon mint"><Icon name="bookmark" size={22}/></span><strong>İlan ver</strong><small>Öğrenci pazarına ekle</small></button>
          </div>
        </section>
      )}

      {showMobileMenu && (
        <section className="mobile-sheet mobile-menu-sheet" id="mobile-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title">
          <span className="mobile-sheet-handle" aria-hidden="true"/>
          <header><div><span>Kampira</span><h2 id="mobile-menu-title">Tüm alanlar</h2></div><button type="button" onClick={() => setShowMobileMenu(false)} aria-label="Menüyü kapat"><Icon name="close" size={20}/></button></header>
          <button className="mobile-profile-link" type="button" onClick={() => navigateTo("Profil")}>
            <Avatar initials={initials} className="avatar-violet" imageUrl={activeProfile.avatarUrl}/>
            <span><strong>{studentProfile.displayName}</strong><small>@{studentProfile.handle} · Profilini görüntüle</small></span>
            <Icon name="arrow" size={18}/>
          </button>
          <div className="mobile-menu-grid">
            {mobileMenuItems.map((item) => (
              <button className={activeNav === item.label ? "active" : ""} type="button" onClick={() => navigateTo(item.label)} key={item.label} aria-current={activeNav === item.label ? "page" : undefined}>
                <span><Icon name={item.icon} size={20}/>{item.label === "Bildirimler" && <i/>}{item.label === "Mesajlar" && messageUnreadCount > 0 && <b>{messageUnreadCount > 99 ? "99+" : messageUnreadCount}</b>}</span>
                <strong>{item.label === "Topluluklar" ? "Topluluklar" : item.label}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {showAllSubjects && (
        <div className="feature-overlay course-hub-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAllSubjects(false); }}>
          <section className="feature-dialog course-directory-dialog" role="dialog" aria-modal="true" aria-labelledby="course-directory-title">
            <header><div><span>DERS ÇEVRELERİN</span><h2 id="course-directory-title">Bu dönemki tüm derslerin</h2></div><button type="button" onClick={() => setShowAllSubjects(false)} aria-label="Dersleri kapat"><Icon name="close" size={19}/></button></header>
            <div className="course-directory-grid">
              {profileSubjects.map((subject) => (
                <button type="button" key={subject.id} onClick={() => { setShowAllSubjects(false); setSelectedSubject(subject); }}>
                  <span className="course-directory-cover"><Image src={subject.imageUrl} alt="" fill unoptimized sizes="(max-width: 680px) 44vw, 250px"/></span>
                  <span><strong>{subject.code}</strong><small>{subject.label}</small><em>{subject.noteCount} doğrulanmış not · {subject.postCount} paylaşım</em></span>
                  <Icon name="arrow" size={17}/>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {selectedSubject && (
        <div className="feature-overlay course-hub-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedSubject(null); }}>
          <section className="feature-dialog course-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="course-detail-title">
            <header><div><span>DERS MERKEZİ</span><h2 id="course-detail-title">{selectedSubject.code} · {selectedSubject.label}</h2></div><button type="button" onClick={() => setSelectedSubject(null)} aria-label="Ders merkezini kapat"><Icon name="close" size={19}/></button></header>
            <div className="course-detail-body">
              <div className="course-detail-cover"><Image src={selectedSubject.imageUrl} alt={`${selectedSubject.code} ${selectedSubject.label} için temsili ders kapağı`} fill unoptimized sizes="(max-width: 680px) 100vw, 600px" priority/></div>
              <div className="course-detail-label"><Icon name="sparkles" size={15}/> Temsili ders kapağı</div>
              <p>Bu dersin doğrulanmış kaynaklarına ulaşabilir veya doğrudan ders çevresinde paylaşım başlatabilirsin.</p>
              <div className="course-detail-stats"><span><strong>{selectedSubject.noteCount}</strong><small>Doğrulanmış not</small></span><span><strong>{selectedSubject.postCount}</strong><small>Akış paylaşımı</small></span></div>
              <div className="course-detail-actions">
                <button className="feature-primary" type="button" onClick={() => { setNotesCourseId(selectedSubject.id); setSelectedSubject(null); navigateTo("Notlar"); }}><Icon name="notes" size={17}/> Notları gör</button>
                <button type="button" onClick={() => { setDraftAudience("campus"); changeFeed("campus"); setComposerCourseId(selectedSubject.id); setSelectedSubject(null); openFeedComposer(); }}><Icon name="edit" size={17}/> Akışta paylaş</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
