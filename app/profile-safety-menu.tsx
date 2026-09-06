"use client";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { useAppNavigation } from "./app-navigation";
import { useAppLayer } from "./use-app-layer";
import { useWorkspaceState } from "./use-workspace-state";

export function ProfileSafetyMenu(props: { targetId: string; targetName: string }) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  return <SafetyMenu key={`${ownerScope}:${props.targetId}`} {...props}/>;
}

function SafetyMenu({ targetId, targetName }: { targetId: string; targetName: string }) {
  const navigation = useAppNavigation();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false), [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draft, setDraft] = useWorkspaceState(`safety-report:${targetId}`, { reason: "harassment", details: "" });
  const pending = useRef(false), mounted = useRef(true);
  const expire = useEffectEvent(() => navigation?.onSessionExpired());
  const { ref: layerRef, close: closeLayer } = useAppLayer({ id: `profile.safety:${targetId}`, open, onClose: () => setOpen(false), onRestore: () => setOpen(true), busy });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/safety", { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) { expire(); return; }
        const body = await response.json() as { blocked?: Array<{ public_id: string }>; muted?: Array<{ public_id: string }>; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok || !body.blocked || !body.muted) throw new Error(body.error ?? "Güvenlik tercihlerin getirilemedi.");
        setBlocked(body.blocked.some((user) => user.public_id === targetId));
        setMuted(body.muted.some((user) => user.public_id === targetId)); setLoading(false);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Güvenlik tercihlerin getirilemedi."); }
    })();
    return () => controller.abort();
  }, [open, targetId, revision]);

  async function submit(payload: Record<string, unknown>) {
    const response = await fetch("/api/safety", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!mounted.current) return null;
    if (response.status === 401) { navigation?.onSessionExpired(); return null; }
    const body = await response.json() as { active?: boolean; report?: unknown; error?: string };
    if (!mounted.current) return null;
    if (!response.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
    return body;
  }
  async function toggle(action: "block" | "mute") {
    if (loading || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const body = await submit({ action, targetId, active: !(action === "block" ? blocked : muted) });
      if (!body) return;
      if (typeof body.active !== "boolean") throw new Error("İşlem sonucu doğrulanamadı. Tercihlerini yenileyip tekrar dene.");
      if (action === "block") setBlocked(body.active); else setMuted(body.active);
      setNotice(body.active ? action === "block" ? "Hesap engellendi." : "Hesap sessize alındı." : "Kısıtlama kaldırıldı.");
      navigation?.onSafetyChanged?.(targetId, action, body.active);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const body = await submit({ action: "report", entityType: "user", entityId: targetId, ...draft });
      if (!body) return;
      if (!body.report) throw new Error("Şikâyet kaydı doğrulanamadı. Güvenlik bölümünden kayıtlarını kontrol et.");
      setDraft({ reason: "harassment", details: "" }); setNotice("Şikâyetin kaydedildi. Sonucunu Güvenlik bölümünden takip edebilirsin.");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Şikâyet kaydedilemedi."); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <><button className="profile-safety-trigger" type="button" onClick={() => { setLoading(true); setError(""); setOpen(true); }}>Güvenlik</button><div className="feature-overlay" style={{ display: open ? undefined : "none" }}><section ref={layerRef} className="feature-dialog profile-safety-dialog" role="dialog" aria-modal="true" aria-labelledby={`safety-${targetId}`}>
    <header><h2 id={`safety-${targetId}`}>{targetName}</h2><button type="button" aria-label="Pencereyi kapat" onClick={() => closeLayer()} disabled={busy}><X size={22}/></button></header>
    <div className="profile-safety-actions"><button type="button" disabled={loading || busy} className={muted ? "active" : ""} onClick={() => void toggle("mute")}><strong>{muted ? "Sessizi kaldır" : "Sessize al"}</strong><small>Gönderileri akışından çıkar.</small></button><button type="button" disabled={loading || busy} className="danger" onClick={() => void toggle("block")}><strong>{blocked ? "Engeli kaldır" : "Engelle"}</strong><small>İki yönlü görünürlük ve etkileşimi kapat.</small></button></div>
    {loading && !error && <p role="status">Güvenlik tercihlerin getiriliyor…</p>}
    <form onSubmit={report}><h3>Hesabı şikâyet et</h3><label>Neden<select name="reason" value={draft.reason} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}><option value="harassment">Taciz veya zorbalık</option><option value="spam">Spam</option><option value="privacy">Kişisel veri ihlali</option><option value="copyright">Telif ihlali</option><option value="misinformation">Yanıltıcı akademik içerik</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea name="details" maxLength={800} rows={4} disabled={busy} value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label><button className="feature-danger" type="submit" disabled={busy}>{busy ? "İşleniyor…" : "Şikâyeti gönder"}</button></form>
    {error && <p className="feature-error" role="alert">{error}{loading && <button type="button" onClick={() => { setError(""); setRevision((value) => value + 1); }}>Tekrar dene</button>}</p>}{notice && <p className="feature-feedback-state" role="status">{notice}</p>}
  </section></div></>;
}
