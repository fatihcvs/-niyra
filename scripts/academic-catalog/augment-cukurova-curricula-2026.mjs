import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-cukurova-universitesi";
const authority = "Çukurova Üniversitesi";
const baseUrl = "https://ebs.cu.edu.tr";
const indexUrl = "https://eobs.cu.edu.tr/";
const headers = { "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "cukurova-ebs-curricula-2026",
  authority,
  title: "Eğitim Bilgi Sistemi 2026-2027 lisans programları ve ders planları",
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
  .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/\s+/gu, " ")
  .trim();

const officialNameAliases = new Map();

const expectedUnlinked = [
  "Gastronomi ve Mutfak Sanatları",
  "Grafik Tasarımı",
  "İlahiyat (M.T.O.K.)",
];

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Çukurova lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();
const bachelorStart = indexHtml.search(/<div>\s*Lisans\s*<\/div>/iu);
const graduateStart = indexHtml.search(/<div>\s*Y(?:ü|&#xFC;|&#252;)ksek Lisans\s*<\/div>/iu);
if (indexHtml.length < 100_000 || bachelorStart < 0 || graduateStart <= bachelorStart) {
  throw new Error(`Çukurova lisans dizini eksik: ${indexHtml.length} bayt`);
}
const bachelorHtml = indexHtml.slice(bachelorStart, graduateStart);

const officialProgrammes = [];
for (const unitMatch of bachelorHtml.matchAll(
  /<li\b[^>]*class=["'][^"']*menu-item[^"']*["'][^>]*>\s*<a\b[^>]*href=["']#["'][^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/a>\s*<ul\b[^>]*class=["'][^"']*sub-menu-container[^"']*["'][^>]*>([\s\S]*?)<\/ul>\s*<\/li>/giu,
)) {
  const unit = cleanText(unitMatch[1]);
  for (const programmeMatch of unitMatch[2].matchAll(
    /<a\b[^>]*href=["']\/Program\/GenelBilgi\/(\d+)["'][^>]*>\s*<div>([\s\S]*?)<\/div>\s*<\/a>/giu,
  )) {
    const id = programmeMatch[1];
    let name = cleanText(programmeMatch[2]);
    if (!name && unit === "Güzel Sanatlar Fakültesi" && id === "332") name = "Gastronomi ve Mutfak Sanatları";
    if (name) officialProgrammes.push({ unit, id, name });
  }
}
if (officialProgrammes.length < 90) {
  throw new Error(`Çukurova yayımlanmış lisans programı dizini eksik: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Çukurova Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 72) {
  throw new Error(`Çukurova katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}
const unitById = new Map(university.units.map((unit) => [unit.id, unit]));

const mappings = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const officialName = officialNameAliases.get(`${unit?.name}|${programme.name}`) ?? programme.name;
    const candidates = officialProgrammes.filter((item) => (
      normalizeName(item.unit) === normalizeName(unit?.name ?? "")
      && normalizeName(item.name) === normalizeName(officialName)
    ));
    if (candidates.length !== 1) {
      throw new Error(`Çukurova program eşleşmesi tekil değil: ${unit?.name} / ${programme.name} (${candidates.length})`);
    }
    return { programme, official: candidates[0] };
  });

const years = [
  { route: "2026", period: "2026-2027" },
  { route: "2025", period: "2025-2026" },
];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findVerifiedPlan(programme, official) {
  let lastFailure = "yanıt yok";
  for (const year of years) {
    const url = `${baseUrl}/Program/DersPlan/${official.id}/${year.route}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(url, { headers });
      const html = await response.text();
      const courseCodes = new Set([
        ...html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,12}\s*\d{2,5}[A-ZÇĞİÖŞÜ]?\b/gu),
      ].map((match) => match[0].replace(/\s+/gu, "")));
      const semesters = new Set([
        ...html.matchAll(/([1-9]|1[0-2])\.\s*Yarıyıl/giu),
      ].map((match) => match[1]));
      if (response.ok && html.length >= 75_000 && /\bAKTS\b/iu.test(html)
        && courseCodes.size >= 5 && (semesters.size >= 2 || courseCodes.size >= 20)) {
        return { url, period: year.period };
      }
      lastFailure = `${year.period}: HTTP ${response.status}, ${html.length} bayt, ${courseCodes.size} kod, ${semesters.size} yarıyıl`;
      await delay(300 * (attempt + 1));
    }
  }
  throw new Error(`Çukurova ders planı doğrulanamadı (${programme.name}, ${official.id}): ${lastFailure}`);
}

for (let offset = 0; offset < mappings.length; offset += 4) {
  const batch = mappings.slice(offset, offset + 4);
  const verified = await Promise.all(batch.map(({ programme, official }) => findVerifiedPlan(programme, official)));
  batch.forEach((mapping, index) => { mapping.plan = verified[index]; });
}

for (const { programme, plan } of mappings) {
  programme.curriculumUrls = [plan.url];
  programme.curriculumAuthority = authority;
  programme.curriculumPeriod = plan.period;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Çukurova bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.19";
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
  periods: Object.fromEntries(years.map(({ period }) => [
    period,
    mappings.filter((mapping) => mapping.plan.period === period).length,
  ])),
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
