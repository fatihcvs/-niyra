import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/course-catalog-display.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { courseMatchesYear, courseScheduleLabel } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

test("unknown course metadata stays visible without inventing an elective or period", () => {
  const course = { semester: null, kind: null };
  assert.equal(courseScheduleLabel(course), "Dönemi belirtilmemiş · Türü belirtilmemiş");
  for (let year = 1; year <= 6; year++) assert.equal(courseMatchesYear(course, year), true);
  assert.equal(courseMatchesYear(course, 1, { includeUnspecified: false }), false);
});

test("published academic year wins over a summer semester number", () => {
  const summer = { semester: 7, year: 3, kind: "required" };
  assert.equal(courseMatchesYear(summer, 3), true);
  assert.equal(courseMatchesYear(summer, 4), false);
  assert.equal(courseMatchesYear({ semester: 9, kind: null }, 5), true);
  assert.equal(courseMatchesYear({ semester: 12, kind: null }, 6), true);
});

test("an elective offered in multiple years can be found in either year", () => {
  const elective = { semester: null, offeredSemesters: [6, 7], kind: "elective" };
  assert.equal(courseMatchesYear(elective, 3), true);
  assert.equal(courseMatchesYear(elective, 4), true);
  assert.equal(courseMatchesYear(elective, 2), false);
  assert.equal(courseScheduleLabel(elective), "6, 7. dönem · Seçmeli");
});

test("an unavailable course catalog cannot remain stale for a day after new courses are published", async () => {
  const routeSource = await readFile(new URL("../app/api/course-catalog/route.ts", import.meta.url), "utf8");
  const routeCode = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let currentProgram = null;
  const modules = {
    "../../../lib/academic-data": { getUniversityById: () => ({ id: "test", name: "Test üniversitesi" }) },
    "../../../lib/academic-catalog": { getOfficialAcademicProgram: () => ({ id: "program", name: "Test programı" }) },
    "../../../lib/official-course-catalog": { getOfficialCourseProgram: async () => currentProgram, officialCourseCatalogMeta: { version: "test", limitations: [] } },
    "../../../lib/course-catalog-sources": { getCourseCatalogSources: () => [] },
  };
  const context = { exports: {}, URL, Response, require: (name) => { assert.ok(name in modules); return modules[name]; } };
  runInNewContext(routeCode, context);
  const request = new Request("https://kampira.net/api/course-catalog?universityId=test&programId=program");
  const unavailable = await context.exports.GET(request);
  assert.equal(unavailable.headers.get("cache-control"), "public, max-age=60, must-revalidate");
  assert.equal((await unavailable.json()).available, false);
  currentProgram = { courses: [{ code: "NEW101", name: "Yeni yayımlanan ders", semester: null, kind: null }] };
  const refreshed = await context.exports.GET(request);
  assert.equal((await refreshed.json()).courses[0].code, "NEW101");
});

test("Cyprus coverage reports actual matched courses and leaves gaps explicit", async () => {
  const read = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), "utf8"));
  const [coverage, catalog, academic] = await Promise.all([read("cyprus-catalog-coverage-2026.json"), read("official-course-catalog-2026.json"), read("academic-catalog-2026.json")]);
  assert.equal(coverage.universities.length, 37);
  for (const university of coverage.universities) {
    assert.equal(university.programCount, academic.universities[university.universityId].programs.length);
    assert.equal(university.structuredProgramCount, university.programs.filter((p) => p.courseCount > 0).length);
    for (const program of university.programs) {
      const record = catalog.programs[`${university.universityId}:${program.programId}`];
      assert.equal(program.courseCount, record?.courses.length ?? 0);
      if (record) {
        assert.equal(record.coverage, "partial");
        assert.match(record.sourceHash, /^[a-f0-9]{64}$/);
        assert.ok(academic.universities[university.universityId].programs.find((p) => p.id === program.programId).curriculumUrls.includes(record.sourceUrl));
      } else assert.ok(["source-linked", "source-needed"].includes(program.status));
    }
  }
});

test("the deployed course API includes later years and rejects a cross-university programme", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const runtime = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const url = "http://localhost/api/course-catalog?universityId=kktc-bahcesehir-kibris-universitesi&programId=program-osym-301710070";
  const response = await worker.fetch(new Request(url), runtime, context);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.coverage, "partial");
  assert.equal(payload.available, true);
  assert.ok(payload.courses.some((course) => course.code === "CMP3005" && course.semester === 5 && course.name === "Analysis of Algorithms"));
  assert.equal(payload.courses.find((course) => course.code === "CMP1001").kind, null);
  const wrongUniversity = url.replace("kktc-bahcesehir-kibris-universitesi", "omu");
  assert.equal((await worker.fetch(new Request(wrongUniversity), runtime, context)).status, 400);
});
