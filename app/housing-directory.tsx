"use client";

import { useEffect, useRef, useState } from "react";
import { Bed, Buildings, MapPin, ArrowSquareOut, NavigationArrow } from "@phosphor-icons/react";
import type { HousingDirectoryResponse, HousingKind, HousingResult } from "../lib/housing-types";
import { housingCheckedDate, housingMapLink } from "../lib/housing-display";
import { useHousingRequests } from "./use-housing-requests";
import { useWorkspaceState } from "./use-workspace-state";
import { useAppLayer } from "./use-app-layer";
import { useAppNavigation } from "./app-navigation";
import { WorkspaceSearch } from "./workspace-ui";
import styles from "./housing-directory.module.css";

const kinds: Record<HousingKind, string> = {
  public_dorm: "Devlet yurdu", private_dorm: "Özel öğrenci konaklaması", university_dorm: "Üniversite yurdu",
  dorm: "Yurt / öğrenci konaklaması", hotel: "Otel", hostel: "Hostel", guest_house: "Pansiyon / konukevi", apartment: "Apart konaklama",
};
const sources = { government: "Resmî kurum kaydı", university: "Üniversite kaynağı", operator: "İşletme kaynağı", openstreetmap: "Açık harita kaydı" };
const genders = { female: "Kız öğrenciler", male: "Erkek öğrenciler", mixed: "Kız ve erkek öğrenciler", unknown: "Kabul bilgisi kaynakta belirtilmemiş" };
const tabs = [["", "Tümü"], ["public", "Devlet yurtları"], ["private", "Özel yurtlar"], ["university", "Üniversite yurtları"], ["other", "Diğer konaklama"]] as const;

function displayName(name: string) {
  if (name !== name.toLocaleUpperCase("tr-TR")) return name;
  return name.toLocaleLowerCase("tr-TR").replace(/\p{L}[\p{L}\p{M}'’]*/gu, (word) =>
    ["kyk", "gsb", "omu", "omü", "daü", "odtü", "itü"].includes(word) ? word.toLocaleUpperCase("tr-TR") : word[0].toLocaleUpperCase("tr-TR") + word.slice(1));
}

function distanceLabel(place: HousingResult) {
  if (place.distanceMeters === null) return place.relation === "university" ? "Üniversitenin konaklama listesinde" : "Mesafe henüz belirlenmedi";
  return `${(place.distanceMeters / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km · kuş uçuşu`;
}

function phoneHref(phone: string) {
  // Retain the published text, but do not turn malformed or multiple numbers into a wrong dial action.
  if (!/^[+\d\s().-]+$/.test(phone)) return "";
  const number = phone.replace(/[^+\d]/g, "");
  return /^\+?\d{10,15}$/.test(number) ? `tel:${number}` : "";
}

function HousingCard({ place, campus, detailed = false, onOpen }: { place: HousingResult; campus: HousingDirectoryResponse["selectedCampus"]; detailed?: boolean; onOpen?: () => void }) {
  const map = housingMapLink(place, campus);
  const phone = phoneHref(place.phone);
  const checked = housingCheckedDate(place.source.checkedAt);
  return <article className={styles.card}>
    <div className={styles.cardTop}><span className={`${styles.symbol} ${place.kind === "public_dorm" ? styles.public : ""}`}><Bed size={23}/></span><span className={styles.source}>{place.source.url.includes("gsb.gov.tr/") ? "GSB kaydı" : sources[place.source.type]}</span></div>
    <div><p className={styles.kind}>{kinds[place.kind]}</p>{!detailed && <h3>{displayName(place.name)}</h3>}</div>
    <p className={styles.distance}><MapPin size={16}/><span>{distanceLabel(place)}</span></p>
    <p className={styles.address}>{place.address || "Açık adres belirtilmemiş; konumu haritada inceleyebilirsin."}</p>
    {detailed && place.description && <p className={styles.description}>{place.description}</p>}
    {detailed && <section className={styles.details} aria-label="Bilgiler ve kaynak">
      <dl>
        {(place.kind.endsWith("dorm") || place.gender !== "unknown") && <><dt>Kabul</dt><dd>{genders[place.gender]}</dd></>}
        {place.phone && <><dt>İletişim</dt><dd>{phone ? <a href={phone}>{place.phone}</a> : place.phone}</dd></>}
        <dt>Kapasite</dt><dd>{place.capacity !== null ? <>{place.capacity} kişi <small>· boş yatak sayısı değildir</small></> : "Kaynakta belirtilmemiş"}</dd>
        <dt>Olanaklar</dt><dd>{place.features.length ? place.features.join(" · ") : "Kaynakta belirtilmemiş"}</dd>
        <dt>Adres</dt><dd>{place.address || "Kaynakta belirtilmemiş"}</dd><dt>Kaynak kontrolü</dt><dd>{checked}</dd>
      </dl>
      <div className={styles.sourceLinks}><a href={place.source.url} target="_blank" rel="noreferrer">Kaydı incele <ArrowSquareOut size={14}/></a>{place.website && <a href={place.website} target="_blank" rel="noreferrer">İşletmenin sitesi <ArrowSquareOut size={14}/></a>}{place.coordinateSourceUrl && place.coordinateSourceUrl !== place.source.url && <a href={place.coordinateSourceUrl} target="_blank" rel="noreferrer">Konum kaynağı <ArrowSquareOut size={14}/></a>}</div>
      {place.source.type === "openstreetmap" && <p>Topluluk haritası kaydıdır; işletmenin resmî onayı anlamına gelmez.</p>}
      <p>Fiyat, boş oda ve başvuru koşulları bu kayıtta doğrulanmış değildir; güncel bilgiyi doğrudan kurumdan öğren.</p>
    </section>}
    <footer>{!detailed && <button className={styles.detailButton} type="button" onClick={onOpen} aria-label={`${displayName(place.name)} ayrıntılarını aç`}>Ayrıntılar</button>}<a className={styles.mapLink} href={map.url} target="_blank" rel="noreferrer"><NavigationArrow size={16}/>{map.directions ? "Yol tarifi" : "Haritada ara"}<ArrowSquareOut size={14}/></a>{detailed && phone && <a className={styles.callLink} href={phone}>Ara</a>}</footer>
  </article>;
}

export function HousingDirectory() {
  const owner = useAppNavigation()?.ownerScope ?? "";
  return <HousingDirectoryContent key={owner}/>;
}

function HousingDirectoryContent() {
  const { json, capture } = useHousingRequests();
  const [response, setResponse] = useState<{ key: string; data: HousingDirectoryResponse } | null>(null);
  const [filters, setFilters] = useWorkspaceState("housing:catalog-filters", { universityId: "", campusId: "", kind: "", gender: "", scope: "nearby", query: "", page: 1 });
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${JSON.stringify(filters)}:${retry}`;
  const data = response?.key === key ? response.data : null;
  const error = failure?.key === key ? failure.message : "";
  const loading = !data && !error;
  const options = response?.data;
  const [detail, setDetail] = useState<{ place: HousingResult; campus: HousingDirectoryResponse["selectedCampus"] } | null>(null);
  const lastDetail = useRef<typeof detail>(null);
  const { ref: detailRef, close: closeDetail } = useAppLayer({ id: "housing.catalog-detail", open: Boolean(detail), onClose: () => setDetail(null), onRestore: () => setDetail(lastDetail.current) });
  const change = (values: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...values, page: 1 }));

  useEffect(() => {
    const controller = new AbortController();
    const check = capture();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ universityId: filters.universityId, campusId: filters.campusId, kind: filters.kind,
        gender: filters.gender, scope: filters.scope, q: filters.query, page: String(filters.page) });
      void json<HousingDirectoryResponse>(`/api/housing/catalog?${params}`, { signal: controller.signal, cache: "no-store" }, "Konaklama rehberi getirilemedi.").then((result) => {
        if (!Array.isArray(result.places) || !Array.isArray(result.universities) || !Array.isArray(result.campuses) || !result.university?.id || !Number.isFinite(result.total) || !(result.pageSize > 0)) throw new Error("Konaklama yanıtı doğrulanamadı.");
        if (!controller.signal.aborted && check.isCurrent()) setResponse({ key, data: result });
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted && check.isCurrent()) setFailure({ key, message: cause instanceof Error ? cause.message : "Konaklama rehberi getirilemedi." });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, key, json, capture]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const hasCampusCoordinates = Boolean(data?.selectedCampus && Number.isFinite(data.selectedCampus.latitude) && Number.isFinite(data.selectedCampus.longitude));
  return <section className={styles.directory} aria-label="Kaynaklı yurt ve konaklama rehberi">
    <header className={styles.hero}><div className={styles.heroIcon}><Buildings size={28}/></div><div><span>KONAKLAMA REHBERİ</span><h2>Kampüsüne yakın bir yer bul</h2><p>Devlet ve özel yurtlardan apart ve otellere, seçeneklerini aynı yerde incele.</p></div></header>
    <div className={styles.filters}>
      <WorkspaceSearch value={filters.query} onChange={(query) => change({ query: query.slice(0, 100) })} placeholder="Yurt, konaklama veya adres ara" filterCount={Number(Boolean(filters.kind)) + Number(Boolean(filters.gender))} onReset={filters.kind || filters.gender || filters.query ? () => change({ kind: "", gender: "", query: "" }) : undefined}>
      <div className={styles.selectRow}>
        <label>Üniversite<select aria-label="Konaklama için üniversite" value={filters.universityId || options?.university.id || ""} onChange={(e) => change({ universityId: e.target.value, campusId: "" })} disabled={!options}><option value="" disabled>Üniversite seç</option>{options?.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label>Yerleşke<select aria-label="Konaklama için yerleşke" value={filters.campusId || data?.selectedCampus?.id || ""} onChange={(e) => change({ campusId: e.target.value })} disabled={!data || loading}><option value="" disabled>Yerleşke seç</option>{data?.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <label className={styles.acceptance}>Öğrenci kabulü<select aria-label="Öğrenci kabulü" value={filters.gender} onChange={(e) => change({ gender: e.target.value })}><option value="">Tüm kabul türleri</option><option value="female">Kız öğrenciler</option><option value="male">Erkek öğrenciler</option><option value="mixed">Kız ve erkek</option><option value="unknown">Belirtilmemiş</option></select></label>
      <div className={styles.typeFilters} role="group" aria-label="Konaklama türü">{tabs.map(([value, label]) => <button type="button" key={value} aria-pressed={filters.kind === value} onClick={() => change({ kind: value })}>{label}</button>)}</div>
      </WorkspaceSearch>
    </div>
    <div className={styles.scopeRow}><div className={styles.scope} role="group" aria-label="Konaklama mesafe kapsamı"><button type="button" aria-pressed={filters.scope === "nearby"} onClick={() => change({ scope: "nearby" })}>Yerleşkeye göre</button><button type="button" aria-pressed={filters.scope === "city"} onClick={() => change({ scope: "city" })}>Şehirdeki seçenekler</button></div><p role="status" aria-live="polite">{loading ? "Kayıtlar yükleniyor…" : error ? "" : `${data?.total ?? 0} seçenek`}</p></div>
    {data && <p className={styles.context}>{data.university.name} · {data.selectedCampus?.name || "Yerleşke bilgisi yok"}{!hasCampusCoordinates ? " · Yerleşkenin kesin konumu henüz yok. Üniversiteye ait kayıtları veya şehirdeki diğer seçenekleri inceleyebilirsin." : filters.scope === "city" ? " · Yerleşke çevresindeki ve şehir genelindeki kaynaklı seçenekler. Mesafeler kuş uçuşudur; konumu olmayan kayıtlar listenin sonunda yer alır." : " · 5 km çevredeki seçenekler ve üniversitenin listelediği konaklamalar. Mesafeler kuş uçuşudur; yol uzunluğu ve ulaşım süresi farklı olabilir. Konumu olmayan kayıtlarda mesafe gösterilmez."}</p>}
    {error ? <div className={styles.empty} role="alert"><strong>{error}</strong><button type="button" onClick={() => setRetry((r) => r + 1)}>Yeniden dene</button></div>
      : !data ? <div className={styles.empty} aria-busy="true">Konaklama rehberi hazırlanıyor…</div>
        : <div aria-busy={loading} className={loading ? styles.loading : ""}>{data.places.length ? <div className={styles.grid}>{data.places.map((place) => <HousingCard key={place.id} place={place} campus={data.selectedCampus} onOpen={() => { const next = { place, campus: data.selectedCampus }; lastDetail.current = next; setDetail(next); }}/>)}</div> : <div className={styles.empty}><Bed size={32}/><strong>Bu filtrelerle kayıt bulunamadı</strong><p>{data.counts.city > 0 && filters.scope === "nearby" ? `Şehir genelinde inceleyebileceğin ${data.counts.city} ek kaynak kaydı var.` : "Aramayı veya konaklama türünü değiştirerek diğer seçenekleri görebilirsin."}</p><div><button type="button" onClick={() => change({ kind: "", gender: "", query: "" })}>Filtreleri temizle</button>{filters.scope === "nearby" && <button type="button" onClick={() => change({ scope: "city" })}>Şehirdeki seçenekleri göster</button>}</div></div>}</div>}
    {!error && totalPages > 1 && <nav className={styles.pagination} aria-label="Konaklama sayfaları"><button type="button" disabled={loading || data!.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: data!.page - 1 }))}>← Önceki</button><span>{data!.page} / {totalPages}</span><button type="button" disabled={loading || data!.page >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: data!.page + 1 }))}>Sonraki →</button></nav>}
    {detail && <div className={styles.detailOverlay}><section ref={detailRef} className={styles.detailPanel} role="dialog" aria-modal="true" aria-labelledby="housing-catalog-title"><header><div><small>KAYNAKLI KONAKLAMA KAYDI</small><h2 id="housing-catalog-title">{displayName(detail.place.name)}</h2></div><button type="button" onClick={closeDetail} aria-label="Konaklama listesine dön">←</button></header><HousingCard place={detail.place} campus={detail.campus} detailed/></section></div>}
    <footer className={styles.note}><p>Fiyat, boş oda ve başvuru koşullarını doğrudan kurumdan öğren. Konaklama kaydı, üniversitenin anlaşmalı işletmesi olduğu anlamına gelmez.</p><small>Adres ve kurum bilgileri: GSB, üniversiteler ve işletmeler · İl eşleştirmesi: <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries / William &amp; Mary · CC BY-SA 2.0</a> · Açık harita verisi: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap katkıcıları · ODbL</a></small></footer>
  </section>;
}
