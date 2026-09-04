import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function catalogModule() {
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
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("university catalog covers Turkey and all Cyprus regions with stable unique ids", async () => {
  const { universities, universityCatalogSources, universityCatalogUpdatedAt } = await catalogModule();
  const counts = universities.reduce((result, university) => {
    result[university.region] = (result[university.region] ?? 0) + 1;
    return result;
  }, {});

  assert.equal(universityCatalogUpdatedAt, "2026-09-04");
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
    assert.ok(university.logoPath === null || university.logoPath.startsWith("/university-logos/"), university.id);
    assert.ok(university.city.length >= 2, university.id);
    assert.match(university.id, /^(omu|tr-|kktc-|cy-)/);
  }
});

test("verified logo catalog covers every institution except the explicit initials fallback", async () => {
  const [{ universities }, logoCatalog] = await Promise.all([
    catalogModule(),
    readFile(new URL("../data/university-logos-2026.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const catalogIds = new Set(universities.map((university) => university.id));
  const logoEntries = Object.entries(logoCatalog.logos);
  const fallbackIds = universities.filter((university) => !logoCatalog.logos[university.id]).map((university) => university.id);

  assert.equal(logoCatalog.meta.universityCount, 241);
  assert.equal(logoCatalog.meta.logoCount, 240);
  assert.equal(logoCatalog.meta.fallbackCount, 1);
  assert.deepEqual(fallbackIds, ["kktc-uluslararasi-alasya-universitesi"]);

  for (const [universityId, record] of logoEntries) {
    assert.ok(catalogIds.has(universityId), universityId);
    assert.match(record.assetPath, /^\/university-logos\/[a-z0-9-]+\.webp$/);
    assert.match(record.sourceUrl, /^https?:\/\//);
    await access(new URL(`../public${record.assetPath}`, import.meta.url));
  }
});
