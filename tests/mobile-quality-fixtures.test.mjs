import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMobileQualityFixtures, FIXTURE_LABEL, FIXTURE_NOW } from "../scripts/mobile-quality/fixtures.mjs";

test("F00 generation is deterministic, independent and does not use network, randomness or current time", (t) => {
  const unexpected = () => { throw new Error("Unexpected external or nondeterministic operation"); };
  t.mock.method(globalThis, "fetch", unexpected);
  t.mock.method(Math, "random", unexpected);
  t.mock.method(Date, "now", unexpected);
  const first = createMobileQualityFixtures();
  const second = createMobileQualityFixtures();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.now, FIXTURE_NOW);
  first.profiles.empty.displayName = "local test mutation";
  first.posts[0].media[0].width = 1;
  assert.ok(second.profiles.empty.displayName.startsWith(FIXTURE_LABEL));
  assert.equal(second.posts[0].media[0].width, 640);
  assert.equal(first.media.images[0].width, 640, "a post must not mutate its catalog image");
});

test("default volume, IDs, ordering and related counters describe a coherent 200-post/100-message dataset", () => {
  const f = createMobileQualityFixtures();
  assert.equal(f.posts.length, 200);
  assert.equal(f.messages.length, 100);
  assert.equal(new Set(f.posts.map((post) => post.id)).size, 200);
  assert.equal(new Set(f.messages.map((message) => message.id)).size, 100);
  assert.equal(new Set([...f.posts, ...f.messages].map((item) => item.id)).size, 300);
  for (const profile of Object.values(f.profiles)) {
    assert.equal(profile.postCount, f.posts.filter((post) => post.authorId === profile.publicId).length);
    assert.match(profile.email, /^synthetic-.*@example\.invalid$/);
    assert.ok(profile.displayName.startsWith(FIXTURE_LABEL));
  }
  assert.equal(f.profiles.empty.postCount, 0);
  assert.equal(f.profiles.empty.avatarUrl, null);
  assert.equal(f.profiles.empty.bio, "");
  assert.equal(f.profiles.populated.postCount, 100);
  for (let i = 1; i < f.posts.length; i++) {
    const previous = f.posts[i - 1];
    const current = f.posts[i];
    assert.ok(previous.createdAt > current.createdAt || (previous.createdAt === current.createdAt && previous.id > current.id));
  }
  assert.equal(f.posts[0].createdAt, f.posts[1].createdAt, "cursor boundary ties must be represented");
  for (let i = 1; i < f.messages.length; i++) assert.ok(f.messages[i - 1].createdAt <= f.messages[i].createdAt);
  assert.equal(f.messages[0].createdAt, f.messages[1].createdAt);
  assert.equal(f.conversations[0].preview, f.messages.at(-1).body);
  assert.equal(f.conversations[0].unreadCount, f.messages.filter((message) => !message.own && !message.read).length);
  assert.ok([...f.posts.map((post) => post.text), ...f.messages.map((message) => message.body)].every((text) => text.startsWith(FIXTURE_LABEL)));
});

test("Turkish, multiline, unbroken and HTML-looking content stays literal and visibly synthetic", () => {
  const f = createMobileQualityFixtures();
  assert.match(f.textCases.longName, /İlknur Şükran Çağla Öztürk Çalışkan/);
  assert.ok(f.textCases.longName.length > 40);
  for (const letter of ["İ", "ı", "Ş", "ş", "Ğ", "ğ", "Ü", "ü", "Ö", "ö", "Ç", "ç"]) assert.ok(f.textCases.longText.includes(letter), letter);
  assert.ok(f.textCases.unbroken.split(" ").at(-1).length > 150);
  assert.ok(f.posts.some((post) => post.text.includes("\n\n")));
  assert.ok(f.posts.some((post) => post.text.includes('<script>alert("synthetic")</script>')));
  assert.ok(f.messages.some((message) => message.body.includes("👩🏽‍🎓")));
});

test("ratio fixtures are self-contained labelled measurement images and honest video descriptors", () => {
  const f = createMobileQualityFixtures();
  assert.deepEqual(new Set(f.media.images.map((image) => image.ratio)), new Set(["1:1", "4:5", "9:16", "16:9", "4:1"]));
  for (const image of f.media.images) {
    assert.ok(image.url.startsWith("data:image/svg+xml;charset=utf-8,"));
    const svg = decodeURIComponent(image.url.split(",")[1]);
    assert.ok(svg.includes(`width="${image.width}" height="${image.height}"`));
    assert.ok(svg.includes("SYNTHETIC"));
    assert.ok(svg.includes(`${image.width}x${image.height}`));
    assert.doesNotMatch(svg, /<script|<image|href=|@import/);
    const [x, y] = image.ratio.split(":").map(Number);
    assert.equal(image.width * y, image.height * x);
    assert.equal(image.measurementOnly, true);
  }
  assert.deepEqual(f.media.videos.map((video) => video.ratio), ["9:16", "16:9"]);
  assert.ok(f.media.videos.every((video) => video.url === null && video.availability === "metadata-only"));
  assert.ok(f.posts.flatMap((post) => post.media).every((media) => media.kind === "image" && media.url.startsWith("data:")));
});

test("first use, empty search, loading, network failure and missing source remain distinguishable", () => {
  const { scenarios } = createMobileQualityFixtures();
  assert.notEqual(scenarios.firstUse.reason, scenarios.filteredEmpty.reason);
  assert.equal(scenarios.loading.data, null);
  assert.equal(scenarios.networkError.status, null);
  assert.equal(scenarios.networkError.retryable, true);
  assert.equal(scenarios.missingSource.status, 404);
  assert.equal(scenarios.missingSource.retryable, false);
  assert.equal(scenarios.brokenImage.availability, "intentionally-invalid");
});

test("optional product assets resolve to existing local image files without claiming a verified license", async () => {
  const f = createMobileQualityFixtures();
  assert.equal(f.media.existingProductAssets.length, 7);
  for (const asset of f.media.existingProductAssets) {
    assert.match(asset.url, /^\/(social-live|course-covers)\/[a-z-]+\.(webp|jpg)$/);
    assert.ok(asset.alt.startsWith(FIXTURE_LABEL));
    assert.equal(asset.syntheticUsage, true);
    assert.match(asset.provenance, /license not verified/);
    const bytes = await readFile(new URL(`../public${asset.url}`, import.meta.url));
    if (asset.contentType === "image/webp") {
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    } else assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
});

test("seed namespaces and bounded custom volumes support isolated repeatable runs, including zero", () => {
  const a = createMobileQualityFixtures({ seed: "run-a", postCount: 1, messageCount: 1 });
  const b = createMobileQualityFixtures({ seed: "run-b", postCount: 1, messageCount: 1 });
  assert.notEqual(a.posts[0].id, b.posts[0].id);
  assert.notEqual(a.profiles.empty.email, b.profiles.empty.email);
  const empty = createMobileQualityFixtures({ postCount: 0, messageCount: 0 });
  assert.deepEqual(empty.posts, []);
  assert.deepEqual(empty.messages, []);
  assert.deepEqual(empty.conversations, []);
  for (const invalid of [-1, 1.5, NaN, Infinity, 5001, "100", null]) {
    assert.throws(() => createMobileQualityFixtures({ postCount: invalid }), RangeError);
    assert.throws(() => createMobileQualityFixtures({ messageCount: invalid }), RangeError);
  }
  for (const seed of ["", "../live", "Üretim", "<svg>", "a".repeat(33), 42]) assert.throws(() => createMobileQualityFixtures({ seed }), TypeError);
});

const root = new URL("../", import.meta.url);
const migrationDirectory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const sources = Object.fromEntries(await Promise.all([
  "lib/server-api.ts", "lib/profile.ts", "lib/post-media.ts", "app/api/profile/content/route.ts",
].map(async (path) => [path, ts.transpileModule(await readFile(new URL(path, root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText])));

function loadModule(path, dependencies = {}) {
  const exports = {};
  runInNewContext(sources[path], {
    exports, URL, URLSearchParams, Response, Uint8Array, DataView, TextDecoder,
    require(name) {
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    },
  }, { filename: path });
  return exports;
}

test("the existing real profile GET reads generated rows from a fresh in-memory DB without live API mutations", async (t) => {
  const f = createMobileQualityFixtures();
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  assert.equal(database.prepare("PRAGMA database_list").get().file, "");
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  database.prepare("INSERT INTO universities (id, name, short_name, city) VALUES (?, ?, ?, ?)").run(f.university.id, f.university.name, f.university.shortName, f.university.city);
  database.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run(f.department.id, f.department.name);
  for (const profile of Object.values(f.profiles)) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(profile.email, profile.publicId, profile.displayName, profile.handle);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year) VALUES (?, ?, ?, ?)").run(profile.email, profile.universityId, profile.departmentId, profile.classYear);
  }
  for (const post of f.posts) database.prepare("INSERT INTO posts (id, author_email, content, audience, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(post.id, post.authorEmail, post.text, post.audience, post.createdAt, post.updatedAt);
  // Deliberately seed only route-relevant rows; layout SVGs are not upload media.
  const DB = { prepare(query) { return { bind(...values) { return {
    async first() { return database.prepare(query).get(...values) ?? null; },
    async all() { return { results: database.prepare(query).all(...values) }; },
  }; } }; } };
  const server = loadModule("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser: async () => ({ email: f.profiles.populated.email }) } });
  const route = loadModule("app/api/profile/content/route.ts", {
    "../../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) },
    "../../../../lib/profile": loadModule("lib/profile.ts"),
    "../../../../lib/post-media": loadModule("lib/post-media.ts"),
  });
  const request = (person, cursor) => route.GET(new Request(`https://example.invalid/api/profile/content?${new URLSearchParams({ user: person.publicId, tab: "posts", ...(cursor ? { cursor } : {}) })}`));
  for (const person of Object.values(f.profiles)) {
    const received = [];
    const cursors = new Set();
    let cursor;
    do {
      const response = await request(person, cursor);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(body.posts.length <= 12);
      received.push(...body.posts);
      cursor = body.nextCursor;
      if (cursor) { assert.ok(!cursors.has(cursor), "cursor must advance"); cursors.add(cursor); }
      assert.ok(cursors.size <= 20, "bounded pagination must terminate");
    } while (cursor);
    const expected = f.posts.filter((post) => post.authorId === person.publicId);
    if (expected.length > 12) assert.ok(expected.some((post, index) => index > 0 && index % 12 === 0 && post.createdAt === expected[index - 1].createdAt), "the real route must paginate through same-author timestamp ties");
    assert.deepEqual(received.map((post) => post.id), expected.map((post) => post.id));
    assert.deepEqual(received.map((post) => post.text), expected.map((post) => post.text));
    assert.ok(received.every((post) => post.name.startsWith(FIXTURE_LABEL)));
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM posts").get().n, 200);
});
