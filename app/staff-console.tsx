"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { Flag } from "@phosphor-icons/react/dist/csr/Flag";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import Image from "next/image";
import Link from "next/link";
import { MODERATABLE_ENTITY_TYPES } from "../lib/admin-registry";
import { PRODUCT_UPDATES } from "../lib/product-updates";
import { CourseCatalogCoverage } from "./course-catalog-coverage";
import styles from "./staff-console.module.css";
import {
  StaffDialog,
  StaffEmpty,
  StaffFilters,
  StaffPagination,
} from "./staff-controls";
import { matchesSearch } from "../lib/workspace-navigation";
import {
  auditAction,
  auditCsv,
  auditDetails,
  paginateRecords,
  reportReason,
  staffEntity,
  staffStatus,
  staffTabFromSearch,
  staffTimestamp,
  sevenDayActivity,
} from "../lib/staff-console-view";

type Mode = "owner" | "admin";
type Staff = {
  id: string;
  username: string;
  displayName: string;
  role: Mode;
  mustChangePassword: boolean;
};
type JsonRecord = Record<string, unknown>;

const number = new Intl.NumberFormat("tr-TR");
const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const updateDateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "long",
  timeStyle: "short",
});

const ownerTabs = [
  ["overview", "Genel bakış", "⌂"],
  ["admins", "Admin yönetimi", "♙"],
  ["settings", "Sistem ayarları", "⚙"],
  ["audit", "İşlem günlüğü", "≡"],
  ["updates", "Güncellemeler", "✦"],
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
  community_memberships: ["Topluluk üyeliği", "Aktif"],
  community_events_upcoming: ["Topluluk etkinliği", "Yaklaşan"],
  communities_hidden: ["Topluluk", "Gizlenen"],
  community_events_hidden: ["Topluluk etkinliği", "Gizlenen"],
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
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const currentTab = useRef("overview");
  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }
  const request = useRef<AbortController | null>(null);
  const tabs = mode === "owner" ? ownerTabs : adminTabs;

  const loadDashboard = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/${mode}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const payload = (await response.json()) as JsonRecord;
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        setStaff(null);
        setData(null);
        return;
      }
      if (response.status === 428) {
        setStaff((current) =>
          current ? { ...current, mustChangePassword: true } : current,
        );
        return;
      }
      if (!response.ok)
        throw new Error(String(payload.error ?? "Panel yüklenemedi."));
      setData(payload);
      if (payload.staff) setStaff(payload.staff as Staff);
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [mode]);

  const acceptStaff = useCallback(
    (nextStaff: Staff) => {
      setStaff(nextStaff);
      if (
        !nextStaff.mustChangePassword &&
        (mode !== "owner" || nextStaff.role === "owner")
      )
        void loadDashboard();
    },
    [loadDashboard, mode],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/staff/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => ({
        response,
        payload: (await response.json()) as JsonRecord,
      }))
      .then(({ response, payload }) => {
        if (!controller.signal.aborted && response.ok)
          acceptStaff(payload.staff as Staff);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError(
            "Yönetim oturumu doğrulanamadı; yeniden giriş yapabilirsin.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [acceptStaff]);
  useEffect(() => {
    const restore = () => {
      if (
        dirtyRef.current &&
        !window.confirm(
          "Kaydedilmemiş ayar değişikliklerin var. Kaydetmeden bu bölümden çıkılsın mı?",
        )
      ) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", currentTab.current);
        window.history.pushState({}, "", `${url.pathname}${url.search}`);
        return;
      }
      const next = staffTabFromSearch(mode, window.location.search);
      currentTab.current = next;
      setTab(next);
      setMenuOpen(false);
      markDirty(false);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [mode]);
  function navigate(next: string, record?: string) {
    if (next === tab && !record) {
      setMenuOpen(false);
      return;
    }
    if (
      dirty &&
      !window.confirm(
        "Kaydedilmemiş ayar değişikliklerin var. Kaydetmeden bu bölümden çıkılsın mı?",
      )
    )
      return;
    const url = new URL(window.location.href);
    if (record) url.searchParams.set("record", record);
    else url.searchParams.delete("record");
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
    markDirty(false);
    currentTab.current = next;
    setTab(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }
  function guardLeave(event: { preventDefault: () => void }) {
    if (
      dirty &&
      !window.confirm(
        "Kaydedilmemiş ayar değişikliklerin var. Kaydetmeden bu sayfadan çıkılsın mı?",
      )
    )
      event.preventDefault();
  }
  async function logout() {
    if (
      dirty &&
      !window.confirm("Kaydedilmemiş değişikliklerle oturum kapatılsın mı?")
    )
      return;
    try {
      await signOut(setStaff);
      setData(null);
      markDirty(false);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }
  if (loading) return <ConsoleLoading />;
  if (!staff) return <StaffLogin mode={mode} onLogin={acceptStaff} />;
  if (staff.mustChangePassword)
    return <PasswordChange staff={staff} onChanged={acceptStaff} />;
  if (mode === "owner" && staff.role !== "owner")
    return <AccessDenied staff={staff} />;
  const generatedAt =
    data?.generatedAt ?? (data?.system as JsonRecord | undefined)?.generatedAt;
  const pending =
    Number((data?.metrics as JsonRecord | undefined)?.reports_open ?? 0) +
    Number((data?.metrics as JsonRecord | undefined)?.reports_appealed ?? 0);
  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.menuOpen : ""}`}>
        <Link
          className={styles.brand}
          href="/"
          onClick={guardLeave}
          aria-label="Kampira ana sayfa"
        >
          <Image
            unoptimized
            className={styles.brandMark}
            src="/kampira-mark.png"
            width={42}
            height={42}
            alt=""
          />
          <strong>Kampira</strong>
        </Link>
        <button
          className={styles.mobileTrigger}
          type="button"
          aria-label="Yönetim menüsünü aç veya kapat"
          aria-expanded={menuOpen}
          aria-controls="staff-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={22} /> : <List size={22} />}
        </button>
        <div className={styles.panelIdentity}>
          <span>{mode === "owner" ? "OWNER PANELİ" : "ADMIN PANELİ"}</span>
          <strong>
            {mode === "owner" ? "Platform yönetimi" : "Topluluk güvenliği"}
          </strong>
          <small>
            {mode === "owner"
              ? "Ekip, sistem ve ürün takibi"
              : "İnceleme, karar ve hesap yönetimi"}
          </small>
        </div>
        <nav id="staff-navigation" aria-label="Yönetim menüsü">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={tab === key ? "page" : undefined}
              className={tab === key ? styles.activeNav : ""}
              onClick={() => navigate(key)}
            >
              <StaffNavIcon section={key} />
              <span>{label}</span>
              {key === "reports" && pending > 0 && <b>{pending}</b>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/" onClick={guardLeave}>
            ← Öğrenci görünümüne dön
          </Link>
          <div className={styles.sidebarFoot}>
            <span className={styles.avatar}>{initials(staff.displayName)}</span>
            <div>
              <strong>{staff.displayName}</strong>
              <small>@{staff.username}</small>
            </div>
            <button
              type="button"
              aria-label="Yönetim oturumundan çık"
              onClick={() => void logout()}
            >
              <SignOut size={19} />
            </button>
          </div>
        </div>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span>
              {mode === "owner" ? "KAMPIRA / YÖNETİM" : "KAMPIRA / MODERASYON"}
            </span>
            <h1>{tabs.find(([key]) => key === tab)?.[1]}</h1>
            <small className={styles.freshness}>
              {generatedAt
                ? `Son yenileme: ${formatDate(generatedAt)}`
                : "Veriler hazırlanıyor"}
            </small>
          </div>
          <div className={styles.topActions}>
            <button
              type="button"
              disabled={busy || dirty}
              onClick={() => void loadDashboard()}
              aria-label="Panel verilerini yenile"
            >
              {busy ? "Yenileniyor…" : "↻ Yenile"}
            </button>
            {mode === "owner" ? (
              <Link href="/admin" onClick={guardLeave}>
                Admin paneli ↗
              </Link>
            ) : staff.role === "owner" ? (
              <Link href="/owner" onClick={guardLeave}>
                Owner paneli ↗
              </Link>
            ) : null}
          </div>
        </header>
        {message && (
          <div className={styles.toast} role="status">
            <span>{message}</span>
            <button
              type="button"
              aria-label="Bildirimi kapat"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}
        {loadError && (
          <div className={styles.loadError} role="alert">
            <div>
              <strong>Veriler yenilenemedi</strong>
              <p>
                {loadError}
                {data ? " Son yüklenen kayıtlar gösteriliyor." : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadDashboard()}
            >
              Tekrar dene
            </button>
          </div>
        )}
        {!data ? (
          !loadError && <ConsoleLoading inline />
        ) : mode === "owner" ? (
          <OwnerContent
            tab={tab}
            data={data}
            reload={loadDashboard}
            setMessage={setMessage}
            onNavigate={navigate}
            onDirtyChange={markDirty}
          />
        ) : (
          <AdminContent
            tab={tab}
            data={data}
            reload={loadDashboard}
            setMessage={setMessage}
            onNavigate={navigate}
          />
        )}
      </main>
    </div>
  );
}

function StaffLogin({
  mode,
  onLogin,
}: {
  mode: Mode;
  onLogin: (staff: Staff) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as JsonRecord;
      if (!response.ok)
        throw new Error(String(payload.error ?? "Giriş tamamlanamadı."));
      onLogin(payload.staff as Staff);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Giriş tamamlanamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.authPage}>
      <section className={styles.authStory}>
        <Link className={styles.brand} href="/" aria-label="Kampira ana sayfa">
          <Image
            unoptimized
            className={styles.brandMark}
            src="/kampira-mark.png"
            width={42}
            height={42}
            alt=""
          />
          <strong>Kampira</strong>
        </Link>
        <div>
          <span>{mode === "owner" ? "OWNER CONTROL" : "ADMIN DESK"}</span>
          <h1>
            {mode === "owner"
              ? "Kampira’nın tamamı tek merkezde."
              : "Kampüs topluluğunu güvenle yönet."}
          </h1>
          <p>
            {mode === "owner"
              ? "Ekip erişimleri, büyüme, içerik sağlığı, özellik anahtarları ve tüm operasyon geçmişi."
              : "Şikâyetleri incele, içerikleri yönet ve öğrenciler için güvenli bir kampüs alanı oluştur."}
          </p>
        </div>
        <footer>
          <span>◉ Güvenli staff oturumu</span>
          <span>◷ 8 saatlik erişim</span>
          <span>⌁ İşlem günlüğü</span>
        </footer>
      </section>
      <section className={styles.authCard}>
        <div className={styles.authIcon}>{mode === "owner" ? "O" : "A"}</div>
        <span>YÖNETİM GİRİŞİ</span>
        <h2>
          {mode === "owner" ? "Owner paneline giriş" : "Admin paneline giriş"}
        </h2>
        <p>Öğrenci hesabından ayrı yönetim bilgilerini kullan.</p>
        <form onSubmit={submit}>
          <label>
            Kullanıcı adı
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="kullanıcı adın"
              required
            />
          </label>
          <label>
            Parola
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••••••"
              required
            />
          </label>
          {error ? <div className={styles.formError}>{error}</div> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Doğrulanıyor…" : "Güvenli giriş yap →"}
          </button>
        </form>
      </section>
    </div>
  );
}

function PasswordChange({
  staff,
  onChanged,
}: {
  staff: Staff;
  onChanged: (staff: Staff) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirm) return setError("Yeni parolalar eşleşmiyor.");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as JsonRecord;
      if (!response.ok)
        throw new Error(String(payload.error ?? "Parola değiştirilemedi."));
      onChanged(payload.staff as Staff);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Parola değiştirilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.passwordPage}>
      <section className={styles.passwordCard}>
        <span className={styles.securityIcon}>✓</span>
        <small>İLK GİRİŞ GÜVENLİĞİ</small>
        <h1>Başlangıç parolanı değiştir</h1>
        <p>
          Merhaba {staff.displayName}. Panele erişmeden önce yalnızca sana ait
          güçlü bir parola belirle.
        </p>
        <form onSubmit={submit}>
          <label>
            Mevcut parola
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Yeni parola
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Yeni parolayı doğrula
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </label>
          <div className={styles.passwordRules}>
            <span>En az 12 karakter</span>
            <span>Büyük/küçük harf</span>
            <span>Rakam ve özel karakter</span>
          </div>
          {error ? <div className={styles.formError}>{error}</div> : null}
          <button disabled={busy}>
            {busy ? "Kaydediliyor…" : "Parolayı değiştir ve devam et →"}
          </button>
        </form>
      </section>
    </div>
  );
}

function OwnerContent({
  tab,
  data,
  reload,
  setMessage,
  onNavigate,
  onDirtyChange,
}: ContentProps) {
  if (tab === "admins")
    return <OwnerAdmins data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "settings")
    return (
      <OwnerSettings
        key={JSON.stringify(data.settings)}
        data={data}
        reload={reload}
        setMessage={setMessage}
        onDirtyChange={onDirtyChange}
      />
    );
  if (tab === "audit")
    return <AuditTable rows={(data.audit as JsonRecord[] | undefined) ?? []} />;
  if (tab === "updates") return <AdminUpdates />;
  return <OwnerOverview data={data} onNavigate={onNavigate} />;
}

function OwnerOverview({
  data,
  onNavigate,
}: {
  data: JsonRecord;
  onNavigate?: (tab: string, record?: string) => void;
}) {
  const metrics = (data.metrics as JsonRecord | undefined) ?? {};
  const features = (data.features as JsonRecord[] | undefined) ?? [];
  const campuses = (data.campuses as JsonRecord[] | undefined) ?? [];
  const system = (data.system as JsonRecord | undefined) ?? {};
  const activity = sevenDayActivity(
    (data.activity as JsonRecord[] | undefined) ?? [],
    system.generatedAt,
  );
  const maxActivity = Math.max(
    1,
    ...activity.map((row) => row.content + row.accounts + row.reports),
  );
  const [moduleQuery, setModuleQuery] = useState("");
  const primaryKeys = [
    "users_total",
    "users_week",
    "student_sessions",
    "communities_active",
    "reports_pending",
    "admins_active",
  ];
  return (
    <div className={styles.contentStack}>
      <section className={styles.welcome}>
        <div>
          <span>PLATFORM GENEL BAKIŞI</span>
          <h2>Bugünün yönetim özeti.</h2>
          <p>
            Öğrenci hareketini takip et, ekibini yönet ve dikkat isteyen
            alanlara geç.
          </p>
          <div className={styles.heroActions}>
            <Link href="/admin?tab=reports">Şikâyet kuyruğunu aç ↗</Link>
            <button type="button" onClick={() => onNavigate?.("admins")}>
              Ekibi yönet →
            </button>
          </div>
        </div>
        <div className={styles.healthPanel}>
          <span>Veritabanı</span>
          <strong
            className={
              system.database === "ok" ? styles.healthGood : styles.healthBad
            }
          >
            {system.database === "ok" ? "Bağlı" : "Kontrol gerekli"}
          </strong>
          <span>Dosya depolama</span>
          <strong
            className={
              system.storage === "configured"
                ? styles.healthGood
                : styles.healthBad
            }
          >
            {system.storage === "configured" ? "Hazır" : "Kullanılamıyor"}
          </strong>
          <span>Ders kataloğu</span>
          <strong>
            {number.format(Number(system.courseCatalogPrograms ?? 0))} program
          </strong>
          <span>Doğrulanmış ders</span>
          <strong>
            {number.format(Number(system.courseCatalogCourses ?? 0))}
          </strong>
          <span>Kısmi müfredat</span>
          <strong>{number.format(Number(system.courseCatalogPartialPrograms ?? 0))} program</strong>
          <span>Kıbrıs ders kapsamı</span>
          <strong>
            {number.format(Number(system.cyprusCatalogStructuredPrograms ?? 0))} / {number.format(Number(system.cyprusCatalogPrograms ?? 0))} program
          </strong>
          <span>Türkiye ders kapsamı</span>
          <strong>
            {number.format(Number(system.turkeyCatalogStructuredPrograms ?? 0))} / {number.format(Number(system.turkeyCatalogPrograms ?? 0))} program
          </strong>
          <span>Türkiye üniversiteleri</span>
          <strong>
            {number.format(Number(system.turkeyCatalogUniversitiesWithCourses ?? 0))} / {number.format(Number(system.turkeyCatalogUniversities ?? 0))} ders kataloglu
          </strong>
          <small>Kısmi müfredatlarda bazı dersler, dönemler veya ders türleri kaynakta bulunmayabilir.</small>
          <small>
            Kampira v{String(system.version ?? "—")} · katalog{" "}
            {String(system.courseCatalogUpdatedAt ?? "—")}
          </small>
        </div>
      </section>
      <CourseCatalogCoverage />
      <MetricGrid
        labels={Object.fromEntries(
          primaryKeys.map((key) => [key, ownerMetricLabels[key]]),
        )}
        metrics={metrics}
      />
      <div className={styles.quickActions}>
        <button type="button" onClick={() => onNavigate?.("settings")}>
          <span>01</span>
          <div>
            <strong>Sistem ayarları</strong>
            <small>Kayıt, paylaşım ve bakım tercihleri</small>
          </div>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate?.("audit")}>
          <span>02</span>
          <div>
            <strong>İşlem günlüğü</strong>
            <small>Ekip işlemlerini ve gerekçeleri incele</small>
          </div>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate?.("updates")}>
          <span>03</span>
          <div>
            <strong>Ürün güncellemeleri</strong>
            <small>Son geliştirmeleri takip et</small>
          </div>
          <b>→</b>
        </button>
      </div>
      <div className={styles.twoColumn}>
        <section className={styles.card}>
          <CardTitle
            eyebrow="SON 7 GÜN · UTC"
            title="Hesap ve içerik hareketi"
            detail="Boş günler sıfır olarak gösterilir"
          />
          <div className={styles.chartLegend}>
            <span>Yeni hesap</span>
            <span>İçerik</span>
            <span>Şikâyet</span>
          </div>
          <div className={styles.activityChart}>
            {activity.map((row) => (
              <div
                key={row.day}
                title={`${row.day}: ${row.accounts} hesap, ${row.content} içerik, ${row.reports} şikâyet`}
              >
                <div
                  className={styles.chartStack}
                  style={{
                    height: `${((row.accounts + row.content + row.reports) / maxActivity) * 160}px`,
                  }}
                >
                  <i style={{ flex: row.reports }} />
                  <i style={{ flex: row.content }} />
                  <i style={{ flex: row.accounts }} />
                </div>
                <small>{row.day.slice(5).replace("-", "/")}</small>
              </div>
            ))}
          </div>
          <details className={styles.chartData}>
            <summary>Günlük sayıları gör</summary>
            <table>
              <thead>
                <tr>
                  <th>Gün</th>
                  <th>Hesap</th>
                  <th>İçerik</th>
                  <th>Şikâyet</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.day}>
                    <td>{row.day.slice(5)}</td>
                    <td>{row.accounts}</td>
                    <td>{row.content}</td>
                    <td>{row.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
        <section className={styles.card}>
          <CardTitle
            eyebrow="KAMPÜS DAĞILIMI"
            title="Öğrenci toplulukların"
            detail="Akademik profil kayıtları"
          />
          <div className={styles.rankList}>
            {campuses
              .filter((campus) => Number(campus.student_count) > 0)
              .slice(0, 7)
              .map((campus, index) => (
                <div key={String(campus.id)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>
                    <strong>{String(campus.short_name)}</strong>
                    <small>{String(campus.name)}</small>
                  </span>
                  <em>{number.format(Number(campus.student_count))}</em>
                </div>
              ))}
          </div>
          {!campuses.some((campus) => Number(campus.student_count) > 0) && (
            <Empty text="Henüz tamamlanan kampüs profili yok." />
          )}
        </section>
      </div>
      <details className={styles.metricDetails}>
        <summary>
          Tüm platform göstergeleri{" "}
          <span>{Object.keys(ownerMetricLabels).length} gösterge</span>
        </summary>
        <MetricGrid labels={ownerMetricLabels} metrics={metrics} />
      </details>
      <section className={styles.card}>
        <CardTitle
          eyebrow="ÜRÜN ALANLARI"
          title="Modül envanteri"
          detail={`${features.length} ürün alanı`}
        />
        <StaffFilters
          query={moduleQuery}
          onQuery={setModuleQuery}
          placeholder="Ürün alanlarında ara"
          count={
            features.filter((feature) =>
              matchesSearch(moduleQuery, String(feature.label)),
            ).length
          }
          total={features.length}
        />
        <div className={styles.featureGrid}>
          {features
            .filter((feature) =>
              matchesSearch(moduleQuery, String(feature.label)),
            )
            .map((feature) => (
              <article key={String(feature.key)}>
                <span>{feature.moderation ? "MODERASYON" : "OPERASYON"}</span>
                <strong>{String(feature.label)}</strong>
                <b>{number.format(Number(feature.count ?? 0))}</b>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}

function OwnerAdmins({ data, reload, setMessage }: ContentProps) {
  const admins = (data.admins as JsonRecord[] | undefined) ?? [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    password: "",
  });
  const [target, setTarget] = useState<{
    admin: JsonRecord;
    action: "status" | "password";
  } | null>(null);
  const [password, setPassword] = useState("");
  const filtered = admins.filter(
    (admin) =>
      matchesSearch(
        query,
        String(admin.display_name),
        String(admin.username),
      ) &&
      (!status ||
        (status === "pending"
          ? Boolean(admin.must_change_password)
          : admin.status === status)),
  );
  const pagination = paginateRecords(filtered, page, 8);
  const activeCount = admins.filter(
    (admin) => admin.status === "active",
  ).length;
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>YÖNETİM EKİBİ</span>
          <h2>Doğru erişim, kişiye özel hesap.</h2>
          <p>
            {activeCount} aktif admin ·{" "}
            {admins.filter((admin) => admin.must_change_password).length} hesap
            ilk parola değişimini bekliyor.
          </p>
        </div>
        <button
          className={styles.primaryAction}
          type="button"
          onClick={() => setCreating(true)}
        >
          ＋ Admin oluştur
        </button>
      </section>
      <StaffFilters
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="Admin adı veya kullanıcı adı ara"
        count={filtered.length}
        total={admins.length}
        onReset={
          query || status
            ? () => {
                setQuery("");
                setStatus("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          Hesap durumu
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tümü</option>
            <option value="active">Aktif</option>
            <option value="disabled">Devre dışı</option>
            <option value="pending">Parola değişimi bekleyen</option>
          </select>
        </label>
      </StaffFilters>
      <section className={styles.card}>
        <CardTitle
          eyebrow="YETKİLİ HESAPLAR"
          title="Admin ekibi"
          detail="Her işlem yetkili kişiyle birlikte kaydedilir"
        />
        <div className={styles.teamGrid}>
          {pagination.rows.map((admin) => (
            <article key={String(admin.id)}>
              <header>
                <span className={styles.avatar}>
                  {initials(String(admin.display_name))}
                </span>
                <div>
                  <strong>{String(admin.display_name)}</strong>
                  <small>@{String(admin.username)}</small>
                </div>
                <b
                  className={
                    admin.status === "active"
                      ? styles.goodBadge
                      : styles.badBadge
                  }
                >
                  {staffStatus(admin.status)}
                </b>
              </header>
              <dl>
                <div>
                  <dt>Son giriş</dt>
                  <dd>
                    {admin.last_login_at
                      ? formatDate(admin.last_login_at)
                      : "Henüz giriş yapmadı"}
                  </dd>
                </div>
                <div>
                  <dt>Parola</dt>
                  <dd>
                    {admin.must_change_password
                      ? "Değişim bekliyor"
                      : "Kişisel parola"}
                  </dd>
                </div>
              </dl>
              <footer>
                <button
                  type="button"
                  onClick={() => {
                    setPassword("");
                    setTarget({ admin, action: "password" });
                  }}
                >
                  Parolayı sıfırla
                </button>
                <button
                  type="button"
                  className={
                    admin.status === "active"
                      ? styles.dangerButton
                      : styles.successButton
                  }
                  onClick={() => setTarget({ admin, action: "status" })}
                >
                  {admin.status === "active"
                    ? "Devre dışı bırak"
                    : "Etkinleştir"}
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <StaffEmpty
            title={
              admins.length
                ? "Eşleşen admin yok"
                : "Ekibinin ilk hesabını oluştur"
            }
            detail="Admin hesapları öğrenci hesaplarından ayrı yönetilir."
          />
        )}
        <StaffPagination {...pagination} onPage={setPage} />
      </section>
      {creating && (
        <StaffDialog
          title="Admin hesabı oluştur"
          description="Yeni admin, ilk girişinde geçici parolasını değiştirecek."
          submitLabel="Admin oluştur"
          onClose={() => setCreating(false)}
          onSubmit={async () => {
            await apiAction("/api/owner", { action: "create-admin", ...form });
            setCreating(false);
            setForm({ displayName: "", username: "", password: "" });
            setMessage(
              "Admin oluşturuldu. İlk girişinde parola değişimi istenecek.",
            );
            await reload();
          }}
        >
          <label>
            Ad soyad
            <input
              autoFocus
              required
              minLength={2}
              maxLength={60}
              value={form.displayName}
              onChange={(event) =>
                setForm({ ...form, displayName: event.target.value })
              }
            />
          </label>
          <label>
            Kullanıcı adı
            <input
              required
              minLength={3}
              maxLength={32}
              autoCapitalize="none"
              autoComplete="off"
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
            />
          </label>
          <label>
            Geçici parola
            <input
              required
              minLength={12}
              maxLength={128}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
          </label>
          <p className={styles.fieldHint}>
            En az 12 karakter; büyük/küçük harf, rakam ve özel karakter kullan.
            Kullanıcı adını parolaya ekleme.
          </p>
        </StaffDialog>
      )}
      {target && (
        <StaffDialog
          title={
            target.action === "password"
              ? "Geçici parolayı yenile"
              : target.admin.status === "active"
                ? "Admin erişimini kapat"
                : "Admin erişimini aç"
          }
          description={`${String(target.admin.display_name)} (@${String(target.admin.username)})${target.action === "password" || target.admin.status === "active" ? " hesabının açık oturumları kapatılacak." : " yeniden yönetim paneline erişebilecek."}`}
          submitLabel={
            target.action === "password"
              ? "Parolayı sıfırla"
              : target.admin.status === "active"
                ? "Devre dışı bırak"
                : "Etkinleştir"
          }
          danger={
            target.action === "status" && target.admin.status === "active"
          }
          onClose={() => setTarget(null)}
          onSubmit={async () => {
            await apiAction(
              "/api/owner",
              target.action === "password"
                ? {
                    action: "reset-admin-password",
                    id: target.admin.id,
                    password,
                  }
                : {
                    action: "set-admin-status",
                    id: target.admin.id,
                    status:
                      target.admin.status === "active" ? "disabled" : "active",
                  },
            );
            setTarget(null);
            setPassword("");
            setMessage("Admin hesabı güncellendi; işlem günlüğüne kaydedildi.");
            await reload();
          }}
        >
          {target.action === "password" && (
            <>
              <label>
                Yeni geçici parola
                <input
                  autoFocus
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <p className={styles.fieldHint}>
                En az 12 karakter; büyük/küçük harf, rakam ve özel karakter. İlk
                girişte admin kendi parolasını belirler.
              </p>
            </>
          )}
        </StaffDialog>
      )}
    </div>
  );
}

function OwnerSettings({
  data,
  reload,
  setMessage,
  onDirtyChange,
}: ContentProps) {
  const original = (data.settings as Record<string, boolean | string>) ?? {};
  const [settings, setSettings] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const changed = Object.keys(settings).filter(
    (key) => settings[key] !== original[key],
  );
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(key: string, value: boolean | string) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    onDirtyChange?.(
      Object.keys(next).some((name) => next[name] !== original[name]),
    );
    setError("");
  }
  async function save() {
    if (!dirty || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await apiAction("/api/owner", { action: "save-settings", settings });
      onDirtyChange?.(false);
      setMessage("Platform ayarları kaydedildi.");
      await reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const toggles = [
    [
      "registrationOpen",
      "Yeni öğrenci kaydı",
      "Yeni hesap oluşturma erişimini yönetir. Mevcut öğrencilerin girişini etkilemez.",
    ],
    [
      "noteUploadsOpen",
      "Çalışma notu yükleme",
      "Öğrencilerin yeni dosya yükleyebilmesini yönetir.",
    ],
    [
      "communityCreationOpen",
      "Topluluk oluşturma",
      "Mevcut toplulukları etkilemeden yeni kurulumları yönetir.",
    ],
    [
      "housingContributionsOpen",
      "Yurt ve konaklama katkıları",
      "Yeni konaklama kayıtlarını ve öğrenci deneyimlerini yönetir.",
    ],
    [
      "maintenanceMode",
      "Bakım duyurusu",
      "Platformun mevcut bakım bildirimi ayarını yönetir.",
    ],
  ];
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>PLATFORM TERCİHLERİ</span>
          <h2>Değişiklikleri birlikte gözden geçir.</h2>
          <p>Seçimlerin Kaydet düğmesine bastığında uygulanır.</p>
        </div>
        <b className={dirty ? styles.warnBadge : styles.goodBadge}>
          {dirty
            ? `${changed.length} değişiklik bekliyor`
            : "Tüm değişiklikler kayıtlı"}
        </b>
      </section>
      <section className={styles.settingsGrid}>
        {toggles.map(([key, label, detail]) => (
          <article
            key={key}
            className={changed.includes(key) ? styles.changedSetting : ""}
          >
            <div>
              <strong id={`setting-${key}`}>{label}</strong>
              <p>{detail}</p>
              <small>
                {settings[key] ? "Açık" : "Kapalı"}
                {changed.includes(key) ? " · kaydedilmedi" : ""}
              </small>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby={`setting-${key}`}
              aria-checked={Boolean(settings[key])}
              disabled={busy}
              className={settings[key] ? styles.switchOn : styles.switchOff}
              onClick={() => change(key, !settings[key])}
            >
              <i />
            </button>
          </article>
        ))}
      </section>
      <section className={styles.card}>
        <CardTitle
          eyebrow="BİLDİRİM METNİ"
          title="Bakım mesajı"
          detail="En fazla 240 karakter"
        />
        <label className={styles.formLabel}>
          Öğrencilere gösterilecek mesaj
          <textarea
            className={styles.largeTextarea}
            disabled={busy}
            value={String(settings.maintenanceMessage ?? "")}
            onChange={(event) =>
              change("maintenanceMessage", event.target.value)
            }
            maxLength={240}
          />
        </label>
        <div className={styles.fieldFoot}>
          <span>{String(settings.maintenanceMessage ?? "").length}/240</span>
        </div>
        <div className={styles.announcementPreview}>
          <span>MESAJ ÖNİZLEMESİ</span>
          <p>
            {String(
              settings.maintenanceMessage ||
                "Bakım mesajını buraya yazabilirsin.",
            )}
          </p>
        </div>
      </section>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.saveBar}>
        <span>
          {dirty
            ? `${changed.length} değişiklik kaydedilmeyi bekliyor`
            : "Kaydedilmemiş değişiklik yok"}
        </span>
        <div>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={() => {
              setSettings(original);
              onDirtyChange?.(false);
              setError("");
            }}
          >
            Değişiklikleri geri al
          </button>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminContent({
  tab,
  data,
  reload,
  setMessage,
  onNavigate,
}: ContentProps) {
  if (tab === "reports")
    return <ReportQueue data={data} reload={reload} setMessage={setMessage} />;
  if (tab === "content")
    return (
      <ContentModeration data={data} reload={reload} setMessage={setMessage} />
    );
  if (tab === "users")
    return (
      <UserModeration data={data} reload={reload} setMessage={setMessage} />
    );
  if (tab === "decisions")
    return (
      <AuditTable rows={(data.decisions as JsonRecord[] | undefined) ?? []} />
    );
  if (tab === "updates") return <AdminUpdates />;
  const metrics = (data.metrics as JsonRecord | undefined) ?? {};
  const reports = ((data.reports as JsonRecord[] | undefined) ?? []).filter(
    (report) => report.status !== "resolved",
  );
  const content = (data.content as JsonRecord[] | undefined) ?? [];
  const primaryKeys = [
    "reports_open",
    "reports_appealed",
    "reports_resolved_week",
    "users_suspended",
    "notes_attention",
    "direct_messages_hidden",
  ];
  return (
    <div className={styles.contentStack}>
      <section className={styles.welcome}>
        <div>
          <span>MODERASYON ÖZETİ</span>
          <h2>İncele, karar ver, takip et.</h2>
          <p>
            İtirazları ve açık bildirimleri önceliklendir. Her kararın gerekçesi
            işlem geçmişinde saklanır.
          </p>
          <div className={styles.heroActions}>
            <button type="button" onClick={() => onNavigate?.("reports")}>
              İncelemeye başla →
            </button>
          </div>
        </div>
        <div className={styles.bigNumber}>
          <strong>
            {number.format(
              Number(metrics.reports_open ?? 0) +
                Number(metrics.reports_appealed ?? 0),
            )}
          </strong>
          <span>bekleyen şikâyet</span>
        </div>
      </section>
      <MetricGrid
        labels={Object.fromEntries(
          primaryKeys.map((key) => [key, adminMetricLabels[key]]),
        )}
        metrics={metrics}
      />
      <div className={styles.quickActions}>
        <button type="button" onClick={() => onNavigate?.("content")}>
          <span>01</span>
          <div>
            <strong>İçerikleri denetle</strong>
            <small>Paylaşımlar, notlar ve topluluklar</small>
          </div>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate?.("users")}>
          <span>02</span>
          <div>
            <strong>Hesapları yönet</strong>
            <small>Kampüs ve hesap durumuna göre bul</small>
          </div>
          <b>→</b>
        </button>
        <button type="button" onClick={() => onNavigate?.("decisions")}>
          <span>03</span>
          <div>
            <strong>Karar geçmişi</strong>
            <small>İşlemleri ve gerekçeleri incele</small>
          </div>
          <b>→</b>
        </button>
      </div>
      <div className={styles.twoColumn}>
        <section className={styles.card}>
          <CardTitle
            eyebrow="ÖNCELİKLİ KUYRUK"
            title="Son açık şikâyetler"
            detail="İtirazlar ilk sırada"
          />
          <div className={styles.compactList}>
            {reports.slice(0, 6).map((item) => (
              <button
                type="button"
                key={String(item.id)}
                onClick={() => onNavigate?.("reports", String(item.id))}
              >
                <b
                  className={
                    item.status === "appealed"
                      ? styles.badBadge
                      : styles.warnBadge
                  }
                >
                  {staffStatus(item.status)}
                </b>
                <span>
                  <strong>
                    {staffEntity(item.entity_type)} ·{" "}
                    {reportReason(item.reason)}
                  </strong>
                  <small>
                    {String(item.reporter_name)} · {formatDate(item.created_at)}
                  </small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
          {!reports.length && (
            <StaffEmpty
              title="Kuyrukta açık kayıt yok"
              detail="Yeni şikâyetler ve itirazlar burada görünecek."
            />
          )}
        </section>
        <section className={styles.card}>
          <CardTitle
            eyebrow="YENİ İÇERİK"
            title="Son paylaşımlar"
            detail="Yüklenen kayıtlardan"
          />
          <div className={styles.compactList}>
            {content.slice(0, 6).map((item) => (
              <button
                type="button"
                key={`${item.entity_type}-${item.id}`}
                onClick={() => onNavigate?.("content", String(item.id))}
              >
                <b className={styles.goodBadge}>
                  {staffEntity(item.entity_type)}
                </b>
                <span>
                  <strong>{String(item.title)}</strong>
                  <small>
                    {String(item.owner_name)} · {formatDate(item.created_at)}
                  </small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
          {!content.length && <Empty text="Henüz içerik yok." />}
        </section>
      </div>
      <details className={styles.metricDetails}>
        <summary>Tüm moderasyon göstergeleri</summary>
        <MetricGrid labels={adminMetricLabels} metrics={metrics} />
      </details>
    </div>
  );
}

function AdminUpdates() {
  const latest = PRODUCT_UPDATES[0];
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const filtered = PRODUCT_UPDATES.filter(
    (update) =>
      (!area || update.area === area) &&
      (!category || update.category === category) &&
      matchesSearch(query, update.title, update.summary, ...update.highlights),
  );
  const pagination = paginateRecords(filtered, page, 10);
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>ÜRÜN GÜNCELLEMELERİ</span>
          <h2>Her değişiklik kayıt altında.</h2>
          <p>
            {PRODUCT_UPDATES.length} güncelleme · Son kayıt:{" "}
            {latest ? formatUpdateDate(latest.releasedAt) : "—"}
          </p>
        </div>
      </section>
      <StaffFilters
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="Güncelleme başlığı veya açıklamasında ara"
        count={filtered.length}
        total={PRODUCT_UPDATES.length}
        onReset={
          query || area || category
            ? () => {
                setQuery("");
                setArea("");
                setCategory("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          Ürün alanı
          <select
            value={area}
            onChange={(event) => {
              setArea(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm alanlar</option>
            {[...new Set(PRODUCT_UPDATES.map((update) => update.area))]
              .sort()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
        <label>
          Değişiklik türü
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm değişiklikler</option>
            {[...new Set(PRODUCT_UPDATES.map((update) => update.category))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      </StaffFilters>
      <section className={styles.updatesGrid} aria-label="Güncelleme notları">
        {pagination.rows.map((update, index) => (
          <article className={styles.updateCard} key={update.id}>
            <header>
              <span className={styles.updateSequence}>
                {String(pagination.from + index).padStart(2, "0")}
              </span>
              <div className={styles.updateMeta}>
                <b data-category={update.category}>{update.category}</b>
                <span>{update.area}</span>
              </div>
              <time dateTime={update.releasedAt}>
                {formatUpdateDate(update.releasedAt)}
              </time>
            </header>
            <h3>{update.title}</h3>
            <p>{update.summary}</p>
            <ul>
              {update.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      {!filtered.length && <StaffEmpty />}
      <StaffPagination {...pagination} onPage={setPage} />
    </div>
  );
}

function ReportQueue({ data, reload, setMessage }: ContentProps) {
  const reports = ((data.reports as JsonRecord[] | undefined) ?? []).filter(
    (item) => item.status !== "resolved",
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(
    () =>
      Math.floor(
        Math.max(
          0,
          reports.findIndex((item) => item.id === requestedRecord()),
        ) / 10,
      ) + 1,
  );
  const [selectedId, setSelectedId] = useState(requestedRecord);
  const [drafts, setDrafts] = useState<
    Record<string, { decision: string; moderationState: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const filtered = reports.filter(
    (item) =>
      (!status || item.status === status) &&
      (!kind || item.entity_type === kind) &&
      matchesSearch(
        query,
        String(item.reporter_name),
        String(item.details),
        reportReason(item.reason),
        staffEntity(item.entity_type),
        String(item.entity_id),
      ),
  );
  const pagination = paginateRecords(filtered, page, 10);
  const selected =
    pagination.rows.find((item) => item.id === selectedId) ??
    pagination.rows[0];
  const draft = drafts[String(selected?.id)] ?? {
    decision: "",
    moderationState: "none",
  };
  const evidence = (selected?.evidence as JsonRecord | undefined) ?? {};
  function select(id: string) {
    setSelectedId(id);
    setError("");
  }
  function updateDraft(value: Partial<typeof draft>) {
    setDrafts((current) => ({
      ...current,
      [String(selected.id)]: { ...draft, ...value },
    }));
    setError("");
  }
  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!selected || running.current) return;
    const id = String(selected.id);
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await apiAction("/api/admin", { action: "decide-report", id, ...draft });
      setMessage("Şikâyet sonuçlandırıldı ve seçilen işlem kaydedildi.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await reload();
      setSelectedId("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>İNCELEME MASASI</span>
          <h2>{reports.length} bekleyen kayıt yüklendi</h2>
          <p>
            Listeden bir kayıt seç; kanıtı ve önceki itirazı okuyarak kararını
            yaz.
          </p>
        </div>
        <b className={styles.warnBadge}>
          {reports.filter((item) => item.status === "appealed").length} itiraz
        </b>
      </section>
      <StaffFilters
        disabled={busy}
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="Şikâyet, gerekçe, kişi veya kayıt ara"
        count={filtered.length}
        total={reports.length}
        onReset={
          query || status || kind
            ? () => {
                setQuery("");
                setStatus("");
                setKind("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          Durum
          <select
            disabled={busy}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Açık ve itiraz</option>
            <option value="appealed">Yalnızca itirazlar</option>
            <option value="open">İlk inceleme</option>
          </select>
        </label>
        <label>
          İçerik türü
          <select
            disabled={busy}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm türler</option>
            {[...new Set(reports.map((item) => String(item.entity_type)))].map(
              (value) => (
                <option key={value} value={value}>
                  {staffEntity(value)}
                </option>
              ),
            )}
          </select>
        </label>
      </StaffFilters>
      {selected ? (
        <div className={styles.reviewLayout}>
          <section
            className={styles.reviewQueue}
            aria-label="Şikâyet kayıtları"
          >
            {pagination.rows.map((report) => (
              <button
                key={String(report.id)}
                type="button"
                disabled={busy}
                aria-pressed={selected.id === report.id}
                className={
                  selected.id === report.id ? styles.selectedReport : ""
                }
                onClick={() => select(String(report.id))}
              >
                <span>
                  <b
                    className={
                      report.status === "appealed"
                        ? styles.badBadge
                        : styles.warnBadge
                    }
                  >
                    {staffStatus(report.status)}
                  </b>
                  <small>{staffEntity(report.entity_type)}</small>
                </span>
                <strong>{reportReason(report.reason)}</strong>
                <p>{String(report.reporter_name)}</p>
                <small>{formatDate(report.created_at)}</small>
              </button>
            ))}
            <StaffPagination
              {...pagination}
              onPage={(next) => {
                if (!busy) {
                  setPage(next);
                  setSelectedId("");
                }
              }}
            />
          </section>
          <article className={styles.reviewDetail}>
            <header>
              <div>
                <span>{staffEntity(selected.entity_type)} / İNCELEME</span>
                <h2>{reportReason(selected.reason)}</h2>
              </div>
              <b
                className={
                  selected.status === "appealed"
                    ? styles.badBadge
                    : styles.warnBadge
                }
              >
                {staffStatus(selected.status)}
              </b>
            </header>
            <dl className={styles.detailMeta}>
              <div>
                <dt>Bildiren</dt>
                <dd>{String(selected.reporter_name)}</dd>
              </div>
              <div>
                <dt>Bildirim tarihi</dt>
                <dd>{formatDate(selected.created_at)}</dd>
              </div>
            </dl>
            <section>
              <h3>Şikâyet açıklaması</h3>
              <p>{String(selected.details || "Ek açıklama verilmedi.")}</p>
            </section>
            {Boolean(selected.appeal_text) && (
              <blockquote>
                <strong>İtiraz açıklaması</strong>
                <p>{String(selected.appeal_text)}</p>
                {Boolean(selected.decision) && (
                  <small>Önceki karar: {String(selected.decision)}</small>
                )}
              </blockquote>
            )}
            <section className={styles.evidence}>
              <span>KAYDEDİLEN KANIT</span>
              <p>{evidenceSummary(evidence)}</p>
              <details>
                <summary>Tüm kanıt alanlarını göster</summary>
                <dl>
                  {Object.entries(evidence).map(([key, value]) => (
                    <div key={key}>
                      <dt>{evidenceLabel(key)}</dt>
                      <dd>
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
              <small>Kayıt: {String(selected.entity_id)}</small>
            </section>
            <form className={styles.decisionForm} onSubmit={decide}>
              <fieldset disabled={busy}>
                <label>
                  Karar gerekçesi
                  <textarea
                    required
                    minLength={5}
                    maxLength={800}
                    value={draft.decision}
                    onChange={(event) =>
                      updateDraft({ decision: event.target.value })
                    }
                    placeholder="İncelemenin sonucunu ve gerekçeni açıkça yaz."
                    rows={4}
                  />
                </label>
                <span className={styles.fieldHint}>
                  {draft.decision.length}/800 · Karar işlem geçmişine
                  kaydedilir.
                </span>
                <label>
                  Uygulanacak işlem
                  <select
                    value={draft.moderationState}
                    onChange={(event) =>
                      updateDraft({ moderationState: event.target.value })
                    }
                  >
                    <option value="none">Yalnızca kararı kaydet</option>
                    {(MODERATABLE_ENTITY_TYPES as readonly string[]).includes(
                      String(selected.entity_type),
                    ) && (
                      <>
                        <option value="hide">
                          {selected.entity_type === "user"
                            ? "Hesabı askıya al"
                            : "İçeriği gizle"}
                        </option>
                        <option value="restore">
                          {selected.entity_type === "user"
                            ? "Hesabı yeniden aç"
                            : "İçeriği geri getir"}
                        </option>
                      </>
                    )}
                  </select>
                </label>
              </fieldset>
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className={styles.primaryAction}
                disabled={busy || draft.decision.trim().length < 5}
              >
                {busy ? "Karar uygulanıyor…" : "Kararı uygula"}
              </button>
            </form>
          </article>
        </div>
      ) : (
        <StaffEmpty
          title={
            reports.length
              ? "Bu filtrede şikâyet yok"
              : "İnceleme kuyruğu tamamlandı"
          }
          detail="Açık şikâyetler ve itirazlar bu alanda görünür."
        />
      )}
    </div>
  );
}

function ContentModeration({ data, reload, setMessage }: ContentProps) {
  const content = (data.content as JsonRecord[] | undefined) ?? [];
  const [query, setQuery] = useState(requestedRecord);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<JsonRecord | null>(null);
  const [reason, setReason] = useState("");
  const filtered = content.filter(
    (item) =>
      (!kind || item.entity_type === kind) &&
      (!status ||
        (status === "visible"
          ? ["active", "published"].includes(String(item.status))
          : !["active", "published"].includes(String(item.status)))) &&
      matchesSearch(
        query,
        String(item.title),
        String(item.review_text ?? ""),
        String(item.owner_name),
        staffEntity(item.entity_type),
        String(item.id),
      ),
  );
  const pagination = paginateRecords(filtered, page);
  const targetActive =
    target && ["active", "published"].includes(String(target.status));
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>İÇERİK MERKEZİ</span>
          <h2>Paylaşımları tek yerden incele.</h2>
          <p>
            Son yüklenen {content.length} kayıt. İşlem gerekçesi yalnızca
            seçtiğin içeriğe uygulanır.
          </p>
        </div>
      </section>
      <StaffFilters
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="İçerik, kişi veya kayıt numarası ara"
        count={filtered.length}
        total={content.length}
        onReset={
          query || kind || status
            ? () => {
                setQuery("");
                setKind("");
                setStatus("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          Tür
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm içerikler</option>
            {[...new Set(content.map((item) => String(item.entity_type)))].map(
              (value) => (
                <option key={value} value={value}>
                  {staffEntity(value)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Görünürlük
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm durumlar</option>
            <option value="visible">Yayında / aktif</option>
            <option value="hidden">Yayın dışı / diğer</option>
          </select>
        </label>
      </StaffFilters>
      <section className={styles.card}>
        <div className={styles.contentRows}>
          {pagination.rows.map((item) => {
            const active = ["active", "published"].includes(
              String(item.status),
            );
            return (
              <article key={`${item.entity_type}-${item.id}`}>
                <span className={styles.entityBadge}>
                  {staffEntity(item.entity_type)}
                </span>
                <div>
                  <h3>{String(item.title || "Başlıksız içerik")}</h3>
                  <p>
                    {String(item.owner_name)} · {formatDate(item.created_at)}
                  </p>
                  <small className={active ? styles.goodText : styles.badText}>
                    {staffStatus(item.status)}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReason("");
                    setTarget(item);
                  }}
                >
                  İncele ve yönet →
                </button>
              </article>
            );
          })}
        </div>
        {!filtered.length && <StaffEmpty />}
        <StaffPagination {...pagination} onPage={setPage} />
      </section>
      {target && (
        <StaffDialog
          title={targetActive ? "İçeriği gizle" : "İçeriği geri getir"}
          description={`${staffEntity(target.entity_type)} · ${String(target.owner_name)}`}
          submitLabel={
            targetActive ? "Gizle ve kaydet" : "Geri getir ve kaydet"
          }
          danger={Boolean(targetActive)}
          onClose={() => setTarget(null)}
          onSubmit={async () => {
            await apiAction("/api/admin", {
              action: "moderate-content",
              entityType: target.entity_type,
              id: target.id,
              state: targetActive ? "hide" : "restore",
              reason,
            });
            setTarget(null);
            setMessage(
              targetActive
                ? "İçerik gizlendi; gerekçesi kaydedildi."
                : "İçerik geri getirildi; gerekçesi kaydedildi.",
            );
            await reload();
          }}
        >
          <div className={styles.targetPreview}>
            <strong>{String(target.title)}</strong>
            {Boolean(target.review_text) &&
              target.review_text !== target.title && (
                <p>{String(target.review_text)}</p>
              )}
            <small>
              {staffStatus(target.status)} · {formatDate(target.created_at)}
            </small>
          </div>
          <label>
            İşlem gerekçesi
            <textarea
              autoFocus
              required
              minLength={5}
              maxLength={500}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Bu işlem neden uygulanıyor?"
            />
          </label>
          <p className={styles.fieldHint}>
            En az 5 karakter. Gerekçe işlem günlüğünde saklanır.
          </p>
        </StaffDialog>
      )}
    </div>
  );
}

function UserModeration({ data, reload, setMessage }: ContentProps) {
  const users = (data.users as JsonRecord[] | undefined) ?? [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [campus, setCampus] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<JsonRecord | null>(null);
  const [reason, setReason] = useState("");
  const filtered = users.filter(
    (item) =>
      (!status || item.status === status) &&
      (!campus ||
        String(item.university_short_name ?? "Eksik profil") === campus) &&
      matchesSearch(
        query,
        String(item.display_name),
        String(item.handle),
        String(item.email),
        String(item.university_short_name),
        String(item.public_id),
      ),
  );
  const pagination = paginateRecords(filtered, page);
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>ÖĞRENCİ HESAPLARI</span>
          <h2>Hesap durumu ve işlem geçmişi.</h2>
          <p>
            Askıya alma işlemi öğrencinin açık oturumlarını kapatır. Gerekçeyi
            seçtiğin hesap üzerinde yaz.
          </p>
        </div>
      </section>
      <StaffFilters
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="Ad, kullanıcı adı, e-posta veya kayıt ara"
        count={filtered.length}
        total={users.length}
        onReset={
          query || status || campus
            ? () => {
                setQuery("");
                setStatus("");
                setCampus("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          Durum
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm hesaplar</option>
            <option value="active">Aktif</option>
            <option value="suspended">Askıda</option>
          </select>
        </label>
        <label>
          Kampüs
          <select
            value={campus}
            onChange={(event) => {
              setCampus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm kampüsler</option>
            {[
              ...new Set(
                users.map((user) =>
                  String(user.university_short_name ?? "Eksik profil"),
                ),
              ),
            ]
              .sort()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
      </StaffFilters>
      <section className={styles.card}>
        <div className={styles.userGrid}>
          {pagination.rows.map((user) => (
            <article key={String(user.public_id)}>
              <header>
                <span className={styles.avatar}>
                  {initials(String(user.display_name))}
                </span>
                <div>
                  <strong>{String(user.display_name)}</strong>
                  <small>
                    @{String(user.handle)} ·{" "}
                    {String(user.university_short_name ?? "Profil eksik")}
                  </small>
                </div>
                <b
                  className={
                    user.status === "active"
                      ? styles.goodBadge
                      : styles.badBadge
                  }
                >
                  {staffStatus(user.status)}
                </b>
              </header>
              <p>{String(user.email)}</p>
              <small>Katılım: {formatDate(user.created_at)}</small>
              {Boolean(user.suspended_reason) && (
                <blockquote>{String(user.suspended_reason)}</blockquote>
              )}
              <footer>
                <span>
                  {number.format(Number(user.report_count ?? 0))} şikâyet
                </span>
                <button
                  type="button"
                  className={
                    user.status === "active"
                      ? styles.dangerButton
                      : styles.successButton
                  }
                  onClick={() => {
                    setReason("");
                    setTarget(user);
                  }}
                >
                  {user.status === "active" ? "Hesabı askıya al" : "Hesabı aç"}
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!filtered.length && <StaffEmpty />}
        <StaffPagination {...pagination} onPage={setPage} />
      </section>
      {target && (
        <StaffDialog
          title={
            target.status === "active"
              ? "Öğrenci hesabını askıya al"
              : "Öğrenci hesabını yeniden aç"
          }
          description={`${String(target.display_name)} (@${String(target.handle)})${target.status === "active" ? " hesabının mevcut oturumları kapatılacak." : " yeniden giriş yapabilecek."}`}
          submitLabel={
            target.status === "active" ? "Hesabı askıya al" : "Hesabı aç"
          }
          danger={target.status === "active"}
          onClose={() => setTarget(null)}
          onSubmit={async () => {
            await apiAction("/api/admin", {
              action: "set-user-status",
              id: target.public_id,
              status: target.status === "suspended" ? "active" : "suspended",
              reason,
            });
            setTarget(null);
            setMessage(
              "Öğrenci hesabı güncellendi; işlem geçmişine kaydedildi.",
            );
            await reload();
          }}
        >
          <label>
            İşlem gerekçesi
            <textarea
              autoFocus
              required
              minLength={5}
              maxLength={500}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Hesap durumunun neden değiştirildiğini yaz."
            />
          </label>
        </StaffDialog>
      )}
    </div>
  );
}

function MetricGrid({
  labels,
  metrics,
}: {
  labels: Record<string, [string, string]>;
  metrics: JsonRecord;
}) {
  return (
    <section className={styles.metricGrid}>
      {Object.entries(labels).map(([key, [label, detail]], index) => (
        <article key={key}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{number.format(Number(metrics[key] ?? 0))}</strong>
          <p>{label}</p>
          <small>{detail}</small>
        </article>
      ))}
    </section>
  );
}
function CardTitle({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <header className={styles.cardTitle}>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <small>{detail}</small>
    </header>
  );
}

function AuditTable({ rows }: { rows: JsonRecord[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [days, setDays] = useState("");
  const [page, setPage] = useState(1);
  const [asOf] = useState(() => Date.now());
  const cutoff = days ? asOf - Number(days) * 86400000 : 0;
  const filtered = rows.filter(
    (row) =>
      (!group || String(row.action).startsWith(group + ".")) &&
      (!days || staffTimestamp(row.created_at) >= cutoff) &&
      matchesSearch(
        query,
        auditAction(row.action),
        String(row.action),
        String(row.actor_name ?? row.actor_username ?? "Sistem"),
        String(row.entity_id ?? ""),
        String(
          auditDetails(row.detail).reason ??
            auditDetails(row.detail).decision ??
            "",
        ),
      ),
  );
  const pagination = paginateRecords(filtered, page, 15);
  function download() {
    const url = URL.createObjectURL(
      new Blob([auditCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `kampira-islem-gunlugu-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.contentStack}>
      <section className={styles.sectionIntro}>
        <div>
          <span>İŞLEM GEÇMİŞİ</span>
          <h2>Kim, neyi, ne zaman değiştirdi?</h2>
          <p>
            Yüklenen kayıtları ara, gerekçelerini incele veya filtrelenmiş
            listeyi indir.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondaryAction}
          disabled={!filtered.length}
          onClick={download}
        >
          ↓ Listeyi indir
        </button>
      </section>
      <StaffFilters
        query={query}
        onQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="İşlem, yetkili, gerekçe veya kayıt ara"
        count={filtered.length}
        total={rows.length}
        onReset={
          query || group || days
            ? () => {
                setQuery("");
                setGroup("");
                setDays("");
                setPage(1);
              }
            : undefined
        }
      >
        <label>
          İşlem alanı
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm işlemler</option>
            <option value="moderation">Moderasyon</option>
            <option value="user">Öğrenci hesapları</option>
            <option value="staff">Yönetim ekibi</option>
            <option value="platform">Platform</option>
          </select>
        </label>
        <label>
          Zaman
          <select
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm tarihler</option>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
          </select>
        </label>
      </StaffFilters>
      <section className={styles.card}>
        <div className={styles.auditList}>
          {pagination.rows.map((row, index) => {
            const detail = auditDetails(row.detail);
            return (
              <article
                key={String(
                  row.id ?? `${row.action}-${pagination.from + index}`,
                )}
              >
                <span>
                  {String(row.action).startsWith("moderation")
                    ? "M"
                    : String(row.action).startsWith("staff")
                      ? "Y"
                      : "P"}
                </span>
                <div>
                  <strong>{auditAction(row.action)}</strong>
                  <p>
                    {String(row.actor_name ?? row.actor_username ?? "Sistem")} ·{" "}
                    {staffEntity(row.entity_type)}
                  </p>
                  {Object.keys(detail).length > 0 && (
                    <details>
                      <summary>İşlem ayrıntıları</summary>
                      <dl>
                        {Object.entries(detail).map(([key, value]) => (
                          <div key={key}>
                            <dt>{evidenceLabel(key)}</dt>
                            <dd>
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value ?? "—")}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                  {Boolean(row.entity_id) && (
                    <small>Kayıt: {String(row.entity_id)}</small>
                  )}
                </div>
                <time>{formatDate(row.created_at)}</time>
              </article>
            );
          })}
        </div>
        {!filtered.length && (
          <StaffEmpty
            title={rows.length ? "Eşleşen işlem yok" : "Henüz işlem kaydı yok"}
          />
        )}
        <StaffPagination {...pagination} onPage={setPage} />
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>;
}
function ConsoleLoading({ inline = false }: { inline?: boolean }) {
  return (
    <div className={inline ? styles.inlineLoading : styles.fullLoading}>
      <span className={styles.brandMark}>ü</span>
      <strong>Yönetim verileri hazırlanıyor…</strong>
    </div>
  );
}
function AccessDenied({ staff }: { staff: Staff }) {
  return (
    <div className={styles.passwordPage}>
      <section className={styles.passwordCard}>
        <span className={styles.securityIcon}>!</span>
        <small>YETKİ SINIRI</small>
        <h1>Owner erişimi gerekli</h1>
        <p>
          {staff.displayName}, bu hesap Admin paneline erişebilir; platform
          ayarları ve admin yönetimi yalnızca owner hesabına açıktır.
        </p>
        <Link className={styles.primaryLink} href="/admin">
          Admin paneline git →
        </Link>
      </section>
    </div>
  );
}

type ContentProps = {
  tab?: string;
  data: JsonRecord;
  reload: () => Promise<void>;
  setMessage: (value: string) => void;
  onNavigate?: (tab: string, record?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
async function apiAction(url: string, body: JsonRecord) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok)
    throw new Error(String(payload.error ?? "İşlem tamamlanamadı."));
  return payload;
}
async function signOut(setStaff: (staff: Staff | null) => void) {
  const response = await fetch("/api/staff/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error("Oturum kapatılamadı. Yeniden deneyebilirsin.");
  setStaff(null);
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}
function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
}
function formatDate(value: unknown) {
  const parsed = new Date(staffTimestamp(value));
  return Number.isNaN(parsed.getTime()) ? "-" : dateTime.format(parsed);
}
function formatUpdateDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : updateDateTime.format(parsed);
}
function evidenceSummary(evidence: JsonRecord) {
  return String(
    evidence.content ??
      evidence.body ??
      evidence.title ??
      evidence.name ??
      evidence.description ??
      evidence.item_name ??
      evidence.display_name ??
      "Kanıt kaydının alanlarını aşağıdan inceleyebilirsin.",
  );
}
function evidenceLabel(key: string) {
  const labels: Record<string, string> = {
    content: "İçerik",
    body: "Mesaj",
    title: "Başlık",
    name: "Ad",
    description: "Açıklama",
    display_name: "Görünen ad",
    displayName: "Görünen ad",
    created_at: "Oluşturulma",
    username: "Kullanıcı adı",
    status: "Durum",
    reason: "Gerekçe",
    decision: "Karar",
    moderationState: "İçerik işlemi",
    entityType: "Kayıt türü",
    entityId: "Kayıt kimliği",
    id: "Kimlik",
    settings: "Ayarlar",
    before: "Önce",
    after: "Sonra",
    author_email: "Yazar",
    owner_email: "İçerik sahibi",
    sender_email: "Gönderen",
    message: "Mesaj",
  };
  return labels[key] ?? key;
}

function requestedRecord() {
  return typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("record") ?? "");
}

function StaffNavIcon({ section }: { section: string }) {
  const icons = {
    overview: House,
    admins: Users,
    settings: Gear,
    audit: ClockCounterClockwise,
    updates: Sparkle,
    reports: Flag,
    content: SquaresFour,
    users: Users,
    decisions: ClockCounterClockwise,
  };
  const Icon = icons[section as keyof typeof icons] ?? House;
  return <Icon size={19} aria-hidden="true" />;
}
