import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Log, LogLevel, Miniflare } from "miniflare";
import ts from "typescript";

const source = await readFile(new URL("../lib/search-query.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("actual Workerd D1 preserves literal full search queries beyond its LIKE pattern limit", async (t) => {
  const runtime = new Miniflare({
    modules: true,
    compatibilityDate: "2026-05-15",
    host: "127.0.0.1",
    port: 0,
    d1Databases: { DB: randomUUID() },
    d1Persist: false,
    log: new Log(LogLevel.ERROR),
    script: `${compiled}
      export default {
        async fetch(request, env) {
          const query = new URL(request.url).searchParams.get("q") ?? "";
          const result = await env.DB.prepare("SELECT id FROM documents WHERE " + searchContainsSql("body") + " ORDER BY id")
            .bind(searchNeedle(query)).all();
          return Response.json({ ids: result.results.map(row => row.id) });
        }
      };`,
  });
  try {
    const db = await runtime.getD1Database("DB");
    await db.exec("CREATE TABLE documents (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
    const long80 = "ÜNİVERSİTE".repeat(8);
    const long200 = "Çalışmaİ".repeat(25);
    const injection = "' OR 1=1 --";
    const rows = [
      ["long80", `başlangıç ${long80} son`],
      ["long80-prefix-only", long80.slice(0, 48)],
      ["long80-different-tail", long80.slice(0, -1) + "X"],
      ["long200", `başlangıç ${long200} son`],
      ["long200-prefix-only", long200.slice(0, 80)],
      ["long200-different-tail", long200.slice(0, -1) + "X"],
      ["literal-percent", "not %100 hazır"],
      ["percent-decoy", "not 100 hazır"],
      ["literal-underscore", "a_b"],
      ["underscore-decoy", "acb"],
      ["literal-backslash", String.raw`C:\ders\notlar`],
      ["backslash-decoy", "C:dersnotlar"],
      ["literal-injection", `önce ${injection} sonra`],
      ["turkish", "IĞDIR ŞÜKRÜ İZMİR ÇÖĞÜŞ"],
    ];
    await db.batch(rows.map(row => db.prepare("INSERT INTO documents (id, body) VALUES (?, ?)").bind(...row)));
    async function search(query) {
      const response = await runtime.dispatchFetch(`https://search-test.invalid/?${new URLSearchParams({ q: query })}`);
      assert.equal(response.status, 200, "the real D1-backed request must succeed without a shortened query");
      return (await response.json()).ids;
    }

    await t.test("baseline accepts a 50-byte LIKE pattern and rejects 49 ASCII characters plus two wildcards", async () => {
      const accepted = `%${"a".repeat(48)}%`, rejected = `%${"a".repeat(49)}%`;
      assert.equal(Buffer.byteLength(accepted), 50);
      assert.equal(Buffer.byteLength(rejected), 51);
      const result = await db.prepare("SELECT 1 AS matched WHERE ? LIKE ? ESCAPE '\\'").bind("a".repeat(48), accepted).all();
      assert.deepEqual(result.results, [{ matched: 1 }]);
      await assert.rejects(
        db.prepare("SELECT 1 AS matched WHERE ? LIKE ? ESCAPE '\\'").bind("a".repeat(49), rejected).all(),
        /LIKE or GLOB pattern too complex/i,
      );
    });

    await t.test("80 Unicode characters return 200 and exclude both a truncated prefix and a different final character", async () => {
      assert.equal(long80.length, 80);
      assert.ok(Buffer.byteLength(long80) > 50);
      assert.deepEqual(await search(long80), ["long80"]);
      assert.deepEqual(await search(long80 + " eksik"), []);
    });

    await t.test("200 Unicode characters remain an exact complete substring", async () => {
      assert.equal(long200.length, 200);
      assert.deepEqual(await search(long200), ["long200"]);
      assert.deepEqual(await search(long200 + " eksik"), []);
    });

    await t.test("percent, underscore and backslash are literal characters", async () => {
      assert.deepEqual(await search("%"), ["literal-percent"]);
      assert.deepEqual(await search("a_b"), ["literal-underscore"]);
      assert.deepEqual(await search("\\"), ["literal-backslash"]);
      assert.deepEqual(await search("%_\\"), []);
    });

    await t.test("SQL-looking text is a bound literal and cannot broaden results or remove the table", async () => {
      assert.deepEqual(await search(injection), ["literal-injection"]);
      assert.deepEqual(await search("'); DROP TABLE documents; --"), []);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM documents").first()).count, rows.length);
    });

    await t.test("Turkish case and decomposed query input match NFC stored text without merging dotted and dotless I", async () => {
      assert.deepEqual(await search("ığdır şükrü izmir çöğüş".normalize("NFD")), ["turkish"]);
      assert.deepEqual(await search("IĞDIR"), ["turkish"]);
      assert.deepEqual(await search("İZMİR"), ["turkish"]);
      assert.deepEqual(await search("iğdir"), []);
    });
  } finally {
    await runtime.dispose();
  }
});
