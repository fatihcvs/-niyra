"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AccountDeletionQueueItem } from "../lib/account-deletion";
import type { AccountErasureJob } from "../lib/account-erasure";
import { useAppLayer } from "./use-app-layer";
import styles from "./account-deletion-review.module.css";

type Queue = { requests: AccountDeletionQueueItem[]; nextCursor: string | null; jobs: AccountErasureJob[]; capabilities: { canExecute: boolean }; staffContext: string };
const statuses = { requested: "Talep alındı", in_review: "İncelemede", cancelled: "İptal edildi" };
const jobLabels: Record<string, string> = { queued: "Silme başladı", storage_pending: "Dosyalar temizleniyor", blocked: "Temizlik tamamlanamadı", finalizing: "Son kontroller yapılıyor", completed: "Uygulama verileri silindi" };
const jobProblems: Record<string, string> = {
  UPLOAD_UNRESOLVED: "Devam eden bir yüklemenin sonucu henüz doğrulanamadı. Dosya temizliği bu yükleme çözülene kadar tamamlanamaz.",
  LEGACY_OWNERSHIP_UNKNOWN: "Eski bir dosyanın hangi hesaba ait olduğu doğrulanamadı. Bu kayıt incelenmeden silme tamamlanamaz.",
  STORAGE_UNAVAILABLE: "Dosya deposuna erişilemiyor. Bağlantı düzeldiğinde temizliği sürdürebilirsin.",
  STORAGE_DELETE_UNCONFIRMED: "En az bir dosyanın silindiği doğrulanamadı. Temizliği sürdürerek yeniden kontrol edebilirsin.",
  ERASURE_RETRY_REQUIRED: "Son kontrol tamamlanamadı. Kaydedilen işlem üzerinden temizliği sürdürebilirsin.",
};
const time = (value: string) => new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
const accessFailure = (status: number) => [401, 403, 428].includes(status);

export function AccountDeletionReview({ onAccessChanged }: { onAccessChanged: () => Promise<void> }) {
  const [filter, setFilter] = useState("open");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState<AccountDeletionQueueItem | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const cursor = cursors.at(-1) ?? null;
  const mutation = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mounted = useRef(true);
  const context = useRef("");
  const { ref: confirmationRef, close: closeConfirmation } = useAppLayer({ id: "account-erasure-confirmation", open: Boolean(confirmation), busy: Boolean(busyId), onClose: () => { setConfirmation(null); setConfirmed(false); } });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; mutation.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const current = ++version.current;
    const query = new URLSearchParams({ status: filter });
    if (cursor) query.set("before", cursor);
    fetch("/api/admin/account-deletion?" + query, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!mounted.current || current !== version.current) return;
      if (accessFailure(response.status)) {
        context.current = ""; setQueue(null); setConfirmation(null); mutation.current?.abort(); void onAccessChanged();
        throw new Error("Yönetim oturumun değişti. Yeniden giriş yapmalısın.");
      }
      const data = await response.json() as Queue & { error?: string };
      if (!mounted.current || current !== version.current) return;
      if (controller.signal.aborted) throw new Error("Kuyruk zamanında yüklenemedi.");
      if (!response.ok || !Array.isArray(data.requests) || !Array.isArray(data.jobs) || !data.staffContext) throw new Error(data.error ?? "Talepler yüklenemedi.");
      if (context.current && context.current !== data.staffContext) { setConfirmation(null); setConfirmed(false); mutation.current?.abort(); }
      context.current = data.staffContext;
      setQueue(data); setNeedsReconciliation(false);
    }).catch((cause: unknown) => {
      if (mounted.current && current === version.current) setError(controller.signal.aborted ? "Kuyruk zamanında yüklenemedi. Yeniden deneyebilirsin." : cause instanceof Error ? cause.message : "Talepler yüklenemedi.");
    }).finally(() => { clearTimeout(timeout); if (mounted.current && current === version.current) setLoading(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [filter, cursor, revision, onAccessChanged]);

  function refresh() { setError(""); setLoading(true); setRevision((value) => value + 1); }

  async function mutate(action: "review" | "execute" | "resume", id: string) {
    if (mutation.current || !queue || !context.current || needsReconciliation || loading) return;
    if (action !== "review" && !queue.capabilities.canExecute) return;
    if (action === "execute" && (!confirmed || confirmation?.id !== id)) return;
    const controller = new AbortController();
    mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const expectedContext = context.current;
    const current = ++version.current;
    const isCurrent = () => mounted.current && current === version.current && context.current === expectedContext;
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/account-deletion", { method: "PATCH", signal: controller.signal,
        headers: { "content-type": "application/json", "X-Staff-Context": expectedContext },
        body: JSON.stringify(action === "resume" ? { action, jobId: id } : { action, id, ...(action === "execute" ? { confirm: true } : {}) }) });
      if (!isCurrent()) return;
      if (accessFailure(response.status) || response.status === 409) {
        setQueue(null); setConfirmation(null); setConfirmed(false); context.current = "";
        if (accessFailure(response.status)) void onAccessChanged();
        setError(response.status === 409 ? "Talep veya yönetim oturumu değişti. Güncel durumu kontrol et." : "Yönetim yetkin değişti. Yeniden giriş yapmalısın.");
        setNeedsReconciliation(true); return;
      }
      const data = await response.json() as { request?: AccountDeletionQueueItem; job?: AccountErasureJob; deletionExecuted?: boolean; error?: string };
      if (!isCurrent()) return;
      if (controller.signal.aborted) throw new Error("İşlem yanıtı zamanında alınamadı.");
      if (!response.ok || (action === "review" ? !data.request : !data.job)) throw new Error(data.error ?? "İşlem sonucu alınamadı.");
      setConfirmation(null); setConfirmed(false);
      setMessage(action === "review" ? "Talep incelemeye alındı. Silme işlemi başlamadı."
        : data.job?.state === "completed" && data.deletionExecuted === true ? "Uygulama verilerinin silindiği doğrulandı. İşlem kaydı aşağıda."
          : "Silme işlemi kayda alındı. Dosyalar ve son durum henüz doğrulanıyor.");
      refresh();
    } catch {
      if (!isCurrent()) return;
      setConfirmation(null); setConfirmed(false); setNeedsReconciliation(true);
      setMessage("Yanıt alınamadı. Son durum kontrol ediliyor; silme isteği tekrar gönderilmiyor.");
      refresh();
    } finally {
      clearTimeout(timeout);
      if (mutation.current === controller) { mutation.current = null; if (mounted.current) setBusyId(""); }
    }
  }

  const disabled = loading || Boolean(busyId);
  const jobs = queue?.jobs ?? [];
  return <section className={styles.shell} aria-labelledby="account-deletion-queue-title">
    <header className={styles.header}><div><h2 id="account-deletion-queue-title">Hesap silme talepleri</h2><p>Hesap sahibinin talebini incele ve silme işleminin sonucunu takip et.</p></div><Link href="/account-deletion">Kullanıcı sayfası</Link></header>
    <p className={styles.notice}>İncelemeye almak hesabı silmez. Silmeyi başlatmak yalnız owner hesabına açıktır; başladığında kullanıcının oturumları kapanır ve talep iptal edilemez. Tamamlanamayan işler aşağıda görünür.</p>
    <div className={styles.toolbar}><label>Talep durumu<select value={filter} disabled={disabled} onChange={(event) => { setFilter(event.target.value); setCursors([null]); setQueue(null); setConfirmation(null); setError(""); setMessage(""); setLoading(true); }}>
      <option value="open">Açık talepler</option><option value="requested">Yeni talepler</option><option value="in_review">İncelemede</option><option value="cancelled">İptal edilenler</option>
    </select></label><button type="button" disabled={disabled} onClick={refresh}>Kuyruğu yenile</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {loading && <p role="status">Talepler yükleniyor…</p>}
    {queue && !queue.requests.length && !loading && <p className={styles.empty}>Bu görünümde talep bulunmuyor.</p>}
    {queue?.requests.map((request) => <article key={request.id} className={styles.request}>
      <div className={styles.rowHeading}><div><h3>{request.displayName}</h3><p>{request.email}</p></div><strong>{request.erasureJob ? jobLabels[request.erasureJob.state] ?? "Silme sürüyor" : statuses[request.status]}</strong></div>
      <dl><div><dt>Talep kimliği</dt><dd>{request.id}</dd></div><div><dt>Oluşturuldu</dt><dd><time dateTime={request.createdAt}>{time(request.createdAt)}</time></dd></div></dl>
      {request.note && <blockquote>{request.note}</blockquote>}
      <ol className={styles.history}>{request.history.map((event) => <li key={event.status}><span>{statuses[event.status]}</span><time dateTime={event.createdAt}>{time(event.createdAt)}</time></li>)}</ol>
      {!request.erasureJob && request.status === "requested" && <button type="button" disabled={disabled || needsReconciliation} onClick={() => void mutate("review", request.id)}>{busyId === request.id ? "Kaydediliyor…" : "İncelemeye al"}</button>}
      {!request.erasureJob && request.status === "in_review" && queue.capabilities.canExecute && <button type="button" className={styles.danger} disabled={disabled || needsReconciliation} onClick={() => { setConfirmation(request); setConfirmed(false); }}>Hesabı sil…</button>}
    </article>)}
    <nav className={styles.pagination} aria-label="Hesap talepleri sayfaları"><button type="button" disabled={disabled || cursors.length < 2} onClick={() => { setCursors((current) => current.slice(0, -1)); setQueue(null); setError(""); setLoading(true); }}>Önceki</button><span>Sayfa {cursors.length}</span><button type="button" disabled={disabled || !queue?.nextCursor} onClick={() => { if (queue?.nextCursor) { setCursors((current) => [...current, queue.nextCursor]); setQueue(null); setError(""); setLoading(true); } }}>Sonraki</button></nav>
    {jobs.length > 0 && <section className={styles.jobs} aria-labelledby="erasure-jobs-title"><h3 id="erasure-jobs-title">Silme işlemleri</h3>{jobs.map((job) => <article className={styles.request} key={job.id} data-erasure-job-id={job.id} data-state={job.state}>
      <div className={styles.rowHeading}><strong>{jobLabels[job.state] ?? "Silme sürüyor"}</strong><time dateTime={job.updatedAt}>{time(job.updatedAt)}</time></div>
      <dl><div><dt>İşlem kimliği</dt><dd>{job.id}</dd></div><div><dt>Talep kimliği</dt><dd>{job.requestId}</dd></div><div><dt>Temizlenen dosya</dt><dd>{job.removedObjectCount}</dd></div><div><dt>Bekleyen dosya</dt><dd>{job.pendingObjectCount}</dd></div></dl>
      {job.state !== "completed" && job.lastErrorCode && <p className={styles.jobNotice}>{jobProblems[job.lastErrorCode] ?? "Temizlik henüz doğrulanamadı. Son kontrolü tekrar çalıştırabilirsin."}</p>}
      {job.state !== "completed" && queue?.capabilities.canExecute && <button type="button" disabled={disabled || needsReconciliation} onClick={() => void mutate("resume", job.id)}>{busyId === job.id ? "Kontrol ediliyor…" : "Temizliği sürdür"}</button>}
      {job.state === "completed" && <p className={styles.jobNotice}>Uygulama veritabanı ve dosya deposundaki silme doğrulandı. Bu kayıt yedek ve dış hizmetlerin temizlendiğini onaylamaz.</p>}
    </article>)}</section>}
    {confirmation && <div className={styles.backdrop}><section ref={confirmationRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="erasure-confirm-title" tabIndex={-1}>
      <h3 id="erasure-confirm-title">Hesabı kalıcı olarak sil</h3>
      <p><strong>{confirmation.displayName}</strong><br/>{confirmation.email}</p>
      <p className={styles.reference}>Talep: {confirmation.id}</p>
      <p>Bu hesabın oturumları kapanacak; profil, paylaşımlar, mesajlar ve yüklediği dosyalar temizlenecek. Diğer kullanıcıların mesajları ve ortak alanlardaki içerikleri korunacak. Başlayan işlem iptal edilemez.</p>
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={Boolean(busyId)} onChange={(event) => setConfirmed(event.target.checked)}/><span>Bu hesaba ait silme talebini kontrol ettim ve kalıcı silmeyi başlatmak istiyorum.</span></label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.dialogActions}><button type="button" disabled={Boolean(busyId)} onClick={closeConfirmation}>Vazgeç</button><button type="button" className={styles.danger} disabled={disabled || !confirmed || needsReconciliation} onClick={() => void mutate("execute", confirmation.id)}>{busyId ? "Başlatılıyor…" : "Kalıcı silmeyi başlat"}</button></div>
    </section></div>}
  </section>;
}
