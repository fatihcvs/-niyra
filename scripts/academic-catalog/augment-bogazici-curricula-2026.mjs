import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-bogazici-universitesi";
const authority = "Boğaziçi Üniversitesi";
const indexUrl = "https://bogazici.edu.tr/tr/pages/lisans-programlari/301";
const headers = { "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "bogazici-official-undergraduate-catalog-2026",
  authority,
  title: "Resmî lisans programları ve ders/kredi/AKTS tabloları",
  url: indexUrl,
};

// Boğaziçi'nin merkezî lisans kataloğunda bazı eğitim programları aynı bölüm
// sayfasında birden fazla ayrı ders planı olarak yayımlanır.
const programmeMappings = [
  [25, "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği (İngilizce)"],
  [36, "Fen Bilgisi Öğretmenliği (İngilizce)"],
  [36, "Fizik Öğretmenliği (İngilizce)"],
  [36, "Kimya Öğretmenliği (İngilizce)"],
  [36, "Matematik Öğretmenliği (İngilizce)"],
  [35, "Okul Öncesi Öğretmenliği (İngilizce)"],
  [33, "Rehberlik ve Psikolojik Danışmanlık (İngilizce)"],
  [36, "İlköğretim Matematik Öğretmenliği (İngilizce)"],
  [37, "İngilizce Öğretmenliği (İngilizce)"],
  [43, "Fizik (İngilizce)"],
  [44, "Kimya (İngilizce)"],
  [45, "Matematik (İngilizce)"],
  [51, "Moleküler Biyoloji ve Genetik (İngilizce)"],
  [28, "Hukuk"],
  [52, "İktisat (İngilizce)"],
  [53, "İşletme (İngilizce)"],
  [54, "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce)"],
  [62, "Turizm İşletmeciliği (İngilizce)"],
  [63, "Uluslararası Ticaret (İngilizce)"],
  [61, "Yönetim Bilişim Sistemleri (İngilizce)"],
  [47, "Sosyoloji (İngilizce)"],
  [46, "Psikoloji (İngilizce)"],
  [48, "Tarih (İngilizce)"],
  [49, "Türk Dili ve Edebiyatı (İngilizce)"],
  [40, "Çeviribilimi (İngilizce)"],
  [41, "Dilbilimi (İngilizce)"],
  [42, "Felsefe (İngilizce)"],
  [38, "İngiliz Dili ve Edebiyatı (İngilizce)"],
  [55, "Bilgisayar Mühendisliği (İngilizce)"],
  [56, "Elektrik-Elektronik Mühendisliği (İngilizce)"],
  [57, "Endüstri Mühendisliği (İngilizce)"],
  [60, "İnşaat Mühendisliği (İngilizce)"],
  [58, "Kimya Mühendisliği (İngilizce)"],
  [59, "Makine Mühendisliği (İngilizce)"],
];

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Boğaziçi lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();

const pageIds = [...new Set(programmeMappings.map(([pageId]) => pageId))];
const missingPageIds = pageIds.filter((pageId) => !indexHtml.includes(`/tr/pages/lisans-programlari/${pageId}`));
if (missingPageIds.length) throw new Error(`Boğaziçi lisans dizininde sayfa bulunamadı: ${missingPageIds.join(", ")}`);

for (let offset = 0; offset < pageIds.length; offset += 6) {
  const batch = pageIds.slice(offset, offset + 6);
  await Promise.all(batch.map(async (pageId) => {
    const url = `https://bogazici.edu.tr/tr/pages/lisans-programlari/${pageId}`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    const courseCodes = new Set([...html.matchAll(/\b[A-Z]{2,5}\s*\d{3}\b/gu)].map((match) => match[0]));
    if (!response.ok || !/\bECTS\b|\bAKTS\b/iu.test(html) || courseCodes.size < 10) {
      throw new Error(`Boğaziçi lisans ders planı doğrulanamadı (${pageId}): HTTP ${response.status}, ${courseCodes.size} ders kodu`);
    }
  }));
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Boğaziçi Üniversitesi katalog kaydı bulunamadı.");

for (const [pageId, programName] of programmeMappings) {
  const programs = university.programs.filter((item) => item.name === programName && item.degreeLevel === "bachelor");
  if (programs.length !== 1) throw new Error(`Boğaziçi katalog programı tekil değil: ${programName} (${programs.length})`);
  programs[0].curriculumUrls = [`https://bogazici.edu.tr/tr/pages/lisans-programlari/${pageId}`];
  programs[0].curriculumAuthority = authority;
}

const linkedPrograms = university.programs.filter((program) => program.curriculumUrls?.length);
if (linkedPrograms.length !== university.programs.length || linkedPrograms.length !== programmeMappings.length) {
  throw new Error(`Boğaziçi program kapsamı eksik: ${linkedPrograms.length}/${university.programs.length}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.9";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialCurriculumPages: pageIds.length,
  matchedPrograms: programmeMappings.length,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
