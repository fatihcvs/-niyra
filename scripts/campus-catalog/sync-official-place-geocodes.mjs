import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const OUTPUT_PATH = path.join(CACHE_DIR, "nominatim-official-places.json");
const input = JSON.parse(await readFile(path.join(ROOT, "data", "campus-place-official-sources-2026.json"), "utf8"));
const refresh = process.argv.includes("--refresh");
const retryUnmatched = process.argv.includes("--retry-unmatched");

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await mkdir(CACHE_DIR, { recursive: true });
let cache = { updatedAt: null, results: {} };
if (!refresh) {
  try {
    cache = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    // Start with an empty cache.
  }
}

for (let index = 0; index < input.records.length; index += 1) {
  const record = input.records[index];
  const key = `${record.universityId}:${record.name}`;
  if (Object.hasOwn(cache.results, key) && (!retryUnmatched || cache.results[key].length > 0)) continue;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  const query = retryUnmatched ? record.name : record.address;
  url.search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", namedetails: "1", limit: "3" });
  console.log(`${index + 1}/${input.records.length}: ${record.name} (${retryUnmatched ? "name" : "address"})`);
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "uniyra-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
      "Referer": "https://github.com/fatihcvs/-niyra",
    },
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}: ${(await response.text()).slice(0, 500)}`);
  cache.results[key] = await response.json();
  cache.updatedAt = new Date().toISOString();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(cache)}\n`, "utf8");
  if (index < input.records.length - 1) await sleep(1_100);
}

const matches = Object.values(cache.results).filter((results) => results.length > 0).length;
console.log(JSON.stringify({ records: input.records.length, geocoded: matches, unmatched: input.records.length - matches, output: OUTPUT_PATH }, null, 2));
