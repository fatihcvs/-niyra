import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { universities } from "../../lib/university-catalog.ts";

const outputDirectory = path.resolve("public/university-logos");
const catalogPath = path.resolve("data/university-logos-2026.json");
const repository = "izzetemredemir/Turkish-universities";
const userAgent = "KampiraLogoCatalog/1.0 (educational university discovery product)";

const datasetNameAliases = new Map([
  ["Bezmialem Vakıf Üniversitesi", "Bezm-i Âlem Vakıf Üniversitesi"],
  ["Manisa Celal Bayar Üniversitesi", "Manisa Celâl Bayar Üniversitesi"],
]);

const sharedLogoAliases = new Map([
  ["kktc-altinbas-kibris-universitesi", "tr-altinbas-universitesi"],
  ["kktc-itu-kktc-egitim-arastirma-yerleskeleri", "tr-istanbul-teknik-universitesi"],
  ["kktc-odtu-kuzey-kibris-kampusu", "tr-orta-dogu-teknik-universitesi"],
]);

const officialWebsiteOverrides = new Map([
  ["American University of Beirut – Mediterraneo", "https://www.aubmed.ac.cy/"],
  ["American University of Cyprus (AUCY)", "https://aucy.ac.cy/"],
  ["Avrupa Liderlik Üniversitesi", "https://elu.edu.tr/"],
  ["Cosmos Open University", "https://www.cosmos.com.cy/"],
  ["Cyprus University of Technology", "https://www.cut.ac.cy/"],
  ["Kıbrıs Aydın Üniversitesi", "https://cau.edu.tr/"],
  ["Milli Savunma Üniversitesi", "https://www.msu.edu.tr/"],
  ["National and Kapodistrian University of Athens – Cyprus Branch", "https://uoa.ac.cy/"],
  ["Neapolis University Pafos", "https://www.nup.ac.cy/"],
  ["Onbeş Kasım Kıbrıs Üniversitesi", "https://onbeskku.edu.tr/"],
  ["Open University of Cyprus", "https://www.ouc.ac.cy/"],
  ["Philips University", "https://philipsuni.ac.cy/"],
  ["University of Central Lancashire Cyprus (UCLan Cyprus)", "https://www.uclancyprus.ac.cy/"],
  ["University of Cyprus", "https://www.ucy.ac.cy/"],
  ["University of Limassol", "https://www.uol.ac.cy/"],
  ["University of Nicosia", "https://www.unic.ac.cy/"],
]);

const commonsLogoOverrides = new Map([
  ["Avrupa Liderlik Üniversitesi", "ELU logo.png"],
  ["University of Cyprus", "University of Cyprus.svg"],
]);

const officialLogoAssetOverrides = new Map([
  ["American University of Cyprus (AUCY)", "https://aucy.ac.cy/images/AUCY_logo.png"],
  ["Milli Savunma Üniversitesi", "https://msu.edu.tr/Yeni_Logolar/MilliSavunmaUniversitesiLogo.png"],
]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function normalize(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchResponse(url, options = {}, attempts = 2) {
  const { timeoutMs = 20_000, ...requestOptions } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...requestOptions,
        headers: { "user-agent": userAgent, ...(requestOptions.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await delay(350 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  return fetchResponse(url, { headers: { accept: "application/json" } }).then((response) => response.json());
}

async function renderLogo(buffer, universityId) {
  const outputPath = path.join(outputDirectory, `${universityId}.webp`);
  const rendered = await sharp(buffer, { failOn: "error", limitInputPixels: 40_000_000 })
    .resize(160, 160, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 5 })
    .toBuffer();
  await writeFile(outputPath, rendered);
  return `/university-logos/${universityId}.webp`;
}

async function downloadDatasetLogo(university, entry, rawBaseUrl) {
  const sourceUrl = `${rawBaseUrl}/logolar/${entry.logo.dosya.split("/").map(encodeURIComponent).join("/")}`;
  const buffer = Buffer.from(await (await fetchResponse(sourceUrl, { timeoutMs: 60_000 }, 3)).arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const assetPath = await renderLogo(buffer, university.id);
  return {
    assetPath,
    sourceKind: "turkish-universities-dataset",
    sourceUrl: entry.logo.kaynak_url ?? sourceUrl,
    repositoryAssetUrl: sourceUrl,
    officialWebsite: entry.web ?? null,
    wikidataId: entry.wikidata_qid ?? null,
    license: entry.logo.lisans ?? "Belirtilmemiş",
    licenseClass: entry.logo.lisans_sinifi ?? "belirsiz",
    attribution: entry.logo.atif ?? null,
    sourceSha256: checksum,
    declaredSha256: entry.logo.sha256 ?? null,
    checksumVerified: !entry.logo.sha256 || checksum === entry.logo.sha256,
    trademarkUse: true,
  };
}

function claimValues(entity, property) {
  return (entity?.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter(Boolean);
}

async function findWikidataEntity(universityName) {
  const endpoint = new URL("https://www.wikidata.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: universityName.includes("University") ? "en" : "tr",
    uselang: "en",
    type: "item",
    limit: "7",
    search: universityName,
  });
  const result = await fetchJson(endpoint);
  const exact = result.search?.find((candidate) => normalize(candidate.label ?? "") === normalize(universityName));
  const candidate = exact ?? result.search?.[0];
  if (!candidate?.id) return null;
  const document = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.id}.json`);
  return document.entities?.[candidate.id] ?? null;
}

async function getCommonsLogo(fileName) {
  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "512",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms",
    titles: `File:${fileName}`,
  });
  const result = await fetchJson(endpoint);
  const page = Object.values(result.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  return {
    assetUrl: info.thumburl ?? info.url,
    sourcePageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replaceAll(" ", "_"))}`,
    metadata: info.extmetadata ?? {},
  };
}

function htmlEntityDecode(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&#038;", "&").replaceAll("&quot;", '"').trim();
}

function plainMetadata(value) {
  if (!value || typeof value !== "string") return value ?? null;
  return htmlEntityDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function extractAttribute(tag, attribute) {
  return tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function discoverLogoCandidates(html, website) {
  const candidates = [];
  for (const match of html.matchAll(/"logo"\s*:\s*"([^"]+)"/gi)) candidates.push(match[1]);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = extractAttribute(match[0], "rel") ?? "";
    const href = extractAttribute(match[0], "href");
    if (href && /(?:apple-touch-icon|icon)/i.test(rel)) candidates.push(href);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const identity = [extractAttribute(match[0], "class"), extractAttribute(match[0], "id"), extractAttribute(match[0], "alt")].filter(Boolean).join(" ");
    const source = extractAttribute(match[0], "src") ?? extractAttribute(match[0], "data-src");
    if (source && (/logo|amblem|university mark/i.test(identity) || /logo|amblem/i.test(source))) candidates.push(source);
  }
  candidates.push("/apple-touch-icon.png", "/favicon.png", "/favicon.ico");
  return [...new Set(candidates.flatMap((value) => {
    try {
      const resolved = new URL(htmlEntityDecode(value), website);
      return resolved.protocol === "https:" || resolved.protocol === "http:" ? [resolved.href] : [];
    } catch {
      return [];
    }
  }))];
}

async function downloadOfficialSiteLogo(university, website) {
  if (!website) return null;
  let finalWebsite = website;
  let html = "";
  try {
    const response = await fetchResponse(website, { headers: { accept: "text/html,application/xhtml+xml" } });
    finalWebsite = response.url;
    html = await response.text();
  } catch {
    return null;
  }
  for (const assetUrl of discoverLogoCandidates(html, finalWebsite).slice(0, 14)) {
    try {
      const response = await fetchResponse(assetUrl, { headers: { accept: "image/avif,image/webp,image/png,image/svg+xml,image/*" } }, 1);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 5_000_000) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 5_000_000 || buffer.length < 100) continue;
      const assetPath = await renderLogo(buffer, university.id);
      return {
        assetPath,
        sourceKind: "official-site-asset",
        sourceUrl: assetUrl,
        officialWebsite: finalWebsite,
        license: "Kurum ticari markası",
        licenseClass: "trademark",
        attribution: university.name,
        trademarkUse: true,
      };
    } catch {
      // Try the next declared institutional image.
    }
  }
  return null;
}

async function downloadOfficialAsset(university, assetUrl) {
  const response = await fetchResponse(assetUrl, { headers: { accept: "image/avif,image/webp,image/png,image/svg+xml,image/*" }, timeoutMs: 15_000 }, 1);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5_000_000 || buffer.length < 100) return null;
  const assetPath = await renderLogo(buffer, university.id);
  return {
    assetPath,
    sourceKind: "official-site-asset",
    sourceUrl: assetUrl,
    officialWebsite: officialWebsiteOverrides.get(university.name) ?? new URL(assetUrl).origin,
    license: "Kurum ticari markası",
    licenseClass: "trademark",
    attribution: university.name,
    trademarkUse: true,
  };
}

async function downloadCommonsLogo(university, fileName, entity = null) {
  if (!fileName) return null;
  const commons = await getCommonsLogo(fileName);
  if (!commons) return null;
  const buffer = Buffer.from(await (await fetchResponse(commons.assetUrl)).arrayBuffer());
  const assetPath = await renderLogo(buffer, university.id);
  const metadataValue = (key) => commons.metadata[key]?.value ?? null;
  return {
    assetPath,
    sourceKind: "wikimedia-commons",
    sourceUrl: commons.sourcePageUrl,
    repositoryAssetUrl: commons.assetUrl,
    officialWebsite: claimValues(entity, "P856")[0] ?? officialWebsiteOverrides.get(university.name) ?? null,
    wikidataId: entity?.id ?? null,
    license: metadataValue("LicenseShortName") ?? metadataValue("UsageTerms") ?? "Belirtilmemiş",
    licenseUrl: metadataValue("LicenseUrl"),
    attribution: plainMetadata(metadataValue("Artist") ?? metadataValue("Credit")) ?? university.name,
    trademarkUse: true,
  };
}

async function downloadWikidataLogo(university, entity) {
  return downloadCommonsLogo(university, claimValues(entity, "P154")[0], entity);
}

async function runPool(items, limit, worker) {
  let index = 0;
  const results = new Array(items.length);
  async function runner() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = { status: "fulfilled", value: await worker(items[current], current) };
      } catch (error) {
        results[current] = { status: "rejected", reason: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

await mkdir(outputDirectory, { recursive: true });

const commit = await fetchJson(`https://api.github.com/repos/${repository}/commits/main`);
const sourceCommit = commit.sha;
const rawBaseUrl = `https://raw.githubusercontent.com/${repository}/${sourceCommit}`;
const dataset = await fetchJson(`${rawBaseUrl}/universiteler.json`);
const datasetByName = new Map(dataset.map((entry) => [normalize(entry.ad), entry]));
const catalog = {};
const failures = [];

let existingCatalog = null;
try {
  existingCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
} catch {
  // A first run has no local cache.
}
if (existingCatalog?.meta?.sourceDatasetCommit === sourceCommit) {
  for (const university of universities) {
    const record = existingCatalog.logos?.[university.id];
    if (record?.sourceKind !== "turkish-universities-dataset") continue;
    if (await fileExists(path.join(outputDirectory, `${university.id}.webp`))) catalog[university.id] = record;
  }
}

const datasetCandidates = universities.flatMap((university) => {
  if (catalog[university.id]) return [];
  const lookupName = datasetNameAliases.get(university.name) ?? university.name;
  const entry = datasetByName.get(normalize(lookupName));
  return entry?.logo?.dosya ? [{ university, entry }] : [];
});

const datasetResults = await runPool(datasetCandidates, 8, async ({ university, entry }) => {
  const record = await downloadDatasetLogo(university, entry, rawBaseUrl);
  catalog[university.id] = record;
  process.stdout.write(".");
  return university.id;
});
datasetResults.forEach((result, index) => {
  if (result.status === "rejected") failures.push({ university: datasetCandidates[index].university.name, stage: "dataset", reason: result.reason });
});
process.stdout.write("\n");

for (const [universityId, sourceUniversityId] of sharedLogoAliases) {
  const sourceRecord = catalog[sourceUniversityId];
  const university = universities.find((item) => item.id === universityId);
  if (!sourceRecord || !university) continue;
  catalog[universityId] = { ...sourceRecord, reusedFrom: sourceUniversityId };
}

if (existingCatalog?.meta?.sourceDatasetCommit === sourceCommit) {
  for (const university of universities) {
    if (catalog[university.id]) continue;
    const record = existingCatalog.logos?.[university.id];
    if (record && await fileExists(path.join(outputDirectory, `${university.id}.webp`))) catalog[university.id] = record;
  }
}

const unresolved = universities.filter((university) => !catalog[university.id]);
const wikidataResults = await runPool(unresolved, 3, async (university) => {
  await delay(120);
  let entity = null;
  let record = null;
  const officialAssetOverride = officialLogoAssetOverrides.get(university.name);
  if (officialAssetOverride) {
    try {
      record = await downloadOfficialAsset(university, officialAssetOverride);
    } catch {
      // A browser-restricted institutional host can be populated from the same pinned URL locally.
    }
  }
  const commonsOverride = commonsLogoOverrides.get(university.name);
  if (!record && commonsOverride) {
    try {
      record = await downloadCommonsLogo(university, commonsOverride);
    } catch {
      // Continue with institutional discovery when a pinned Commons asset is unavailable.
    }
  }
  try {
    entity = await findWikidataEntity(university.name);
  } catch {
    // Official-site discovery can still cover the university.
  }
  if (!record && entity) {
    try {
      record = await downloadWikidataLogo(university, entity);
    } catch {
      // Prefer a verified official-site asset when Commons fails.
    }
  }
  if (!record) {
    const sourceEntry = datasetByName.get(normalize(datasetNameAliases.get(university.name) ?? university.name));
    const website = officialWebsiteOverrides.get(university.name) ?? claimValues(entity, "P856")[0] ?? sourceEntry?.web ?? null;
    record = await downloadOfficialSiteLogo(university, website);
  }
  if (!record) throw new Error("verified logo source not found");
  catalog[university.id] = record;
  process.stdout.write("+");
  return university.id;
});
wikidataResults.forEach((result, index) => {
  if (result.status === "rejected") failures.push({ university: unresolved[index].name, stage: "fallback", reason: result.reason });
});
process.stdout.write("\n");

const orderedLogos = Object.fromEntries(universities.filter((university) => catalog[university.id]).map((university) => [university.id, {
  ...catalog[university.id],
  attribution: plainMetadata(catalog[university.id].attribution),
}]));
const output = {
  meta: {
    version: "2026.1",
    updatedAt: "2026-09-04",
    universityCount: universities.length,
    logoCount: Object.keys(orderedLogos).length,
    fallbackCount: universities.length - Object.keys(orderedLogos).length,
    sourceDataset: `https://github.com/${repository}/tree/${sourceCommit}`,
    sourceDatasetCommit: sourceCommit,
    notes: "Logos are used only to identify their institutions. Rights remain with the respective trademark owners. Missing or unverifiable assets intentionally fall back to the university abbreviation.",
  },
  logos: orderedLogos,
};
await writeFile(catalogPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(JSON.stringify({ ...output.meta, failures }, null, 2));
