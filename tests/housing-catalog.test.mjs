import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const catalogue = JSON.parse(await read("data/housing-catalog-2026.json"));
const manifest = JSON.parse(await read("research/housing-source-manifest-2026.json"));
const universitySource = (await read("lib/university-catalog.ts")).replace(/^import .*?;\r?\n/, "");
const universityExports = {};
new Function("exports", "universityLogoCatalog", ts.transpileModule(universitySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(universityExports, JSON.parse(await read("data/university-logos-2026.json")));
const { universities } = universityExports;
const source = (await read("lib/housing-catalog.ts")).replace(/^import .*?;\r?\n/gm, "");
const api = {};
new Function("exports", "catalogue", "universities", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(api, catalogue, universities);
const { getHousingDirectory, housingDistance } = api;

test("every university has a sourced campus and a usable nearby, institutional, or city alternative", () => {
  assert.equal(universities.length, 241);
  const known = new Set(universities.map((u) => u.id));
  assert.equal(new Set(catalogue.campuses.map((c) => c.universityId)).size, known.size);
  for (const campus of catalogue.campuses) assert.ok(known.has(campus.universityId), campus.id);
  for (const u of universities) {
    const campuses = catalogue.campuses.filter((c) => c.universityId === u.id);
    assert.ok(campuses.some((c) => getHousingDirectory({ universityId: u.id, campusId: c.id, scope: "city" }).total > 0), u.name);
  }
});

test("GSB public and private sources cover all 81 provinces plus the Cyprus directory without parsing field labels as names", () => {
  assert.equal(manifest.gsbDirectories.length, 164);
  assert.equal(new Set(manifest.gsbDirectories.map((d) => d.city)).size, 82);
  const records = catalogue.places.filter((p) => p.id.startsWith("gsb-"));
  assert.equal(records.length, manifest.gsbDirectories.reduce((sum, d) => sum + d.count, 0));
  assert.equal(records.filter((p) => p.kind === "public_dorm").length, 867);
  assert.equal(records.filter((p) => p.kind === "private_dorm").length, 1463);
  for (const p of records) {
    assert.doesNotMatch(p.name, /^(faks|tipi|telefon|kapasite|adres)\s*:?$/i, p.id);
    assert.ok(p.address === "" || p.address.length > 3, p.id);
    assert.doesNotMatch(p.address, /^[\s0.-]+$/, p.id);
    assert.match(p.source.url, /^https:\/\/(kygm|ozelbarinmahizmetleri)\.gsb\.gov\.tr\/ajax\//, p.id);
    assert.ok(p.kind === (p.id.startsWith("gsb-public") ? "public_dorm" : "private_dorm"), p.id);
  }
  assert.equal(records.find((p) => p.id === "gsb-public-016134302").address, "", "Published placeholder address must remain unknown");
});

test("catalogue records have stable unique IDs and valid, separately sourced coordinates", () => {
  assert.equal(new Set(catalogue.places.map((p) => p.id)).size, catalogue.places.length);
  assert.equal(new Set(catalogue.campuses.map((p) => p.id)).size, catalogue.campuses.length);
  assert.equal(catalogue.meta.recordCount, catalogue.places.length);
  assert.ok(!catalogue.places.some((p) => p.id === "osm-way-690352612"), "Reviewed Munevver Ayasli map duplicate is excluded");
  assert.ok(catalogue.places.some((p) => p.id === "gsb-public-055112502"), "The primary institutional record remains available");
  for (const p of [...catalogue.places, ...catalogue.campuses]) {
    assert.equal(p.latitude === null, p.longitude === null, p.id);
    if (p.latitude !== null) {
      assert.ok(Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90, p.id);
      assert.ok(Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180, p.id);
    }
  }
  for (const p of catalogue.places) {
    assert.equal(new URL(p.source.url).protocol, "https:", p.id);
    assert.match(p.source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.source.checkedAt <= catalogue.meta.checkedAt, p.id);
    if (p.latitude !== null) assert.equal(new URL(p.coordinateSourceUrl).protocol, "https:", p.id);
    assert.equal("price" in p || "rating" in p || "availableBeds" in p, false, p.id);
  }
});

test("nearby results are calculated from the selected campus, stay in its region and are sorted by distance", () => {
  const data = getHousingDirectory({ universityId: "omu" });
  assert.equal(data.selectedCampus.name, "Kurupelit Yerleşkesi");
  assert.ok(data.total > 15);
  assert.ok(data.counts.public > 0 && data.counts.private > 0);
  const c = data.selectedCampus;
  for (const p of data.places.filter((p) => p.relation === "nearby")) {
    assert.equal(p.region, c.region);
    // Independent spherical-law-of-cosines oracle (not the implementation's haversine).
    const rad = Math.PI / 180;
    const d = 6371000 * Math.acos(Math.min(1, Math.sin(c.latitude*rad)*Math.sin(p.latitude*rad)
      + Math.cos(c.latitude*rad)*Math.cos(p.latitude*rad)*Math.cos((p.longitude-c.longitude)*rad)));
    assert.ok(d <= 5000.1, p.id);
    assert.ok(Math.abs(p.distanceMeters - d) <= 1, p.id);
  }
  for (let i = 1; i < data.places.length; i++) assert.ok((data.places[i-1].distanceMeters ?? Infinity) <= (data.places[i].distanceMeters ?? Infinity));
  assert.equal(housingDistance({ latitude: 41, longitude: 36 }, { latitude: 41, longitude: 36 }), 0);
});

test("Bafra and Kurupelit show different nearby dormitories; a foreign campus ID is rejected", () => {
  const bafra = getHousingDirectory({ universityId: "omu", campusId: "omu:bafra-yerleskesi", kind: "public" });
  assert.ok(bafra.places.some((p) => /BAFRA/.test(p.name)));
  assert.ok(!bafra.places.some((p) => /MÜNEVVER/.test(p.name)));
  const foreign = catalogue.campuses.find((c) => c.universityId !== "omu");
  assert.equal(getHousingDirectory({ universityId: "omu", campusId: foreign.id }), null);
  assert.equal(getHousingDirectory({ universityId: "unknown" }), null);
});

test("search, type, gender and pagination narrow actual catalogue data without duplicate pages", () => {
  const search = getHousingDirectory({ universityId: "omu", query: "munevver" });
  assert.ok(search.total > 0);
  assert.ok(search.places.every((p) => /Münevver|MÜNEVVER/.test(p.name)));
  const filtered = getHousingDirectory({ universityId: "omu", kind: "private", gender: "female", scope: "city" });
  assert.ok(filtered.total > 0);
  assert.ok(filtered.places.every((p) => p.kind === "private_dorm" && p.gender === "female"));
  const first = getHousingDirectory({ universityId: "tr-istanbul-universitesi", scope: "city" });
  const second = getHousingDirectory({ universityId: "tr-istanbul-universitesi", scope: "city", page: 2 });
  assert.ok(first.total > first.pageSize);
  assert.equal(second.page, 2);
  assert.ok(!second.places.some((p) => first.places.some((a) => a.id === p.id)));
  assert.equal(getHousingDirectory({ universityId: "omu", query: "zzzznonexistent" }).total, 0);
});

test("unknown campus coordinates never turn into zero-distance claims or a different-country fallback", () => {
  const data = getHousingDirectory({ universityId: "tr-ahmet-yesevi-universitesi" });
  assert.equal(data.selectedCampus.region, "Kazakistan");
  assert.equal(data.selectedCampus.latitude, null);
  assert.equal(data.places.length, 2);
  assert.ok(data.places.every((p) => p.relation === "university" && p.distanceMeters === null && p.region === "Kazakistan"));
  const unknown = getHousingDirectory({ universityId: "cy-philips-university", scope: "city" });
  assert.ok(unknown.total > 0);
  assert.ok(unknown.places.every((p) => p.distanceMeters === null && p.region === "Kıbrıs Cumhuriyeti"));
});

test("Cyprus discovery does not suggest a venue across the administrative boundary as nearby", () => {
  for (const id of ["kktc-ada-kent-universitesi", "kktc-ankara-sosyal-bilimler-universitesi", "cy-american-university-of-cyprus-aucy", "cy-university-of-nicosia"]) {
    const data = getHousingDirectory({ universityId: id });
    assert.ok(data.total > 0, id);
    assert.ok(data.places.every((p) => p.region === data.selectedCampus.region), id);
  }
});

test("the read-only directory endpoint authenticates, validates filters and never changes profile or discussion access", async () => {
  let signedIn = true;
  let completeProfile = true;
  const routeSource = (await read("app/api/housing/catalog/route.ts")).replace(/^import .*?;\r?\n/gm, "");
  const output = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = { ...api, cleanText: (v, length) => typeof v === "string" ? v.trim().slice(0, length) : "",
    getRuntime: async () => ({ DB: {} }), requireIdentity: async () => signedIn ? { email: "local@example.test" } : null,
    requireProfile: async () => completeProfile ? { university_id: "omu" } : null,
    signInResponse: () => Response.json({}, { status: 401 }), unavailableResponse: () => Response.json({}, { status: 503 }) };
  const endpoint = {};
  new Function("exports", ...Object.keys(mocks), output)(endpoint, ...Object.values(mocks));
  const call = (query = "") => endpoint.GET(new Request(`https://example.test/api/housing/catalog${query}`));
  signedIn = false; assert.equal((await call()).status, 401);
  signedIn = true; completeProfile = false; assert.equal((await call()).status, 409);
  completeProfile = true;
  for (const query of ["?kind=wrong", "?scope=global", "?gender=invalid", "?page=-1", "?page=1.5", "?page=Infinity"]) assert.equal((await call(query)).status, 400, query);
  assert.equal((await call("?universityId=unknown")).status, 404);
  assert.equal((await (await call()).json()).university.id, "omu");
  assert.equal((await (await call("?universityId=tr-bogazici-universitesi")).json()).university.id, "tr-bogazici-universitesi");
});
