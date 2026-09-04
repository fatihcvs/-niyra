import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-istanbul-universitesi";
const authority = "İstanbul Üniversitesi";
const baseUrl = "https://ebs.istanbul.edu.tr";
const indexUrl = `${baseUrl}/home/lisans`;
const treeUrl = `${baseUrl}/home/getdata/?id=3`;
const years = [2026, 2025, 2024];
const headers = { "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "istanbul-ebs-curricula-2026",
  authority,
  title: "Eğitim Bilgi Sistemi lisans programları ve dönemlik ders planları",
  url: indexUrl,
};

const officialNameAliases = new Map([
  ["İktisat (İngilizce)", "İngilizce İktisat"],
  ["Alman Dili ve Edebiyatı (Almanca)", "Alman Dili ve Edebiyatı"],
  ["Amerikan Kültürü ve Edebiyatı (İngilizce)", "Amerikan Kültürü ve Edebiyatı"],
  ["Fransız Dili ve Edebiyatı (Fransızca)", "Fransız Dili ve Edebiyatı"],
  ["Kore Dili ve Edebiyatı (Korece)", "Kore Dili ve Edebiyatı"],
  ["Protohistorya ve Ön Asya Arkeolojisi", "Protohistorya ve Önasya Arkeolojisi"],
  ["Çin Dili ve Edebiyatı (Çince)", "Çin Dili ve Edebiyatı"],
  ["İngiliz Dili ve Edebiyatı (İngilizce)", "İngiliz Dili ve Edebiyatı"],
]);

// Bu programlar 2026 ÖSYM kataloğunda yer alıyor; EBS lisans ağacında program
// adına özel ayrı ve dolu bir ders planı henüz yayımlanmadı.
const expectedUnlinked = [
  "İlahiyat (Arapça) (M.T.O.K.)",
  "İlahiyat (M.T.O.K.)",
  "İlahiyat (İngilizce) (M.T.O.K.)",
  "İngiliz Dili ve Edebiyatı (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "İktisat (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Bilgisayar Mühendisliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "İşletme (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Yapay Zeka ve Veri Mühendisliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
];

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

function parseOfficialProgramme(node, faculty) {
  const text = String(node.text ?? "").replace(/\s+/gu, " ").trim();
  const marker = text.search(/,?\s*LİSANS (?:TAMAMLAMA )?PROGRAMI\s*,?/iu);
  if (marker < 0) return null;

  const baseName = text.slice(0, marker).replace(/,+$/u, "").trim();
  const mode = text.slice(marker).match(/\((AÇIKÖĞRETİM|UZAKTAN ÖĞRETİM|İKİNCİ ÖĞRETİM|ÖRGÜN ÖĞRETİM)\)/iu)?.[1]
    ?.toLocaleUpperCase("tr-TR");
  let name = baseName;
  if (mode === "AÇIKÖĞRETİM") name = `${baseName} (Açıköğretim)`;
  if (mode === "UZAKTAN ÖĞRETİM") name = `${baseName} (Uzaktan Öğretim)`;

  return {
    id: Number(node.id),
    name,
    facultyName: String(faculty.text ?? "").trim(),
    isCompletion: /LİSANS TAMAMLAMA PROGRAMI/iu.test(text),
    isSecondEducation: mode === "İKİNCİ ÖĞRETİM",
  };
}

async function getText(url) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  return { response, text };
}

const indexResponse = await getText(indexUrl);
if (!indexResponse.response.ok || !indexResponse.text.includes("/home/getdata/?id=3")) {
  throw new Error(`İstanbul Üniversitesi lisans dizini doğrulanamadı: HTTP ${indexResponse.response.status}`);
}

const treeResponse = await fetch(treeUrl, { headers });
if (!treeResponse.ok) throw new Error(`İstanbul Üniversitesi lisans ağacı alınamadı: HTTP ${treeResponse.status}`);
const tree = await treeResponse.json();
const officialProgrammes = tree.flatMap((faculty) => (
  (faculty.nodes ?? []).map((node) => parseOfficialProgramme(node, faculty)).filter(Boolean)
));
if (tree.length < 18 || officialProgrammes.length < 200) {
  throw new Error(`İstanbul Üniversitesi lisans ağacı eksik: ${tree.length} birim, ${officialProgrammes.length} program`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("İstanbul Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 118) {
  throw new Error(`İstanbul Üniversitesi katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}

const unitById = new Map(university.units.map((unit) => [unit.id, unit]));
const candidateSets = bachelorProgrammes
  .filter((programme) => !expectedUnlinked.includes(programme.name))
  .map((programme) => {
    const unit = unitById.get(programme.unitId);
    const targetName = officialNameAliases.get(programme.name) ?? programme.name;
    const candidates = officialProgrammes.filter((item) => (
      normalizeName(item.name) === normalizeName(targetName)
      && normalizeName(item.facultyName) === normalizeName(unit?.name ?? "")
      && !item.isCompletion
      && !item.isSecondEducation
    ));
    if (candidates.length === 0) {
      throw new Error(`İstanbul Üniversitesi EBS programı bulunamadı: ${programme.name} (${unit?.name ?? "birimsiz"})`);
    }
    return { programme, candidates };
  });

async function validateCandidate(candidate) {
  for (const year of years) {
    const url = `${baseUrl}/home/dersprogram/?id=${candidate.id}&yil=${year}`;
    const { response, text } = await getText(url);
    const rowCount = (text.match(/<tr\b/giu) ?? []).length;
    const ectsMentions = (text.match(/\bAKTS\b/gu) ?? []).length;
    if (response.ok && /M(?:ü|&#252;)fredat/iu.test(text) && rowCount >= 8 && ectsMentions >= 2) {
      return { candidate, year, url, rowCount };
    }
  }
  return null;
}

const validations = [];
for (let offset = 0; offset < candidateSets.length; offset += 6) {
  const batch = candidateSets.slice(offset, offset + 6);
  const results = await Promise.all(batch.map(async ({ programme, candidates }) => {
    const candidateResults = (await Promise.all(candidates.map(validateCandidate))).filter(Boolean);
    if (candidateResults.length !== 1) {
      return {
        programme,
        error: candidateResults.map((item) => `${item.candidate.id}/${item.year}`).join(", ") || "dolu plan yok",
      };
    }
    return { programme, ...candidateResults[0] };
  }));
  validations.push(...results);
}

const invalidCurricula = validations.filter((item) => item.error);
if (invalidCurricula.length) {
  throw new Error(`İstanbul Üniversitesi ders planları doğrulanamadı: ${invalidCurricula.map((item) => (
    `${item.programme.name} (${item.error})`
  )).join("; ")}`);
}

for (const { programme, url, year } of validations) {
  programme.curriculumUrls = [url];
  programme.curriculumAuthority = authority;
  programme.curriculumPeriod = String(year);
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(
    `İstanbul Üniversitesi bağlantısız lisans listesi beklenmiyor: `
    + unlinkedBachelorProgrammes.map((program) => program.name).join(", "),
  );
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.12";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

const periodCounts = Object.fromEntries(years.map((year) => [
  year,
  validations.filter((item) => item.year === year).length,
]));
console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialUnits: tree.length,
  officialBachelorRecords: officialProgrammes.length,
  matchedProgrammes: validations.length,
  periodCounts,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
