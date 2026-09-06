import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as drizzleOrm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";

const root = new URL("../", import.meta.url);
const migrationDirectory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, root), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const [helperSource, routeSource, postsSource, schemaSource, profileSource] = await Promise.all([
  compile("lib/post-media.ts"), compile("app/api/posts/media/route.ts"), compile("app/api/posts/route.ts"), compile("db/schema.ts"), compile("lib/profile.ts"),
]);
const schema = {};
runInNewContext(schemaSource, { exports: schema, require: (path) => path === "drizzle-orm" ? drizzleOrm : sqliteCore });
const profileHelpers = {};
runInNewContext(profileSource, { exports: profileHelpers });

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  database.exec(`
    INSERT INTO universities (id, name, short_name, city) VALUES ('campus', 'University', 'UNI', 'City'), ('outside', 'Other', 'OTH', 'City');
    INSERT INTO departments (id, name) VALUES ('department', 'Computer Engineering');
  `);
  for (const [id, campus] of [["author", "campus"], ["viewer", "campus"], ["outsider", "outside"]]) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(`${id}@test.local`, id, id, id);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year) VALUES (?, ?, 'department', 1)").run(`${id}@test.local`, campus);
  }
  database.exec(`
    INSERT INTO posts (id, author_email, content) VALUES ('post', 'author@test.local', 'A shared clip');
    INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size)
      VALUES ('media', 'post', 'video', 'private-object', 'kampüs.mp4', 'video/mp4', 10);
  `);
  let identity = "viewer@test.local";
  let reads = 0;
  const DB = { prepare(query) { return { bind(...values) { return {
    async first() { return database.prepare(query).get(...values) ?? null; },
    async all() { return { results: database.prepare(query).all(...values) }; },
    async raw() { const statement = database.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
  }; } }; } };
  const FILES = { async get(key, options) {
    reads++;
    assert.equal(key, "private-object");
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const range = options?.range;
    return { body: new Blob([range ? bytes.slice(range.offset, range.offset + range.length) : bytes]).stream() };
  } };
  const helpers = {};
  runInNewContext(helperSource, { exports: helpers, Uint8Array, TextDecoder, DataView });
  const route = {};
  const serverHelpers = {
    requireIdentity: async () => identity ? { email: identity } : null,
    getRuntime: async () => ({ DB, FILES }),
    signInResponse: () => Response.json({ error: "Sign in" }, { status: 401 }),
    unavailableResponse: (error) => { throw error; },
  };
  runInNewContext(routeSource, {
    exports: route, URL, Response, Headers,
    require(path) {
      if (path === "../../../../lib/post-media") return helpers;
      if (path === "../../../../lib/server-api") return serverHelpers;
      throw new Error(`Unexpected dependency ${path}`);
    },
  });
  const postsRoute = {};
  runInNewContext(postsSource, {
    exports: postsRoute, URL, Response,
    require(path) {
      const dependencies = {
        "drizzle-orm": drizzleOrm,
        "../../chatgpt-auth": { getChatGPTUser: serverHelpers.requireIdentity },
        "../../../db": { getDb: async () => drizzle(DB, { schema }) },
        "../../../db/schema": schema,
        "../../../lib/server-api": serverHelpers,
        "../../../lib/profile": profileHelpers,
        "../../../lib/app-auth": {},
        "../../../lib/post-media": helpers,
        "../../../lib/post-idempotency": {},
      };
      assert.ok(path in dependencies, `Unexpected dependency ${path}`);
      return dependencies[path];
    },
  });
  return {
    database, reads: () => reads,
    signIn(id) { identity = id ? `${id}@test.local` : null; },
    request(headers = {}, method = "GET") { return route[method](new Request("https://uniyra.test/api/posts/media?id=media", { headers, method })); },
    postRequest(query = "") { return postsRoute.GET(new Request(`https://uniyra.test/api/posts?${query}`)); },
  };
}

test("post media authenticates every request and revokes access for blocks, campus changes and deletion", async (t) => {
  const f = fixture(t);
  f.signIn(null);
  assert.equal((await f.request()).status, 401);
  f.signIn("outsider");
  assert.equal((await f.request()).status, 404);
  assert.equal(f.reads(), 0);
  f.signIn("viewer");
  const visible = await f.request();
  assert.equal(visible.status, 200);
  assert.equal(visible.headers.get("cache-control"), "private, no-store");
  assert.equal(visible.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual([...new Uint8Array(await visible.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  f.database.exec("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('author@test.local', 'viewer@test.local')");
  assert.equal((await f.request()).status, 404);
  f.database.exec("DELETE FROM user_blocks; UPDATE student_profiles SET university_id = 'outside' WHERE user_email = 'viewer@test.local'");
  assert.equal((await f.request()).status, 404);
  f.database.exec("UPDATE student_profiles SET university_id = 'campus' WHERE user_email = 'viewer@test.local'; UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = 'post'");
  assert.equal((await f.request()).status, 404);
  assert.equal(f.reads(), 1);
});

test("private community membership, bans and moderation apply to existing media URLs", async (t) => {
  const f = fixture(t);
  f.database.exec(`
    INSERT INTO communities (id, creator_email, university_id, name, slug, join_policy) VALUES ('club', 'author@test.local', 'campus', 'Private club', 'club', 'approval');
    UPDATE posts SET community_id = 'club' WHERE id = 'post';
  `);
  assert.equal((await f.request()).status, 404);
  f.database.exec("INSERT INTO community_members (community_id, user_email) VALUES ('club', 'viewer@test.local')");
  assert.equal((await f.request()).status, 200);
  f.database.exec("UPDATE community_members SET status = 'pending' WHERE user_email = 'viewer@test.local'");
  assert.equal((await f.request()).status, 404);
  f.database.exec("UPDATE community_members SET status = 'active'; INSERT INTO community_bans (community_id, user_email, banned_by_email) VALUES ('club', 'viewer@test.local', 'author@test.local')");
  assert.equal((await f.request()).status, 404);
  f.database.exec("DELETE FROM community_bans; UPDATE communities SET moderation_status = 'suspended' WHERE id = 'club'");
  assert.equal((await f.request()).status, 404);
});

test("media GET and HEAD honor single byte ranges and reject invalid ranges before storage access", async (t) => {
  const f = fixture(t);
  const partial = await f.request({ range: "bytes=2-5" });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(partial.headers.get("content-length"), "4");
  assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())], [2, 3, 4, 5]);
  const suffix = await f.request({ range: "bytes=-3" });
  assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())], [7, 8, 9]);
  const head = await f.request({}, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const reads = f.reads();
  const rejected = await f.request({ range: "bytes=10-" });
  assert.equal(rejected.status, 416);
  assert.equal(rejected.headers.get("content-range"), "bytes */10");
  assert.equal(f.reads(), reads);
});

test("public community visibility preserves shared-post IDs and feed campus, deletion and filter conditions", async (t) => {
  const f = fixture(t);
  f.database.exec(`
    INSERT INTO communities (id, creator_email, university_id, name, slug, join_policy) VALUES ('club', 'author@test.local', 'campus', 'Public club', 'club', 'open');
    INSERT INTO posts (id, author_email, community_id, content) VALUES ('visible-community', 'author@test.local', 'club', 'Visible public community post');
    INSERT INTO posts (id, author_email, community_id, content, deleted_at) VALUES ('deleted-community', 'author@test.local', 'club', 'Deleted post', CURRENT_TIMESTAMP);
    INSERT INTO posts (id, author_email, community_id, content) VALUES ('outside-community', 'outsider@test.local', 'club', 'Other campus post');
  `);
  const shared = await (await f.postRequest("id=post")).json();
  assert.equal(shared.post.id, "post");
  assert.equal(shared.post.media[0].id, "media");
  assert.equal((await f.postRequest("id=missing")).status, 404);
  assert.equal((await f.postRequest("id=deleted-community")).status, 404);
  assert.equal((await f.postRequest("id=outside-community")).status, 404);
  const feed = await (await f.postRequest("feed=campus")).json();
  assert.deepEqual(new Set(feed.posts.map((post) => post.id)), new Set(["post", "visible-community"]));
  assert.equal((await (await f.postRequest("feed=following")).json()).posts.length, 0);
  assert.equal((await (await f.postRequest("feed=saved")).json()).posts.length, 0);
  f.database.exec("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('author@test.local', 'viewer@test.local')");
  assert.equal((await (await f.postRequest("feed=campus")).json()).posts.length, 0);
  assert.equal((await f.postRequest("id=visible-community")).status, 404);
});

test("general feed spans universities while legacy posts retain the campus audience", async (t) => {
  const f = fixture(t);
  assert.equal(f.database.prepare("SELECT audience FROM posts WHERE id = 'post'").get().audience, "campus");
  f.database.exec(`INSERT INTO posts (id, author_email, content, audience) VALUES
    ('local-public', 'author@test.local', 'Shared locally', 'platform'),
    ('outside-public', 'outsider@test.local', 'Shared globally', 'platform'),
    ('outside-private', 'outsider@test.local', 'Campus only', 'campus');`);
  const ids = async (query) => new Set((await (await f.postRequest(query)).json()).posts.map((p) => p.id));
  assert.deepEqual(await ids('feed=all'), new Set(['local-public', 'outside-public']));
  assert.deepEqual(await ids('feed=campus'), new Set(['post', 'local-public']));
  assert.equal((await f.postRequest('id=outside-public')).status, 200);
  assert.equal((await f.postRequest('id=outside-private')).status, 404);
  f.database.exec("INSERT INTO user_follows (follower_email, following_email) VALUES ('viewer@test.local', 'outsider@test.local')");
  assert.deepEqual(await ids('feed=following'), new Set(['outside-public']));
  f.database.exec("INSERT INTO post_saves (post_id, user_email) VALUES ('outside-public', 'viewer@test.local'), ('outside-private', 'viewer@test.local')");
  assert.deepEqual(await ids('feed=saved'), new Set(['outside-public']));
  f.database.exec("INSERT INTO user_mutes (muter_email, muted_email) VALUES ('viewer@test.local', 'outsider@test.local')");
  assert.deepEqual(await ids('feed=all'), new Set(['local-public']));
  f.database.exec("DELETE FROM user_mutes; INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('outsider@test.local', 'viewer@test.local')");
  assert.equal((await f.postRequest('id=outside-public')).status, 404);
  assert.deepEqual(await ids('feed=following'), new Set());
});

test("a platform label cannot expose a course or community post across universities", async (t) => {
  const f = fixture(t);
  f.database.exec(`
    INSERT INTO courses (id, department_id, code, name) VALUES ('course', 'department', 'CS', 'Course');
    INSERT INTO communities (id, creator_email, university_id, name, slug, join_policy) VALUES ('club', 'author@test.local', 'campus', 'Club', 'club', 'open');
    UPDATE posts SET audience = 'platform', community_id = 'club' WHERE id = 'post';
  `);
  f.signIn('outsider');
  assert.equal((await f.request()).status, 404);
  assert.equal((await f.postRequest('id=post')).status, 404);
  assert.equal((await (await f.postRequest('feed=all')).json()).posts.length, 0);
  f.database.exec("UPDATE posts SET community_id = NULL, course_id = 'course' WHERE id = 'post'");
  assert.equal((await f.request()).status, 404);
  assert.equal((await f.postRequest('id=post')).status, 404);
  f.database.exec("UPDATE posts SET course_id = NULL WHERE id = 'post'");
  assert.equal((await f.request()).status, 200);
  assert.equal((await f.postRequest('id=post')).status, 200);
});

test("platform video streams cross-campus and access is revoked for deletion, blocks and inactive authors", async (t) => {
  const f = fixture(t);
  f.database.exec("UPDATE posts SET audience = 'platform' WHERE id = 'post'");
  f.signIn('outsider');
  const response = await f.request({ range: 'bytes=2-5' });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3, 4, 5]);
  f.database.exec("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES ('author@test.local', 'outsider@test.local')");
  assert.equal((await f.request()).status, 404);
  f.database.exec("DELETE FROM user_blocks; UPDATE users SET status = 'suspended' WHERE public_id = 'author'");
  assert.equal((await f.request()).status, 404);
  assert.equal((await f.postRequest('id=post')).status, 404);
  f.database.exec("UPDATE users SET status = 'active'; UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = 'post'");
  assert.equal((await f.request()).status, 404);
});

test("mixed-university general pagination is chronological and contains no campus-only posts or duplicates", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 31; i++) {
    f.database.prepare("INSERT INTO posts (id, author_email, content, audience, created_at) VALUES (?, ?, 'Pagination', ?, ?)")
      .run(`page-${String(i).padStart(2, '0')}`, i % 2 ? 'author@test.local' : 'outsider@test.local', i % 3 ? 'platform' : 'campus', `2026-09-04 10:00:${String(i).padStart(2, '0')}`);
  }
  f.database.exec("INSERT INTO user_follows (follower_email, following_email) VALUES ('viewer@test.local', 'outsider@test.local')");
  const all = [];
  let cursor = '';
  do {
    const page = await (await f.postRequest(`feed=all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json();
    all.push(...page.posts.map((p) => p.id)); cursor = page.nextCursor;
  } while (cursor);
  const expected = Array.from({ length:31 }, (_, i) => i).filter(i => i % 3).reverse().map(i => `page-${String(i).padStart(2, '0')}`);
  assert.deepEqual(all, expected);
});
