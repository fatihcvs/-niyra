import { readFile, writeFile } from "node:fs/promises";
import https from "node:https";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const universityId = "tr-yildiz-teknik-universitesi";
const authority = "Yıldız Teknik Üniversitesi";
const officialHost = "www.bologna.yildiz.edu.tr";
const baseUrl = `https://${officialHost}`;
const indexUrl = `${baseUrl}/index.php?r=program%2Fbachelor`;
const headers = {
  accept: "text/html,application/xhtml+xml",
  "accept-encoding": "identity",
  "user-agent": "KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)",
};
const source = {
  id: "yildiz-bologna-curricula-2026",
  authority,
  title: "Bologna Bilgi Sistemi güncel lisans programları ve ders planları",
  url: indexUrl,
};

// YTÜ'nün resmî Bologna sunucusu 4 Eylül 2026'da eksik bir TLS sertifika zinciri
// sunuyor. Sertifika denetimi yalnızca bu sabit resmî alan adı için gevşetilir;
// yönlendirmelerin başka bir sunucuya çıkmasına izin verilmez.
function getOfficialHtml(inputUrl, redirectCount = 0) {
  const url = new URL(inputUrl);
  if (url.protocol !== "https:" || url.hostname !== officialHost) {
    throw new Error(`İzin verilmeyen YTÜ Bologna hedefi: ${url.href}`);
  }
  if (redirectCount > 3) throw new Error(`Çok fazla YTÜ Bologna yönlendirmesi: ${url.href}`);

  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers,
      rejectUnauthorized: false,
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirected = new URL(response.headers.location, url);
        if (redirected.hostname !== officialHost) {
          reject(new Error(`YTÜ Bologna alan dışına yönlendirdi: ${redirected.href}`));
          return;
        }
        resolve(getOfficialHtml(redirected.href, redirectCount + 1));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        html: Buffer.concat(chunks).toString("utf8"),
        url: url.href,
      }));
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error(`YTÜ Bologna zaman aşımı: ${url.href}`)));
  });
}

const decodeHtml = (value) => value
  .replace(/&amp;/giu, "&")
  .replace(/&quot;|&#34;/giu, "\"")
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const normalizeName = (value) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9çğıöşü]+/gu, " ")
  .trim();

const officialNameAliases = new Map([
  ["Bilgisayar ve Öğretim Teknolojileri Eğitimi", "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği"],
  ["Fen Bilgisi Eğitimi", "Fen Bilgisi Öğretmenliği"],
  ["İlköğretim Matematik Eğitimi", "İlköğretim Matematik Öğretmenliği"],
  ["Okulöncesi Eğitimi", "Okul Öncesi Öğretmenliği"],
  ["Sosyal Bilgiler Eğitimi", "Sosyal Bilgiler Öğretmenliği"],
  ["Türkçe Eğitimi", "Türkçe Öğretmenliği"],
  ["Fransızca Mütercim Tercümanlık", "Fransızca Mütercim ve Tercümanlık"],
  ["Elektronik & Haberleşme Mühendisliği", "Elektronik ve Haberleşme Mühendisliği"],
  ["Metalürji ve Malzeme Mühendisliği", "Metalurji ve Malzeme Mühendisliği"],
]);

function parseOfficialName(rawName) {
  let value = decodeHtml(rawName)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const isEnglish = /\(%100 İngilizce\)$/iu.test(value);
  value = value
    .replace(/\s+\(2018 versiyon\)$/iu, "")
    .replace(/\s+\(%(?:30|100) İngilizce\)$/iu, "")
    .replace(/\s+Lisans Programı$/iu, "");
  value = officialNameAliases.get(value) ?? value;
  return isEnglish ? `${value} (İngilizce)` : value;
}

const indexResponse = await getOfficialHtml(indexUrl);
if (indexResponse.status !== 200) {
  throw new Error(`YTÜ lisans dizini alınamadı: HTTP ${indexResponse.status}`);
}
const officialProgrammes = [...indexResponse.html.matchAll(
  /<a[^>]+href=["']([^"']*program\/view[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu,
)].map((match) => {
  const href = decodeHtml(match[1]);
  const parsed = new URL(href, baseUrl);
  return {
    id: parsed.searchParams.get("id"),
    academicUnitId: parsed.searchParams.get("aid"),
    rawName: decodeHtml(match[2]).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim(),
    catalogName: parseOfficialName(match[2]),
  };
}).filter((item) => item.id && item.academicUnitId);

if (officialProgrammes.length !== 64) {
  throw new Error(`YTÜ lisans dizini beklenmiyor: ${officialProgrammes.length}`);
}

const university = catalog.universities[universityId];
if (!university) throw new Error("Yıldız Teknik Üniversitesi katalog kaydı bulunamadı.");
const bachelorProgrammes = university.programs.filter((item) => item.degreeLevel === "bachelor");
if (bachelorProgrammes.length !== 56) {
  throw new Error(`YTÜ katalog lisans sayısı beklenmiyor: ${bachelorProgrammes.length}`);
}

const mappings = bachelorProgrammes.map((programme) => {
  const candidates = officialProgrammes.filter(
    (item) => normalizeName(item.catalogName) === normalizeName(programme.name),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `YTÜ program eşleşmesi tekil değil: ${programme.name} (${candidates.length})`,
    );
  }
  return { programme, official: candidates[0] };
});

for (let offset = 0; offset < mappings.length; offset += 4) {
  const batch = mappings.slice(offset, offset + 4);
  await Promise.all(batch.map(async ({ programme, official }) => {
    const url = `${baseUrl}/index.php?r=program/view&id=${official.id}&aid=${official.academicUnitId}`;
    const response = await getOfficialHtml(url);
    const courseIds = new Set([
      ...response.html.matchAll(/r=course\/view&amp;id=(\d+)&amp;aid=/giu),
    ].map((match) => match[1]));
    const courseCodes = new Set([
      ...response.html.matchAll(/\b[A-ZÇĞİÖŞÜ]{2,8}[ -]?\d{2,4}\b/gu),
    ].map((match) => match[0]));
    if (response.status !== 200 || response.html.length < 25_000
      || !/\bAKTS\b/iu.test(response.html) || courseIds.size < 5 || courseCodes.size < 5) {
      throw new Error(
        `YTÜ ders planı doğrulanamadı (${programme.name}, ${official.id}/${official.academicUnitId}): `
        + `HTTP ${response.status}, ${response.html.length} bayt, ${courseIds.size} ders, ${courseCodes.size} kod`,
      );
    }
  }));
}

for (const { programme, official } of mappings) {
  programme.curriculumUrls = [
    `${baseUrl}/index.php?r=program/view&id=${official.id}&aid=${official.academicUnitId}`,
  ];
  programme.curriculumAuthority = authority;
}

const unlinkedBachelorProgrammes = bachelorProgrammes.filter((program) => !program.curriculumUrls?.length);
if (unlinkedBachelorProgrammes.length > 0) {
  throw new Error(`YTÜ bağlantısız lisans kaldı: ${unlinkedBachelorProgrammes.map((program) => program.name).join(", ")}`);
}

if (!catalog.meta.sources.some((item) => item.id === source.id)) catalog.meta.sources.push(source);

const universities = Object.values(catalog.universities);
catalog.meta.version = "2026.14";
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
  curriculumLinkCount: catalog.meta.stats.curriculumLinkCount,
}, null, 2));
