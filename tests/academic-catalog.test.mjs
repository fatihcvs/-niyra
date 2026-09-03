import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(await readFile(new URL("../data/academic-catalog-2026.json", import.meta.url), "utf8"));

test("official academic catalog has verified coverage and referential integrity", () => {
  assert.equal(catalog.meta.updatedAt, "2026-09-04");
  assert.deepEqual(catalog.meta.stats, {
    universityCount: 241,
    coveredUniversityCount: 233,
    unitCount: 3167,
    programCount: 16323,
    curriculumLinkCount: 943,
    catalogOnlyUniversityCount: 8,
  });
  assert.equal(Object.keys(catalog.universities).length, 241);
  assert.equal(catalog.meta.sources.length, 10);

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
