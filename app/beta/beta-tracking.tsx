"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { BETA_STATUS, type BetaMessage, type BetaRequest } from "../../lib/beta-types";
import { BETA_RECEIPT_KEY } from "./beta-form";
import styles from "./beta.module.css";
type Receipt = { request: Pick<BetaRequest, "id" | "kind" | "platform" | "status" | "subject" | "message" | "playUrl" | "createdAt" | "updatedAt" | "expiresAt">; messages: BetaMessage[] };
const subscribe = (changed: () => void) => { window.addEventListener("hashchange", changed); window.addEventListener("storage", changed); return () => { window.removeEventListener("hashchange", changed); window.removeEventListener("storage", changed); }; };
const savedToken = () => { let value = window.location.hash.slice(1); if (!value) try { value = localStorage.getItem(BETA_RECEIPT_KEY) ?? ""; } catch { /* Manual entry is available. */ } return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : ""; };

export function BetaTracking() {
  const initialToken = useSyncExternalStore(subscribe, savedToken, () => "");
  const [enteredToken, setToken] = useState<string | null>(null), [data, setData] = useState<Receipt | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [confirm, setConfirm] = useState(false);
  const token = enteredToken ?? initialToken;
  const pending = useRef<AbortController | null>(null), messageId = useRef(""), alive = useRef(true), version = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; pending.current?.abort(); };
  }, []);
  async function request(action = "read") {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    const current = ++version.current; setBusy(true); setError("");
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      if (action === "message") messageId.current ||= crypto.randomUUID();
      const response = await fetch("/api/beta/status", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action, token, message, requestId: messageId.current, confirm }) });
      const body = await response.json(); if (!alive.current || current !== version.current) return;
      if (controller.signal.aborted) throw new Error("Yanıt zamanında alınamadı.");
      if (!response.ok) { setData(null); throw new Error(body.error ?? "Takip bilgisi yüklenemedi."); }
      setData(body); setConfirm(false);
      if (action === "message") { setMessage(""); messageId.current = ""; }
    } catch (cause) { if (alive.current && current === version.current) setError(controller.signal.aborted ? "Yanıt alınamadı. Durumu yenileyerek kontrol edebilirsin." : cause instanceof Error ? cause.message : "Takip bilgisi yüklenemedi."); }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (alive.current && current === version.current) setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void request("message"); }
  return <>
    <span className={styles.eyebrow}>BAŞVURU VE DESTEK</span><h1>Gelişmeler burada.</h1><p className={styles.intro}>Kişisel takip kodunla durumunu kontrol et, ek bilgi gönder ve ekibin yanıtlarını gör.</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void request(); }}><label>Takip kodun<input required value={token} minLength={43} maxLength={43} autoComplete="off" spellCheck={false} disabled={busy} onChange={event => { setToken(event.target.value.trim()); setData(null); setMessage(""); messageId.current = ""; setConfirm(false); }}/></label><button className={styles.primary} disabled={busy}>{busy ? "Kontrol ediliyor…" : "Durumumu göster"}</button></form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {data && <section className={styles.tracking} aria-live="polite"><span className={styles.badge}>{data.request.kind === "feedback" && data.request.status === "new" ? "Geri bildirim alındı" : BETA_STATUS[data.request.status]}</span><h2>{data.request.subject}</h2><p className={styles.messageText}>{data.request.message}</p>
      <p className={styles.hint}>Son güncelleme: {new Date(data.request.updatedAt.replace(" ", "T") + "Z").toLocaleString("tr-TR")}</p>
      {data.request.kind === "application" && data.request.platform === "web" && data.request.status !== "withdrawn" && <p>Web testine başvurdun. Hesabını e-postayla iletilecek bağlantıdan etkinleştirip belirlediğin parolayla giriş yapabilirsin. Android cihaz veya 14 günlük katılım koşulu yoktur.</p>}
      {data.request.status === "ready" && data.request.platform !== "web" && <p>Katılım koşullarını karşılayan başvurun test erişimi için sırada. Google Play erişimin açıldığında bağlantın burada yer alacak.</p>}
      {data.request.platform !== "web" && data.request.playUrl && ["invited", "testing", "completed"].includes(data.request.status) && <><a className={styles.primary} href={data.request.playUrl} target="_blank" rel="noopener noreferrer">Google Play testine katıl ↗</a><p>Başvuruda yazdığın Google hesabıyla aç ve “Test kullanıcısı ol” adımını tamamla. Listeye eklenmek tek başına teste katılmış olmak değildir.</p>{data.request.status === "invited" && <button className={styles.secondary} disabled={busy} onClick={() => void request("joined")}>Google Play’de teste katıldım</button>}</>}
      {data.request.status === "testing" && data.request.platform !== "web" && <p>Katıldığını bildirdin. Uygulamayı doğal biçimde kullanıp deneyimini paylaşabilirsin. Google Play test süresi Console üzerinden ayrıca doğrulanır.</p>}
      <h3>Görüşme</h3>{data.messages.length === 0 && <p className={styles.hint}>Henüz bir yanıt yok. Ek bilgi göndermek istersen aşağıya yazabilirsin.</p>}
      <div className={styles.conversation}>{data.messages.map(item => <article key={item.id}><strong>{item.authorKind === "applicant" ? "Sen" : item.authorKind === "automation" ? "Kampira · otomatik ön değerlendirme" : "Kampira destek"}</strong><p className={styles.messageText}>{item.content}</p></article>)}</div>
      {data.request.status !== "withdrawn" && <><form className={styles.form} onSubmit={submit}><label>Ek bilgi veya yanıtın<textarea value={message} minLength={5} maxLength={3000} required rows={4} onChange={event => { setMessage(event.target.value); messageId.current = ""; }}/></label><button className={styles.primary} disabled={busy}>Mesajımı gönder</button></form><details className={styles.withdraw}><summary>{data.request.kind === "application" ? "Başvurudan ayrıl" : "Talebi kapat ve bilgilerini sil"}</summary><p>Bu kayıttaki iletişim bilgilerin ve görüşme metinleri temizlenir. {data.request.kind === "application" && <>Başvuruya ait test hesabının erişimi kapanır ve oturumları sonlanır; hesabın ve içeriklerin ayrıca silme talebine tabidir. {data.request.platform !== "web" && "Google Play testinden ayrılmak için test bağlantısını ayrıca kullanabilirsin."}</>}</p><label className={styles.checkbox}><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)}/><span>Bu talebi kapatıp form bilgilerimi silmek istiyorum.</span></label><button className={styles.secondary} disabled={busy || !confirm} onClick={() => void request("withdraw")}>Talebi kapat</button></details></>}
    </section>}
  </>;
}
