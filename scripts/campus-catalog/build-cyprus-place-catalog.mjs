import { readFile, writeFile, rename } from "node:fs/promises";
import { categoryFor } from "./classify-campus-place.mjs";

const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const [campusSource, osm, provenance, boundary] = await Promise.all([
  read("data/cyprus-campuses-2026.json"),
  read(".sites-runtime/cyprus-expansion/cyprus-places.json"),
  read(".sites-runtime/cyprus-expansion/cyprus-places-source.json"),
  read(".sites-runtime/housing/north-cyprus-geometry.json"),
]);
const relation = boundary.elements.find((element) => element.type === "relation" && element.id === 2514541);
if (!relation) throw new Error("The reviewed North Cyprus boundary is missing");
const lines = relation.members.filter((member) => member.type === "way" && member.role === "outer")
  .map((member) => member.geometry.map((point) => [point.lon, point.lat]));
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const rings = [];
while (lines.length) {
  const ring = lines.pop();
  while (!same(ring[0], ring.at(-1))) {
    const index = lines.findIndex((line) => same(line[0], ring.at(-1)) || same(line.at(-1), ring.at(-1)));
    if (index < 0) throw new Error("The geographic boundary is not closed");
    const line = lines.splice(index, 1)[0];
    if (!same(line[0], ring.at(-1))) line.reverse();
    ring.push(...line.slice(1));
  }
  rings.push(ring);
}
function northern(point) {
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > point.latitude) !== (yj > point.latitude)
        && point.longitude < (xj - xi) * (point.latitude - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}
function distance(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const deltaLat = rad(b.latitude - a.latitude), deltaLon = rad(b.longitude - a.longitude);
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.sin(deltaLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(deltaLon / 2) ** 2));
}
const elements = osm.elements.flatMap((element) => {
  const category = categoryFor(element);
  const name = element.tags?.["name:tr"] || element.tags?.["name:en"] || element.tags?.name;
  const latitude = element.lat ?? element.center?.lat, longitude = element.lon ?? element.center?.lon;
  if (!category || !name || name.trim().length < 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const point = { ...element, category, latitude, longitude };
  return [{ ...point, northern: northern(point) }];
});
const universities = [...new Set(campusSource.campuses.map((campus) => campus.universityId))];
const records = [], coverage = [];
for (const universityId of universities) {
  const campuses = campusSource.campuses.filter((c) => c.universityId === universityId && c.latitude !== null);
  const candidates = [];
  for (const element of elements) {
    const anchors = campuses.filter((campus) => (campus.region === "Kuzey Kıbrıs") === element.northern);
    const nearest = anchors.map((campus) => ({ campus, meters: distance(campus, element) }))
      .sort((a, b) => a.meters - b.meters)[0];
    if (!nearest || nearest.meters > (element.category === "area" ? 5000 : 1500)) continue;
    candidates.push({ ...element, ...nearest });
  }
  // Keep multiple campuses and scarce services represented, not just city cafes.
  const groups = new Map();
  const selectedAreas = [];
  for (const item of candidates.sort((a, b) => a.meters - b.meters)) {
    if (item.category === "area") {
      const label = (item.tags["name:tr"] || item.tags["name:en"] || item.tags.name).trim().toLocaleLowerCase("tr-TR");
      // OSM can describe the same neighbourhood with a node and a polygon.
      // Keep distinct distant namesakes, but do not show nearby duplicates.
      if (selectedAreas.some((area) => area.label === label && distance(area, item) < 1000)) continue;
      selectedAreas.push({ ...item, label });
    }
    const key = `${item.campus.id}:${item.category}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const selected = [];
  for (let index = 0; selected.length < 100; index++) {
    let found = false;
    for (const group of groups.values()) {
      if (selected.length >= 100) break;
      const item = group[index];
      if (!item || (item.category === "area" && index >= 5)) continue;
      selected.push(item); found = true;
    }
    if (!found) break;
  }
  for (const item of selected) {
    const tags = item.tags ?? {};
    const name = tags["name:tr"] || tags["name:en"] || tags.name;
    const osmElement = `${item.type}/${item.id}`;
    records.push({
      id: `catalog:${universityId}:${item.type}-${item.id}`, universityId, name,
      category: item.category,
      description: item.category === "area"
        ? "Kampüs çevresindeki yerleşim veya mahalle. Mesafe, haritadaki bölge merkezine kuş uçuşudur."
        : "Kampüs çevresinde açık haritada kayıtlı yer. Mesafe kuş uçuşudur.",
      address: tags["addr:full"] || [...new Set([
        [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
        tags["addr:suburb"], tags["addr:city"], tags["addr:postcode"],
      ].filter(Boolean))].join(", "),
      latitude: item.latitude, longitude: item.longitude,
      accessibility: [tags.wheelchair === "yes" ? "step-free" : null,
        tags.internet_access === "wlan" ? "wifi" : null].filter(Boolean),
      openingHours: tags.opening_hours || "", distanceMeters: Math.round(item.meters),
      campusName: item.campus.name,
      source: { type: "openstreetmap", label: "OpenStreetMap", url: `https://www.openstreetmap.org/${osmElement}`,
        osmElement, checkedAt: provenance.fetchedAt.slice(0, 10) },
    });
  }
  coverage.push({ universityId, locatedCampuses: campuses.length, nearbyPlaces: selected.length,
    nearbyAreas: selected.filter((item) => item.category === "area").length });
}
const payload = { checkedAt: provenance.fetchedAt.slice(0, 10), snapshotAt: provenance.snapshot,
  radiusMeters: 1500, areaRadiusMeters: 5000, coverage, places: records };
const file = "data/cyprus-campus-places-2026.json";
await writeFile(`${file}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
await rename(`${file}.tmp`, file);
console.log(JSON.stringify({ places: records.length, areas: records.filter((p) => p.category === "area").length,
  universities: coverage.filter((c) => c.nearbyPlaces > 0).length }));
