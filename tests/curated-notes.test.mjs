import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function curatedModule() {
  const source = await readFile(new URL("../lib/curated-notes.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("curated library contains a large sourced collection without fabricated metrics", async () => {
  const { curatedNotes, curatedSources } = await curatedModule();

  assert.equal(curatedNotes.length, 78);
  assert.ok(Object.keys(curatedSources).length >= 40);
  assert.equal(new Set(curatedNotes.map((note) => note.id)).size, curatedNotes.length);

  for (const note of curatedNotes) {
    assert.equal(note.verifiedOn, "2026-09-03", note.id);
    assert.ok(note.courseCodes.length >= 1, note.id);
    assert.ok(note.summary.length >= 60, note.id);
    assert.equal(note.takeaways.length, 3, note.id);
    assert.equal(note.checklist.length, 3, note.id);
    assert.ok(note.tags.length >= 3, note.id);
    assert.ok(note.sourceKeys.length >= 1, note.id);
    assert.doesNotMatch(`${note.title} ${note.summary}`, /görüntülenme|\bsayfa\b/i, note.id);
    for (const sourceKey of note.sourceKeys) assert.ok(curatedSources[sourceKey], `${note.id}:${sourceKey}`);
  }
});

test("every source is secure and every product course code has editorial coverage", async () => {
  const { curatedNotes, curatedSources } = await curatedModule();
  for (const [key, source] of Object.entries(curatedSources)) {
    assert.match(source.url, /^https:\/\//, key);
    assert.ok(source.name.length >= 5, key);
    assert.ok(source.publisher.length >= 3, key);
  }

  const coveredCodes = new Set(curatedNotes.flatMap((note) => note.courseCodes));
  const productCourseCodes = [
    "BİL 101", "MAT 101", "FİZ 101", "BİL 203", "EEM 101", "EEM 203", "MAK 101", "MAK 203",
    "İKT 101", "İKT 201", "İKT 202", "İŞL 101", "MUH 101", "PAZ 201", "SBKY 101", "HUK 101",
    "SBKY 201", "UTL 101", "UTL 201", "PDR 101", "PSK 101", "EĞT 101", "PDR 201", "SNO 101",
    "TÜR 101", "İMA 101", "İMA 201", "EDB 101", "TÜR 201", "TIP 101", "TIP 102", "TIP 103",
    "TIP 201", "MED 101", "ANA 101", "ROM 101",
  ];
  assert.deepEqual(productCourseCodes.filter((code) => !coveredCodes.has(code)), []);
});

test("featured notes span distinct subject areas", async () => {
  const { featuredCuratedNotes } = await curatedModule();
  assert.ok(featuredCuratedNotes.length >= 8);
  assert.ok(new Set(featuredCuratedNotes.map((note) => note.category)).size >= 7);
});
