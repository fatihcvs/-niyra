-- Optional display dimensions derived from the uploaded image headers (including EXIF orientation).
-- Existing rows remain NULL; no unverified backfill or object-storage rewrite.
ALTER TABLE post_media ADD COLUMN width INTEGER CHECK (width IS NULL OR (typeof(width) = 'integer' AND width BETWEEN 1 AND 65535));
--> statement-breakpoint
ALTER TABLE post_media ADD COLUMN height INTEGER CHECK (height IS NULL OR (typeof(height) = 'integer' AND height BETWEEN 1 AND 65535));
