"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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


import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty, RefreshButton } from "./workspace-ui";
import { matchesSearch } from "../lib/workspace-navigation";

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
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SocialMatchWorkspace({ universityShortName }: { universityShortName: string }) {
  const [query, setQuery] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [availableNow, setAvailableNow] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [requests, setRequests] = useState<Meetup[]>([]);
  const [tab, setTab] = useState<Tab>("matches");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requesting, setRequesting] = useState<Match | null>(null);
  const [reporting, setReporting] = useState<Meetup | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedIntents, setSelectedIntents] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState("week");
  const [discoverable, setDiscoverable] = useState(true);

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
        setSelectedInterests(nextProfile.interests);
        setSelectedIntents(nextProfile.intents);
        setBio(nextProfile.bio);
        setAvailability(nextProfile.availability);
        setDiscoverable(nextProfile.discoverable);
        if (!nextProfile.configured) setTab("settings");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Eşleşmeler getirilemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

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
        setSelectedInterests(nextProfile.interests);
        setSelectedIntents(nextProfile.intents);
        setBio(nextProfile.bio);
        setAvailability(nextProfile.availability);
        setDiscoverable(nextProfile.discoverable);
        if (!nextProfile.configured) setTab("settings");
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Eşleşmeler getirilemedi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
      setNotice("Sosyalleşme tercihlerin kaydedildi.");
      await load();
      setTab("matches");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tercihler kaydedilemedi.");
    } finally { setBusy(false); }
  }

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requesting) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await readJson(await fetch("/api/social-match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", targetPublicId: requesting.publicId, activity: form.get("activity"), message: form.get("message"), proposedTime: form.get("proposedTime"), campusPlace: form.get("campusPlace") }),
      }));
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
    if (!reporting) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await readJson(await fetch("/api/safety", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "report", entityType: "meetup", entityId: reporting.id, reason: form.get("reason"), details: form.get("details") }),
      }));
      setReporting(null);
      setNotice("Buluşma isteği güvenlik ekibinin inceleme kuyruğuna alındı.");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Şikâyet gönderilemedi.");
    } finally { setBusy(false); }
  }

  const visibleMatches = matches.filter((match) => matchesSearch(query, match.displayName, match.departmentName, match.bio) && (!intentFilter || match.sharedIntents.includes(intentFilter)) && (!availableNow || ["now", "today"].includes(match.availability)));
  const visibleRequests = requests.filter((item) => matchesSearch(query, item.otherName, item.message, item.campusPlace) && (!pendingOnly || item.status === "pending"));
  return <div className="workspace-view social-workspace">
    <WorkspaceHeader section="Eşleş" eyebrow={universityShortName} title="Birlikte daha güzel" description="Ortak ilgi alanlarından bir sohbet başlat. Çalışma, kahve ve etkinlik için kampüsünden insanlarla tanış." actions={<><RefreshButton onClick={() => void load()} busy={loading}/><button className="feature-primary" type="button" onClick={() => setTab("settings")}>Tercihlerim</button></>}/>

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
      <header><span className="social-avatar">{match.displayName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><div><a href={`/?profile=${encodeURIComponent(match.publicId)}`}>{match.displayName}</a><small>{match.departmentName} · {match.classYear}. sınıf</small></div><b><strong>%{match.score}</strong><small>uyum</small></b></header>
      <p>{match.bio || "Henüz kısa bir tanıtım eklememiş."}</p><div className="social-reasons">{match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div><div className="social-shared">{match.sharedInterests.slice(0, 5).map((item) => <b key={item}>{interestNames[item] ?? item}</b>)}</div>
      <footer><span className={`social-availability ${match.availability}`}>{availabilityNames[match.availability] ?? match.availability}</span><button type="button" disabled={match.availability === "not-looking"} onClick={() => { setRequesting(match); setError(""); }}>Buluşma isteği</button></footer>
    </article>)}</div>) : requests.length === 0 ? <div className="social-empty"><span>BULUŞMALAR</span><strong>Henüz buluşma isteğin yok</strong><p>Bir eşleşmeye güvenli ve kısa bir kampüs buluşması önerebilirsin.</p><button type="button" onClick={() => setTab("matches")}>Eşleşmeleri gör</button></div> : <div className="meetup-list">{visibleRequests.map((item) => <article className={`meetup-card status-${item.status}`} key={item.id}>
      <header><div><span>{item.direction === "incoming" ? "GELEN İSTEK" : "GÖNDERDİĞİN İSTEK"}</span><a href={`/?profile=${encodeURIComponent(item.otherPublicId)}`}>{item.otherName}</a></div><b>{statusNames[item.status] ?? item.status}</b></header><h3>{intentNames[item.activity] ?? item.activity}</h3><p>{item.message}</p><dl><div><dt>Zaman</dt><dd>{formatMeetupTime(item.proposedTime)}</dd></div><div><dt>Yer</dt><dd>{item.campusPlace || "Birlikte kararlaştırılacak"}</dd></div></dl>
      <footer><small>{item.time} önce</small><div>{item.status === "pending" && item.direction === "incoming" && <><button type="button" disabled={busy} onClick={() => void decide(item, "declined")}>Reddet</button><button className="accept" type="button" disabled={busy} onClick={() => void decide(item, "accepted")}>Kabul et</button></>}{item.status === "pending" && item.direction === "outgoing" && <button type="button" disabled={busy} onClick={() => void decide(item, "cancelled")}>İptal et</button>}<button type="button" onClick={() => setReporting(item)}>Şikâyet</button></div></footer>
    </article>)}</div>}

    {requesting && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRequesting(null); }}><section className="feature-dialog social-dialog" role="dialog" aria-modal="true" aria-labelledby="meetup-title"><header><div><span>GÜVENLİ BULUŞMA</span><h2 id="meetup-title">{requesting.displayName} ile buluş</h2></div><button type="button" onClick={() => setRequesting(null)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={sendRequest}><label>Ne yapmak istersin?<select name="activity" defaultValue={requesting.sharedIntents[0] ?? "coffee"}>{intentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Mesaj<textarea name="message" minLength={8} maxLength={400} rows={4} required placeholder="Kendini tanıt ve neden buluşmak istediğini kısaca anlat."/></label><div className="social-form-row"><label>Önerilen zaman<input name="proposedTime" type="datetime-local"/></label><label>Kampüste yer<input name="campusPlace" maxLength={80} placeholder="Örn. Merkez kütüphane girişi"/></label></div><p className="social-safety-note"><strong>İlk buluşma için kalabalık bir kampüs alanı seç.</strong> Ev adresi, parola veya ödeme bilgisi paylaşma; rahatsız olduğunda isteği şikâyet edebilirsin.</p><footer><button type="button" onClick={() => setRequesting(null)}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "İsteği gönder"}</button></footer></form></section></div>}

    {reporting && <div className="feature-overlay" role="presentation"><section className="feature-dialog social-dialog" role="dialog" aria-modal="true" aria-labelledby="meetup-report-title"><header><div><span>GÜVENLİK MERKEZİ</span><h2 id="meetup-report-title">Buluşma isteğini şikâyet et</h2></div><button type="button" onClick={() => setReporting(null)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={report}><label>Neden<select name="reason" defaultValue="harassment"><option value="harassment">Taciz veya baskı</option><option value="privacy">Kişisel veri talebi</option><option value="spam">Spam</option><option value="other">Diğer</option></select></label><label>Açıklama<textarea name="details" maxLength={800} rows={4} placeholder="İncelemeye yardımcı olacak ayrıntıları yaz."/></label><footer><button type="button" onClick={() => setReporting(null)}>Kapat</button><button className="feature-danger" type="submit" disabled={busy}>Şikâyeti gönder</button></footer></form></section></div>}
  </div>;
}
