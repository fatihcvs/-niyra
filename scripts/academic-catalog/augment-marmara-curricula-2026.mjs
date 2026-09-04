import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-marmara-universitesi";
const authority = "Marmara Üniversitesi";
const baseUrl = "https://meobs.marmara.edu.tr";
const indexUrl = `${baseUrl}/Program/programlar-hakkinda-bilgi/lisans-900002`;
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "marmara-meobs-curricula-2026",
  authority,
  title: "Eğitim-Öğretim Bilgi Sistemi lisans programları ve müfredatları",
  url: indexUrl,
};

const decodeHtml = (value) => value
  .replace(/&amp;/giu, "&")
  .replace(/&quot;|&#34;/giu, "\"")
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const plainText = (value) => decodeHtml(value)
  .replace(/<[^>]+>/gu, " ")
  .replace(/\s+/gu, " ")
  .trim();

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

const directNameAliases = new Map([
  ["Eczacılık Fakültesi", "Eczacılık"],
  ["Hukuk Fakültesi", "Hukuk"],
  [
    "Hukuk Fakültesi (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "Hukuk (UOLP-Uluslararası Saraybosna Üniversitesi)",
  ],
  ["Tıp Fakültesi (İngilizce)", "Tıp (İngilizce)"],
  ["Fransızca Öğretmenliği", "Fransızca Öğretmenliği (Fransızca)"],
  [
    "İngilizce Öğretmenliği (UOLP- Uluslararası Saraybosna Üniversitesi)",
    "İngilizce Öğretmenliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  ],
  [
    "İşletme (İngilizce) (UOLP-Uluslararsı Saraybosna Üniversitesi)",
    "İşletme (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  ],
]);

const expectedUnlinked = [
  "Film Tasarımı ve Yönetimi",
  "İngilizce Öğretmenliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Hukuk (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "İşletme",
  "İşletme (Almanca)",
  "İşletme (İngilizce)",
  "İşletme (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Psikoloji (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Turizm ve Gastronomi Yönetimi Programları (İngilizce)",
  "Bilgisayar Mühendisliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "Biyomühendislik (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  "İlahiyat (Arapça) (M.T.O.K.)",
  "İlahiyat (M.T.O.K.)",
  "İlahiyat (İngilizce) (M.T.O.K.)",
  "Bilgisayar Mühendisliği (M.T.O.K.)",
  "Elektrik-Elektronik Mühendisliği (M.T.O.K.)",
  "Makine Mühendisliği (M.T.O.K.)",
  "Mekatronik Mühendisliği (M.T.O.K.)",
  "Metalurji ve Malzeme Mühendisliği (M.T.O.K.)",
  "Siber Güvenlik Mühendisliği (M.T.O.K.)",
  "Tekstil Mühendisliği (M.T.O.K.)",
];

function genericProgrammeName(parentName, anchorName) {
  let name = parentName.replace(/\s+Fakültesi$/iu, "");
  if (/\(\s*\d+ yıllık,\s*(?:İngilizce|%100 İngilizce)\s*\)/iu.test(anchorName)
    && !/\(İngilizce\)$/iu.test(name)) {
    name += " (İngilizce)";
  } else if (/\(\s*\d+ yıllık,\s*Almanca\s*\)/iu.test(anchorName) && !/\(Almanca\)$/iu.test(name)) {
    name += " (Almanca)";
  } else if (/\(\s*\d+ yıllık,\s*Fransızca\s*\)/iu.test(anchorName) && !/\(Fransızca\)$/iu.test(name)) {
    name += " (Fransızca)";
  } else if (/\(\s*\d+ yıllık,\s*Arapça\s*\)/iu.test(anchorName) && !/\(Arapça\)$/iu.test(name)) {
    name += " (Arapça)";
  }
  return name;
}

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Marmara lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();

const tokenPattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>|<h4\b[^>]*>([\s\S]*?)<\/h4>|<a\b[^>]*href=["']([^"']*\/ProgramTanitim\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu;
const officialProgrammes = [];
let currentUnit = "";
let parentName = "";
for (const match of indexHtml.matchAll(tokenPattern)) {
  if (match[1] !== undefined) {
    currentUnit = plainText(match[1]);
    parentName = "";
    continue;
  }
  if (match[2] !== undefined) {
    parentName = plainText(match[2]);
    continue;
  }

  const url = new URL(decodeHtml(match[3]), baseUrl).href;
  const anchorName = plainText(match[4]);
  let catalogName;
  if (/^Lisans\s*\(/iu.test(anchorName)) {
    catalogName = genericProgrammeName(parentName, anchorName);
  } else if (/\s+-\s+Lisans\s*\(/iu.test(anchorName)) {
    catalogName = anchorName.replace(/\s+-\s+Lisans\s*\([^)]+\)$/iu, "");
  } else {
    catalogName = directNameAliases.get(anchorName) ?? anchorName;
  }
  const durationMatch = anchorName.match(/(\d+) yıllık/iu);
  officialProgrammes.push({
    unit: currentUnit,
    name: catalogName,
    rawName: anchorName,
    url,
    durationYears: durationMatch ? Number(durationMatch[1]) : null,
  });
}

if (officialProgrammes.length !== 217) {
  throw new Error(`Marmara lisans dizini beklenmiyor: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Marmara Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 115) {
  throw new Error(`Marmara katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
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
    if (candidates.length > 1 && candidates.some((item) => item.durationYears === programme.durationYears)) {
      candidates = candidates.filter((item) => item.durationYears === programme.durationYears);
    }
    if (candidates.length > 1 && candidates.some((item) => /,\s*Türkçe\s*\)/iu.test(item.rawName))) {
      candidates = candidates.filter((item) => /,\s*Türkçe\s*\)/iu.test(item.rawName));
    }
    if (candidates.length > 1 && programme.name === "Hukuk") {
      candidates = candidates.filter((item) => item.url.endsWith("hukuk-fakultesi-1072-789-0"));
    }
    if (candidates.length > 1 && programme.name === "Mimarlık (İngilizce)") {
      candidates = candidates.filter((item) => item.url.endsWith("lisans-4-yillik-ingilizce-1511-979-0"));
    }
    if (candidates.length !== 1) {
      throw new Error(
        `Marmara program eşleşmesi tekil değil: ${unit?.name} / ${programme.name} (${candidates.length})`,
      );
    }
    return { programme, official: candidates[0] };
  });

for (let offset = 0; offset < mappings.length; offset += 6) {
  const batch = mappings.slice(offset, offset + 6);
  await Promise.all(batch.map(async ({ programme, official }) => {
    const response = await fetch(official.url, { headers });
    const html = await response.text();
    const currentOptionTag = [...html.matchAll(/<option\b[^>]*>/giu)]
      .map((match) => match[0])
      .find((tag) => /\btip=["']Guncel["']/iu.test(tag));
    const curriculumQuery = html.match(/loadMufredatDersListesi\(["'](\?[^"']+)["']\)/iu)?.[1]
      ?? currentOptionTag?.match(/\bvalue=["']([^"']+)["']/iu)?.[1];
    if (!curriculumQuery) {
      throw new Error(`Marmara güncel müfredat ucu bulunamadı (${programme.name})`);
    }
    const curriculumUrl = new URL(`/Mufredat/DersListesi${decodeHtml(curriculumQuery)}`, baseUrl);
    const curriculumResponse = await fetch(curriculumUrl, { headers });
    const curriculumHtml = await curriculumResponse.text();
    const courseLinks = new Set([
      ...curriculumHtml.matchAll(/href=["'][^"']*\/Ders\/[^"']+["']/giu),
    ].map((match) => match[0]));
    const courseCodes = new Set([
      ...curriculumHtml.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,8}[ -]?\d{2,4}\b/gu),
    ].map((match) => match[0]));
    if (!response.ok || !curriculumResponse.ok || curriculumHtml.length < 10_000
      || !/\bAKTS\b/iu.test(curriculumHtml)
      || courseLinks.size < 5 || courseCodes.size < 5) {
      throw new Error(
        `Marmara müfredatı doğrulanamadı (${programme.name}): `
        + `HTTP ${response.status}/${curriculumResponse.status}, ${curriculumHtml.length} bayt, `
        + `${courseLinks.size} ders, ${courseCodes.size} kod`,
      );
    }
  }));
}

for (const { programme, official } of mappings) {
  programme.curriculumUrls = [official.url];
  programme.curriculumAuthority = authority;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorProgrammes.some((program) => program.name === name))) {
  throw new Error(`Marmara bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.15";
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
