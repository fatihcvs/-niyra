import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("all database migrations apply cleanly in order", async () => {
  const drizzleDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(drizzleDirectory))
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .sort();
  const database = new DatabaseSync(":memory:");

  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const fileName of migrationFiles) {
      const sql = await readFile(new URL(fileName, drizzleDirectory), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) database.exec(statement);
      }
    }

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);
    assert.deepEqual(
      [
        "courses",
        "departments",
        "faculties",
        "post_comments",
        "post_likes",
        "post_saves",
        "posts",
        "student_courses",
        "student_profiles",
        "universities",
        "user_follows",
        "users",
      ].sort(),
      tables.sort(),
    );
  } finally {
    database.close();
  }
});
