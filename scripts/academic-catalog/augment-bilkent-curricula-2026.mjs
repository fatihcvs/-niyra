import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-ihsan-dogramaci-bilkent-universitesi";
const authority = "İhsan Doğramacı Bilkent Üniversitesi";
const indexUrl = "https://catalog.bilkent.edu.tr/dep/index.html";
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "bilkent-online-academic-catalog-2026",
  authority: "Bilkent University",
  title: "Online Academic Catalog undergraduate curricula",
  url: indexUrl,
};

const programmeMappings = [
  ["d01", "Fizik (İngilizce)"],
  ["d02", "Kimya (İngilizce)"],
  ["d03", "Matematik (İngilizce)"],
  ["d04", "Moleküler Biyoloji ve Genetik (İngilizce)"],
  ["d18", "Bilişim Sistemleri ve Teknolojileri (İngilizce)"],
  ["d19", "Turizm ve Otel İşletmeciliği (İngilizce)"],
  ["d22", "Amerikan Kültürü ve Edebiyatı (İngilizce)"],
  ["d23", "Arkeoloji (İngilizce)"],
  ["d25", "Felsefe (İngilizce)"],
  ["d21", "İngiliz Dili ve Edebiyatı (İngilizce)"],
  ["d89", "İngilizce, Fransızca Mütercim ve Tercümanlık"],
  ["d72", "Grafik Tasarımı (İngilizce)"],
  ["d75", "Kentsel Tasarım ve Peyzaj Mimarlığı (İngilizce)"],
  ["d70", "Mimarlık (İngilizce)"],
  ["d77", "İletişim ve Tasarımı (İngilizce)"],
  ["d71", "İç Mimarlık ve Çevre Tasarımı (İngilizce)"],
  ["d11", "Bilgisayar Mühendisliği (İngilizce)"],
  ["d12", "Elektrik-Elektronik Mühendisliği (İngilizce)"],
  ["d13", "Endüstri Mühendisliği (İngilizce)"],
  ["d16", "Makine Mühendisliği (İngilizce)"],
  ["d09", "Sınıf Öğretmenliği"],
  ["d45", "Hukuk"],
  ["d31", "İşletme (İngilizce)"],
  ["d92", "Psikoloji (İngilizce)"],
  ["d34", "Siyaset Bilimi ve Kamu Yönetimi (İngilizce)"],
  ["d33", "Uluslararası İlişkiler (İngilizce)"],
  ["d32", "İktisat (İngilizce)"],
];

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Bilkent program dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();
const publishedCodes = new Set([...indexHtml.matchAll(/\.\.\/dep\/(d\d+)\.html/giu)].map((match) => match[1]));
if (publishedCodes.size < 30) throw new Error(`Bilkent bölüm dizini eksik: ${publishedCodes.size}`);

const missingCodes = programmeMappings.map(([code]) => code).filter((code) => !publishedCodes.has(code));
if (missingCodes.length) throw new Error(`Bilkent program kodları bulunamadı: ${missingCodes.join(", ")}`);

const curriculumPages = new Map();
for (let offset = 0; offset < programmeMappings.length; offset += 6) {
  const batch = programmeMappings.slice(offset, offset + 6);
  const pages = await Promise.all(batch.map(async ([code]) => {
    const url = `https://catalog.bilkent.edu.tr/dep/${code}.html`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    if (!response.ok || !/CURRICULUM/iu.test(html) || !/ECTS/iu.test(html)) {
      throw new Error(`Bilkent lisans müfredatı doğrulanamadı (${code}): HTTP ${response.status}`);
    }
    return [code, url];
  }));
  for (const [code, url] of pages) curriculumPages.set(code, url);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("İhsan Doğramacı Bilkent Üniversitesi katalog kaydı bulunamadı.");

for (const [code, programName] of programmeMappings) {
  const programs = university.programs.filter((item) => item.name === programName && item.degreeLevel === "bachelor");
  if (programs.length !== 1) throw new Error(`Bilkent katalog programı tekil değil: ${programName} (${programs.length})`);
  programs[0].curriculumUrls = [curriculumPages.get(code)];
  programs[0].curriculumAuthority = authority;
}

if (university.programs.some((program) => !program.curriculumUrls?.length)) {
  throw new Error("Bilkent güncel katalog programlarından bazıları müfredatla eşleşmedi.");
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.8";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedDepartments: publishedCodes.size,
  matchedPrograms: programmeMappings.length,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
