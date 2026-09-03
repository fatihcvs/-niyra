import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(await readFile(new URL("../data/academic-catalog-2026.json", import.meta.url), "utf8"));

test("official academic catalog has verified coverage and referential integrity", () => {
  assert.equal(catalog.meta.updatedAt, "2026-09-04");
  assert.deepEqual(catalog.meta.stats, {
    universityCount: 241,
    coveredUniversityCount: 239,
    unitCount: 3212,
    programCount: 16454,
    curriculumLinkCount: 943,
    catalogOnlyUniversityCount: 2,
  });
  assert.equal(Object.keys(catalog.universities).length, 241);
  assert.equal(catalog.meta.sources.length, 19);

  for (const [universityId, university] of Object.entries(catalog.universities)) {
    const unitIds = new Set(university.units.map((unit) => unit.id));
    assert.equal(unitIds.size, university.units.length, `${universityId}: duplicate unit id`);
    assert.equal(new Set(university.programs.map((program) => program.id)).size, university.programs.length, `${universityId}: duplicate program id`);
    assert.ok(university.units.every((unit) => unit.name === unit.name.normalize("NFC")), `${universityId}: non-normalized unit name`);
    for (const program of university.programs) {
      assert.ok(unitIds.has(program.unitId), `${universityId}: orphan ${program.id}`);
      assert.ok(program.name.length >= 2, `${universityId}: unnamed ${program.id}`);
      assert.ok(catalog.meta.sources.some((source) => source.id === program.sourceId), `${universityId}: unknown source ${program.sourceId}`);
    }
  }
});

test("institution-published catalogs cover the six former registry-only institutions", () => {
  const expected = {
    "tr-milli-savunma-universitesi": [15, 47],
    "kktc-altinbas-kibris-universitesi": [8, 23],
    "kktc-ankara-sosyal-bilimler-universitesi": [1, 13],
    "kktc-avrupa-liderlik-universitesi": [7, 13],
    "kktc-onbes-kasim-kibris-universitesi": [10, 27],
    "cy-national-and-kapodistrian-university-of-athens-cyprus-branch": [4, 8],
  };

  for (const [universityId, [unitCount, programCount]] of Object.entries(expected)) {
    const university = catalog.universities[universityId];
    assert.equal(university.coverage, "official-programs", universityId);
    assert.equal(university.units.length, unitCount, `${universityId}: unit count`);
    assert.equal(university.programs.length, programCount, `${universityId}: program count`);
  }

  assert.ok(catalog.universities["tr-milli-savunma-universitesi"].programs.some((item) => item.name === "Havacılık ve Uzay Mühendisliği"));
  assert.ok(catalog.universities["kktc-ankara-sosyal-bilimler-universitesi"].programs.some((item) => item.name === "Yapay Zekâ Operatörlüğü"));
  assert.ok(catalog.universities["kktc-onbes-kasim-kibris-universitesi"].programs.some((item) => item.name === "Bilgisayar Mühendisliği"));
  assert.ok(catalog.universities["cy-national-and-kapodistrian-university-of-athens-cyprus-branch"].programs.some((item) => item.name === "Medicine"));

  const catalogOnly = Object.entries(catalog.universities)
    .filter(([, university]) => university.coverage === "catalog-only")
    .map(([universityId]) => universityId)
    .sort();
  assert.deepEqual(catalogOnly, ["cy-cosmos-open-university", "kktc-uluslararasi-alasya-universitesi"]);
});

test("academic catalog API returns only the selected university", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("academic-catalog-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const runtime = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };

  const response = await worker.fetch(new Request("http://localhost/api/academic-catalog?universityId=omu"), runtime, context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /stale-while-revalidate/);
  const payload = await response.json();
  assert.equal(payload.university.id, "omu");
  assert.equal(payload.coverage, "official-programs");
  assert.ok(payload.units.length >= 25);
  assert.ok(payload.programs.length >= 150);
  assert.ok(payload.programs.every((program) => payload.units.some((unit) => unit.id === program.unitId)));

  const invalid = await worker.fetch(new Request("http://localhost/api/academic-catalog?universityId=unknown"), runtime, context);
  assert.equal(invalid.status, 400);
});
