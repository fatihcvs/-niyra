import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { categoryFor } from "../scripts/campus-catalog/classify-campus-place.mjs";

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

test("library services stay visible when their buildings also carry university tags", () => {
  assert.equal(categoryFor({ tags: { amenity: "library", building: "university" } }), "library");
  assert.equal(categoryFor({ tags: { amenity: "library", office: "educational_institution" } }), "library");
  assert.equal(categoryFor({ tags: { building: "library" } }), "library");
  assert.equal(categoryFor({ tags: { amenity: "library" } }, true), "library");
  assert.equal(categoryFor({ tags: { building: "university" } }), "building");
  assert.equal(categoryFor({ tags: { shop: "books" } }), "study");
  assert.equal(categoryFor({ tags: { name: "Kütüphane durağı", highway: "bus_stop" } }), "transport");
  assert.equal(categoryFor({ tags: { place: "neighbourhood", name: "Arabahmet" } }), "area");
  assert.equal(categoryFor({ tags: { place: "suburb", name: "Strovolos" } }), "area");
});

test("OMU libraries are available through the actual campus filters without invented coordinates", async () => {
  const data = await catalog();
  const source = (await readFile(new URL("../lib/campus-place-catalog.ts", import.meta.url), "utf8"))
    .replace(/^import campusPlaceCatalog from .*?;\r?\n/, `const campusPlaceCatalog = ${JSON.stringify(data)};\n`);
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { getCuratedCampusPlaces } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
  const libraries = getCuratedCampusPlaces("omu", { category: "library" });
  assert.equal(libraries.length, 14);
  assert.ok(libraries.some((p) => p.name === "OMÜ Merkez Kütüphanesi"));
  for (const place of libraries) {
    assert.equal(new URL(place.source.url).hostname, "kutuphane.omu.edu.tr");
    assert.equal(place.curated, true);
    assert.equal(place.coordinatesKnown, false);
    assert.equal(place.distanceMeters, null);
    assert.equal(place.source.coordinateSource, null);
  }
  assert.equal(getCuratedCampusPlaces("omu", { category: "library", query: "terme" }).length, 1);
  assert.equal(getCuratedCampusPlaces("omu", { category: "library", query: "olmayan-birim" }).length, 0);
  assert.ok(getCuratedCampusPlaces("omu", { category: "building" }).every((p) => !libraries.some((library) => library.id === p.id)));
  assert.deepEqual(getCuratedCampusPlaces("unknown", { category: "library" }), []);
  const gaziLibraries = data.places.filter((p) => p.source.osmElement === "way/418123565");
  assert.ok(gaziLibraries.length > 0);
  assert.ok(gaziLibraries.every((p) => p.category === "library"), "Previously misclassified Gazi library must be regenerated correctly");
});

test("campus catalog gives every supported university at least one sourced record", async () => {
  const [allUniversities, data] = await Promise.all([universities(), catalog()]);
  const knownIds = new Set(allUniversities.map((university) => university.id));
  const coveredIds = new Set(data.places.map((place) => place.universityId));

  assert.equal(data.meta.updatedAt, "2026-09-05");
  assert.equal(data.meta.version, "2026.5");
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
  const categories = new Set(["area", "building", "library", "food", "study", "sports", "social", "transport", "health", "other"]);
  const accessibility = new Set(["step-free", "elevator", "accessible-toilet", "quiet", "power", "wifi"]);

  assert.equal(new Set(data.places.map((place) => place.id)).size, data.places.length);
  assert.equal(data.meta.openStreetMapPlaceCount, data.places.filter((p) => p.source.type === "openstreetmap").length);
  assert.equal(data.meta.officialPlaceCount, 62);
  assert.equal(data.meta.coordinateKnownCount, data.places.filter((p) => p.latitude !== null).length);
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
    if (place.distanceMeters === null) assert.equal(place.latitude, null, place.id);
    else assert.ok(place.distanceMeters >= 0 && place.distanceMeters <= (place.category === "area" ? data.meta.areaRadiusMeters : data.meta.radiusMeters), place.id);
    assert.ok(place.accessibility.every((item) => accessibility.has(item)), place.id);
    assert.match(place.source.url, /^https:\/\//, place.id);
    assert.match(place.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(place.source.checkedAt <= data.meta.updatedAt, place.id);
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

  assert.ok(osmUniversityCount >= 215);
  assert.equal(officialUniversityCount, 27);
  assert.ok([...placesPerUniversity.values()].filter((count) => count >= 40).length >= 150);
  for (const category of ["building", "library", "food", "study", "social", "sports", "health", "transport", "other"]) {
    assert.ok(counts[category] >= 200, `${category}:${counts[category] ?? 0}`);
    assert.ok(cyprusCategories.has(category), `Cyprus:${category}`);
  }
});

test("Cyprus regions retain real campus anchors and unknown positions stay unknown", async () => {
  const read = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), "utf8"));
  const [supplement, campuses, data] = await Promise.all([read("cyprus-campus-places-2026.json"), read("cyprus-campuses-2026.json"), catalog()]);
  assert.equal(supplement.places.filter((p) => p.category === "area").length, 209);
  assert.equal(supplement.places.filter((p) => p.universityId === "kktc-bahcesehir-kibris-universitesi" && p.category === "area" && p.name === "Kumsal").length, 1);
  assert.equal(supplement.coverage.filter((u) => u.nearbyPlaces > 0).length, 33);
  const knownIds = new Set(data.places.map((place) => place.id));
  const rad = (n) => n * Math.PI / 180;
  for (const place of supplement.places) {
    assert.ok(knownIds.has(place.id));
    const anchors = campuses.campuses.filter((c) => c.universityId === place.universityId && c.name === place.campusName && c.latitude !== null);
    assert.ok(anchors.length > 0, place.id);
    const distances = anchors.map((c) => 6371000 * 2 * Math.asin(Math.sqrt(Math.sin(rad(place.latitude - c.latitude) / 2) ** 2 + Math.cos(rad(c.latitude)) * Math.cos(rad(place.latitude)) * Math.sin(rad(place.longitude - c.longitude) / 2) ** 2)));
    assert.ok(distances.some((d) => Math.abs(place.distanceMeters - d) <= 1), place.id);
  }
  const alasia = campuses.campuses.find((c) => c.universityId === "kktc-uluslararasi-alasya-universitesi");
  assert.equal(alasia.latitude, null, "A broken university map pointing to Bangladesh must not become a Cyprus campus");
  assert.equal(supplement.places.filter((p) => p.universityId === alasia.universityId).length, 0);
  const philips = campuses.campuses.find((c) => c.universityId === "cy-philips-university");
  assert.equal(philips.latitude, 35.1563321);
  assert.equal(philips.longitude, 33.3655517, "Use the map marker, not the viewport centre");
});
