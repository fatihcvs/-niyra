"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AccountDeletionRequest, AccountDeletionStatus } from "../../lib/account-deletion";
import styles from "./account-deletion.module.css";

type Account = { email: string; displayName: string };
const statusLabels: Record<AccountDeletionStatus, string> = { requested: "Talep alındı", in_review: "İncelemede", cancelled: "İptal edildi" };
const time = (value: string) => new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });

export function AccountDeletionPanel({ initialAccount }: { initialAccount: Account | null }) {
  return <AccountDeletionSession key={initialAccount?.email ?? "signed-out"} initialAccount={initialAccount}/>;
}

function AccountDeletionSession({ initialAccount }: { initialAccount: Account | null }) {
  const [account, setAccount] = useState(initialAccount);
  const [requests, setRequests] = useState<AccountDeletionRequest[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useRef<AbortController | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => {
    if (!account?.email) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const version = ++requestVersion.current;
    fetch("/api/account-deletion", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!mounted.current || version !== requestVersion.current) return;
      if (response.status === 401 || response.status === 403) { setAccount(null); setRequests(null); setConfirmCancel(null); formRef.current?.reset(); throw new Error("Oturumun kapandı. Silme başladıysa bu hesaba yeniden giriş yapılamaz."); }
      const data = await response.json() as { account?: Account; requests?: AccountDeletionRequest[]; error?: string };
      if (!mounted.current || version !== requestVersion.current) return;
      if (controller.signal.aborted) throw new Error("Durum zamanında yüklenemedi.");
      if (!response.ok || !data.account || !data.requests) throw new Error(data.error ?? "Taleplerin getirilemedi.");
      if (data.account.email !== account.email) { setConfirmCancel(null); formRef.current?.reset(); }
      setAccount(data.account);
      setRequests(data.requests);
    }).catch((cause: unknown) => {
      if (mounted.current && version === requestVersion.current) setError(controller.signal.aborted ? "Durum zamanında yüklenemedi. Yeniden deneyebilirsin." : cause instanceof Error ? cause.message : "Taleplerin getirilemedi.");
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [account?.email, revision]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const controller = new AbortController(); mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/auth/session", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), password: values.get("password") }) });
      const data = await response.json() as { user?: Account; error?: string };
      if (!mounted.current || version !== requestVersion.current) return;
      if (controller.signal.aborted) throw new Error("Giriş zamanında tamamlanmadı.");
      if (!response.ok || !data.user?.email) throw new Error(data.error ?? "Giriş tamamlanamadı.");
      form.reset(); setRequests(null); setAccount(data.user);
    } catch (cause) { if (mounted.current && version === requestVersion.current) setError(controller.signal.aborted ? "Giriş zamanında tamamlanmadı. Yeniden deneyebilirsin." : cause instanceof Error ? cause.message : "Giriş tamamlanamadı."); }
    finally { clearTimeout(timeout); if (mutation.current === controller) mutation.current = null; busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !account || requests === null) return;
    const values = new FormData(event.currentTarget);
    await mutate("POST", { confirm: values.get("confirm") === "on", note: values.get("note") }, "Talebin kayda alındı. Durumunu bu sayfadan takip edebilirsin.");
  }

  async function mutate(method: "POST" | "PATCH", body: unknown, successMessage: string) {
    if (busyRef.current || !account || requests === null) return;
    const version = ++requestVersion.current;
    const controller = new AbortController(); mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account-deletion", { method, signal: controller.signal, headers: { "content-type": "application/json", "X-Account-Context": account.email }, body: JSON.stringify(body) });
      if (!mounted.current || version !== requestVersion.current) return;
      if (response.status === 401 || response.status === 403) { setAccount(null); setRequests(null); setConfirmCancel(null); formRef.current?.reset(); setError("Oturumun kapandı. Silme başladıysa bu hesaba yeniden giriş yapılamaz."); return; }
      const data = await response.json() as { request?: AccountDeletionRequest; error?: string; code?: string };
      if (!mounted.current || version !== requestVersion.current) return;
      if (controller.signal.aborted) throw new Error("İşlem yanıtı zamanında alınamadı.");
      if (data.code === "ACCOUNT_CHANGED") { setRequests(null); setConfirmCancel(null); setRevision((value) => value + 1); }
      if (!response.ok || !data.request) throw new Error(data.error ?? "Talep işlemi tamamlanamadı. Durumunu yenileyip kontrol edebilirsin.");
      const next = data.request;
      setRequests((current) => [next, ...(current ?? []).filter((request) => request.id !== next.id)]);
      setConfirmCancel(null); setMessage(successMessage); formRef.current?.reset();
    } catch (cause) { if (mounted.current && version === requestVersion.current) { setRequests(null); setConfirmCancel(null); setError(cause instanceof Error && !controller.signal.aborted ? cause.message : "İşlem yanıtı alınamadı."); setMessage("Son durum kontrol ediliyor; talebin tekrar gönderilmiyor."); setRevision((value) => value + 1); } }
    finally { clearTimeout(timeout); if (mutation.current === controller) mutation.current = null; busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  const openRequest = requests?.find((request) => request.status !== "cancelled");
  return <section className={styles.panel} id="request-status" aria-labelledby="request-status-title">
    <div className={styles.panelHeading}><h2 id="request-status-title">Talebini takip et</h2>{account && <button type="button" disabled={busy} onClick={() => { setError(""); setRevision((value) => value + 1); }}>Durumu yenile</button>}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {!account ? <form className={styles.form} onSubmit={(event) => void signIn(event)}>
      <p>Yalnızca kendi hesabın için talep oluşturabilirsin. Mevcut Kampira hesabınla bu sayfada giriş yap.</p>
      <label>E-posta<input type="email" name="email" autoComplete="username" maxLength={254} required disabled={busy}/></label>
      <label>Parola<input type="password" name="password" autoComplete="current-password" maxLength={128} required disabled={busy}/></label>
      <button className={styles.primary} disabled={busy} type="submit">{busy ? "Giriş yapılıyor…" : "Giriş yap ve devam et"}</button>
    </form> : <>
      <p className={styles.account}>{account.displayName}<span>{account.email}</span></p>
      {requests === null ? <p role="status">{error ? "Talep bilgisi yüklenemedi. Durumu yenileyebilirsin." : "Taleplerin yükleniyor…"}</p> : <>
        {!openRequest && <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)}>
          <h3>Silme talebi oluştur</h3>
          <label>Açıklama <span>(isteğe bağlı)</span><textarea name="note" rows={3} maxLength={800} placeholder="Parola, kimlik belgesi veya ödeme bilgisi ekleme." disabled={busy}/></label>
          <label className={styles.confirm}><input name="confirm" type="checkbox" required disabled={busy}/><span>Hesabımın ve ilişkili verilerimin silinmesini talep ediyorum. Silme başlayana kadar talebimi iptal edebileceğimi; başladıktan sonra hesabıma erişemeyeceğimi ve işlemin geri alınamayacağını anladım.</span></label>
          <button className={styles.primary} disabled={busy} type="submit">{busy ? "Talep kaydediliyor…" : "Hesap ve veri silme talebi gönder"}</button>
        </form>}
        {requests.length ? <div className={styles.requests}><h3>Talep geçmişin</h3>{requests.map((request) => <article key={request.id} className={styles.request}>
          <div className={styles.requestHeading}><strong>{request.erasureJob ? "Silme işlemi başladı" : statusLabels[request.status]}</strong><time dateTime={request.createdAt}>{time(request.createdAt)}</time></div>
          <p className={styles.reference}>Talep: {request.id}</p>
          {request.note && <p>{request.note}</p>}
          <ol className={styles.history}>{request.history.map((event) => <li key={event.status}><span>{statusLabels[event.status]}</span><time dateTime={event.createdAt}>{time(event.createdAt)}</time></li>)}</ol>
          {!request.erasureJob && request.status !== "cancelled" && (confirmCancel === request.id ? <div className={styles.cancelConfirmation}>
            <p>Silme talebini iptal etmek istiyor musun? Hesabın ve verilerin değişmeyecek.</p>
            <div><button type="button" disabled={busy} onClick={() => setConfirmCancel(null)}>Vazgeç</button><button type="button" className={styles.danger} disabled={busy} onClick={() => void mutate("PATCH", { action: "cancel", id: request.id }, "Silme talebin iptal edildi.")}>{busy ? "İptal ediliyor…" : "Evet, talebi iptal et"}</button></div>
          </div> : <button type="button" disabled={busy} onClick={() => setConfirmCancel(request.id)}>Talebi iptal et</button>)}
        </article>)}<p className={styles.footnote}>Son 20 talebin gösterilir. Talep almak veya incelemek, hesabın silindiği anlamına gelmez.</p></div> : <p className={styles.footnote}>Henüz bir silme talebin yok.</p>}
      </>}
    </>}
  </section>;
}
