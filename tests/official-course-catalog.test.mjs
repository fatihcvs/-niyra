import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [courseCatalog, academicCatalog, pageSource, standard] = await Promise.all([
  readFile(new URL("../data/official-course-catalog-2026.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../data/academic-catalog-2026.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../docs/OFFICIAL_COURSE_CATALOG_STANDARD.md", import.meta.url), "utf8"),
]);

test("structured course coverage points to a matching official programme", () => {
  const programmes = Object.values(courseCatalog.programs);
  assert.ok(programmes.length > 0);
  for (const programme of programmes) {
    const official = academicCatalog.universities[programme.universityId]?.programs.find((item) => item.id === programme.programId);
    assert.ok(official, `${programme.universityId}:${programme.programId} is not in the official academic catalog`);
    assert.equal(programme.programName, official.name);
    assert.equal(new URL(programme.sourceUrl).protocol, "https:");
    assert.match(programme.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("every structured course keeps usable and internally unique curriculum metadata", () => {
  for (const programme of Object.values(courseCatalog.programs)) {
    assert.ok(programme.courses.length >= 3);
    const keys = new Set();
    for (const course of programme.courses) {
      assert.ok(course.code.trim().length >= 2);
      assert.ok(course.name.trim().length >= 2);
      assert.ok(Number.isInteger(course.semester) && course.semester >= 1 && course.semester <= 12);
      assert.ok(["required", "elective"].includes(course.kind));
      const key = course.code.trim().toLocaleUpperCase("tr-TR");
      assert.ok(!keys.has(key), `${programme.programId}: duplicate ${key}`);
      keys.add(key);
    }
  }
});

test("course onboarding exposes selection, search, period filtering and manual fallback", () => {
  assert.match(pageSource, /DOĞRULANMIŞ DERS KATALOĞU/);
  assert.match(pageSource, /aria-label="Resmî derslerde ara"/);
  assert.match(pageSource, /Tüm dönemler/);
  assert.match(pageSource, /Dersim listede yok, elle ekle/);
});

test("university expansion standard requires programme-level course research", () => {
  assert.match(standard, /ders kodu, adı, dönemi ve türünü/i);
  assert.match(standard, /manuel ekleme her zaman kullanılabilir/i);
  assert.match(standard, /tahmin edilmez/i);
});
