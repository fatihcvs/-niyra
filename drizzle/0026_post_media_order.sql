-- Existing single-file posts retain ordinal 0. Existing multi-row data keeps its prior
-- created_at/id tie-break; no unverified ordering or storage backfill is performed.
ALTER TABLE post_media ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0 CHECK (typeof(ordinal) = 'integer' AND ordinal BETWEEN 0 AND 3);
--> statement-breakpoint
CREATE INDEX post_media_post_order_idx ON post_media(post_id, ordinal, created_at, id);
--> statement-breakpoint
-- The parent attempt fences all of its objects before publication or cleanup.
-- Legacy attempts still use post_publish_attempts.object_key and remain recoverable.
CREATE TABLE post_publish_attempt_media (
  attempt_id TEXT NOT NULL REFERENCES post_publish_attempts(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (typeof(ordinal) = 'integer' AND ordinal BETWEEN 0 AND 3),
  object_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY (attempt_id, ordinal)
);
