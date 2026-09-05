import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
const [areas, housing, catalog, academic] = await Promise.all([read("turkey-campus-areas-2026.json"), read("housing-catalog-2026.json"), read("campus-places-2026.json"), read("academic-catalog-2026.json")]);
function distance(a, b) {
  const rad = (x) => x * Math.PI / 180;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.sin(rad(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2));
}
test("Turkey neighbourhoods use the selected university's sourced campus and stay within five kilometres", () => {
  assert.equal(areas.coverage.length, 204);
  const campuses = new Map(housing.campuses.map((c) => [c.id, c]));
  const published = new Map(catalog.places.map((p) => [p.id, p]));
  const perCampus = new Map();
  for (const p of areas.places) {
    const campus = campuses.get(p.campusId);
    assert.ok(campus);
    assert.equal(campus.universityId, p.universityId);
    assert.equal(academic.universities[p.universityId].region, "Türkiye");
    assert.equal(p.category, "area");
    assert.ok(distance(campus, p) <= 5000);
    assert.equal(Math.round(distance(campus, p)), p.distanceMeters);
    assert.equal(p.campusSourceUrl, campus.sourceUrl);
    assert.match(p.source.url, /^https:\/\/www\.openstreetmap\.org\/node\/\d+$/);
    assert.deepEqual(published.get(p.id), p);
    perCampus.set(p.campusId, (perCampus.get(p.campusId) ?? 0) + 1);
  }
  assert.ok([...perCampus.values()].every((count) => count <= 5));
  for (const u of areas.coverage) assert.equal(u.nearbyAreas, areas.places.filter((p) => p.universityId === u.universityId).length);
  assert.equal(catalog.meta.turkeyAreaCount, areas.places.length);
  assert.equal(catalog.meta.placeCount, catalog.places.length);
  assert.equal(new Set(catalog.places.map((p) => p.id)).size, catalog.places.length);
});
