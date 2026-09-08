"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BETA_CATEGORIES } from "../../lib/beta-types";
import styles from "./beta.module.css";

export const BETA_RECEIPT_KEY = "kampira.beta.lastReceipt";
function createToken() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

export function BetaForm({ kind }: { kind: "application" | "feedback" }) {
  const application = kind === "application";
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState(""), [attemptToken, setAttemptToken] = useState("");
  const token = useRef(""), pending = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort(); }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget), source: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) { const value = new URLSearchParams(window.location.search).get(key); if (value) source[key] = value; }
    token.current ||= createToken();
    setAttemptToken(token.current);
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/beta/requests", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), kind, token: token.current, source,
          consent: form.get("consent") === "on", adult: form.get("adult") === "on", android: form.get("android") === "on", participation: form.get("participation") === "on" }) });
      const result = await response.json(); if (!active.current) return;
      if (controller.signal.aborted) throw new Error("Yanıt zamanında alınamadı.");
      if (!response.ok || !result.received) throw new Error(result.error ?? "Gönderim doğrulanamadı.");
      try { localStorage.setItem(BETA_RECEIPT_KEY, token.current); } catch { /* The visible receipt remains usable without storage. */ }
      setReceipt(token.current);
    } catch (cause) { if (active.current) setError(controller.signal.aborted ? "Yanıt zamanında alınamadı. Aynı formu yeniden gönderebilir veya takip koduyla kontrol edebilirsin." : cause instanceof Error ? cause.message : "Form gönderilemedi."); }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (active.current) setBusy(false); }
  }
  if (receipt) return <div className={styles.success} role="status">
    <span className={styles.eyebrow}>BİZE ULAŞTI</span><h1>{application ? "Başvurunu aldık." : "Geri bildirimin kaydedildi."}</h1>
    <p>{application ? "Başvurunu değerlendireceğiz. Test erişimin hazır olduğunda katılım bağlantını takip sayfanda göreceksin." : "Ekibin yanıtını takip sayfanda görebilir ve görüşmeye devam edebilirsin."}</p>
    <Link className={styles.primary} href={`/beta/takip#${receipt}`}>Durumumu ve yanıtları gör →</Link>
    <label className={styles.receipt}>Kişisel takip kodun<input readOnly value={receipt} onFocus={event => event.currentTarget.select()}/></label>
    <p className={styles.hint}>Bu kod yalnız sana aittir; yanıtlarını açar. Güvenli bir yere kaydet. Son kod bu tarayıcıda hatırlanır. E-posta gönderilmez; gelişmeleri takip sayfandan kontrol edebilirsin.</p>
    <Link className={styles.textLink} href="/beta">Test hakkında bilgi al</Link>
  </div>;
  return <>
    <span className={styles.eyebrow}>{application ? "ANDROID KAPALI TEST · 18+" : "HATA, ÖNERİ VE DESTEK"}</span>
    <h1>{application ? "İlk deneyenlerden ol." : "Birlikte daha iyi yapalım."}</h1>
    <p className={styles.intro}>{application ? "Google Play hesabını ve cihazını paylaş. Başvurunun durumunu ve test katılım bağlantını kişisel takip sayfandan görebileceksin." : "Bir sorun mu yaşadın, bir fikrin mi var? Giriş yapmadan bize yazabilir, takip kodunla yanıt alabilirsin."}</p>
    <form className={styles.form} onSubmit={event => void submit(event)}>
      <div className={styles.twoColumns}><label>Adın (isteğe bağlı)<input name="displayName" autoComplete="given-name" maxLength={80}/></label><label>{application ? "Google Play hesabının e-postası" : "E-posta (isteğe bağlı)"}<input name="email" type="email" autoComplete="email" required={application} maxLength={254}/></label></div>
      {application && <label>Üniversiten (isteğe bağlı)<input name="university" maxLength={120} autoComplete="organization"/></label>}
      <div className={styles.twoColumns}><label>Cihaz modeli{!application && " (isteğe bağlı)"}<input name="deviceModel" placeholder="Örn. Samsung Galaxy A54" required={application} minLength={application ? 2 : undefined} maxLength={120}/></label><label>Android sürümü (isteğe bağlı)<input name="androidVersion" placeholder="Örn. Android 14" maxLength={30}/></label></div>
      {!application && <><label>Ne hakkında yazıyorsun?<select name="category">{Object.entries(BETA_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Kısaca konu<input name="subject" required minLength={5} maxLength={160} placeholder="Örn. Ders notu yüklerken ekran kapanıyor"/></label></>}
      <label>{application ? "Eklemek istediğin bir şey var mı? (isteğe bağlı)" : "Bize anlat"}<textarea name="message" rows={5} maxLength={3000} minLength={application ? undefined : 10} required={!application} placeholder={application ? "Testte özellikle denemek istediğin özellikleri yazabilirsin." : "Ne yaparken oldu? Ne olmasını bekledin, ne oldu? Uygulama sürümünü de biliyorsan ekle."}/></label>
      <p className={styles.hint}>Parolanı, doğrulama kodunu, kimlik veya ödeme bilgilerini yazma. Mesajın yalnız yetkili destek ekibine görünür.</p>
      <div className={styles.honeypot} aria-hidden="true"><label>Web siten<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      {application && <fieldset className={styles.confirmations}><legend>Katılım koşulları</legend><label><input type="checkbox" name="adult" required/><span>18 yaşında veya üzerindeyim.</span></label><label><input type="checkbox" name="android" required/><span>Uygulamayı deneyebileceğim bir Android telefon veya tabletim var.</span></label><label><input type="checkbox" name="participation" required/><span>Teste katıldıktan sonra 14 gün boyunca testte kalabilir, uygulamayı deneyip geri bildirim paylaşabilirim.</span></label></fieldset>}
      <label className={styles.checkbox}><input type="checkbox" name="consent" required/><span>Bilgilerimin bu {application ? "başvuruyu değerlendirmek, test erişimini hazırlamak" : "talebi incelemek"} ve yanıtlamak için kullanılacağını okudum. Kayıt ve görüşmeler 90 gün sonra temizlenir; reklam listesine eklenmem. <Link href="/legal#beta">Başvuru ve destek gizliliği</Link></span></label>
      {error && <div role="alert" className={styles.error}><p>{error}</p>{attemptToken && <Link href={`/beta/takip#${attemptToken}`}>Gönderim durumunu kontrol et</Link>}</div>}
      <button className={styles.primary} disabled={busy} type="submit">{busy ? "Gönderiliyor…" : application ? "Başvurumu gönder →" : "Geri bildirimi gönder →"}</button>
    </form>
  </>;
}
