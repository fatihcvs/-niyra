import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url), directory = new URL("drizzle/", root);
const migrations = await Promise.all((await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort().map((name) => readFile(new URL(name, directory), "utf8")));
const compile = async (name) => ts.transpileModule(await readFile(new URL(name, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serverCode = await compile("lib/server-api.ts"), routeCode = await compile("app/api/housing/route.ts");
function load(source, dependencies) { const exports = {}; runInNewContext(source, { exports, Response, URL, crypto: webcrypto, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } }); return exports; }
function setup(t) {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON"); migrations.forEach((migration) => database.exec(migration));
  const DB = { prepare(query) { const statement = (values = []) => ({ bind: (...bound) => statement(bound), first: async () => database.prepare(query).get(...values) ?? null, all: async () => ({ results: database.prepare(query).all(...values) }), run: async () => { const result = database.prepare(query).run(...values); return { meta: { changes: Number(result.changes) } }; } }); return statement(); } };
  database.exec("INSERT INTO universities(id,name,short_name,city) VALUES ('campus','Synthetic Campus','TEST','Test'),('outside','Synthetic Outside','OUT','Test'); INSERT INTO departments(id,name) VALUES ('dept','Synthetic Department');");
  for (const [id, campus] of [["viewer", "campus"], ["peer", "campus"], ["outside", "outside"]]) {
    database.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES(?,?,?,?)").run(`${id}@synthetic.test`, id, `Synthetic ${id}`, `synthetic-${id}`);
    database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES(?,?,'dept',1)").run(`${id}@synthetic.test`, campus);
  }
  database.exec("INSERT INTO campus_places(id,university_id,creator_email,name,category) VALUES ('housing','campus','viewer@synthetic.test','Synthetic Housing','housing'),('other-category','campus','viewer@synthetic.test','Synthetic Study','study'),('outside-housing','outside','outside@synthetic.test','Synthetic Outside Housing','housing');");
  let current = "viewer", open = true;
  const server = load(serverCode, { "../app/chatgpt-auth": { getChatGPTUser: async () => current ? { email: `${current}@synthetic.test`, displayName: `Synthetic ${current}` } : null } });
  const route = load(routeCode, { "../../../lib/platform-settings": { getBooleanPlatformSetting: async () => open }, "../../../lib/server-api": { ...server, getRuntime: async () => ({ DB }) } });
  const request = (method, body, query = "") => new Request(`https://campus.test/api/housing${query}`, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { database, as: (id) => { current = id; }, contributions: (value) => { open = value; }, get: (id = "housing") => route.GET(request("GET", null, `?placeId=${id}`)), post: (body) => route.POST(request("POST", body)), remove: (id) => route.DELETE(request("DELETE", { id })) };
}

test("real housing API accepts only current-campus student housing IDs and keeps anonymous public output separate from moderation ownership", async (t) => {
  const app = setup(t);
  const payload = { placeId: "housing", content: "[SYNTHETIC] Anonymous experience", anonymous: true };
  for (const placeId of ["outside-housing", "other-category", "catalogue-source-id"]) assert.equal((await app.post({ ...payload, placeId })).status, 404);
  assert.equal((await app.post({ ...payload, content: "  " })).status, 400);
  const response = await app.post(payload); assert.equal(response.status, 201);
  const { message } = await response.json(); assert.equal(message.authorName, "Anonim öğrenci"); assert.equal(message.own, true);
  const saved = app.database.prepare("SELECT * FROM housing_discussions WHERE id=?").get(message.id);
  assert.equal(saved.place_id, "housing"); assert.equal(saved.author_email, "viewer@synthetic.test"); assert.equal(saved.is_anonymous, 1);
  app.as("peer"); const listed = await (await app.get()).json();
  assert.equal(listed.messages[0].authorName, "Anonim öğrenci"); assert.equal(listed.messages[0].authorHandle, null); assert.equal(listed.messages[0].own, false);
  assert.doesNotMatch(JSON.stringify(listed), /viewer@|synthetic-viewer/);
  app.as("outside"); assert.equal((await app.get()).status, 404);
  app.as(null); assert.equal((await app.get()).status, 401); assert.equal((await app.post(payload)).status, 401);
});

test("real housing block/mute filtering, contribution switch and deletion respect the authenticated owner", async (t) => {
  const app = setup(t);
  app.contributions(false); assert.equal((await app.post({ placeId: "housing", content: "[SYNTHETIC] Closed" })).status, 503);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM housing_discussions").get().count, 0);
  app.contributions(true); const { message } = await (await app.post({ placeId: "housing", content: "[SYNTHETIC] Owned experience" })).json();
  app.as("peer"); assert.equal((await app.remove(message.id)).status, 404);
  app.database.exec("INSERT INTO user_blocks(blocker_email,blocked_email) VALUES('viewer@synthetic.test','peer@synthetic.test')");
  assert.equal((await (await app.get()).json()).messages.length, 0, "either block direction suppresses discussion visibility");
  app.database.exec("DELETE FROM user_blocks; INSERT INTO user_mutes(muter_email,muted_email) VALUES('peer@synthetic.test','viewer@synthetic.test')");
  assert.equal((await (await app.get()).json()).messages.length, 0);
  app.as("viewer"); assert.equal((await app.remove(message.id)).status, 200);
  assert.equal(app.database.prepare("SELECT status FROM housing_discussions WHERE id=?").get(message.id).status, "deleted");
  assert.equal((await app.remove(message.id)).status, 404);
  assert.equal((await (await app.get()).json()).messages.length, 0);
});
