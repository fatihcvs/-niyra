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
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
  .map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const [idempotencySource, mediaSource, postsSource, schemaSource, profileSource, uploadsSource] = await Promise.all([
  "lib/post-idempotency.ts", "lib/post-media.ts", "app/api/posts/route.ts", "db/schema.ts", "lib/profile.ts", "lib/media-upload-operations.ts",
].map(compile));
const globals = { crypto, Response, Request, Headers, File, Blob, TextEncoder, TextDecoder, Uint8Array, DataView, URL };
const idempotency = {};
const uploads = {};
runInNewContext(uploadsSource, { ...globals, exports: uploads });
runInNewContext(idempotencySource, { ...globals, exports: idempotency, require: () => uploads });
const mediaHelpers = {};
runInNewContext(mediaSource, { ...globals, exports: mediaHelpers });
const schema = {};
runInNewContext(schemaSource, { exports: schema, require: (path) => path === "drizzle-orm" ? drizzleOrm : sqliteCore });
const profileHelpers = {};
runInNewContext(profileSource, { exports: profileHelpers });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=", "base64");

function fixture(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => database.exec(migration));
  database.exec(`
    INSERT INTO universities (id, name, short_name, city) VALUES ('campus', 'University', 'UNI', 'City');
    INSERT INTO departments (id, name) VALUES ('department', 'Computer Engineering');
  `);
  for (const id of ["author", "other"]) {
    database.prepare("INSERT INTO users (email, public_id, display_name, handle) VALUES (?, ?, ?, ?)").run(`${id}@test.local`, id, id, id);
    database.prepare("INSERT INTO student_profiles (user_email, university_id, department_id, class_year, onboarding_completed) VALUES (?, 'campus', 'department', 1, 1)")
      .run(`${id}@test.local`);
  }
  let identity = "author";
  let quotaCalls = 0;
  let unavailable = false;
  let batchFault = null;
  let deferredStatements = null;
  let putHook = null;
  let deleteFails = false;
  const objects = new Map();
  const deletedObjects = [];
  const checkDb = () => { if (unavailable) throw new Error("Database temporarily unreachable"); };
  const executeBatch = (statements) => {
    database.exec("BEGIN");
    try {
      const result = statements.map(({ query, values }) => ({ success: true, results: [], meta: database.prepare(query).run(...values) }));
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
  const DB = {
    prepare(query) {
      return { bind(...values) { return {
        query, values,
        async first() { checkDb(); return database.prepare(query).get(...values) ?? null; },
        async all() { checkDb(); return { results: database.prepare(query).all(...values) }; },
        async run() { checkDb(); return { success: true, meta: database.prepare(query).run(...values) }; },
        async raw() { checkDb(); const statement = database.prepare(query); statement.setReturnArrays(true); return statement.all(...values); },
      }; } };
    },
    async batch(statements) {
      checkDb();
      const fault = batchFault;
      batchFault = null;
      if (fault === "delayed") {
        deferredStatements = statements;
        throw new Error("Batch acknowledgement lost before execution resolved");
      }
      const result = executeBatch(statements);
      if (fault === "committed-unreachable") unavailable = true;
      if (fault) throw new Error("Committed batch acknowledgement lost");
      return result;
    },
  };
  const FILES = {
    async put(key, bytes) {
      objects.set(key, Buffer.from(bytes));
      if (putHook) await putHook(key);
    },
    async delete(key) {
      if (deleteFails) throw new Error("Object storage temporarily unreachable");
      deletedObjects.push(key);
      objects.delete(key);
    },
  };
  const route = {};
  runInNewContext(postsSource, {
    ...globals, exports: route,
    require(path) {
      const dependencies = {
        "drizzle-orm": drizzleOrm,
        "../../chatgpt-auth": { getChatGPTUser: async () => identity ? { email: `${identity}@test.local`, displayName: identity } : null },
        "../../../db": { getDb: async () => drizzle(DB, { schema }) },
        "../../../db/schema": schema,
        "../../../lib/server-api": {
          getRuntime: async () => ({ DB, FILES }),
          enforceRateLimit: async () => { quotaCalls++; return { allowed: true }; },
          rateLimitResponse: () => Response.json({ error: "Rate limited" }, { status: 429 }),
        },
        "../../../lib/profile": profileHelpers,
        "../../../lib/app-auth": { sameOriginRequest: (request) => request.headers.get("origin") === "https://kampira.test" },
        "../../../lib/post-media": mediaHelpers,
        "../../../lib/post-idempotency": idempotency,
      };
      assert.ok(path in dependencies, `Unexpected dependency ${path}`);
      return dependencies[path];
    },
  });
  return {
    database, DB, FILES, objects, deletedObjects,
    signIn(value) { identity = value; },
    quotaCalls: () => quotaCalls,
    batchFault(value) { batchFault = value; },
    recoverDb() { unavailable = false; },
    executeDeferred() { const statements = deferredStatements; deferredStatements = null; return executeBatch(statements); },
    putHook(value) { putHook = value; },
    deleteFails(value) { deleteFails = value; },
    count(table) { return database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count; },
    post({ key = "draft-attempt-001", content = "Hello campus", audience = "platform", file = null, files, courseId, clientDimensions, origin = "https://kampira.test" } = {}) {
      const headers = { origin };
      if (key !== null) headers["Idempotency-Key"] = key;
      let body;
      if (file || files) {
        body = new FormData();
        body.set("content", content);
        if (audience !== null) body.set("audience", audience);
        if (courseId) body.set("courseId", courseId);
        for (const item of files ?? [file]) body.append("media", item);
        if (clientDimensions) {
          body.set("width", String(clientDimensions.width));
          body.set("height", String(clientDimensions.height));
        }
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify({ content, ...(audience === null ? {} : { audience }), courseId });
      }
      return route.POST(new Request("https://kampira.test/api/posts", { method: "POST", headers, body }));
    },
  };
}

const image = (bytes = png, name = "campus.png") => new File([bytes], name, { type: "image/png" });

for (const change of ["status='deleting'", "public_id='fresh-author-generation'"]) test(`post PUT settlement cannot publish through changed account ${change}`, async t => {
  const f = fixture(t); f.putHook(() => f.database.exec(`UPDATE users SET ${change} WHERE email='author@test.local'`));
  assert.equal((await f.post({ file: image() })).status, 503);
  assert.equal(f.count('posts'), 0); assert.equal(f.count('post_media'), 0);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='settled' AND owner_public_id='author'").get().n, 1);
});

test("a lost response can be retried with the same normalized payload without another post, audit or quota hit", async (t) => {
  const f = fixture(t);
  const first = await f.post();
  assert.equal(first.status, 201);
  const body = await first.json();
  // The original response may have been discarded by the network or the caller.
  const retried = await f.post({ content: "  Hello campus  " });
  assert.equal(retried.status, 201);
  assert.equal(retried.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await retried.json(), body);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("audit_logs"), 1);
  assert.equal(f.quotaCalls(), 1);
});

test("key ownership is per authenticated user; changed content, audience or course conflicts", async (t) => {
  const f = fixture(t);
  const original = await (await f.post()).json();
  for (const mutation of [{ content: "Different" }, { audience: "campus" }]) {
    const response = await f.post(mutation);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "IDEMPOTENCY_CONFLICT");
  }
  f.signIn("other");
  const other = await f.post();
  assert.equal(other.status, 201);
  assert.notEqual((await other.json()).post.id, original.post.id);
  assert.equal(f.count("posts"), 2);
  f.signIn("author");
  await f.post({ key: "campus-key-001", audience: "campus" });
  const courseConflict = await f.post({ key: "campus-key-001", audience: "campus", courseId: "new-course" });
  assert.equal(courseConflict.status, 409);
});

test("media fingerprint includes bytes and filename; multipart encoding does not affect replay", async (t) => {
  const f = fixture(t);
  const original = await (await f.post({ file: image() })).json();
  const retry = await f.post({ file: image() });
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), original);
  const changed = Buffer.from(png);
  changed[changed.length - 1] ^= 1;
  for (const file of [image(changed), image(png, "renamed.png")]) {
    const response = await f.post({ file });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "IDEMPOTENCY_CONFLICT");
  }
  assert.equal(f.count("post_media"), 1);
  assert.equal(f.objects.size, 1);
});

test("image display dimensions come from bytes, persist atomically and survive response loss and replay", async (t) => {
  const f = fixture(t);
  const bytes = await readFile(new URL("fixtures/post-media/7x5-orientation6.jpg", import.meta.url));
  const file = () => new File([bytes], "phone.jpg", { type: "image/jpeg" });
  f.batchFault("committed");
  const published = await f.post({ file: file(), clientDimensions: { width: 9999, height: 1 } });
  assert.equal(published.status, 201);
  const body = await published.json();
  assert.equal(body.post.media[0].width, 5);
  assert.equal(body.post.media[0].height, 7);
  const stored = f.database.prepare("SELECT id, width, height FROM post_media").get();
  assert.equal(stored.width, 5); assert.equal(stored.height, 7);
  const hydrated = (await mediaHelpers.hydratePostMedia(f.DB, [body.post.id])).get(body.post.id)[0];
  assert.equal(hydrated.width, 5); assert.equal(hydrated.height, 7);
  assert.equal(hydrated.id, stored.id);
  const retried = await f.post({ file: file(), clientDimensions: { width: 1, height: 9999 } });
  assert.equal(retried.status, 201);
  assert.deepEqual(await retried.json(), body);
  assert.equal(f.count("post_media"), 1);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.deletedObjects.length, 0);

  // A completed response created before 0025 remains replayable as-is; no new upload/backfill.
  delete body.post.media[0].width; delete body.post.media[0].height;
  f.database.prepare("UPDATE post_publish_requests SET response_json = ?").run(JSON.stringify(body));
  assert.deepEqual(await (await f.post({ file: file() })).json(), body);
  assert.equal(f.objects.size, 1);
});

test("simultaneous identical requests publish one post and clean only the losing upload", async (t) => {
  const f = fixture(t);
  let uploads = 0;
  let release;
  const bothUploads = new Promise((resolve) => { release = resolve; });
  f.putHook(async () => { if (++uploads === 2) release(); await bothUploads; });
  const responses = await Promise.all([f.post({ file: image() }), f.post({ file: image() })]);
  assert.deepEqual(responses.map((response) => response.status), [201, 201]);
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("post_media"), 1);
  assert.equal(f.count("audit_logs"), 1);
  assert.equal(f.objects.size, 1);
  const winner = f.database.prepare("SELECT object_key FROM post_media").get().object_key;
  assert.ok(f.objects.has(winner));
  assert.ok(!f.deletedObjects.includes(winner));
  assert.equal(f.deletedObjects.length, 1);
});

test("concurrent reuse of a key for different payloads has one winner and an explicit conflict", async (t) => {
  const f = fixture(t);
  const responses = await Promise.all([f.post(), f.post({ content: "Another draft" })]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const conflict = responses.find((response) => response.status === 409);
  assert.equal((await conflict.json()).code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.count("post_publish_requests"), 1);
  assert.equal(f.count("posts"), 1);
});

test("a committed batch with a lost acknowledgement reconciles success without deleting published media", async (t) => {
  const f = fixture(t);
  f.batchFault("committed");
  const response = await f.post({ file: image() });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("idempotency-replayed"), "true");
  assert.equal(f.count("posts"), 1);
  assert.equal(f.objects.size, 1);
  assert.equal(f.deletedObjects.length, 0);
});

test("unknown DB outcome keeps the durable media record; a later retry resolves the committed publication", async (t) => {
  const f = fixture(t);
  f.batchFault("committed-unreachable");
  assert.equal((await f.post({ file: image() })).status, 503);
  assert.equal(f.objects.size, 1);
  assert.equal(f.deletedObjects.length, 0);
  const id = f.database.prepare("SELECT id FROM posts").get().id;
  f.recoverDb();
  const retry = await f.post({ file: image() });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).post.id, id);
  assert.equal(f.count("posts"), 1);
});

test("cleanup fences a delayed transaction before deleting its upload, and the same key remains retryable", async (t) => {
  const f = fixture(t);
  f.batchFault("delayed");
  assert.equal((await f.post({ file: image() })).status, 503);
  assert.equal(f.objects.size, 0);
  assert.equal(f.count("posts"), 0);
  assert.equal(f.count("post_media"), 0);
  assert.equal(f.count("audit_logs"), 0);
  const retry = await f.post({ file: image() });
  assert.equal(retry.status, 201);
  const winner = await retry.json();
  // Execute the old SQL after cleanup and a new winning attempt. It must be a no-op.
  f.executeDeferred();
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("post_media"), 1);
  assert.equal(f.count("audit_logs"), 1);
  assert.equal(f.objects.size, 1);
  assert.deepEqual(await (await f.post({ file: image() })).json(), winner);
});

test("bucket failure after writing bytes leaves no post and quarantines its unknown object across a successful retry", async (t) => {
  const f = fixture(t);
  f.putHook(async () => { throw new Error("Upload acknowledgement lost"); });
  assert.equal((await f.post({ file: image() })).status, 503);
  assert.equal(f.count("posts"), 0);
  assert.equal(f.objects.size, 1);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='unknown'").get().n, 1);
  assert.equal(f.deletedObjects.length, 0);
  const reservedId = f.database.prepare("SELECT post_id FROM post_publish_requests").get().post_id;
  assert.equal((await f.post({ content: "Changed after a failed attempt", file: image() })).status, 409);
  f.putHook(null);
  const retry = await f.post({ file: image() });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).post.id, reservedId);
  assert.equal(f.objects.size, 2);
});

test("a transaction failure rolls back post, media and audit, and failed storage cleanup is retried", async (t) => {
  const f = fixture(t);
  f.database.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'injected transaction failure'); END");
  f.deleteFails(true);
  assert.equal((await f.post({ file: image() })).status, 503);
  assert.equal(f.count("posts"), 0);
  assert.equal(f.count("post_media"), 0);
  assert.equal(f.count("audit_logs"), 0);
  assert.equal(f.database.prepare("SELECT state FROM post_publish_attempts").get().state, "cleanup");
  assert.equal(f.objects.size, 1);
  f.database.exec("DROP TRIGGER reject_audit");
  f.deleteFails(false);
  assert.equal((await f.post({ file: image() })).status, 201);
  assert.equal(f.objects.size, 1);
  assert.equal(f.deletedObjects.length, 1);
});

test("cleanup is author scoped and cannot delete a referenced object even if its attempt is mislabeled", async (t) => {
  const f = fixture(t);
  await f.post({ file: image() });
  const requestId = f.database.prepare("SELECT id FROM post_publish_requests").get().id;
  f.database.exec("UPDATE post_publish_attempts SET state = 'cleanup'");
  f.database.prepare("INSERT INTO post_publish_attempts (id, request_id, object_key, state) VALUES ('orphan', ?, 'private-orphan', 'cleanup')").run(requestId);
  f.objects.set("private-orphan", Buffer.from(png));
  assert.equal(await idempotency.cleanupPostAttempts(f.DB, f.FILES, "other@test.local", requestId), 0);
  assert.equal(f.objects.size, 2);
  assert.equal(f.deletedObjects.length, 0);
  assert.equal(await idempotency.cleanupPostAttempts(f.DB, f.FILES, "author@test.local", requestId), 1);
  assert.equal(f.objects.size, 1);
  assert.deepEqual(f.deletedObjects, ["private-orphan"]);
  assert.equal(await idempotency.cleanupPostAttempts(f.DB, f.FILES, "author@test.local", requestId), 0);
  assert.equal(f.deletedObjects.length, 1);
});

test("completed replay retries failed cleanup, while unresolved pending uploads are retained", async (t) => {
  const f = fixture(t);
  const original = await (await f.post()).json();
  const requestId = f.database.prepare("SELECT id FROM post_publish_requests").get().id;
  f.database.prepare("INSERT INTO post_publish_attempts (id, request_id, object_key, state) VALUES ('failed', ?, 'failed-upload', 'cleanup'), ('uncertain', ?, 'pending-upload', 'pending')")
    .run(requestId, requestId);
  f.objects.set("failed-upload", png);
  f.objects.set("pending-upload", png);
  f.deleteFails(true);
  assert.equal((await f.post()).status, 201);
  assert.equal(f.objects.size, 2);
  f.deleteFails(false);
  assert.deepEqual(await (await f.post()).json(), original);
  assert.deepEqual(f.deletedObjects, ["failed-upload"]);
  assert.ok(f.objects.has("pending-upload"));
  assert.equal(f.database.prepare("SELECT state FROM post_publish_attempts WHERE id = 'uncertain'").get().state, "pending");
});

test("retrying a subsequently removed post returns 410 and never recreates its content", async (t) => {
  const f = fixture(t);
  await f.post();
  f.database.exec("UPDATE posts SET deleted_at = CURRENT_TIMESTAMP");
  const retry = await f.post();
  assert.equal(retry.status, 410);
  assert.equal((await retry.json()).code, "POST_REMOVED");
  assert.equal(f.count("posts"), 1);
  f.database.exec("DELETE FROM posts");
  assert.equal((await f.post()).status, 410);
  assert.equal(f.count("posts"), 0);
});

test("legacy requests without a key remain independent creations and retain the campus audience default", async (t) => {
  const f = fixture(t);
  const first = await f.post({ key: null, audience: null });
  const second = await f.post({ key: null, audience: null });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.notEqual(firstBody.post.id, secondBody.post.id);
  assert.equal(firstBody.post.audience, "campus");
  assert.equal(secondBody.post.audience, "campus");
  assert.equal(f.count("posts"), 2);
});

test("invalid keys, unauthenticated calls and invalid media do not reserve a publication", async (t) => {
  const f = fixture(t);
  for (const key of ["", "short", "contains spaces", "x".repeat(129)]) {
    const response = await f.post({ key });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_IDEMPOTENCY_KEY");
  }
  assert.equal((await f.post({ file: image(Buffer.from("not an image")) })).status, 415);
  assert.equal((await f.post({ origin: "https://outside.test" })).status, 403);
  f.signIn(null);
  assert.equal((await f.post()).status, 401);
  assert.equal(f.count("post_publish_requests"), 0);
  assert.equal(f.count("posts"), 0);
});

test("four photos publish in their chosen order and hydrate in that order after a lost response", async (t) => {
  const f = fixture(t);
  const files = ["z-last-name.png", "a-first-name.png", "middle.png", "fourth.png"].map((name) => image(png, name));
  f.batchFault("committed-unreachable");
  assert.equal((await f.post({ files })).status, 503);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("post_media"), 4);
  assert.equal(f.objects.size, 4);
  f.recoverDb();
  const response = await f.post({ files });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("idempotency-replayed"), "true");
  const body = await response.json();
  assert.deepEqual(body.post.media.map((item) => item.fileName), files.map((file) => file.name));
  const hydrated = (await mediaHelpers.hydratePostMedia(f.DB, [body.post.id])).get(body.post.id);
  assert.deepEqual(Array.from(hydrated, (item) => item.id), body.post.media.map((item) => item.id));
  assert.deepEqual(f.database.prepare("SELECT ordinal FROM post_media ORDER BY ordinal").all().map((row) => row.ordinal), [0, 1, 2, 3]);
  assert.equal(f.count("audit_logs"), 1);
  assert.equal(f.quotaCalls(), 1);
  assert.equal(f.deletedObjects.length, 0);
});

test("changing photo order, removing a photo or changing any photo conflicts with the original key", async (t) => {
  const f = fixture(t);
  const files = [image(png, "first.png"), image(png, "second.png"), image(png, "third.png")];
  assert.equal((await f.post({ files })).status, 201);
  for (const changed of [[...files].reverse(), files.slice(1), [files[0], image(png, "different.png"), files[2]]]) {
    const response = await f.post({ files: changed });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "IDEMPOTENCY_CONFLICT");
  }
  assert.equal(f.objects.size, 3);
  assert.equal(f.count("posts"), 1);
});

test("concurrent four-photo requests preserve all winning objects and clean every losing object", async (t) => {
  const f = fixture(t);
  const files = [1, 2, 3, 4].map((index) => image(png, `${index}.png`));
  let firstUploads = 0;
  let release;
  const bothStarted = new Promise((resolve) => { release = resolve; });
  f.putHook(async () => { if (++firstUploads === 2) release(); await bothStarted; });
  const responses = await Promise.all([f.post({ files }), f.post({ files })]);
  assert.deepEqual(responses.map((response) => response.status), [201, 201]);
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(f.count("posts"), 1);
  assert.equal(f.count("audit_logs"), 1);
  assert.equal(f.count("post_media"), 4);
  assert.equal(f.objects.size, 4);
  assert.equal(f.deletedObjects.length, 4);
  for (const { object_key } of f.database.prepare("SELECT object_key FROM post_media").all()) {
    assert.ok(f.objects.has(object_key));
    assert.ok(!f.deletedObjects.includes(object_key));
  }
});

test("partial multi-photo retry cleans settled orphans while retaining its unknown upload ledger", async (t) => {
  const f = fixture(t);
  const files = [1, 2, 3, 4].map((index) => image(png, `${index}.png`));
  let puts = 0;
  f.putHook(async () => { if (++puts === 2) throw new Error("Second object upload acknowledgement lost"); });
  f.deleteFails(true);
  assert.equal((await f.post({ files })).status, 503);
  assert.equal(f.count("post_publish_attempt_media"), 4);
  assert.equal(f.objects.size, 2);
  assert.equal(f.count("posts"), 0);
  assert.equal(f.database.prepare("SELECT state FROM post_publish_attempts").get().state, "cleanup");
  f.deleteFails(false);
  f.putHook(null);
  assert.equal((await f.post({ files })).status, 201);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.objects.size, 5);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM post_publish_attempts WHERE state='cleaned'").get().n, 0);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM media_upload_operations WHERE state='unknown'").get().n, 1);
});

test("multi-photo metadata and every file header are validated before quota, reservation or object writes", async (t) => {
  const f = fixture(t);
  const mp4 = new File([new Uint8Array(24)], "movie.mp4", { type: "video/mp4" });
  for (const files of [[image(), mp4], [mp4, mp4], [1, 2, 3, 4, 5].map((index) => image(png, `${index}.png`))]) {
    assert.equal((await f.post({ files })).status, 400);
  }
  assert.equal((await f.post({ files: [image(), image(Buffer.from("invalid bytes"), "second.png")] })).status, 415);
  const large = new File([new Uint8Array(7 * 1024 * 1024)], "large.png", { type: "image/png" });
  assert.equal((await f.post({ files: [large, large, large] })).status, 413);
  assert.equal(f.quotaCalls(), 0);
  assert.equal(f.count("post_publish_requests"), 0);
  assert.equal(f.objects.size, 0);
});

test("single-file v1 fingerprint and saved response remain byte-for-byte replay compatible after ordering migration", async (t) => {
  const f = fixture(t);
  const file = image();
  const attachment = await mediaHelpers.validatePostMedia(file);
  const v1 = await idempotency.hashPostPayload({ content: "Hello campus", audience: "platform", courseId: null, attachment });
  const now = await idempotency.hashPostPayload({ content: "Hello campus", audience: "platform", courseId: null, attachment, attachments: [attachment] });
  assert.equal(now, v1);
  const original = await (await f.post({ file })).json();
  const oldResponse = { post: { ...original.post, media: [{ id: original.post.media[0].id, kind: "image", url: original.post.media[0].url, contentType: "image/png", fileName: "campus.png" }] } };
  f.database.prepare("UPDATE post_publish_requests SET response_json = ?, payload_hash = ?").run(JSON.stringify(oldResponse), v1);
  assert.deepEqual(await (await f.post({ files: [file] })).json(), oldResponse);
  assert.equal(f.count("posts"), 1);
  assert.equal(f.objects.size, 1);
});
