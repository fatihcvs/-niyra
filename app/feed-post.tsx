"use client";

import { useEffect, useRef, useState } from "react";
import { GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { audienceLabel, type PostAudience } from "../lib/feed-scope";
import type { PostMedia } from "../lib/post-media";
import { UiIcon as Icon } from "./ui-icon";
import { AppLink, useAppNavigation } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { usePostRequests } from "./use-post-requests";
import interactionStyles from "./post-interactions.module.css";
import { PostMediaGallery } from "./post-media-gallery";
import { Avatar, formatCount } from "./social-primitives";
import { nativeFileAccount, shareAppLink } from "../lib/native-files-client";
import { commentHref } from "../lib/workspace-navigation";

export type Post = {
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
  erased?: boolean;
  media?: PostMedia[];
  attachment?: {
    title: string;
    meta: string;
    theme: string;
  };
  poll?: { label: string; value: number }[];
};

export type PostComment = {
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

export type PostCommentFocus = { comment: PostComment; comments: PostComment[]; hasMore: boolean };

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

type FeedPostProps = {
  post: Post;
  commentFocus?: PostCommentFocus;
  onCommentTargetRemoved?: () => void;
  /** Explicit local simulation only; the design lab never reaches authenticated actions. */
  preview?: { onAction?: (action: "profile" | "share" | "report" | "delete") => void };
  viewerInitials?: string;
  viewerId?: string;
  onPostUpdated?: (id: number | string, text: string) => void;
  onPostDeleted?: (id: number | string) => void;
  onSavedChange?: (post: Post, saved: boolean) => void;
  onInteractionUpdated?: (id: number | string, changes: Partial<Pick<Post, "liked" | "saved" | "likes" | "comments">>) => void;
};

export function FeedPost(props: FeedPostProps) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  return <FeedPostView key={JSON.stringify([ownerScope, props.viewerId, props.post.id, Boolean(props.preview), props.commentFocus?.comment.id])} {...props}/>;
}

function FeedPostView({
  post,
  viewerInitials = "DÖ",
  viewerId,
  onPostUpdated,
  onPostDeleted,
  onSavedChange,
  onInteractionUpdated,
  commentFocus,
  onCommentTargetRemoved,
  preview,
}: FeedPostProps) {
  const navigation = useAppNavigation();
  function reportInteraction(id: number | string, changes: Partial<Pick<Post, "liked" | "saved" | "likes" | "comments">>) {
    navigation?.onPostInteraction?.(id, changes);
    onInteractionUpdated?.(id, changes);
  }

  const [liked, setLiked] = useState(post.liked ?? false);
  const [saved, setSaved] = useState(post.saved ?? false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [voted, setVoted] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(Boolean(commentFocus));
  const [commentText, setCommentText] = useState("");
  const [commentItems, setCommentItems] = useState<PostComment[]>(commentFocus?.comments ?? []);
  const [commentsState, setCommentsState] = useState<"idle" | "loading" | "ready" | "error">(commentFocus ? "ready" : "idle");
  const [hasMoreComments, setHasMoreComments] = useState(commentFocus?.hasMore ?? false);
  const [copiedComment, setCopiedComment] = useState("");
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
  const [panel, setPanel] = useState<"menu" | "report" | "delete">("menu");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportReason, setReportReason] = useState("misinformation");
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState("");
  const isPersistentPost = !preview && typeof post.id === "string";
  const showsPostOptions = isPersistentPost || Boolean(preview);
  const isOwnPost = Boolean(
    viewerId && post.authorId === viewerId && onPostUpdated && onPostDeleted,
  );

  const requests = usePostRequests();
  const pending = useRef(false);
  const commentsLoading = useRef(false);
  const commentsRevision = useRef(0);
  const articleRef = useRef<HTMLElement>(null);
  const deletionReported = useRef(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const [deleted, setDeleted] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareController = useRef<AbortController | null>(null);
  const commentShareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedComment = useRef<HTMLElement>(null);
  const { ref: panelRef, close: closePanel } = useAppLayer({ id: `post.options:${post.id}`, open: menuOpen, onClose: () => setMenuOpen(false), onRestore: () => setMenuOpen(true), busy: reportBusy || Boolean(busyMutation) });
  useEffect(() => { if (editing && !menuOpen) editInput.current?.focus({ preventScroll: true }); }, [editing, menuOpen]);
  useEffect(() => {
    if (!deleted || deletionReported.current) return;
    deletionReported.current = true;
    const card = articleRef.current;
    const region = card?.closest('[role="tabpanel"],.feed-list') ?? card?.parentElement;
    const cards = [...(region?.querySelectorAll<HTMLElement>(".post-card") ?? [])];
    const index = card ? cards.indexOf(card) : -1;
    const neighbor = cards[index + 1] ?? cards[index - 1];
    const fallback = region?.closest<HTMLElement>('[role="tabpanel"],section,main') ?? region;
    const previousFocus = document.activeElement;
    onPostDeleted?.(post.id);
    // The opener has just been removed with its card. Preserve a newer user focus
    // and never move into a region that was replaced by navigation/account change.
    window.requestAnimationFrame(() => {
      if (document.activeElement !== document.body && document.activeElement !== previousFocus) return;
      const target = neighbor?.isConnected ? neighbor.querySelector<HTMLElement>(".post-menu") ?? neighbor : fallback;
      if (!(target instanceof HTMLElement) || !target.isConnected || target.closest("[inert]")) return;
      if (!target.matches("button,a,input,select,textarea,[tabindex]")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  }, [deleted, onPostDeleted, post.id]);
  useEffect(() => () => { shareController.current?.abort(); if (shareTimer.current) clearTimeout(shareTimer.current); if (commentShareTimer.current) clearTimeout(commentShareTimer.current); }, []);
  const focusedCommentId = commentFocus?.comment.id;
  useEffect(() => {
    if (!focusedCommentId) return;
    const frame = window.requestAnimationFrame(() => { focusedComment.current?.focus({ preventScroll: true }); focusedComment.current?.scrollIntoView?.({ block: "center", behavior: "instant" }); });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedCommentId]);
  const [commentSnapshot, setCommentSnapshot] = useState(commentFocus);
  if (commentFocus && commentSnapshot !== commentFocus) {
    setCommentSnapshot(commentFocus);
    if (busyAction !== "comment" && !deletingCommentId) { setCommentItems(commentFocus.comments); setHasMoreComments(commentFocus.hasMore); setCommentsState("ready"); }
  }
  // A feed refresh can retain this card's identity. Apply changed server fields only
  // while idle; a reply captured before an in-flight mutation cannot undo its result.
  const [serverSnapshot, setServerSnapshot] = useState(post);
  if (["liked", "saved", "likes", "comments", "text", "edited"].some((field) => serverSnapshot[field as keyof Post] !== post[field as keyof Post])) {
    setServerSnapshot(post);
    if (!preview) {
      if (busyAction !== "like") {
        if (serverSnapshot.liked !== post.liked) setLiked(post.liked ?? false);
        if (serverSnapshot.likes !== post.likes) setLikeCount(post.likes);
      }
      if (busyAction !== "save" && serverSnapshot.saved !== post.saved) setSaved(post.saved ?? false);
      if (busyAction !== "comment" && !deletingCommentId && serverSnapshot.comments !== post.comments) setCommentCount(post.comments);
      if (busyMutation !== "edit") {
        if (serverSnapshot.text !== post.text) { setCurrentText(post.text); if (!editing) setEditText(post.text); }
        if (serverSnapshot.edited !== post.edited) setEdited(post.edited ?? false);
      }
    }
  }

  function payload(method: string, body: object): RequestInit {
    return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  }
  async function runAction(type: "like" | "save" | "comment", content?: string, active?: boolean) {
    if (preview || pending.current) return null;
    pending.current = true;
    setInteractionError(""); setBusyAction(type);
    try {
      const data = await requests.json<{ active?: boolean; count?: number; comment?: PostComment; error?: string }>("/api/post-actions", payload("POST", { postId: post.id, type, content, active }), "Etkileşim kaydedilemedi.");
      if ((type !== "comment" && typeof data.active !== "boolean") || (type !== "save" && typeof data.count !== "number") || (type === "comment" && !data.comment)) throw new Error("Etkileşim sonucu doğrulanamadı. Gönderiyi yenileyip kontrol et.");
      return data;
    } catch (cause) {
      if (requests.isActive()) setInteractionError(cause instanceof Error ? cause.message : "Etkileşim kaydedilemedi.");
      return null;
    } finally {
      pending.current = false;
      if (requests.isActive()) setBusyAction(null);
    }
  }

  async function toggleLike() {
    if (post.erased || pending.current) return;
    const previousLiked = liked;
    const previousCount = likeCount;
    const optimisticLiked = !previousLiked;
    setLiked(optimisticLiked);
    setLikeCount(Math.max(0, previousCount + (optimisticLiked ? 1 : -1)));

    if (!isPersistentPost) {
      return;
    }

    const result = await runAction("like", undefined, optimisticLiked);
    if (!requests.isActive()) return;
    if (!result) {
      setLiked(previousLiked);
      setLikeCount(previousCount);
      return;
    }
    setLiked(Boolean(result.active));
    if (typeof result.count === "number") setLikeCount(result.count);
    reportInteraction(post.id, { liked: Boolean(result.active), likes: result.count ?? previousCount });
  }

  async function toggleSave() {
    if (post.erased || pending.current) return;
    const previousSaved = saved;
    const optimisticSaved = !previousSaved;
    setSaved(optimisticSaved);
    if (!isPersistentPost) onSavedChange?.({ ...post, text: currentText, edited }, optimisticSaved);

    if (!isPersistentPost) {
      return;
    }

    const result = await runAction("save", undefined, optimisticSaved);
    if (!requests.isActive()) return;
    if (!result) {
      setSaved(previousSaved);
      return;
    }
    const active = Boolean(result.active);
    setSaved(active);
    reportInteraction(post.id, { saved: active });
    onSavedChange?.({ ...post, text: currentText, edited }, active);
  }

  async function loadComments(force = false) {
    if (commentsLoading.current || (!force && commentsState !== "idle")) return;
    if (!isPersistentPost) { setCommentItems([]); setCommentsState("ready"); return; }
    const revision = ++commentsRevision.current;
    commentsLoading.current = true;
    setCommentsState("loading");
    try {
      const data = await requests.json<{ comments?: PostComment[]; hasMore?: boolean; error?: string }>(`/api/comments?postId=${encodeURIComponent(String(post.id))}`, { headers: { accept: "application/json" }, cache: "no-store" }, "Yorumlar getirilemedi.");
      if (revision !== commentsRevision.current) return;
      if (!Array.isArray(data.comments)) throw new Error("Yorumlar getirilemedi.");
      setCommentItems(data.comments); setHasMoreComments(Boolean(data.hasMore)); setCommentsState("ready");
    } catch (cause) {
      if (!requests.isActive() || revision !== commentsRevision.current) return;
      setCommentsState("error");
      setInteractionError(cause instanceof Error ? cause.message : "Yorumlar getirilemedi.");
    } finally { commentsLoading.current = false; }
  }

  function toggleComments() {
    const nextOpen = !commenting;
    setCommenting(nextOpen);
    if (nextOpen) void loadComments();
  }

  async function sendComment() {
    const clean = commentText.trim();
    if (post.erased || !clean || pending.current || commentsLoading.current) return;
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
    if (!requests.isActive()) return;
    if (!result || !result.comment) {
      setCommentItems((current) => current.filter((comment) => comment.id !== optimisticId));
      setCommentCount((count) => Math.max(0, count - 1));
      setCommentText((current) => current || clean);
      return;
    }
    if (typeof result.count === "number") setCommentCount(result.count);
    reportInteraction(post.id, { comments: result.count ?? commentCount + 1 });
    setCommentItems((current) => current.map((comment) => comment.id === optimisticId ? result.comment! : comment));
  }

  async function deleteComment(comment: PostComment) {
    if (pending.current || commentsLoading.current || !comment.own) return;
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

    pending.current = true;
    try {
      const data = await requests.json<{ deleted?: boolean; count?: number; error?: string }>("/api/comments", payload("DELETE", { id: comment.id }), "Yorum silinemedi.");
      if (!data.deleted) throw new Error("Yorum silinemedi.");
      if (typeof data.count === "number") setCommentCount(data.count);
      reportInteraction(post.id, { comments: data.count ?? Math.max(0, previousCount - 1) });
      if (commentFocus?.comment.id === comment.id) onCommentTargetRemoved?.();
    } catch (cause) {
      if (!requests.isActive()) return;
      setCommentItems(previousItems); setCommentCount(previousCount);
      setInteractionError(cause instanceof Error ? cause.message : "Yorum silinemedi.");
    } finally { pending.current = false; if (requests.isActive()) setDeletingCommentId(null); }
  }

  async function sharePost() {
    if (preview) { preview.onAction?.("share"); setShareState("copied"); return; }
    if (!isPersistentPost) return;
    const shareUrl = new URL(`/?post=${encodeURIComponent(String(post.id))}`, window.location.origin).href;
    shareController.current?.abort();
    const controller = new AbortController(); shareController.current = controller;
    try {
      const result = await shareAppLink(nativeFileAccount(navigation?.ownerScope), { title: `${post.name} · Kampira`, text: currentText, url: shareUrl }, controller.signal);
      if (result !== "copied" || controller.signal.aborted) return;
      if (!requests.isActive()) return;
      setShareState("copied");
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareState("idle"), 1800);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      if (requests.isActive() && !controller.signal.aborted) setInteractionError("Bağlantı paylaşılamadı. Tarayıcının paylaşım veya pano iznini kontrol edip yeniden dene.");
    }
  }

  async function copyComment(comment: PostComment) {
    if (!isPersistentPost || comment.pending) return;
    try {
      await navigator.clipboard.writeText(new URL(commentHref(comment.id, String(post.id)), window.location.origin).href);
      if (!requests.isActive()) return;
      setCopiedComment(comment.id);
      if (commentShareTimer.current) clearTimeout(commentShareTimer.current);
      commentShareTimer.current = setTimeout(() => setCopiedComment(""), 1800);
    } catch { if (requests.isActive()) setInteractionError("Yorum bağlantısı kopyalanamadı. Pano iznini kontrol edip yeniden dene."); }
  }

  function renderComment(comment: PostComment, focused = false) {
    return <article className={`${comment.pending ? "pending" : ""}${focused ? ` ${interactionStyles.focusedComment}` : ""}`} key={comment.id} data-comment-id={comment.id} ref={focused ? focusedComment : undefined} tabIndex={focused ? -1 : undefined} aria-label={focused ? "Bağlantıdaki yorum" : undefined}>
      <Avatar initials={comment.initials} className="avatar-violet" imageUrl={comment.avatarUrl} small/>
      <div>{focused && <small className={interactionStyles.focusedLabel}>Bağlantıdaki yorum</small>}<strong>{comment.authorName}</strong><span>{comment.time === "şimdi" ? comment.time : `${comment.time} önce`}</span><p>{comment.content}{comment.edited && <small> · düzenlendi</small>}</p>{isPersistentPost && !comment.pending && <button className={interactionStyles.commentShare} type="button" onClick={() => void copyComment(comment)} aria-label={copiedComment === comment.id ? "Yorum bağlantısı kopyalandı" : "Yorum bağlantısını kopyala"}><Icon name={copiedComment === comment.id ? "check" : "share"} size={16}/><span>{copiedComment === comment.id ? "Kopyalandı" : "Paylaş"}</span></button>}</div>
      {comment.own && <button type="button" onClick={() => void deleteComment(comment)} disabled={comment.pending || deletingCommentId === comment.id} aria-label="Yorumu sil"><Icon name="trash" size={14}/></button>}
    </article>;
  }

  async function saveEdit() {
    const clean = editText.trim();
    if ((!clean && !post.media?.length) || clean.length > 1200 || pending.current) return;
    setInteractionError("");

    if (!isPersistentPost) {
      setCurrentText(clean);
      setEdited(true);
      setEditing(false);
      onPostUpdated?.(post.id, clean);
      return;
    }

    pending.current = true; setBusyMutation("edit");
    try {
      const data = await requests.json<{ post?: { id: string; text: string }; error?: string }>("/api/posts", payload("PATCH", { id: post.id, content: clean }), "Gönderi güncellenemedi.");
      if (!data.post) throw new Error("Gönderi güncellenemedi.");
      setCurrentText(data.post.text); setEditText(data.post.text); setEdited(true); setEditing(false);
      onPostUpdated?.(post.id, data.post.text);
      menuTrigger.current?.focus({ preventScroll: true });
    } catch (cause) { if (requests.isActive()) setInteractionError(cause instanceof Error ? cause.message : "Gönderi güncellenemedi."); }
    finally { pending.current = false; if (requests.isActive()) setBusyMutation(null); }
  }

  async function deletePost() {
    if (preview) { preview.onAction?.("delete"); onPostDeleted?.(post.id); return; }
    if (pending.current || !isPersistentPost) return;
    pending.current = true; setInteractionError(""); setBusyMutation("delete");
    try {
      const data = await requests.json<{ deleted?: boolean; error?: string }>("/api/posts", payload("DELETE", { id: post.id }), "Gönderi silinemedi.");
      if (!data.deleted) throw new Error("Gönderi silinemedi.");
      setMenuOpen(false); setDeleted(true);
    } catch (cause) { if (requests.isActive()) setInteractionError(cause instanceof Error ? cause.message : "Gönderi silinemedi."); }
    finally { pending.current = false; if (requests.isActive()) setBusyMutation(null); }
  }

  async function reportPost() {
    if (preview) { preview.onAction?.("report"); setReportState("Galeri simülasyonu: bildirim gönderilmedi."); return; }
    if (!isPersistentPost || pending.current || reportSent) return;
    pending.current = true; setReportBusy(true); setReportState("");
    try {
      const data = await requests.json<{ report?: unknown; error?: string }>("/api/safety", payload("POST", { action: "report", entityType: "post", entityId: post.id, reason: reportReason, details: reportDetails }), "Şikâyet kaydedilemedi.");
      if (!data.report) throw new Error("Şikâyet kaydı doğrulanamadı. Güvenlik bölümünden kayıtlarını kontrol et.");
      setReportState("Şikâyetin inceleme kuyruğuna alındı."); setReportDetails(""); setReportSent(true);
    } catch (cause) { if (requests.isActive()) setReportState(cause instanceof Error ? cause.message : "Şikâyet kaydedilemedi."); }
    finally { pending.current = false; if (requests.isActive()) setReportBusy(false); }
  }

  return (
    <article ref={articleRef} className={`post-card ${interactionStyles.post}`} id={`post-${post.id}`} data-preview={preview ? "fixture" : undefined}>
      <header className="post-header">
        <Avatar initials={post.initials} className={post.avatarClass} imageUrl={post.avatarUrl}/>
        <div className="post-person">
          <div className="post-name-line">
            <strong>{post.authorId ? <AppLink href={`/?profile=${encodeURIComponent(post.authorId)}`} onClick={preview ? (event) => { event.preventDefault(); preview.onAction?.("profile"); } : undefined}>{post.name}</AppLink> : post.name}</strong>
            <span className="post-time" title={post.time === "şimdi" ? post.time : `${post.time} önce`}>{post.time}</span>
          </div>
          <div className="post-byline"><span className="post-affiliation" title={`${post.school} · ${post.department}`}>{post.school}<span className="post-department"> · {post.department}</span></span><span className="post-audience" role="img" aria-label={audienceLabel(post.audience)} title={post.audience === "platform" ? "Tüm üniversitelerde görünür" : "Yalnızca yazarın kampüsünde görünür"}>{post.audience === "platform" ? <GlobeHemisphereWest size={13}/> : <MapPin size={13}/>}</span></div>
        </div>
        {showsPostOptions && <button ref={menuTrigger} className="icon-button post-menu" type="button" onClick={() => { setPanel("menu"); setMenuOpen(true); }} aria-label="Gönderi seçenekleri" aria-haspopup="dialog" aria-expanded={menuOpen}><Icon name="more"/></button>}
      </header>

      <div className="post-body">
        {post.course && !["GENEL", "KAMPÜS"].includes(post.course.toLocaleUpperCase("tr-TR")) && <span className="course-tag">{post.course}</span>}
        {editing ? <div className="post-edit-box"><textarea ref={editInput} aria-label="Gönderi metnini düzenle" autoFocus disabled={busyMutation === "edit"} maxLength={1200} value={editText} onChange={(event) => setEditText(event.target.value)} rows={4}/><div><span>{editText.trim().length}/1200</span><button type="button" disabled={busyMutation === "edit"} onClick={() => { setEditing(false); setEditText(currentText); menuTrigger.current?.focus({ preventScroll: true }); }}>Vazgeç</button><button type="button" onClick={() => void saveEdit()} disabled={(!editText.trim() && !post.media?.length) || busyMutation === "edit"}>{busyMutation === "edit" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div></div> : <p>{currentText}{edited && <small className="post-edited"> · düzenlendi</small>}</p>}
        {post.attachment && <AttachmentCard attachment={post.attachment} />}
        {post.media?.length ? <PostMediaGallery media={post.media} description={currentText || `${post.name} tarafından paylaşılan medya`}/> : null}
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
          <button className={`action-button ${liked ? "liked" : ""}`} onClick={() => void toggleLike()} type="button" aria-label={`${liked ? "Beğeniyi geri al" : "Beğen"}, ${likeCount} beğeni`} aria-pressed={liked} disabled={post.erased || busyAction === "like"}>
            <Icon name="heart" size={23} weight={liked ? "fill" : "regular"}/>{likeCount > 0 && <span>{formatCount(likeCount)}</span>}
          </button>
          <button className="action-button" onClick={toggleComments} type="button" aria-label={`Yorumlar, ${commentCount} yorum`} aria-expanded={commenting} aria-controls={`comments-${post.id}`}>
            <Icon name="comment" size={23}/>{commentCount > 0 && <span>{formatCount(commentCount)}</span>}
          </button>
          <button className="action-button post-share-action" type="button" aria-label={shareState === "copied" ? (preview ? "Paylaşım simülasyonu tamamlandı" : "Bağlantı kopyalandı") : "Gönderiyi paylaş"} onClick={() => void sharePost()} disabled={!showsPostOptions}><Icon name={shareState === "copied" ? "check" : "share"} size={23}/><span>{shareState === "copied" ? (preview ? "Simüle edildi" : "Kopyalandı") : "Paylaş"}</span></button>
        </div>
        <button className={`action-button save-button ${saved ? "saved" : ""}`} onClick={() => void toggleSave()} type="button" aria-pressed={saved} aria-label="Gönderiyi kaydet" disabled={post.erased || busyAction === "save"}>
          <Icon name="bookmark" size={23} weight={saved ? "fill" : "regular"}/>
        </button>
      </footer>

      {menuOpen && <div className={interactionStyles.overlay} onClick={(event) => { if (event.target === event.currentTarget) closePanel(); }}><section ref={panelRef} className={`${interactionStyles.dialog} ${panel === "report" ? "post-report-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`post-options-${post.id}`}>
        <header><h2 id={`post-options-${post.id}`}>{panel === "report" ? "Gönderiyi şikâyet et" : panel === "delete" ? "Gönderiyi sil?" : "Gönderi seçenekleri"}</h2><button type="button" onClick={closePanel} disabled={reportBusy || Boolean(busyMutation)} aria-label="Pencereyi kapat"><Icon name="close" size={22}/></button></header>
        {panel === "menu" && <div className={interactionStyles.actions}>{isOwnPost ? <><button type="button" onClick={() => { setEditText(currentText); setEditing(true); closePanel(); }}><Icon name="edit" size={20}/> Düzenle</button><button className={interactionStyles.danger} type="button" onClick={() => { if (preview) { void deletePost(); closePanel(); } else setPanel("delete"); }}><Icon name="trash" size={20}/> Sil</button></> : <button className={interactionStyles.danger} type="button" onClick={() => setPanel("report")}><Icon name="flag" size={20}/> Şikâyet et</button>}</div>}
        {panel === "delete" && <><p>Bu gönderi ve ona bağlı içerikler akıştan kaldırılacak. Bu işlemi geri alamazsın.</p><footer><button type="button" disabled={Boolean(busyMutation)} onClick={closePanel}>Vazgeç</button><button type="button" className={interactionStyles.danger} disabled={Boolean(busyMutation)} onClick={() => void deletePost()}>{busyMutation === "delete" ? "Siliniyor…" : "Gönderiyi sil"}</button></footer>{interactionError && <p role="alert">{interactionError}</p>}</>}
        {panel === "report" && <form onSubmit={(event) => { event.preventDefault(); void reportPost(); }}><label>Neden<select disabled={reportBusy || reportSent} value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="misinformation">Yanıltıcı akademik içerik</option><option value="spam">Spam</option><option value="harassment">Taciz veya zorbalık</option><option value="privacy">Kişisel veri ihlali</option><option value="copyright">Telif ihlali</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea disabled={reportBusy || reportSent} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label>{reportState && <p role="status">{reportState}</p>}<footer><button type="button" disabled={reportBusy} onClick={closePanel}>Kapat</button>{!reportSent && <button className={interactionStyles.danger} disabled={reportBusy} type="submit">{reportBusy ? "Gönderiliyor…" : "Şikâyeti gönder"}</button>}</footer></form>}
      </section></div>}

      {commenting && (
        <section className="comment-thread" id={`comments-${post.id}`} aria-label="Gönderi yorumları">
          {commentsState === "loading" && <p className="comments-status" aria-live="polite">Yorumlar getiriliyor…</p>}
          {commentsState === "error" && <button className="comments-retry" type="button" onClick={() => { setInteractionError(""); void loadComments(true); }}>Yorumları yeniden dene</button>}
          {commentFocus && <div className="comment-list">{renderComment(commentFocus.comment, true)}</div>}
          {commentsState === "ready" && commentItems.length === 0 && !commentFocus && <p className="comments-status">İlk yorumu sen bırak.</p>}
          {commentItems.some((comment) => comment.id !== focusedCommentId) && <div className="comment-list">
            {commentFocus && <p className="comments-status">Son yorumlar</p>}
            {hasMoreComments && <p className="comments-status">En son 20 yorum gösteriliyor.</p>}
            {commentItems.filter((comment) => comment.id !== focusedCommentId).map((comment) => renderComment(comment))}
          </div>}
          {!post.erased && <div className="quick-comment">
            <Avatar initials={viewerInitials} className="avatar-violet" small />
            <label className="sr-only" htmlFor={`comment-${post.id}`}>Yorum yaz</label>
            <input id={`comment-${post.id}`} autoFocus={!commentFocus} maxLength={500} value={commentText} disabled={commentsState === "loading" || busyAction === "comment"} onChange={(event) => { setCommentText(event.target.value); setInteractionError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendComment(); } }} placeholder="Bir yorum yaz..." />
            <button type="button" onClick={() => void sendComment()} disabled={!commentText.trim() || commentsState === "loading" || busyAction === "comment"} aria-label="Yorumu gönder"><Icon name="send" size={17}/></button>
          </div>}
        </section>
      )}
      {interactionError && !(menuOpen && panel === "delete") && <p className="interaction-feedback" role="alert">{interactionError}</p>}
    </article>
  );
}
