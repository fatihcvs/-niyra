import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(await readFile(new URL("../data/academic-catalog-2026.json", import.meta.url), "utf8"));

test("official academic catalog has verified coverage and referential integrity", () => {
  assert.equal(catalog.meta.updatedAt, "2026-09-05");
  assert.deepEqual(catalog.meta.stats, {
    universityCount: 241,
    coveredUniversityCount: 239,
    unitCount: 3212,
    programCount: 16454,
    curriculumLinkCount: Object.values(catalog.universities).flatMap((university) => university.programs).filter((program) => program.curriculumUrls?.length).length,
    catalogOnlyUniversityCount: 2,
  });
  assert.equal(Object.keys(catalog.universities).length, 241);
  assert.equal(catalog.meta.sources.length, 38);

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

test("MSU curriculum links identify their official authority and publication period", () => {
  const msu = catalog.universities["tr-milli-savunma-universitesi"];
  const curriculumPrograms = msu.programs.filter((program) => program.curriculumUrls?.length);

  assert.equal(curriculumPrograms.length, 41);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Millî Savunma Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumPeriod));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => url.startsWith("https://"))));

  const dated = curriculumPrograms.filter((program) => program.curriculumPeriod === "2021-2022");
  assert.equal(dated.length, 27);
  assert.ok(dated.every((program) => program.unitId.includes("astsubay-myo")));
});

test("Cyprus curriculum expansion links only verified official programme pages", () => {
  const expected = {
    "kktc-altinbas-kibris-universitesi": [7, "wpu.edu.tr"],
    "kktc-avrupa-liderlik-universitesi": [2, "elu.edu.tr"],
    "cy-national-and-kapodistrian-university-of-athens-cyprus-branch": [1, "baag.uoa.gr"],
  };

  for (const [universityId, [expectedCount, expectedHost]] of Object.entries(expected)) {
    const programs = catalog.universities[universityId].programs.filter((program) => program.curriculumUrls?.length);
    assert.equal(programs.length, expectedCount, universityId);
    assert.ok(programs.every((program) => program.curriculumAuthority), `${universityId}: missing authority`);
    assert.ok(programs.every((program) => program.curriculumUrls.every((url) => new URL(url).hostname === expectedHost)), `${universityId}: unexpected host`);
  }
});

test("OMU bachelor curricula link to the official EBP course catalog", () => {
  const omu = catalog.universities.omu;
  const curriculumPrograms = omu.programs.filter((program) => program.curriculumUrls?.length);

  assert.equal(curriculumPrograms.length, 82);
  assert.ok(curriculumPrograms.every((program) => program.degreeLevel === "bachelor"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Ondokuz Mayıs Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "ubs.omu.edu.tr" && parsed.searchParams.get("program");
  })));

  const computerEngineering = curriculumPrograms.find((program) => program.name === "Bilgisayar Mühendisliği");
  assert.equal(new URL(computerEngineering.curriculumUrls[0]).searchParams.get("program"), "2727");
});

test("ITU standard bachelor programmes link to official OBS course-plan lists", () => {
  const itu = catalog.universities["tr-istanbul-teknik-universitesi"];
  const curriculumPrograms = itu.programs.filter((program) => program.curriculumUrls?.length);

  assert.equal(curriculumPrograms.length, 49);
  assert.ok(curriculumPrograms.every((program) => program.degreeLevel === "bachelor"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "İstanbul Teknik Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "obs.itu.edu.tr"
      && (/^\/public\/DersPlan\/DersPlanDetay\/\d+$/.test(parsed.pathname) || (parsed.pathname === "/public/DersPlan/DersPlanlariList"
      && parsed.searchParams.get("planTipiKodu") === "lisans"
      && parsed.searchParams.get("programKodu")?.endsWith("_LS")));
  })));
  assert.ok(itu.programs.filter((program) => program.name.includes("UOLP")).every((program) => !program.curriculumUrls?.length));
});

test("METU Ankara and Northern Cyprus programmes link to official curricula", () => {
  const expected = {
    "tr-orta-dogu-teknik-universitesi": [42, "Orta Doğu Teknik Üniversitesi"],
    "kktc-odtu-kuzey-kibris-kampusu": [16, "Orta Doğu Teknik Üniversitesi — Kuzey Kıbrıs Kampüsü"],
  };

  for (const [universityId, [expectedCount, authority]] of Object.entries(expected)) {
    const university = catalog.universities[universityId];
    const curriculumPrograms = university.programs.filter((program) => program.curriculumUrls?.length);
    assert.equal(curriculumPrograms.length, expectedCount, universityId);
    assert.equal(curriculumPrograms.length, university.programs.length, `${universityId}: uncovered current programme`);
    assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === authority));
    assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
      const parsed = new URL(url);
      return parsed.hostname === "catalog.metu.edu.tr"
        && parsed.pathname === "/program.php"
        && /^\d+$/.test(parsed.searchParams.get("fac_prog") ?? "");
    })));
  }
});

test("Bilkent current programmes all link to official online curricula", () => {
  const bilkent = catalog.universities["tr-ihsan-dogramaci-bilkent-universitesi"];
  const curriculumPrograms = bilkent.programs.filter((program) => program.curriculumUrls?.length);

  assert.equal(curriculumPrograms.length, 27);
  assert.equal(curriculumPrograms.length, bilkent.programs.length);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "İhsan Doğramacı Bilkent Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "catalog.bilkent.edu.tr" && /^\/dep\/d\d+\.html$/.test(parsed.pathname);
  })));
});

test("Bogazici current programmes all link to official course and ECTS tables", () => {
  const bogazici = catalog.universities["tr-bogazici-universitesi"];
  const curriculumPrograms = bogazici.programs.filter((program) => program.curriculumUrls?.length);

  assert.equal(curriculumPrograms.length, 34);
  assert.equal(curriculumPrograms.length, bogazici.programs.length);
  assert.ok(curriculumPrograms.every((program) => program.degreeLevel === "bachelor"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Boğaziçi Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "bogazici.edu.tr" && /^\/tr\/pages\/lisans-programlari\/\d+$/.test(parsed.pathname);
  })));

  const scienceEducation = bogazici.programs.filter((program) => [
    "Fen Bilgisi Öğretmenliği (İngilizce)",
    "Fizik Öğretmenliği (İngilizce)",
    "Kimya Öğretmenliği (İngilizce)",
    "Matematik Öğretmenliği (İngilizce)",
    "İlköğretim Matematik Öğretmenliği (İngilizce)",
  ].includes(program.name));
  assert.equal(scienceEducation.length, 5);
  assert.ok(scienceEducation.every((program) => program.curriculumUrls[0].endsWith("/36")));
});

test("Hacettepe programmes link only to populated official Bologna course plans", () => {
  const hacettepe = catalog.universities["tr-hacettepe-universitesi"];
  const bachelorPrograms = hacettepe.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 79);
  assert.equal(curriculumPrograms.length, 77);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Hacettepe Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "bilsis.hacettepe.edu.tr"
      && parsed.pathname === "/oibs/bologna/progCourses.aspx"
      && /^\d+$/.test(parsed.searchParams.get("curSunit") ?? "")
      && parsed.searchParams.get("lang") === "tr";
  })));

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, ["Paramedik", "Yapay Zeka ve Veri Mühendisliği (İngilizce)"].sort());
});

test("Ankara University programmes link only to verified official Bologna curricula", () => {
  const ankara = catalog.universities["tr-ankara-universitesi"];
  const bachelorPrograms = ankara.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 139);
  assert.equal(curriculumPrograms.length, 137);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Ankara Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => ["2026 - 2027", "2025 - 2026", "2024 - 2025"].includes(program.curriculumPeriod)));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "bologna.ankara.edu.tr"
      && /^\/program\/[0-9a-f-]{36}\/dersler$/.test(parsed.pathname);
  })));

  assert.equal(curriculumPrograms.filter((program) => program.curriculumPeriod === "2026 - 2027").length, 106);
  assert.equal(curriculumPrograms.filter((program) => program.curriculumPeriod === "2025 - 2026").length, 30);
  assert.equal(curriculumPrograms.filter((program) => program.curriculumPeriod === "2024 - 2025").length, 1);
  assert.ok(bachelorPrograms.find((program) => program.name === "Hemşirelik")?.curriculumUrls?.[0].includes("b963513c-6c25-4453-95f7-fcbe26d7cb7c"));

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "Biyomedikal Mühendisliği (İngilizce) (UOLP-SUNY Buffalo)",
    "Gayrimenkul Geliştirme ve Yönetimi (UOLP-Azerbaycan Mimarlık ve İnşaat Üniversitesi)",
  ].sort());
});

test("Istanbul University programmes link only to populated official EBS curricula", () => {
  const istanbul = catalog.universities["tr-istanbul-universitesi"];
  const bachelorPrograms = istanbul.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 118);
  assert.equal(curriculumPrograms.length, 109);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "İstanbul Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => ["2026", "2025"].includes(program.curriculumPeriod)));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "ebs.istanbul.edu.tr"
      && parsed.pathname === "/home/dersprogram/"
      && /^\d+$/.test(parsed.searchParams.get("id") ?? "")
      && ["2026", "2025"].includes(parsed.searchParams.get("yil"));
  })));

  assert.equal(curriculumPrograms.filter((program) => program.curriculumPeriod === "2026").length, 107);
  assert.deepEqual(
    curriculumPrograms.filter((program) => program.curriculumPeriod === "2025").map((program) => program.name).sort(),
    ["Eczacılık", "Yapay Zeka ve Veri Mühendisliği (İngilizce)"].sort(),
  );

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "İlahiyat (Arapça) (M.T.O.K.)",
    "İlahiyat (M.T.O.K.)",
    "İlahiyat (İngilizce) (M.T.O.K.)",
    "İngiliz Dili ve Edebiyatı (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "İktisat (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "Bilgisayar Mühendisliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "İşletme (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "Yapay Zeka ve Veri Mühendisliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
  ].sort());
});

test("Gazi University programmes link only to populated official Bologna curricula", () => {
  const gazi = catalog.universities["tr-gazi-universitesi"];
  const bachelorPrograms = gazi.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 69);
  assert.equal(curriculumPrograms.length, 62);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Gazi Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "obs.gazi.edu.tr"
      && parsed.pathname === "/oibs/bologna/progCourses.aspx"
      && /^\d+$/.test(parsed.searchParams.get("curSunit") ?? "")
      && parsed.searchParams.get("lang") === "tr";
  })));

  const uolp = curriculumPrograms.find((program) => program.name === "Elektrik-Elektronik Mühendisliği (UOLP-Azerbaycan Teknik Üniversitesi)");
  assert.equal(new URL(uolp.curriculumUrls[0]).searchParams.get("curSunit"), "8664642153");

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "Bilgisayar Mühendisliği (M.T.O.K.)",
    "Elektrik-Elektronik Mühendisliği (M.T.O.K.)",
    "Endüstriyel Tasarım Mühendisliği (M.T.O.K.)",
    "Enerji Sistemleri Mühendisliği (M.T.O.K.)",
    "Metalurji ve Malzeme Mühendisliği (M.T.O.K.)",
    "Otomotiv Mühendisliği (M.T.O.K.)",
    "İnşaat Mühendisliği (M.T.O.K.)",
  ].sort());
});

test("Yildiz Technical current bachelor programmes all link to official Bologna course plans", () => {
  const yildiz = catalog.universities["tr-yildiz-teknik-universitesi"];
  const bachelorPrograms = yildiz.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 56);
  assert.equal(curriculumPrograms.length, bachelorPrograms.length);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Yıldız Teknik Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "bologna.yildiz.edu.tr"
      && parsed.pathname === "/index.php"
      && parsed.searchParams.get("r") === "program/view"
      && /^\d+$/.test(parsed.searchParams.get("id") ?? "")
      && /^\d+$/.test(parsed.searchParams.get("aid") ?? "");
  })));

  const computerEngineering = curriculumPrograms.find((program) => program.name === "Bilgisayar Mühendisliği");
  assert.equal(new URL(computerEngineering.curriculumUrls[0]).searchParams.get("id"), "550");
  assert.equal(new URL(computerEngineering.curriculumUrls[0]).searchParams.get("aid"), "3");
});

test("Marmara programmes link only to populated official MEOBS curricula", () => {
  const marmara = catalog.universities["tr-marmara-universitesi"];
  const bachelorPrograms = marmara.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 115);
  assert.equal(curriculumPrograms.length, 94);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Marmara Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "meobs.marmara.edu.tr"
      && parsed.pathname.startsWith("/ProgramTanitim/")
      && /-\d+-\d+-\d+$/.test(parsed.pathname);
  })));

  const computerEngineering = curriculumPrograms.find((program) => (
    program.name === "Bilgisayar Mühendisliği (İngilizce)"
    && marmara.units.find((unit) => unit.id === program.unitId)?.name === "Mühendislik Fakültesi"
  ));
  assert.ok(computerEngineering.curriculumUrls[0].includes("bilgisayar-muhendisligi-ingilizce"));

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name);
  assert.equal(unlinked.length, 21);
  assert.ok(unlinked.every((name) => name.includes("M.T.O.K.")
    || name.includes("UOLP-")
    || [
      "Film Tasarımı ve Yönetimi",
      "İşletme",
      "İşletme (Almanca)",
      "İşletme (İngilizce)",
      "Turizm ve Gastronomi Yönetimi Programları (İngilizce)",
    ].includes(name)));
});

test("Ege programmes link only to populated official EBP course plans", () => {
  const ege = catalog.universities["tr-ege-universitesi"];
  const bachelorPrograms = ege.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 74);
  assert.equal(curriculumPrograms.length, 73);
  assert.equal(curriculumPrograms.reduce((total, program) => total + program.curriculumUrls.length, 0), 82);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Ege Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "ebp.ege.edu.tr"
      && /^\/DereceProgramlari\/Detay\/1\/\d+\/\d+\/93200[14]$/.test(parsed.pathname);
  })));

  assert.equal(curriculumPrograms.find((program) => program.name === "Biyoloji").curriculumUrls.length, 5);
  assert.equal(curriculumPrograms.find((program) => program.name === "Biyokimya").curriculumUrls.length, 2);
  assert.equal(curriculumPrograms.find((program) => program.name === "Matematik").curriculumUrls.length, 3);
  assert.equal(curriculumPrograms.find((program) => program.name === "Su Ürünleri Mühendisliği").curriculumUrls.length, 3);

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "İlahiyat (M.T.O.K.)",
  ].sort());
});

test("Dokuz Eylul programmes link only to verified 2025-2026 course-catalog plans", () => {
  const deu = catalog.universities["tr-dokuz-eylul-universitesi"];
  const bachelorPrograms = deu.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 88);
  assert.equal(curriculumPrograms.length, 81);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Dokuz Eylül Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumPeriod === "2025-2026"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "debis.deu.edu.tr"
      && /^\/ders-katalog\/2025-2026\/tr\/bolum_\d+_tr\.html$/.test(parsed.pathname);
  })));

  assert.ok(curriculumPrograms.find((program) => program.name === "Bilgisayar ve Öğretim Teknolojileri Öğretmenliği")
    ?.curriculumUrls[0].endsWith("/bolum_1099_tr.html"));

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "Tıp (İngilizce)",
    "İlahiyat (M.T.O.K.)",
    "Turizm ve Gastronomi Yönetimi Programları (İngilizce)",
    "İktisat (UOLP-Gence Devlet Üniversitesi)",
    "Tarih (UOLP-Gence Devlet Üniversitesi)",
    "Havacılık ve Uzay Mühendisliği (İngilizce)",
    "Radyo, Televizyon ve Sinema",
  ].sort());
});

test("Akdeniz programmes link only to populated official Bologna course plans", () => {
  const akdeniz = catalog.universities["tr-akdeniz-universitesi"];
  const bachelorPrograms = akdeniz.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 90);
  assert.equal(curriculumPrograms.length, 89);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Akdeniz Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "obs.akdeniz.edu.tr"
      && parsed.pathname === "/oibs/bologna/progCourses.aspx"
      && /^\d+$/.test(parsed.searchParams.get("curSunit") ?? "")
      && parsed.searchParams.get("lang") === "tr";
  })));

  const englishLiterature = curriculumPrograms.find((program) => program.name === "İngiliz Dili ve Edebiyatı (İngilizce)");
  assert.equal(new URL(englishLiterature.curriculumUrls[0]).searchParams.get("curSunit"), "872");

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name);
  assert.deepEqual(unlinked, ["Tarım Ekonomisi"]);
});

test("Cukurova programmes link only to populated current EBS course plans", () => {
  const cukurova = catalog.universities["tr-cukurova-universitesi"];
  const bachelorPrograms = cukurova.programs.filter((program) => program.degreeLevel === "bachelor");
  const curriculumPrograms = bachelorPrograms.filter((program) => program.curriculumUrls?.length);

  assert.equal(bachelorPrograms.length, 72);
  assert.equal(curriculumPrograms.length, 69);
  assert.ok(curriculumPrograms.every((program) => program.curriculumAuthority === "Çukurova Üniversitesi"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumPeriod === "2026-2027"));
  assert.ok(curriculumPrograms.every((program) => program.curriculumUrls.every((url) => {
    const parsed = new URL(url);
    return parsed.hostname === "ebs.cu.edu.tr"
      && /^\/Program\/DersPlan\/\d+\/2026$/.test(parsed.pathname);
  })));

  const business = curriculumPrograms.find((program) => (
    program.name === "İşletme"
    && cukurova.units.find((unit) => unit.id === program.unitId)?.name === "İktisadi Ve İdari Bilimler Fakültesi"
  ));
  assert.ok(business.curriculumUrls[0].endsWith("/Program/DersPlan/216/2026"));

  const unlinked = bachelorPrograms.filter((program) => !program.curriculumUrls?.length).map((program) => program.name).sort();
  assert.deepEqual(unlinked, [
    "Gastronomi ve Mutfak Sanatları",
    "Grafik Tasarımı",
    "İlahiyat (M.T.O.K.)",
  ].sort());
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
