import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const REPORT_PATH = path.join(CACHE_DIR, "campus-place-match-report.json");
const OUTPUT_PATH = path.join(CACHE_DIR, "osm-places.json");
const ENDPOINTS = process.env.OVERPASS_ENDPOINT
  ? [process.env.OVERPASS_ENDPOINT]
  : ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
const BATCH_SIZE = 10;
const NEARBY_RADIUS_METERS = 1_500;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function queryFor(anchors) {
  const ids = { node: [], way: [], relation: [] };
  for (const anchor of anchors) {
    const [type, id] = anchor.osm.split("/");
    ids[type].push(id);
  }
  const selectors = Object.entries(ids).filter(([, values]) => values.length).map(([type, values]) => `${type}(id:${values.join(",")});`).join("\n  ");
  const nearbySelectors = anchors.flatMap((anchor) => {
    const around = `around:${NEARBY_RADIUS_METERS},${anchor.latitude},${anchor.longitude}`;
    return [
      `nwr(${around})["name"]["amenity"~"^(college|research_institute|library|coworking_space|internet_cafe|cafe|restaurant|fast_food|food_court|ice_cream|community_centre|cinema|theatre|arts_centre|events_venue|music_venue|bar|pub|nightclub|hospital|clinic|pharmacy|doctors|dentist|bus_station|ferry_terminal|taxi|bicycle_rental|bank|atm|post_office|parcel_locker|police|toilets)$"];`,
      `nwr(${around})["name"]["building"~"^(university|college)$"];`,
      `nwr(${around})["name"]["office"~"^(educational_institution|research)$"];`,
      `nwr(${around})["name"]["leisure"~"^(sports_centre|fitness_centre|stadium|sports_hall|pitch|swimming_pool|fitness_station|track|ice_rink|park|garden)$"];`,
      `nwr(${around})["name"]["tourism"~"^(museum|gallery|attraction)$"];`,
      `nwr(${around})["name"]["public_transport"~"^(station|stop_position|platform)$"];`,
      `nwr(${around})["name"]["highway"="bus_stop"];`,
      `nwr(${around})["name"]["railway"~"^(station|halt|tram_stop|subway_entrance)$"];`,
      `nwr(${around})["name"]["shop"~"^(supermarket|convenience|books|copyshop|stationery|mall|department_store|laundry|computer)$"];`,
    ];
  }).join("\n  ");
  return `[out:json][timeout:240];
(
  ${selectors}
  ${nearbySelectors}
);
out center tags;`;
}

async function fetchBatch(query, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const endpoint = ENDPOINTS[(attempt - 1) % ENDPOINTS.length];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "kampira-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (response.ok) return response.json();
      const message = `Overpass ${response.status}: ${(await response.text()).slice(0, 500)}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) throw new Error(message);
      const waitMilliseconds = attempt * 20_000;
      console.log(`Overpass ${response.status} at ${new URL(endpoint).hostname}; waiting ${waitMilliseconds / 1000}s before retry ${attempt + 1}/${maxAttempts}...`);
      await sleep(waitMilliseconds);
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const waitMilliseconds = attempt * 20_000;
      console.log(`Overpass connection error at ${new URL(endpoint).hostname}; waiting ${waitMilliseconds / 1000}s before retry ${attempt + 1}/${maxAttempts}...`);
      await sleep(waitMilliseconds);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Overpass batch failed after retries.");
}

async function fetchWithFallback(anchors) {
  try {
    return await fetchBatch(queryFor(anchors), 2);
  } catch (error) {
    if (anchors.length === 1) throw error;
    console.log(`Batch remained too dense; retrying ${anchors.length} anchors one by one...`);
    const elements = new Map();
    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      try {
        const payload = await fetchBatch(queryFor([anchor]));
        for (const element of payload.elements) elements.set(`${element.type}/${element.id}`, element);
        console.log(`  Anchor ${index + 1}/${anchors.length}: ${payload.elements.length} records`);
      } catch (error) {
        console.warn(`  Anchor ${anchor.osm} skipped after retries: ${error.message}`);
      }
      if (index < anchors.length - 1) await sleep(10_000);
    }
    return { elements: [...elements.values()] };
  }
}

const refresh = process.argv.includes("--refresh");
await mkdir(CACHE_DIR, { recursive: true });
const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
const unique = [...new Map(report.selectedAnchors.map((anchor) => [anchor.osm, anchor])).values()];
const batches = [];
for (let index = 0; index < unique.length; index += BATCH_SIZE) batches.push(unique.slice(index, index + BATCH_SIZE));

const elements = new Map();
for (let index = 0; index < batches.length; index += 1) {
  const cachePath = path.join(CACHE_DIR, `osm-nearby-${String(index + 1).padStart(2, "0")}-of-${String(batches.length).padStart(2, "0")}.json`);
  let payload;
  if (!refresh) {
    try {
      payload = JSON.parse(await readFile(cachePath, "utf8"));
      console.log(`Batch ${index + 1}/${batches.length}: cache (${payload.elements.length} records)`);
    } catch {
      payload = undefined;
    }
  }
  if (!payload) {
    console.log(`Batch ${index + 1}/${batches.length}: fetching ${batches[index].length} campus anchors...`);
    payload = await fetchWithFallback(batches[index]);
    await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
    console.log(`Batch ${index + 1}/${batches.length}: received ${payload.elements.length} records`);
    if (index < batches.length - 1) await sleep(15_000);
  }
  for (const element of payload.elements) elements.set(`${element.type}/${element.id}`, element);
}

const base = JSON.parse(await readFile(path.join(CACHE_DIR, "osm-anchors.json"), "utf8"));
for (const element of base.elements) elements.set(`${element.type}/${element.id}`, element);
const payload = {
  version: base.version,
  generator: `${base.generator ?? "Overpass API"}; merged nearby batches`,
  osm3s: base.osm3s,
  elements: [...elements.values()],
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
console.log(JSON.stringify({ anchors: unique.length, batches: batches.length, elements: elements.size, output: OUTPUT_PATH }, null, 2));
