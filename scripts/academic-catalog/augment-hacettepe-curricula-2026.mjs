import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-hacettepe-universitesi";
const authority = "Hacettepe Üniversitesi";
const indexUrl = "https://bilsis.hacettepe.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr";
const headers = { "user-agent": "UniyraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)" };
const source = {
  id: "hacettepe-bologna-curricula-2026",
  authority,
  title: "Bologna Bilgi Sistemi lisans programları ve dönemlik ders planları",
  url: indexUrl,
};

const programmeMappings = [
  [762, "Fizyoterapi ve Rehabilitasyon"],
  [494, "Hukuk"],
  [361, "Beslenme ve Diyetetik"],
  [639, "Dil ve Konuşma Terapisi"],
  [608, "Ergoterapi"],
  [638, "Odyoloji"],
  [366, "Çocuk Gelişimi"],
  [495, "Maliye"],
  [786, "Sağlık Yönetimi"],
  [496, "Siyaset Bilimi ve Kamu Yönetimi (İngilizce)"],
  [395, "Sosyal Hizmet"],
  [497, "Uluslararası İlişkiler (İngilizce)"],
  [347, "İktisat"],
  [374, "İktisat (İngilizce)"],
  [390, "İşletme (İngilizce)"],
  [567, "Hemşirelik"],
  [357, "Elektrik-Elektronik Mühendisliği (İngilizce)"],
  [469, "Endüstri Mühendisliği (İngilizce)"],
  [334, "Fizik Mühendisliği"],
  [373, "Gıda Mühendisliği"],
  [1349, "Harita Mühendisliği (İngilizce)"],
  [358, "Hidrojeoloji Mühendisliği"],
  [337, "Jeoloji Mühendisliği"],
  [335, "Kimya Mühendisliği (İngilizce)"],
  [338, "Maden Mühendisliği (İngilizce)"],
  [489, "Makine Mühendisliği (İngilizce)"],
  [386, "Nükleer Enerji Mühendisliği (İngilizce)"],
  [867, "Çevre Mühendisliği (İngilizce)"],
  [630, "İnşaat Mühendisliği (İngilizce)"],
  [356, "Bilgisayar Mühendisliği (İngilizce)"],
  [1389, "Mimarlık (İngilizce)"],
  [465, "İç Mimarlık ve Çevre Tasarımı"],
  [783, "Almanca Öğretmenliği (Almanca)"],
  [780, "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği"],
  [773, "Biyoloji Öğretmenliği"],
  [776, "Fen Bilgisi Öğretmenliği"],
  [771, "Fizik Öğretmenliği"],
  [784, "Fransızca Öğretmenliği"],
  [772, "Kimya Öğretmenliği"],
  [774, "Matematik Öğretmenliği"],
  [746, "Okul Öncesi Öğretmenliği"],
  [779, "Rehberlik ve Psikolojik Danışmanlık"],
  [782, "Sınıf Öğretmenliği"],
  [778, "Türkçe Öğretmenliği"],
  [777, "Özel Eğitim Öğretmenliği"],
  [775, "İlköğretim Matematik Öğretmenliği"],
  [785, "İngilizce Öğretmenliği (İngilizce)"],
  [312, "Diş Hekimliği"],
  [313, "Eczacılık"],
  [3420, "Radyo, Televizyon ve Sinema"],
  [763, "İletişim Bilimleri"],
  [341, "Alman Dili ve Edebiyatı"],
  [514, "Almanca Mütercim ve Tercümanlık"],
  [391, "Amerikan Kültürü ve Edebiyatı (İngilizce)"],
  [352, "Antropoloji"],
  [504, "Arkeoloji"],
  [396, "Bilgi ve Belge Yönetimi"],
  [354, "Felsefe"],
  [342, "Fransız Dili ve Edebiyatı"],
  [512, "Fransızca Mütercim ve Tercümanlık"],
  [344, "Psikoloji"],
  [503, "Sanat Tarihi"],
  [345, "Sosyoloji"],
  [353, "Tarih"],
  [349, "Türk Dili ve Edebiyatı"],
  [501, "Türk Halkbilimi"],
  [662, "Çağdaş Türk Lehçeleri ve Edebiyatları"],
  [351, "İngiliz Dilbilimi (İngilizce)"],
  [343, "İngiliz Dili ve Edebiyatı (İngilizce)"],
  [511, "İngilizce Mütercim ve Tercümanlık"],
  [381, "Aktüerya Bilimleri"],
  [321, "Biyoloji"],
  [333, "Kimya"],
  [328, "Matematik"],
  [329, "İstatistik"],
  [1, "Tıp"],
  [2, "Tıp (İngilizce)"],
];

const indexResponse = await fetch(indexUrl, { headers });
if (!indexResponse.ok) throw new Error(`Hacettepe lisans dizini alınamadı: HTTP ${indexResponse.status}`);
const indexHtml = await indexResponse.text();
const publishedIds = new Set([...indexHtml.matchAll(/curSunit=(\d+)/gu)].map((match) => Number(match[1])));
if (publishedIds.size < 110) throw new Error(`Hacettepe lisans dizini eksik: ${publishedIds.size}`);

const missingIds = programmeMappings.map(([id]) => id).filter((id) => !publishedIds.has(id));
if (missingIds.length) throw new Error(`Hacettepe program kimlikleri bulunamadı: ${missingIds.join(", ")}`);

for (let offset = 0; offset < programmeMappings.length; offset += 6) {
  const batch = programmeMappings.slice(offset, offset + 6);
  await Promise.all(batch.map(async ([id]) => {
    const url = `https://bilsis.hacettepe.edu.tr/oibs/bologna/progCourses.aspx?curSunit=${id}&lang=tr`;
    const response = await fetch(url, { headers });
    const html = await response.text();
    const courseCodes = new Set([...html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,8}\s*\d{3}\b/gu)].map((match) => match[0]));
    if (!response.ok || html.length < 100_000 || !/\bECTS\b|\bAKTS\b/iu.test(html) || courseCodes.size < 5) {
      throw new Error(`Hacettepe ders planı doğrulanamadı (${id}): HTTP ${response.status}, ${courseCodes.size} ders kodu`);
    }
  }));
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Hacettepe Üniversitesi katalog kaydı bulunamadı.");

for (const [id, programName] of programmeMappings) {
  const programs = university.programs.filter((item) => item.name === programName && item.degreeLevel === "bachelor");
  if (programs.length !== 1) throw new Error(`Hacettepe katalog programı tekil değil: ${programName} (${programs.length})`);
  programs[0].curriculumUrls = [`https://bilsis.hacettepe.edu.tr/oibs/bologna/progCourses.aspx?curSunit=${id}&lang=tr`];
  programs[0].curriculumAuthority = authority;
}

const unlinkedBachelorPrograms = university.programs.filter((program) => program.degreeLevel === "bachelor" && !program.curriculumUrls?.length);
const expectedUnlinked = ["Paramedik", "Yapay Zeka ve Veri Mühendisliği (İngilizce)"];
if (unlinkedBachelorPrograms.length !== expectedUnlinked.length
  || !expectedUnlinked.every((name) => unlinkedBachelorPrograms.some((program) => program.name === name))) {
  throw new Error(`Hacettepe bağlantısız lisans listesi beklenmiyor: ${unlinkedBachelorPrograms.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.10";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, item) => total + item.programs.reduce((subtotal, program) => subtotal + (program.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  officialPublishedPrograms: publishedIds.size,
  matchedPrograms: programmeMappings.length,
  intentionallyUnlinked: expectedUnlinked,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
