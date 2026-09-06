"use client";

import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import styles from "./feed-refresh-notice.module.css";

export function FeedRefreshNotice({ available, busy, announcement, onRefresh }: { available: boolean; busy: boolean; announcement: string; onRefresh: () => void }) {
  return <div className={styles.layer}>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    {available && <button className={styles.button} type="button" aria-controls="feed-posts" aria-label="Yeni paylaşımları göster ve akışı yenile" aria-busy={busy || undefined} disabled={busy} onClick={onRefresh}><ArrowUp size={20} aria-hidden="true"/><span>{busy ? "Yenileniyor…" : "Yeni paylaşımlar"}</span></button>}
  </div>;
}
