"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Prohibit } from "@phosphor-icons/react/dist/csr/Prohibit";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type { MessageRecipient, SessionMessage } from "../lib/message-drafts";
import { useAppLayer } from "./use-app-layer";
import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { useAppNavigation } from "./app-navigation";
import { useWorkspaceState } from "./use-workspace-state";
import styles from "./message-context-actions.module.css";

export type MessageActionTarget = { person: MessageRecipient; message?: SessionMessage };
type ReportDraft = { reason: string; details: string };

export function MessageContextActions({ target, onClose, onRestore, onRestriction, preview }: {
  target: MessageActionTarget | null; onClose: () => void; onRestore: (target: MessageActionTarget) => void;
  onRestriction: (person: MessageRecipient, restricted: boolean) => void;
  preview?: { mode: "gallery"; onAction: (label: string) => void };
}) {
  const fetch = useAuthenticatedFetch();
  const isPreview = preview?.mode === "gallery";
  const navigation = useAppNavigation();
  const lastTarget = useRef<MessageActionTarget | null>(target);
  const [reportOpen, setReportOpen] = useState(false), [blockOpen, setBlockOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(target && !target.message && !isPreview)), [blocked, setBlocked] = useState<boolean | null>(isPreview ? false : null), [revision, setRevision] = useState(0);
  const [previewBlocked, setPreviewBlocked] = useState(false), [reportedKey, setReportedKey] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [blockPending, setBlockPending] = useState<string | null>(null);
  const blockMutationPending = useRef(false);
  const pending = useRef(false), mounted = useRef(false), targetVersion = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const [drafts, setDrafts] = useWorkspaceState<Record<string, ReportDraft>>(isPreview ? "dm:context-preview-reports" : "dm:context-reports", {});
  const targetKey = target ? `${target.message ? "direct-message" : "user"}:${target.message?.id ?? target.person.publicId}` : "";
  const [visibleTargetKey, setVisibleTargetKey] = useState(targetKey);
  if (visibleTargetKey !== targetKey) {
    setVisibleTargetKey(targetKey);
    setBusy(false); setError(""); setNotice(""); setBlocked(isPreview ? previewBlocked : null);
    setLoading(Boolean(target && !target.message && !isPreview));
    setReportOpen(false); setBlockOpen(false);
  }
  const reportDraft = drafts[targetKey] ?? { reason: "harassment", details: "" };
  const reportAcknowledged = Boolean(targetKey && reportedKey === targetKey);
  const canReport = Boolean(target && (!target.message || (!target.message.own && !target.message.removed)));
  const updateDraft = (changes: Partial<ReportDraft>) => setDrafts((current) => ({ ...current, [targetKey]: { ...reportDraft, ...changes } }));
  const { ref: menuRef, close: closeMenu } = useAppLayer({ id: "dm.context", open: Boolean(target), onClose: () => { onClose(); setReportOpen(false); setBlockOpen(false); }, onRestore: () => { if (lastTarget.current) onRestore(lastTarget.current); }, busy });
  const { ref: reportRef, close: closeReport } = useAppLayer({ id: "dm.context.report", open: Boolean(target && reportOpen), onClose: () => setReportOpen(false), onRestore: () => setReportOpen(true), busy });
  const { ref: blockRef, close: closeBlock } = useAppLayer({ id: "dm.context.block", open: Boolean(target && blockOpen), onClose: () => setBlockOpen(false), onRestore: () => setBlockOpen(true), busy });
  const restrictionCallback = useRef(onRestriction);
  useEffect(() => { restrictionCallback.current = onRestriction; }, [onRestriction]);
  useEffect(() => {
    const version = targetVersion, activeRequests = requests.current;
    mounted.current = true;
    return () => { mounted.current = false; version.current++; for (const controller of activeRequests) controller.abort(); activeRequests.clear(); };
  }, []);
  const requestSafety = useCallback(async <T,>(payload?: Record<string, unknown>, controller = new AbortController()) => {
    const owner = fetch.beginResponseCheck(), check = fetch.beginResponseCheck(controller.signal);
    requests.current.add(controller);
    let releaseAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(new DOMException("İstek iptal edildi.", "AbortError"));
      controller.signal.addEventListener("abort", abort, { once: true });
      releaseAbort = () => controller.signal.removeEventListener("abort", abort);
      if (controller.signal.aborted) abort();
    });
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetch("/api/safety", payload ? { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store", signal: controller.signal });
        if (!check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        const body = await response.json() as T;
        if (!check.isCurrent()) throw new DOMException("Oturum değişti.", "AbortError");
        return { response, body };
      })()]);
    } catch (cause) {
      if (controller.signal.aborted && owner.isCurrent()) throw new Error("İstek zaman aşımına uğradı. Sonuç doğrulanamadı; durumu kontrol edip yeniden dene.");
      throw cause;
    } finally { window.clearTimeout(timeout); releaseAbort(); requests.current.delete(controller); }
  }, [fetch]);
  useEffect(() => {
    targetVersion.current++;
    pending.current = false;
    if (target) lastTarget.current = target;
    if (!target || target.message || blockMutationPending.current || isPreview) return;
    const controller = new AbortController();
    const check = fetch.beginResponseCheck();
    let cancelled = false;
    void requestSafety<{ blocked?: Array<{ public_id: string }>; error?: string }>(undefined, controller).then(({ response, body }) => {
      if (cancelled || !check.isCurrent()) return;
      if (!response.ok || !Array.isArray(body.blocked) || !body.blocked.every((item) => typeof item?.public_id === "string")) throw new Error(body.error ?? "Engelleme durumu getirilemedi.");
      const active = body.blocked.some((item) => item.public_id === target.person.publicId);
      setBlocked(active); restrictionCallback.current(target.person, active);
    }).catch((cause) => { if (!cancelled && check.isCurrent()) setError(cause instanceof Error ? cause.message : "Engelleme durumu getirilemedi."); }).finally(() => { if (!cancelled && check.isCurrent()) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [target, fetch, requestSafety, revision, isPreview]);

  async function copy() {
    if (!target?.message?.body || target.message.removed || pending.current) return;
    if (isPreview) { const label = "Galeri simülasyonu · Metin kopyalama örneği; gerçek panoya yazılmadı."; setNotice(label); preview.onAction(label); return; }
    const version = targetVersion.current;
    const check = fetch.beginResponseCheck();
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Bu tarayıcı panoya yazmaya izin vermiyor. Mesaj metnini seçerek kopyalayabilirsin.");
      await navigator.clipboard.writeText(target.message.body);
      if (mounted.current && version === targetVersion.current && check.isCurrent()) setNotice("Mesaj metni kopyalandı.");
    } catch {
      if (mounted.current && version === targetVersion.current && check.isCurrent()) setError("Metin kopyalanamadı. Tarayıcı pano iznini kontrol et veya mesaj metnini seçerek kopyala.");
    } finally { if (mounted.current && version === targetVersion.current) { pending.current = false; setBusy(false); } }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !canReport || pending.current || reportAcknowledged) return;
    if (isPreview) { const label = "Galeri simülasyonu · Şikâyet örneği tamamlandı; sunucuda kayıt oluşturulmadı."; setReportedKey(targetKey); setNotice(label); preview.onAction(label); return; }
    const version = targetVersion.current, key = targetKey;
    const check = fetch.beginResponseCheck();
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { response, body } = await requestSafety<{ report?: { id?: string }; error?: string }>({ action: "report", entityType: target.message ? "direct-message" : "user", entityId: target.message?.id ?? target.person.publicId, ...reportDraft });
      if (!mounted.current || version !== targetVersion.current || !check.isCurrent()) return;
      if (!response.ok || typeof body.report?.id !== "string" || !body.report.id) throw new Error(body.error ?? "Şikâyet kaydı doğrulanamadı. Yeniden deneyebilirsin.");
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      setReportedKey(key);
      setNotice("Şikâyetin kaydedildi. Durumunu Güvenlik bölümünden takip edebilirsin.");
    } catch (cause) { if (mounted.current && version === targetVersion.current && check.isCurrent()) setError(cause instanceof Error ? cause.message : "Şikâyet gönderilemedi."); }
    finally { if (mounted.current && version === targetVersion.current) { pending.current = false; setBusy(false); } }
  }

  async function toggleBlock() {
    if (!target || target.message || blocked === null || pending.current || blockPending !== null) return;
    if (isPreview) { const label = `Galeri simülasyonu · ${blocked ? "Engeli kaldırma" : "Engelleme"} örneği; gerçek hesap durumu değişmedi.`; setBlocked(!blocked); setPreviewBlocked(!blocked); setNotice(label); preview.onAction(label); return; }
    const version = targetVersion.current, person = target.person;
    const check = fetch.beginResponseCheck();
    blockMutationPending.current = true;
    setBlockPending(person.publicId);
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { response, body } = await requestSafety<{ active?: boolean; error?: string }>({ action: "block", targetId: person.publicId, active: !blocked });
      if (!mounted.current || !check.isCurrent()) return;
      if (!response.ok || typeof body.active !== "boolean") throw new Error(body.error ?? "Engelleme sonucu doğrulanamadı. Durumu yenileyip tekrar dene.");
      // Back can dismiss the panel while the server commits. Apply a confirmed preference to this
      // owner's DM cache even then; only feedback is tied to the still-visible target.
      restrictionCallback.current(person, body.active);
      navigation?.onSafetyChanged?.(person.publicId, "block", body.active);
      if (version === targetVersion.current) {
        setBlocked(body.active);
        setNotice(body.active ? "Kişi engellendi. Bu kişiye mesaj gönderemezsin." : "Engel kaldırıldı. Konuşma yeniden yükleniyor.");
      }
    } catch (cause) { if (mounted.current && version === targetVersion.current && check.isCurrent()) setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally {
      blockMutationPending.current = false;
      if (mounted.current) {
        setBlockPending(null);
        if (version === targetVersion.current) { pending.current = false; setBusy(false); }
        else if (check.isCurrent()) setRevision((value) => value + 1);
      }
    }
  }
  const status = <>{isPreview && <p className={styles.simulation}>Galeri simülasyonu · Pano ve sunucu işlemleri kapalı.</p>}{error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}</>;
  return <>
    {target && <div className={styles.overlay}><section ref={menuRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="dm-context-title"><header><div><h2 id="dm-context-title">{target.message ? "Mesaj seçenekleri" : target.person.displayName}</h2><p>{target.message ? target.message.own ? "Gönderdiğin mesaj" : target.person.displayName : `@${target.person.handle}`}</p></div><button type="button" disabled={busy} onClick={closeMenu} aria-label="Seçenekleri kapat"><X size={24}/></button></header>
      {target.message?.body && <p className={styles.preview}>{target.message.body}</p>}
      <div className={styles.actions}>
        {target.message?.body && !target.message.removed && <button type="button" disabled={busy} onClick={() => void copy()}><Copy size={22}/><span>Metni kopyala</span></button>}
        {canReport && <button type="button" disabled={busy} onClick={() => { setError(""); setNotice(""); setReportOpen(true); }}><WarningCircle size={22}/><span>{target.message ? "Mesajı şikâyet et" : "Kişiyi şikâyet et"}</span></button>}
        {!target.message && <button type="button" disabled={busy || loading || blocked === null || blockPending !== null} onClick={() => { setError(""); setNotice(""); setBlockOpen(true); }}><Prohibit size={22}/><span>{blocked ? "Engeli kaldır" : "Kişiyi engelle"}</span></button>}
      </div>{!reportOpen && !blockOpen && status}{!target.message && loading && <p role="status">Engelleme durumu kontrol ediliyor…</p>}{!target.message && blocked === null && !loading && <button type="button" className={styles.retry} onClick={() => { setLoading(true); setError(""); setRevision((value) => value + 1); }}>Durumu yeniden dene</button>}
    </section></div>}
    {target && reportOpen && <div className={styles.overlay}><section ref={reportRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="dm-report-title"><header><h2 id="dm-report-title">{target.message ? "Mesajı şikâyet et" : "Kişiyi şikâyet et"}</h2><button type="button" disabled={busy} onClick={closeReport} aria-label="Şikâyet formunu kapat"><X size={24}/></button></header><p>{target.message ? "Yalnızca seçtiğin mesajın kanıt kopyası incelemeye gönderilir." : `${target.person.displayName} hesabını bildiriyorsun.`}</p><form onSubmit={submitReport}><label>Neden<select value={reportDraft.reason} disabled={busy || reportAcknowledged} onChange={(event) => updateDraft({ reason: event.target.value })}><option value="harassment">Taciz veya zorbalık</option><option value="spam">Spam</option><option value="privacy">Gizlilik ihlali</option><option value="copyright">Telif ihlali</option><option value="misinformation">Yanıltıcı içerik</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea rows={4} maxLength={800} value={reportDraft.details} disabled={busy || reportAcknowledged} onChange={(event) => updateDraft({ details: event.target.value })}/></label>{status}{reportAcknowledged && !notice && <p role="status">{isPreview ? "Galeri simülasyonu tamamlandı." : "Şikâyetin kaydedildi. Durumunu Güvenlik bölümünden takip edebilirsin."}</p>}<button className={styles.primary} type="submit" disabled={busy || reportAcknowledged}>{busy ? "Gönderiliyor…" : "Şikâyeti gönder"}</button></form></section></div>}
    {target && blockOpen && <div className={styles.overlay}><section ref={blockRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="dm-block-title"><header><h2 id="dm-block-title">{blocked ? "Engeli kaldır" : "Kişiyi engelle"}</h2><button type="button" disabled={busy} onClick={closeBlock} aria-label="Engelleme penceresini kapat"><X size={24}/></button></header><p>{blocked ? `${target.person.displayName} ile yeniden iletişim kurabilirsin.` : `${target.person.displayName} ile iki yönlü görünürlük ve mesajlaşma kapanır. Bu cihazdaki konuşma önbelleği ve gönderilmemiş taslak temizlenir.`}</p>{status}<button className={styles.primary} type="button" disabled={busy || blocked === null || Boolean(notice) || blockPending !== null} onClick={() => void toggleBlock()}>{busy ? "İşleniyor…" : blocked ? "Engeli kaldır" : "Engelle"}</button></section></div>}
  </>;
}
