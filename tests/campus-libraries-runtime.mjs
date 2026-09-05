import assert from "node:assert/strict";

const base = process.env.KAMPIRA_BASE_URL ?? "http://127.0.0.1:5173";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Synthetic account test is local only");
let cookie = "";
async function request(path, status = 200, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${data.error ?? response.status}`);
  return data;
}
await request("/api/campus-guide?category=library", 401);
const stamp = Date.now();
const response = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: `library.qa.${stamp}@omu.edu.tr`, password: `LibraryQa${stamp}!`, displayName: "Kütüphane Test" }) });
assert.equal(response.status, 201);
cookie = response.headers.get("set-cookie").split(";")[0];
await request("/api/campus-guide?category=library", 409);
await request("/api/profile", 200, { universityId: "omu", facultyId: "muhendislik", departmentId: "bilgisayar", classYear: 3,
  courseIds: ["bilgisayar-bil101", "bilgisayar-mat101", "bilgisayar-fiz101"] }, "PUT");
const libraries = (await request("/api/campus-guide?category=library")).places;
const curated = libraries.filter((p) => p.curated);
assert.equal(curated.length, 14);
assert.ok(libraries.every((p) => p.category === "library"));
assert.ok(curated.every((p) => !p.coordinatesKnown && p.distanceMeters === null && p.source.type === "official-university"));
const search = (await request("/api/campus-guide?category=library&q=terme")).places.filter((p) => p.curated);
assert.deepEqual(search.map((p) => p.name), ["Terme Meslek Yüksekokulu Kütüphanesi"]);
const unfiltered = (await request("/api/campus-guide")).places;
assert.ok(curated.every((p) => unfiltered.some((place) => place.id === p.id)));
const buildings = (await request("/api/campus-guide?category=building")).places;
assert.ok(buildings.every((p) => p.category === "building"));
await request("/api/campus-guide?category=invalid", 400);
console.log(JSON.stringify({ ok: true, officialLibraries: curated.length, filteredSearch: search.length, sameRecordsWithoutFilter: true, unknownCoordinatesPreserved: true }, null, 2));
