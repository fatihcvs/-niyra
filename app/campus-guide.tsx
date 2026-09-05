"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { WorkspaceHeader, WorkspaceSearch, RefreshButton } from "./workspace-ui";
import { HousingDirectory } from "./housing-directory";
import { matchesSearch } from "../lib/workspace-navigation";

type Place = {
  id: string; name: string; category: string; description: string; address: string; latitude: number | null; longitude: number | null;
  coordinatesKnown: boolean; accessibility: string[]; openingHours: string; currentCount: number; needsUpdateCount: number;
  viewerState: string | null; verification: { label: string; time: string | null }; own: boolean; updatedTime: string;
  curated: boolean; campusName: string; distanceMeters: number | null;
  source: { type: "official-university" | "openstreetmap"; label: string; url: string; checkedAt: string; coordinateSource?: { type: "openstreetmap" | "wikidata"; label: string; url: string } | null } | null;
};
type CampusEvent = { id: string; title: string; description: string; category: string; startsAt: string; endsAt: string | null; placeId: string | null; placeName: string | null; own: boolean; time: string };
type HousingMessage = { id: string; content: string; anonymous: boolean; authorName: string; authorHandle: string | null; own: boolean; time: string };
type Suggestion = Record<string, unknown> & { type: "place" | "event"; day: string; reason: string; id: string; name?: string; title?: string; description?: string; category?: string; startsAt?: string; placeName?: string };
type GuideResponse = { places?: Place[]; events?: CampusEvent[]; suggestion?: Suggestion | null; error?: string };
type Tab = "places" | "events" | "housing" | "daily";

const placeCategories = [["building", "Binalar"], ["library", "Kütüphane"], ["food", "Yeme-içme"], ["study", "Çalışma"], ["sports", "Spor"], ["social", "Sosyal"], ["transport", "Ulaşım"], ["health", "Sağlık"], ["housing", "Yurt & konaklama"], ["other", "Diğer"]] as const;
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
  const [places, setPlaces] = useState<Place[]>([]);
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [housingMessages, setHousingMessages] = useState<HousingMessage[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [selectedId, setSelectedId] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"place" | "event" | "housing" | null>(null);
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [housingLoading, setHousingLoading] = useState(false);

  const applyData = useCallback((data: GuideResponse) => {
    setPlaces(data.places ?? []);
    setEvents(data.events ?? []);
    setSuggestion(data.suggestion ?? null);
    setSelectedId((current) => current || data.places?.find((place) => place.coordinatesKnown)?.id || data.places?.[0]?.id || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { applyData(await readJson(await fetch("/api/campus-guide")) as GuideResponse); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }
    finally { setLoading(false); }
  }, [applyData]);

  useEffect(() => {
    let active = true;
    void fetch("/api/campus-guide").then(readJson).then((result) => { if (active) applyData(result as GuideResponse); }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyData]);

  const visiblePlaces = useMemo(() => places.filter((place) => (!category || place.category === category) && matchesSearch(query, place.name, place.description, place.address)), [places, query, category]);
  const selected = visiblePlaces.find((place) => place.id === selectedId) ?? visiblePlaces[0] ?? null;
  const communityPlaces = useMemo(() => places.filter((place) => !place.curated), [places]);
  const housingPlaces = useMemo(() => places.filter((place) => place.category === "housing" && !place.curated), [places]);
  const selectedHousing = useMemo(() => housingPlaces.find((place) => place.id === selectedId) ?? housingPlaces[0] ?? null, [housingPlaces, selectedId]);
  const nearbyCampusPlaces = useMemo(() => places.filter((place) => place.category !== "housing" && ["food", "transport", "study", "health", "library"].includes(place.category)).slice(0, 6), [places]);

  const loadHousingMessages = useCallback(async (placeId: string) => {
    setHousingLoading(true);
    try {
      const data = await readJson(await fetch(`/api/housing?placeId=${encodeURIComponent(placeId)}`)) as { messages?: HousingMessage[] };
      setHousingMessages(data.messages ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Yurt deneyimleri getirilemedi.");
    } finally { setHousingLoading(false); }
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = dialog === "place" || dialog === "housing" ? {
        action: "place", name: form.get("name"), category: dialog === "housing" ? "housing" : form.get("category"), description: form.get("description"), address: form.get("address"), latitude: form.get("latitude"), longitude: form.get("longitude"), openingHours: form.get("openingHours"), accessibility,
      } : {
        action: "event", name: form.get("name"), category: form.get("category"), description: form.get("description"), placeId: form.get("placeId"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt"),
      };
      const created = await readJson(await fetch("/api/campus-guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setNotice(dialog === "housing" ? "Konaklama kaydı eklendi. Öğrenciler deneyimlerini paylaşabilir." : dialog === "place" ? "Kampüs noktası eklendi. İki öğrencinin onayıyla güncel olarak işaretlenecek." : "Etkinlik kampüs takvimine eklendi.");
      if (dialog === "housing") { const place = created.place as { id?: string } | undefined; if (place?.id) setSelectedId(place.id); setTab("housing"); }
      setDialog(null); setAccessibility([]); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Kayıt oluşturulamadı."); }
    finally { setBusy(false); }
  }

  async function shareHousingMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHousing) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError(""); setNotice("");
    try {
      await readJson(await fetch("/api/housing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placeId: selectedHousing.id, content: form.get("content"), anonymous: form.get("anonymous") === "on" }) }));
      formElement.reset();
      setNotice("Deneyimin paylaşıldı.");
      await loadHousingMessages(selectedHousing.id);
    } catch (shareError) { setError(shareError instanceof Error ? shareError.message : "Deneyim paylaşılamadı."); }
    finally { setBusy(false); }
  }

  async function removeHousingMessage(id: string) {
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/housing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }));
      if (selectedHousing) await loadHousingMessages(selectedHousing.id);
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Paylaşım silinemedi."); }
    finally { setBusy(false); }
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

  return <div className="workspace-view campus-guide-workspace">
    <WorkspaceHeader section="Kampüs" eyebrow={universityShortName} title="Kampüs rehberin" description="Mekânları bul, etkinlikleri keşfet ve konaklama deneyimlerini incele. Her noktanın kaynak ve güncellik bilgisi yanında." actions={<><RefreshButton onClick={() => void load()} busy={loading}/><button type="button" onClick={() => setDialog("event")}>Etkinlik ekle</button><button type="button" onClick={() => setDialog("housing")}>Yurt ekle</button><button className="feature-primary" type="button" onClick={() => setDialog("place")}>＋ Mekân ekle</button></>}/>
    <nav className="campus-guide-tabs" aria-label="Kampüs rehberi bölümleri"><button className={tab === "places" ? "active" : ""} type="button" onClick={() => setTab("places")}><strong>Harita ve mekânlar</strong><small>{places.length} nokta</small></button><button className={tab === "events" ? "active" : ""} type="button" onClick={() => setTab("events")}><strong>Etkinlik takvimi</strong><small>{events.length} yaklaşan</small></button><button className={tab === "housing" ? "active" : ""} type="button" onClick={() => { setTab("housing"); if (selectedHousing) void loadHousingMessages(selectedHousing.id); }}><strong>Yurtlar ve konaklama</strong><small>Yurt, apart ve oteller</small></button><button className={tab === "daily" ? "active" : ""} type="button" onClick={() => setTab("daily")}><strong>Bugünün önerisi</strong><small>Her gün yenilenir</small></button></nav>
    {notice && <p className="campus-guide-notice" role="status">{notice}</p>}{error && <p className="feature-feedback-state" role="alert">{error}</p>}
    {tab === "places" && <WorkspaceSearch value={query} onChange={setQuery} placeholder="Mekân, açıklama veya adres ara" resultCount={loading ? undefined : visiblePlaces.length} onReset={query || category ? () => { setQuery(""); setCategory(""); } : undefined}><label><span className="sr-only">Mekân kategorisi</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tüm kategoriler</option>{placeCategories.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label></WorkspaceSearch>}
    {loading ? <div className="campus-guide-empty"><strong>Kampüs rehberi hazırlanıyor…</strong></div> : tab === "places" ? <>
      {visiblePlaces.length === 0 ? <div className="campus-guide-empty"><span>SONUÇ YOK</span><strong>Bu aramayla eşleşen nokta bulunamadı</strong><p>Filtreleri temizleyebilir veya bildiğin gerçek bir kampüs noktasını kaynak ayrıntısıyla ekleyebilirsin.</p><button type="button" onClick={() => setDialog("place")}>Mekân ekle</button></div> : <div className="campus-guide-layout">
        <section className="campus-place-list">{visiblePlaces.map((place) => <article className={selected?.id === place.id ? "active" : ""} key={place.id} onClick={() => setSelectedId(place.id)}>
          <header><div><span>{placeCategoryNames[place.category] ?? place.category}</span><h2>{place.name}</h2></div><b className={place.curated || place.verification.time ? "verified" : ""}>{place.verification.label}</b></header>
          <p>{place.description}</p>
          <small>{place.address || "Adres bilgisi eklenmedi"} · {place.source ? `${checkedDate(place.source.checkedAt)} tarihinde kontrol edildi` : `${timeLabel(place.updatedTime)} güncellendi`}</small>
          <footer><div>{place.campusName && <span>{place.campusName}</span>}{place.accessibility.slice(0, 2).map((item) => <span key={item}>{accessibilityNames[item] ?? item}</span>)}</div><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(place.id); if (window.innerWidth <= 780) window.requestAnimationFrame(() => { const detail = document.getElementById("campus-map-details"); detail?.scrollIntoView({ block: "start" }); detail?.focus({ preventScroll: true }); }); }}>Ayrıntılar</button></footer>
        </article>)}</section>
        <aside className="campus-map-panel" id="campus-map-details" tabIndex={-1} aria-label="Seçilen kampüs noktası">{selected && <>
          <header><div><span>SEÇİLEN NOKTA</span><strong>{selected.name}</strong></div><b>{selected.openingHours || "Saat bilgisi yok"}</b></header>
          {selected.coordinatesKnown ? <><iframe title={`${selected.name} haritası`} loading="lazy" referrerPolicy="no-referrer" src={mapUrl(selected)}/><a href={openMapUrl(selected)} target="_blank" rel="noreferrer">OpenStreetMap&apos;te aç ↗</a></> : <div className="campus-map-unknown"><span>⌖</span><strong>Kesin koordinat henüz yok</strong><p>{selected.curated ? "Kaynakta doğrulanmış adres var; emin olmadığımız koordinatı haritada göstermiyoruz." : "Adres bilgisini kullanabilir veya noktayı ekleyen öğrenciden koordinat eklemesini isteyebilirsin."}</p></div>}
          <p className="campus-map-attribution">Harita ve açık veri © OpenStreetMap katkıcıları · ODbL</p>
          {selected.source ? <section className="campus-source-panel"><strong>{selected.source.type === "official-university" ? "Resmî kaynak kaydı" : "Açık harita kaydı"}</strong><p>{checkedDate(selected.source.checkedAt)} tarihinde kontrol edildi{selected.campusName ? ` · ${selected.campusName}` : ""}</p><div><a href={selected.source.url} target="_blank" rel="noreferrer">Kaynağı aç ↗</a>{selected.source.coordinateSource && <a href={selected.source.coordinateSource.url} target="_blank" rel="noreferrer">Koordinat kaynağı ↗</a>}</div><small>{selected.source.type === "official-university" ? "Adres üniversitenin veya yetkili yükseköğretim kurumunun yayımladığı sayfadan alınmıştır." : "OpenStreetMap topluluk tarafından düzenlenen açık harita verisidir; kurumun resmî onayı anlamına gelmez."}</small></section> : <section><strong>Bu bilgi güncel mi?</strong><p>{selected.currentCount} güncel · {selected.needsUpdateCount} düzeltme istiyor</p><div><button className={selected.viewerState === "current" ? "active" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "current")}>Evet, güncel</button><button className={selected.viewerState === "needs-update" ? "active warning" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "needs-update")}>Düzeltme gerekli</button></div>{selected.own && <button className="campus-archive" type="button" onClick={() => void update("archive-place", selected.id)}>Mekânı arşivle</button>}</section>}
        </>}</aside>
      </div>}
    </> : tab === "events" ? (events.length === 0 ? <div className="campus-guide-empty"><span>TAKVİM</span><strong>Yaklaşan etkinlik yok</strong><p>Kampüsündeki gerçek bir etkinliği tarih ve açıklamasıyla ekleyebilirsin.</p><button type="button" onClick={() => setDialog("event")}>Etkinlik ekle</button></div> : <div className="campus-event-list">{events.map((item) => <article key={item.id}><time dateTime={item.startsAt}><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(item.startsAt))}</span></time><div><span>{eventCategoryNames[item.category] ?? item.category}</span><h2>{item.title}</h2><p>{item.description}</p><small>{eventTime(item.startsAt)} · {item.placeName || "Mekân belirtilmedi"}</small></div>{item.own && <button type="button" onClick={() => void update("archive-event", item.id)}>Arşivle</button>}</article>)}</div>) : tab === "housing" ? <><HousingDirectory/><details className="housing-community-section"><summary>Öğrenci kayıtları ve deneyimler · {housingPlaces.length}</summary>{(housingPlaces.length === 0 ? <div className="campus-guide-empty housing-empty"><span>YURT & KONAKLAMA</span><strong>Kampüsünde henüz öğrenci konaklama kaydı yok</strong><p>Bildiğin gerçek bir yurt veya öğrenci konaklamasını ekle; yeni başlayanlar çevreyi ve öğrenci deneyimlerini tek yerde görsün.</p><button type="button" onClick={() => setDialog("housing")}>İlk konaklamayı ekle</button></div> : <div className="housing-layout"><aside className="housing-place-list"><header><span>KONAKLAMA REHBERİ</span><h2>Öğrencilerin bildiği yerler</h2><p>Reklam değil; kampüs topluluğunun eklediği deneyim alanı.</p></header>{housingPlaces.map((place) => <button className={selectedHousing?.id === place.id ? "active" : ""} type="button" key={place.id} onClick={() => { setSelectedId(place.id); void loadHousingMessages(place.id); }}><span>⌂</span><div><strong>{place.name}</strong><small>{place.address || "Adres bilgisi bekleniyor"}</small></div><i>›</i></button>)}<button className="housing-add-button" type="button" onClick={() => setDialog("housing")}>＋ Konaklama ekle</button></aside>{selectedHousing && <main className="housing-detail"><section className="housing-hero"><div><span>ÖĞRENCİ KONAKLAMA KAYDI</span><h2>{selectedHousing.name}</h2><p>{selectedHousing.description}</p><small>{selectedHousing.address || "Adres bilgisi eklenmedi"} · {timeLabel(selectedHousing.updatedTime)} güncellendi</small></div><div className="housing-hero-actions">{selectedHousing.coordinatesKnown && <a href={openMapUrl(selectedHousing)} target="_blank" rel="noreferrer">Haritada aç ↗</a>}{selectedHousing.own && <button type="button" onClick={() => void update("archive-place", selectedHousing.id)}>Kaydı arşivle</button>}</div></section><section className="housing-safety"><span>✓</span><div><strong>Güvenli karar ver</strong><p>Telefon, kişisel adres veya ödeme bağlantısı paylaşma. Kapora göndermeden önce yeri ve yetkili kişiyi yüz yüze doğrula.</p></div></section><section className="housing-nearby"><header><div><span>KAMPÜS ÇEVRESİNDE</span><h3>Günlük hayat için yakın çevre rehberi</h3></div><small>Yurda kesin mesafe iddiası değildir</small></header><div>{nearbyCampusPlaces.length ? nearbyCampusPlaces.map((place) => <button type="button" key={place.id} onClick={() => { setSelectedId(place.id); setTab("places"); }}><span>{placeCategoryNames[place.category] ?? place.category}</span><strong>{place.name}</strong><small>{place.address || place.campusName || "Kampüs kaydı"}</small></button>) : <p>Bu kampüs için çevre noktaları henüz eklenmedi.</p>}</div></section><section className="housing-discussion"><header><div><span>ÖĞRENCİ DENEYİMLERİ</span><h3>Burada kalanlar ne diyor?</h3></div><strong>{housingMessages.length} paylaşım</strong></header><form onSubmit={shareHousingMessage}><textarea name="content" minLength={3} maxLength={600} required rows={3} placeholder="Ulaşım, çalışma ortamı, çevre ve günlük yaşam hakkında bildiğini paylaş…"/><footer><label><input name="anonymous" type="checkbox"/> Anonim paylaş</label><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Paylaşılıyor…" : "Deneyimini paylaş"}</button></footer></form>{housingLoading ? <p className="housing-message-state">Deneyimler yükleniyor…</p> : housingMessages.length === 0 ? <p className="housing-message-state">İlk doğrulanabilir deneyimi sen paylaşabilirsin.</p> : <div className="housing-message-list">{housingMessages.map((message) => <article key={message.id}><span>{message.anonymous ? "?" : message.authorName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><div><header><strong>{message.authorName}</strong><small>{timeLabel(message.time)}</small></header><p>{message.content}</p>{message.own && <button type="button" disabled={busy} onClick={() => void removeHousingMessage(message.id)}>Sil</button>}</div></article>)}</div>}</section></main>}</div>)}</details></> : suggestion ? <section className="daily-suggestion"><span>BUGÜNÜN KAMPÜS ÖNERİSİ · {suggestion.day}</span><div className="daily-suggestion-icon">{suggestion.type === "event" ? "✦" : "⌖"}</div><small>{suggestion.type === "event" ? eventCategoryNames[String(suggestion.category)] : placeCategoryNames[String(suggestion.category)]}</small><h2>{suggestion.title ?? suggestion.name}</h2><p>{suggestion.description}</p><b>{suggestion.reason}</b>{suggestion.type === "event" && suggestion.startsAt && <time>{eventTime(suggestion.startsAt)}</time>}<button type="button" onClick={() => { if (suggestion.type === "event") setTab("events"); else { setSelectedId(suggestion.id); setTab("places"); } }}>Ayrıntıları gör</button><footer>Aynı gün içinde öneri değişmez; yarın kampüsündeki güncel kayıtlardan yeniden seçilir.</footer></section> : <div className="campus-guide-empty"><span>GÜNLÜK ÖNERİ</span><strong>Öneri oluşturmak için kampüs verisi gerekiyor</strong><p>İlk gerçek mekânı veya etkinliği eklediğinde günlük öneri de çalışmaya başlayacak.</p></div>}

    {dialog && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}><section className="feature-dialog campus-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="campus-dialog-title"><header><div><span>{dialog === "housing" ? "YURT & KONAKLAMA" : dialog === "place" ? "KAMPÜS NOKTASI" : "ETKİNLİK TAKVİMİ"}</span><h2 id="campus-dialog-title">{dialog === "housing" ? "Konaklama ekle" : dialog === "place" ? "Mekân ekle" : "Etkinlik ekle"}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={create}><div className="campus-form-row"><label>Ad<input name="name" minLength={3} maxLength={100} required placeholder={dialog === "housing" ? "Örn. Kampüs Öğrenci Yurdu" : dialog === "place" ? "Örn. Merkez kütüphane" : "Örn. Bahar fotoğraf yürüyüşü"}/></label>{dialog === "housing" ? <label>Tür<input value="Yurt & konaklama" readOnly/></label> : <label>Kategori<select name="category" defaultValue={dialog === "place" ? "study" : "social"}>{(dialog === "place" ? placeCategories : eventCategories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}</div><label>Açıklama<textarea name="description" minLength={12} maxLength={700} rows={4} required placeholder={dialog === "housing" ? "Yer, ulaşım ve öğrencinin karar vermesine yardımcı olacak bildiğin gerçek ayrıntıları yaz." : "Öğrencinin karar vermesi için doğrulanabilir ayrıntıları yaz."}/></label>{dialog === "place" || dialog === "housing" ? <><div className="campus-form-row"><label>Adres / kampüs tarifi<input name="address" maxLength={180} placeholder={dialog === "housing" ? "Örn. Kampüs ana kapısına yakın" : "Örn. Mühendislik Fakültesi yanı"}/></label><label>{dialog === "housing" ? "Bilinen saat / iletişim notu" : "Çalışma saatleri"}<input name="openingHours" maxLength={120} placeholder={dialog === "housing" ? "Örn. Ziyaret için hafta içi danışma" : "Örn. Hafta içi 08.00–22.00"}/></label></div><div className="campus-form-row"><label>Enlem (isteğe bağlı)<input name="latitude" inputMode="decimal" placeholder="41.368"/></label><label>Boylam (isteğe bağlı)<input name="longitude" inputMode="decimal" placeholder="36.195"/></label></div><fieldset><legend>Özellikler</legend><div className="campus-accessibility">{accessibilityOptions.map(([value, label]) => <button className={accessibility.includes(value) ? "active" : ""} type="button" key={value} onClick={() => setAccessibility((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}>{label}</button>)}</div></fieldset></> : <><label>Mekân<select name="placeId" defaultValue=""><option value="">Mekân belirtilmedi</option>{communityPlaces.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}</select></label>{communityPlaces.length === 0 && <p className="campus-form-hint">Etkinliği katalog kaydına bağlamak yerine mekân adını açıklamaya yazabilirsin.</p>}<div className="campus-form-row"><label>Başlangıç<input name="startsAt" type="datetime-local" required/></label><label>Bitiş (isteğe bağlı)<input name="endsAt" type="datetime-local"/></label></div></>}<p className="campus-guide-disclaimer">Yalnız bildiğin gerçek bilgileri ekle. Kişisel adres, telefon veya özel iletişim bilgisi paylaşma.{dialog === "housing" ? " Kapora veya ödeme bağlantısı ekleme." : ""}</p><footer><button type="button" onClick={() => setDialog(null)}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></footer></form></section></div>}
  </div>;
}
