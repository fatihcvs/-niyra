import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function universities() {
  const [source, logoCatalog] = await Promise.all([
    readFile(new URL("../lib/university-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../data/university-logos-2026.json", import.meta.url), "utf8"),
  ]);
  const testableSource = source.replace(
    /^import universityLogoCatalog from "\.\.\/data\/university-logos-2026\.json" with \{ type: "json" \};\r?\n/,
    `const universityLogoCatalog = ${logoCatalog};\n`,
  );
  const output = ts.transpileModule(testableSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)).universities;
}

async function catalog() {
  return JSON.parse(await readFile(new URL("../data/campus-places-2026.json", import.meta.url), "utf8"));
}

test("campus catalog gives every supported university at least one sourced record", async () => {
  const [allUniversities, data] = await Promise.all([universities(), catalog()]);
  const knownIds = new Set(allUniversities.map((university) => university.id));
  const coveredIds = new Set(data.places.map((place) => place.universityId));

  assert.equal(data.meta.updatedAt, "2026-09-04");
  assert.equal(data.meta.version, "2026.2");
  assert.equal(data.meta.universityCount, 241);
  assert.equal(data.meta.coveredUniversityCount, 241);
  assert.equal(data.meta.radiusMeters, 1_500);
  assert.equal(data.meta.placeCount, data.places.length);
  assert.equal(coveredIds.size, knownIds.size);
  assert.deepEqual([...knownIds].filter((id) => !coveredIds.has(id)), []);
  assert.deepEqual([...coveredIds].filter((id) => !knownIds.has(id)), []);
});

test("campus records keep coordinates, provenance, and inferred fields honest", async () => {
  const data = await catalog();
  const categories = new Set(["building", "library", "food", "study", "sports", "social", "transport", "health", "other"]);
  const accessibility = new Set(["step-free", "elevator", "accessible-toilet", "quiet", "power", "wifi"]);

  assert.equal(new Set(data.places.map((place) => place.id)).size, data.places.length);
  assert.equal(data.meta.openStreetMapPlaceCount, 7141);
  assert.equal(data.meta.officialPlaceCount, 48);
  assert.equal(data.meta.coordinateKnownCount, 7147);
  assert.equal(data.meta.license, "ODbL 1.0");

  for (const place of data.places) {
    assert.match(place.id, /^catalog:/, place.id);
    assert.ok(place.name.length >= 2, place.id);
    assert.ok(categories.has(place.category), place.id);
    assert.equal(place.latitude === null, place.longitude === null, place.id);
    if (place.latitude !== null) {
      assert.ok(place.latitude >= -90 && place.latitude <= 90, place.id);
      assert.ok(place.longitude >= -180 && place.longitude <= 180, place.id);
    }
    assert.ok(place.distanceMeters >= 0 && place.distanceMeters <= data.meta.radiusMeters, place.id);
    assert.ok(place.accessibility.every((item) => accessibility.has(item)), place.id);
    assert.match(place.source.url, /^https:\/\//, place.id);
    assert.equal(place.source.checkedAt, data.meta.updatedAt, place.id);
    assert.ok(["openstreetmap", "official-university"].includes(place.source.type), place.id);
    if (place.source.type === "official-university") {
      assert.ok(place.address.length >= 5, place.id);
      assert.deepEqual(place.accessibility, [], place.id);
      assert.equal(place.openingHours, "", place.id);
    }
  }
});

test("the selected nearby set is useful across core campus categories", async () => {
  const [allUniversities, data] = await Promise.all([universities(), catalog()]);
  const counts = data.places.reduce((result, place) => {
    result[place.category] = (result[place.category] ?? 0) + 1;
    return result;
  }, {});
  const regionByUniversity = new Map(allUniversities.map((university) => [university.id, university.region]));
  const cyprusCategories = new Set(data.places
    .filter((place) => regionByUniversity.get(place.universityId) !== "Türkiye")
    .map((place) => place.category));
  const placesPerUniversity = data.places.reduce((result, place) => {
    result.set(place.universityId, (result.get(place.universityId) ?? 0) + 1);
    return result;
  }, new Map());
  const osmUniversityCount = new Set(data.places.filter((place) => place.source.type === "openstreetmap").map((place) => place.universityId)).size;
  const officialUniversityCount = new Set(data.places.filter((place) => place.source.type === "official-university").map((place) => place.universityId)).size;

  assert.equal(osmUniversityCount, 215);
  assert.equal(officialUniversityCount, 26);
  assert.ok([...placesPerUniversity.values()].filter((count) => count >= 40).length >= 150);
  for (const category of ["building", "library", "food", "study", "social", "sports", "health", "transport", "other"]) {
    assert.ok(counts[category] >= 200, `${category}:${counts[category] ?? 0}`);
    assert.ok(cyprusCategories.has(category), `Cyprus:${category}`);
  }
});
