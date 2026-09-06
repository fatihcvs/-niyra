"use client";

import type { PublishDraftView } from "./use-publish-draft";
import styles from "./publish-draft-notice.module.css";

export function PublishDraftNotice({ view, hasDraft, onRestore, onDiscard, onRetry }: {
  view: PublishDraftView; hasDraft: boolean; onRestore: () => void; onDiscard: () => void; onRetry: () => void;
}) {
  if (view.phase === "inactive") return null;
  if (view.candidate) return <div className={styles.notice} role="status"><strong>Kaydedilmiş bir taslağın var</strong><span>Taslağın 24 saat bu cihazda saklanır. Devam etmek için geri yükle veya sil.</span>{view.message && <span role="alert">{view.message}</span>}<div className={styles.actions}><button type="button" onClick={onRestore}>Geri yükle</button><button type="button" onClick={onDiscard}>Taslağı sil</button></div></div>;
  if (view.phase === "loading") return <p className={styles.caption} role="status">Kaydedilmiş taslağın kontrol ediliyor…</p>;
  if (view.phase === "error") return <div className={styles.notice} role="alert"><span>{view.message}</span><button type="button" onClick={onRetry}>Depolamayı yeniden dene</button></div>;
  if (!hasDraft) return null;
  return <p className={styles.caption} role="status">{view.phase === "saved" ? "Taslağın 24 saat bu cihazda saklanır." : "Taslak kaydediliyor…"}</p>;
}
