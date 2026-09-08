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

test("Iskenderun Technical replaces backup plans and publishes all matched current programmes", () => {
  const uid = "tr-iskenderun-teknik-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 55);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 9231);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 55,
    courseCount: 9231,
    missingProgramIds: ["program-osym-110710052"],
  });
  const programming = shards[uid][`${uid}:program-osym-110750157`];
  assert.equal(programming.sourceSelection.curSunit, "1776");
  assert.equal(programming.sourceSelection.planId, "10086");
  assert.match(programming.curriculumPeriod, /^2026 \(2026 Bilgisayar Proğramcılığı Müfredatı\)$/);
  const engineering = shards[uid][`${uid}:program-osym-110710034`];
  assert.ok(engineering.courses.some((course) => course.code === "AİİT2-1101" && course.semester === 1));
  assert.ok(programmes.every((programme) => programme.courses.every((course) => !/SEÇMELİ-\d$/i.test(course.code))));
});

test("Halic University publishes the exact MYO unit-name aliases and leaves one real gap", () => {
  const uid = "tr-halic-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 81);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 7679);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 81,
    courseCount: 7679,
    missingProgramIds: ["program-osym-201991182"],
  });
  const anaesthesia = shards[uid][`${uid}:program-osym-201990601`];
  assert.equal(anaesthesia.sourceSelection.curSunit, "1011");
  assert.equal(anaesthesia.sourceSelection.planId, "2722");
  assert.equal(anaesthesia.sourceSelection.registryAlias, true);
  assert.equal(anaesthesia.sourceSelection.sourceUnit, "Meslek Yüksek Okulu");
  assert.equal(anaesthesia.sourceSelection.registryUnit, "Meslek Yüksekokulu");
  assert.match(anaesthesia.curriculumPeriod, /^2026 \(2026 ANESTEZİ\)$/);
});

test("Istanbul University-Cerrahpasa completes all current programmes from exact print-service identities", () => {
  const uid = "tr-istanbul-universitesi-cerrahpasa";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 92);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 5129);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, { structuredProgramCount: 92, courseCount: 5129, missingProgramIds: [] });
  assert.ok(programmes.every((programme) =>
    new Set(programme.courses.map((course) => course.code)).size === programme.courses.length));

  const german = shards[uid][`${uid}:program-osym-111610397`];
  assert.equal(german.courses.length, 106);
  assert.equal(german.sourceSelection.instructionLanguage, "Almanca");
  assert.match(german.sourceSelection.instructionLanguageEvidenceUrl, /\/home\/program\?id=/);
  assert.ok(german.courses.some((course) => course.code === "MBSE00A1"));
  assert.match(german.dataSourceUrl, /GetPrintMufredatDersListesi$/);
  assert.equal(german.sourceRequest.request.birimID, "1085");

  const oralHealth = shards[uid][`${uid}:program-osym-111650078`];
  assert.equal(oralHealth.sourceSelection.academicYear, 2026);
  assert.equal(oralHealth.sourceSelection.model, "3+1");
  assert.equal(oralHealth.courses.length, 9);

  const veterinary = shards[uid][`${uid}:program-osym-111610864`];
  assert.equal(veterinary.curriculumPeriod, "2025");
  assert.equal(veterinary.courses.length, 173);
  assert.deepEqual(veterinary.sourceSelection.excludedConflictingCourseCodes, ["ODAI0001"]);
  assert.equal(veterinary.sourceSelection.newerEmptyPlan.academicYear, 2026);
  assert.match(veterinary.sourceSelection.newerEmptyPlan.sourceHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(veterinary.courses.map((course) => course.code).join(" "), /\bODAI0001\b/);
});

test("Bayburt completes every current programme from explicitly selected official plans", () => {
  const uid = "tr-bayburt-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 66);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 3450);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, { structuredProgramCount: 66, courseCount: 3450, missingProgramIds: [] });

  const theology = shards[uid][`${uid}:program-osym-101890062`];
  assert.equal(theology.courses.length, 130);
  assert.equal(theology.sourceSelection.registryAlias, true);
  assert.equal(theology.sourceSelection.sourceTitle, "İlahiyat");
  assert.deepEqual(theology.sourceSelection.semesters, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(theology.curriculumPeriod, "2023-Formasyon Müfredatı İlahiyat");

  const office = shards[uid][`${uid}:program-osym-101850097`];
  assert.equal(office.courses.length, 74);
  assert.equal(office.sourceSelection.registryAlias, true);
  assert.match(office.curriculumPeriod, /Bologna 3 \(2024\)$/);
  const food = shards[uid][`${uid}:program-osym-101850194`];
  assert.equal(food.courses.length, 19);
  assert.ok(food.courses.every((course) => !/Seçmeli Ders(?:ler)? Grubu/i.test(course.name)));
});

test("Ondokuz Mayis publishes exact active UBYS curricula and keeps two genuine gaps explicit", () => {
  const uid = "omu";
  const combined = { ...legacy.programs, ...expanded };
  const programmes = Object.values(combined).filter((programme) => programme.universityId === uid);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 166);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 32077);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
    missingReasons: universityCoverage.missingReasons,
  }, {
    structuredProgramCount: 166,
    courseCount: 32077,
    missingProgramIds: ["program-osym-108250973", "program-osym-108290495"],
    missingReasons: {
      "program-osym-108290495": "no-readable-curriculum",
      "program-osym-108250973": "no-readable-curriculum",
    },
  });

  const theology = shards[uid][`${uid}:program-osym-108210302`];
  const mtok = shards[uid][`${uid}:program-osym-108290343`];
  assert.equal(theology.courses.length, 372);
  assert.deepEqual(mtok.courses, theology.courses);
  assert.equal(mtok.sourceSelection.registryAlias, true);
  assert.equal(mtok.sourceSelection.aliasType, "osym-placement-variant");
  assert.equal(mtok.sourceSelection.baseProgramId, "program-osym-108210302");
  assert.equal(mtok.sourceSelection.qualifier, "M.T.O.K.");

  const pharmacy = shards[uid][`${uid}:program-osym-108290446`];
  assert.equal(pharmacy.courses.length, 353);
  assert.equal(pharmacy.sourceSelection.curriculumId, 6207);
  assert.match(pharmacy.sourceSelection.sourceUnit, /Dekanlığı$/);
  assert.match(pharmacy.sourceUrl, /^https:\/\/ubys\.omu\.edu\.tr\//);

  const remote = shards[uid][`${uid}:program-osym-108251247`];
  assert.equal(remote.programName, "Bilgisayar Programcılığı (Uzaktan Öğretim)");
  assert.equal(remote.sourceSelection.sourceTitle, "Bilgisayar Programcılığı (UE)");
  assert.equal(remote.courses.length, 66);
});

test("Marmara selects the first official current MEOBS plan and keeps unavailable programmes explicit", () => {
  const uid = "tr-marmara-universitesi";
  const combined = { ...legacy.programs, ...expanded };
  const programmes = Object.values(combined).filter((programme) => programme.universityId === uid);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 116);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 14341);
  assert.equal(universityCoverage.structuredProgramCount, 116);
  assert.equal(universityCoverage.courseCount, 14341);
  assert.equal(universityCoverage.missingProgramIds.length, 26);
  assert.ok(Object.values(universityCoverage.missingReasons)
    .every((reason) => reason === "no-readable-curriculum"));
  assert.ok(universityCoverage.missingProgramIds.includes("program-osym-107290337"));
  assert.ok(universityCoverage.missingProgramIds.includes("program-osym-107200479"));

  const banking = shards[uid][`${uid}:program-osym-107250376`];
  assert.equal(banking.courses.length, 46);
  assert.match(banking.curriculumPeriod, /^Müfredat 2025/);
  assert.equal(banking.sourceSelection.method, "first-official-current-plan");
  assert.equal(banking.sourceSelection.selectedLabel, banking.curriculumPeriod);
  assert.equal(banking.sourceSelection.sourceUnit, "Sosyal Bilimler Meslek Yüksekokulu");

  const medicine = shards[uid][`${uid}:program-osym-107210695`];
  assert.equal(medicine.courses.length, 439);
  assert.match(medicine.sourceUrl, /^https:\/\/meobs\.marmara\.edu\.tr\/ProgramTanitim\//);
  assert.match(medicine.dataSourceUrl, /^https:\/\/meobs\.marmara\.edu\.tr\/Mufredat\/DersListesi\?/);

  const base = shards[uid][`${uid}:program-osym-107290207`];
  const mtok = shards[uid][`${uid}:program-osym-107290206`];
  assert.deepEqual(mtok.courses, base.courses);
  assert.equal(mtok.courses.length, 110);
  assert.equal(mtok.sourceSelection.registryAlias, true);
  assert.equal(mtok.sourceSelection.aliasType, "osym-placement-variant");
  assert.equal(mtok.sourceSelection.baseProgramId, "program-osym-107290207");
  assert.equal(mtok.sourceSelection.qualifier, "M.T.O.K.");
});

test("Ankara completes readable current Bologna plans and keeps exact unmatched programmes explicit", () => {
  const uid = "tr-ankara-universitesi";
  const combined = { ...legacy.programs, ...expanded };
  const programmes = Object.values(combined).filter((programme) => programme.universityId === uid);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  assert.equal(programmes.length, 202);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 63362);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
    missingReasons: universityCoverage.missingReasons,
  }, {
    structuredProgramCount: 202,
    courseCount: 63362,
    missingProgramIds: [
      "program-osym-101100640",
      "program-osym-101100654",
      "program-osym-101150986",
    ].sort(),
    missingReasons: {
      "program-osym-101100640": "programme-source-not-matched",
      "program-osym-101100654": "programme-source-not-matched",
      "program-osym-101150986": "programme-source-not-matched",
    },
  });

  const web = shards[uid][`${uid}:program-osym-101190612`];
  assert.equal(web.courses.length, 29);
  assert.equal(web.curriculumPeriod, "2026 - 2027");
  assert.equal(web.sourceSelection.teachingMode, "Açıköğretim");
  assert.equal(web.sourceSelection.method, "latest-readable-current-bologna-year");

  const remote = shards[uid][`${uid}:program-osym-101150677`];
  assert.equal(remote.courses.length, 39);
  assert.equal(remote.curriculumPeriod, "2025 - 2026");
  assert.equal(remote.sourceSelection.attempts[0].courseCodeCount, 0);
  assert.equal(remote.sourceSelection.teachingMode, "Uzaktan Öğretim");

  const cyber = shards[uid][`${uid}:program-osym-101190675`];
  assert.equal(cyber.courses.length, 34);
  assert.match(cyber.sourceSelection.sourceTitle, /%30 İngilizce/);
  assert.match(cyber.sourceUrl, /^https:\/\/bologna\.ankara\.edu\.tr\/program\/[0-9a-f-]{36}\/dersler$/);
});

test("Cukurova publishes every exactly matched associate and bachelor plan", () => {
  const uid = "tr-cukurova-universitesi";
  const combined = { ...legacy.programs, ...expanded };
  const programmes = Object.values(combined).filter((programme) => programme.universityId === uid);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 134);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 8409);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
  }, {
    structuredProgramCount: 134,
    courseCount: 8409,
    missingProgramIds: [
      "program-osym-102900423",
      "program-osym-102900430",
      "program-osym-102990397",
    ].sort(),
  });

  const remote = shards[uid][`${uid}:program-osym-102950799`];
  assert.equal(remote.programName, "Bilgisayar Programcılığı (Uzaktan Öğretim)");
  assert.equal(remote.courses.length, 44);
  assert.equal(remote.sourceUrl, "https://ebs.cu.edu.tr/Program/DersPlan/647/2026");
  assert.deepEqual(remote.courses[0], {
    code: "BPP101",
    name: "Programlama Temelleri",
    semester: 1,
    kind: "required",
  });
});

test("Anadolu publishes its official campus and open-education course catalogs", () => {
  const uid = "tr-anadolu-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 94);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 4776);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
    missingReasons: universityCoverage.missingReasons,
  }, {
    structuredProgramCount: 94,
    courseCount: 4776,
    missingProgramIds: [
      "program-osym-101000101",
      "program-osym-101000108",
      "program-osym-101000115",
      "program-osym-101000122",
      "program-osym-101000136",
      "program-osym-101010016",
      "program-osym-101010079",
      "program-osym-101010113",
      "program-osym-101010255",
      "program-osym-101090713",
    ].sort(),
    missingReasons: {
      "program-osym-101000101": "programme-source-not-matched",
      "program-osym-101000108": "no-readable-curriculum",
      "program-osym-101000115": "no-readable-curriculum",
      "program-osym-101000122": "no-readable-curriculum",
      "program-osym-101000136": "no-readable-curriculum",
      "program-osym-101010016": "programme-source-not-matched",
      "program-osym-101010079": "programme-source-not-matched",
      "program-osym-101010113": "programme-source-not-matched",
      "program-osym-101010255": "programme-source-not-matched",
      "program-osym-101090713": "source-unavailable",
    },
  });

  const openEmergency = shards[uid][`${uid}:program-osym-101051376`];
  assert.equal(openEmergency.courses.length, 33);
  assert.equal(openEmergency.directoryUrl, "https://abp.anadolu.edu.tr/tr/akademik/acikogretim");
  assert.equal(openEmergency.sourceUrl, "https://abp.anadolu.edu.tr/tr/program/dersler/2008/13");
  assert.deepEqual(openEmergency.courses[0], {
    code: "ADY103U",
    name: "Acil Durum ve Afet Farkındalık Eğitimi",
    semester: null,
    kind: null,
  });

  const journalism = shards[uid][`${uid}:program-osym-101090566`];
  assert.equal(journalism.courses.length, 80);
  assert.equal(journalism.sourceUrl, "https://abp.anadolu.edu.tr/tr/program/dersler/227/13");
});

test("Dokuz Eylul publishes the separate official associate catalog", () => {
  const uid = "tr-dokuz-eylul-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 130);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 15236);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
  }, {
    structuredProgramCount: 130,
    courseCount: 15236,
    missingProgramIds: [
      "program-osym-103100395",
      "program-osym-103100402",
      "program-osym-103100416",
      "program-osym-103100423",
      "program-osym-103100430",
      "program-osym-103100437",
      "program-osym-103100444",
      "program-osym-103190632",
      "program-osym-103190831",
    ].sort(),
  });

  const dairy = shards[uid][`${uid}:program-osym-103190796`];
  assert.equal(dairy.programName, "Süt ve Ürünleri Teknolojisi");
  assert.equal(dairy.courses.length, 15);
  assert.equal(dairy.curriculumPeriod, "2025-2026");
  assert.equal(dairy.sourceUrl, "https://debis.deu.edu.tr/ders-katalog/2025-2026/tr/bolum_10422_tr.html");
  assert.deepEqual(dairy.courses[0], {
    code: "TDL1001",
    name: "Türk Dili I",
    semester: 1,
    kind: "required",
  });

  const efesFood = shards[uid][`${uid}:program-osym-103190563`];
  assert.equal(efesFood.courses.length, 58);
  assert.equal(efesFood.sourceUrl, "https://debis.deu.edu.tr/ders-katalog/2025-2026/tr/bolum_10147_tr.html");
});

test("Mugla publishes reviewed official aliases and excludes the duplicate draft plan", () => {
  const uid = "tr-mugla-sitki-kocman-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 159);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 13597);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
  }, {
    structuredProgramCount: 159,
    courseCount: 13597,
    missingProgramIds: [
      "program-osym-107690290",
      "program-osym-107690291",
      "program-osym-107690292",
    ],
  });

  const computer = shards[uid][`${uid}:program-osym-107610364`];
  assert.equal(computer.courses.length, 67);
  assert.equal(computer.sourceSelection.language, "İngilizce");
  assert.equal(computer.sourceSelection.aliasType, "official-language-profile");
  assert.match(computer.sourceSelection.identityEvidenceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(computer.courses[0], {
    code: "CENG1007",
    name: "Introduction to Computer Science",
    semester: 1,
    kind: "required",
  });

  const medicine = shards[uid][`${uid}:program-osym-107610416`];
  assert.equal(medicine.courses.length, 104);
  assert.equal(medicine.sourceSelection.aliasType, "official-degree-title");
  assert.equal(medicine.sourceSelection.sourceTitle, "Tıp Fakültesi");

  const accounting = shards[uid][`${uid}:program-osym-107650672`];
  assert.equal(accounting.courses.length, 70);
  assert.match(accounting.sourceSelection.sourceTitle, /İKMEP/);
  assert.equal(accounting.sourceSelection.curSunit, "401");

  const courtOffice = shards[uid][`${uid}:program-osym-107690361`];
  assert.equal(courtOffice.courses.length, 58);
  assert.equal(courtOffice.sourceSelection.curSunit, "4476");
  assert.equal(courtOffice.sourceSelection.excludedCurSunit, "4675");
  assert.equal(courtOffice.sourceSelection.aliasType, "official-duplicate-draft-excluded");
});

test("Igdir publishes every exact official associate plan and keeps two directory gaps explicit", () => {
  const uid = "tr-igdir-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 74);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 6989);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
  }, {
    structuredProgramCount: 74,
    courseCount: 6989,
    missingProgramIds: [
      "program-osym-105200101",
      "program-osym-105290065",
    ],
  });

  const oralHealth = shards[uid][`${uid}:program-osym-105290130`];
  assert.equal(oralHealth.courses.length, 77);
  assert.equal(oralHealth.sourceSelection.degree, "associate");
  assert.equal(oralHealth.sourceSelection.unitId, "1338");
  assert.equal(oralHealth.sourceSelection.programmeId, "428");
  assert.deepEqual(oralHealth.courses[0], {
    code: "225502610100",
    name: "MESLEK BİLGİSİ VE KLİNİK İŞLEMLER-I",
    semester: 1,
    kind: "required",
  });

  const programming = shards[uid][`${uid}:program-osym-105250125`];
  assert.equal(programming.courses.length, 62);
  assert.equal(programming.sourceSelection.programmeId, "100");
  assert.equal(programming.sourceUrl, "https://ebp.igdir.edu.tr/DereceProgramlari/Detay/0/126/100/932001");
});

test("Ege publishes reviewed associate plans and keeps the separate MTOK gap explicit", () => {
  const uid = "tr-ege-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 141);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 15380);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: [...universityCoverage.missingProgramIds].sort(),
  }, {
    structuredProgramCount: 141,
    courseCount: 15380,
    missingProgramIds: ["program-osym-103490582"],
  });

  const programming = shards[uid][`${uid}:program-osym-103451269`];
  assert.equal(programming.courses.length, 70);
  assert.equal(programming.sourceSelection.sourceTitle, "Bilgisayar Programcılığı (İKMEP)");
  assert.equal(programming.sourceSelection.programmeId, "7717");

  const pharmacy = shards[uid][`${uid}:program-osym-103451375`];
  assert.equal(pharmacy.sourceSelection.sourceDegree, "Önlisans");
  assert.equal(pharmacy.sourceSelection.programmeId, "7731");

  const aviation = shards[uid][`${uid}:program-osym-103490659`];
  assert.equal(aviation.sourceSelection.sourceDegree, "Ön Lisans (Türkçe)");
  assert.equal(aviation.sourceSelection.programmeId, "8454");

  const maleMechatronics = shards[uid][`${uid}:program-osym-103451657`];
  const femaleMechatronics = shards[uid][`${uid}:program-osym-103451684`];
  assert.equal(maleMechatronics.sourceUrl, femaleMechatronics.sourceUrl);
  assert.equal(maleMechatronics.sourceSelection.sourceTitle, "Mekatronik");

  const autonomousSystems = shards[uid][`${uid}:program-osym-103490554`];
  assert.equal(autonomousSystems.sourceSelection.sourceTitle, "Otonom Sistemleri Teknikerliği");
  assert.equal(autonomousSystems.sourceSelection.programmeId, "8406");
});

test("Ataturk reads open-education degrees from programme leaves and rejects conflicting codes", () => {
  const uid = "tr-ataturk-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 213);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 9365);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 213,
    courseCount: 9365,
    missingProgramIds: [
      "program-osym-101410524",
      "program-osym-101410357",
      "program-osym-101490740",
      "program-osym-101490775",
      "program-osym-101490635",
    ].sort(),
  });

  const emergency = shards[uid][`${uid}:program-osym-101490698`];
  assert.equal(emergency.courses.length, 28);
  assert.equal(emergency.curriculumPeriod, "2026 - 2027 Açıköğretim Akademik Yılı");
  assert.equal(emergency.sourceSelection.degree, "associate");
  assert.equal(emergency.sourceSelection.programmeId, "4031");
  assert.deepEqual(emergency.courses[0], {
    code: "ADY1001",
    name: "Acil Durum ve Afet Yönetimine Giriş",
    semester: 1,
    kind: "required",
  });

  const publicRelations = shards[uid][`${uid}:program-osym-101490691`];
  assert.equal(publicRelations.sourceSelection.programmeId, "4013");
  assert.equal(publicRelations.sourceSelection.excludedEquivalentProgrammeId, "4038");

  const islamicStudies = shards[uid][`${uid}:program-osym-101490824`];
  assert.equal(islamicStudies.sourceSelection.sourceTitle, "İslami İlimler Önlisans Programı");
  assert.equal(islamicStudies.sourceSelection.academicYearId, "156");

  for (const programId of ["program-osym-101490740", "program-osym-101490775", "program-osym-101490635"]) {
    assert.equal(shards[uid][`${uid}:${programId}`], undefined);
    assert.equal(universityCoverage.missingReasons[programId], "no-readable-curriculum");
  }
});

test("Konya Technical publishes department catalogues and rejects the conflicting food course code", () => {
  const uid = "tr-konya-teknik-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);

  assert.equal(programmes.length, 33);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 3205);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 33,
    courseCount: 3205,
    missingProgramIds: ["program-osym-111350463"],
  });

  const artificialIntelligence = shards[uid][`${uid}:program-osym-111372258`];
  assert.equal(artificialIntelligence.courses.length, 62);
  assert.equal(artificialIntelligence.curriculumPeriod, "Resmî Bölüm Dersleri kataloğu");
  assert.equal(artificialIntelligence.sourceSelection.department, "Yapay Zeka ve Makine Öğrenmesi");
  assert.equal(artificialIntelligence.sourceSelection.programmeId, "5019");
  assert.deepEqual(artificialIntelligence.courses[0], {
    code: "BBF104",
    name: "Atatürk İlkeleri ve İnkılâp Tarihi I",
    semester: 1,
    kind: null,
  });

  assert.equal(shards[uid][`${uid}:program-osym-111350463`], undefined);
  assert.equal(universityCoverage.missingReasons["program-osym-111350463"], "no-readable-curriculum");
});

test("Duzce selects the newest readable official plan and keeps four source gaps explicit", async () => {
  const uid = "tr-duzce-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");

  assert.equal(programmes.length, 107);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 10964);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds.sort(),
  }, {
    structuredProgramCount: 107,
    courseCount: 10964,
    missingProgramIds: [
      "program-osym-103390166",
      "program-osym-103390223",
      "program-osym-103390258",
      "program-osym-103390265",
    ],
  });
  assert.deepEqual(sources[uid].catalogs.slice(0, 2).map((value) => value.url), [
    "https://ebs.duzce.edu.tr/tr-TR/Program/Index/1",
    "https://ebs.duzce.edu.tr/tr-TR/Program/Index/2",
  ]);

  const logistics = shards[uid][`${uid}:program-osym-103350448`];
  assert.equal(logistics.courses.length, 93);
  assert.equal(logistics.curriculumPeriod, "2026 - 2027");
  assert.equal(logistics.sourceSelection.curriculumId, "6675");
  assert.equal(logistics.sourceSelection.sourceUnit, "Kaynaşlı Meslek Yüksekokulu");

  const turkishTeaching = shards[uid][`${uid}:program-osym-103310494`];
  assert.equal(turkishTeaching.sourceSelection.sourceTitle, "Türkçe Eğitimi (Normal Öğretim)");
  assert.equal(turkishTeaching.curriculumPeriod, "2025 - 2026");

  const woodEngineering = shards[uid][`${uid}:program-osym-103390168`];
  assert.equal(woodEngineering.curriculumPeriod, "2020 - 2021");
  assert.equal(woodEngineering.sourceSelection.skippedConflictingAcademicYears.length, 5);
  assert.deepEqual(woodEngineering.sourceSelection.skippedConflictingAcademicYears[0].conflicts, ["AEM426"]);

  for (const programId of universityCoverage.missingProgramIds) {
    assert.equal(shards[uid][`${uid}:${programId}`], undefined);
    assert.equal(universityCoverage.missingReasons[programId], "no-readable-curriculum");
  }
});

test("Maltepe publishes current ECTS and MUBIS course lists while keeping the new uncoded programme explicit", async () => {
  const uid = "tr-maltepe-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");

  assert.equal(programmes.length, 44);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 2354);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 44,
    courseCount: 2354,
    missingProgramIds: ["program-osym-204191095"],
  });
  assert.deepEqual(sources[uid].catalogs.slice(0, 5).map((value) => value.url), [
    "https://ects.maltepe.edu.tr/tr/egitim-fakultesi",
    "https://ects.maltepe.edu.tr/tr/meslek-yuksekokulu",
    "https://ects.maltepe.edu.tr/tr/hemsirelik",
    "https://ects.maltepe.edu.tr/tr/-saglik-bilimleri-yuksekokulu",
    "https://aday.maltepe.edu.tr/meslek-yuksekokulu/",
  ]);

  const law = shards[uid][`${uid}:program-osym-204111939`];
  assert.equal(law.courses.length, 90);
  assert.equal(law.sourceSelection.sourceTitle, "Hukuk Bölümü");
  assert.equal(law.sourceSelection.programUrl, "https://ects.maltepe.edu.tr/tr/hukuk-bolumu");
  assert.doesNotMatch(law.sourceSelection.courseUrl, /eski/);

  const preschool = shards[uid][`${uid}:program-osym-204110614`];
  assert.equal(preschool.courses.length, 45);
  assert.equal(preschool.curriculumPeriod, "Resmî ECTS ders listesi");
  assert.equal(preschool.sourceSelection.dataUrl,
    "https://mubis.maltepe.edu.tr/RAPOR/GENEL/DrupalDersTanimlari.aspx?SistemSK=6&BirimSK=32&BelgeDili=1");
  assert.deepEqual(preschool.courses[0], {
    code: "ATA153", name: "Atatürk İlkeleri Ve İnkılap Tarihi I",
    semester: null, kind: null,
  });

  const medicine = shards[uid][`${uid}:program-osym-204110377`];
  assert.ok(medicine.courses.some((course) => course.code === "MED511"
    && course.name === "Deri ve Zührevi Hastalıklar Stajı"));
  assert.equal(shards[uid][`${uid}:program-osym-204191095`], undefined);
  assert.equal(universityCoverage.missingReasons["program-osym-204191095"], "no-readable-curriculum");
});

test("Koç publishes all 22 official undergraduate curricula with medical and nursing course cards", async () => {
  const uid = "tr-koc-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");

  assert.equal(programmes.length, 22);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 2619);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 22,
    courseCount: 2619,
    missingProgramIds: [],
  });
  assert.deepEqual(sources[uid].catalogs.slice(0, 4).map((value) => value.url), [
    "https://apply.ku.edu.tr/courses",
    "https://cssh.ku.edu.tr/en/programs/archaeology-and-history-of-art/curriculum/",
    "https://science.ku.edu.tr/en/programs/physics/undergraduate-programs/curriculum/",
    "https://eng.ku.edu.tr/en/computer-engineering/undergraduate/curriculum/",
  ]);

  const computer = shards[uid][`${uid}:program-osym-203910354`];
  assert.equal(computer.courses.length, 191);
  assert.ok(computer.courses.some((course) => course.code === "COMP100"
    && course.semester === 1 && course.kind === "required"));
  assert.ok(computer.courses.some((course) => course.code === "COMP303"
    && course.kind === "elective"));

  const internationalRelations = shards[uid][`${uid}:program-osym-203910327`];
  assert.deepEqual(internationalRelations.sourceSelection.excludedConflictingCourseCodes, ["INTL350"]);
  assert.equal(internationalRelations.courses.some((course) => course.code === "INTL350"), false);

  const medicine = shards[uid][`${uid}:program-osym-203910699`];
  assert.equal(medicine.courses.length, 49);
  assert.ok(medicine.courses.some((course) => course.code === "IMED600"
    && course.name === "Internal Medicine" && course.year === 6));

  const nursing = shards[uid][`${uid}:program-osym-203910845`];
  assert.equal(nursing.courses.length, 25);
  assert.ok(nursing.courses.some((course) => course.code === "NURSE208"));
});

test("TOBB ETU publishes all 22 undergraduate course packages and the current YBS plan", async () => {
  const uid = "tr-tobb-ekonomi-ve-teknoloji-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");

  assert.equal(programmes.length, 22);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 1533);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 22,
    courseCount: 1533,
    missingProgramIds: [],
  });
  assert.deepEqual(sources[uid].catalogs.map((value) => value.url), [
    "https://www.etu.edu.tr/tr/sayfa/tyyc-bilgi-paketleri",
    "https://abys.etu.edu.tr/public/program.jsp?program=5&lang=tr&showMenu=true",
    "https://abys.etu.edu.tr/public/program.jsp?program=219&lang=tr&showMenu=true",
    "https://www.etu.edu.tr/tr/bolum/yonetim-bilisim-sistemleri/ders-mufredati",
  ]);

  const computer = shards[uid][`${uid}:program-osym-205410105`];
  assert.equal(computer.courses.length, 61);
  assert.ok(computer.courses.some((course) => course.code === "BİL113"
    && course.name === "Bilgisayar Programlama I"));
  assert.ok(computer.courses.some((course) => course.code === "İYD1"));
  assert.ok(computer.courses.every((course) => course.semester === null && course.kind === null));

  const ybs = shards[uid][`${uid}:program-osym-205400157`];
  assert.equal(ybs.courses.length, 74);
  assert.ok(ybs.courses.some((course) => course.code === "YBS101"
    && course.semester === 1 && course.kind === "required"));
  assert.ok(ybs.courses.some((course) => course.code === "YBS404"
    && course.semester === 11 && course.kind === "required"));
  assert.ok(ybs.courses.some((course) => course.code === "YBS451"
    && course.semester === null && course.kind === "elective"));

  const medicine = shards[uid][`${uid}:program-osym-205411033`];
  assert.equal(medicine.courses.length, 71);
  assert.match(medicine.sourceUrl, /abys\.etu\.edu\.tr\/public\/program\.jsp/);
});

test("Sabanci maps its three admission groups to the current faculty degree matrices", async () => {
  const uid = "tr-sabanci-universitesi";
  const programmes = Object.values(shards[uid]);
  const universityCoverage = coverage.universities.find((value) => value.universityId === uid);
  const sources = await data("turkey-catalog-sources-2026.json");

  assert.equal(programmes.length, 3);
  assert.equal(programmes.reduce((total, value) => total + value.courses.length, 0), 382);
  assert.deepEqual({
    structuredProgramCount: universityCoverage.structuredProgramCount,
    courseCount: universityCoverage.courseCount,
    missingProgramIds: universityCoverage.missingProgramIds,
  }, {
    structuredProgramCount: 3,
    courseCount: 382,
    missingProgramIds: [],
  });
  assert.equal(sources[uid].catalogs[0].url,
    "https://ects.sabanciuniv.edu/tr/akademik-programlar/lisans-programlari");

  const engineering = shards[uid][`${uid}:program-osym-205110092`];
  assert.equal(engineering.courses.length, 229);
  assert.equal(engineering.sourceSelection.includedProgrammes.length, 7);
  assert.ok(engineering.sourceSelection.includedProgrammes.includes("Veri Bilimi ve Analitiği"));
  assert.ok(engineering.courses.some((course) => course.code === "DSA201"
    && course.kind === "required"));

  const arts = shards[uid][`${uid}:program-osym-205110056`];
  assert.equal(arts.courses.length, 111);
  assert.equal(arts.sourceSelection.includedProgrammes.length, 4);
  assert.ok(arts.courses.some((course) => course.code === "ECON201"
    && course.kind === "required"));
  assert.ok(arts.courses.some((course) => course.code === "PSY201"
    && course.kind === "required"));

  const management = shards[uid][`${uid}:program-osym-205110135`];
  assert.equal(management.courses.length, 42);
  assert.deepEqual(management.sourceSelection.includedProgrammes, ["Yönetim Bilimleri"]);
  assert.ok(management.courses.some((course) => course.code === "MGMT201"
    && course.kind === "required"));
  assert.ok(programmes.every((programme) => programme.courses.every((course) => course.semester === null)));
});

test("the built API loads the requested university shard and keeps other programme IDs isolated", async () => {
  const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url));
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const chosen = ["tr-izmir-yuksek-teknoloji-enstitusu", "tr-kocaeli-universitesi", "tr-ordu-universitesi", "tr-recep-tayyip-erdogan-universitesi", "tr-isparta-uygulamali-bilimler-universitesi", "tr-karadeniz-teknik-universitesi", "tr-izmir-katip-celebi-universitesi", "tr-izmir-ekonomi-universitesi", "tr-istanbul-medipol-universitesi", "tr-cankiri-karatekin-universitesi", "tr-istanbul-bilgi-universitesi", "tr-afyonkarahisar-saglik-bilimleri-universitesi", "tr-atilim-universitesi", "tr-bahcesehir-universitesi", "tr-yalova-universitesi", "tr-istanbul-beykent-universitesi", "tr-istanbul-kultur-universitesi", "tr-ankara-medipol-universitesi", "tr-munzur-universitesi", "tr-abdullah-gul-universitesi", "tr-istanbul-sabahattin-zaim-universitesi", "tr-altinbas-universitesi", "tr-kastamonu-universitesi"].concat(["tr-kocaeli-saglik-ve-teknoloji-universitesi", "tr-istanbul-29-mayis-universitesi", "tr-istanbul-nisantasi-universitesi", "tr-gaziantep-islam-bilim-ve-teknoloji-universitesi", "tr-piri-reis-universitesi", "tr-cag-universitesi", "tr-cankaya-universitesi", "tr-ardahan-universitesi", "tr-tarsus-universitesi", "tr-isik-universitesi", "tr-ozyegin-universitesi", "tr-istanbul-aydin-universitesi", "tr-turk-hava-kurumu-universitesi", "tr-yasar-universitesi", "tr-istanbul-rumeli-universitesi", "tr-iskenderun-teknik-universitesi", "tr-halic-universitesi", "tr-istanbul-universitesi-cerrahpasa", "tr-bayburt-universitesi", "omu", "tr-marmara-universitesi", "tr-ankara-universitesi", "tr-cukurova-universitesi", "tr-anadolu-universitesi", "tr-dokuz-eylul-universitesi", "tr-mugla-sitki-kocman-universitesi", "tr-igdir-universitesi", "tr-ege-universitesi", "tr-ataturk-universitesi", "tr-konya-teknik-universitesi", "tr-duzce-universitesi", "tr-maltepe-universitesi", "tr-koc-universitesi", "tr-tobb-ekonomi-ve-teknoloji-universitesi", "tr-sabanci-universitesi"]).map((uid) => Object.values(shards[uid])[0]);
  for (const record of chosen) {
    const url = `http://localhost/api/course-catalog?universityId=${record.universityId}&programId=${record.programId}`;
    const response = await worker.fetch(new Request(url), env, context);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.available, true);
    assert.equal(body.coverage, "partial");
    const normalizeCourses = (courses) => {
      const map = new Map();
      for (const course of courses) {
        map.set(course.code, {
          code: course.code,
          name: course.name,
          semester: course.semester,
          offeredSemesters: course.offeredSemesters ? [...course.offeredSemesters].sort((a, b) => a - b) : undefined,
          year: course.year,
        });
      }
      return [...map.values()].sort((left, right) => left.code.localeCompare(right.code, "tr-TR"));
    };
    const apiCourses = normalizeCourses(body.courses);
    const sourceCourses = normalizeCourses(record.courses);
    assert.equal(apiCourses.length, sourceCourses.length);
    assert.deepEqual(apiCourses.map((course) => course.code), sourceCourses.map((course) => course.code));
    for (let i = 0; i < apiCourses.length; i += 1) {
      assert.deepEqual(apiCourses[i], sourceCourses[i]);
    }
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
