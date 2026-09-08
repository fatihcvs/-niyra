"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./test-accounts.module.css";

type TestAccount = { id: string; loginEmail: string; displayName: string; kind: "generated" | "applicant" | "existing-beta"; status: "pending" | "active" | "revoked"; createdAt: string; applicationId: string | null };
type Queue = { items: TestAccount[]; nextCursor: string | null; staffContext: string };
type Credentials = { loginEmail: string; password: string };
type Attempt = { action: "create" | "reset"; requestId: string; displayName?: string; id?: string; context: string };
const kinds = { generated: "Yönetim oluşturdu", applicant: "Başvurudan", "existing-beta": "Mevcut hesap" };
const statuses = { pending: "Etkinleştirme bekliyor", active: "Aktif", revoked: "Erişim kapalı" };
const timestamp = (value: string) => new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toLocaleString("tr-TR");

export function TestAccounts({ onAccessChanged }: { onAccessChanged: () => Promise<void> }) {
  const [queue, setQueue] = useState<Queue | null>(null), [cursor, setCursor] = useState(""), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [displayName, setDisplayName] = useState(""), [credentials, setCredentials] = useState<Credentials | null>(null), [showPassword, setShowPassword] = useState(false);
  const [resetTarget, setResetTarget] = useState<TestAccount | null>(null), [attempt, setAttempt] = useState<Attempt | null>(null);
  const active = useRef(true), context = useRef(""), mutation = useRef<AbortController | null>(null), attempted = useRef<Attempt | null>(null);
  function forgetCredentials() { setCredentials(null); setShowPassword(false); }
  function refresh() {
    forgetCredentials(); context.current = ""; setQueue(null); setLoading(true); setError(""); setResetTarget(null);
    mutation.current?.abort(); mutation.current = null; setBusy(false); setRevision(value => value + 1);
  }
  useEffect(() => {
    active.current = true;
    let lastRefresh = -Infinity;
    const revalidate = () => {
      if (document.visibilityState !== "visible") { forgetCredentials(); return; }
      const now = window.performance.now(); if (now - lastRefresh < 250) return; lastRefresh = now;
      forgetCredentials(); context.current = ""; setQueue(null); setLoading(true); setResetTarget(null);
      mutation.current?.abort(); mutation.current = null; setBusy(false); setRevision(value => value + 1);
    };
    window.addEventListener("focus", revalidate); document.addEventListener("visibilitychange", revalidate);
    return () => { active.current = false; mutation.current?.abort(); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); if (active.current) { context.current = ""; setQueue(null); setLoading(false); setError("Test hesapları zamanında yüklenemedi. Yeniden dene."); } }, 20000);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/test-accounts?${new URLSearchParams({ cursor })}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!active.current || controller.signal.aborted) return;
        if ([401, 403, 428].includes(response.status)) { setCredentials(null); setAttempt(null); attempted.current = null; void onAccessChanged(); throw new Error("Yönetim oturumun değişti. Yeniden giriş yap."); }
        if (!response.ok || !Array.isArray(result.items) || !result.staffContext) throw new Error(result.error ?? "Test hesapları yüklenemedi.");
        if (attempted.current && attempted.current.context !== result.staffContext) { attempted.current = null; setAttempt(null); }
        context.current = result.staffContext; setQueue(result); setError("");
      } catch (cause) {
        if (active.current && !controller.signal.aborted) { context.current = ""; setQueue(null); setError(cause instanceof Error ? cause.message : "Test hesapları yüklenemedi."); }
      } finally { clearTimeout(timer); if (active.current && !controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [cursor, revision, onAccessChanged]);

  async function perform(next: Attempt) {
    if (mutation.current || !context.current || next.context !== context.current) return;
    const controller = new AbortController(); mutation.current = controller; attempted.current = next; setAttempt(next); setBusy(true); forgetCredentials(); setError(""); setNotice("");
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { context: staffContext, ...body } = next;
      const response = await fetch("/api/admin/test-accounts", { method: "POST", cache: "no-store", signal: controller.signal, headers: { "content-type": "application/json", "X-Staff-Context": staffContext }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!active.current || controller.signal.aborted || mutation.current !== controller || context.current !== staffContext) return;
      if ([401, 403, 428].includes(response.status)) { attempted.current = null; setAttempt(null); context.current = ""; setQueue(null); void onAccessChanged(); throw new Error("Yönetim oturumun değişti. Yeniden giriş yap."); }
      if (!response.ok) {
        if (response.status < 500) { attempted.current = null; setAttempt(null); }
        throw new Error(result.error ?? "Hesap işlemi tamamlanamadı.");
      }
      attempted.current = null; setAttempt(null); setResetTarget(null); setDisplayName("");
      if (result.account) setQueue(current => current && ({ ...current, items: [result.account, ...current.items.filter(item => item.id !== result.account.id)] }));
      if (result.credentials?.loginEmail && result.credentials?.password && document.visibilityState === "visible") setCredentials({ loginEmail: result.credentials.loginEmail, password: result.credentials.password });
      setNotice(result.replayed ? "Önceki işlem bulundu. Parola yeniden gösterilmez; gerekirse listedeki hesap için açıkça yeni parola oluştur." : next.action === "reset" ? "Yeni parola oluşturuldu. Önceki parola ve oturumlar geçersizleşti." : "Test hesabı oluşturuldu. Giriş bilgilerini katılımcıya güvenli biçimde ilet.");
    } catch (cause) {
      if (active.current && mutation.current === controller) setError(controller.signal.aborted ? "Yanıt alınamadı. Yeni hesap oluşturmadan aynı işlemin sonucunu kontrol et." : cause instanceof Error ? cause.message : "İşlem sonucu doğrulanamadı.");
    } finally { clearTimeout(timer); if (mutation.current === controller) { mutation.current = null; if (active.current) setBusy(false); } }
  }
  function create(event: FormEvent) { event.preventDefault(); if (!attempt && context.current) void perform({ action: "create", requestId: window.crypto.randomUUID(), displayName: displayName.trim(), context: context.current }); }
  return <section className={styles.root} aria-labelledby="test-accounts-title">
    <header><span>TEST ERİŞİMİ</span><h2 id="test-accounts-title">Test hesapları</h2><p>Yeni bir test hesabı oluştur veya önceki hesapları takip et. Başvurudan gelen katılımcılar e-postadaki bağlantıyla kendi parolalarını oluşturur.</p></header>
    <form className={styles.create} onSubmit={create}>
      <label>Görünen ad (isteğe bağlı)<input value={displayName} maxLength={60} onChange={event => setDisplayName(event.target.value)} disabled={loading || busy || Boolean(attempt)}/></label>
      <button type="submit" disabled={loading || busy || !queue || Boolean(attempt)}>{busy && attempt?.action === "create" ? "Oluşturuluyor…" : "Test hesabı oluştur"}</button>
    </form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {credentials && <section className={styles.credentials} aria-label="Yeni test hesabı giriş bilgileri">
      <h3>Giriş bilgilerini güvenli biçimde paylaş</h3><p>Parola yalnız bu işlemden sonra gösterilir. Listeye veya bu tarayıcının kalıcı hafızasına kaydedilmez.</p>
      <label>Test hesabının e-postası<input readOnly value={credentials.loginEmail} onFocus={event => event.currentTarget.select()}/></label>
      <label>Test hesabının parolası<input readOnly type={showPassword ? "text" : "password"} value={credentials.password} onFocus={event => event.currentTarget.select()} autoComplete="off"/></label>
      <div className={styles.actions}><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Parolayı gizle" : "Parolayı göster"}</button><button type="button" onClick={forgetCredentials}>Bilgileri kapat</button></div>
    </section>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {attempt && !busy && queue && <div className={styles.notice}><p>Son işlemin sonucu kesinleşmeden yeni bir işlem başlatılmaz.</p><button type="button" onClick={() => void perform(attempt)}>Aynı işlemin sonucunu kontrol et</button></div>}
    <div className={styles.heading}><h3>Önceki hesaplar</h3><button type="button" onClick={refresh} disabled={loading || busy}>Yenile</button></div>
    {loading && <p role="status">Test hesapları yükleniyor…</p>}
    {!loading && !queue && <button type="button" onClick={refresh}>Yeniden dene</button>}
    {queue?.items.length === 0 && <p>Henüz test hesabı yok.</p>}
    <div className={styles.list}>{queue?.items.map(account => <article key={account.id}>
      <div className={styles.heading}><h4>{account.displayName || account.loginEmail}</h4><span className={styles.badge}>{statuses[account.status]}</span></div>
      <p className={styles.email}>{account.loginEmail}</p><p>{kinds[account.kind]} · {timestamp(account.createdAt)}</p>
      {account.applicationId && <small>Başvuru: {account.applicationId}</small>}
      {account.kind === "generated" && account.status !== "revoked" && <button type="button" disabled={busy || Boolean(attempt)} onClick={() => { forgetCredentials(); setResetTarget(account); }}>Yeni parola oluştur</button>}
      {account.kind === "existing-beta" && <small>Mevcut hesap ve giriş bilgileri korunuyor.</small>}
    </article>)}</div>
    {queue && <div className={styles.actions}>{cursor && <button type="button" disabled={busy} onClick={() => { refresh(); setCursor(""); }}>İlk sayfa</button>}{queue.nextCursor && <button type="button" disabled={busy} onClick={() => { const next = queue.nextCursor!; refresh(); setCursor(next); }}>Sonraki hesaplar</button>}</div>}
    {resetTarget && <section className={styles.confirm} aria-label="Test hesabı parolasını yenileme">
      <h3>Bu hesap için yeni parola oluşturulsun mu?</h3><p>{resetTarget.loginEmail}</p><p>Önceki parola ve tüm açık oturumlar geçersizleşir. Yeni parolayı katılımcıya tekrar iletmen gerekir.</p>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => { if (!attempt) void perform({ action: "reset", id: resetTarget.id, requestId: window.crypto.randomUUID(), context: context.current }); }}>Evet, yeni parola oluştur</button><button type="button" disabled={busy} onClick={() => setResetTarget(null)}>Vazgeç</button></div>
    </section>}
  </section>;
}
