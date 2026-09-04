import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const OUTPUT_PATH = path.join(CACHE_DIR, "wikidata-university-entities.json");
const logoCatalog = JSON.parse(await readFile(path.join(ROOT, "data", "university-logos-2026.json"), "utf8"));
const ids = [...new Set(Object.values(logoCatalog.logos).map((record) => record.wikidataId).filter(Boolean))];
const refresh = process.argv.includes("--refresh");

await mkdir(CACHE_DIR, { recursive: true });
let payload;
if (!refresh) {
  try {
    payload = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
    console.log(`Using cache: ${OUTPUT_PATH}`);
  } catch {
    payload = undefined;
  }
}

if (!payload) {
  payload = { entities: {} };
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      props: "labels|claims",
      languages: "tr|en",
      format: "json",
      origin: "*",
    });
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Api-User-Agent": "kampira-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
        "User-Agent": "kampira-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
      },
    });
    if (!response.ok) throw new Error(`Wikidata ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const batchPayload = await response.json();
    Object.assign(payload.entities, batchPayload.entities);
    if (index + 50 < ids.length) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
}

const coordinates = Object.values(payload.entities).flatMap((entity) => {
  const value = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return value ? [{ id: entity.id, label: entity.labels?.tr?.value ?? entity.labels?.en?.value ?? "", latitude: value.latitude, longitude: value.longitude }] : [];
});
console.log(JSON.stringify({ requested: ids.length, received: Object.keys(payload.entities).length, coordinateCount: coordinates.length, coordinates }, null, 2));
