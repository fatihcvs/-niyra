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
        "account_deletion_requests",
        "account_deletion_events",
        "account_erasure_jobs",
        "account_erasure_subjects",
        "account_erasure_objects",
        "account_erasure_entities",
        "media_upload_operations",
        "audit_logs",
        "campus_pulse_posts",
        "campus_pulse_reactions",
        "campus_events",
        "campus_place_confirmations",
        "campus_places",
        "campus_price_reports",
        "communities",
        "community_audit_logs",
        "community_bans",
        "community_event_attendees",
        "community_events",
        "community_members",
        "community_post_meta",
        "content_reports",
        "courses",
        "departments",
        "direct_conversations",
        "direct_messages",
        "faculties",
        "housing_discussions",
        "library_areas",
        "library_checkins",
        "market_write_requests",
        "market_media_requests",
        "market_media_attempts",
        "market_media_attempt_objects",
        "market_media_tombstones",
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
        "post_media",
        "post_publish_requests",
        "post_publish_attempts",
        "post_publish_attempt_media",
        "post_saves",
        "posts",
        "product_events",
        "product_feedback",
        "push_subscriptions",
        "push_deliveries",
        "push_device_revocations",
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
