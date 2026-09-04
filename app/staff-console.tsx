"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PRODUCT_UPDATES } from "../lib/product-updates";
import styles from "./staff-console.module.css";

type Mode = "owner" | "admin";
type Staff = { id: string; username: string; displayName: string; role: Mode; mustChangePassword: boolean };
type JsonRecord = Record<string, unknown>;

const number = new Intl.NumberFormat("tr-TR");
const dateTime = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });
const updateDateTime = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" });

const ownerTabs = [
  ["overview", "Genel bakış", "⌂"],
  ["admins", "Admin yönetimi", "♙"],
  ["settings", "Sistem ayarları", "⚙"],
  ["audit", "İşlem günlüğü", "≡"],
] as const;

const adminTabs = [
  ["overview", "Moderasyon özeti", "⌂"],
  ["reports", "Şikâyet kuyruğu", "!"],
  ["content", "İçerik denetimi", "▦"],
  ["users", "Kullanıcılar", "♙"],
  ["decisions", "Karar geçmişi", "≡"],
  ["updates", "Güncellemeler", "✦"],
] as const;

const ownerMetricLabels: Record<string, [string, string]> = {
  users_total: ["Toplam öğrenci", "Kayıtlı hesap"],
  users_active: ["Aktif öğrenci", "Erişimi açık"],
  users_week: ["Yeni kayıt", "Son 7 gün"],
  profiles_complete: ["Tam profil", "Akademik profil"],
  student_sessions: ["Canlı oturum", "Öğrenci"],
  posts_active: ["Gönderi", "Yayında"],
  notes_published: ["Çalışma notu", "Yayınlanmış"],
  communities_active: ["Topluluk", "Aktif"],
  direct_conversations: ["Özel konuşma", "Toplam"],
  direct_messages_sent: ["Özel mesaj", "Gönderilmiş"],
  reports_pending: ["Bekleyen şikâyet", "Açık + itiraz"],
  admins_active: ["Aktif admin", "Yetkili hesap"],
};

const adminMetricLabels: Record<string, [string, string]> = {
  reports_open: ["Açık şikâyet", "İlk inceleme"],
  reports_appealed: ["İtiraz", "Öncelikli"],
  reports_resolved_week: ["Çözülen", "Son 7 gün"],
  users_suspended: ["Askıdaki hesap", "Erişim kapalı"],
  notes_attention: ["Not incelemesi", "İşlem bekliyor"],
  note_comments_hidden: ["Gizli not yorumu", "Moderasyon"],
  places_hidden: ["Gizli mekân", "Moderasyon"],
  housing_hidden: ["Gizli yurt deneyimi", "Moderasyon"],
  listings_hidden: ["Gizli ilan", "Moderasyon"],
  pulse_hidden: ["Gizli anlık", "Moderasyon"],
  direct_messages_hidden: ["Gizli özel mesaj", "Yalnızca şikâyet edilen"],
};

export default function StaffConsole({ mode }: { mode: Mode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<JsonRecord | null>(null);
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDashboard = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/${mode}`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json() as JsonRecord;
      if (response.status === 401) {
        setStaff(null);
        setData(null);
        return;
      }
      if (response.status === 428) {
        setStaff((current) => current ? { ...current, mustChangePassword: true } : current);
        return;
      }
      if (!response.ok) throw new Error(String(payload.error ?? "Panel yüklenemedi."));
      setData(payload);
      if (payload.staff) setStaff(payload.staff as Staff);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Panel yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [mode]);

  const acceptStaff = useCallback((nextStaff: Staff) => {
    setStaff(nextStaff);
    if (!nextStaff.mustChangePassword) void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => ({ response, payload: await response.json() as JsonRecord }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (response.ok) acceptStaff(payload.staff as Staff);
      })
      .catch(() => { if (!cancelled) setMessage("Yönetim oturumu doğrulanamadı; yeniden giriş yapabilirsin."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [acceptStaff]);

  if (loading) return <ConsoleLoading />;
  if (!staff) return <StaffLogin mode={mode} onLogin={acceptStaff} />;
  if (staff.mustChangePassword) return <PasswordChange staff={staff} onChanged={acceptStaff} />;
  if (mode === "owner" && staff.role !== "owner") return <AccessDenied staff={staff} />;

  const tabs = mode === "owner" ? ownerTabs : adminTabs;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/" aria-label="Kampira ana sayfa">
          <Image className={styles.brandMark} src="/kampira-mark.png" width={42} height={42} alt=""/><strong>Kampira</strong>
        </Link>
        <div className={styles.panelIdentity}>
          <span>{mode === "owner" ? "OWNER CONTROL" : "ADMIN DESK"}</span>
          <strong>{mode === "owner" ? "Platform merkezi" : "Güvenlik merkezi"}</strong>
          <small>{mode === "owner" ? "Tüm sistem ve ekip yönetimi" : "Moderasyon ve topluluk sağlığı"}</small>
        </div>
        <nav aria-label="Yönetim menüsü">
          {tabs.map(([key, label, icon]) => (
            <button key={key} type="button" className={tab === key ? styles.activeNav : ""} onClick={() => setTab(key)}>
              <i>{icon}</i><span>{label}</span>
              {key === "reports" && Number((data?.metrics as JsonRecord | undefined)?.reports_open ?? 0) > 0
                ? <b>{String((data?.metrics as JsonRecord).reports_open)}</b> : null}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <span className={styles.avatar}>{staff.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR")}</span>
          <div><strong>{staff.displayName}</strong><small>@{staff.username} · {staff.role}</small></div>
          <button type="button" title="Çıkış yap" aria-label="Yönetim oturumundan çık" onClick={() => void signOut(setStaff)}>↗</button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div><span>{mode === "owner" ? "PLATFORM OPERASYONLARI" : "GÜVEN & MODERASYON"}</span><h1>{tabs.find(([key]) => key === tab)?.[1]}</h1></div>
          <div className={styles.topActions}>
            <span className={styles.live}><i /> Canlı sistem</span>
            <button type="button" disabled={busy} onClick={() => void loadDashboard()}>{busy ? "Yenileniyor…" : "↻ Yenile"}</button>
            {mode === "owner" ? <Link href="/admin">Admin görünümü →</Link> : staff.role === "owner" ? <Link href="/owner">Owner paneli →</Link> : null}
          </div>
        </header>
        {message ? <div className={styles.toast} role="status"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div> : null}
        {!data ? <ConsoleLoading inline /> : mode === "owner"
          ? <OwnerContent tab={tab} data={data} reload={loadDashboard} setMessage={setMessage} />
          : <AdminContent tab={tab} data={data} reload={loadDashboard} setMessage={setMessage} />}
      </main>
    </div>
  );
}

function StaffLogin({ mode, onLogin }: { mode: Mode; onLogin: (staff: Staff) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const payload = await response.json() as JsonRecord;
      if (!response.ok) throw new Error(String(payload.error ?? "Giriş tamamlanamadı."));
      onLogin(payload.staff as Staff);
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Giriş tamamlanamadı."); }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.authPage}>
      <section className={styles.authStory}>
        <Link className={styles.brand} href="/" aria-label="Kampira ana sayfa"><Image className={styles.brandMark} src="/kampira-mark.png" width={42} height={42} alt=""/><strong>Kampira</strong></Link>
        <div><span>{mode === "owner" ? "OWNER CONTROL" : "ADMIN DESK"}</span><h1>{mode === "owner" ? "Kampira’nın tamamı tek merkezde." : "Kampüs topluluğunu güvenle yönet."}</h1><p>{mode === "owner" ? "Ekip erişimleri, büyüme, içerik sağlığı, özellik anahtarları ve tüm operasyon geçmişi." : "Şikâyetleri incele, içerikleri yönet ve öğrenciler için güvenli bir kampüs alanı oluştur."}</p></div>
        <footer><span>◉ Güvenli staff oturumu</span><span>◷ 8 saatlik erişim</span><span>⌁ İşlem günlüğü</span></footer>
      </section>
      <section className={styles.authCard}>
        <div className={styles.authIcon}>{mode === "owner" ? "O" : "A"}</div>
        <span>YÖNETİM GİRİŞİ</span><h2>{mode === "owner" ? "Owner paneline giriş" : "Admin paneline giriş"}</h2><p>Öğrenci hesabından ayrı yönetim bilgilerini kullan.</p>
        <form onSubmit={submit}>
          <label>Kullanıcı adı<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="kullanıcı adın" required /></label>
          <label>Parola<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="••••••••••••" required /></label>
          {error ? <div className={styles.formError}>{error}</div> : null}
          <button type="submit" disabled={busy}>{busy ? "Doğrulanıyor…" : "Güvenli giriş yap →"}</button>
        </form>
        <small>İlk owner girişi: <code>admin</code> / <code>admin123</code>. İlk girişten sonra güçlü parola zorunludur.</small>
      </section>
    </div>
  );
}

function PasswordChange({ staff, onChanged }: { staff: Staff; onChanged: (staff: Staff) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirm) return setError("Yeni parolalar eşleşmiyor.");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json() as JsonRecord;
      if (!response.ok) throw new Error(String(payload.error ?? "Parola değiştirilemedi."));
      onChanged(payload.staff as Staff);
    } catch (changeError) { setError(changeError instanceof Error ? changeError.message : "Parola değiştirilemedi."); }
    finally { setBusy(false); }
  }
  return (
    <div className={styles.passwordPage}>
      <section className={styles.passwordCard}>
        <span className={styles.securityIcon}>✓</span><small>İLK GİRİŞ GÜVENLİĞİ</small><h1>Başlangıç parolanı değiştir</h1><p>Merhaba {staff.displayName}. Panele erişmeden önce yalnızca sana ait güçlü bir parola belirle.</p>
        <form onSubmit={submit}>
          <label>Mevcut parola<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label>Yeni parola<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label>Yeni parolayı doğrula<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
          <div className={styles.passwordRules}><span>En az 12 karakter</span><span>Büyük/küçük harf</span><span>Rakam ve özel karakter</span></div>
          {error ? <div className={styles.formError}>{error}</div> : null}<button disabled={busy}>{busy ? "Kaydediliyor…" : "Parolayı değiştir ve devam et →"}</button>
        </form>
      </section>
    </div>
  );
}

function OwnerContent({ tab, data, reload, setMessage }: ContentProps) {
  if (tab === "admins") return <OwnerAdmins data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "settings") return <OwnerSettings data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "audit") return <AuditTable rows={(data.audit as JsonRecord[] | undefined) ?? []} />;
  const metrics = (data.metrics as JsonRecord | undefined) ?? {};
  const activity = (data.activity as JsonRecord[] | undefined) ?? [];
  const features = (data.features as JsonRecord[] | undefined) ?? [];
  const campuses = (data.campuses as JsonRecord[] | undefined) ?? [];
  const system = (data.system as JsonRecord | undefined) ?? {};
  const maxActivity = Math.max(1, ...activity.map((row) => Number(row.content ?? 0) + Number(row.accounts ?? 0) + Number(row.reports ?? 0)));
  return <div className={styles.contentStack}>
    <section className={styles.welcome}><div><span>OWNER SNAPSHOT</span><h2>Platformun nabzı burada.</h2><p>Öğrenci büyümesi, içerik üretimi, moderasyon yükü ve operasyon ekibi tek canlı görünümde.</p></div><div className={styles.healthPanel}><span><i /> Veritabanı</span><strong>{String(system.database ?? "-")}</strong><span><i /> Dosya depolama</span><strong>{String(system.storage ?? "-")}</strong><span><i /> Ders kataloğu</span><strong>{number.format(Number(system.courseCatalogPrograms ?? 0))} program</strong><span><i /> Doğrulanmış ders</span><strong>{number.format(Number(system.courseCatalogCourses ?? 0))}</strong><small>Kampira v{String(system.version ?? "-")} · katalog {String(system.courseCatalogUpdatedAt ?? "-")}</small></div></section>
    <MetricGrid labels={ownerMetricLabels} metrics={metrics} />
    <div className={styles.twoColumn}>
      <section className={styles.card}><CardTitle eyebrow="7 GÜNLÜK AKIŞ" title="Büyüme ve içerik hareketi" detail="Hesap, içerik ve şikâyet toplamı" />
        <div className={styles.activityChart}>{activity.length ? activity.map((row) => { const total = Number(row.content ?? 0) + Number(row.accounts ?? 0) + Number(row.reports ?? 0); return <div key={String(row.day)}><span style={{ height: `${Math.max(8, (total / maxActivity) * 100)}%` }}><i style={{ height: `${Math.min(100, Number(row.accounts ?? 0) / Math.max(1, total) * 100)}%` }} /></span><small>{String(row.day).slice(5)}</small></div>; }) : <Empty text="Henüz haftalık hareket yok." />}</div>
      </section>
      <section className={styles.card}><CardTitle eyebrow="KAMPÜS DAĞILIMI" title="En aktif üniversiteler" detail="Tamamlanan öğrenci profilleri" /><div className={styles.rankList}>{campuses.slice(0, 7).map((campus, index) => <div key={String(campus.id)}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{String(campus.short_name)}</strong><small>{String(campus.name)}</small></span><em>{number.format(Number(campus.student_count ?? 0))}</em></div>)}</div></section>
    </div>
    <section className={styles.card}><CardTitle eyebrow="MODÜL ENVANTERİ" title="Tüm Kampira özellikleri" detail="Yeni ürün alanları bu kayıt defterinden panele eklenir" /><div className={styles.featureGrid}>{features.map((feature) => <article key={String(feature.key)}><span>{feature.moderation ? "MODERASYONLU" : "OPERASYON"}</span><strong>{String(feature.label)}</strong><b>{number.format(Number(feature.count ?? 0))}</b></article>)}</div></section>
  </div>;
}

function OwnerAdmins({ data, reload, setMessage }: ContentProps) {
  const admins = (data.admins as JsonRecord[] | undefined) ?? [];
  const [form, setForm] = useState({ displayName: "", username: "", password: "" });
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); try { await apiAction("/api/owner", { action: "create-admin", ...form }); setForm({ displayName: "", username: "", password: "" }); setMessage("Admin oluşturuldu; ilk girişte parola değişimi istenecek."); await reload(); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); } }
  async function status(id: string, next: string) { try { await apiAction("/api/owner", { action: "set-admin-status", id, status: next }); setMessage(next === "active" ? "Admin yeniden etkinleştirildi." : "Admin devre dışı bırakıldı ve oturumları kapatıldı."); await reload(); } catch (error) { setMessage(errorMessage(error)); } }
  async function reset(id: string) { try { await apiAction("/api/owner", { action: "reset-admin-password", id, password: resetPasswords[id] ?? "" }); setResetPasswords((current) => ({ ...current, [id]: "" })); setMessage("Geçici parola kaydedildi; adminin oturumları kapatıldı."); await reload(); } catch (error) { setMessage(errorMessage(error)); } }
  return <div className={styles.contentStack}><section className={styles.welcome}><div><span>ERİŞİM YÖNETİMİ</span><h2>Admin ekibini güvenle büyüt.</h2><p>Her admin ayrı kullanıcı adıyla giriş yapar, geçici parolasını ilk girişte değiştirir ve tüm işlemleri kayda alınır.</p></div><div className={styles.bigNumber}><strong>{admins.filter((item) => item.status === "active").length}</strong><span>aktif admin</span></div></section>
    <div className={styles.adminLayout}><section className={styles.card}><CardTitle eyebrow="YENİ YETKİ" title="Admin hesabı oluştur" detail="Geçici parolayı güvenli bir kanaldan paylaş" /><form className={styles.stackForm} onSubmit={create}><label>Ad soyad<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Örn. Ayşe Moderatör" required /></label><label>Kullanıcı adı<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ayse.mod" required /></label><label>Geçici güçlü parola<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="En az 12 karakter" required /></label><button disabled={busy}>{busy ? "Oluşturuluyor…" : "+ Admin oluştur"}</button></form></section>
      <section className={styles.card}><CardTitle eyebrow="EKİP" title="Admin hesapları" detail={`${admins.length} kayıt`} /><div className={styles.adminList}>{admins.length ? admins.map((admin) => <article key={String(admin.id)}><header><span className={styles.avatar}>{initials(String(admin.display_name))}</span><div><strong>{String(admin.display_name)}</strong><small>@{String(admin.username)} · {admin.must_change_password ? "parola değişimi bekliyor" : "güvenli parola"}</small></div><b className={admin.status === "active" ? styles.goodBadge : styles.badBadge}>{String(admin.status)}</b></header><footer><input type="password" value={resetPasswords[String(admin.id)] ?? ""} onChange={(e) => setResetPasswords((current) => ({ ...current, [String(admin.id)]: e.target.value }))} placeholder="Yeni geçici parola" /><button onClick={() => void reset(String(admin.id))}>Parolayı sıfırla</button><button className={admin.status === "active" ? styles.dangerButton : styles.successButton} onClick={() => void status(String(admin.id), admin.status === "active" ? "disabled" : "active")}>{admin.status === "active" ? "Devre dışı bırak" : "Etkinleştir"}</button></footer></article>) : <Empty text="Henüz admin oluşturulmadı." />}</div></section>
    </div></div>;
}

function OwnerSettings({ data, reload, setMessage }: ContentProps) {
  const original = data.settings as Record<string, boolean | string>;
  const [settings, setSettings] = useState(original);
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { const result = await apiAction("/api/owner", { action: "save-settings", settings }); setSettings(result.settings as Record<string, boolean | string>); setMessage("Platform ayarları kaydedildi ve ilgili API’lere uygulandı."); await reload(); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); } }
  const toggles = [
    ["registrationOpen", "Yeni öğrenci kaydı", "Kapalı olduğunda yeni hesap oluşturulamaz."],
    ["noteUploadsOpen", "Çalışma notu yükleme", "Dosya yükleme API’sini anında açar veya kapatır."],
    ["communityCreationOpen", "Yeni topluluk kurma", "Mevcut toplulukları etkilemeden yeni kurulumları durdurur."],
    ["housingContributionsOpen", "Yurt ve konaklama katkıları", "Yeni konaklama kaydı ve öğrenci deneyimi paylaşımını yönetir."],
    ["maintenanceMode", "Bakım duyurusu", "Tüm sayfalarda owner mesajını gösterir."],
  ];
  return <div className={styles.contentStack}><section className={styles.welcome}><div><span>PLATFORM ANAHTARLARI</span><h2>Ürünü kod dağıtmadan yönet.</h2><p>Kritik kullanıcı işlemlerini durdurabilir, bakım mesajını yayınlayabilir ve değişiklikleri işlem günlüğünde izleyebilirsin.</p></div><button className={styles.primaryAction} disabled={busy} onClick={() => void save()}>{busy ? "Kaydediliyor…" : "Değişiklikleri yayınla →"}</button></section><section className={styles.settingsGrid}>{toggles.map(([key, label, detail]) => <article key={key}><div><strong>{label}</strong><p>{detail}</p></div><button type="button" role="switch" aria-checked={Boolean(settings[key])} className={settings[key] ? styles.switchOn : styles.switchOff} onClick={() => setSettings({ ...settings, [key]: !settings[key] })}><i /></button></article>)}</section><section className={styles.card}><CardTitle eyebrow="DUYURU METNİ" title="Bakım mesajı" detail="Bakım anahtarı açıkken öğrencilere gösterilir" /><textarea className={styles.largeTextarea} value={String(settings.maintenanceMessage ?? "")} onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })} maxLength={240} /><footer className={styles.fieldFoot}><span>{String(settings.maintenanceMessage ?? "").length}/240 karakter</span><button onClick={() => void save()}>Mesajı kaydet</button></footer></section></div>;
}

function AdminContent({ tab, data, reload, setMessage }: ContentProps) {
  if (tab === "reports") return <ReportQueue data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "content") return <ContentModeration data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "users") return <UserModeration data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "decisions") return <AuditTable rows={(data.decisions as JsonRecord[] | undefined) ?? []} />;
  if (tab === "updates") return <AdminUpdates />;
  const metrics = (data.metrics as JsonRecord | undefined) ?? {};
  const reports = (data.reports as JsonRecord[] | undefined) ?? [];
  const content = (data.content as JsonRecord[] | undefined) ?? [];
  return <div className={styles.contentStack}><section className={styles.welcome}><div><span>MODERASYON DURUMU</span><h2>Önce en kritik sinyaller.</h2><p>İtirazlar, açık şikâyetler, bekleyen notlar ve gizlenen içerikler öncelik sırasıyla izleniyor.</p></div><div className={styles.bigNumber}><strong>{number.format(Number(metrics.reports_open ?? 0) + Number(metrics.reports_appealed ?? 0))}</strong><span>işlem bekliyor</span></div></section><MetricGrid labels={adminMetricLabels} metrics={metrics} /><div className={styles.twoColumn}><section className={styles.card}><CardTitle eyebrow="ÖNCELİKLİ KUYRUK" title="Son açık şikâyetler" detail="İtirazlar ilk sırada" /><div className={styles.compactList}>{reports.filter((item) => item.status !== "resolved").slice(0, 6).map((item) => <article key={String(item.id)}><b className={item.status === "appealed" ? styles.badBadge : styles.warnBadge}>{String(item.status)}</b><span><strong>{entityLabel(String(item.entity_type))} · {String(item.reason)}</strong><small>{String(item.reporter_name)} · {formatDate(item.created_at)}</small></span></article>)}</div></section><section className={styles.card}><CardTitle eyebrow="YENİ İÇERİK" title="Son platform hareketleri" detail="Tüm moderasyonlu modüller" /><div className={styles.compactList}>{content.slice(0, 7).map((item) => <article key={`${item.entity_type}-${item.id}`}><b className={item.status === "active" || item.status === "published" ? styles.goodBadge : styles.warnBadge}>{entityLabel(String(item.entity_type))}</b><span><strong>{String(item.title)}</strong><small>{String(item.owner_name)} · {formatDate(item.created_at)}</small></span></article>)}</div></section></div></div>;
}

function AdminUpdates() {
  const latest = PRODUCT_UPDATES[0];
  return <div className={styles.contentStack}>
    <section className={styles.updatesHero} aria-labelledby="updates-title">
      <div>
        <span>ÜRÜNDE NELER DEĞİŞTİ?</span>
        <h2 id="updates-title">Her yenilik, tek bakışta.</h2>
        <p>Yeni özellikleri, iyileştirmeleri ve düzeltmeleri teknik ayrıntılara girmeden buradan takip edebilirsin.</p>
      </div>
      <div className={styles.updateSummary}>
        <strong>{number.format(PRODUCT_UPDATES.length)}</strong>
        <span>yayın notu</span>
        <small>Son güncelleme<br />{latest ? formatUpdateDate(latest.releasedAt) : "-"}</small>
      </div>
    </section>
    <section className={styles.updatesIntro} aria-label="Güncelleme notları hakkında">
      <span aria-hidden="true">i</span>
      <p><strong>Sade ve kullanıcı odaklı:</strong> Bu alanda değişikliğin nasıl yapıldığı değil, öğrenciler ve yönetim ekibi için neyin değiştiği anlatılır.</p>
    </section>
    <section className={styles.updatesGrid} aria-label="Güncelleme notları">
      {PRODUCT_UPDATES.map((update, index) => <article className={styles.updateCard} key={update.id}>
        <header>
          <span className={styles.updateSequence}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.updateMeta}>
            <b data-category={update.category}>{update.category}</b>
            <span>{update.area}</span>
          </div>
          <time dateTime={update.releasedAt}>{formatUpdateDate(update.releasedAt)}</time>
        </header>
        <h3>{update.title}</h3>
        <p>{update.summary}</p>
        <ul>{update.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
      </article>)}
    </section>
  </div>;
}

function ReportQueue({ data, reload, setMessage }: ContentProps) {
  const reports = ((data.reports as JsonRecord[] | undefined) ?? []).filter((item) => item.status !== "resolved");
  const [drafts, setDrafts] = useState<Record<string, { decision: string; moderationState: string }>>({});
  async function decide(id: string) { const draft = drafts[id] ?? { decision: "", moderationState: "none" }; try { await apiAction("/api/admin", { action: "decide-report", id, ...draft }); setMessage("Şikâyet karara bağlandı ve seçilen içerik işlemi uygulandı."); await reload(); } catch (error) { setMessage(errorMessage(error)); } }
  return <div className={styles.contentStack}><section className={styles.queueHeader}><div><span>AKTİF KUYRUK</span><h2>{reports.length} inceleme bekliyor</h2><p>Kanıt anlık görüntüsü, şikâyet ayrıntısı ve varsa itiraz metni birlikte gösterilir.</p></div><div><b>{reports.filter((item) => item.status === "appealed").length}</b><small>itiraz</small></div></section><div className={styles.reportList}>{reports.length ? reports.map((report) => { const draft = drafts[String(report.id)] ?? { decision: "", moderationState: "none" }; const evidence = (report.evidence as JsonRecord | undefined) ?? {}; return <article key={String(report.id)}><header><div><b className={report.status === "appealed" ? styles.badBadge : styles.warnBadge}>{String(report.status)}</b><span>{entityLabel(String(report.entity_type))}</span></div><small>{formatDate(report.created_at)}</small></header><h3>{String(report.reason)} · {String(report.reporter_name)}</h3><p>{String(report.details || "Ek açıklama verilmedi.")}</p>{report.appeal_text ? <blockquote><strong>İtiraz:</strong> {String(report.appeal_text)}</blockquote> : null}<div className={styles.evidence}><span>KANIT ÖZETİ</span><p>{evidenceSummary(evidence)}</p><small>Varlık: {String(report.entity_id)}</small></div><footer><textarea value={draft.decision} onChange={(e) => setDrafts((current) => ({ ...current, [String(report.id)]: { ...draft, decision: e.target.value } }))} placeholder="Karar gerekçesini açıkça yaz…" /><select value={draft.moderationState} onChange={(e) => setDrafts((current) => ({ ...current, [String(report.id)]: { ...draft, moderationState: e.target.value } }))}><option value="none">Yalnızca kararı kaydet</option><option value="hide">İçeriği gizle / hesabı askıya al</option><option value="restore">İçeriği geri getir / hesabı aç</option></select><button onClick={() => void decide(String(report.id))}>Kararı uygula →</button></footer></article>; }) : <Empty text="Açık şikâyet veya itiraz yok." />}</div></div>;
}

function ContentModeration({ data, reload, setMessage }: ContentProps) {
  const content = useMemo(() => (data.content as JsonRecord[] | undefined) ?? [], [data.content]);
  const [query, setQuery] = useState(""); const [reason, setReason] = useState("");
  const filtered = useMemo(() => content.filter((item) => `${item.title} ${item.owner_name} ${item.entity_type}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [content, query]);
  async function moderate(item: JsonRecord) { const hidden = !["active", "published"].includes(String(item.status)); try { await apiAction("/api/admin", { action: "moderate-content", entityType: item.entity_type, id: item.id, state: hidden ? "restore" : "hide", reason }); setMessage(hidden ? "İçerik yeniden yayına alındı." : "İçerik gizlendi."); await reload(); } catch (error) { setMessage(errorMessage(error)); } }
  return <div className={styles.contentStack}><section className={styles.toolbar}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İçerik, kullanıcı veya tür ara…" /><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="İşlem gerekçesi (zorunlu)" /></section><section className={styles.card}><CardTitle eyebrow="BİRLEŞİK İÇERİK" title="Son 100 içerik" detail="Gönderi, yorum, not, topluluk, Kampüs Anlık ve ilan" /><div className={styles.dataTable}><header><span>Tür</span><span>İçerik</span><span>Sahip</span><span>Durum</span><span>İşlem</span></header>{filtered.map((item) => { const active = ["active", "published"].includes(String(item.status)); return <div key={`${item.entity_type}-${item.id}`}><span><b>{entityLabel(String(item.entity_type))}</b></span><span><strong>{String(item.title)}</strong><small>{formatDate(item.created_at)}</small></span><span>{String(item.owner_name)}</span><span><i className={active ? styles.goodDot : styles.badDot} />{String(item.status)}</span><span><button className={active ? styles.dangerButton : styles.successButton} onClick={() => void moderate(item)}>{active ? "Gizle" : "Geri getir"}</button></span></div>; })}</div></section></div>;
}

function UserModeration({ data, reload, setMessage }: ContentProps) {
  const users = useMemo(() => (data.users as JsonRecord[] | undefined) ?? [], [data.users]); const [query, setQuery] = useState(""); const [reason, setReason] = useState("");
  const filtered = useMemo(() => users.filter((item) => `${item.display_name} ${item.handle} ${item.email} ${item.university_short_name}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))), [users, query]);
  async function update(user: JsonRecord) { const suspended = user.status === "suspended"; try { await apiAction("/api/admin", { action: "set-user-status", id: user.public_id, status: suspended ? "active" : "suspended", reason }); setMessage(suspended ? "Öğrenci hesabı yeniden açıldı." : "Öğrenci hesabı askıya alındı ve oturumları kapatıldı."); await reload(); } catch (error) { setMessage(errorMessage(error)); } }
  return <div className={styles.contentStack}><section className={styles.toolbar}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad, kullanıcı adı, e-posta veya üniversite ara…" /><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Askıya alma gerekçesi (zorunlu)" /></section><section className={styles.card}><CardTitle eyebrow="HESAP DENETİMİ" title="Öğrenci hesapları" detail="Askıya alma işlemi tüm aktif oturumları kapatır" /><div className={styles.userGrid}>{filtered.map((user) => <article key={String(user.public_id)}><header><span className={styles.avatar}>{initials(String(user.display_name))}</span><div><strong>{String(user.display_name)}</strong><small>@{String(user.handle)} · {String(user.university_short_name ?? "Profil eksik")}</small></div><b className={user.status === "active" ? styles.goodBadge : styles.badBadge}>{String(user.status)}</b></header><p>{String(user.email)}</p><footer><span>{number.format(Number(user.report_count ?? 0))} şikâyet</span><button className={user.status === "active" ? styles.dangerButton : styles.successButton} onClick={() => void update(user)}>{user.status === "active" ? "Hesabı askıya al" : "Hesabı aç"}</button></footer></article>)}</div></section></div>;
}

function MetricGrid({ labels, metrics }: { labels: Record<string, [string, string]>; metrics: JsonRecord }) { return <section className={styles.metricGrid}>{Object.entries(labels).map(([key, [label, detail]], index) => <article key={key}><span>{String(index + 1).padStart(2, "0")}</span><strong>{number.format(Number(metrics[key] ?? 0))}</strong><p>{label}</p><small>{detail}</small></article>)}</section>; }
function CardTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <header className={styles.cardTitle}><div><span>{eyebrow}</span><h2>{title}</h2></div><small>{detail}</small></header>; }
function AuditTable({ rows }: { rows: JsonRecord[] }) { return <section className={styles.card}><CardTitle eyebrow="DEĞİŞTİRİLEMEZ KAYIT" title="İşlem günlüğü" detail={`${rows.length} son kayıt`} /><div className={styles.auditList}>{rows.length ? rows.map((row, index) => <article key={String(row.id ?? `${row.action}-${index}`)}><span>{String(row.action).startsWith("moderation") ? "M" : String(row.action).startsWith("staff") ? "S" : "P"}</span><div><strong>{String(row.action)}</strong><p>{String(row.actor_name ?? row.actor_username ?? "Sistem")} · {String(row.entity_type ?? "platform")} {row.entity_id ? `#${String(row.entity_id).slice(0, 8)}` : ""}</p></div><small>{formatDate(row.created_at)}</small></article>) : <Empty text="Henüz işlem kaydı yok." />}</div></section>; }
function Empty({ text }: { text: string }) { return <div className={styles.empty}>{text}</div>; }
function ConsoleLoading({ inline = false }: { inline?: boolean }) { return <div className={inline ? styles.inlineLoading : styles.fullLoading}><span className={styles.brandMark}>ü</span><strong>Yönetim verileri hazırlanıyor…</strong></div>; }
function AccessDenied({ staff }: { staff: Staff }) { return <div className={styles.passwordPage}><section className={styles.passwordCard}><span className={styles.securityIcon}>!</span><small>YETKİ SINIRI</small><h1>Owner erişimi gerekli</h1><p>{staff.displayName}, bu hesap Admin paneline erişebilir; platform ayarları ve admin yönetimi yalnızca owner hesabına açıktır.</p><Link className={styles.primaryLink} href="/admin">Admin paneline git →</Link></section></div>; }

type ContentProps = { tab?: string; data: JsonRecord; reload: () => Promise<void>; setMessage: (value: string) => void };
async function apiAction(url: string, body: JsonRecord) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) }); const payload = await response.json() as JsonRecord; if (!response.ok) throw new Error(String(payload.error ?? "İşlem tamamlanamadı.")); return payload; }
async function signOut(setStaff: (staff: Staff | null) => void) { await fetch("/api/staff/session", { method: "DELETE", credentials: "same-origin" }); setStaff(null); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "İşlem tamamlanamadı."; }
function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR"); }
function formatDate(value: unknown) { const parsed = new Date(String(value ?? "")); return Number.isNaN(parsed.getTime()) ? "-" : dateTime.format(parsed); }
function formatUpdateDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "-" : updateDateTime.format(parsed); }
function entityLabel(value: string) { return ({ post: "Gönderi", comment: "Yorum", note: "Not", "note-comment": "Not yorumu", community: "Topluluk", pulse: "Kampüs Anlık", listing: "İlan", place: "Mekân", "housing-message": "Yurt deneyimi", event: "Etkinlik", price: "Fiyat", "direct-message": "Özel mesaj", user: "Kullanıcı" } as Record<string, string>)[value] ?? value; }
function evidenceSummary(evidence: JsonRecord) { return String(evidence.content ?? evidence.title ?? evidence.name ?? evidence.description ?? evidence.item_name ?? evidence.display_name ?? "Kanıt anlık görüntüsü kaydedildi.").slice(0, 280); }
