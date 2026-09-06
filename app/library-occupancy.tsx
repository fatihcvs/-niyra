"use client";

import { useAuthenticatedFetch } from "./use-authenticated-fetch";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";


import { WorkspaceHeader, WorkspaceSearch, WorkspaceEmpty } from "./workspace-ui";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useAppLayer } from "./use-app-layer";
import { useWorkspaceState } from "./use-workspace-state";
import { useWorkspaceDrafts } from "./use-workspace-drafts";
import layerStyles from "./workspace-layer.module.css";
import { matchesSearch } from "../lib/workspace-navigation";

type LibraryArea = {
  id: string; name: string; floorLabel: string; zoneLabel: string; description: string; capacity: number | null;
  features: string[]; placeId: string | null; placeName: string | null; latitude: number | null; longitude: number | null;
  coordinatesKnown: boolean; activeCount: number; recentSignalCount: number; hasRecentSignal: boolean;
  estimatedFreeSeats: number | null; occupancyPercent: number | null; lastSignalTime: string | null;
  viewerCheckin: { id: string; expiresAt: string | null } | null; own: boolean; updatedTime: string;
};
type CampusPlace = { id: string; name: string };
type LibraryResponse = { areas?: LibraryArea[]; places?: CampusPlace[]; viewerActiveAreaId?: string | null; error?: string };

const featureOptions = [
  ["quiet", "Sessiz"], ["group", "Grup çalışması"], ["power", "Priz"], ["wifi", "Wi-Fi"],
  ["computers", "Bilgisayar"], ["accessible", "Erişilebilir"], ["natural-light", "Gün ışığı"], ["food-free", "Yeme-içme yok"],
] as const;
const featureNames = Object.fromEntries(featureOptions) as Record<string, string>;
const durationOptions = [[30, "30 dk"], [60, "1 saat"], [90, "1,5 saat"], [120, "2 saat"], [180, "3 saat"]] as const;

async function readJson(response: Response) {
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "İşlem tamamlanamadı.");
  return data;
}

function expiry(value: string | null) {
  if (!value) return "süre bilgisi yok";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function mapUrl(area: LibraryArea) {
  if (area.latitude === null || area.longitude === null) return "";
  return `https://www.openstreetmap.org/?mlat=${area.latitude}&mlon=${area.longitude}#map=18/${area.latitude}/${area.longitude}`;
}

export function LibraryOccupancyWorkspace({ universityShortName }: { universityShortName: string }) {
  const fetch = useAuthenticatedFetch();
  const [query, setQuery] = useWorkspaceState("library:query", "");
  const [featureFilter, setFeatureFilter] = useWorkspaceState("library:featureFilter", "");
  const [availableOnly, setAvailableOnly] = useWorkspaceState("library:availableOnly", false);
  const [areas, setAreas] = useState<LibraryArea[]>([]);
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [viewerActiveAreaId, setViewerActiveAreaId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkinArea, setCheckinArea] = useState<LibraryArea | null>(null);
  const [features, setFeatures] = useWorkspaceState<string[]>("library:create-features", []);
  const [durationMinutes, setDurationMinutes] = useWorkspaceState("library:durationMinutes", 60);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const draft = useWorkspaceDrafts("library:forms");
  const lastCheckin = useRef<LibraryArea | null>(null);
  const { ref: createDialogRef, close: closeCreate } = useAppLayer({ id: "library.create", open: createOpen, busy, onClose: () => setCreateOpen(false), onRestore: () => setCreateOpen(true) });
  const { ref: checkinDialogRef, close: closeCheckin } = useAppLayer({ id: "library.checkin", open: Boolean(checkinArea), busy, onClose: () => { lastCheckin.current = checkinArea; setCheckinArea(null); }, onRestore: () => setCheckinArea(lastCheckin.current) });

  const applyData = useCallback((data: LibraryResponse) => {
    setAreas(data.areas ?? []);
    setPlaces(data.places ?? []);
    setViewerActiveAreaId(data.viewerActiveAreaId ?? null);
  }, []);
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try { applyData(await readJson(await fetch("/api/library-occupancy")) as LibraryResponse); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Kütüphane doluluğu getirilemedi."); }
    finally { if (showLoading) setLoading(false); }
  }, [applyData, fetch]);

  useEffect(() => {
    let active = true;
    void fetch("/api/library-occupancy").then(readJson).then((data) => { if (active) applyData(data as LibraryResponse); }).catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Kütüphane doluluğu getirilemedi."); }).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => { if (active) void load(false); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [applyData, fetch, load]);

  const activeArea = useMemo(() => areas.find((area) => area.id === viewerActiveAreaId) ?? null, [areas, viewerActiveAreaId]);
  const knownAreas = areas.filter((area) => area.estimatedFreeSeats !== null).length;
  const visibleAreas = areas.filter((area) => matchesSearch(query, area.name, area.zoneLabel, area.floorLabel, area.placeName) && (!featureFilter || area.features.includes(featureFilter)) && (!availableOnly || (area.estimatedFreeSeats !== null && area.estimatedFreeSeats > 0))).sort((a, b) => (b.estimatedFreeSeats ?? -1) - (a.estimatedFreeSeats ?? -1));
  const activeCheckins = areas.reduce((total, area) => total + area.activeCount, 0);

  async function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      await readJson(await fetch("/api/library-occupancy", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "area", name: form.get("name"), floorLabel: form.get("floorLabel"), zoneLabel: form.get("zoneLabel"), description: form.get("description"), capacity: form.get("capacity"), placeId: form.get("placeId"), features }),
      }));
      setCreateOpen(false); setFeatures([]); draft.clear("create"); setNotice("Çalışma alanı eklendi. Doluluk, öğrenci check-in sinyali geldikçe tahmin edilecek."); await load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Çalışma alanı eklenemedi."); }
    finally { setBusy(false); }
  }

  async function checkIn() {
    if (!checkinArea || busy) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/library-occupancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check-in", areaId: checkinArea.id, durationMinutes }) }));
      setNotice(`${checkinArea.name} · ${checkinArea.zoneLabel} için süreli check-in başladı.`); setCheckinArea(null); await load();
    } catch (checkinError) { setError(checkinError instanceof Error ? checkinError.message : "Check-in başlatılamadı."); }
    finally { setBusy(false); }
  }

  async function update(action: "check-out" | "archive-area", areaId: string) {
    if (action === "archive-area" && !window.confirm("Bu çalışma alanını arşivlemek istiyor musun?")) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/library-occupancy", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, areaId }) }));
      setNotice(action === "check-out" ? "Check-in tamamlandı; alan tahmini güncellendi." : "Çalışma alanı arşivlendi."); await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Kütüphane bilgisi güncellenemedi."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-view library-live-workspace">
    <WorkspaceHeader screenId="library" section="Kütüphane" eyebrow={universityShortName} title="Kütüphane" description="Çalışma alanlarını keşfet. Doluluk, öğrenci bildirimlerine dayalı bir tahmindir." primaryAction={{ id: "library.create", label: "Alan ekle", icon: <Plus size={22}/>, onPress: () => setCreateOpen(true) }} secondaryActions={[{ id: "library.refresh", label: "İçeriği yenile", busy: loading, onPress: load }]}/>

    <WorkspaceSearch value={query} onChange={setQuery} placeholder="Kütüphane, kat veya çalışma alanı ara" resultCount={loading ? undefined : visibleAreas.length} onReset={query || featureFilter || availableOnly ? () => { setQuery(""); setFeatureFilter(""); setAvailableOnly(false); } : undefined}><label><span className="sr-only">Alan özelliği</span><select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}><option value="">Tüm özellikler</option>{featureOptions.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)}/>Tahmini boş yer var</label></WorkspaceSearch>
    <section className="library-live-summary" aria-label="Kütüphane doluluk özeti"><article><span>ÇALIŞMA ALANI</span><strong>{areas.length}</strong><small>kampüs kataloğunda</small></article><article><span>GÜNCEL TAHMİN</span><strong>{knownAreas}</strong><small>son 2 saatte sinyal var</small></article><article><span>AKTİF CHECK-IN</span><strong>{activeCheckins}</strong><small>süre sonunda otomatik düşer</small></article></section>
    {activeArea && <section className="library-active-checkin"><div><span>ŞU ANDA BURADASIN</span><strong>{activeArea.name} · {activeArea.floorLabel} · {activeArea.zoneLabel}</strong><small>{expiry(activeArea.viewerCheckin?.expiresAt ?? null)} saatine kadar aktif</small></div><button type="button" disabled={busy} onClick={() => void update("check-out", activeArea.id)}>Çıkış yap</button></section>}
    {notice && <p className="library-live-notice" role="status">{notice}</p>}{error && <p className="feature-feedback-state" role="alert">{error}</p>}

    {loading ? <div className="library-live-empty"><strong>Çalışma alanları hazırlanıyor…</strong></div> : areas.length === 0 ? <div className="library-live-empty"><span>İLK ALAN</span><strong>Kütüphane doluluk haritası henüz boş</strong><p>Bildiğin gerçek bir kat veya çalışma bölgesini ekle. Kapasiteyi bilmiyorsan boş bırak; Kampira boş masa sayısı uydurmaz.</p><button type="button" onClick={() => setCreateOpen(true)}>İlk alanı ekle</button></div> : visibleAreas.length === 0 ? <WorkspaceEmpty action={<button type="button" onClick={() => { setQuery(""); setFeatureFilter(""); setAvailableOnly(false); }}>Filtreleri temizle</button>}/> : <div className="library-area-grid">{visibleAreas.map((area) => {
      const known = area.estimatedFreeSeats !== null && area.occupancyPercent !== null;
      const occupiedCells = known ? Math.min(12, Math.round((area.occupancyPercent! / 100) * 12)) : 0;
      return <article className={`library-area-card ${area.viewerCheckin ? "viewer-active" : ""}`} key={area.id}><header><div><span>{area.floorLabel || "Kat bilgisi yok"}</span><h2>{area.name}</h2><p>{area.zoneLabel}</p></div><b className={known ? "known" : "unknown"}>{known ? `${area.occupancyPercent}% tahmini dolu` : "Doluluk bilinmiyor"}</b></header><div className="library-seat-map" aria-label={known ? `${occupiedCells} dolu gösterge, ${12 - occupiedCells} boş gösterge` : "Güncel doluluk verisi yok"}>{Array.from({ length: 12 }, (_, index) => <i className={known ? index < occupiedCells ? "occupied" : "available" : "unknown"} key={index}/>)}</div><small className="library-map-caption">Oran göstergesidir; fiziksel masa planı değildir.</small><section className="library-estimate"><div><span>TAHMİNİ BOŞ YER</span><strong>{known ? `~${area.estimatedFreeSeats}` : "—"}</strong><small>{known ? `${area.activeCount} aktif check-in / ${area.capacity} kapasite` : area.capacity === null ? "Kapasite bilgisi yok" : "Son 2 saatte öğrenci sinyali yok"}</small></div><div><span>SON SİNYAL</span><strong>{area.lastSignalTime ? `${area.lastSignalTime} önce` : "Henüz yok"}</strong><small>{area.recentSignalCount ? `${area.recentSignalCount} yakın zamanlı güncelleme` : "Tahmin üretilmedi"}</small></div></section><p className="library-area-description">{area.description}</p><div className="library-feature-list">{area.features.map((feature) => <span key={feature}>{featureNames[feature] ?? feature}</span>)}</div><footer><div>{area.placeName && <span>{area.placeName}</span>}{area.coordinatesKnown && <a href={mapUrl(area)} target="_blank" rel="noreferrer">Haritada aç ↗</a>}{area.own && <button type="button" onClick={() => void update("archive-area", area.id)}>Arşivle</button>}</div>{area.viewerCheckin ? <button className="checkout" type="button" disabled={busy} onClick={() => void update("check-out", area.id)}>Check-out</button> : <button type="button" disabled={busy || Boolean(viewerActiveAreaId)} onClick={() => setCheckinArea(area)}>{viewerActiveAreaId ? "Başka alanda aktifsin" : "Buradayım"}</button>}</footer></article>;
    })}</div>}

    {createOpen && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}><section ref={createDialogRef} className={`feature-dialog library-live-dialog ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="library-area-title"><header><div><span>KÜTÜPHANE KATALOĞU</span><h2 id="library-area-title">Çalışma alanı ekle</h2></div><button type="button" onClick={closeCreate} disabled={busy} aria-label="Pencereyi kapat">×</button></header><form onSubmit={createArea}>{error && <p role="alert" className="feature-feedback-state">{error}</p>}<label>Bağlı kampüs noktası<select name="placeId" {...draft.field("create", "placeId")} disabled={busy}><option value="">Listede yok / belirtme</option>{places.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}</select></label><div className="library-form-row"><label>Kütüphane / bina adı<input name="name" {...draft.field("create", "name")} disabled={busy} minLength={3} maxLength={100} required placeholder="Örn. Merkez Kütüphane"/></label><label>Kat<input name="floorLabel" {...draft.field("create", "floorLabel")} disabled={busy} maxLength={60} placeholder="Örn. 2. Kat"/></label></div><div className="library-form-row"><label>Bölge adı<input name="zoneLabel" {...draft.field("create", "zoneLabel")} disabled={busy} minLength={2} maxLength={80} required placeholder="Örn. Sessiz Salon A"/></label><label>Kapasite<input name="capacity" {...draft.field("create", "capacity")} disabled={busy} type="number" min="1" max="5000" placeholder="Bilmiyorsan boş bırak"/></label></div><label>Açıklama<textarea name="description" {...draft.field("create", "description")} disabled={busy} minLength={12} maxLength={600} rows={4} required placeholder="Alanı bulmayı kolaylaştıran ve çalışma düzenini açıklayan gerçek bilgi yaz."/></label><fieldset><legend>Alan özellikleri</legend><div>{featureOptions.map(([value, label]) => <button className={features.includes(value) ? "active" : ""} type="button" disabled={busy} aria-pressed={features.includes(value)} onClick={() => setFeatures((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} key={value}>{label}</button>)}</div></fieldset><p className="library-live-disclaimer">Kapasiteyi bilmiyorsan boş bırak. Tahmini doluluk için öğrenci check-in&apos;leri gerekir; kesin boş masa iddiası gösterilmez.</p><footer><button type="button" onClick={closeCreate} disabled={busy}>Vazgeç</button><button className="feature-primary" type="submit" disabled={busy}>{busy ? "Kaydediliyor…" : "Alanı ekle"}</button></footer></form></section></div>}

    {checkinArea && <div className="feature-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckin(); }}><section ref={checkinDialogRef} className={`feature-dialog library-live-dialog compact ${layerStyles.dialog}`} data-mobile-overlay="true" role="dialog" aria-modal="true" aria-labelledby="library-checkin-title"><header><div><span>SÜRELİ CHECK-IN</span><h2 id="library-checkin-title">{checkinArea.name} · {checkinArea.zoneLabel}</h2></div><button type="button" onClick={closeCheckin} disabled={busy} aria-label="Pencereyi kapat">×</button></header><div className="library-checkin-content">{error && <p role="alert" className="feature-feedback-state">{error}</p>}<p>Ne kadar süre burada çalışmayı planlıyorsun?</p><div className="library-duration-grid">{durationOptions.map(([value, label]) => <button className={durationMinutes === value ? "active" : ""} type="button" onClick={() => setDurationMinutes(value)} key={value}>{label}</button>)}</div><small>Erken ayrılırsan check-out yap. Unutursan check-in seçtiğin sürenin sonunda otomatik olarak aktif sayıdan düşer.</small><footer><button type="button" onClick={closeCheckin} disabled={busy}>Vazgeç</button><button className="feature-primary" type="button" disabled={busy} onClick={() => void checkIn()}>{busy ? "Başlatılıyor…" : "Check-in başlat"}</button></footer></div></section></div>}
  </div>;
}
