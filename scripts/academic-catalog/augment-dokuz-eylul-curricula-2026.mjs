import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-dokuz-eylul-universitesi";
const authority = "Dokuz Eylül Üniversitesi";
const period = "2025-2026";
const baseUrl = `https://debis.deu.edu.tr/ders-katalog/${period}/tr/`;
const indexUrls = {
  bachelor: `${baseUrl}tr-c3.html`,
  associate: `${baseUrl}tr-c4.html`,
};
const headers = { "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const sources = [
  {
    id: "deu-course-catalog-curricula-2026",
    authority,
    title: `${period} Ders Kataloğu lisans programları ve ders planları`,
    url: indexUrls.bachelor,
  },
  {
    id: "deu-associate-course-catalog-curricula-2026",
    authority,
    title: `${period} Ders Kataloğu ön lisans programları ve ders planları`,
    url: indexUrls.associate,
  },
];

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
  "Laboratuvar Hayvanları",
  "Tarım Makineleri ve Teknolojileri",
];

function extractOfficialProgrammes(html, degree) {
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
          degree,
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

const indexPages = await Promise.all(Object.entries(indexUrls).map(async ([degree, url]) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Dokuz Eylül ${degree} dizini alınamadı: HTTP ${response.status}`);
  const html = await response.text();
  if (html.length < (degree === "bachelor" ? 25_000 : 15_000) || !html.includes('id="onlisans"')) {
    throw new Error(`Dokuz Eylül ${degree} dizini eksik: ${html.length} bayt`);
  }
  const programmes = extractOfficialProgrammes(html, degree);
  const minimum = degree === "bachelor" ? 130 : 45;
  if (programmes.length < minimum) {
    throw new Error(`Dokuz Eylül yayımlanmış ${degree} planı sayısı eksik: ${programmes.length}`);
  }
  return { degree, programmes };
}));
const officialProgrammes = indexPages.flatMap((page) => page.programmes);

const university = catalog.universities[universityId];
if (!university) throw new Error("Dokuz Eylül Üniversitesi katalog kaydı bulunamadı.");
const degreeProgrammes = university.programs.filter((item) => ["associate", "bachelor"].includes(item.degreeLevel));
if (degreeProgrammes.length !== 139) {
  throw new Error(`Dokuz Eylül katalog program sayısı beklenmiyor: ${degreeProgrammes.length}`);
}
const unitById = new Map(university.units.map((unit) => [unit.id, unit]));
const normalizeUnitName = (value) => normalizeName(value).replace(/\s+selcuk$/u, "");

const mappings = degreeProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const candidates = officialProgrammes.filter((item) => (
      item.degree === programme.degreeLevel
      && normalizeUnitName(item.unit) === normalizeUnitName(unit?.name ?? "")
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
    const hasStructuredPeriods = semesterCount.size >= 2
      || (semesterCount.size >= 1 && courseCodes.size >= 10)
      || courseCodes.size >= 20;
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

const unlinkedProgrammes = degreeProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedProgrammes.some((program) => program.name === name))) {
  throw new Error(`Dokuz Eylül bağlantısız program listesi beklenmiyor: ${unlinkedProgrammes.map((program) => program.name).join(", ")}`);
}

for (const source of sources) {
  if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);
}

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
  officialPublishedProgrammes: Object.fromEntries(indexPages.map((page) => [page.degree, page.programmes.length])),
  matchedProgrammes: mappings.length,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
