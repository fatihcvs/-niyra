"use client";

import { useEffect, useRef, useState } from "react";
import { useAppNavigation } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { clearContentTarget, useContentTarget } from "./use-content-target";
import { useScopedRequests } from "./use-scoped-requests";
import { contentTarget } from "../lib/workspace-navigation";
import { FeedPost, type Post, type PostCommentFocus } from "./feed-post";
import { Button, IconButton, InlineError, Skeleton } from "./ui-primitives";
import { UiIcon } from "./ui-icon";
import styles from "./post-comment-target.module.css";

type Props = { viewerId: string; viewerInitials: string; onPostUpdated: (id: string | number, text: string) => void; onPostDeleted: (id: string | number) => void };
type Target = { post: Post; focus: PostCommentFocus };

/** A comment is resolved by its own authorized identity, even outside the newest page. */
export function PostCommentTarget(props: Props) {
  const navigation = useAppNavigation();
  const commentId = useContentTarget("comment", "feed");
  const postId = useContentTarget("post", "feed");
  return commentId ? <CommentDialog key={JSON.stringify([navigation?.ownerScope, commentId, postId])} commentId={commentId} postId={postId} {...props}/> : null;
}

function CommentDialog({ commentId, postId, ...props }: Props & { commentId: string; postId: string }) {
  const requests = useScopedRequests();
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const { ref, close } = useAppLayer({ id: `post.comment:${commentId}`, open: true, history: "route", onClose: () => {
    if (contentTarget(window.location.search, "post", "feed") === postId) clearContentTarget("comment", commentId, "feed", ["post"]);
  } });

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    const version = ++generation.current;
    const current = () => !controller.signal.aborted && generation.current === version;
    const params = new URLSearchParams({ commentId });
    if (postId) params.set("postId", postId);
    async function load() {
      try {
        const focus = await requests.json<PostCommentFocus & { postId?: string; error?: string }>(`/api/comments?${params}`, { signal: controller.signal, cache: "no-store" }, "Yorum bulunamadı veya erişim iznin yok.");
        if (!focus.postId || focus.comment?.id !== commentId || !Array.isArray(focus.comments) || (postId && focus.postId !== postId)) throw new Error("Yorumun bağlı olduğu gönderi doğrulanamadı.");
        const result = await requests.json<{ post?: Post; error?: string }>(`/api/posts?id=${encodeURIComponent(focus.postId)}`, { signal: controller.signal, cache: "no-store" }, "Gönderi bulunamadı veya erişim iznin yok.");
        if (!result.post || result.post.id !== focus.postId) throw new Error("Yorumun bağlı olduğu gönderi doğrulanamadı.");
        if (current()) { setTarget({ post: result.post, focus }); setError(""); }
      } catch (cause) {
        if (current()) { setTarget(null); setError(!requests.isActive() ? "Oturumun sona erdi. Yeniden giriş yapabilirsin." : cause instanceof Error ? cause.message : "Yorum açılamadı."); }
      } finally { if (pending.current === controller) pending.current = null; }
    }
    void load();
    return () => { controller.abort(); if (pending.current === controller) pending.current = null; };
  }, [commentId, postId, requests, revision]);

  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") setRevision((value) => value + 1); };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  function removed(kind: "comment" | "post") {
    generation.current++; pending.current?.abort();
    setTarget(null); setError(kind === "comment" ? "Bu yorum kaldırıldı." : "Bu gönderi kaldırıldı.");
  }

  return <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="comment-target-title" data-mobile-overlay="true">
      <header className={styles.header}><h2 id="comment-target-title">Yorum</h2><IconButton label="Yorumu kapat" onClick={close}><UiIcon name="close"/></IconButton></header>
      <div className={styles.body}>{error ? <><InlineError message={error} onRetry={() => { setError(""); setRevision((value) => value + 1); }}/><Button onClick={close}>Akışa dön</Button></> : target ? <FeedPost {...props} post={target.post} commentFocus={target.focus} onCommentTargetRemoved={() => removed("comment")} onPostDeleted={(id) => { props.onPostDeleted(id); removed("post"); }}/> : <Skeleton label="Yorum ve gönderi açılıyor" shape="card"/>}</div>
    </section>
  </div>;
}
