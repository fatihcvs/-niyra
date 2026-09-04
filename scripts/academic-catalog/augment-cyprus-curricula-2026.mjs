import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const sources = [
  {
    id: "altinbas-kibris-curricula-2026",
    authority: "Altınbaş Kıbrıs Üniversitesi",
    title: "Ders kodu, kredi ve AKTS içeren resmî program müfredatları",
    url: "https://wpu.edu.tr/tr/fakulteler/",
  },
  {
    id: "elu-curricula-2026",
    authority: "European Leadership University",
    title: "Data Science ve Computer Engineering resmî müfredatları",
    url: "https://elu.edu.tr/programmes.php",
  },
  {
    id: "nkua-baag-curriculum-2026",
    authority: "National and Kapodistrian University of Athens",
    title: "Cyprus Branch BAAG eight-semester curriculum",
    url: "https://baag.uoa.gr/curriculum/",
  },
];

for (const source of sources) {
  if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);
}

const curricula = [
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-iisbf-isletme-tr", "https://wpu.edu.tr/tr/iktisadi-idari-ve-sosyal-bilimler-fakultesi/isletme-yonetimi-turkce-program/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-iisbf-psikoloji-tr", "https://wpu.edu.tr/tr/iktisadi-idari-ve-sosyal-bilimler-fakultesi/psikoloji-turkce-program/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-hemsirelik-tr", "https://wpu.edu.tr/tr/saglik-bilimleri-fakultesi/hemsirelik-turkce-program/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-ilk-acil-tr", "https://wpu.edu.tr/tr/saglik-hizmetleri-meslek-yuksekokulu/ilk-ve-acil-yardim-turkce-program/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-mba", "https://wpu.edu.tr/tr/isletme-yonetimi-yuksek-lisans-mba/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-isletme-doktora", "https://wpu.edu.tr/tr/isletme-yonetimi-doktora/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-altinbas-kibris-universitesi", "program-altinbas-kamu-master", "https://wpu.edu.tr/tr/kamu-yonetimi-yuksek-lisans-tezli-tezsiz/", "Altınbaş Kıbrıs Üniversitesi"],
  ["kktc-avrupa-liderlik-universitesi", "program-elu-data-science", "https://elu.edu.tr/program/data-science.html", "European Leadership University"],
  ["kktc-avrupa-liderlik-universitesi", "program-elu-computer-engineering", "https://elu.edu.tr/program/computer-engineering.html", "European Leadership University"],
  ["cy-national-and-kapodistrian-university-of-athens-cyprus-branch", "program-nkua-cyprus-baag", "https://baag.uoa.gr/curriculum/", "National and Kapodistrian University of Athens"],
];

for (const [universityId, programId, url, authority] of curricula) {
  const university = catalog.universities[universityId];
  if (!university) throw new Error(`Katalog kurumu bulunamadı: ${universityId}`);
  const program = university.programs.find((item) => item.id === programId);
  if (!program) throw new Error(`Katalog programı bulunamadı: ${programId}`);
  program.curriculumUrls = [url];
  program.curriculumAuthority = authority;
}

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.4";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, university) => total + university.programs.reduce((subtotal, item) => subtotal + (item.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
  addedCurricula: curricula.length,
}, null, 2));
