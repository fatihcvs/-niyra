"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Place = {
  id: string; name: string; category: string; description: string; address: string; latitude: number | null; longitude: number | null;
  coordinatesKnown: boolean; accessibility: string[]; openingHours: string; currentCount: number; needsUpdateCount: number;
  viewerState: string | null; verification: { label: string; time: string | null }; own: boolean; updatedTime: string;
};
type CampusEvent = { id: string; title: string; description: string; category: string; startsAt: string; endsAt: string | null; placeId: string | null; placeName: string | null; own: boolean; time: string };
type Suggestion = Record<string, unknown> & { type: "place" | "event"; day: string; reason: string; id: string; name?: string; title?: string; description?: string; category?: string; startsAt?: string; placeName?: string };
type GuideResponse = { places?: Place[]; events?: CampusEvent[]; suggestion?: Suggestion | null; error?: string };
type Tab = "places" | "events" | "daily";

const placeCategories = [["building", "Binalar"], ["library", "Kütüphane"], ["food", "Yeme-içme"], ["study", "Çalışma"], ["sports", "Spor"], ["social", "Sosyal"], ["transport", "Ulaşım"], ["health", "Sağlık"], ["other", "Diğer"]] as const;
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
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [selectedId, setSelectedId] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"place" | "event" | null>(null);
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyData = useCallback((data: GuideResponse) => {
    setPlaces(data.places ?? []);
    setEvents(data.events ?? []);
    setSuggestion(data.suggestion ?? null);
    setSelectedId((current) => current || data.places?.find((place) => place.coordinatesKnown)?.id || data.places?.[0]?.id || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { applyData(await readJson(await fetch(`/api/campus-guide?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`)) as GuideResponse); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }
    finally { setLoading(false); }
  }, [applyData, category, query]);

  useEffect(() => {
    let active = true;
    void fetch("/api/campus-guide").then(readJson).then((result) => { if (active) applyData(result as GuideResponse); }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Kampüs rehberi getirilemedi."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyData]);

  const selected = useMemo(() => places.find((place) => place.id === selectedId) ?? places[0] ?? null, [places, selectedId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = dialog === "place" ? {
        action: "place", name: form.get("name"), category: form.get("category"), description: form.get("description"), address: form.get("address"), latitude: form.get("latitude"), longitude: form.get("longitude"), openingHours: form.get("openingHours"), accessibility,
      } : {
        action: "event", name: form.get("name"), category: form.get("category"), description: form.get("description"), placeId: form.get("placeId"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt"),
      };
      await readJson(await fetch("/api/campus-guide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setNotice(dialog === "place" ? "Kampüs noktası eklendi. İki öğrencinin onayıyla güncel olarak işaretlenecek." : "Etkinlik kampüs takvimine eklendi.");
      setDialog(null); setAccessibility([]); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Kayıt oluşturulamadı."); }
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
    <header className="campus-guide-header"><div><span>{universityShortName} · KAMPÜS REHBERİ</span><h1>Kampüsünü tek yerden keşfet</h1><p>Mekânlar, çalışma alanları ve etkinlikler öğrenciler tarafından eklenir; güncellik durumu açıkça gösterilir.</p></div><div><button type="button" onClick={() => setDialog("event")}>Etkinlik ekle</button><button className="feature-primary" type="button" onClick={() => setDialog("place")}>＋ Mekân ekle</button></div></header>
    <nav className="campus-guide-tabs" aria-label="Kampüs rehberi bölümleri"><button className={tab === "places" ? "active" : ""} type="button" onClick={() => setTab("places")}><strong>Harita ve mekânlar</strong><small>{places.length} nokta</small></button><button className={tab === "events" ? "active" : ""} type="button" onClick={() => setTab("events")}><strong>Etkinlik takvimi</strong><small>{events.length} yaklaşan</small></button><button className={tab === "daily" ? "active" : ""} type="button" onClick={() => setTab("daily")}><strong>Bugünün önerisi</strong><small>Her gün yenilenir</small></button></nav>
    {notice && <p className="campus-guide-notice" role="status">{notice}</p>}{error && <p className="feature-feedback-state" role="alert">{error}</p>}
    {loading ? <div className="campus-guide-empty"><strong>Kampüs rehberi hazırlanıyor…</strong></div> : tab === "places" ? <>
      <form className="campus-guide-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mekân, açıklama veya adres ara"/><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tüm kategoriler</option>{placeCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button type="submit">Ara</button></form>
      {places.length === 0 ? <div className="campus-guide-empty"><span>İLK NOKTA</span><strong>Kampüs haritası henüz boş</strong><p>Resmî olmayan veya emin olmadığın konumları kesin bilgi gibi ekleme. Koordinat bilmiyorsan alanı boş bırakabilirsin.</p><button type="button" onClick={() => setDialog("place")}>İlk mekânı ekle</button></div> : <div className="campus-guide-layout"><section className="campus-place-list">{places.map((place) => <article className={selected?.id === place.id ? "active" : ""} key={place.id} onClick={() => setSelectedId(place.id)}><header><div><span>{placeCategoryNames[place.category] ?? place.category}</span><h2>{place.name}</h2></div><b className={place.verification.time ? "verified" : ""}>{place.verification.label}</b></header><p>{place.description}</p><small>{place.address || "Adres bilgisi eklenmedi"} · {place.updatedTime} önce güncellendi</small><footer><div>{place.accessibility.slice(0, 3).map((item) => <span key={item}>{accessibilityNames[item] ?? item}</span>)}</div><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(place.id); }}>Haritada gör</button></footer></article>)}</section><aside className="campus-map-panel">{selected && <><header><div><span>SEÇİLEN NOKTA</span><strong>{selected.name}</strong></div><b>{selected.openingHours || "Saat bilgisi yok"}</b></header>{selected.coordinatesKnown ? <><iframe title={`${selected.name} haritası`} loading="lazy" referrerPolicy="no-referrer" src={mapUrl(selected)}/><a href={openMapUrl(selected)} target="_blank" rel="noreferrer">OpenStreetMap&apos;te aç ↗</a></> : <div className="campus-map-unknown"><span>⌖</span><strong>Konum henüz eklenmedi</strong><p>Adres bilgisini kullanabilir veya noktayı ekleyen öğrenciden koordinat eklemesini isteyebilirsin.</p></div>}<section><strong>Bu bilgi güncel mi?</strong><p>{selected.currentCount} güncel · {selected.needsUpdateCount} düzeltme istiyor</p><div><button className={selected.viewerState === "current" ? "active" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "current")}>Evet, güncel</button><button className={selected.viewerState === "needs-update" ? "active warning" : ""} type="button" disabled={busy} onClick={() => void update("confirm", selected.id, "needs-update")}>Düzeltme gerekli</button></div>{selected.own && <button className="campus-archive" type="button" onClick={() => void update("archive-place", selected.id)}>Mekânı arşivle</button>}</section></>}</aside></div>}
    </> : tab === "events" ? (events.length === 0 ? <div className="campus-guide-empty"><span>TAKVİM</span><strong>Yaklaşan etkinlik yok</strong><p>Kampüsündeki gerçek bir etkinliği tarih ve açıklamasıyla ekleyebilirsin.</p><button type="button" onClick={() => setDialog("event")}>Etkinlik ekle</button></div> : <div className="campus-event-list">{events.map((item) => <article key={item.id}><time dateTime={item.startsAt}><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(new Date(item.startsAt))}</span></time><div><span>{eventCategoryNames[item.category] ?? item.category}</span><h2>{item.title}</h2><p>{item.description}</p><small>{eventTime(item.startsAt)} · {item.placeName || "Mekân belirtilmedi"}</small></div>{item.own && <button type="button" onClick={() => void update("archive-event", item.id)}>Arşivle</button>}</article>)}</div>) : suggestion ? <section className="daily-suggestion"><span>BUGÜNÜN KAMPÜS ÖNERİSİ · {suggestion.day}</span><div className="daily-suggestion-icon">{suggestion.type === "event" ? "✦" : "⌖"}</div><small>{suggestion.type === "event" ? eventCategoryNames[String(suggestion.category)] : placeCategoryNames[String(suggestion.category)]}</small><h2>{suggestion.title ?? suggestion.name}</h2><p>{suggestion.description}</p><b>{suggestion.reason}</b>{suggestion.type === "event" && suggestion.startsAt && <time>{eventTime(suggestion.startsAt)}</time>}<button type="button" onClick={() => { if (suggestion.type === "event") setTab("events"); else { setSelectedId(suggestion.id); setTab("places"); } }}>Ayrıntıları gör</button><footer>Aynı gün içinde öneri değişmez; yarın kampüsündeki güncel kayıtlardan yeniden seçilir.</footer></section> : <div className="campus-guide-empty"><span>GÜNLÜK ÖNERİ</span><strong>Öneri oluşturmak için kampüs verisi gerekiyor</strong><p>İlk gerçek mekânı veya etkinliği eklediğinde günlük öneri de çalışmaya başlayacak.</p></div>}

    {dialog && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}><section className="feature-dialog campus-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="campus-dialog-title"><header><div><span>{dialog === "place" ? "KAMPÜS NOKTASI" : "ETKİNLİK TAKVİMİ"}</span><h2 id="campus-dialog-title">{dialog === "place" ? "Mekân ekle" : "Etkinlik ekle"}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Pencereyi kapat">×</button></header><form onSubmit={create}><div className="campus-form-row"><label>Ad<input name="name" minLength={3} maxLength={100} required placeholder={dialog === "place" ? "Örn. Merkez kütüphane" : "Örn. Bahar fotoğraf yürüyüşü"}/></label><label>Kategori<select name="category" defaultValue={dialog === "place" ? "study" : "social"}>{(dialog === "place" ? placeCategories : eventCategories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><label>Açıklama<textarea name="description" minLength={12} maxLength={700} rows={4} required placeholder="Öğrencinin karar vermesi için doğrulanabilir ayrıntıları yaz."/></label>{dialog === "place" ? <><div className="campus-form-row"><label>Adres / kampüs tarifi<input name="address" maxLength={180} placeholder="Örn. Mühendislik Fakültesi yanı"/></label><label>Çalışma saatleri<input name="openingHours" maxLength={120} placeholder="Örn. Hafta içi 08.00–22.00"/></label></div><div className="campus-form-row"><label>Enlem (isteğe bağlı)<input name="latitude" inputMode="decimal" placeholder="41.368"/></label><label>Boylam (isteğe bağlı)<input name="longitude" inputMode="decimal" placeholder="36.195"/></label></div><fieldset><legend>Özellikler</legend><div className="campus-accessibility">{accessibilityOptions.map(([value, label]) => <button className={accessibility.includes(value) ? "active" : ""} type="button" key={value} onClick={() => setAccessibility((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}>{label}</button>)}</div></fieldset></> : <><label>Mekân<select name="placeId" defaultValue=""><option value="">Mekân belirtilmedi</option>{places.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}</select></label><div className="campus-form-row"><label>Başlangıç<input name="startsAt" type="datetime-local" required/></label><label>Bitiş (isteğe bağlı)<input name="endsAt" type="datetime-local"/></label></div></>}<p className="campus-guide-disclaimer">Yalnız bildiğin gerçek bilgileri ekle. Kişisel adres, telefon veya özel iletişim bilgisi paylaşma.</p><footer><button type="button" onClick={() => setDialog(null)}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></footer></form></section></div>}
  </div>;
}
