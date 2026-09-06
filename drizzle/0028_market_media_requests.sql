-- Receipts and object manifests intentionally survive listing/image deletion.
CREATE TABLE market_media_requests (
  owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
  university_id TEXT NOT NULL REFERENCES universities(id),
  listing_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  current_attempt_id TEXT,
  committed_attempt_id TEXT,
  response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_email, idempotency_key),
  CHECK((committed_attempt_id IS NULL) = (response_json IS NULL))
);
CREATE INDEX market_media_requests_listing_idx ON market_media_requests(listing_id);

CREATE TABLE market_media_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  puts_settled INTEGER NOT NULL DEFAULT 0 CHECK(puts_settled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_email, idempotency_key) REFERENCES market_media_requests(owner_email, idempotency_key) ON DELETE CASCADE
);
CREATE INDEX market_media_attempts_request_idx ON market_media_attempts(owner_email, idempotency_key);

CREATE TABLE market_media_attempt_objects (
  image_id TEXT PRIMARY KEY NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES market_media_attempts(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 5),
  object_key TEXT NOT NULL UNIQUE,
  cleaned_at TEXT,
  UNIQUE(attempt_id, ordinal)
);

CREATE TABLE market_media_tombstones (
  image_id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  university_id TEXT NOT NULL REFERENCES universities(id),
  listing_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  cleaned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX market_media_tombstones_cleanup_idx ON market_media_tombstones(owner_email, university_id, cleaned_at);
