import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function catalogModule() {
  const source = await readFile(new URL("../lib/university-catalog.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("university catalog covers Turkey and all Cyprus regions with stable unique ids", async () => {
  const { universities, universityCatalogSources, universityCatalogUpdatedAt } = await catalogModule();
  const counts = universities.reduce((result, university) => {
    result[university.region] = (result[university.region] ?? 0) + 1;
    return result;
  }, {});

  assert.equal(universityCatalogUpdatedAt, "2026-09-03");
  assert.equal(universities.length, 241);
  assert.deepEqual(counts, { Türkiye: 204, "Kuzey Kıbrıs": 23, "Kıbrıs Cumhuriyeti": 14 });
  assert.equal(new Set(universities.map((university) => university.id)).size, universities.length);
  assert.equal(new Set(universities.map((university) => `${university.region}:${university.name}`)).size, universities.length);
  assert.equal(universityCatalogSources.length, 4);

  for (const expected of [
    ["omu", "Ondokuz Mayıs Üniversitesi"],
    ["kktc-dogu-akdeniz-universitesi", "Doğu Akdeniz Üniversitesi"],
    ["cy-university-of-cyprus", "University of Cyprus"],
  ]) {
    const university = universities.find((entry) => entry.id === expected[0]);
    assert.equal(university?.name, expected[1]);
  }
});

test("every university has searchable display metadata", async () => {
  const { universities } = await catalogModule();
  for (const university of universities) {
    assert.ok(university.name.length >= 3, university.id);
    assert.ok(university.shortName.length >= 2, university.id);
    assert.ok(university.city.length >= 2, university.id);
    assert.match(university.id, /^(omu|tr-|kktc-|cy-)/);
  }
});
