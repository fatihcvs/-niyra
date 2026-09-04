import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-ege-universitesi";
const authority = "Ege Üniversitesi";
const baseUrl = "https://ebp.ege.edu.tr";
const indexUrl = `${baseUrl}/DereceProgramlari/1`;
const jsonUrl = `${baseUrl}/DereceProgramlari/GetJson/1?lang=tr-TR`;
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "ege-ebp-curricula-2026",
  authority,
  title: "Bilgi Paketi / Ders Kataloğu lisans programları ve ders planları",
  url: indexUrl,
};

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

const cleanName = (value) => value
  .replace(/\s*\([ab]\)\s*$/iu, "")
  .replace(/\s+/gu, " ")
  .trim();

const programmeNameAliases = new Map([
  ["Diş Hekimliği Fakültesi", "Diş Hekimliği"],
  ["Eczacılık Fakültesi", "Eczacılık"],
  ["Tıp Fakültesi", "Tıp"],
  ["Alman Dili ve Edebiyatı", "Alman Dili ve Edebiyatı (Almanca)"],
  ["Amerikan Kültürü ve Edebiyatı", "Amerikan Kültürü ve Edebiyatı (İngilizce)"],
  ["İngiliz Dili ve Edebiyatı", "İngiliz Dili ve Edebiyatı (İngilizce)"],
  ["Mütercim-Tercümanlık (Almanca)", "Almanca Mütercim ve Tercümanlık"],
  ["Mütercim-Tercümanlık (İngilizce)", "İngilizce Mütercim ve Tercümanlık"],
  ["Endüstüriyel Tasarım", "Endüstriyel Tasarım"],
  ["Kimya Mühendisliği", "Kimya Mühendisliği (İngilizce)"],
  [
    "Gıda Mühendisliği (UOLP-Azerbaycan Devlet İktisat Üniversitesi)(Ücretli)",
    "Gıda Mühendisliği (UOLP-Azerbaycan Devlet İktisat Üniversitesi)",
  ],
]);

const unitNameAliases = new Map([
  ["Dişhekimliği Fakültesi", "Diş Hekimliği Fakültesi"],
]);

const expectedUnlinked = [
  "Bilgisayar Mühendisliği (İngilizce)",
  "Yapay Zeka ve Veri Mühendisliği (İngilizce)",
  "İlahiyat (M.T.O.K.)",
];

const multiTrackCounts = new Map([
  ["Su Ürünleri Mühendisliği", 3],
  ["Biyoloji", 5],
  ["Biyokimya", 2],
  ["Matematik", 3],
]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchVerifiedPage(url) {
  let lastResult;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pageResponse = await fetch(url, { headers });
    const html = await pageResponse.text();
    lastResult = { pageResponse, html };
    if (pageResponse.ok && html.length >= 25_000) return lastResult;
    await delay(500 * (attempt + 1));
  }
  return lastResult;
}

function toCatalogueName(programmeName, degreeName) {
  let name = cleanName(programmeName);
  if (normalizeName(degreeName) === normalizeName("Lisans (İngilizce)") && !/\(İngilizce\)$/iu.test(name)) {
    name += " (İngilizce)";
  } else if (!/^Lisans(?:\s+Programı|\s+ve Yüksek Lisans|\s*\([^)]*\))?$/iu.test(degreeName)) {
    name = cleanName(degreeName)
      .replace(/^"|"$/gu, "")
      .replace(/\s+Ağırlıklı Lisans$/iu, "")
      .replace(/\s+Lisans$/iu, "");
  }
  return programmeNameAliases.get(name) ?? name;
}

const response = await fetch(jsonUrl, { headers });
if (!response.ok) throw new Error(`Ege lisans dizini alınamadı: HTTP ${response.status}`);
const tree = await response.json();
if (!Array.isArray(tree) || tree.length < 20) throw new Error(`Ege lisans birim dizini eksik: ${tree?.length ?? 0}`);

const officialProgrammes = [];
for (const officialUnit of tree) {
  const unit = unitNameAliases.get(cleanName(officialUnit.text)) ?? cleanName(officialUnit.text);
  for (const programme of officialUnit.children ?? []) {
    const leaves = (programme.children ?? []).filter((item) => item.a_attr?.href);
    for (const leaf of leaves) {
      officialProgrammes.push({
        unit,
        name: toCatalogueName(programme.text, leaf.text),
        rawProgrammeName: programme.text,
        rawDegreeName: leaf.text,
        url: new URL(leaf.a_attr.href, baseUrl).href,
      });
    }
  }
}

if (officialProgrammes.length < 100) {
  throw new Error(`Ege yayımlanmış lisans planı sayısı eksik: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Ege Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 74) {
  throw new Error(`Ege katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}
const unitById = new Map(university.units.map((unit) => [unit.id, unit]));

const mappings = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    let candidates = officialProgrammes.filter((item) => (
      normalizeName(item.unit) === normalizeName(unit?.name ?? "")
      && normalizeName(item.name) === normalizeName(programme.name)
    ));
    if (multiTrackCounts.has(programme.name)) {
      candidates = officialProgrammes.filter((item) => (
        normalizeName(item.unit) === normalizeName(unit?.name ?? "")
        && normalizeName(cleanName(item.rawProgrammeName)) === normalizeName(programme.name)
      ));
    }
    if (candidates.length > 1 && programme.name === "Sosyoloji") {
      candidates = candidates.filter((item) => /^Lisans$/iu.test(item.rawDegreeName));
    }
    if (candidates.length > 1 && programme.name === "Turizm Rehberliği") {
      candidates = candidates.filter((item) => /Lisans \(Zorunlu\)/iu.test(item.rawDegreeName));
    }
    const expectedCandidateCount = multiTrackCounts.get(programme.name) ?? 1;
    if (candidates.length !== expectedCandidateCount) {
      throw new Error(
        `Ege program eşleşmesi tekil değil: ${unit?.name} / ${programme.name} (${candidates.length})`,
      );
    }
    return { programme, officials: candidates };
  });

for (let offset = 0; offset < mappings.length; offset += 2) {
  const batch = mappings.slice(offset, offset + 2);
  await Promise.all(batch.flatMap(({ programme, officials }) => officials.map(async (official) => {
    const { pageResponse, html } = await fetchVerifiedPage(official.url);
    const courseCodes = new Set([
      ...html.matchAll(/\b(?:[A-ZÇĞİÖŞÜ]{2,12}[ ._-]?)?\d{2,14}[A-ZÇĞİÖŞÜ]?\b/gu),
    ].map((match) => match[0]));
    const semesterCount = new Set([
      ...html.matchAll(/(\d+)\.\s*D(?:ö|&#246;)nem/giu),
    ].map((match) => match[1]));
    if (!pageResponse.ok || html.length < 25_000 || !/\bAKTS\b/iu.test(html)
      || courseCodes.size < 5 || semesterCount.size < 2) {
      throw new Error(
        `Ege ders planı doğrulanamadı (${programme.name}): HTTP ${pageResponse.status}, `
        + `${html.length} bayt, ${courseCodes.size} kod, ${semesterCount.size} dönem`,
      );
    }
  })));
}

for (const { programme, officials } of mappings) {
  programme.curriculumUrls = officials.map((official) => official.url);
  programme.curriculumAuthority = authority;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Ege bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.16";
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
