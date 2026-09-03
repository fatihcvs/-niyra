import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const source = {
  id: "msu-curricula-2026",
  authority: "Millî Savunma Üniversitesi",
  title: "Harp Okulları ve Astsubay Meslek Yüksekokulları resmî ders planları",
  url: "https://www.msu.edu.tr/",
};

if (!catalog.meta.sources.some((item) => item.id === source.id)) {
  catalog.meta.sources.push(source);
}

const msu = catalog.universities["tr-milli-savunma-universitesi"];
if (!msu) throw new Error("Millî Savunma Üniversitesi katalog kaydı bulunamadı.");

const curriculumByProgramId = new Map([
  ["program-msu-01-01", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/bilgisayar_lisans_prog.html", "Güncel"]],
  ["program-msu-01-02", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/elektronik_lisans_prog.html", "Güncel"]],
  ["program-msu-01-03", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/endustri_lisans_prog.html", "Güncel"]],
  ["program-msu-01-04", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/insaat_lisans_prog.html", "Güncel"]],
  ["program-msu-01-05", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/makine_lisans_prog.html", "Güncel"]],
  ["program-msu-01-06", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/savunma_ynt_lisans-prog.html", "Güncel"]],
  ["program-msu-01-07", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/tarih_lisans_prog.html", "Güncel"]],
  ["program-msu-01-08", ["https://kho.msu.edu.tr/akademik/dekanlik/lisans_programlari/uluslararasi_iliskiler_lisans_prog.html", "Güncel"]],
  ["program-msu-02-01", ["https://dho.msu.edu.tr/dekanlik/bolum/bilgisayar/akademikprogram2023.html", "2023"]],
  ["program-msu-02-02", ["https://dho.msu.edu.tr/dekanlik/bolum/elektrik-elektronik/akademikprogram2023.html", "2023"]],
  ["program-msu-02-03", ["https://dho.msu.edu.tr/dekanlik/bolum/endustri/akademikprogram2023.html", "2023"]],
  ["program-msu-02-04", ["https://dho.msu.edu.tr/dekanlik/bolum/gemi_insaa/akademikprogram2023.html", "2023"]],
  ["program-msu-02-05", ["https://dho.msu.edu.tr/dekanlik/bolum/makine/akademikprogram2023.html", "2023"]],
  ["program-msu-02-06", ["https://dho.msu.edu.tr/dekanlik/bolum/ulusrarasi_iliskiler/bolumdersleri.html", "Güncel ders listesi"]],
]);

const sharedCurricula = new Map([
  ["unit-msu-kara-astsubay-myo", "https://www.msu.edu.tr/tanitim/KAMYO/KAMYO_Ders_Programi_2022.pdf"],
  ["unit-msu-deniz-astsubay-myo", "https://www.msu.edu.tr/tanitim/DAMYO/DAMYO_Ders_Programi_2022.pdf"],
  ["unit-msu-hava-astsubay-myo", "https://www.msu.edu.tr/tanitim/HAMYO/HAMYO_Ders_Programi_2022.pdf"],
]);

for (const program of msu.programs) {
  const direct = curriculumByProgramId.get(program.id);
  const sharedUrl = sharedCurricula.get(program.unitId);
  if (!direct && !sharedUrl) continue;

  const [url, period] = direct ?? [sharedUrl, "2021-2022"];
  program.curriculumUrls = [url];
  program.curriculumAuthority = "Millî Savunma Üniversitesi";
  program.curriculumPeriod = period;
}

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.3";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.limitations = "Individual semester course lists are maintained by each university. Institution-published programme coverage was added for six previously uncovered institutions; official curriculum links are exposed only when the source publishes them, and their publication period is shown when the source is dated.";
catalog.meta.stats.curriculumLinkCount = universities.reduce(
  (total, university) => total + university.programs.reduce((subtotal, item) => subtotal + (item.curriculumUrls?.length ?? 0), 0),
  0,
);

await writeFile(catalogUrl, JSON.stringify(catalog), "utf8");

console.log(JSON.stringify({
  catalogVersion: catalog.meta.version,
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
  msuCurriculumPrograms: msu.programs.filter((program) => program.curriculumUrls?.length).length,
}, null, 2));
