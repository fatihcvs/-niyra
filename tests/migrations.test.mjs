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
        "audit_logs",
        "campus_pulse_posts",
        "campus_pulse_reactions",
        "campus_events",
        "campus_place_confirmations",
        "campus_places",
        "campus_price_reports",
        "communities",
        "community_audit_logs",
        "community_members",
        "content_reports",
        "courses",
        "departments",
        "faculties",
        "housing_discussions",
        "library_areas",
        "library_checkins",
        "marketplace_inquiries",
        "marketplace_listing_images",
        "marketplace_listings",
        "meetup_requests",
        "note_saves",
        "note_feedback",
        "note_comments",
        "note_views",
        "notes",
        "notification_preferences",
        "notifications",
        "pilot_invites",
        "platform_roles",
        "post_comments",
        "post_likes",
        "post_saves",
        "posts",
        "product_events",
        "product_feedback",
        "profile_media",
        "rate_limit_windows",
        "platform_settings",
        "staff_accounts",
        "staff_audit_logs",
        "staff_sessions",
        "student_courses",
        "student_profiles",
        "student_social_profiles",
        "universities",
        "user_blocks",
        "user_credentials",
        "user_follows",
        "user_mutes",
        "user_sessions",
        "users",
      ].sort(),
      tables.sort(),
    );
  } finally {
    database.close();
  }
});
