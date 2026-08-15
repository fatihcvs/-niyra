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

test("0005 repairs rows written before the faculty and public id columns existed", async () => {
  const drizzleDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(drizzleDirectory))
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .sort();
  const backfill = migrationFiles.find((fileName) => fileName.startsWith("0005"));
  const database = new DatabaseSync(":memory:");

  async function apply(fileName) {
    const sql = await readFile(new URL(fileName, drizzleDirectory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }

  try {
    for (const fileName of migrationFiles.filter((name) => name !== backfill)) {
      await apply(fileName);
    }

    // Rows in the shape the earlier schema produced: no faculty, no public id.
    database.exec(
      "INSERT INTO universities (id, name, short_name, city) VALUES ('omu', 'Ondokuz Mayıs Üniversitesi', 'OMÜ', 'Samsun')",
    );
    database.exec(
      "INSERT INTO departments (id, name) VALUES ('bilgisayar', 'Bilgisayar Mühendisliği'), ('pdr', 'Rehberlik ve Psikolojik Danışmanlık')",
    );
    database.exec(`INSERT INTO users (email, display_name, handle) VALUES
      ('ahmet@student.omu.edu.tr', 'ahmet', 'ahmet'),
      ('zeynep@omu.edu.tr', 'zeynep', 'zeynep'),
      ('disari@gmail.com', 'disari', 'disari'),
      ('tuzak@omu.edu.tr.evil.com', 'tuzak', 'tuzak')`);
    database.exec(
      "INSERT INTO student_profiles (user_email, university_id, department_id, class_year) VALUES ('ahmet@student.omu.edu.tr', 'omu', 'bilgisayar', 3)",
    );

    await apply(backfill);

    const users = database
      .prepare("SELECT email, campus_verified, public_id FROM users ORDER BY email")
      .all();
    const verifiedByEmail = Object.fromEntries(users.map((row) => [row.email, row.campus_verified]));
    assert.equal(verifiedByEmail["ahmet@student.omu.edu.tr"], 1);
    assert.equal(verifiedByEmail["zeynep@omu.edu.tr"], 1);
    assert.equal(verifiedByEmail["disari@gmail.com"], 0);
    assert.equal(verifiedByEmail["tuzak@omu.edu.tr.evil.com"], 0, "kampüs alan adı son ek olarak taklit edilemez");

    const publicIds = users.map((row) => row.public_id);
    assert.equal(publicIds.filter(Boolean).length, users.length, "her satır bir public id alır");
    assert.equal(new Set(publicIds).size, users.length, "public id değerleri benzersizdir");

    const departments = database.prepare("SELECT id, faculty_id FROM departments ORDER BY id").all();
    assert.deepEqual(Object.fromEntries(departments.map((row) => [row.id, row.faculty_id])), {
      bilgisayar: "muhendislik",
      pdr: "egitim",
    });

    // The join that made saved profiles look absent before the backfill.
    const readableProfiles = database
      .prepare(
        `SELECT COUNT(*) AS total FROM student_profiles sp
         JOIN users u ON u.email = sp.user_email
         JOIN departments d ON d.id = sp.department_id
         JOIN faculties f ON f.id = d.faculty_id`,
      )
      .get().total;
    assert.equal(readableProfiles, 1, "geri doldurmadan sonra profil okunabilir olmalı");
  } finally {
    database.close();
  }
});
