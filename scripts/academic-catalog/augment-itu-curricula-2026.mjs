import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const authority = "İstanbul Teknik Üniversitesi";
const rootUrl = "https://obs.itu.edu.tr/public/DersPlan/";
const programmeEndpoint = "https://obs.itu.edu.tr/public/DersPlan/GetAkademikProgramByBirimIdAndPlanTipi";
const source = {
  id: "itu-obs-curricula-2026",
  authority,
  title: "Öğrenci Bilgi Sistemi lisans ders planları",
  url: rootUrl,
};
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };

const decodeHtml = (value) => value
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&nbsp;/gi, " ");

const normalize = (value) => value
  .normalize("NFC")
  .replace(/\s+Lisans$/iu, "")
  .replace(/Makinaları/giu, "Makineleri")
  .replace(/Makina/giu, "Makine")
  .replace(/Doğal\s+Gaz/giu, "Doğalgaz")
  .toLocaleLowerCase("tr-TR")
  .replace(/[^a-z0-9çğıöşü]+/giu, " ")
  .replace(/\s+/g, " ")
  .trim();

const rootResponse = await fetch(rootUrl, { headers });
if (!rootResponse.ok) throw new Error(`İTÜ ders planı kataloğu alınamadı: HTTP ${rootResponse.status}`);
const rootHtml = await rootResponse.text();
const facultySelect = rootHtml.match(/<select[^>]+id="akademikBirimId"[\s\S]*?<\/select>/iu)?.[0];
if (!facultySelect) throw new Error("İTÜ akademik birim seçimi bulunamadı.");

const facultyIds = [...facultySelect.matchAll(/<option value="(\d+)">([\s\S]*?)<\/option>/giu)]
  .map((match) => ({ id: match[1], name: decodeHtml(match[2].replace(/<[^>]+>/g, "")).trim() }));
if (facultyIds.length < 20) throw new Error(`İTÜ akademik birim listesi eksik: ${facultyIds.length}`);

const publishedPrograms = [];
for (const faculty of facultyIds) {
  const response = await fetch(programmeEndpoint, {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: new URLSearchParams({ birimId: faculty.id, planTipiKodu: "lisans" }),
  });
  if (!response.ok) throw new Error(`İTÜ program listesi alınamadı (${faculty.name}): HTTP ${response.status}`);
  const programmes = await response.json();
  for (const programme of programmes) {
    if (!programme.programKodu || !programme.programAdi) continue;
    publishedPrograms.push({
      faculty: faculty.name,
      code: programme.programKodu,
      name: programme.programAdi,
      normalizedName: normalize(programme.programAdi),
      url: `https://obs.itu.edu.tr/public/DersPlan/DersPlanlariList?planTipiKodu=lisans&programKodu=${encodeURIComponent(programme.programKodu)}`,
    });
  }
}

if (publishedPrograms.length < 90) {
  throw new Error(`İTÜ ÖBS beklenenden az lisans programı döndürdü: ${publishedPrograms.length}`);
}

const itu = catalog.universities["tr-istanbul-teknik-universitesi"];
if (!itu) throw new Error("İstanbul Teknik Üniversitesi katalog kaydı bulunamadı.");

const matches = [];
const unmatched = [];
for (const program of itu.programs.filter((item) => item.degreeLevel === "bachelor")) {
  const candidates = publishedPrograms.filter((item) => item.normalizedName === normalize(program.name));
  if (candidates.length !== 1) {
    unmatched.push({ program: program.name, candidateCount: candidates.length });
    continue;
  }
  const selected = candidates[0];
  program.curriculumUrls = [selected.url];
  program.curriculumAuthority = authority;
  matches.push({ program: program.name, code: selected.code, url: selected.url });
}

if (matches.length < 45) {
  throw new Error(`İTÜ lisans eşleştirme eşiğin altında kaldı: ${matches.length}`);
}

for (const match of matches) {
  const response = await fetch(match.url, { headers });
  const html = await response.text();
  if (!response.ok || !/DersPlanDetay\//u.test(html)) {
    throw new Error(`İTÜ ders planı listesi doğrulanamadı (${match.code}): HTTP ${response.status}`);
  }
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.6";
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
