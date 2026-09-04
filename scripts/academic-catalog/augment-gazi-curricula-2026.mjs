import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-gazi-universitesi";
const authority = "Gazi Üniversitesi";
const indexUrl = "https://obs.gazi.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr";
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "gazi-bologna-curricula-2026",
  authority,
  title: "Bologna Bilgi Sistemi lisans programları ve dönemlik ders planları",
  url: indexUrl,
};

const officialUnitCodes = new Map([
  ["Diş Hekimliği Fakültesi", "01"],
  ["Eczacılık Fakültesi", "02"],
  ["Fen Fakültesi", "04"],
  ["Gazi Eğitim Fakültesi", "05"],
  ["Hemşirelik Fakültesi", "43"],
  ["Mimarlık Fakültesi", "10"],
  ["Mühendislik Fakültesi", "11"],
  ["Sağlık Bilimleri Fakültesi", "16"],
  ["Teknoloji Fakültesi", "18"],
  ["Tıp Fakültesi", "13"],
  ["Uygulamalı Bilimler Fakültesi", "42"],
]);

const officialNameAliases = new Map([
  ["Eczacılık", "Eczacılık (5 Yıllık)"],
  ["Elektrik-Elektronik Mühendisliği (UOLP-Azerbaycan Teknik Üniversitesi)", "Elektrik-Elektronik Mühendisliği (UOLP-Azerbaycan Teknik Üniversitesi) (Ücretli)"],
  ["Elektrik-Elektronik Mühendisliği (İngilizce)", "Elektrik-Elektronik Mühendisliği (İngiliz)"],
  ["Biyoloji Öğretmenliği", "Biyoloji Öğretmenliği (4 Yıllık)"],
  ["Coğrafya Öğretmenliği", "Coğrafya Öğretmenliği (4 Yıllık)"],
  ["Felsefe Grubu Öğretmenliği", "Felsefe Grubu Öğretmenliği (4 Yıllık)"],
  ["Fizik Öğretmenliği", "Fizik Öğretmenliği (4 Yıllık)"],
  ["Kimya Öğretmenliği", "Kimya Öğretmenliği (4 Yıllık)"],
  ["Matematik Öğretmenliği", "Matematik Öğretmenliği (4 Yıllık)"],
  ["Tarih Öğretmenliği", "Tarih Öğretmenliği (4 Yıllık)"],
  ["Türk Dili ve Edebiyatı Öğretmenliği", "Türk Dili ve Edebiyatı Öğretmenliği (4 Yıllık)"],
]);

// M.T.O.K. seçenekleri ÖSYM kataloğunda ayrı program olarak yer alsa da resmî
// Bologna dizininde yalnızca temel Teknoloji Fakültesi programı yayımlanıyor.
const expectedUnlinked = [
  "Bilgisayar Mühendisliği (M.T.O.K.)",
  "Elektrik-Elektronik Mühendisliği (M.T.O.K.)",
  "Endüstriyel Tasarım Mühendisliği (M.T.O.K.)",
  "Enerji Sistemleri Mühendisliği (M.T.O.K.)",
  "Metalurji ve Malzeme Mühendisliği (M.T.O.K.)",
  "Otomotiv Mühendisliği (M.T.O.K.)",
  "İnşaat Mühendisliği (M.T.O.K.)",
];

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Gazi lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();
const officialProgrammes = [...indexHtml.matchAll(
  /<a[^>]+href=["']([^"']*curUnit=(\d+)[^"']*curSunit=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu,
)].map((match) => ({
  unitCode: match[2].padStart(2, "0"),
  id: match[3],
  name: match[4]
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim(),
}));
if (officialProgrammes.length < 75) {
  throw new Error(`Gazi lisans dizini eksik: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Gazi Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 69) {
  throw new Error(`Gazi katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}

const unitById = new Map(university.units.map((unit) => [unit.id, unit]));
const mappings = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const unitCode = officialUnitCodes.get(unit?.name);
    if (!unitCode) throw new Error(`Gazi resmî birim kodu bulunamadı: ${unit?.name ?? programme.unitId}`);
    const officialName = officialNameAliases.get(programme.name) ?? programme.name;
    const candidates = officialProgrammes.filter((item) => (
      item.unitCode === unitCode && normalizeName(item.name) === normalizeName(officialName)
    ));
    if (candidates.length !== 1) {
      throw new Error(`Gazi program eşleşmesi tekil değil: ${programme.name} (${candidates.length})`);
    }
    return { programme, official: candidates[0] };
  });

for (let offset = 0; offset < mappings.length; offset += 6) {
  const batch = mappings.slice(offset, offset + 6);
  await Promise.all(batch.map(async ({ programme, official }) => {
    const url = `https://obs.gazi.edu.tr/oibs/bologna/progCourses.aspx?curSunit=${official.id}&lang=tr`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    const courseCodes = new Set([
      ...html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,8}[ -]?\d{2,4}\b/gu),
    ].map((match) => match[0]));
    if (!response.ok || html.length < 100_000 || !/\bAKTS\b/iu.test(html) || courseCodes.size < 5) {
      throw new Error(
        `Gazi ders planı doğrulanamadı (${programme.name}, ${official.id}): `
        + `HTTP ${response.status}, ${html.length} bayt, ${courseCodes.size} ders kodu`,
      );
    }
  }));
}

for (const { programme, official } of mappings) {
  programme.curriculumUrls = [`https://obs.gazi.edu.tr/oibs/bologna/progCourses.aspx?curSunit=${official.id}&lang=tr`];
  programme.curriculumAuthority = authority;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Gazi bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.13";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedProgrammes: officialProgrammes.length,
  matchedProgrammes: mappings.length,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
