import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const migrations = await Promise.all(
  (await readdir(new URL("drizzle/", root)))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()
    .map((name) => readFile(new URL(`drizzle/${name}`, root), "utf8")),
);
const paths = [
  "lib/staff-console-view.ts",
  "lib/admin-registry.ts",
  "app/api/owner/route.ts",
  "app/api/admin/route.ts",
];
const code = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [
      path,
      ts.transpileModule(await readFile(new URL(path, root), "utf8"), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      }).outputText,
    ]),
  ),
);
function load(path, dependencies = {}) {
  const exports = {};
  runInNewContext(code[path], {
    exports,
    URL,
    URLSearchParams,
    Date,
    Response,
    console,
    crypto,
    require(name) {
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
const view = load(paths[0]);
const registry = load(paths[1]);

test("staff section links respect role-specific sections and reject unknown values", () => {
  assert.equal(view.staffTabFromSearch("owner", "?tab=updates"), "updates");
  for (const mode of ["owner", "admin"]) assert.equal(view.staffTabFromSearch(mode, "?tab=account-deletion"), "account-deletion");
  assert.equal(
    view.staffTabFromSearch("admin", "?tab=reports&record=123"),
    "reports",
  );
  for (const query of [
    "?tab=admins",
    "?tab=settings",
    "?tab=constructor",
    "?tab=<script>",
  ])
    assert.equal(view.staffTabFromSearch("admin", query), "overview");
});
test("pagination clamps stale pages after filtering and represents empty lists accurately", () => {
  const rows = Array.from({ length: 25 }, (_, index) => index);
  const end = view.paginateRecords(rows, 99, 12);
  assert.equal(end.page, 3);
  assert.equal(end.from, 25);
  assert.equal(end.to, 25);
  assert.equal(end.rows[0], 24);
  const empty = view.paginateRecords([], 10);
  assert.equal(empty.page, 1);
  assert.equal(empty.pages, 1);
  assert.equal(empty.from, 0);
  assert.equal(empty.to, 0);
  assert.equal(view.paginateRecords(rows, -5).page, 1);
  assert.equal(view.paginateRecords(rows, 2, 0).rows.length, 12);
});
test("audit CSV neutralizes formulas, preserves Turkish multiline reasons and excludes arbitrary details", () => {
  const csv = view.auditCsv([
    {
      created_at: "2026-09-05",
      action: "moderation.content_hide",
      actor_name: " =1+1",
      entity_type: "post",
      entity_id: "+123",
      detail: JSON.stringify({
        reason: 'İhlal, açıklama\n"alıntı"',
        secret: "must-not-export",
      }),
    },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\' =1+1"'));
  assert.ok(csv.includes('"\'+123"'));
  assert.ok(csv.includes('"İhlal, açıklama\n""alıntı"""'));
  assert.ok(!csv.includes("must-not-export"));
  for (const raw of ["{", "[]", "null", "42"])
    assert.equal(Object.keys(view.auditDetails(raw)).length, 0);
});
test("seven-day chart fills missing UTC calendar days without inventing counts", () => {
  const days = view.sevenDayActivity(
    [
      { day: "2026-08-30", accounts: 3, content: 0, reports: 1 },
      { day: "2026-09-05", accounts: 999 },
    ],
    "2026-09-05T01:10:00+03:00",
  );
  assert.equal(days.length, 7);
  assert.equal(days[0].day, "2026-08-29");
  assert.equal(days[6].day, "2026-09-04");
  assert.equal(days[1].accounts, 3);
  assert.equal(days[1].reports, 1);
  assert.equal(days[6].content, 0);
  assert.equal(
    view.staffTimestamp("2026-09-04 22:15:00"),
    Date.parse("2026-09-04T22:15:00Z"),
  );
});

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((sql) => database.exec(sql));
  const DB = {
    prepare(query) {
      const statement = (values = []) => ({
        bind(...bound) {
          return statement(bound);
        },
        async first() {
          return database.prepare(query).get(...values) ?? null;
        },
        async all() {
          return { results: database.prepare(query).all(...values) };
        },
        async run() {
          return { meta: database.prepare(query).run(...values) };
        },
      });
      return statement();
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  const logs = [];
  const staff = {
    requireStaff: async (_db, request, required) =>
      request.headers.get("x-role") !== "owner" && required === "owner"
        ? { response: Response.json({}, { status: 403 }) }
        : { identity: { id: "staff", role: request.headers.get("x-role") } },
    requireSameOriginStaffRequest: () => null,
    staffAudit: async (_db, _id, action, entityType, entityId, detail) =>
      logs.push({ action, entityType, entityId, detail }),
  };
  const server = {
    getRuntime: async () => ({ DB, FILES: {} }),
    cleanText: (value, max) =>
      String(value ?? "")
        .trim()
        .slice(0, max),
    enforceRateLimit: async () => ({ allowed: true }),
  };
  const dependencies = {
    "../../../lib/server-api": server,
    "../../../lib/staff-auth": staff,
    "../../../lib/admin-registry": registry,
    "../../../lib/app-auth": {},
    "../../../data/cyprus-catalog-coverage-2026.json": { default: { universities: [
      { programCount: 5, structuredProgramCount: 2 },
      { programCount: 3, structuredProgramCount: 1 },
    ] } },
    "../../../lib/official-course-catalog": {
      getOfficialCourseCoverage: () => [{ coverage: "partial", courseCount: 1 }],
      officialCourseCatalogMeta: { updatedAt: "test" },
    },
    "../../../lib/platform-settings": { getPlatformSettings: async () => ({}) },
    "../../../data/turkey-catalog-coverage-2026.json": { default: { universities: [
      { programCount: 10, structuredProgramCount: 4 },
      { programCount: 8, structuredProgramCount: 0 },
    ] } },
  };
  const owner = load(paths[2], dependencies),
    admin = load(paths[3], dependencies);
  database.exec(`INSERT INTO users (email, public_id, display_name, handle) VALUES ('student@test.local','student','Test Student','teststudent');
    INSERT INTO universities (id, name, short_name, city) VALUES ('campus','Test Campus','TEST','Test');
    INSERT INTO communities (id,creator_email,name,slug,moderation_status) VALUES ('hidden-community','student@test.local','Hidden','hidden','hidden');
    INSERT INTO community_events (id,community_id,creator_email,title,starts_at,status) VALUES ('hidden-event','hidden-community','student@test.local','Hidden event','2026-10-01','hidden');
    INSERT INTO posts (id,author_email,content,created_at) VALUES ('first-day','student@test.local','First calendar day',datetime('now','start of day','-6 days','+1 minute'));`);
  const request = (body, role = "admin") =>
    new Request("http://local/api/admin", {
      method: body ? "POST" : "GET",
      headers: { "x-role": role, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { database, owner, admin, request, logs };
}
test("owner dashboard SQL includes hidden communities, events and the full first UTC day", async (t) => {
  const f = fixture(t);
  const response = await f.owner.GET(f.request(null, "owner"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.metrics.communities_hidden, 1);
  assert.equal(data.metrics.community_events_hidden, 1);
  assert.equal(data.system.courseCatalogPartialPrograms, 1);
  assert.equal(data.system.cyprusCatalogPrograms, 8);
  assert.equal(data.system.cyprusCatalogStructuredPrograms, 3);
  const day = f.database
    .prepare("SELECT date('now','-6 days') AS day")
    .get().day;
  assert.equal(data.activity.find((item) => item.day === day).content, 1);
  assert.equal((await f.owner.GET(f.request(null, "admin"))).status, 403);
});
test("admin snapshot returns full review text plus places/events/prices while excluding private messages", async (t) => {
  const f = fixture(t);
  const long = "İncelenecek açıklama. ".repeat(40);
  f.database.prepare("UPDATE posts SET content = ?").run(long);
  f.database
    .exec(`INSERT INTO campus_places (id,university_id,creator_email,name,category,description) VALUES ('place','campus','student@test.local','Mekân','cafe','Mekân açıklaması');
    INSERT INTO campus_events (id,university_id,creator_email,title,description,category,starts_at) VALUES ('event','campus','student@test.local','Etkinlik','Etkinlik açıklaması','social','2026-10-01');
    INSERT INTO campus_price_reports (id,university_id,reporter_email,place_name,item_name,category,price_cents,observed_at) VALUES ('price','campus','student@test.local','Kafe','Kahve','drink',7500,'2026-09-05');`);
  const response = await f.admin.GET(f.request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(
    data.content.find((item) => item.id === "first-day").review_text,
    long,
  );
  for (const type of ["place", "event", "price"])
    assert.ok(data.content.some((item) => item.entity_type === type));
  assert.ok(
    data.content
      .find((item) => item.entity_type === "price")
      .review_text.includes("75.00 TL"),
  );
  assert.ok(
    data.content.every((item) => item.entity_type !== "direct-message"),
  );
});
test("report decisions apply to the selected record and preserve reasons in audit", async (t) => {
  const f = fixture(t);
  f.database.exec(
    `INSERT INTO content_reports (id,reporter_email,entity_type,entity_id,reason) VALUES ('report-a','student@test.local','post','first-day','spam'), ('report-b','student@test.local','post','first-day','other');`,
  );
  const response = await f.admin.POST(
    f.request({
      action: "decide-report",
      id: "report-a",
      moderationState: "hide",
      decision: "Doğrulanan spam içeriği.",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    f.database
      .prepare("SELECT status FROM content_reports WHERE id='report-a'")
      .get().status,
    "resolved",
  );
  assert.equal(
    f.database
      .prepare("SELECT status FROM content_reports WHERE id='report-b'")
      .get().status,
    "open",
  );
  assert.ok(
    f.database
      .prepare("SELECT deleted_at FROM posts WHERE id='first-day'")
      .get().deleted_at,
  );
  assert.equal(f.logs[0].detail.decision, "Doğrulanan spam içeriği.");
  assert.equal(
    (
      await f.admin.POST(
        f.request({
          action: "decide-report",
          id: "report-a",
          moderationState: "none",
          decision: "Tekrarlanan karar.",
        }),
      )
    ).status,
    404,
  );
});
test("content and account mutations require a reason and missing targets cannot claim success", async (t) => {
  const f = fixture(t);
  assert.equal(
    (
      await f.admin.POST(
        f.request({
          action: "moderate-content",
          entityType: "post",
          id: "first-day",
          state: "hide",
          reason: "x",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.admin.POST(
        f.request({
          action: "moderate-content",
          entityType: "post",
          id: "absent",
          state: "hide",
          reason: "Geçerli gerekçe",
        }),
      )
    ).status,
    404,
  );
  for (const status of ["suspended", "active"]) {
    assert.equal(
      (
        await f.admin.POST(
          f.request({
            action: "set-user-status",
            id: "student",
            status,
            reason: "Hesap incelemesi tamamlandı.",
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      f.database
        .prepare("SELECT status FROM users WHERE public_id='student'")
        .get().status,
      status,
    );
  }
  assert.equal(f.logs.length, 2);
});
