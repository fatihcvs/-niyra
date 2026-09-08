import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as drizzle from "drizzle-orm";
import { alias, SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Log, LogLevel, Miniflare } from "miniflare";
import ts from "typescript";

async function load(relativePath, dependencies = {}) {
  const exports = {};
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, {
    exports,
    require(specifier) {
      assert.ok(specifier in dependencies, `Unexpected helper import: ${specifier}`);
      return dependencies[specifier];
    },
  });
  return exports;
}
const searchQuery = await load("../lib/search-query.ts");
const { searchContainsDrizzle } = await load("../lib/search-query-drizzle.ts", { "drizzle-orm": drizzle, "./search-query": searchQuery });
const documents = sqliteTable("search documents", {
  id: text("id").primaryKey(),
  name: text("display name"),
  handle: text("handle"),
  department: text("department"),
  bio: text("bio"),
});
const aliasName = 'candidate"profile';
const candidate = alias(documents, aliasName);
const fields = [candidate.name, candidate.handle, candidate.department, candidate.bio];
const dialect = new SQLiteSyncDialect();
function queryFor(needle) {
  return dialect.sqlToQuery(drizzle.sql`SELECT ${candidate.id} AS id FROM ${documents} AS ${drizzle.sql.identifier(aliasName)}
    WHERE ${drizzle.or(...fields.map(field => searchContainsDrizzle(field, needle)))} ORDER BY ${candidate.id}`);
}

test("actual D1 executes Drizzle search with preserved identifiers and full bound Unicode literals", async (t) => {
  const runtime = new Miniflare({
    modules: true, compatibilityDate: "2026-05-15", host: "127.0.0.1", port: 0,
    d1Databases: { DB: randomUUID() }, d1Persist: false, log: new Log(LogLevel.ERROR),
    script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
  });
  try {
    const db = await runtime.getD1Database("DB");
    await db.exec('CREATE TABLE "search documents" ("id" TEXT PRIMARY KEY, "display name" TEXT, "handle" TEXT, "department" TEXT, "bio" TEXT)');
    const literal80 = "ÜNİVERSİTE".repeat(7) + "%_\\SONUÇAB";
    const injection = "ÇÖĞÜŞ %_\\ ' OR 1=1 --";
    const rows = [];
    for (const [index, field] of ["name", "handle", "department", "bio"].entries()) {
      const exact = ["", "", "", ""], tail = ["", "", "", ""];
      exact[index] = `önce ${literal80} sonra`;
      tail[index] = literal80.slice(0, -1) + "X";
      rows.push([`exact-${field}`, ...exact], [`tail-${field}`, ...tail]);
    }
    rows.push(
      ["prefix-only", literal80.slice(0, 48), "", "", ""],
      ["wildcard-decoy", literal80.replace("%_\\", "XYZ"), "", "", ""],
      ["literal-injection", "", "", "", `önce ${injection} sonra`],
      ["turkish", "IĞDIR ŞÜKRÜ İZMİR ÇÖĞÜŞ", "", "", ""],
    );
    await db.batch(rows.map(row => db.prepare('INSERT INTO "search documents" VALUES (?, ?, ?, ?, ?)').bind(...row)));

    async function search(needle) {
      const query = queryFor(needle);
      assert.equal(query.params.length, 4, "only the complete query is bound once per field; Turkish replacement constants must not inflate bindings");
      assert.ok(query.params.length < 100, "the four-field predicate remains below D1's parameter limit");
      assert.ok(query.params.every(value => value === needle.normalize("NFC").toLocaleLowerCase("tr-TR")));
      assert.equal(query.sql.includes(needle), false, "user input must not be interpolated into SQL");
      const result = await db.prepare(query.sql).bind(...query.params).all();
      assert.equal(result.success, true);
      return result.results.map(row => row.id);
    }

    await t.test("quoted table alias and space-containing column names remain SQL identifiers", async () => {
      const query = queryFor(literal80);
      assert.ok(query.sql.includes('FROM "search documents" AS "candidate""profile"'));
      for (const column of ["display name", "handle", "department", "bio"]) {
        assert.ok(query.sql.includes(`"candidate""profile"."${column}"`), `${column} must retain its qualified column reference`);
      }
      assert.deepEqual(await search(literal80), ["exact-bio", "exact-department", "exact-handle", "exact-name"]);
    });

    await t.test("80 Unicode characters including percent, underscore and backslash match fully in all four fields", async () => {
      assert.equal(literal80.length, 80);
      assert.ok(Buffer.byteLength(literal80) > 50);
      assert.deepEqual(await search(literal80.normalize("NFD")), ["exact-bio", "exact-department", "exact-handle", "exact-name"]);
      assert.deepEqual(await search(literal80 + " bulunmayan"), []);
    });

    await t.test("SQL-looking Unicode text is literal and cannot broaden matches or mutate D1", async () => {
      assert.deepEqual(await search(injection), ["literal-injection"]);
      assert.deepEqual(await search("'); DROP TABLE \"search documents\"; --"), []);
      assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM "search documents"').first()).count, rows.length);
    });

    await t.test("Turkish uppercase fields match decomposed query text and keep dotted I distinct", async () => {
      assert.deepEqual(await search("ığdır şükrü izmir çöğüş".normalize("NFD")), ["turkish"]);
      assert.deepEqual(await search("IĞDIR"), ["turkish"]);
      assert.deepEqual(await search("İZMİR"), ["turkish"]);
      assert.deepEqual(await search("iğdir"), []);
    });
  } finally {
    await runtime.dispose();
  }
});
