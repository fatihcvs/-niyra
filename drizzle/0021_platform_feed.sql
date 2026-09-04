-- Keep existing and legacy-client posts inside their original campus audience.
ALTER TABLE posts ADD COLUMN audience TEXT NOT NULL DEFAULT 'campus' CHECK (audience IN ('campus', 'platform'));
--> statement-breakpoint
CREATE INDEX posts_audience_created_idx ON posts (audience, created_at, id);
