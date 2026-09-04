import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  const DB = {
    prepare(query) {
      return { bind(...values) {
        return {
          async first() { return database.prepare(query).get(...values) ?? null; },
          async all() { return { results: database.prepare(query).all(...values) }; },
        };
      } };
    },
  };
  let signedIn = "viewer@test.local";
  const server = loadModule("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser: async () => signedIn ? { email: signedIn } : null } });
  const route = loadModule("app/api/profile/content/route.ts", {
    "../../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) },
    "../../../../lib/profile": loadModule("lib/profile.ts"),
    "../../../../lib/post-media": loadModule("lib/post-media.ts"),
  });
  database.exec(`
    INSERT INTO universities (id, name, short_name, city) VALUES ('campus', 'University', 'UNI', 'City'), ('outside', 'Other', 'OTH', 'City');
    INSERT INTO departments (id, name) VALUES ('department', 'Computer Engineering');
    INSERT INTO courses (id, department_id, code, name) VALUES ('course', 'department', 'CS101', 'Computer Science');
  `);
  for (const [id, campus] of [["viewer", "campus"], ["author", "campus"], ["other", "campus"], ["outside", "outside"]]) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(`${id}@test.local`, id, `${id} Student`, id);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year) VALUES (?, ?, 'department', 1)").run(`${id}@test.local`, campus);
  }
  const insertPost = (id, { author = "author", community = null, deleted = null, date = "2026-09-04 10:00:00" } = {}) => {
    database.prepare("INSERT INTO posts (id, author_email, community_id, content, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, `${author}@test.local`, community, `Content ${id}`, date, date, deleted);
  };
  const insertCommunity = (id, { policy = "open", campus = "campus", status = "active", moderation = "active", memberStatus = "active" } = {}) => {
    database.prepare("INSERT INTO communities (id, creator_email, university_id, name, slug, join_policy, status, moderation_status) VALUES (?, 'author@test.local', ?, ?, ?, ?, ?, ?)").run(id, campus, id, id, policy, status, moderation);
    database.prepare("INSERT INTO community_members (community_id, user_email, status) VALUES (?, 'author@test.local', ?)").run(id, memberStatus);
  };
  return {
    database, insertPost, insertCommunity,
    signIn(id) { signedIn = id ? `${id}@test.local` : null; },
    async request(query = "") { return route.GET(new Request(`https://uniyra.test/api/profile/content?${query}`)); },
  };
}

test("profile post pagination reaches the entire author history and filters persisted media", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 21; index++) f.insertPost(`post-${String(index).padStart(2, "0")}`);
  for (let index = 0; index < 30; index++) f.insertPost(`other-${index}`, { author: "other", date: "2026-09-04 12:00:00" });
  f.insertPost("deleted", { deleted: "2026-09-04 11:00:00" });
  for (const [id, postId, kind] of [["photo", "post-00", "image"], ["clip", "post-01", "video"]]) {
    f.database.prepare("INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size) VALUES (?, ?, ?, ?, ?, ?, 100)").run(id, postId, kind, id, id, kind === "image" ? "image/png" : "video/mp4");
  }
  const response = await f.request("user=author&tab=posts");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const first = await response.json();
  assert.equal(first.posts.length, 12);
  assert.ok(first.nextCursor);
  const second = await (await f.request(`user=author&tab=posts&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  assert.equal(second.posts.length, 9);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.posts, ...second.posts].map((post) => post.id)).size, 21);
  assert.ok([...first.posts, ...second.posts].every((post) => post.authorId === "author"));
  const images = await (await f.request("user=author&tab=images")).json();
  const videos = await (await f.request("user=author&tab=videos")).json();
  assert.deepEqual(images.posts.map((post) => post.id), ["post-00"]);
  assert.equal(images.posts[0].media[0].url, "/api/posts/media?id=photo");
  assert.deepEqual(videos.posts.map((post) => post.id), ["post-01"]);
  f.signIn("author");
  assert.equal((await (await f.request()).json()).posts.length, 12);
});

test("profile content refuses guests, incomplete profiles, other campuses, blocks, and invalid cursors", async (t) => {
  const f = fixture(t);
  f.signIn(null);
  assert.equal((await f.request("user=author")).status, 401);
  f.signIn("viewer");
  assert.equal((await f.request("user=outside")).status, 404);
  assert.equal((await f.request("user=missing")).status, 404);
  assert.equal((await f.request("user=author&tab=unknown")).status, 400);
  assert.equal((await f.request("user=author&cursor=bad")).status, 400);
  assert.equal((await f.request("user=author&cursor=invalid-date::id")).status, 400);
  f.database.prepare("UPDATE student_profiles SET onboarding_completed = 0 WHERE user_email = 'viewer@test.local'").run();
  assert.equal((await f.request("user=author")).status, 409);
  f.database.prepare("UPDATE student_profiles SET onboarding_completed = 1 WHERE user_email = 'viewer@test.local'").run();
  for (const [blocker, blocked] of [["viewer", "author"], ["author", "viewer"]]) {
    f.database.prepare("INSERT INTO user_blocks (blocker_email, blocked_email) VALUES (?, ?)").run(`${blocker}@test.local`, `${blocked}@test.local`);
    for (const tab of ["posts", "images", "videos", "notes", "communities"]) assert.equal((await f.request(`user=author&tab=${tab}`)).status, 404);
    f.database.exec("DELETE FROM user_blocks");
  }
});

test("profile notes expose published notes to peers and pending notes only to their author", async (t) => {
  const f = fixture(t);
  for (const [id, status, owner, deleted] of [["published", "published", "author", null], ["processing", "processing", "author", null], ["rejected", "rejected", "author", null], ["deleted", "published", "author", "2026-09-04"], ["other-note", "published", "other", null]]) {
    f.database.prepare("INSERT INTO notes (id, owner_email, course_id, title, object_key, original_file_name, content_type, byte_size, status, deleted_at) VALUES (?, ?, 'course', ?, ?, 'note.pdf', 'application/pdf', 100, ?, ?)").run(id, `${owner}@test.local`, id, id, status, deleted);
  }
  const peer = await (await f.request("user=author&tab=notes")).json();
  assert.deepEqual(peer.notes.map((note) => note.id), ["published"]);
  assert.equal(peer.notes[0].own, false);
  assert.equal(peer.notes[0].fileUrl, "/api/notes/file?id=published");
  f.signIn("author");
  const own = await (await f.request("tab=notes")).json();
  assert.deepEqual(own.notes.map((note) => note.id).sort(), ["processing", "published", "rejected"]);
  assert.ok(own.notes.every((note) => note.own));
});

test("profile communities and their posts honor membership, moderation, archive and ban visibility", async (t) => {
  const f = fixture(t);
  for (const [id, options] of [["open", {}], ["private", { policy: "request" }], ["archived", { status: "archived" }], ["hidden", { moderation: "hidden" }], ["outside-community", { campus: "outside" }], ["pending", { memberStatus: "pending" }], ["banned", {}]]) {
    f.insertCommunity(id, options);
    f.insertPost(`post-${id}`, { community: id });
  }
  f.database.prepare("INSERT INTO community_bans (community_id, user_email, banned_by_email) VALUES ('banned', 'viewer@test.local', 'author@test.local')").run();
  const communities = await (await f.request("user=author&tab=communities")).json();
  assert.deepEqual(communities.communities.map((community) => community.id), ["open"]);
  const posts = await (await f.request("user=author&tab=posts")).json();
  assert.deepEqual(posts.posts.map((post) => post.id).sort(), ["post-open", "post-pending"]);
  f.database.prepare("INSERT INTO community_members (community_id, user_email, status) VALUES ('private', 'viewer@test.local', 'active')").run();
  const joinedCommunities = await (await f.request("user=author&tab=communities")).json();
  assert.deepEqual(joinedCommunities.communities.map((community) => community.id).sort(), ["open", "private"]);
  assert.equal(joinedCommunities.communities.find((community) => community.id === "private").joined, true);
  const joinedPosts = await (await f.request("user=author&tab=posts")).json();
  assert.ok(joinedPosts.posts.some((post) => post.id === "post-private"));
});

test("cross-campus profile galleries contain only public standalone posts and preserve private tabs", async (t) => {
  const f = fixture(t);
  f.insertPost('legacy'); f.insertPost('global-photo'); f.insertPost('global-video');
  f.database.exec(`
    UPDATE posts SET audience = 'platform' WHERE id IN ('global-photo', 'global-video');
    INSERT INTO post_media (id, post_id, kind, object_key, original_file_name, content_type, byte_size) VALUES
      ('photo', 'global-photo', 'image', 'photo', 'photo.png', 'image/png', 100),
      ('clip', 'global-video', 'video', 'clip', 'clip.mp4', 'video/mp4', 100);
  `);
  f.signIn('outside');
  const profile = await f.request('user=author&tab=posts');
  assert.equal(profile.status, 200);
  assert.deepEqual(new Set((await profile.json()).posts.map(p => p.id)), new Set(['global-photo', 'global-video']));
  assert.deepEqual((await (await f.request('user=author&tab=images')).json()).posts.map(p => p.id), ['global-photo']);
  assert.deepEqual((await (await f.request('user=author&tab=videos')).json()).posts.map(p => p.id), ['global-video']);
  assert.equal((await (await f.request('user=author&tab=notes')).json()).notes.length, 0);
  assert.equal((await (await f.request('user=author&tab=communities')).json()).communities.length, 0);
  f.database.exec("UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE audience = 'platform'");
  assert.equal((await f.request('user=author&tab=posts')).status, 404);
});
