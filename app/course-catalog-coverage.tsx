"use client";

import { useEffect, useState } from "react";
import styles from "./course-catalog-coverage.module.css";

type University = { universityId: string; name: string; programCount: number; structuredProgramCount: number; courseCount: number; missingProgramCount: number };
type Detail = { universityId: string; checkedAt: string; catalogs: Array<{ url: string; checkedAt: string }>; missingPrograms: Array<{ id: string; name: string; unit: string; reason: string; curriculumUrls: string[] }> };
const number = new Intl.NumberFormat("tr-TR");
const reasons: Record<string, string> = { "programme-source-not-matched": "Resmî program eşleşmesi eksik", "ambiguous-programme-source": "Kaynakta bölüm ayrımı doğrulanamadı", "source-unavailable": "Ders kaynağına erişilemedi", "no-readable-curriculum": "Kaynakta okunabilir ders listesi bulunamadı" };

export function CourseCatalogCoverage() {
  const [open, setOpen] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/course-catalog/coverage", { signal: controller.signal, cache: "no-cache" }).then(async (r) => {
      if (!r.ok) throw new Error();
      const data = await r.json() as { universities: University[] };
      if (!controller.signal.aborted) setUniversities(data.universities.toSorted((a, b) => a.name.localeCompare(b.name, "tr")));
    }).catch(() => { if (!controller.signal.aborted) setError("Katalog kapsamı yüklenemedi."); });
    return () => controller.abort();
  }, [open, retry]);
  useEffect(() => {
    if (!open || !universityId) return;
    const controller = new AbortController();
    fetch(`/api/course-catalog/coverage?universityId=${encodeURIComponent(universityId)}`, { signal: controller.signal, cache: "no-cache" }).then(async (r) => {
      if (!r.ok) throw new Error();
      const data = await r.json() as Detail;
      if (!controller.signal.aborted) setDetail(data);
    }).catch(() => { if (!controller.signal.aborted) setError("Üniversitenin katalog bilgileri yüklenemedi."); });
    return () => controller.abort();
  }, [open, universityId, retry]);
  const university = universities.find((u) => u.universityId === universityId);
  const current = detail?.universityId === universityId ? detail : null;
  const missing = (current?.missingPrograms ?? []).filter((p) => `${p.name} ${p.unit}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  return <details className={styles.panel} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><strong>Türkiye ders katalogları</strong><span>Üniversite bazında kapsamı ve eksik programları incele</span></summary>
    <div className={styles.content}>
      <p>Listeler resmî kaynakta okunabilen dersleri içerir. Bir programın listelenmesi, müfredatının eksiksiz olduğu anlamına gelmez.</p>
      {error && <div role="alert">{error} <button type="button" onClick={() => { setError(""); setRetry((r) => r + 1); }}>Yeniden dene</button></div>}
      {!universities.length && !error ? <p role="status">Üniversiteler yükleniyor…</p> : <label>Üniversite<select value={universityId} onChange={(event) => { setUniversityId(event.target.value); setError(""); setQuery(""); setLimit(20); }}><option value="">Üniversite seç</option>{universities.map((u) => <option key={u.universityId} value={u.universityId}>{u.name} — {u.structuredProgramCount}/{u.programCount} program</option>)}</select></label>}
      {university && <div className={styles.metrics}><span><strong>{number.format(university.structuredProgramCount)} / {number.format(university.programCount)}</strong>Ders listesi bulunan program</span><span><strong>{number.format(university.courseCount)}</strong>Ders kaydı</span><span><strong>{number.format(university.missingProgramCount)}</strong>Ders listesi eksik program</span></div>}
      {universityId && !current && !error && <p role="status">Programlar yükleniyor…</p>}
      {current && <>
        <div className={styles.sources}>{current.catalogs.map((c, i) => <a key={c.url} href={c.url} target="_blank" rel="noreferrer">Resmî katalog{current.catalogs.length > 1 ? ` ${i + 1}` : ""} ↗</a>)}</div>
        {current.missingPrograms.length > 0 ? <>
          <label>Eksik programlarda ara<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} placeholder="Bölüm veya fakülte adı" /></label>
          <p role="status">{number.format(missing.length)} program · Son kontrol: {current.checkedAt}</p>
          <ul className={styles.programs}>{missing.slice(0, limit).map((p) => <li key={p.id}><div><strong>{p.name}</strong><small>{p.unit}</small><small>{reasons[p.reason] ?? "Ders listesi eksik"}</small></div>{p.curriculumUrls[0] && <a href={p.curriculumUrls[0]} target="_blank" rel="noreferrer">Müfredatı aç ↗</a>}</li>)}</ul>
          {missing.length > limit && <button type="button" onClick={() => setLimit((value) => value + 20)}>Sonraki 20 programı göster</button>}
        </> : <p>Bu üniversitedeki tüm katalog programları için ders kaydı var. Listelerin içindeki ders kapsamı kısmi olabilir.</p>}
      </>}
    </div>
  </details>;
}
