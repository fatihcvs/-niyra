CREATE TABLE post_publish_requests (
  id TEXT PRIMARY KEY NOT NULL,
  author_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  idempotency_key TEXT,
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  post_id TEXT NOT NULL UNIQUE,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (author_email, idempotency_key)
);
--> statement-breakpoint
CREATE TABLE post_publish_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES post_publish_requests(id) ON DELETE CASCADE,
  object_key TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'committed', 'cleanup', 'cleaned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX post_publish_attempts_request_state_idx ON post_publish_attempts(request_id, state);
