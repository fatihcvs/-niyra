import assert from "node:assert/strict";

const base = process.env.KAMPIRA_BASE_URL ?? "http://127.0.0.1:5173";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "This fixture test is local only");
let cookie = "";
async function request(path, expected = 200, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${data.error ?? response.status}`);
  return data;
}
await request("/api/housing/catalog", 401);
const stamp = Date.now();
const registration = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `housing.qa.${stamp}@omu.edu.tr`, password: `HousingQa${stamp}!`, displayName: "Konaklama Test" }) });
assert.equal(registration.status, 201);
cookie = registration.headers.get("set-cookie").split(";")[0];
await request("/api/housing/catalog", 409);
await request("/api/profile", 200, { universityId: "omu", facultyId: "muhendislik", departmentId: "bilgisayar", classYear: 3,
  courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"] }, "PUT");
const home = await request("/api/housing/catalog");
assert.equal(home.university.id, "omu");
assert.equal(home.universities.length, 241);
assert.equal(home.selectedCampus.name, "Kurupelit Yerleşkesi");
assert.ok(home.counts.public > 0 && home.counts.private > 0);
const bafra = await request("/api/housing/catalog?campusId=omu%3Abafra-yerleskesi&kind=public");
assert.ok(bafra.places.some((p) => /BAFRA/.test(p.name)));
const girls = await request("/api/housing/catalog?kind=private&gender=female&scope=city");
assert.ok(girls.total > 0 && girls.places.every((p) => p.kind === "private_dorm" && p.gender === "female"));
const remote = await request("/api/housing/catalog?universityId=tr-bogazici-universitesi");
assert.ok(remote.total > 0);
await request(`/api/housing/catalog?universityId=omu&campusId=${encodeURIComponent(remote.selectedCampus.id)}`, 404);
await request("/api/housing/catalog?kind=invalid", 400);
await request("/api/housing/catalog?page=0", 400);
await request("/api/housing/catalog?universityId=unknown", 404);
await request(`/api/housing?placeId=${encodeURIComponent(home.places[0].id)}`, 404);
assert.equal((await request("/api/profile")).profile.universityId, "omu");
console.log(JSON.stringify({ ok: true, universities: home.universities.length, localResults: home.total, bafraPublicDorms: bafra.total,
  privateFemaleResults: girls.total, remoteResults: remote.total, authenticated: true, profileUnchanged: true, curatedIdsCannotAccessDiscussions: true }, null, 2));
