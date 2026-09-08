"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BETA_STATUS, BETA_CATEGORIES, type BetaMessage, type BetaRequest, type BetaStatus } from "../lib/beta-types";
import styles from "./beta-review.module.css";

type Queue = { items: BetaRequest[]; nextCursor: string | null; staffContext: string; detail: { messages: BetaMessage[] } | null };
const date = (value: string) => new Date(value.replace(" ", "T") + "Z").toLocaleString("tr-TR");

export function BetaReview({ onAccessChanged }: { onAccessChanged: () => Promise<void> }) {
  const [kind, setKind] = useState("application"), [status, setStatus] = useState("open"), [cursor, setCursor] = useState(""), [selected, setSelected] = useState("");
  const [queue, setQueue] = useState<Queue | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const active = useRef(true), generation = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(), current = ++generation.current;
    const timer = setTimeout(() => controller.abort(), 20000);
    const params = new URLSearchParams({ kind, status, cursor, ...(selected ? { id: selected } : {}) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/beta?${params}`, { cache: "no-store", signal: controller.signal });
        if (!active.current || current !== generation.current) return;
        if ([401, 403, 428].includes(response.status)) { setQueue(null); void onAccessChanged(); throw new Error("Yönetim oturumun değişti."); }
        const body = await response.json(); if (!active.current || current !== generation.current || controller.signal.aborted) return;
        if (!response.ok) throw new Error(body.error ?? "Kuyruk yüklenemedi.");
        setQueue(body); setError("");
      } catch (cause) { if (active.current && current === generation.current) { setQueue(null); setError(controller.signal.aborted ? "Kuyruk zamanında yüklenemedi. Yeniden dene." : cause instanceof Error ? cause.message : "Kuyruk yüklenemedi."); } }
      finally { clearTimeout(timer); if (active.current && current === generation.current) setLoading(false); }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [kind, status, cursor, selected, revision, onAccessChanged]);
  function refresh() { setLoading(true); setQueue(null); setError(""); setRevision(value => value + 1); }
  function change(action: () => void) { setQueue(null); setSelected(""); setCursor(""); setLoading(true); action(); }
  function exportEmails() {
    const emails = [...new Set(queue?.items.filter(item => item.kind === "application" && item.platform !== "web" && item.status === "ready").map(item => item.email).filter(Boolean))];
    const csv = emails.map(email => `"${(/^[=+@-]/.test(email) ? "'" : "") + email.replaceAll('"', '""')}"`).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "kampira-test-bu-sayfa.csv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const current = queue?.items.find(item => item.id === selected);
  return <section className={styles.root}>
    <header><h2>Test başvuruları ve geri bildirimler</h2><p>Başvuruları değerlendir, test erişimini takip et ve kişisel takip sayfasına yanıt bırak.</p></header>
    <div className={styles.controls}><label>Kayıt türü<select value={kind} onChange={event => change(() => setKind(event.target.value))}><option value="application">Test başvuruları</option><option value="feedback">Geri bildirim ve destek</option></select></label><label>Durum<select value={status} onChange={event => change(() => setStatus(event.target.value))}><option value="open">Açık kayıtlar</option><option value="all">Tümü</option>{Object.entries(BETA_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button onClick={refresh} disabled={loading}>Yenile</button>{kind === "application" && <button onClick={exportEmails} disabled={loading || !queue?.items.some(item => item.platform !== "web" && item.status === "ready")}>Bu sayfanın hazır Play e-postalarını indir</button>}</div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{loading && <p role="status">Kayıtlar yükleniyor…</p>}
    {queue?.items.length === 0 && <p>Bu filtrede kayıt yok.</p>}
    <div className={styles.grid}>{queue?.items.map(item => <article key={item.id} className={styles.card}><div className={styles.row}><span>{BETA_STATUS[item.status]}</span><small>{date(item.createdAt)}</small></div><h3>{item.displayName || item.subject}</h3>{item.email && <p>{item.email}</p>}<p>{item.kind === "application" ? item.platform === "web" ? "Web — tarayıcıdan" : `${item.platform === "both" ? "Web ve Android" : "Android"} · ${item.deviceModel} · ${item.androidVersion || "Sürüm belirtilmemiş"}` : BETA_CATEGORIES[item.category as keyof typeof BETA_CATEGORIES]}</p><p className={styles.preview}>{item.message}</p><small>Öncelik: {({ normal: "Normal", high: "Yüksek", urgent: "Acil" })[item.priority]}</small><button onClick={() => { setQueue(null); setLoading(true); setSelected(item.id); }} disabled={loading}>İncele ve yanıtla</button></article>)}</div>
    {queue && (cursor || queue.nextCursor) && <div className={styles.controls}>{cursor && <button onClick={() => change(() => setCursor(""))}>İlk sayfa</button>}{queue.nextCursor && <button onClick={() => { setQueue(null); setSelected(""); setLoading(true); setCursor(queue.nextCursor!); }}>Sonraki kayıtlar</button>}</div>}
    {current && queue && <BetaReviewDetail key={`${queue.staffContext}:${current.id}:${current.revision}`} item={current} messages={queue.detail?.messages ?? []} context={queue.staffContext} onSaved={refresh} onAccessChanged={onAccessChanged}/>}
  </section>;
}

function BetaReviewDetail({ item, messages, context, onSaved, onAccessChanged }: { item: BetaRequest; messages: BetaMessage[]; context: string; onSaved: () => void; onAccessChanged: () => Promise<void> }) {
  const [status, setStatus] = useState<BetaStatus>(item.status), [priority, setPriority] = useState(item.priority), [note, setNote] = useState(item.internalNote), [reply, setReply] = useState(""), [playUrl, setPlayUrl] = useState(item.playUrl), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [stale, setStale] = useState(false);
  const pending = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort(); }; }, []);
  const options = item.kind === "application" ? ["new", "needs_info", "ready", "invited", "testing", "completed", "declined"] : ["new", "needs_info", "triaged", "in_progress", "resolved"];
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current || stale) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/admin/beta", { method: "PATCH", signal: controller.signal, headers: { "content-type": "application/json", "X-Staff-Context": context },
        body: JSON.stringify({ id: item.id, revision: item.revision, status, priority, internalNote: note, reply, playUrl, accessConfirmed: confirmed }) });
      if (!active.current) return;
      if ([401, 403, 428].includes(response.status)) { setStale(true); void onAccessChanged(); throw new Error("Yönetim oturumun değişti."); }
      const body = await response.json(); if (!active.current || controller.signal.aborted) return;
      if (!response.ok) { if (response.status === 409) setStale(true); throw new Error(body.error ?? "Kayıt güncellenemedi."); }
      onSaved();
    } catch (cause) { if (active.current) { if (controller.signal.aborted) setStale(true); setError(controller.signal.aborted ? "Yanıt alınamadı. Tekrar kaydetmeden önce kuyruğu yenileyip sonucu kontrol et." : cause instanceof Error ? cause.message : "Kayıt güncellenemedi."); } }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (active.current) setBusy(false); }
  }
  return <section className={styles.detail} aria-label="Başvuru incelemesi"><h3>{item.subject}</h3><p><strong>{item.displayName || "Ad belirtilmemiş"}</strong> · {item.email || "E-posta belirtilmemiş"}</p><p>{item.university} · {item.deviceModel} · {item.androidVersion}</p><p className={styles.message}>{item.message}</p><small>Kayıt: {item.id} · Saklama sonu: {date(item.expiresAt)}</small>
    {item.kind === "application" && <p>Katılımcı beyanı: 18+ {item.adultConfirmed ? "✓" : "—"}{item.platform === "web" ? ". Yalnız web testi; Android cihaz ve 14 gün koşulu aranmaz." : <> · Android {item.androidConfirmed ? "✓" : "—"} · 14 gün {item.participationConfirmed ? "✓" : "—"}. Google Play katılımı ayrıca doğrulanır.</>}</p>}
    <h4>Görüşme</h4>{messages.length === 0 ? <p>Henüz ek mesaj yok.</p> : messages.map(message => <article className={styles.messageCard} key={message.id}><strong>{message.authorKind === "applicant" ? "Başvuran" : message.authorKind === "automation" ? "Otomatik ön değerlendirme" : "Destek ekibi"}</strong><p className={styles.message}>{message.content}</p></article>)}
    {item.status !== "withdrawn" && <form className={styles.form} onSubmit={event => void save(event)}>
      <div className={styles.controls}><label>Yeni durum<select value={status} onChange={event => setStatus(event.target.value as BetaStatus)}>{options.map(value => <option key={value} value={value}>{BETA_STATUS[value as BetaStatus]}</option>)}</select></label><label>Öncelik<select value={priority} onChange={event => setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label></div>
      <label>Ekip notu — yalnız yönetim<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={3000} rows={3}/></label><label>Başvurana yanıt — takip sayfasında görünür<textarea value={reply} onChange={event => setReply(event.target.value)} maxLength={3000} rows={4}/></label>
      {item.kind === "application" && item.platform !== "web" && <><label>Google Play kapalı test katılım bağlantısı<input type="url" value={playUrl} onChange={event => setPlayUrl(event.target.value)} placeholder="https://play.google.com/apps/testing/app.kampira.mobile" maxLength={500}/></label>{status === "invited" && item.status !== "invited" && <label className={styles.checkbox}><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Bu Google hesabını Play Console test listesine ekledim ve bu kapalı testin katılım bağlantısını doğruladım.</span></label>}</>}
      {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.controls}><button disabled={busy || stale}>{busy ? "Kaydediliyor…" : "Durumu ve yanıtı kaydet"}</button>{stale && <button type="button" onClick={onSaved}>Güncel kaydı yükle</button>}</div>
    </form>}
  </section>;
}
