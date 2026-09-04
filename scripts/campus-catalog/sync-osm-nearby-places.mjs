import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const REPORT_PATH = path.join(CACHE_DIR, "campus-place-match-report.json");
const OUTPUT_PATH = path.join(CACHE_DIR, "osm-places.json");
const ENDPOINT = process.env.OVERPASS_ENDPOINT ?? "https://overpass-api.de/api/interpreter";
const BATCH_SIZE = 80;

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
  return `[out:json][timeout:240];
(
  ${selectors}
)->.campuses;
(
  .campuses;
  nwr(around.campuses:1500)["name"]["amenity"~"^(library|cafe|restaurant|fast_food|food_court|community_centre|cinema|theatre|arts_centre|hospital|clinic|pharmacy|doctors|bus_station)$"];
  nwr(around.campuses:1500)["name"]["leisure"~"^(sports_centre|fitness_centre|stadium|park)$"];
  nwr(around.campuses:1500)["name"]["public_transport"~"^(station|stop_position|platform)$"];
  nwr(around.campuses:1500)["name"]["highway"="bus_stop"];
  nwr(around.campuses:1500)["name"]["railway"~"^(station|halt|tram_stop|subway_entrance)$"];
  nwr(around.campuses:1500)["name"]["shop"~"^(supermarket|convenience|books|copyshop|stationery)$"];
);
out center tags;`;
}

async function fetchBatch(query) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "uniyra-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (response.ok) return response.json();
      const message = `Overpass ${response.status}: ${(await response.text()).slice(0, 500)}`;
      if (response.status !== 429 || attempt === 3) throw new Error(message);
      const waitMilliseconds = attempt * 30_000;
      console.log(`Rate limit received; waiting ${waitMilliseconds / 1000}s before retry ${attempt + 1}/3...`);
      await sleep(waitMilliseconds);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Overpass batch failed after retries.");
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
    payload = await fetchBatch(queryFor(batches[index]));
    await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
    console.log(`Batch ${index + 1}/${batches.length}: received ${payload.elements.length} records`);
    if (index < batches.length - 1) await sleep(10_000);
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
