import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, ".sites-runtime", "campus-catalog");
const ENDPOINT = process.env.OVERPASS_ENDPOINT ?? "https://overpass-api.de/api/interpreter";
const BOUNDS = "34.0,25.0,43.0,45.0";
const NEARBY_RADIUS_METERS = 1_500;

const queries = {
  anchors: `[out:json][timeout:180];
(
  nwr["amenity"="university"]["name"](${BOUNDS});
  nwr["landuse"="education"]["name"~"ünivers|universit|campus|kampüs",i](${BOUNDS});
);
out center tags;`,
  places: `[out:json][timeout:300];
(
  nwr["amenity"="university"]["name"](${BOUNDS});
  nwr["landuse"="education"]["name"~"ünivers|universit|campus|kampüs",i](${BOUNDS});
)->.campuses;
(
  .campuses;
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["amenity"~"^(college|research_institute|library|coworking_space|internet_cafe|cafe|restaurant|fast_food|food_court|ice_cream|community_centre|cinema|theatre|arts_centre|events_venue|music_venue|bar|pub|nightclub|hospital|clinic|pharmacy|doctors|dentist|bus_station|ferry_terminal|taxi|bicycle_rental|bank|atm|post_office|parcel_locker|police|toilets)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["building"~"^(university|college|library)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["office"~"^(educational_institution|research)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["leisure"~"^(sports_centre|fitness_centre|stadium|sports_hall|pitch|swimming_pool|fitness_station|track|ice_rink|park|garden)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["tourism"~"^(museum|gallery|attraction)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["public_transport"~"^(station|stop_position|platform)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["highway"="bus_stop"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["railway"~"^(station|halt|tram_stop|subway_entrance)$"];
  nwr(around.campuses:${NEARBY_RADIUS_METERS})["name"]["shop"~"^(supermarket|convenience|books|copyshop|stationery|mall|department_store|laundry|computer)$"];
);
out center tags;`,
};

function usage() {
  console.log("Usage: node scripts/campus-catalog/sync-osm-campus-places.mjs <anchors|places> [--refresh]");
}

async function fetchOverpass(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "kampira-campus-research/1.0 (https://github.com/fatihcvs/-niyra)",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Overpass ${response.status}: ${body.slice(0, 500)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const mode = process.argv[2];
if (!(mode in queries)) {
  usage();
  process.exitCode = 1;
} else {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `osm-${mode}.json`);
  const refresh = process.argv.includes("--refresh");
  let payload;

  if (!refresh) {
    try {
      payload = JSON.parse(await readFile(cachePath, "utf8"));
      console.log(`Using cached ${mode} response: ${cachePath}`);
    } catch {
      payload = undefined;
    }
  }

  if (!payload) {
    console.log(`Fetching ${mode} data from ${ENDPOINT} (one request, no parallelism)...`);
    payload = await fetchOverpass(queries[mode]);
    await writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
    console.log(`Cached response: ${cachePath}`);
  }

  const typeCounts = payload.elements.reduce((counts, element) => {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({ mode, count: payload.elements.length, typeCounts }, null, 2));
}
