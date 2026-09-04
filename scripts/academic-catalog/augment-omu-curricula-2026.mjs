import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const authority = "Ondokuz Mayıs Üniversitesi";
const rootUrl = "https://ubs.omu.edu.tr/ogrenci/ebp/organizasyon.aspx?Mod=1&kultur=tr-TR";
const source = {
  id: "omu-ebp-curricula-2026",
  authority,
  title: "Bilgi Paketi / Ders Kataloğu lisans müfredatları",
  url: rootUrl,
};

const decodeHtml = (value) => value
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&nbsp;/gi, " ")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const normalize = (value) => value
  .normalize("NFC")
  .toLocaleLowerCase("tr-TR")
  .replace(/\((?:m\.?t\.?o\.?k\.?|uzaktan öğretim)\)/giu, " ")
  .replace(/(?:^|\s)(?:bölümü|programı)(?=\s|$)/giu, " ")
  .replace(/[^a-z0-9çğıöşü]+/giu, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeUnit = (value) => normalize(value);

const programAliases = new Map([
  [normalize("Veteriner Hekimliği"), normalize("Veteriner")],
]);

const response = await fetch(rootUrl, {
  headers: { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" },
});
if (!response.ok) throw new Error(`OMÜ Bilgi Paketi alınamadı: HTTP ${response.status}`);

const html = await response.text();
const tokenPattern = /<span class="rtIn UstBirimNode">(?<unit>[\s\S]*?)<\/span>|<a href='(?<href>organizasyon\.aspx\?[^']*program=[^']+)' class='BirimNode'>(?<name>[\s\S]*?)<\/a>/giu;
const publishedPrograms = [];
let currentUnit = "";

for (const match of html.matchAll(tokenPattern)) {
  if (match.groups.unit) {
    currentUnit = decodeHtml(match.groups.unit.replace(/<[^>]+>/g, "")).trim();
    continue;
  }

  const name = decodeHtml(match.groups.name.replace(/<[^>]+>/g, "")).trim();
  const url = new URL(decodeHtml(match.groups.href), rootUrl).href;
  const normalizedName = normalize(name);
  publishedPrograms.push({
    unit: currentUnit,
    normalizedUnit: normalizeUnit(currentUnit),
    name,
    normalizedName: programAliases.get(normalizedName) ?? normalizedName,
    url,
  });
}

if (publishedPrograms.length < 100) {
  throw new Error(`OMÜ Bilgi Paketi beklenenden az program döndürdü: ${publishedPrograms.length}`);
}

const omu = catalog.universities.omu;
if (!omu) throw new Error("Ondokuz Mayıs Üniversitesi katalog kaydı bulunamadı.");

const unitsById = new Map(omu.units.map((unit) => [unit.id, unit]));
const matches = [];
const unmatched = [];

for (const program of omu.programs.filter((item) => item.degreeLevel === "bachelor")) {
  const normalizedName = normalize(program.name);
  const lookupName = programAliases.get(normalizedName) ?? normalizedName;
  const candidates = publishedPrograms.filter((item) => item.normalizedName === lookupName);

  let selected = candidates.length === 1 ? candidates[0] : undefined;
  if (candidates.length > 1) {
    const unitName = unitsById.get(program.unitId)?.name ?? "";
    const normalizedUnit = normalizeUnit(unitName);
    const unitMatches = candidates.filter((item) => item.normalizedUnit === normalizedUnit);
    if (unitMatches.length === 1) selected = unitMatches[0];
    else if (lookupName === normalize("İlahiyat")) selected = candidates[0];
  }

  if (!selected) {
    unmatched.push({ program: program.name, candidateCount: candidates.length });
    continue;
  }

  program.curriculumUrls = [selected.url];
  program.curriculumAuthority = authority;
  matches.push({ program: program.name, publishedName: selected.name, url: selected.url });
}

if (matches.length < 80) {
  throw new Error(`OMÜ lisans eşleştirme eşiğin altında kaldı: ${matches.length}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.5";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, university) => total + university.programs.reduce((subtotal, item) => subtotal + (item.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedPrograms: publishedPrograms.length,
  matchedPrograms: matches.length,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
  unmatched,
}, null, 2));
