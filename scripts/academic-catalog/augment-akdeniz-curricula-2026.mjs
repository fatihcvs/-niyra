import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-akdeniz-universitesi";
const authority = "Akdeniz Üniversitesi";
const baseUrl = "https://obs.akdeniz.edu.tr/oibs/bologna/";
const indexUrl = `${baseUrl}unitSelection.aspx?type=lis&lang=tr`;
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "akdeniz-bologna-curricula-2026",
  authority,
  title: "Bologna Bilgi Sistemi lisans programları ve dönemlik ders planları",
  url: indexUrl,
};

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

const cleanText = (value) => value
  .replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;|&#34;/giu, "\"")
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/\s+/gu, " ")
  .trim();

const officialNameAliases = new Map([
  ["Edebiyat Fakültesi|Alman Dili ve Edebiyatı", "Alman Dili ve Edebiyatı (Almanca)"],
  ["Hukuk Fakültesi|Hukuk", "Hukuk (Yıllık)"],
  ["İlahiyat Fakültesi|İlahiyat (M.T.O.K.)", "İlahiyat (MTOK)"],
  ["Turizm Fakültesi|Turizm İşletmeciliği", "Turizm İşletmeciliği (Türkçe)"],
]);

const expectedUnlinked = [
  // Resmî lisans dizinindeki hedef Bologna planı yerine OBS ana sayfasına gidiyor.
  "Tarım Ekonomisi",
];

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Akdeniz lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();
if (indexHtml.length < 100_000) throw new Error(`Akdeniz lisans dizini eksik: ${indexHtml.length} bayt`);

const officialUnits = new Map([
  ...indexHtml.matchAll(/<a[^>]+href=["']#x(\d+)["'][^>]*>([\s\S]*?)<\/a>/giu),
].map((match) => [normalizeName(cleanText(match[2])), match[1].padStart(2, "0")]));

const officialProgrammes = [...indexHtml.matchAll(
  /<a[^>]+href=["']([^"']*curUnit=(\d+)[^"']*curSunit=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu,
)].map((match) => ({
  unitCode: match[2].padStart(2, "0"),
  id: match[3],
  name: cleanText(match[4]),
}));
if (officialUnits.size < 20 || officialProgrammes.length < 140) {
  throw new Error(`Akdeniz lisans dizini eksik: ${officialUnits.size} birim, ${officialProgrammes.length} program`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Akdeniz Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 90) {
  throw new Error(`Akdeniz katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}
const unitById = new Map(university.units.map((unit) => [unit.id, unit]));

const mappings = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const unitCode = officialUnits.get(normalizeName(unit?.name ?? ""));
    if (!unitCode) throw new Error(`Akdeniz resmî birim kodu bulunamadı: ${unit?.name ?? programme.unitId}`);
    const officialName = officialNameAliases.get(`${unit.name}|${programme.name}`) ?? programme.name;
    const candidates = officialProgrammes.filter((item) => (
      item.unitCode === unitCode && normalizeName(item.name) === normalizeName(officialName)
    ));
    if (candidates.length !== 1) {
      throw new Error(`Akdeniz program eşleşmesi tekil değil: ${unit.name} / ${programme.name} (${candidates.length})`);
    }
    return { programme, official: candidates[0] };
  });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchVerifiedPage(url) {
  let lastResult;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pageResponse = await fetch(url, { headers });
    const html = await pageResponse.text();
    lastResult = { pageResponse, html };
    if (pageResponse.ok && html.length >= 80_000) return lastResult;
    await delay(400 * (attempt + 1));
  }
  return lastResult;
}

for (let offset = 0; offset < mappings.length; offset += 5) {
  const batch = mappings.slice(offset, offset + 5);
  await Promise.all(batch.map(async ({ programme, official }) => {
    const url = `${baseUrl}progCourses.aspx?curSunit=${official.id}&lang=tr`;
    const { pageResponse, html } = await fetchVerifiedPage(url);
    const courseCodes = new Set([
      ...html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,10}[ -]?\d{2,5}[A-ZÇĞİÖŞÜ]?\b/gu),
    ].map((match) => match[0].replace(/\s+/gu, "")));
    if (!pageResponse.ok || html.length < 80_000 || !/\bAKTS\b/iu.test(html) || courseCodes.size < 5) {
      throw new Error(
        `Akdeniz ders planı doğrulanamadı (${programme.name}, ${official.id}): `
        + `HTTP ${pageResponse.status}, ${html.length} bayt, ${courseCodes.size} ders kodu`,
      );
    }
  }));
}

for (const { programme, official } of mappings) {
  programme.curriculumUrls = [`${baseUrl}progCourses.aspx?curSunit=${official.id}&lang=tr`];
  programme.curriculumAuthority = authority;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Akdeniz bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.18";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedUnits: officialUnits.size,
  officialPublishedProgrammes: officialProgrammes.length,
  matchedProgrammes: mappings.length,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
