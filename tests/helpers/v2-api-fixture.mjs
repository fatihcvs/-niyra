import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { appAuthModule } from "./app-auth-module.mjs";
import * as drizzleOrm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";

export function v2Fixture(t) {
  const root = resolve(import.meta.dirname, "../..");
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  database.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(resolve(root, "drizzle")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) database.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  database.exec(`INSERT INTO universities(id,name,short_name,city) VALUES('a','Synthetic A','A','Test'),('b','Synthetic B','B','Test');
    INSERT INTO faculties(id,university_id,name,short_name) VALUES('fa','a','Faculty A','FA'),('fb','b','Faculty B','FB');
    INSERT INTO departments(id,faculty_id,name) VALUES('da','fa','Department A'),('db','fb','Department B');
    INSERT INTO courses(id,department_id,code,name) VALUES('ca','da','MAT101','Matematik'),('ca2','da','CS101','Bilgisayar'),('cb','db','MAT101','Matematik');
    INSERT INTO platform_settings(key,value_json) VALUES('v2.courses','true'),('v2.planner','true'),('v2.communities','true');`);
  for (const [id, campus] of [["alice", "a"], ["bob", "a"], ["other", "b"]]) {
    database.prepare("INSERT INTO users(email,public_id,display_name,handle) VALUES(?,?,?,?)").run(`${id}@example.invalid`, id, id, id);
    database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year) VALUES(?,?,?,1)").run(`${id}@example.invalid`, campus, `d${campus}`);
  }
  let current = "alice", beforeBatch = null, beforeSql = null, files;
  const prepare = (sql, values = []) => ({ sql, values,
    bind(...next) { return prepare(sql, next); },
    async first() { await beforeSql?.(sql); return database.prepare(sql).get(...values) ?? null; },
    async all() { await beforeSql?.(sql); return { results: database.prepare(sql).all(...values) }; },
    async run() { await beforeSql?.(sql); return { success: true, meta: database.prepare(sql).run(...values) }; },
    async raw() { await beforeSql?.(sql); const query = database.prepare(sql); query.setReturnArrays(true); return query.all(...values); },
  });
  const DB = { prepare, async batch(statements) {
    beforeBatch?.(); database.exec("BEGIN");
    try { const result = statements.map(s => ({ success: true, meta: database.prepare(s.sql).run(...s.values) })); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  }};
  const cache = new Map(), errors = [];
  const load = file => {
    const absolute = resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    const source = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports, crypto, Response, Request, Headers, File, Blob, DataView, URL, URLSearchParams, TextDecoder, TextEncoder, Uint8Array, Date,
      require(name) {
        if (name === "cloudflare:workers") return { env: { DB, get FILES() { return files; } } };
        if (name === "drizzle-orm") return drizzleOrm;
        if (name === "drizzle-orm/sqlite-core") return sqliteCore;
        if (name.endsWith("/db")) return { getDb: async () => drizzle(DB, { schema: load("db/schema.ts") }) };
        if (name.endsWith(".json")) return { default: JSON.parse(readFileSync(resolve(dirname(absolute), name), "utf8")) };
        if (name.endsWith("/chatgpt-auth")) return { getChatGPTUser: async () => current ? { email: `${current}@example.invalid`, displayName: current } : null };
        if (name.endsWith("/app-auth")) return { ...appAuthModule, sameOriginRequest: req => req.headers.get("origin") === new URL(req.url).origin,
          sha256: async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, "0")).join("") };
        return load(resolve(dirname(absolute), `${name}.ts`));
      },
    });
    if (absolute.endsWith("server-api.ts")) exports.unavailableResponse = error => { errors.push(error); return Response.json({ error: error.message }, { status: 503 }); };
    return exports;
  };
  return { database, DB, errors, load, as(id) { current = id; }, beforeBatch(fn) { beforeBatch = fn; }, beforeSql(fn) { beforeSql = fn; }, files(value) { files = value; },
    async request(path, method = "GET", body, headers = {}) {
      const route = path.split("?")[0];
      return load(`app/api/${route}/route.ts`)[method](new Request(`https://kampira.test/api/${path}`, {
        method, headers: { origin: "https://kampira.test", "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
    },
    count(table) { return database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; },
  };
}
