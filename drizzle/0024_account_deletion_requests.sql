CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_review', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX account_deletion_one_open_request_idx ON account_deletion_requests(user_email)
  WHERE status IN ('requested', 'in_review');
--> statement-breakpoint
CREATE INDEX account_deletion_queue_idx ON account_deletion_requests(status, created_at, id);
--> statement-breakpoint
CREATE TABLE account_deletion_events (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES account_deletion_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('requested', 'in_review', 'cancelled')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'staff')),
  staff_id TEXT REFERENCES staff_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (request_id, status)
);
