import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { categoryFor } from "./classify-campus-place.mjs";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const OUTPUT_PATH = path.join(ROOT, "data", "campus-places-2026.json");
const REPORT_PATH = path.join(CACHE_DIR, "campus-place-match-report.json");
const CHECKED_AT = "2026-09-04";
const MAX_PLACES_PER_UNIVERSITY = 40;
const MAX_ANCHORS_PER_UNIVERSITY = 5;
const NEARBY_RADIUS_METERS = 1_500;

const { universities } = await import("../../lib/university-catalog.ts");
const logoCatalog = JSON.parse(await readFile(path.join(ROOT, "data", "university-logos-2026.json"), "utf8"));
const osm = JSON.parse(await readFile(path.join(CACHE_DIR, "osm-places.json"), "utf8"));
const officialSources = JSON.parse(await readFile(path.join(ROOT, "data", "campus-place-official-sources-2026.json"), "utf8"));
const librarySources = JSON.parse(await readFile(path.join(ROOT, "data", "campus-library-official-sources-2026.json"), "utf8"));
const cyprusPlaces = JSON.parse(await readFile(path.join(ROOT, "data", "cyprus-campus-places-2026.json"), "utf8"));
const turkeyAreas = JSON.parse(await readFile(path.join(ROOT, "data", "turkey-campus-areas-2026.json"), "utf8"));
const officialGeocodes = JSON.parse(await readFile(path.join(CACHE_DIR, "nominatim-official-places.json"), "utf8"));
const wikidataEntities = JSON.parse(await readFile(path.join(CACHE_DIR, "wikidata-university-entities.json"), "utf8"));

const stopWords = new Set([
  "and", "at", "campus", "education", "egitim", "enstitusu", "fakultesi", "for", "kampus", "kampusu",
  "kibris", "of", "okulu", "rektorlugu", "the", "turkiye", "universite", "universitesi", "universitesi-cerrahpasa",
  "university", "yerleskesi", "yerleskeleri", "yuksekokulu",
]);

const manualAliases = {
  omu: ["ondokuz mayis universitesi", "19 mayis universitesi"],
  "tr-orta-dogu-teknik-universitesi": ["odtu", "middle east technical university", "metu"],
  "tr-istanbul-teknik-universitesi": ["itu", "istanbul technical university"],
  "tr-ihsan-dogramaci-bilkent-universitesi": ["bilkent university", "bilkent universitesi"],
  "tr-tobb-ekonomi-ve-teknoloji-universitesi": ["tobb etu", "tobb university of economics and technology"],
  "tr-turk-alman-universitesi": ["turk alman universitesi", "turkish german university"],
  "tr-kutahya-dumlupinar-universitesi": ["dumlupinar universitesi"],
  "tr-mugla-sitki-kocman-universitesi": ["mugla universitesi"],
  "tr-bolu-abant-izzet-baysal-universitesi": ["abant izzet baysal universitesi"],
  "tr-saglik-bilimleri-universitesi": ["university of health sciences"],
  "kktc-dogu-akdeniz-universitesi": ["eastern mediterranean university", "emu"],
  "kktc-yakin-dogu-universitesi": ["near east university", "neu"],
  "kktc-uluslararasi-kibris-universitesi": ["cyprus international university", "ciu"],
  "kktc-lefke-avrupa-universitesi": ["european university of lefke", "eul"],
  "kktc-odtu-kuzey-kibris-kampusu": ["metu northern cyprus campus", "odtu kuzey kibris kampusu"],
  "kktc-arkin-yaratici-sanatlar-ve-tasarim-universitesi": ["arkin university of creative arts and design", "arucad university", "arucad"],
  "kktc-uluslararasi-final-universitesi": ["final international university"],
  "tr-istanbul-nisantasi-universitesi": ["nisantasi universitesi", "nisantasi university"],
  "cy-university-of-central-lancashire-cyprus-uclan-cyprus": ["uclan cyprus", "university of central lancashire cyprus"],
};

function fold(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value) {
  return fold(value).replaceAll(" ", "-");
}

function hasUsefulName(value) {
  return fold(value).replaceAll(" ", "").length >= 3;
}

function tokens(value) {
  return fold(value).split(" ").filter((token) => token.length > 1 && !stopWords.has(token));
}

function getCoordinates(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function isCyprus({ latitude, longitude }) {
  return latitude >= 34.35 && latitude <= 35.8 && longitude >= 32.0 && longitude <= 35.1;
}

function regionCompatible(university, coordinates) {
  return university.region === "Türkiye" ? !isCyprus(coordinates) : isCyprus(coordinates);
}

function domain(value) {
  if (!value) return "";
  try {
    return new URL(String(value).startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function elementStrings(element) {
  const tags = element.tags ?? {};
  return [tags.name, tags["name:tr"], tags["name:en"], tags.official_name, tags.alt_name, tags.short_name, tags.operator, tags.brand]
    .filter(Boolean)
    .map(String);
}

function matchScore(university, element) {
  const strings = elementStrings(element);
  const logo = logoCatalog.logos[university.id] ?? {};
  const universityDomain = domain(logo.officialWebsite);
  const elementDomains = [element.tags?.website, element.tags?.["contact:website"], element.tags?.url].map(domain).filter(Boolean);
  if (universityDomain && elementDomains.some((candidate) => candidate === universityDomain || candidate.endsWith(`.${universityDomain}`))) return { score: 1, reason: "official-domain" };
  if (logo.wikidataId && element.tags?.wikidata === logo.wikidataId) return { score: 1, reason: "wikidata" };

  const names = [university.name, ...(manualAliases[university.id] ?? [])];
  let best = { score: 0, reason: "none" };
  for (const expected of names) {
    const expectedFolded = fold(expected);
    const expectedTokens = tokens(expected);
    for (const actual of strings) {
      const actualFolded = fold(actual);
      const actualTokens = tokens(actual);
      if (!actualFolded) continue;
      if (actualFolded === expectedFolded) return { score: 1, reason: "exact-name" };
      if (expectedFolded.length >= 5 && new RegExp(`(^| )${expectedFolded}( |$)`).test(actualFolded)) best = { score: Math.max(best.score, 0.97), reason: "contained-name" };
      if (actualFolded.length >= 5 && new RegExp(`(^| )${actualFolded}( |$)`).test(expectedFolded)) best = { score: Math.max(best.score, 0.91), reason: "contained-name" };
      if (expectedTokens.length >= 2) {
        const actualSet = new Set(actualTokens);
        const matched = expectedTokens.filter((token) => actualSet.has(token)).length;
        const coverage = matched / expectedTokens.length;
        const union = new Set([...expectedTokens, ...actualTokens]).size;
        const jaccard = union ? matched / union : 0;
        const score = coverage === 1 ? 0.94 : coverage * 0.72 + jaccard * 0.24;
        if (score > best.score) best = { score, reason: "token-similarity" };
      }
    }
  }
  return best;
}

function isCampusAnchor(element) {
  const tags = element.tags ?? {};
  return tags.amenity === "university" || (tags.landuse === "education" && /univers|ünivers|campus|kampüs/i.test(tags.name ?? ""));
}

function osmUrl(element) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function haversine(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function addressFor(tags = {}) {
  if (tags["addr:full"]) return tags["addr:full"];
  const parts = [
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    tags["addr:suburb"], tags["addr:district"], tags["addr:city"], tags["addr:province"], tags["addr:postcode"],
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function accessibilityFor(tags = {}) {
  const result = [];
  if (tags.wheelchair === "yes") result.push("step-free");
  if (tags.toilets?.wheelchair === "yes" || tags["toilets:wheelchair"] === "yes") result.push("accessible-toilet");
  return result;
}

const anchors = osm.elements.filter((element) => isCampusAnchor(element) && getCoordinates(element));
const matchesByUniversity = new Map(universities.map((university) => [university.id, []]));
const anchorDecisions = [];

for (const anchor of anchors) {
  const coordinates = getCoordinates(anchor);
  const candidates = universities
    .filter((university) => regionCompatible(university, coordinates))
    .map((university) => ({ university, ...matchScore(university, anchor) }))
    .sort((left, right) => right.score - left.score);
  if (process.env.DEBUG_OSM === `${anchor.type}/${anchor.id}`) {
    console.log(JSON.stringify({ anchor: `${anchor.type}/${anchor.id}`, strings: elementStrings(anchor), candidates: candidates.slice(0, 8).map(({ university, score, reason }) => ({ id: university.id, name: university.name, score, reason })) }, null, 2));
  }
  const best = candidates[0];
  const runnerUp = candidates[1];
  const accepted = best && best.score >= 0.90 && (best.score >= 0.99 || best.score - (runnerUp?.score ?? 0) >= 0.06);
  if (accepted) matchesByUniversity.get(best.university.id).push({ element: anchor, coordinates, score: best.score, reason: best.reason });
  if (best?.score >= 0.7) anchorDecisions.push({ osm: `${anchor.type}/${anchor.id}`, name: anchor.tags?.name, accepted, universityId: best.university.id, score: best.score, reason: best.reason, runnerUp: runnerUp ? { id: runnerUp.university.id, score: runnerUp.score } : null });
}

for (const matches of matchesByUniversity.values()) {
  const seen = new Set();
  matches.sort((left, right) => right.score - left.score || (left.element.type === "relation" ? -1 : 1));
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const key = `${fold(matches[index].element.tags?.name)}:${matches[index].coordinates.latitude.toFixed(3)}:${matches[index].coordinates.longitude.toFixed(3)}`;
    if (seen.has(key)) matches.splice(index, 1);
    else seen.add(key);
  }
  matches.splice(MAX_ANCHORS_PER_UNIVERSITY);
}

const places = [];
const coverage = [];
for (const university of universities) {
  const anchorMatches = matchesByUniversity.get(university.id);
  if (!anchorMatches.length) {
    coverage.push({ universityId: university.id, universityName: university.name, region: university.region, anchors: 0, places: 0 });
    continue;
  }

  const candidates = [];
  for (const element of osm.elements) {
    const coordinates = getCoordinates(element);
    const category = coordinates ? categoryFor(element, isCampusAnchor(element)) : null;
    if (!category || !hasUsefulName(element.tags?.name)) continue;
    const nearestAnchor = anchorMatches
      .map((anchor) => ({ anchor, distance: haversine(anchor.coordinates, coordinates) }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (!isCampusAnchor(element) && nearestAnchor.distance > NEARBY_RADIUS_METERS) continue;
    if (isCampusAnchor(element) && !anchorMatches.some((anchor) => anchor.element.type === element.type && anchor.element.id === element.id)) continue;
    candidates.push({
      element,
      coordinates,
      category,
      distance: Math.round(nearestAnchor.distance),
      campusName: nearestAnchor.anchor.element.tags?.name ?? university.name,
      isAnchor: isCampusAnchor(element),
    });
  }

  const chosen = [];
  const seenElements = new Set();
  const seenNames = new Set();
  const categoryPriority = ["building", "library", "food", "study", "social", "sports", "health", "transport", "other"];
  const anchorsFirst = candidates.filter((candidate) => candidate.isAnchor).sort((left, right) => left.distance - right.distance);
  const nearbyByCategory = new Map(categoryPriority.map((category) => [category, candidates
    .filter((candidate) => !candidate.isAnchor && candidate.category === category)
    .sort((left, right) => left.distance - right.distance)]));
  const balancedNearby = [];
  for (let round = 0; round < 4; round += 1) {
    for (const category of categoryPriority) {
      const candidate = nearbyByCategory.get(category)?.[round];
      if (candidate) balancedNearby.push(candidate);
    }
  }
  const sorted = [...anchorsFirst, ...balancedNearby, ...candidates.filter((candidate) => !candidate.isAnchor).sort((left, right) => left.distance - right.distance)];
  for (const candidate of sorted) {
    const elementKey = `${candidate.element.type}/${candidate.element.id}`;
    const nameKey = `${candidate.category}:${fold(candidate.element.tags.name)}`;
    if (seenElements.has(elementKey) || seenNames.has(nameKey)) continue;
    if (chosen.length >= MAX_PLACES_PER_UNIVERSITY) break;
    seenElements.add(elementKey);
    seenNames.add(nameKey);
    chosen.push(candidate);
  }

  for (const candidate of chosen) {
    const tags = candidate.element.tags ?? {};
    const label = candidate.isAnchor ? "kampüs/üniversite kaydı" : `${candidate.distance} m çevredeki açık harita kaydı`;
    places.push({
      id: `catalog:${university.id}:osm-${candidate.element.type}-${candidate.element.id}`,
      universityId: university.id,
      name: tags.name,
      category: candidate.category,
      description: `${university.name} için ${label}. Bilgi OpenStreetMap üzerindeki ad ve konum kaydından alınmıştır.`,
      address: addressFor(tags),
      latitude: Number(candidate.coordinates.latitude.toFixed(6)),
      longitude: Number(candidate.coordinates.longitude.toFixed(6)),
      accessibility: accessibilityFor(tags),
      openingHours: tags.opening_hours ?? "",
      distanceMeters: candidate.distance,
      campusName: candidate.campusName,
      source: {
        type: "openstreetmap",
        label: "OpenStreetMap",
        url: osmUrl(candidate.element),
        checkedAt: CHECKED_AT,
        osmElement: `${candidate.element.type}/${candidate.element.id}`,
      },
    });
  }
  coverage.push({ universityId: university.id, universityName: university.name, region: university.region, anchors: anchorMatches.length, places: chosen.length });
}

const officialRecordIndexes = new Map();
for (const record of [...officialSources.records, ...librarySources.records]) {
  const university = universities.find((item) => item.id === record.universityId);
  if (!university) throw new Error(`Unknown university in official campus sources: ${record.universityId}`);
  const recordIndex = officialRecordIndexes.get(record.universityId) ?? 0;
  officialRecordIndexes.set(record.universityId, recordIndex + 1);
  const geocodeKey = `${record.universityId}:${record.name}`;
  const geocode = record.kind === "library" ? null : officialGeocodes.results[geocodeKey]?.find((result) => result.category === "amenity" || result.category === "building");
  const wikidataId = logoCatalog.logos[record.universityId]?.wikidataId;
  const wikidataCoordinate = wikidataId ? wikidataEntities.entities[wikidataId]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value : null;
  let latitude = geocode ? Number(geocode.lat) : null;
  let longitude = geocode ? Number(geocode.lon) : null;
  let coordinateSource = geocode ? {
    type: "openstreetmap",
    label: "OpenStreetMap adres eşleşmesi",
    url: `https://www.openstreetmap.org/${geocode.osm_type}/${geocode.osm_id}`,
  } : null;
  if (record.kind !== "library" && latitude === null && recordIndex === 0 && wikidataCoordinate && regionCompatible(university, { latitude: wikidataCoordinate.latitude, longitude: wikidataCoordinate.longitude })) {
    latitude = Number(wikidataCoordinate.latitude.toFixed(6));
    longitude = Number(wikidataCoordinate.longitude.toFixed(6));
    coordinateSource = {
      type: "wikidata",
      label: "Wikidata koordinatı",
      url: `https://www.wikidata.org/wiki/${wikidataId}`,
    };
  }
  places.push({
    id: `catalog:${record.universityId}:official-${slug(record.name)}`,
    universityId: record.universityId,
    name: record.name,
    category: record.kind === "library" ? "library" : "building",
    description: record.description ?? (record.kind === "administrative"
      ? `${university.name} resmî kaynağında yayımlanan idarî birim adresi; öğrenci kampüsü olarak işaretlenmemiştir.`
      : `${university.name} resmî kaynağında yayımlanan yerleşke adresi.`),
    address: record.address,
    latitude,
    longitude,
    accessibility: [],
    openingHours: "",
    distanceMeters: record.kind === "library" ? null : 0,
    campusName: record.campusName ?? record.name,
    source: {
      type: "official-university",
      label: "Resmî üniversite kaynağı",
      url: record.sourceUrl,
      checkedAt: record.checkedAt ?? CHECKED_AT,
      coordinateSource,
    },
  });
  const coverageItem = coverage.find((item) => item.universityId === record.universityId);
  coverageItem.places += 1;
}

const cyprusUniversityIds = new Set(cyprusPlaces.coverage.map((item) => item.universityId));
const retained = places.filter((place) => !cyprusUniversityIds.has(place.universityId) || place.source.type !== "openstreetmap");
places.splice(0, places.length, ...retained, ...cyprusPlaces.places);
places.push(...turkeyAreas.places);
const coveredUniversities = new Set(places.map((place) => place.universityId)).size;
const openStreetMapPlaceCount = places.filter((place) => place.source.type === "openstreetmap").length;
const officialPlaceCount = places.filter((place) => place.source.type === "official-university").length;
const coordinateKnownCount = places.filter((place) => place.latitude !== null && place.longitude !== null).length;
const payload = {
  meta: {
    version: "2026.5",
    updatedAt: places.reduce((latest, place) => place.source.checkedAt > latest ? place.source.checkedAt : latest, CHECKED_AT),
    universityCount: universities.length,
    coveredUniversityCount: coveredUniversities,
    placeCount: places.length,
    openStreetMapPlaceCount,
    officialPlaceCount,
    coordinateKnownCount,
    radiusMeters: NEARBY_RADIUS_METERS,
    areaRadiusMeters: cyprusPlaces.areaRadiusMeters,
    cyprusNearbyUniversityCount: cyprusPlaces.coverage.filter((item) => item.nearbyPlaces > 0).length,
    cyprusAreaCount: cyprusPlaces.places.filter((item) => item.category === "area").length,
    turkeyAreaUniversityCount: turkeyAreas.coverage.filter((item) => item.nearbyAreas > 0).length,
    turkeyAreaCount: turkeyAreas.places.length,
    turkeyAreaSnapshotAt: turkeyAreas.snapshotAt,
    methodology: "OpenStreetMap university/campus records were matched by official domain, Wikidata ID, exact name, or high-confidence name similarity. Nearby named places are within 1.5 km, with balanced categories. Cyprus uses reviewed campus coordinates and geographic boundary checks, up to 100 records per university; neighbourhood and settlement centres are within 5 km. Turkey neighbourhood and settlement nodes are within 5 km of sourced campus/reference coordinates, up to five per campus. Distances are straight-line to the source point, not routes or area boundaries. Unknown campus coordinates remain unknown.",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL 1.0",
    licenseUrl: "https://www.openstreetmap.org/copyright",
  },
  places,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(`${OUTPUT_PATH}.tmp`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await rename(`${OUTPUT_PATH}.tmp`, OUTPUT_PATH);
const selectedAnchors = universities.flatMap((university) => matchesByUniversity.get(university.id).map((match) => ({
  universityId: university.id,
  osm: `${match.element.type}/${match.element.id}`,
  name: match.element.tags?.name ?? university.name,
  latitude: match.coordinates.latitude,
  longitude: match.coordinates.longitude,
  score: match.score,
  reason: match.reason,
})));
await writeFile(REPORT_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), coverage, selectedAnchors, anchorDecisions }, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: OUTPUT_PATH,
  universities: universities.length,
  coveredUniversities,
  uncoveredUniversities: universities.length - coveredUniversities,
  places: places.length,
  matchedAnchors: [...matchesByUniversity.values()].reduce((total, items) => total + items.length, 0),
  officialSourceRecords: officialSources.records.length + librarySources.records.length,
}, null, 2));
