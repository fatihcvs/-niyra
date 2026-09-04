import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-dokuz-eylul-universitesi";
const authority = "Dokuz Eylül Üniversitesi";
const period = "2025-2026";
const baseUrl = `https://debis.deu.edu.tr/ders-katalog/${period}/tr/`;
const indexUrl = `${baseUrl}tr-c3.html`;
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "deu-course-catalog-curricula-2026",
  authority,
  title: `${period} Ders Kataloğu lisans programları ve ders planları`,
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
  .replace(/&ouml;|&#246;/giu, "ö")
  .replace(/&uuml;|&#252;/giu, "ü")
  .replace(/&ccedil;|&#231;/giu, "ç")
  .replace(/&Ouml;|&#214;/gu, "Ö")
  .replace(/&Uuml;|&#220;/gu, "Ü")
  .replace(/&Ccedil;|&#199;/gu, "Ç")
  .replace(/\s+/gu, " ")
  .trim();

const programmeNameAliases = new Map([
  ["Tıp Doktorluğu", "Tıp"],
  ["Elektrik - Elektronik Mühendisliği (İngilizce)", "Elektrik-Elektronik Mühendisliği (İngilizce)"],
  ["Makina Mühendisliği", "Makine Mühendisliği"],
  ["Veteriner Hekimliği", "Veteriner"],
  [
    "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce) ((SUNY Albany))",
    "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce) ((uolp-New York Eyalet Üniversitesi (suny Albany))",
  ],
]);

const expectedUnlinked = [
  "Tıp (İngilizce)",
  "İlahiyat (M.T.O.K.)",
  "Turizm ve Gastronomi Yönetimi Programları (İngilizce)",
  "İktisat (UOLP-Gence Devlet Üniversitesi)",
  "Tarih (UOLP-Gence Devlet Üniversitesi)",
  "Havacılık ve Uzay Mühendisliği (İngilizce)",
  "Radyo, Televizyon ve Sinema",
];

const response = await fetch(indexUrl, { headers });
if (!response.ok) throw new Error(`Dokuz Eylül lisans dizini alınamadı: HTTP ${response.status}`);
const indexHtml = await response.text();
if (indexHtml.length < 25_000 || !indexHtml.includes('id="onlisans"')) {
  throw new Error(`Dokuz Eylül lisans dizini eksik: ${indexHtml.length} bayt`);
}

function extractOfficialProgrammes(html) {
  const rootStart = html.search(/<ul\b[^>]*\bid=["']onlisans["'][^>]*>/iu);
  if (rootStart < 0) throw new Error("Dokuz Eylül lisans program ağacı bulunamadı.");
  const content = html.slice(rootStart);
  const tokenPattern = /<a\b[^>]*\bhref=["']([^"']*bolum_[^"']+)["'][^>]*>([\s\S]*?)<\/a>|<ul\b[^>]*>|<\/ul\s*>|<li\b[^>]*>|<\/li\s*>|[^<]+/giu;
  const stack = [];
  const programmes = [];
  let listDepth = -1;
  let rootSeen = false;

  for (const match of content.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<ul\b/iu.test(token)) {
      listDepth += 1;
      rootSeen = true;
      continue;
    }
    if (/^<\/ul/iu.test(token)) {
      if (listDepth === 0) break;
      listDepth -= 1;
      continue;
    }
    if (!rootSeen) continue;
    if (/^<li\b/iu.test(token)) {
      stack.push({ depth: listDepth, text: "" });
      continue;
    }
    if (/^<\/li/iu.test(token)) {
      stack.pop();
      continue;
    }
    if (match[1]) {
      const unit = stack[0]?.text;
      const name = cleanText(match[2]);
      if (unit && name) {
        programmes.push({
          unit,
          name: programmeNameAliases.get(name) ?? name,
          rawName: name,
          url: new URL(match[1], baseUrl).href,
        });
      }
      continue;
    }
    const text = cleanText(token);
    const current = stack.at(-1);
    if (text && current && !current.text) current.text = text;
  }
  return programmes;
}

const officialProgrammes = extractOfficialProgrammes(indexHtml);
if (officialProgrammes.length < 130) {
  throw new Error(`Dokuz Eylül yayımlanmış lisans planı sayısı eksik: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Dokuz Eylül Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 88) {
  throw new Error(`Dokuz Eylül katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}
const unitById = new Map(university.units.map((unit) => [unit.id, unit]));

const mappings = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const candidates = officialProgrammes.filter((item) => (
      normalizeName(item.unit) === normalizeName(unit?.name ?? "")
      && normalizeName(item.name) === normalizeName(programme.name)
    ));
    if (candidates.length !== 1) {
      throw new Error(
        `Dokuz Eylül program eşleşmesi tekil değil: ${unit?.name} / ${programme.name} (${candidates.length})`,
      );
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
    if (pageResponse.ok && html.length >= 25_000) return lastResult;
    await delay(400 * (attempt + 1));
  }
  return lastResult;
}

for (let offset = 0; offset < mappings.length; offset += 4) {
  const batch = mappings.slice(offset, offset + 4);
  await Promise.all(batch.map(async ({ programme, official }) => {
    const { pageResponse, html } = await fetchVerifiedPage(official.url);
    const courseCodes = new Set([
      ...html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,12}\s*\d{2,4}[A-ZÇĞİÖŞÜ]?\b/gu),
    ].map((match) => match[0].replace(/\s+/gu, "")));
    const semesterCount = new Set([
      ...html.matchAll(/([1-8])\.\s*(?:Yarıyıl|Dönem)/giu),
    ].map((match) => match[1]));
    const hasStructuredPeriods = semesterCount.size >= 2 || courseCodes.size >= 20;
    if (!pageResponse.ok || html.length < 25_000 || !/\bAKTS\b/iu.test(html)
      || courseCodes.size < 5 || !hasStructuredPeriods) {
      throw new Error(
        `Dokuz Eylül ders planı doğrulanamadı (${programme.name}): HTTP ${pageResponse.status}, `
        + `${html.length} bayt, ${courseCodes.size} kod, ${semesterCount.size} dönem`,
      );
    }
  }));
}

for (const { programme, official } of mappings) {
  programme.curriculumUrls = [official.url];
  programme.curriculumAuthority = authority;
  programme.curriculumPeriod = period;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Dokuz Eylül bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.17";
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
