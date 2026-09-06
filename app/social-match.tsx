"use client";

import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { FormEvent, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";

type SocialProfile = {
  interests: string[];
  intents: string[];
  bio: string;
  availability: string;
  discoverable: boolean;
  configured: boolean;
};

type Match = {
  publicId: string;
  displayName: string;
  handle: string;
  facultyShortName: string;
  departmentName: string;
  classYear: number;
  interests: string[];
  intents: string[];
  sharedInterests: string[];
  sharedIntents: string[];
  availability: string;
  bio: string;
  score: number;
  reasons: string[];
};

type Meetup = {
  id: string;
  direction: "incoming" | "outgoing";
  otherPublicId: string;
  otherName: string;
  activity: string;
  message: string;
  proposedTime: string | null;
  campusPlace: string;
  status: string;
  expiresAt: string;
  time: string;
};


import { useAppLayer } from "./use-app-layer";
import { AppLink, useAppNavigation } from "./app-navigation";
import { useWorkspaceState } from "./use-workspace-state";
import { useWorkspaceDrafts } from "./use-workspace-drafts";
import layerStyles from "./workspace-layer.module.css";
import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty } from "./workspace-ui";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { matchesSearch, meetupHref } from "../lib/workspace-navigation";
import { clearContentTarget, useContentTarget } from "./use-content-target";
import { useScopedRequests } from "./use-scoped-requests";
import { Button, IconButton, InlineError, Skeleton } from "./ui-primitives";
import { UiIcon } from "./ui-icon";
import detailStyles from "./meetup-target.module.css";

type SocialResponse = { profile?: SocialProfile; matches?: Match[]; requests?: Meetup[]; error?: string };
type Tab = "matches" | "requests" | "settings";

const interestOptions = [
  ["music", "Müzik"], ["cinema", "Sinema"], ["books", "Kitap"], ["gaming", "Oyun"],
  ["technology", "Teknoloji"], ["art", "Sanat"], ["photography", "Fotoğraf"], ["travel", "Gezi"],
  ["volunteering", "Gönüllülük"], ["entrepreneurship", "Girişimcilik"], ["languages", "Diller"],
  ["nature", "Doğa"], ["food", "Yeme-içme"], ["sports", "Spor"], ["fitness", "Fitness"], ["study", "Ders çalışma"],
] as const;

const intentOptions = [
  ["study", "Birlikte çalışmak"], ["coffee", "Kahve içmek"], ["meal", "Yemek yemek"], ["walk", "Yürüyüş"],
  ["sports", "Spor yapmak"], ["event", "Etkinliğe gitmek"], ["project", "Proje üretmek"], ["gaming", "Oyun oynamak"],
] as const;

const interestNames = Object.fromEntries(interestOptions) as Record<string, string>;
const intentNames = Object.fromEntries(intentOptions) as Record<string, string>;
const availabilityNames: Record<string, string> = { now: "Şimdi müsait", today: "Bugün müsait", week: "Bu hafta müsait", "not-looking": "Şu an aramıyorum" };
const statusNames: Record<string, string> = { pending: "Yanıt bekliyor", accepted: "Kabul edildi", declined: "Reddedildi", cancelled: "İptal edildi", expired: "Süresi doldu" };

async function readJson(response: Response) {
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "İşlem tamamlanamadı.");
  return data;
}

function formatMeetupTime(value: string | null) {
  if (!value) return "Zaman daha sonra kararlaştırılacak";
  if (!Number.isFinite(Date.parse(value))) return "Zaman belirtilmedi";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMeetupAge(value: string) {
  return value === "şimdi" ? "Şimdi" : `${value} önce`;
}

export function SocialMatchWorkspace({ universityShortName }: { universityShortName: string }) {
  const ownerScope = useAppNavigation()?.ownerScope ?? "";
  return <SocialMatchSession key={ownerScope} universityShortName={universityShortName}/>;
}

const subscribeLocation = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };
const locationSearch = () => window.location.search;
const serverSearch = () => "";

function SocialMatchSession({ universityShortName }: { universityShortName: string }) {
  const fetch = useAuthenticatedFetch();
  const targetId = useContentTarget("meetup", "match");
  const targetSearch = useSyncExternalStore(subscribeLocation, locationSearch, serverSearch);
  const targetParams = new URLSearchParams(targetSearch);
  const targetPresent = targetParams.get("view") === "match" && targetParams.has("meetup");
  const targetValid = /^[A-Za-z0-9_-]{1,80}$/.test(targetId) && targetParams.getAll("meetup").length === 1 && targetParams.get("meetup") === targetId;
  const [query, setQuery] = useWorkspaceState("match:query", "");
  const [intentFilter, setIntentFilter] = useWorkspaceState("match:intentFilter", "");
  const [availableNow, setAvailableNow] = useWorkspaceState("match:availableNow", false);
  const [pendingOnly, setPendingOnly] = useWorkspaceState("match:pendingOnly", false);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [requests, setRequests] = useState<Meetup[]>([]);
  const [tab, setTab] = useWorkspaceState<Tab>("match:tab", "matches");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requesting, setRequesting] = useState<Match | null>(null);
  const [reporting, setReporting] = useState<Meetup | null>(null);
  const [preferences, setPreferences] = useWorkspaceState<Omit<SocialProfile, "configured"> | null>("match:preferences", null);
  const preferenceValues = preferences ?? profile ?? { interests: [], intents: [], bio: "", availability: "week", discoverable: true };
  const { interests: selectedInterests, intents: selectedIntents, bio, availability, discoverable } = preferenceValues;
  const changePreferences = (changes: Partial<Omit<SocialProfile, "configured">>) => setPreferences((current) => ({ ...preferenceValues, ...current, ...changes }));
  const setSelectedInterests = (interests: string[]) => changePreferences({ interests });
  const setSelectedIntents = (intents: string[]) => changePreferences({ intents });
  const setBio = (value: string) => changePreferences({ bio: value });
  const setAvailability = (value: string) => changePreferences({ availability: value });
  const setDiscoverable = (value: boolean) => changePreferences({ discoverable: value });
  const draft = useWorkspaceDrafts("match:forms");
  const lastRequest = useRef<Match | null>(null);
  const lastReport = useRef<Meetup | null>(null);
  const showRequest = Boolean(requesting) && !targetPresent;
  const showReport = Boolean(reporting) && (!targetPresent || reporting?.id === targetId);
  const { ref: requestDialogRef, close: closeRequest } = useAppLayer({ id: "match.request", open: showRequest, busy, onClose: () => { lastRequest.current = requesting; setRequesting(null); }, onRestore: () => setRequesting(lastRequest.current) });
  const { ref: reportDialogRef, close: closeReport } = useAppLayer({ id: "match.report", open: showReport, busy, onClose: () => { lastReport.current = reporting; setReporting(null); }, onRestore: () => setReporting(lastReport.current) });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await readJson(await fetch("/api/social-match", { headers: { accept: "application/json" } })) as SocialResponse;
      const nextProfile = data.profile ?? null;
      setProfile(nextProfile);
      setMatches(data.matches ?? []);
      setRequests(data.requests ?? []);
      if (nextProfile) {
        if (!nextProfile.configured) setTab("settings");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Eşleşmeler getirilemedi.");
    } finally {
      setLoading(false);
    }
  }, [fetch, setTab]);

  useEffect(() => {
    let active = true;
    void fetch("/api/social-match", { headers: { accept: "application/json" } }).then(readJson).then((result) => {
      if (!active) return;
      const data = result as SocialResponse;
      const nextProfile = data.profile ?? null;
      setProfile(nextProfile);
      setMatches(data.matches ?? []);
      setRequests(data.requests ?? []);
      if (nextProfile) {
        if (!nextProfile.configured) setTab("settings");
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Eşleşmeler getirilemedi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetch, setTab]);

  function toggle(value: string, current: string[], update: (values: string[]) => void, limit: number) {
    if (current.includes(value)) update(current.filter((item) => item !== value));
    else if (current.length < limit) update([...current, value]);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await readJson(await fetch("/api/social-match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-profile", interests: selectedInterests, intents: selectedIntents, bio, availability, discoverable }),
      }));
      setPreferences(null);
      setNotice("Sosyalleşme tercihlerin kaydedildi.");
      await load();
      setTab("matches");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tercihler kaydedilemedi.");
    } finally { setBusy(false); }
  }

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requesting || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await readJson(await fetch("/api/social-match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", targetPublicId: requesting.publicId, activity: form.get("activity"), message: form.get("message"), proposedTime: form.get("proposedTime"), campusPlace: form.get("campusPlace") }),
      }));
      draft.clear(`request:${requesting.publicId}`);
      setRequesting(null);
      setNotice("Buluşma isteğin gönderildi. İletişim bilgilerini yalnızca güvendiğin kişilerle paylaş.");
      setTab("requests");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Buluşma isteği gönderilemedi.");
    } finally { setBusy(false); }
  }

  async function decide(item: Meetup, decision: "accepted" | "declined" | "cancelled") {
    setBusy(true);
    setError("");
    try {
      await readJson(await fetch("/api/social-match", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, decision }),
      }));
      setNotice(decision === "accepted" ? "Buluşma isteğini kabul ettin. Kalabalık ve güvenli bir kampüs noktası seç." : "Buluşma isteği güncellendi.");
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Buluşma isteği güncellenemedi.");
    } finally { setBusy(false); }
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reporting || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await readJson(await fetch("/api/safety", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "report", entityType: "meetup", entityId: reporting.id, reason: form.get("reason"), details: form.get("details") }),
      }));
      draft.clear(`report:${reporting.id}`);
      setReporting(null);
      setNotice("Buluşma isteği güvenlik ekibinin inceleme kuyruğuna alındı.");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Şikâyet gönderilemedi.");
    } finally { setBusy(false); }
  }

  const visibleMatches = matches.filter((match) => matchesSearch(query, match.displayName, match.departmentName, match.bio) && (!intentFilter || match.sharedIntents.includes(intentFilter)) && (!availableNow || ["now", "today"].includes(match.availability)));
  const visibleRequests = requests.filter((item) => matchesSearch(query, item.otherName, item.message, item.campusPlace) && (!pendingOnly || item.status === "pending"));
  return <div className="workspace-view social-workspace">
    <WorkspaceHeader screenId="match" section="Eşleş" eyebrow={universityShortName} title="Eşleş" description="Ortak ilgi alanlarından bir sohbet başlat. Çalışma, kahve ve etkinlik için kampüsünden insanlarla tanış." primaryAction={{ id: "match.preferences", label: "Tercihlerim", icon: <SlidersHorizontal size={22}/>, onPress: () => setTab("settings") }} secondaryActions={[{ id: "match.refresh", label: "İçeriği yenile", busy: loading, onPress: load }]}/>

    <nav className="social-tabs" aria-label="Sosyalleşme bölümleri">
      <button className={tab === "matches" ? "active" : ""} type="button" onClick={() => setTab("matches")}><strong>Eşleşmeler</strong><small>{matches.length} öğrenci</small></button>
      <button className={tab === "requests" ? "active" : ""} type="button" onClick={() => setTab("requests")}><strong>Buluşma istekleri</strong><small>{requests.filter((item) => item.status === "pending").length} açık</small></button>
      <button className={tab === "settings" ? "active" : ""} type="button" onClick={() => setTab("settings")}><strong>Ayarlar</strong><small>Görünürlük ve ilgi alanları</small></button>
    </nav>

    {tab !== "settings" && <WorkspaceSearch value={query} onChange={setQuery} placeholder={tab === "matches" ? "İsim, bölüm veya tanıtımda ara" : "Buluşma isteklerinde ara"} resultCount={loading ? undefined : tab === "matches" ? visibleMatches.length : visibleRequests.length} onReset={query || intentFilter || availableNow || pendingOnly ? () => { setQuery(""); setIntentFilter(""); setAvailableNow(false); setPendingOnly(false); } : undefined}>{tab === "matches" ? <><label><span className="sr-only">Buluşma amacı</span><select value={intentFilter} onChange={(event) => setIntentFilter(event.target.value)}><option value="">Tüm buluşmalar</option>{intentOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={availableNow} onChange={(event) => setAvailableNow(event.target.checked)}/>Bugün müsait</label></> : <label><input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)}/>Yanıt bekleyenler</label>}</WorkspaceSearch>}
    {!loading && ((tab === "matches" && matches.length > 0 && visibleMatches.length === 0) || (tab === "requests" && requests.length > 0 && visibleRequests.length === 0)) && <WorkspaceEmpty/>}
    {notice && <p className="social-notice" role="status">{notice}</p>}
    {error && <p className="feature-feedback-state" role="alert">{error}</p>}
    {loading ? <div className="social-empty"><strong>Kampüs eşleşmeleri hazırlanıyor…</strong></div> : tab === "settings" ? <form className="social-settings" onSubmit={saveProfile}>
      <section><div className="social-section-heading"><div><span>1</span><h2>İlgi alanların</h2></div><small>En az 2, en fazla 12 seçim</small></div><div className="social-chip-grid">{interestOptions.map(([value, label]) => <button className={selectedInterests.includes(value) ? "active" : ""} type="button" aria-pressed={selectedInterests.includes(value)} key={value} onClick={() => toggle(value, selectedInterests, setSelectedInterests, 12)}>{label}</button>)}</div></section>
      <section><div className="social-section-heading"><div><span>2</span><h2>Ne yapmak istersin?</h2></div><small>En fazla 4 seçim</small></div><div className="social-chip-grid">{intentOptions.map(([value, label]) => <button className={selectedIntents.includes(value) ? "active" : ""} type="button" aria-pressed={selectedIntents.includes(value)} key={value} onClick={() => toggle(value, selectedIntents, setSelectedIntents, 4)}>{label}</button>)}</div></section>
      <section className="social-settings-fields"><label>Kısaca kendinden bahset<textarea maxLength={240} rows={4} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Örn. Kampüste yeni insanlarla tanışıp birlikte fotoğraf yürüyüşleri yapmak istiyorum."/></label><label>Müsaitlik<select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="now">Şimdi müsaitim</option><option value="today">Bugün müsaitim</option><option value="week">Bu hafta müsaitim</option><option value="not-looking">Şu an buluşma aramıyorum</option></select></label><label className="social-discoverable"><input type="checkbox" checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)}/><span><strong>Eşleşmelerde görünür ol</strong><small>Kapattığında mevcut isteklerin kalır, yeni eşleşmelerde gösterilmezsin.</small></span></label></section>
      <footer><p>Telefon numaran ve e-posta adresin eşleşmelere gösterilmez.</p><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Tercihleri kaydet"}</button></footer>
    </form> : tab === "matches" ? (!profile?.configured ? <div className="social-empty"><span>BAŞLAMAK İÇİN</span><strong>Önce ilgi alanlarını seç</strong><p>Eşleşmeleri açıklayabilmemiz için en az iki ilgi alanı ve bir buluşma niyeti seçmelisin.</p><button type="button" onClick={() => setTab("settings")}>Tercihleri oluştur</button></div> : matches.length === 0 ? <div className="social-empty"><span>{discoverable ? "KAMPÜSÜN" : "GİZLİ PROFİL"}</span><strong>{discoverable ? "Henüz uygun eşleşme yok" : "Eşleşme profilin görünür değil"}</strong><p>{discoverable ? "Yeni öğrenciler tercihlerini ekledikçe burada görünecekler." : "Ayarlarından görünürlüğünü açarak eşleşmeye başlayabilirsin."}</p></div> : <div className="social-match-grid">{visibleMatches.map((match) => <article className="social-match-card" key={match.publicId}>
      <header><span className="social-avatar">{match.displayName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><div><AppLink href={`/?profile=${encodeURIComponent(match.publicId)}`}>{match.displayName}</AppLink><small>{match.departmentName} · {match.classYear}. sınıf</small></div><b><strong>%{match.score}</strong><small>uyum</small></b></header>
      <p>{match.bio || "Henüz kısa bir tanıtım eklememiş."}</p><div className="social-reasons">{match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div><div className="social-shared">{match.sharedInterests.slice(0, 5).map((item) => <b key={item}>{interestNames[item] ?? item}</b>)}</div>
      <footer><span className={`social-availability ${match.availability}`}>{availabilityNames[match.availability] ?? match.availability}</span><button type="button" disabled={busy || match.availability === "not-looking"} onClick={() => { setRequesting(match); setError(""); }}>Buluşma isteği</button></footer>
    </article>)}</div>) : requests.length === 0 ? <div className="social-empty"><span>BULUŞMALAR</span><strong>Henüz buluşma isteğin yok</strong><p>Bir eşleşmeye güvenli ve kısa bir kampüs buluşması önerebilirsin.</p><button type="button" onClick={() => setTab("matches")}>Eşleşmeleri gör</button></div> : <div className="meetup-list">{visibleRequests.map((item) => <article className={`meetup-card status-${item.status}`} key={item.id}>
      <header><div><span>{item.direction === "incoming" ? "GELEN İSTEK" : "GÖNDERDİĞİN İSTEK"}</span><AppLink href={`/?profile=${encodeURIComponent(item.otherPublicId)}`}>{item.otherName}</AppLink></div><b>{statusNames[item.status] ?? item.status}</b></header><h3>{intentNames[item.activity] ?? item.activity}</h3><p>{item.message}</p><dl><div><dt>Zaman</dt><dd>{formatMeetupTime(item.proposedTime)}</dd></div><div><dt>Yer</dt><dd>{item.campusPlace || "Birlikte kararlaştırılacak"}</dd></div></dl>
      <footer className={detailStyles.listFooter}><small>{formatMeetupAge(item.time)}</small><div className={detailStyles.listActions}><AppLink className={detailStyles.listLink} href={meetupHref(item.id)}>Ayrıntıyı aç</AppLink>{item.status === "pending" && item.direction === "incoming" && <><button type="button" disabled={busy} onClick={() => void decide(item, "declined")}>Reddet</button><button className="accept" type="button" disabled={busy} onClick={() => void decide(item, "accepted")}>Kabul et</button></>}{item.status === "pending" && item.direction === "outgoing" && <button type="button" disabled={busy} onClick={() => void decide(item, "cancelled")}>İptal et</button>}<button type="button" onClick={() => setReporting(item)}>Şikâyet</button></div></footer>
    </article>)}</div>}

    {targetPresent && <MeetupTarget key={targetSearch} id={targetId} valid={targetValid} search={targetSearch}
      onCanonical={(item) => setRequests((current) => current.map((existing) => existing.id === item.id ? item : existing))}
      onReport={(item) => { setError(""); setReporting(item); }}/>}

    {showRequest && requesting && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRequest(); }}><section ref={requestDialogRef} className={`feature-dialog social-dialog ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="meetup-title"><header><div><span>GÜVENLİ BULUŞMA</span><h2 id="meetup-title">{requesting.displayName} ile buluş</h2></div><button type="button" onClick={closeRequest} disabled={busy} aria-label="Pencereyi kapat">×</button></header><form onSubmit={sendRequest}>{error && <p role="alert" className="feature-feedback-state">{error}</p>}<label>Ne yapmak istersin?<select name="activity" {...draft.field(`request:${requesting.publicId}`, "activity", requesting.sharedIntents[0] ?? "coffee")} disabled={busy}>{intentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Mesaj<textarea name="message" {...draft.field(`request:${requesting.publicId}`, "message")} disabled={busy} minLength={8} maxLength={400} rows={4} required placeholder="Kendini tanıt ve neden buluşmak istediğini kısaca anlat."/></label><div className="social-form-row"><label>Önerilen zaman<input name="proposedTime" {...draft.field(`request:${requesting.publicId}`, "proposedTime")} disabled={busy} type="datetime-local"/></label><label>Kampüste yer<input name="campusPlace" {...draft.field(`request:${requesting.publicId}`, "campusPlace")} disabled={busy} maxLength={80} placeholder="Örn. Merkez kütüphane girişi"/></label></div><p className="social-safety-note"><strong>İlk buluşma için kalabalık bir kampüs alanı seç.</strong> Ev adresi, parola veya ödeme bilgisi paylaşma; rahatsız olduğunda isteği şikâyet edebilirsin.</p><footer><button type="button" onClick={closeRequest} disabled={busy}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "İsteği gönder"}</button></footer></form></section></div>}

    {showReport && reporting && <div className="feature-overlay" role="presentation"><section ref={reportDialogRef} className={`feature-dialog social-dialog ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="meetup-report-title"><header><div><span>GÜVENLİK MERKEZİ</span><h2 id="meetup-report-title">Buluşma isteğini şikâyet et</h2></div><button type="button" onClick={closeReport} disabled={busy} aria-label="Pencereyi kapat">×</button></header><form onSubmit={report}>{error && <p role="alert" className="feature-feedback-state">{error}</p>}<label>Neden<select name="reason" {...draft.field(`report:${reporting.id}`, "reason", "harassment")} disabled={busy}><option value="harassment">Taciz veya baskı</option><option value="privacy">Kişisel veri talebi</option><option value="spam">Spam</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea name="details" {...draft.field(`report:${reporting.id}`, "details")} disabled={busy} maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label><footer><button type="button" onClick={closeReport} disabled={busy}>Kapat</button><button className="feature-danger" type="submit" disabled={busy}>Şikâyeti gönder</button></footer></form></section></div>}
  </div>;
}

function MeetupTarget({ id, valid, search, onCanonical, onReport }: { id: string; valid: boolean; search: string; onCanonical: (item: Meetup) => void; onReport: (item: Meetup) => void }) {
  const navigation = useAppNavigation();
  const [item, setItem] = useState<Meetup | null>(null);
  const [loading, setLoading] = useState(valid);
  const [error, setError] = useState(valid ? "" : "Buluşma bağlantısı geçerli değil.");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mutation = useRef(false);
  const requests = useScopedRequests({ ownerScope: navigation?.ownerScope ?? "", onSessionExpired: () => {
    setItem(null); setLoading(false); setError("Oturumun sona erdi. Yeniden giriş yapmalısın."); navigation?.onSessionExpired();
  } });
  const acceptCanonical = useEffectEvent(onCanonical);
  const { ref, close } = useAppLayer({ id: `match.target:${id || "unavailable"}`, open: true, history: "route", busy,
    onClose: () => { if (window.location.search === search) clearContentTarget("meetup", id, "match"); } });
  const reload = useCallback(() => {
    if (!valid || mutation.current) return;
    setItem(null); setError(""); setLoading(true); setRevision((value) => value + 1);
  }, [valid]);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    void requests.json<{ request?: Meetup; error?: string }>(`/api/social-match?id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }, "Buluşma isteği getirilemedi.")
      .then((data) => {
        if (controller.signal.aborted || !requests.isActive()) return;
        if (!data?.request || data.request.id !== id || !["incoming", "outgoing"].includes(data.request.direction) || !statusNames[data.request.status]) throw new Error("Buluşma isteği getirilemedi.");
        setItem(data.request); acceptCanonical(data.request);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted && requests.isActive()) { setItem(null); setError(cause instanceof Error ? cause.message : "Buluşma isteği getirilemedi."); }
      }).finally(() => { if (!controller.signal.aborted && requests.isActive()) setLoading(false); });
    return () => controller.abort();
  }, [id, valid, revision, requests]);
  useEffect(() => {
    const refreshWhenVisible = () => { if (document.visibilityState !== "hidden") reload(); };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [reload]);

  async function decide(decision: "accepted" | "declined" | "cancelled") {
    if (mutation.current || !requests.isActive() || !item || item.id !== id || item.status !== "pending") return;
    if (item.direction === "incoming" ? decision === "cancelled" : decision !== "cancelled") return;
    mutation.current = true; setBusy(true); setNotice(""); setError("");
    try {
      await requests.json<{ status?: string; error?: string }>("/api/social-match", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision }) }, "Buluşma isteği güncellenemedi.");
      if (requests.isActive()) setNotice("İstek güncellendi. Son durum kontrol ediliyor.");
    } catch {
      if (requests.isActive()) setNotice("İşlem yanıtı alınamadı. Son durum kontrol ediliyor; kararın tekrar gönderilmiyor.");
    } finally {
      mutation.current = false;
      if (requests.isActive()) { setBusy(false); reload(); }
    }
  }

  const current = item?.id === id ? item : null;
  return <div className={detailStyles.overlay} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={ref} className={detailStyles.dialog} role="dialog" aria-modal="true" aria-labelledby="meetup-detail-title" tabIndex={-1}
      data-meetup-id={valid ? id : undefined} data-state={loading ? "loading" : current ? "ready" : "unavailable"} data-mobile-overlay="true">
      <header className={detailStyles.header}><h2 id="meetup-detail-title">Buluşma isteği</h2><IconButton label="Buluşma ayrıntısını kapat" disabled={busy} onClick={close}><UiIcon name="close"/></IconButton></header>
      <div className={detailStyles.body}>
        {notice && <p className={detailStyles.notice} role="status">{notice}</p>}
        {error ? <InlineError message={error} onRetry={valid ? reload : undefined} retryLabel="Durumu yenile"/> : loading ? <Skeleton label="Buluşma isteği yükleniyor" shape="card"/> : current && <>
          <div className={detailStyles.person}><span>{current.direction === "incoming" ? "Gelen istek" : "Gönderdiğin istek"}</span><AppLink href={`/?profile=${encodeURIComponent(current.otherPublicId)}`}>{current.otherName}</AppLink><strong className={detailStyles.status} data-status={current.status}>{statusNames[current.status]}</strong></div>
          <h3 className={detailStyles.activity}>{intentNames[current.activity] ?? current.activity}</h3><p className={detailStyles.message}>{current.message}</p>
          <dl className={detailStyles.details}><div><dt><UiIcon name="calendar"/>Zaman</dt><dd>{formatMeetupTime(current.proposedTime)}</dd></div><div><dt><UiIcon name="map"/>Kampüste yer</dt><dd>{current.campusPlace || "Birlikte kararlaştırılacak"}</dd></div></dl>
          {current.status === "pending" && <p className={detailStyles.safety}><UiIcon name="shield"/>İlk buluşma için kalabalık bir kampüs alanı seç.</p>}
          <small className={detailStyles.timestamp}>{formatMeetupAge(current.time)}</small>
        </>}
      </div>
      {current && !loading && !error && <footer className={detailStyles.actions}>
        <Button tone="quiet" disabled={busy} onClick={() => onReport(current)}><UiIcon name="flag"/>Şikâyet</Button>
        {current.status === "pending" && (current.direction === "incoming" ? <><Button disabled={busy} onClick={() => void decide("declined")}>Reddet</Button><Button tone="primary" disabled={busy} onClick={() => void decide("accepted")}>Kabul et</Button></> : <Button disabled={busy} onClick={() => void decide("cancelled")}>İptal et</Button>)}
      </footer>}
    </section>
  </div>;
}
