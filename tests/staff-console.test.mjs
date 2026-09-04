import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("staff console migration separates privileged accounts and sessions", async () => {
  const migration = await source("../drizzle/0014_faithful_darkhawk.sql");
  for (const table of ["staff_accounts", "staff_sessions", "platform_settings", "staff_audit_logs"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /must_change_password/);
  assert.match(migration, /ALTER TABLE `users` ADD `status`/);
});

test("initial owner bootstrap is one-time and forces a password change", async () => {
  const auth = await source("../lib/staff-auth.ts");
  assert.match(auth, /INITIAL_OWNER_USERNAME = "admin"/);
  assert.match(auth, /INITIAL_OWNER_PASSWORD = "admin123"/);
  assert.match(auth, /SELECT id FROM staff_accounts WHERE role = 'owner' LIMIT 1/);
  assert.match(auth, /must_change_password\)\s*VALUES \([^)]*1\)/s);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /60 \* 60 \* 8/);
});

test("owner and admin APIs enforce distinct role scopes", async () => {
  const [owner, admin] = await Promise.all([source("../app/api/owner/route.ts"), source("../app/api/admin/route.ts")]);
  assert.match(owner, /requireStaff\(DB, request, "owner"\)/);
  assert.match(owner, /create-admin/);
  assert.match(owner, /reset-admin-password/);
  assert.match(admin, /decide-report/);
  assert.match(admin, /moderate-content/);
  assert.match(admin, /set-user-status/);
});

test("owner snapshot exposes verified course catalog coverage", async () => {
  const [owner, consoleSource] = await Promise.all([
    source("../app/api/owner/route.ts"),
    source("../app/staff-console.tsx"),
  ]);
  assert.match(owner, /getOfficialCourseCoverage/);
  assert.match(owner, /courseCatalogPrograms/);
  assert.match(owner, /courseCatalogCourses/);
  assert.match(consoleSource, /Ders kataloğu/);
  assert.match(consoleSource, /Doğrulanmış ders/);
});

test("management registry covers every current product moderation surface", async () => {
  const registry = await source("../lib/admin-registry.ts");
  for (const key of ["users", "posts", "comments", "notes", "noteComments", "communities", "pulse", "market", "places", "housingDiscussions", "events", "prices", "matches", "library", "reports"]) {
    assert.match(registry, new RegExp(`key: "${key}"`));
  }
});

test("owner feature switches are enforced by their product APIs", async () => {
  const [register, notes, communities, housing, campusGuide] = await Promise.all([
    source("../app/api/auth/register/route.ts"),
    source("../app/api/notes/route.ts"),
    source("../app/api/communities/route.ts"),
    source("../app/api/housing/route.ts"),
    source("../app/api/campus-guide/route.ts"),
  ]);
  assert.match(register, /registrationOpen/);
  assert.match(notes, /noteUploadsOpen/);
  assert.match(communities, /communityCreationOpen/);
  assert.match(housing, /housingContributionsOpen/);
  assert.match(campusGuide, /housingContributionsOpen/);
});
