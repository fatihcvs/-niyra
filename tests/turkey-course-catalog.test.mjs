import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const data = (file) => readFile(new URL(`../data/${file}`, import.meta.url), "utf8").then(JSON.parse);
const [academic, legacy, index, coverage] = await Promise.all([
  data("academic-catalog-2026.json"), data("official-course-catalog-2026.json"),
  data("course-catalog-index-2026.json"), data("turkey-catalog-coverage-2026.json"),
]);
const files = await readdir(new URL("../data/course-catalog/", import.meta.url));
const shards = Object.fromEntries(await Promise.all(files.map(async (file) => [file.slice(0, -5), await data(`course-catalog/${file}`)])));
const expanded = Object.assign({}, ...Object.values(shards));

test("every university shard matches its programme index and preserves course provenance", () => {
  assert.deepEqual(Object.keys(expanded).sort(), Object.keys(index.programs).sort());
  for (const [uid, programs] of Object.entries(shards)) {
    assert.equal(academic.universities[uid].region, "Türkiye");
    for (const [key, record] of Object.entries(programs)) {
      assert.equal(key, `${uid}:${record.programId}`);
      assert.equal(record.universityId, uid);
      assert.equal(legacy.programs[key], undefined, "original source records must be preserved");
      const p = academic.universities[uid].programs.find((p) => p.id === record.programId);
      assert.equal(record.programName, p.name);
      assert.equal(index.programs[key].courseCount, record.courses.length);
      assert.ok(p.curriculumUrls.includes(record.sourceUrl));
      assert.equal(new URL(record.sourceUrl).protocol, "https:");
      assert.match(record.sourceHash, /^[a-f0-9]{64}$/);
      assert.equal(record.coverage, "partial");
      const codes = new Set();
      for (const c of record.courses) {
        assert.ok(c.name.length >= 2 && c.name.length <= 200, `${key}: ${c.name}`);
        assert.ok(c.code.length >= 2 && c.code.length <= 20);
        assert.ok([null, "required", "elective"].includes(c.kind));
        assert.ok(c.semester === null || Number.isInteger(c.semester) && c.semester >= 1 && c.semester <= 12);
        if (c.year !== undefined) assert.ok(Number.isInteger(c.year) && c.year >= 1 && c.year <= 6);
        if (c.offeredSemesters) {
          assert.equal(c.semester, null);
          assert.ok(c.offeredSemesters.length > 1);
          assert.deepEqual(c.offeredSemesters, [...new Set(c.offeredSemesters)].sort((a,b) => a-b));
        }
        assert.ok(!codes.has(c.code.toLocaleUpperCase("tr-TR")), `${key}: duplicate ${c.code}`);
        codes.add(c.code.toLocaleUpperCase("tr-TR"));
      }
    }
  }
});

test("Turkey coverage includes every institution and explicitly accounts for missing curricula", () => {
  const universities = Object.entries(academic.universities).filter(([, u]) => u.region === "Türkiye");
  assert.deepEqual(coverage.universities.map((u) => u.universityId).sort(), universities.map(([uid]) => uid).sort());
  const combined = { ...legacy.programs, ...expanded };
  for (const u of coverage.universities) {
    const programs = academic.universities[u.universityId].programs;
    const known = programs.filter((p) => combined[`${u.universityId}:${p.id}`]);
    assert.equal(u.programCount, programs.length);
    assert.equal(u.structuredProgramCount, known.length);
    assert.equal(u.courseCount, known.reduce((n, p) => n + combined[`${u.universityId}:${p.id}`].courses.length, 0));
    assert.deepEqual(u.missingProgramIds.sort(), programs.filter((p) => !combined[`${u.universityId}:${p.id}`]).map((p) => p.id).sort());
  }
  assert.equal(index.meta.stats.programCount, Object.keys(combined).length);
  assert.equal(index.meta.stats.courseCount, Object.values(combined).reduce((n, p) => n + p.courses.length, 0));
});

test("Istanbul Aydin publishes every current programme with its exact EBS identity", async () => {
  const uid = "tr-istanbul-aydin-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");
  assert.equal(programmes.length, 137);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 5322);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, { structuredProgramCount: 137, courseCount: 5322, missingProgramIds: [] });
  assert.deepEqual(sources[uid].catalogs.map((value) => value.url), [
    "https://ebs.aydin.edu.tr/tr/index.iau?Page=AB&Type=L",
    "https://ebs.aydin.edu.tr/tr/index.iau?Page=AB&Type=OL",
  ]);
  const distance = shards[uid][`${uid}:program-osym-202452648`];
  assert.equal(distance.sourceSelection.bk, "112");
  assert.equal(distance.sourceSelection.registryAlias, true);
  assert.ok(distance.courses.some((course) => course.code === "BUE131" && course.semester === 1));
  const annual = shards[uid][`${uid}:program-osym-202411245`];
  assert.equal(annual.sourceSelection.bk, "183");
  assert.ok(annual.courses.some((course) => course.code === "DHF105" && course.year === 1 && course.semester === null));
});

test("Turkish Aeronautical Association University publishes every current programme from one official default plan", async () => {
  const uid = "tr-turk-hava-kurumu-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");
  assert.equal(programmes.length, 26);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 3333);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, { structuredProgramCount: 26, courseCount: 3333, missingProgramIds: [] });
  assert.deepEqual(sources[uid].catalogs.map((value) => value.url), [
    "https://sis.thk.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr",
    "https://sis.thk.edu.tr/oibs/bologna/unitSelection.aspx?type=myo&lang=tr",
  ]);
  const maintenance = shards[uid][`${uid}:program-osym-205750275`];
  assert.equal(maintenance.sourceSelection.curSunit, "6487");
  assert.equal(maintenance.sourceSelection.registryAlias, true);
  assert.equal(maintenance.curriculumPeriod, "2025 (Uçak Bakım ve Onarım (TR) (2025))");
});

test("Yasar University completes its current programmes with explicit official language evidence", async () => {
  const uid = "tr-yasar-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 38);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 10091);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, { structuredProgramCount: 38, courseCount: 10091, missingProgramIds: [] });
  const engineering = shards[uid][`${uid}:program-osym-206010318`];
  assert.equal(engineering.sourceSelection.language, "İngilizce");
  assert.match(engineering.sourceSelection.languageEvidenceUrl, /progAbout\.aspx\?curSunit=71&lang=tr$/);
  assert.match(engineering.sourceSelection.languageEvidenceHash, /^[a-f0-9]{64}$/);
  const law = shards[uid][`${uid}:program-osym-206010487`];
  assert.equal(law.sourceSelection.language, "%30 İngilizce");
  assert.equal(law.sourceSelection.curSunit, "401116");
});

test("Istanbul Rumeli adds only the four newly published current programme plans", () => {
  const uid = "tr-istanbul-rumeli-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 44);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 4288);
  assert.equal(universityCoverage.structuredProgramCount, 44);
  assert.equal(universityCoverage.courseCount, 4288);
  assert.equal(universityCoverage.missingProgramIds.length, 63);
  const computer = shards[uid][`${uid}:program-osym-208151225`];
  assert.equal(computer.sourceSelection.curSunit, "1057");
  assert.match(computer.curriculumPeriod, /^2026 \(Bilgisayar Mühendisliği 2026-2027 Müfredatı\)$/);
});

test("the built API loads the requested university shard and keeps other programme IDs isolated", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const chosen = ["tr-izmir-yuksek-teknoloji-enstitusu", "tr-kocaeli-universitesi", "tr-ordu-universitesi", "tr-recep-tayyip-erdogan-universitesi", "tr-isparta-uygulamali-bilimler-universitesi", "tr-karadeniz-teknik-universitesi", "tr-izmir-katip-celebi-universitesi", "tr-izmir-ekonomi-universitesi", "tr-istanbul-medipol-universitesi", "tr-cankiri-karatekin-universitesi", "tr-istanbul-bilgi-universitesi", "tr-afyonkarahisar-saglik-bilimleri-universitesi", "tr-atilim-universitesi", "tr-bahcesehir-universitesi", "tr-yalova-universitesi", "tr-istanbul-beykent-universitesi", "tr-istanbul-kultur-universitesi", "tr-ankara-medipol-universitesi", "tr-munzur-universitesi", "tr-abdullah-gul-universitesi", "tr-istanbul-sabahattin-zaim-universitesi", "tr-altinbas-universitesi", "tr-kastamonu-universitesi"].concat(["tr-kocaeli-saglik-ve-teknoloji-universitesi", "tr-istanbul-29-mayis-universitesi", "tr-istanbul-nisantasi-universitesi", "tr-gaziantep-islam-bilim-ve-teknoloji-universitesi", "tr-piri-reis-universitesi", "tr-cag-universitesi", "tr-cankaya-universitesi", "tr-ardahan-universitesi", "tr-tarsus-universitesi", "tr-isik-universitesi", "tr-ozyegin-universitesi", "tr-istanbul-aydin-universitesi", "tr-turk-hava-kurumu-universitesi", "tr-yasar-universitesi", "tr-istanbul-rumeli-universitesi"]).map((uid) => Object.values(shards[uid])[0]);
  for (const record of chosen) {
    const url = `http://localhost/api/course-catalog?universityId=${record.universityId}&programId=${record.programId}`;
    const response = await worker.fetch(new Request(url), env, context);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.available, true);
    assert.equal(body.coverage, "partial");
    assert.deepEqual(body.courses, record.courses);
    assert.equal(body.sourceUrl, record.sourceUrl);
    assert.equal(body.curriculumPeriod, record.curriculumPeriod);
    const otherUniversity = chosen.find((candidate) => candidate.universityId !== record.universityId).universityId;
    assert.equal((await worker.fetch(new Request(url.replace(record.universityId, otherUniversity)), env, context)).status, 400);
  }
});

test("coverage API lists all Turkey institutions and separates missing courses from official catalogue access", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const get = (path) => worker.fetch(new Request(`http://localhost${path}`), env, context);
  const response = await get("/api/course-catalog/coverage");
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.universities.length, 204);
  assert.ok(list.universities.every((u) => u.structuredProgramCount + u.missingProgramCount === u.programCount));
  assert.equal((await get("/api/course-catalog/coverage?universityId=invalid")).status, 404);
  const sources = await data("turkey-catalog-sources-2026.json");
  for (const uid of Object.keys(sources)) {
    for (const source of sources[uid].catalogs) {
      assert.equal(new URL(source.url).protocol, "https:");
      assert.match(source.sourceHash, /^[a-f0-9]{64}$/);
      assert.doesNotMatch(source.url, /rb-challenge|captcha|signin/i);
    }
  }
  const university = coverage.universities.find((u) => u.missingProgramIds.length && sources[u.universityId].catalogs.length);
  const uid = university.universityId;
  const detail = await (await get(`/api/course-catalog/coverage?universityId=${uid}`)).json();
  assert.deepEqual(detail.missingPrograms.map((p) => p.id).sort(), [...university.missingProgramIds].sort());
  assert.ok(detail.missingPrograms.every((p) => p.name && p.unit));
  const unavailable = await (await get(`/api/course-catalog?universityId=${uid}&programId=${university.missingProgramIds[0]}`)).json();
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.courses, []);
  assert.ok(unavailable.catalogs.length > 0);
  assert.equal(unavailable.catalogs[0].url, sources[uid].catalogs[0].url);
});
