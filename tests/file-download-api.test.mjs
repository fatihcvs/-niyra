import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const migrationDirectory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
const paths = ["lib/app-auth.ts", "lib/file-response.ts", "lib/server-api.ts", "lib/media-upload-operations.ts", "lib/active-actor.ts", "app/api/notes/file/route.ts", "app/api/profile/media/route.ts", "app/api/campus-market/images/route.ts", "app/api/campus-pulse/image/route.ts"];
const sources = new Map(await Promise.all(paths.map(async (path) => [path, ts.transpileModule(await readFile(new URL(path, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText])));
const filename = "Çalışma şeması ıİğ 🧪.pdf";
const bytes = Buffer.from("%PDF-1.7\nSynthetic download regression\n%%EOF");

async function fixture(t) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close()); database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((sql) => database.exec(sql));
  database.exec(`
    INSERT INTO universities(id,name,short_name,city) VALUES ('campus','Campus','UNI','City'),('outside','Outside','OUT','City');
    INSERT INTO departments(id,name) VALUES ('department','Department');
    INSERT INTO courses(id,department_id,code,name) VALUES ('course','department','C101','Course');
    INSERT INTO users(email,public_id,display_name,handle) VALUES ('author@test.local','author','Author','author'),('viewer@test.local','viewer','Viewer','viewer'),('outside@test.local','outside','Outside','outside');
    INSERT INTO student_profiles(user_email,university_id,department_id,class_year) SELECT email,CASE WHEN public_id='outside' THEN 'outside' ELSE 'campus' END,'department',1 FROM users;
    INSERT INTO marketplace_listings(id,university_id,owner_email,kind,category,title,description) VALUES ('listing','campus','author@test.local','sell','books','Book','A book');
  `);
  database.prepare("INSERT INTO notes(id,owner_email,course_id,title,object_key,original_file_name,content_type,byte_size,status) VALUES ('note','author@test.local','course','Note','note-key',?,'application/pdf',?,'published')").run(filename, bytes.length);
  database.prepare("INSERT INTO profile_media(user_email,kind,object_key,original_file_name,content_type,byte_size) VALUES ('author@test.local','avatar','avatar-key',?,'image/png',?)").run(filename.replace(/pdf$/, "png"), bytes.length);
  database.prepare("INSERT INTO marketplace_listing_images(id,listing_id,uploader_email,object_key,original_file_name,content_type,byte_size) VALUES ('image','listing','author@test.local','market-key',?,'image/png',?)").run(filename.replace(/pdf$/, "png"), bytes.length);
  database.prepare("INSERT INTO campus_pulse_posts(id,author_email,university_id,kind,content,image_object_key,image_original_file_name,image_content_type,image_byte_size) VALUES ('pulse','author@test.local','campus','confession','Pulse','pulse-key',?,'image/png',?)").run(filename.replace(/pdf$/, "png"), bytes.length);
  const tokens = {}, hashes = {};
  for (const who of ["viewer", "outside"]) {
    tokens[who] = `synthetic-${who}-session-cookie`;
    hashes[who] = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokens[who]))).toString("hex");
    database.prepare("INSERT INTO user_sessions(token_hash,user_email,expires_at) VALUES (?,?,'2099-01-01T00:00:00Z')").run(hashes[who], `${who}@test.local`);
  }
  let viewer = "viewer", reads = 0, missing = false;
  const DB = { prepare(sql) { return { bind(...values) { return {
    async first() { return database.prepare(sql).get(...values) ?? null; },
    async all() { return { results: database.prepare(sql).all(...values) }; },
    async run() { return database.prepare(sql).run(...values); },
  }; } }; } };
  const FILES = { async get() { reads++; return missing ? null : { body: bytes, size: bytes.length, writeHttpMetadata(headers) { headers.set("content-type", "application/octet-stream"); } }; } };
  const modules = new Map();
  for (const [path, source] of sources) {
    const exports = {};
    runInNewContext(source, { exports, crypto, URL, Response, Headers, TextEncoder, TextDecoder, Uint8Array, require(name) {
      if (name === "cloudflare:workers") return { env: { DB, FILES } };
      if (name.endsWith("/chatgpt-auth")) return { getChatGPTUser: async () => viewer ? { email: `${viewer}@test.local`, displayName: viewer, fullName: null } : null };
      if (["/market-idempotency", "/market-media-idempotency", "/profile"].some((suffix) => name.endsWith(suffix))) return {};
      const key = `lib/${name.split("/").at(-1)}.ts`;
      if (modules.has(key)) return modules.get(key);
      throw new Error(`Unexpected dependency ${name}`);
    } }); modules.set(path, exports);
  }
  return { database, tokens, hashes, modules, reads: () => reads, identity(who) { viewer = who; }, missing(value) { missing = value; },
    get(path = "notes/file", query = "id=note&download=1", headers = {}) {
      return modules.get(`app/api/${path}/route.ts`).GET(new Request(`https://kampira.test/api/${path}?${query}`, { headers }));
    },
  };
}

function decodedFilename(response) {
  const header = response.headers.get("content-disposition");
  assert.ok([...header].every((character) => character.charCodeAt(0) < 128));
  return decodeURIComponent(header.split("filename*=UTF-8''")[1]);
}

test("Turkish and emoji filenames survive all authenticated file responses with safe ASCII fallback", async (t) => {
  const f = await fixture(t);
  for (const [path, query, name, mode] of [["notes/file", "id=note&download=1", filename, "attachment"], ["notes/file", "id=note", filename, "inline"], ["profile/media", "user=author&kind=avatar", filename.replace(/pdf$/, "png"), "inline"], ["campus-market/images", "id=image", filename.replace(/pdf$/, "png"), "inline"], ["campus-pulse/image", "id=pulse", filename.replace(/pdf$/, "png"), "inline"]]) {
    const response = await f.get(path, query);
    assert.equal(response.status, 200, path); assert.equal(decodedFilename(response), name);
    assert.ok(response.headers.get("content-disposition").startsWith(`${mode}; filename="`));
    assert.equal(response.headers.get("content-length"), String(bytes.length));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM note_views").get().n, 1);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM audit_logs WHERE action='note.downloaded'").get().n, 1);
});

test("filename controls and malformed Unicode cannot inject headers or make a stored file unavailable", async (t) => {
  const f = await fixture(t); const format = f.modules.get("lib/file-response.ts").fileContentDisposition;
  for (const name of ['../private\\\r\n";x=1.pdf', "bad\u0000\u202ename.pdf", "lone\ud800.pdf", "🧪".repeat(140) + ".pdf", ""]) {
    const response = new Response(null, { headers: { "content-disposition": format("attachment", name) } });
    const decoded = decodedFilename(response);
    assert.ok(!/[\r\n\0"\\/\u202e]/.test(decoded));
    assert.ok(Array.from(decoded).length <= 140);
    assert.equal([...response.headers].length, 1);
  }
  f.database.prepare("UPDATE notes SET original_file_name=? WHERE id='note'").run('sayfa\r\nX-Injected: yes.pdf');
  const response = await f.get(); assert.equal(response.status, 200); assert.equal(response.headers.get("x-injected"), null);
});

test("native account context rejects stale-owner commands before reading R2, while ordinary browser links keep working", async (t) => {
  const f = await fixture(t);
  const current = { Cookie: `uniyra_session=${f.tokens.viewer}`, "X-Account-Context": "viewer" };
  assert.equal((await f.get("notes/file", "id=note&download=1", current)).status, 200);
  const reads = f.reads();
  assert.equal((await f.get("notes/file", "id=note", { ...current, "X-Account-Context": "outside" })).status, 409);
  assert.equal((await f.get("notes/file", "id=note", { ...current, Cookie: "" })).status, 401);
  f.database.prepare("UPDATE user_sessions SET expires_at='2000-01-01' WHERE token_hash=?").run(f.hashes.viewer);
  assert.equal((await f.get("notes/file", "id=note", current)).status, 401);
  assert.equal(f.reads(), reads);
  assert.equal((await f.get()).status, 200, "existing headerless browser contract is unchanged");
});

test("file reads preserve identity, campus, block, deletion and current visibility checks", async (t) => {
  const f = await fixture(t);
  f.identity(null); assert.equal((await f.get()).status, 401);
  f.identity("outside"); assert.equal((await f.get()).status, 404);
  f.identity("viewer"); f.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES ('author@test.local','viewer@test.local')");
  for (const [path, query] of [["notes/file", "id=note"], ["profile/media", "user=author&kind=avatar"], ["campus-market/images", "id=image"], ["campus-pulse/image", "id=pulse"]]) assert.equal((await f.get(path, query)).status, 404);
  assert.equal(f.reads(), 0);
  f.database.exec("DELETE FROM user_blocks; UPDATE notes SET status='processing'"); assert.equal((await f.get()).status, 404);
  f.identity("author"); assert.equal((await f.get()).status, 200);
  f.database.exec("UPDATE notes SET deleted_at=CURRENT_TIMESTAMP"); assert.equal((await f.get()).status, 404);
  f.database.exec("UPDATE notes SET deleted_at=NULL,status='published'"); f.missing(true); assert.equal((await f.get()).status, 409);
});
