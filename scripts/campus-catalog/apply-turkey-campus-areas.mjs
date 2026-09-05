// Refresh Turkey areas while preserving previously reviewed places and libraries.
import { readFile, writeFile, rename } from "node:fs/promises";
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const [catalog, expansion] = await Promise.all([read("data/campus-places-2026.json"), read("data/turkey-campus-areas-2026.json")]);
const ids = new Set(expansion.coverage.map((u) => u.universityId));
catalog.places = [...catalog.places.filter((p) => !ids.has(p.universityId) || p.category !== "area"), ...expansion.places];
if (new Set(catalog.places.map((p) => p.id)).size !== catalog.places.length) throw new Error("Duplicate campus place ID");
Object.assign(catalog.meta, {
  version: "2026.5", updatedAt: expansion.checkedAt,
  placeCount: catalog.places.length,
  openStreetMapPlaceCount: catalog.places.filter((p) => p.source.type === "openstreetmap").length,
  officialPlaceCount: catalog.places.filter((p) => p.source.type === "official-university").length,
  coordinateKnownCount: catalog.places.filter((p) => p.latitude !== null && p.longitude !== null).length,
  coveredUniversityCount: new Set(catalog.places.map((p) => p.universityId)).size,
  turkeyAreaUniversityCount: expansion.coverage.filter((u) => u.nearbyAreas > 0).length,
  turkeyAreaCount: expansion.places.length, turkeyAreaSnapshotAt: expansion.snapshotAt,
});
const method = " Turkey neighbourhood and settlement nodes are within 5 km of sourced campus/reference coordinates, up to five per campus.";
if (!catalog.meta.methodology.includes(method.trim())) catalog.meta.methodology += method;
const file = "data/campus-places-2026.json";
await writeFile(`${file}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`);
await rename(`${file}.tmp`, file);
console.log(JSON.stringify({ places: catalog.meta.placeCount, turkeyAreas: expansion.places.length }));
