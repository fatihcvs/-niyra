import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-ankara-universitesi";
const authority = "Ankara Üniversitesi";
const apiBaseUrl = "https://bologna.ankara.edu.tr/api";
const publicBaseUrl = "https://bologna.ankara.edu.tr";
const bachelorProgrammeTypeId = "e0000000-0000-0000-0000-000000000002";
const headers = {
  "content-type": "application/json",
  "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)",
};
const source = {
  id: "ankara-bologna-curricula-2026",
  authority,
  title: "Bologna Bilgi Sistemi lisans programları ve dönemlik ders planları",
  url: `${publicBaseUrl}/`,
};

// ÖSYM program adları eğitim dili etiketini parantez içinde taşırken Ankara'nın
// merkezî Bologna sistemi bazı programlarda aynı dili program adından düşürüyor.
const officialNameAliases = new Map([
  ["Alman Dili ve Edebiyatı (Almanca)", "Alman Dili ve Edebiyatı"],
  ["Bulgar Dili ve Edebiyatı (Bulgarca)", "Bulgar Dili ve Edebiyatı"],
  ["Coğrafya", "Coğrafya (İngilizce)"],
  ["Ermeni Dili ve Kültürü (Ermenice)", "Ermeni Dili ve Kültürü"],
  ["Fransız Dili ve Edebiyatı (Fransızca)", "Fransız Dili ve Edebiyatı"],
  ["Leh Dili ve Edebiyatı (Lehçe)", "Leh Dili ve Edebiyatı"],
  ["Rus Dili ve Edebiyatı (Rusça)", "Rus Dili ve Edebiyatı"],
  ["Sırp Dili ve Edebiyatı", "Sırp Dili ve Edebiyatı (%30 Sırpça)"],
  ["Ukrayna Dili ve Edebiyatı", "Ukrayna Dili ve Edebiyatı (%30 Ukraynaca)"],
  ["İngiliz Dili ve Edebiyatı (İngilizce)", "İngiliz Dili ve Edebiyatı"],
  ["İspanyol Dili ve Edebiyatı (İspanyolca)", "İspanyol Dili ve Edebiyatı"],
  ["İtalyan Dili ve Edebiyatı (İtalyanca)", "İtalyan Dili ve Edebiyatı"],
]);

// Bu iki UOLP programının 2026 ÖSYM kaydı var; Ankara'nın yayımlanan aktif
// lisans programları arasında karşılık gelen ayrı bir müfredat kaydı yok.
const expectedUnlinked = [
  "Biyomedikal Mühendisliği (İngilizce) (UOLP-SUNY Buffalo)",
  "Gayrimenkul Geliştirme ve Yönetimi (UOLP-Azerbaycan Mimarlık ve İnşaat Üniversitesi)",
];

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

async function post(path, body = {}) {
  const response = await fetch(`${apiBaseUrl}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Ankara Bologna API isteği başarısız (${path}): HTTP ${response.status}`);
  const payload = await response.json();
  return payload.data ?? payload;
}

const [programmeTypes, officialProgrammes, curriculumYears] = await Promise.all([
  post("SbtProgramTuru/getPublicList"),
  post("AkademikProgram/getPublicList"),
  post("PublicMufredatDers/getYillar"),
]);

if (!programmeTypes.some((item) => item.id === bachelorProgrammeTypeId && /lisans/iu.test(item.ad))) {
  throw new Error("Ankara Bologna API lisans program türü doğrulanamadı.");
}

const activeYear = curriculumYears.find((item) => item.aktifYilMi);
if (!activeYear || Number(activeYear.no) < 76) {
  throw new Error(`Ankara Bologna aktif müfredat yılı doğrulanamadı: ${activeYear?.ad ?? "yok"}`);
}
const validationYears = curriculumYears
  .filter((item) => Number(item.no) <= Number(activeYear.no))
  .sort((left, right) => Number(right.no) - Number(left.no))
  .slice(0, 3);

const activeBachelorProgrammes = officialProgrammes.filter((item) => (
  item.isActive !== false
  && item.akademikBirim?.programTuruId === bachelorProgrammeTypeId
));
if (activeBachelorProgrammes.length < 160) {
  throw new Error(`Ankara Bologna lisans dizini eksik: ${activeBachelorProgrammes.length}`);
}

const officialByName = new Map();
for (const programme of activeBachelorProgrammes) {
  const key = normalizeName(programme.programAdi);
  officialByName.set(key, [...(officialByName.get(key) ?? []), programme]);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Ankara Üniversitesi katalog kaydı bulunamadı.");

const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 139) {
  throw new Error(`Ankara katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}

const mappings = [];
for (const programme of bachelorProgrammes) {
  if (expectedUnlinked.includes(programme.name)) continue;

  const officialName = officialNameAliases.get(programme.name) ?? programme.name;
  let candidates = officialByName.get(normalizeName(officialName)) ?? [];

  // Resmî sistemde aynı adla iki Hemşirelik kaydı bulunuyor. Kısa adında
  // 2018-2023 yazan kayıt arşiv; boş kısa adlı kayıt güncel ders planıdır.
  if (programme.name === "Hemşirelik") {
    candidates = candidates.filter((item) => !/2018\s*[-–]\s*2023/u.test(item.kisaAd ?? ""));
  }

  if (candidates.length !== 1) {
    throw new Error(`Ankara program eşleşmesi tekil değil: ${programme.name} (${candidates.length})`);
  }
  mappings.push({ programme, official: candidates[0] });
}

const validations = [];
for (let offset = 0; offset < mappings.length; offset += 6) {
  const batch = mappings.slice(offset, offset + 6);
  const results = await Promise.all(batch.map(async ({ programme, official }) => {
    let latestResult = null;
    for (const year of validationYears) {
      const rows = await post("PublicMufredatDers/getByProgram", {
        Id: official.id,
        Yil: null,
        YilNo: Number(year.no),
      });
      const courseCodes = new Set(rows.map((row) => String(row.dersKodu ?? "").trim()).filter(Boolean));
      const semesters = new Set(rows.map((row) => Number(row.yariyilNo)).filter((value) => value > 0));
      const ectsRows = rows.filter((row) => Number(row.akts) > 0);
      latestResult = {
        programme,
        official,
        curriculumYear: year,
        courseCount: courseCodes.size,
        semesterCount: semesters.size,
        ectsRowCount: ectsRows.length,
        valid: courseCodes.size >= 8 && semesters.size >= 4 && ectsRows.length >= 8,
      };
      if (latestResult.valid) return latestResult;
    }
    return latestResult;
  }));
  validations.push(...results);
}

const invalidCurricula = validations.filter((item) => !item.valid);
if (invalidCurricula.length) {
  throw new Error(`Ankara ders planları doğrulanamadı: ${invalidCurricula.map((item) => (
    `${item.programme.name} (${item.official.id}: ${item.courseCount} ders, `
    + `${item.semesterCount} yarıyıl, ${item.ectsRowCount} AKTS satırı)`
  )).join("; ")}`);
}

for (const { programme, official, curriculumYear } of validations) {
  programme.curriculumUrls = [`${publicBaseUrl}/program/${official.id}/dersler`];
  programme.curriculumAuthority = authority;
  programme.curriculumPeriod = curriculumYear.ad;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(
    `Ankara bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`,
  );
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.11";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialActiveBachelorProgrammes: activeBachelorProgrammes.length,
  activeCurriculumYear: activeYear.ad,
  matchedProgrammes: validations.length,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
