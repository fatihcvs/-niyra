import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createMobileQualityFixtures } from "../scripts/mobile-quality/fixtures.mjs";

const root = new URL("../", import.meta.url);
async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const exports = {};
runInNewContext(await compile("lib/profile-content-state.ts"), { exports, AbortController, Error });
const { createProfileContentState } = exports;
const fixture = createMobileQualityFixtures();
const post = (id, changes = {}) => ({ ...fixture.posts[0], id, text: `Post ${id}`, media: [], ...changes });
const page = (ids, nextCursor = null) => ({ posts: ids.map((id) => typeof id === "string" ? post(id) : id), notes: [], communities: [], nextCursor });
const plain = (value) => JSON.parse(JSON.stringify(value));

test("profile image and video preview errors expose a labelled fallback while valid media stays visible", async () => {
  const source = await readFile(new URL("app/profile-content.tsx", root), "utf8");
  const syntax = ts.createSourceFile("profile-content.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "ProfileMediaPreview").getText(syntax);
  function preview(kind) {
    let failed = false;
    const context = {
      React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: "fragment" },
      useState: () => [failed, (value) => { failed = value; }], useCallback: (callback) => callback,
      ImageSquare: "ImageSquare", FilmStrip: "FilmStrip", Play: "Play",
    };
    const code = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    runInNewContext(`${code}\nthis.preview = ProfileMediaPreview;`, context);
    return () => context.preview({ kind, url: "/synthetic-test-image", alt: "[SYNTHETIC] Preview" });
  }
  for (const dimensions of [{ complete: true, naturalWidth: 0, naturalHeight: 0 }, { complete: true, naturalWidth: 1, naturalHeight: 1 }]) {
    const render = preview("image"); render().props.ref(dimensions);
    assert.equal(render().props.role, "img"); assert.equal(render().props["aria-label"], "Görsel önizlemesi yüklenemedi");
  }
  const valid = preview("image"); valid().props.ref({ complete: true, naturalWidth: 900, naturalHeight: 1200 });
  assert.equal(valid().type, "img"); assert.equal(valid().props.alt, "[SYNTHETIC] Preview");
  valid().props.onError(); assert.equal(valid().props.role, "img");
  const video = preview("video"); const native = video().props.children[0];
  assert.equal(native.type, "video"); assert.equal(native.props.preload, "metadata");
  native.props.onError(); assert.equal(video().props["aria-label"], "Video önizlemesi yüklenemedi");
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function controlled(options = {}) {
  const requests = [];
  const store = createProfileContentState({ ...options, loadPage(request) {
    const pending = deferred(); requests.push({ ...request, ...pending }); return pending.promise;
  } });
  store.setOwnerScope("viewer:1");
  const snapshot = (id = "person", scope = "viewer:1") => store.getSnapshot(scope, id);
  const tab = (name = "posts", id = "person", scope = "viewer:1") => snapshot(id, scope).tabs[name];
  return { store, requests, snapshot, tab };
}

test("root owner activation and new props can arrive in either order without read-time mutation or cross-account IO", async () => {
  let calls = 0;
  const store = createProfileContentState({ loadPage: async () => { calls++; return page(["one"]); } });
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  const before = store.getSnapshot("viewer:1", "person");
  assert.equal(before.active, false);
  assert.equal(store.getSnapshot("viewer:1", "person"), before, "snapshots are referentially stable");
  await store.load("viewer:1", "person", "posts");
  assert.equal(calls, 0);
  assert.equal(changes, 0, "render/getSnapshot must not initialize or notify the store");
  store.setOwnerScope("viewer:1");
  assert.equal(store.getSnapshot("viewer:1", "person").active, true);
  const afterActivation = changes;
  store.getSnapshot("viewer:1", "person");
  assert.equal(changes, afterActivation);
  await store.load("viewer:2", "person", "posts");
  assert.equal(calls, 0, "new props before new authoritative owner cannot issue a request");
  store.setOwnerScope("viewer:2");
  assert.equal(store.getSnapshot("viewer:1", "person").active, false);
  const detach = store.attach("viewer:2", "person");
  await store.load("viewer:2", "person", "posts");
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot("viewer:2", "person").tabs.posts.content.posts[0].id, "one");
  detach(); unsubscribe();
});

test("all six tab choices and loaded content survive unmount/revisit without refetching", async () => {
  const calls = [];
  const store = createProfileContentState({ loadPage: async ({ tab }) => {
    calls.push(tab);
    return { ...page(tab === "posts" || tab === "images" || tab === "videos" ? [tab] : []), notes: tab === "notes" ? [{ id: "note" }] : [], communities: tab === "communities" ? [{ id: "community" }] : [] };
  } });
  store.setOwnerScope("viewer:1");
  for (const tab of ["posts", "images", "videos", "notes", "communities", "about"]) {
    const detach = store.attach("viewer:1", "person");
    store.chooseTab("viewer:1", "person", tab);
    if (tab !== "about") await store.load("viewer:1", "person", tab);
    detach();
    const revisit = store.attach("viewer:1", "person");
    assert.equal(store.getSnapshot("viewer:1", "person").tab, tab);
    if (tab !== "about") await store.load("viewer:1", "person", tab);
    revisit();
  }
  assert.equal(calls.join(","), "posts,images,videos,notes,communities");
  const saved = store.getSnapshot("viewer:1", "person");
  assert.equal(saved.tabs.notes.content.notes[0].id, "note");
  assert.equal(saved.tabs.communities.content.communities[0].id, "community");
});

test("target A late responses cannot overwrite B or fill A after its view detached", async () => {
  const { store, requests, snapshot } = controlled();
  const closeA = store.attach("viewer:1", "a");
  const first = store.load("viewer:1", "a", "posts");
  closeA();
  const closeB = store.attach("viewer:1", "b");
  const second = store.load("viewer:1", "b", "posts");
  requests[1].resolve(page(["b-post"])); await second;
  requests[0].resolve(page(["a-private"])); await first;
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(snapshot("b").tabs.posts.content.posts[0].id, "b-post");
  assert.equal(snapshot("a").tabs.posts.loaded, false);
  closeB();
});

test("switching tabs rejects an old success and an old error even if transport ignores abort", async () => {
  for (const result of ["success", "failure"]) {
    const { store, requests, tab } = controlled();
    const detach = store.attach("viewer:1", "person");
    const old = store.load("viewer:1", "person", "posts");
    store.chooseTab("viewer:1", "person", "images");
    const current = store.load("viewer:1", "person", "images");
    requests[1].resolve(page(["image"])); await current;
    if (result === "success") requests[0].resolve(page(["old"])); else requests[0].reject(new Error("Old failure"));
    await old;
    assert.equal(tab("images").content.posts[0].id, "image");
    assert.equal(tab("images").error, "");
    assert.equal(tab().loaded, false);
    assert.equal(tab().error, "");
    detach();
  }
});

test("logout purges all accounts and a late response cannot resurrect data for the same target", async () => {
  const { store, requests, snapshot } = controlled();
  const closeOld = store.attach("viewer:1", "person");
  const old = store.load("viewer:1", "person", "notes");
  store.setOwnerScope(null);
  store.setOwnerScope("viewer:2");
  const closeNew = store.attach("viewer:2", "person");
  const current = store.load("viewer:2", "person", "notes");
  requests[0].resolve({ ...page([]), notes: [{ id: "private-old-note" }] }); await old;
  assert.equal(snapshot().active, false);
  assert.equal(snapshot("person", "viewer:2").tabs.notes.content.notes.length, 0);
  requests[1].resolve({ ...page([]), notes: [{ id: "new-note" }] }); await current;
  closeOld();
  assert.equal(requests[1].signal.aborted, false, "old cleanup cannot cancel a new session's request");
  assert.equal(snapshot("person", "viewer:2").tabs.notes.content.notes[0].id, "new-note");
  closeNew();
});

test("pagination deduplicates server overlap, preserves pages on error and retries the failed cursor", async () => {
  const { store, requests, tab } = controlled();
  const detach = store.attach("viewer:1", "person");
  let pending = store.load("viewer:1", "person", "posts");
  requests[0].resolve(page(["a", "b"], "cursor-1")); await pending;
  pending = store.load("viewer:1", "person", "posts", "more");
  const duplicateClick = store.load("viewer:1", "person", "posts", "more");
  await duplicateClick;
  assert.equal(requests.length, 2);
  requests[1].reject(new Error("Network failed")); await pending;
  assert.equal(tab().content.posts.map((post) => post.id).join(","), "a,b");
  assert.equal(tab().content.nextCursor, "cursor-1");
  assert.equal(tab().errorKind, "more");
  assert.equal(tab().loadingMore, false);
  pending = store.load("viewer:1", "person", "posts", "more");
  assert.equal(requests[2].cursor, "cursor-1");
  requests[2].resolve(page([post("b", { comments: 2 }), "c"], "cursor-2")); await pending;
  assert.equal(tab().content.posts.map((post) => post.id).join(","), "a,b,c");
  assert.equal(tab().content.posts[1].comments, 2);
  assert.equal(tab().content.nextCursor, "cursor-2");
  detach();
  assert.equal(tab().content.posts.length, 3);
});

test("a non-advancing server cursor remains retryable without appending a duplicate page", async () => {
  const { store, requests, tab } = controlled();
  const detach = store.attach("viewer:1", "person");
  let pending = store.load("viewer:1", "person", "posts");
  requests[0].resolve(page(["a"], "same")); await pending;
  pending = store.load("viewer:1", "person", "posts", "more");
  requests[1].resolve(page(["a"], "same")); await pending;
  assert.equal(tab().content.posts.length, 1);
  assert.equal(tab().errorKind, "more");
  assert.ok(tab().error);
  detach();
});

test("confirmed interaction/edit/delete updates reach every post tab and beat stale reads", async () => {
  const { store, requests, tab } = controlled();
  const detach = store.attach("viewer:1", "person");
  for (const name of ["posts", "images", "videos"]) {
    const pending = store.load("viewer:1", "person", name);
    requests.at(-1).resolve(page(["shared"], "next")); await pending;
  }
  const stale = store.load("viewer:1", "person", "posts", "more");
  const staleRequest = requests.at(-1);
  store.updatePost("viewer:1", "shared", { liked: true, likes: 1, saved: true, comments: 2, text: "Server-confirmed edit", edited: true });
  staleRequest.resolve(page([post("shared", { likes: 0, liked: false })])); await stale;
  for (const name of ["posts", "images", "videos"]) {
    const saved = tab(name).content.posts[0];
    assert.equal(saved.text, "Server-confirmed edit");
    assert.equal(saved.liked, true);
    assert.equal(saved.likes, 1);
    assert.equal(saved.saved, true);
    assert.equal(tab(name).content.nextCursor, "next");
  }
  store.updatePost("old-account", "shared", { likes: 900 });
  assert.equal(tab().content.posts[0].likes, 1);
  store.removePost("viewer:1", "shared");
  for (const name of ["posts", "images", "videos"]) assert.equal(tab(name).content.posts.length, 0);
  detach();
});

test("invalidation targets the requested account/profile/tab and cannot be undone by its pending read", async () => {
  const { store, requests, tab, snapshot } = controlled();
  const detach = store.attach("viewer:1", "person");
  let pending = store.load("viewer:1", "person", "notes");
  requests.at(-1).resolve({ ...page([]), notes: [{ id: "note" }] }); await pending;
  store.chooseTab("viewer:1", "person", "notes");
  pending = store.load("viewer:1", "person", "communities");
  const stale = requests.at(-1);
  store.invalidate("viewer:1", "person", ["communities"]);
  stale.resolve({ ...page([]), communities: [{ id: "old-community" }] }); await pending;
  assert.equal(tab("communities").loaded, false);
  assert.equal(tab("communities").content.communities.length, 0);
  assert.equal(tab("notes").content.notes[0].id, "note");
  assert.equal(snapshot().tab, "notes");
  store.invalidate("wrong-account");
  assert.equal(tab("notes").loaded, true);
  store.invalidate("viewer:1");
  assert.equal(tab("notes").loaded, false);
  detach();
});

test("403/404 clear all cached target tabs while 401 clears the session and exposes an actionable state", async () => {
  for (const status of [401, 403, 404]) {
    const { store, requests, tab, snapshot } = controlled();
    const detach = store.attach("viewer:1", "person");
    let pending = store.load("viewer:1", "person", "notes");
    requests.at(-1).resolve({ ...page([]), notes: [{ id: "private" }] }); await pending;
    pending = store.load("viewer:1", "person", "posts");
    requests.at(-1).reject(Object.assign(new Error("Denied"), { status }));
    const result = await pending;
    if (status === 401) {
      assert.equal(result, "session-expired");
      assert.equal(snapshot().active, false);
      assert.equal(snapshot().sessionExpired, true);
      assert.ok(snapshot().tabs.posts.error);
      assert.equal(snapshot().tabs.notes, undefined);
      const count = requests.length;
      await store.load("viewer:1", "person", "posts");
      assert.equal(requests.length, count, "expired owner does not cause an automatic retry loop");
      store.setOwnerScope("viewer:2");
      assert.equal(snapshot("person", "viewer:2").tabs.notes, undefined);
    } else {
      assert.equal(tab("notes").content.notes.length, 0);
      assert.ok(tab().error);
      assert.equal(tab().loading, false);
    }
    detach();
  }
});

test("idle LRU and TTL expire cached profiles, while mounted readers keep their current pages", async () => {
  let now = 0;
  const store = createProfileContentState({ now: () => now, maxCachedProfiles: 2, ttlMs: 100, loadPage: async ({ userId }) => page([userId]) });
  store.setOwnerScope("viewer:1");
  for (const userId of ["a", "b", "c"]) {
    const detach = store.attach("viewer:1", userId);
    await store.load("viewer:1", userId, "posts"); detach(); now++;
  }
  assert.equal(store.getSnapshot("viewer:1", "a").tabs.posts, undefined);
  assert.equal(store.getSnapshot("viewer:1", "b").tabs.posts.loaded, true);
  const detach = store.attach("viewer:1", "c");
  now = 200;
  assert.equal(store.getSnapshot("viewer:1", "b").tabs.posts, undefined);
  assert.equal(store.getSnapshot("viewer:1", "c").tabs.posts.loaded, true);
  detach(); now = 301;
  assert.equal(store.getSnapshot("viewer:1", "c").tabs.posts, undefined);
});

test("multiple subscribers do not cancel each other and an abandoned initial read is retryable", async () => {
  const { store, requests, tab } = controlled();
  const first = store.attach("viewer:1", "person");
  const second = store.attach("viewer:1", "person");
  const pending = store.load("viewer:1", "person", "posts");
  first(); first(); assert.equal(requests[0].signal.aborted, false, "lease cleanup is idempotent");
  second(); assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(page(["late"])); await pending;
  assert.equal(tab().loading, false);
  assert.equal(tab().loaded, false);
  const detach = store.attach("viewer:1", "person");
  const fresh = store.load("viewer:1", "person", "posts");
  requests[1].resolve(page(["fresh"])); await fresh;
  assert.equal(tab().content.posts[0].id, "fresh"); detach();
});

test("cache trimming preserves the actual route cursor and resumes without skipped records", async (t) => {
  const migrationDirectory = new URL("drizzle/", root);
  const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON"); migrations.forEach((migration) => database.exec(migration));
  database.prepare("INSERT INTO universities (id, name, short_name, city) VALUES (?, ?, ?, ?)").run(fixture.university.id, fixture.university.name, fixture.university.shortName, fixture.university.city);
  database.prepare("INSERT INTO departments (id, name) VALUES (?, ?)").run(fixture.department.id, fixture.department.name);
  for (const person of Object.values(fixture.profiles)) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(person.email, person.publicId, person.displayName, person.handle);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year) VALUES (?, ?, ?, ?)").run(person.email, person.universityId, person.departmentId, person.classYear);
  }
  for (const item of fixture.posts) database.prepare("INSERT INTO posts (id, author_email, content, audience, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(item.id, item.authorEmail, item.text, item.audience, item.createdAt, item.updatedAt);
  const DB = { prepare(query) { return { bind(...values) { return {
    async first() { return database.prepare(query).get(...values) ?? null; }, async all() { return { results: database.prepare(query).all(...values) }; },
  }; } }; } };
  const sources = Object.fromEntries(await Promise.all(["lib/server-api.ts", "lib/profile.ts", "lib/post-media.ts", "app/api/profile/content/route.ts"].map(async (path) => [path, await compile(path)])));
  function load(path, dependencies = {}) {
    const exports = {};
    runInNewContext(sources[path], { exports, URL, URLSearchParams, Response, Uint8Array, DataView, TextDecoder, require(name) { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; } });
    return exports;
  }
  const person = fixture.profiles.populated;
  const server = load("lib/server-api.ts", { "../app/chatgpt-auth": { getChatGPTUser: async () => ({ email: person.email }) } });
  const route = load("app/api/profile/content/route.ts", {
    "../../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) },
    "../../../../lib/profile": load("lib/profile.ts"), "../../../../lib/post-media": load("lib/post-media.ts"),
  });
  const calls = [];
  const store = createProfileContentState({ maxCachedItemsPerTab: 24, loadPage: async ({ userId, tab, cursor }) => {
    calls.push(cursor);
    const response = await route.GET(new Request(`https://example.invalid/api/profile/content?${new URLSearchParams({ user: userId, tab, ...(cursor ? { cursor } : {}) })}`));
    assert.equal(response.status, 200); return response.json();
  } });
  store.setOwnerScope("viewer:1");
  const state = () => store.getSnapshot("viewer:1", person.publicId).tabs.posts;
  const close = store.attach("viewer:1", person.publicId);
  await store.load("viewer:1", person.publicId, "posts");
  await store.load("viewer:1", person.publicId, "posts", "more");
  const retainedCursor = state().content.nextCursor;
  assert.match(retainedCursor, /::synthetic-/);
  while (state().content.nextCursor) await store.load("viewer:1", person.publicId, "posts", "more");
  assert.equal(state().content.posts.length, 100, "active reading is not capped by the idle cache budget");
  close();
  assert.equal(state().content.posts.length, 24);
  assert.equal(state().content.nextCursor, retainedCursor);
  const revisit = store.attach("viewer:1", person.publicId);
  await store.load("viewer:1", person.publicId, "posts", "more");
  assert.equal(calls.at(-1), retainedCursor);
  const expected = fixture.posts.filter((post) => post.authorId === person.publicId);
  assert.deepEqual(plain(state().content.posts.map((post) => post.id)), expected.slice(0, 36).map((post) => post.id));
  assert.equal(new Set(state().content.posts.map((post) => post.id)).size, 36);
  revisit();
});
