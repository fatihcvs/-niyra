import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const rootUrl = "https://catalog.metu.edu.tr/";
const headers = { "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "metu-academic-catalog-curricula-2026",
  authority: "Middle East Technical University",
  title: "Official Academic Catalog undergraduate curricula",
  url: rootUrl,
};

const targetMappings = {
  "tr-orta-dogu-teknik-universitesi": {
    authority: "Orta Doğu Teknik Üniversitesi",
    programs: [
      ["120", "Mimarlık (İngilizce)"],
      ["121", "Şehir ve Bölge Planlama (İngilizce)"],
      ["125", "Endüstriyel Tasarım (İngilizce)"],
      ["219", "Moleküler Biyoloji ve Genetik (İngilizce)"],
      ["230", "Fizik (İngilizce)"],
      ["232", "Sosyoloji (İngilizce)"],
      ["233", "Psikoloji (İngilizce)"],
      ["234", "Kimya (İngilizce)"],
      ["236", "Matematik (İngilizce)"],
      ["238", "Biyoloji (İngilizce)"],
      ["240", "Tarih (İngilizce)"],
      ["241", "Felsefe (İngilizce)"],
      ["246", "İstatistik (İngilizce)"],
      ["310", "Siyaset Bilimi ve Kamu Yönetimi (İngilizce)"],
      ["311", "İktisat (İngilizce)"],
      ["312", "İşletme (İngilizce)"],
      ["314", "Uluslararası İlişkiler (İngilizce)"],
      ["315", "Küresel Siyaset ve Uluslararası İlişkiler (İngilizce) (UOLP-SUNY Binghamton)"],
      ["316", "İşletme (İngilizce) (UOLP-SUNY Binghamton)"],
      ["411", "Okul Öncesi Öğretmenliği (İngilizce)"],
      ["412", "Fen Bilgisi Öğretmenliği (İngilizce)"],
      ["413", "İlköğretim Matematik Öğretmenliği (İngilizce)"],
      ["421", "Fizik Öğretmenliği (İngilizce)"],
      ["422", "Kimya Öğretmenliği (İngilizce)"],
      ["423", "Matematik Öğretmenliği (İngilizce)"],
      ["430", "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği (İngilizce)"],
      ["450", "İngilizce Öğretmenliği (İngilizce)"],
      ["451", "İngilizce Öğretmenliği (İngilizce) (UOLP-SUNY New Paltz)"],
      ["453", "Beden Eğitimi ve Spor Öğretmenliği (İngilizce)"],
      ["560", "Çevre Mühendisliği (İngilizce)"],
      ["562", "İnşaat Mühendisliği (İngilizce)"],
      ["563", "Kimya Mühendisliği (İngilizce)"],
      ["564", "Jeoloji Mühendisliği (İngilizce)"],
      ["565", "Maden Mühendisliği (İngilizce)"],
      ["566", "Petrol ve Doğalgaz Mühendisliği (İngilizce)"],
      ["567", "Elektrik-Elektronik Mühendisliği (İngilizce)"],
      ["568", "Endüstri Mühendisliği (İngilizce)"],
      ["569", "Makine Mühendisliği (İngilizce)"],
      ["570", "Metalurji ve Malzeme Mühendisliği (İngilizce)"],
      ["571", "Bilgisayar Mühendisliği (İngilizce)"],
      ["572", "Havacılık ve Uzay Mühendisliği (İngilizce)"],
      ["573", "Gıda Mühendisliği (İngilizce)"],
    ],
  },
  "kktc-odtu-kuzey-kibris-kampusu": {
    authority: "Orta Doğu Teknik Üniversitesi — Kuzey Kıbrıs Kampüsü",
    programs: [
      ["351", "İşletme (İngilizce) (UOLP-SUNY New Paltz)"],
      ["352", "İktisat (İngilizce)"],
      ["353", "İşletme (İngilizce)"],
      ["354", "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce)"],
      ["355", "Bilgisayar Mühendisliği (İngilizce)"],
      ["356", "Elektrik-Elektronik Mühendisliği (İngilizce)"],
      ["364", "İnşaat Mühendisliği (İngilizce)"],
      ["365", "Makine Mühendisliği (İngilizce)"],
      ["366", "İngilizce Öğretmenliği (İngilizce)"],
      ["367", "Kimya Mühendisliği (İngilizce)"],
      ["371", "Psikoloji (İngilizce)"],
      ["374", "Petrol ve Doğalgaz Mühendisliği (İngilizce)"],
      ["384", "Havacılık ve Uzay Mühendisliği (İngilizce)"],
      ["388", "Endüstri Mühendisliği (İngilizce)"],
      ["389", "Yazılım Mühendisliği (İngilizce)"],
      ["392", "Siber Güvenlik Mühendisliği (İngilizce)"],
    ],
  },
};

const rootResponse = await fetch(rootUrl, { headers });
if (!rootResponse.ok) throw new Error(`ODTÜ akademik katalog alınamadı: HTTP ${rootResponse.status}`);
const rootHtml = await rootResponse.text();
const facultyCodes = [...new Set([...rootHtml.matchAll(/fac_inst\.php\?fac_inst=(\d+)/giu)].map((match) => match[1]))];
if (facultyCodes.length < 10) throw new Error(`ODTÜ fakülte listesi eksik: ${facultyCodes.length}`);

const publishedProgramCodes = new Set();
for (const facultyCode of facultyCodes) {
  const response = await fetch(`${rootUrl}fac_inst.php?fac_inst=${facultyCode}`, { headers });
  if (!response.ok) throw new Error(`ODTÜ fakülte kataloğu alınamadı (${facultyCode}): HTTP ${response.status}`);
  const html = await response.text();
  for (const match of html.matchAll(/program\.php\?fac_prog=(\d+)/giu)) publishedProgramCodes.add(match[1]);
}

const expectedCodes = Object.values(targetMappings).flatMap((target) => target.programs.map(([code]) => code));
const missingPublishedCodes = expectedCodes.filter((code) => !publishedProgramCodes.has(code));
if (missingPublishedCodes.length) throw new Error(`ODTÜ katalog program kodları bulunamadı: ${missingPublishedCodes.join(", ")}`);

const curriculumPages = new Map();
for (let offset = 0; offset < expectedCodes.length; offset += 6) {
  const batch = expectedCodes.slice(offset, offset + 6);
  const pages = await Promise.all(batch.map(async (code) => {
    const url = `${rootUrl}program.php?fac_prog=${code}`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    if (!response.ok || !/Undergraduate Curriculum/iu.test(html) || !/ECTS/iu.test(html)) {
      throw new Error(`ODTÜ lisans müfredatı doğrulanamadı (${code}): HTTP ${response.status}`);
    }
    return [code, url];
  }));
  for (const [code, url] of pages) curriculumPages.set(code, url);
}

const attached = [];
for (const [universityId, target] of Object.entries(targetMappings)) {
  const university = catalog.universities[universityId];
  if (!university) throw new Error(`Katalog kurumu bulunamadı: ${universityId}`);
  for (const [code, programName] of target.programs) {
    const programs = university.programs.filter((item) => item.name === programName && item.degreeLevel === "bachelor");
    if (programs.length !== 1) throw new Error(`Katalog programı tekil değil: ${universityId} / ${programName} (${programs.length})`);
    programs[0].curriculumUrls = [curriculumPages.get(code)];
    programs[0].curriculumAuthority = target.authority;
    attached.push({ universityId, program: programName, code });
  }
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.7";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, university) => total + university.programs.reduce((subtotal, item) => subtotal + (item.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedPrograms: publishedProgramCodes.size,
  matchedPrograms: attached.length,
  metuPrograms: attached.filter((item) => item.universityId === "tr-orta-dogu-teknik-universitesi").length,
  nccPrograms: attached.filter((item) => item.universityId === "kktc-odtu-kuzey-kibris-kampusu").length,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
