"use client";
import { AppLink } from "./app-navigation";
import { CampusContentDetail } from "./campus-content-detail";
import { campusEventHref } from "../lib/workspace-navigation";

import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { WorkspaceHeader, WorkspaceSearch } from "./workspace-ui";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { CalendarDots } from "@phosphor-icons/react/dist/csr/CalendarDots";
import { useAppLayer } from "./use-app-layer";
import { useWorkspaceState } from "./use-workspace-state";
import styles from "./campus-guide.module.css";
import { HousingDirectory } from "./housing-directory";
import { HousingCommunity } from "./housing-community";
import { useHousingRequests } from "./use-housing-requests";
import { matchesSearch } from "../lib/workspace-navigation";

type Place = {
  id: string; name: string; category: string; description: string; address: string; latitude: number | null; longitude: number | null;
  coordinatesKnown: boolean; accessibility: string[]; openingHours: string; currentCount: number; needsUpdateCount: number;
  viewerState: string | null; verification: { label: string; time: string | null }; own: boolean; updatedTime: string;
  curated: boolean; campusName: string; distanceMeters: number | null;
  source: { type: "official-university" | "openstreetmap"; label: string; url: string; checkedAt: string; coordinateSource?: { type: "openstreetmap" | "wikidata"; label: string; url: string } | null } | null;
};
type CampusEvent = { id: string; title: string; description: string; category: string; startsAt: string; endsAt: string | null; placeId: string | null; placeName: string | null; own: boolean; time: string };
type Suggestion = Record<string, unknown> & { type: "place" | "event"; day: string; reason: string; id: string; name?: string; title?: string; description?: string; category?: string; startsAt?: string; placeName?: string };
type GuideResponse = { places?: Place[]; events?: CampusEvent[]; suggestion?: Suggestion | null; error?: string };
type Tab = "places" | "events" | "housing" | "daily";
type CreateKind = "place" | "event" | "housing";

function subscribeViewport(change: () => void) {
  const media = window.matchMedia("(max-width: 780px)");
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
const viewportSnapshot = () => window.matchMedia("(max-width: 780px)").matches ? "mobile" : "desktop";
const serverViewportSnapshot = () => "unknown";

const placeCategories = [["area", "Mahalle ve bölgeler"], ["building", "Binalar"], ["library", "Kütüphane"], ["food", "Yeme-içme"], ["study", "Çalışma"], ["sports", "Spor"], ["social", "Sosyal"], ["transport", "Ulaşım"], ["health", "Sağlık"], ["housing", "Yurt & konaklama"], ["other", "Diğer"]] as const;
const eventCategories = [["academic", "Akademik"], ["social", "Sosyal"], ["sports", "Spor"], ["culture", "Kültür-sanat"], ["career", "Kariyer"], ["volunteering", "Gönüllülük"], ["other", "Diğer"]] as const;
const accessibilityOptions = [["step-free", "Basamaksız erişim"], ["elevator", "Asansör"], ["accessible-toilet", "Erişilebilir tuvalet"], ["quiet", "Sessiz alan"], ["power", "Priz"], ["wifi", "Wi-Fi"]] as const;
const placeCategoryNames = Object.fromEntries(placeCategories) as Record<string, string>;
const eventCategoryNames = Object.fromEntries(eventCategories) as Record<string, string>;
const accessibilityNames = Object.fromEntries(accessibilityOptions) as Record<string, string>;

async function readJson(response: Response) {
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "İşlem tamamlanamadı.");
  return data;
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function checkedDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date(`${value}T12:00:00+03:00`));
}

function timeLabel(value: string) {
  return value === "şimdi" ? "şimdi" : `${value} önce`;
}

function mapUrl(place: Place) {
  if (place.latitude === null || place.longitude === null) return "";
  const delta = 0.003;
  const bbox = [place.longitude - delta, place.latitude - delta, place.longitude + delta, place.latitude + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`;
}

function openMapUrl(place: Place) {
  return `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=18/${place.latitude}/${place.longitude}`;
}

export function CampusGuideWorkspace({ universityShortName }: { universityShortName: string }) {
  const fetch = useAuthenticatedFetch();
  const { json: housingJson, capture: captureHousingRequest } = useHousingRequests();
  const creating = useRef(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [createdHousingId, setCreatedHousingId] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [selectedId, setSelectedId] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<CreateKind | null>(null);
  const [drafts, setDrafts] = useWorkspaceState<Record<CreateKind, Record<string, string>>>("campus:create-fields", { place: {}, event: {}, housing: {} });
  const [accessibilityDrafts, setAccessibilityDrafts] = useWorkspaceState<Record<CreateKind, string[]>>("campus:create-features", { place: [], event: [], housing: [] });
  const [detailOpen, setDetailOpen] = useState(false);
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, serverViewportSnapshot);
  const lastDialog = useRef<CreateKind>("place");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const createLayer = useAppLayer({ id: "campus.create", open: dialog !== null, busy, onClose: () => setDialog(null), onRestore: () => setDialog(lastDialog.current) });
  const { ref: detailDialogRef, close: closeDetail } = useAppLayer({ id: "campus.place-detail", open: viewport === "mobile" && detailOpen, onClose: () => setDetailOpen(false), onRestore: () => setDetailOpen(true) });

  const draftField = (kind: CreateKind, name: string, fallback = "") => ({
    value: drafts[kind][name] ?? fallback,
    disabled: busy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setDrafts((current) => ({ ...current, [kind]: { ...current[kind], [name]: value } }));
    },
  });

  function openDialog(kind: CreateKind) {
    if (busy) return;
    lastDialog.current = kind;
    setDialog(kind);
  }

  function openPlace(placeId: string) {
    setSelectedId(placeId);
    if (viewport === "mobile") setDetailOpen(true);
  }

  const applyData = useCallback((data: GuideResponse) => {
    setPlaces(data.places ?? []);
    setEvents(data.events ?? []);
    setSuggestion(data.suggestion ?? null);
    setSelectedId((current) => current || data.places?.find((place) => place.coordinatesKnown)?.id || data.places?.[0]?.id || "");
  }, []);

  const load = useCallback(async () => {
    const check = captureHousingRequest();
    setLoading(true); setError("");
    try { const data = await housingJson<GuideResponse>("/api/campus-guide"); if (check.isCurrent()) applyData(data); }
    catch (loadError) { if (check.isCurrent()) setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }
    finally { if (check.isCurrent()) setLoading(false); }
  }, [applyData, housingJson, captureHousingRequest]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController(), check = captureHousingRequest();
    void housingJson<GuideResponse>("/api/campus-guide", { signal: controller.signal }).then((result) => { if (active && check.isCurrent()) applyData(result); }).catch((loadError: unknown) => { if (active && check.isCurrent()) setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }).finally(() => { if (active && check.isCurrent()) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [applyData, housingJson, captureHousingRequest]);

  const visiblePlaces = useMemo(() => places.filter((place) => (!category || place.category === category) && matchesSearch(query, place.name, place.description, place.address)), [places, query, category]);
  const selected = visiblePlaces.find((place) => place.id === selectedId) ?? visiblePlaces[0] ?? null;
  const communityPlaces = useMemo(() => places.filter((place) => !place.curated), [places]);
  const housingPlaces = useMemo(() => places.filter((place) => place.category === "housing" && !place.curated), [places]);
  const nearbyCampusPlaces = useMemo(() => places.filter((place) => place.category !== "housing" && ["food", "transport", "study", "health", "library"].includes(place.category)).slice(0, 6), [places]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy || creating.current) return;
    creating.current = true;
    const check = captureHousingRequest();
    const submittedKind = dialog;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = submittedKind === "place" || submittedKind === "housing" ? {
        action: "place", name: form.get("name"), category: submittedKind === "housing" ? "housing" : form.get("category"), description: form.get("description"), address: form.get("address"), latitude: form.get("latitude"), longitude: form.get("longitude"), openingHours: form.get("openingHours"), accessibility: accessibilityDrafts[submittedKind],
      } : {
        action: "event", name: form.get("name"), category: form.get("category"), description: form.get("description"), placeId: form.get("placeId"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt"),
      };
      const created = await housingJson<{ place?: { id?: string }; event?: { id?: string } }>("/api/campus-guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!check.isCurrent()) return;
      const id = submittedKind === "event" ? created.event?.id : created.place?.id;
      if (typeof id !== "string" || !id) throw new Error("Kayıt sonucu doğrulanamadı. Güncel listeyi kontrol et.");
      setNotice(submittedKind === "housing" ? "Konaklama kaydı eklendi. Öğrenciler deneyimlerini paylaşabilir." : submittedKind === "place" ? "Kampüs noktası eklendi. İki öğrencinin onayıyla güncel olarak işaretlenecek." : "Etkinlik kampüs takvimine eklendi.");
      if (submittedKind === "housing") { setSelectedId(id); setCreatedHousingId(id); setTab("housing"); }
      setDrafts((current) => ({ ...current, [submittedKind]: {} }));
      setDialog(null);
      setAccessibilityDrafts((current) => ({ ...current, [submittedKind]: [] }));
      await load();
    } catch (createError) { if (check.isCurrent()) setError(createError instanceof Error ? createError.message : "Kayıt oluşturulamadı."); }
    finally { if (check.isCurrent()) { creating.current = false; setBusy(false); } }
  }

  async function update(action: "confirm" | "archive-place" | "archive-event", id: string, state?: "current" | "needs-update") {
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/campus-guide", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id, state }) }));
      setNotice(action === "confirm" ? (state === "current" ? "Güncellik onayın kaydedildi." : "Düzeltme ihtiyacı bildirildi.") : "Kayıt arşivlendi.");
      await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Kampüs kaydı güncellenemedi."); }
    finally { setBusy(false); }
  }

  const placeDetails = selected ? <>
          <header><div><span>{placeCategoryNames[selected.category] ?? selected.category}</span>{viewport === "desktop" && <strong>{selected.name}</strong>}</div><b>{selected.openingHours || "Saat bilgisi yok"}</b></header>
          <div className={styles.placeSummary}><p>{selected.description}</p><p>{selected.address || "Adres bilgisi eklenmedi"}</p>{selected.accessibility.length > 0 && <ul>{selected.accessibility.map((item) => <li key={item}>{accessibilityNames[item] ?? item}</li>)}</ul>}</div>
          {selected.coordinatesKnown ? <><iframe title={`${selected.name} haritası`} loading="lazy" referrerPolicy="no-referrer" src={mapUrl(selected)}/><a href={openMapUrl(selected)} target="_blank" rel="noreferrer">OpenStreetMap&apos;te aç <ArrowUpRight size={16} aria-hidden="true"/></a></> : <div className={styles.mapUnavailable}><MapPin size={22} aria-hidden="true"/><div><strong>Harita konumu henüz eklenmedi</strong><p>{selected.address ? "Yukarıdaki adres bilgisini kullanabilirsin." : "Mekânın adres ve konum bilgisi bekleniyor."}</p></div></div>}
          {(selected.coordinatesKnown || selected.source?.type === "openstreetmap") && <p className="campus-map-attribution">Harita ve açık veri © OpenStreetMap katkıcıları · ODbL</p>}
          {selected.source ? <section className="campus-source-panel"><strong>{selected.source.type === "official-university" ? "Resmî kaynak kaydı" : "Açık harita kaydı"}</strong><p>{checkedDate(selected.source.checkedAt)} tarihinde kontrol edildi{selected.campusName ? ` · ${selected.campusName}` : ""}</p><div><a href={selected.source.url} target="_blank" rel="noreferrer">Kaynağı aç <ArrowUpRight size={16} aria-hidden="true"/></a>{selected.source.coordinateSource && <a href={selected.source.coordinateSource.url} target="_blank" rel="noreferrer">Koordinat kaynağı <ArrowUpRight size={16} aria-hidden="true"/></a>}</div><small>{selected.source.type === "official-university" ? "Adres üniversitenin veya yetkili yükseköğretim kurumunun yayımladığı sayfadan alınmıştır." : "OpenStreetMap topluluk tarafından düzenlenen açık harita verisidir; kurumun resmî onayı anlamına gelmez."}</small></section> : <section><strong>Bu bilgi güncel mi?</strong><p>{selected.currentCount} güncel · {selected.needsUpdateCount} düzeltme istiyor</p><div><button className={selected.viewerState === "current" ? "active" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "current")}>Evet, güncel</button><button className={selected.viewerState === "needs-update" ? "active warning" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "needs-update")}>Düzeltme gerekli</button></div>{selected.own && <button className="campus-archive" type="button" disabled={busy} onClick={() => void update("archive-place", selected.id)}>Mekânı arşivle</button>}</section>}
        </> : null;

  return <div className={`workspace-view campus-guide-workspace ${styles.guide}`}>
    <CampusContentDetail kind="event"/>
    <WorkspaceHeader screenId="campus" section="Kampüs" eyebrow={universityShortName} title="Kampüs rehberi" description="Mekânları, etkinlikleri ve konaklama seçeneklerini keşfet." primaryAction={tab === "daily" ? null : { id: `campus.add-${tab}`, label: tab === "events" ? "Etkinlik ekle" : tab === "housing" ? "Yurt ekle" : "Mekân ekle", icon: <Plus size={22}/>, disabled: busy, onPress: () => openDialog(tab === "events" ? "event" : tab === "housing" ? "housing" : "place") }} secondaryActions={[{ id: "campus.refresh", label: "İçeriği yenile", busy: loading, onPress: load }]}/>
    <nav className="campus-guide-tabs" aria-label="Kampüs rehberi bölümleri"><button className={tab === "places" ? "active" : ""} type="button" onClick={() => setTab("places")}><strong>Mekânlar</strong><small>{places.length} nokta</small></button><button className={tab === "events" ? "active" : ""} type="button" onClick={() => setTab("events")}><strong>Etkinlikler</strong><small>{events.length} yaklaşan</small></button><button className={tab === "housing" ? "active" : ""} type="button" onClick={() => setTab("housing")}><strong>Konaklama</strong><small>Yurt, apart ve oteller</small></button><button className={tab === "daily" ? "active" : ""} type="button" onClick={() => setTab("daily")}><strong>Bugün</strong><small>Her gün yenilenir</small></button></nav>
    {notice && <p className="campus-guide-notice" role="status">{notice}</p>}{error && <p className="feature-feedback-state" role="alert">{error}</p>}
    {tab === "places" && <WorkspaceSearch value={query} onChange={setQuery} placeholder="Mekân, açıklama veya adres ara" resultCount={loading ? undefined : visiblePlaces.length} onReset={query || category ? () => { setQuery(""); setCategory(""); } : undefined}><label><span className="sr-only">Mekân kategorisi</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tüm kategoriler</option>{placeCategories.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label></WorkspaceSearch>}
    {loading ? <div className="campus-guide-empty"><strong>Kampüs rehberi hazırlanıyor…</strong></div> : tab === "places" ? <>
      {visiblePlaces.length === 0 ? <div className="campus-guide-empty"><span>SONUÇ YOK</span><strong>Bu aramayla eşleşen nokta bulunamadı</strong><p>Filtreleri temizleyebilir veya bildiğin gerçek bir kampüs noktasını kaynak ayrıntısıyla ekleyebilirsin.</p><button type="button" onClick={() => openDialog("place")}>Mekân ekle</button></div> : <div className="campus-guide-layout">
        <section className="campus-place-list">{visiblePlaces.map((place) => <article className={selected?.id === place.id ? "active" : ""} key={place.id}>
          <header><div><span>{placeCategoryNames[place.category] ?? place.category}</span><h2>{place.name}</h2></div><b className={place.curated || place.verification.time ? "verified" : ""}>{place.verification.label}</b></header>
          <p>{place.description}</p>
          <small>{place.address || "Adres bilgisi eklenmedi"} · {place.source ? `${checkedDate(place.source.checkedAt)} tarihinde kontrol edildi` : `${timeLabel(place.updatedTime)} güncellendi`}</small>
          <footer><div>{place.campusName && <span>{place.campusName}</span>}{place.accessibility.slice(0, 2).map((item) => <span key={item}>{accessibilityNames[item] ?? item}</span>)}</div><button type="button" onClick={() => openPlace(place.id)}>Ayrıntılar</button></footer>
        </article>)}</section>
        {viewport === "desktop" && <aside className="campus-map-panel" id="campus-map-details" tabIndex={-1} aria-label="Seçilen kampüs noktası">{placeDetails}</aside>}
      </div>}
    </> : tab === "events" ? (events.length === 0 ? <div className="campus-guide-empty"><span>TAKVİM</span><strong>Yaklaşan etkinlik yok</strong><p>Kampüsündeki gerçek bir etkinliği tarih ve açıklamasıyla ekleyebilirsin.</p><button type="button" onClick={() => openDialog("event")}>Etkinlik ekle</button></div> : <div className="campus-event-list">{events.map((item) => <article key={item.id}><time dateTime={item.startsAt}><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(item.startsAt))}</span></time><div><span>{eventCategoryNames[item.category] ?? item.category}</span><h2><AppLink href={campusEventHref(item.id)}>{item.title}</AppLink></h2><p>{item.description}</p><small>{eventTime(item.startsAt)} · {item.placeName || "Mekân belirtilmedi"}</small></div>{item.own && <button type="button" onClick={() => void update("archive-event", item.id)}>Arşivle</button>}</article>)}</div>) : tab === "housing" ? <><HousingDirectory/><HousingCommunity places={housingPlaces} requestedPlaceId={createdHousingId} onAdd={() => openDialog("housing")} onArchived={(id) => setPlaces((current) => current.filter((place) => place.id !== id))} nearbyPlaces={nearbyCampusPlaces} onOpenNearby={(id) => { setQuery(""); setCategory(""); openPlace(id); setTab("places"); }}/></> : suggestion ? <section className="daily-suggestion"><span>BUGÜNÜN KAMPÜS ÖNERİSİ · {suggestion.day}</span><div className="daily-suggestion-icon">{suggestion.type === "event" ? <CalendarDots size={30} aria-hidden="true"/> : <MapPin size={30} aria-hidden="true"/>}</div><small>{suggestion.type === "event" ? eventCategoryNames[String(suggestion.category)] : placeCategoryNames[String(suggestion.category)]}</small><h2>{suggestion.title ?? suggestion.name}</h2><p>{suggestion.description}</p><b>{suggestion.reason}</b>{suggestion.type === "event" && suggestion.startsAt && <time>{eventTime(suggestion.startsAt)}</time>}<button type="button" onClick={() => { if (suggestion.type === "event") setTab("events"); else { setQuery(""); setCategory(""); openPlace(suggestion.id); setTab("places"); } }}>Ayrıntıları gör</button><footer>Aynı gün içinde öneri değişmez; yarın kampüsündeki güncel kayıtlardan yeniden seçilir.</footer></section> : <div className="campus-guide-empty"><span>GÜNLÜK ÖNERİ</span><strong>Öneri oluşturmak için kampüs verisi gerekiyor</strong><p>İlk gerçek mekânı veya etkinliği eklediğinde günlük öneri de çalışmaya başlayacak.</p></div>}

    {viewport === "mobile" && detailOpen && selected && <div className={styles.detailOverlay}>
      <section ref={detailDialogRef} className={styles.detailDialog} role="dialog" aria-modal="true" aria-labelledby="campus-place-detail-title" data-mobile-overlay="true">
        <header className={styles.detailTopbar}><button type="button" aria-label="Mekân listesine dön" onClick={closeDetail}><ArrowLeft size={24}/></button><h2 id="campus-place-detail-title">{selected.name}</h2></header>
        <div className={`campus-map-panel ${styles.detailBody}`}>{error && <p className="feature-feedback-state" role="alert">{error}</p>}{placeDetails}</div>
      </section>
    </div>}

    {(["place", "event", "housing"] as const).map((formType) => <div key={formType} hidden={dialog !== formType} className={`feature-overlay ${styles.formOverlay}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) createLayer.close(); }}><section ref={dialog === formType ? createLayer.ref : undefined} className={`feature-dialog campus-guide-dialog ${styles.formDialog}`} role="dialog" aria-modal="true" aria-labelledby={`campus-${formType}-dialog-title`} data-mobile-overlay={dialog === formType ? true : undefined} data-campus-form={formType}><header><div><span>{formType === "housing" ? "YURT & KONAKLAMA" : formType === "place" ? "KAMPÜS NOKTASI" : "ETKİNLİK TAKVİMİ"}</span><h2 id={`campus-${formType}-dialog-title`}>{formType === "housing" ? "Konaklama ekle" : formType === "place" ? "Mekân ekle" : "Etkinlik ekle"}</h2></div><button type="button" onClick={createLayer.close} disabled={busy} aria-label="Pencereyi kapat">×</button></header><form onSubmit={create}>{error && <p className="feature-feedback-state" role="alert">{error}</p>}<div className="campus-form-row"><label>Ad<input name="name" {...draftField(formType, "name")} minLength={3} maxLength={100} required placeholder={formType === "housing" ? "Örn. Kampüs Öğrenci Yurdu" : formType === "place" ? "Örn. Merkez kütüphane" : "Örn. Bahar fotoğraf yürüyüşü"}/></label>{formType === "housing" ? <label>Tür<input value="Yurt & konaklama" readOnly/></label> : <label>Kategori<select name="category" {...draftField(formType, "category", formType === "place" ? "study" : "social")}>{(formType === "place" ? placeCategories : eventCategories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}</div><label>Açıklama<textarea name="description" {...draftField(formType, "description")} minLength={12} maxLength={700} rows={4} required placeholder={formType === "housing" ? "Yer, ulaşım ve öğrencinin karar vermesine yardımcı olacak bildiğin gerçek ayrıntıları yaz." : "Öğrencinin karar vermesi için doğrulanabilir ayrıntıları yaz."}/></label>{formType === "place" || formType === "housing" ? <><div className="campus-form-row"><label>Adres / kampüs tarifi<input name="address" {...draftField(formType, "address")} maxLength={180} placeholder={formType === "housing" ? "Örn. Kampüs ana kapısına yakın" : "Örn. Mühendislik Fakültesi yanı"}/></label><label>{formType === "housing" ? "Bilinen saat / iletişim notu" : "Çalışma saatleri"}<input name="openingHours" {...draftField(formType, "openingHours")} maxLength={120} placeholder={formType === "housing" ? "Örn. Ziyaret için hafta içi danışma" : "Örn. Hafta içi 08.00–22.00"}/></label></div><div className="campus-form-row"><label>Enlem (isteğe bağlı)<input name="latitude" {...draftField(formType, "latitude")} inputMode="decimal" placeholder="41.368"/></label><label>Boylam (isteğe bağlı)<input name="longitude" {...draftField(formType, "longitude")} inputMode="decimal" placeholder="36.195"/></label></div><fieldset><legend>Özellikler</legend><div className="campus-accessibility">{accessibilityOptions.map(([value, label]) => <button className={accessibilityDrafts[formType].includes(value) ? "active" : ""} type="button" key={value} disabled={busy} aria-pressed={accessibilityDrafts[formType].includes(value)} onClick={() => setAccessibilityDrafts((current) => ({ ...current, [formType]: current[formType].includes(value) ? current[formType].filter((item) => item !== value) : [...current[formType], value] }))}>{label}</button>)}</div></fieldset></> : <><label>Mekân<select name="placeId" {...draftField(formType, "placeId")}><option value="">Mekân belirtilmedi</option>{communityPlaces.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}</select></label>{communityPlaces.length === 0 && <p className="campus-form-hint">Etkinliği katalog kaydına bağlamak yerine mekân adını açıklamaya yazabilirsin.</p>}<div className="campus-form-row"><label>Başlangıç<input name="startsAt" {...draftField(formType, "startsAt")} type="datetime-local" required/></label><label>Bitiş (isteğe bağlı)<input name="endsAt" {...draftField(formType, "endsAt")} type="datetime-local"/></label></div></>}<p className="campus-guide-disclaimer">Yalnız bildiğin gerçek bilgileri ekle. Kişisel adres, telefon veya özel iletişim bilgisi paylaşma.{formType === "housing" ? " Kapora veya ödeme bağlantısı ekleme." : ""}</p><footer><button type="button" onClick={createLayer.close} disabled={busy}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></footer></form></section></div>)}
  </div>;
}
