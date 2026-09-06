"use client";
import type { PublishUploadProgress } from "../lib/publish-upload";
import styles from "./publish-status.module.css";

export function PublishStatus({ progress, onCancel }: { progress: PublishUploadProgress | null; onCancel: () => void }) {
  const processing = progress?.phase === "processing";
  const label = processing ? "Gönderin hazırlanıyor…" : "Gönderin yükleniyor…";
  return <div className={styles.status}>
    <div><span role="status">{label}</span>{!processing && progress?.percent != null && <span aria-hidden="true">%{progress.percent}</span>}</div>
    <progress aria-label={label} max={100} value={!processing && progress?.percent != null ? progress.percent : undefined}/>
    <button type="button" onClick={onCancel}>Yüklemeyi durdur</button>
  </div>;
}
