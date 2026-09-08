"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "../beta.module.css";

export function TestActivation() {
  const [account, setAccount] = useState<{ loginEmail: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [showPassword, setShowPassword] = useState(false), [revision, setRevision] = useState(0);
  const token = useRef(""), active = useRef(true), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; pending.current?.abort(); };
  }, []);
  useEffect(() => {
    token.current ||= window.location.hash.slice(1);
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); if (active.current) { setLoading(false); setError("Bağlantı zamanında doğrulanamadı. Yeniden dene."); } }, 20000);
    void (async () => {
      try {
        if (!/^[A-Za-z0-9_-]{32,200}$/.test(token.current)) throw new Error("Etkinleştirme bağlantısı bulunamadı. E-postandaki bağlantıyı yeniden aç.");
        const response = await fetch("/api/auth/test-activation", { method: "POST", cache: "no-store", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inspect", token: token.current }) });
        const result = await response.json();
        if (!active.current || controller.signal.aborted) return;
        if (!response.ok || !result.valid || !result.loginEmail) throw new Error(result.error ?? "Bu bağlantı kullanılmış, süresi dolmuş veya artık geçerli değil.");
        setAccount({ loginEmail: result.loginEmail, expiresAt: result.expiresAt }); setError("");
      } catch (cause) { if (active.current && !controller.signal.aborted) { setAccount(null); setError(cause instanceof Error ? cause.message : "Bağlantı doğrulanamadı."); } }
      finally { clearTimeout(timer); if (active.current && !controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || !account) return;
    if (password.length < 10 || password.length > 128) { setError("10–128 karakterli bir parola oluştur."); event.currentTarget.querySelector<HTMLInputElement>('[name="password"]')?.focus(); return; }
    if (password !== confirmation) { setError("Parolalar birbiriyle aynı olmalı."); event.currentTarget.querySelector<HTMLInputElement>('[name="confirmation"]')?.focus(); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/auth/test-activation", { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "activate", token: token.current, password }) });
      const result = await response.json(); if (!active.current || controller.signal.aborted) return;
      if (!response.ok || !result.activated) throw new Error(result.error ?? "Hesabın etkinleştirilemedi.");
      token.current = ""; setPassword(""); setConfirmation(""); setShowPassword(false); setDone(true);
    } catch (cause) { if (active.current) setError(controller.signal.aborted ? "Yanıt alınamadı. Hesabın etkinleşmiş olabilir; belirlediğin parolayla giriş yapmayı deneyebilirsin." : cause instanceof Error ? cause.message : "Hesabın etkinleştirilemedi."); }
    finally { clearTimeout(timer); if (pending.current === controller) pending.current = null; if (active.current) setBusy(false); }
  }
  if (done) return <section className={styles.success} role="status"><span className={styles.eyebrow}>HESABIN HAZIR</span><h1>Teste hoş geldin.</h1><p>Parolan oluşturuldu ve test hesabın etkinleşti. Kampüsünü ve derslerini seçerek başlayabilirsin.</p><Link className={styles.primary} href="/">Kampira’ya devam et →</Link></section>;
  return <>
    <span className={styles.eyebrow}>TEST HESABINI ETKİNLEŞTİR</span><h1>Kendi parolanı oluştur.</h1>
    <p className={styles.intro}>Bu bağlantı yalnız sana aittir ve bir kez kullanılabilir. Hesabın hazır olduğunda web üzerinden giriş yapabilirsin. Android testine de katılacaksan Google Play kapalı test katılımını ayrıca tamamlayabilirsin.</p>
    {loading && <p role="status">Etkinleştirme bağlantın doğrulanıyor…</p>}
    {account && !loading && <form className={styles.form} onSubmit={event => void activate(event)} noValidate>
      <label>Test hesabının e-postası<input value={account.loginEmail} readOnly autoComplete="username"/></label>
      <p className={styles.hint}>Girişte bu adresi ve şimdi belirleyeceğin parolayı kullan. E-posta kutusu oluşturulmaz.</p>
      <label>Yeni parolan<input name="password" type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} minLength={10} maxLength={128} autoComplete="new-password" required/></label>
      <label>Parolanı tekrar yaz<input name="confirmation" type={showPassword ? "text" : "password"} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} minLength={10} maxLength={128} autoComplete="new-password" required/></label>
      <button type="button" className={styles.secondary} aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Parolayı gizle" : "Parolayı göster"}</button>
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Etkinleştiriliyor…" : "Parolamı oluştur ve hesabımı etkinleştir →"}</button>
    </form>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><Link href="/">Giriş ekranını aç</Link></div>}
    {!loading && !account && <button type="button" className={styles.secondary} onClick={() => { setLoading(true); setError(""); setRevision(value => value + 1); }}>Bağlantıyı yeniden kontrol et</button>}
    <p className={styles.hint}>Yeni bağlantı veya yardım için <Link href="/geri-bildirim">destek formunu</Link> kullanabilirsin. Başvurun yoksa <Link href="/beta/basvur">teste başvur</Link>.</p>
  </>;
}
