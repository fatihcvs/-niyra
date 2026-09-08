CREATE TABLE beta_requests (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('application','feedback')),
  access_hash TEXT NOT NULL UNIQUE,
  submission_hash TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  university TEXT NOT NULL DEFAULT '',
  device_model TEXT NOT NULL DEFAULT '',
  android_version TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'application',
  subject TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  adult_confirmed INTEGER NOT NULL DEFAULT 0,
  android_confirmed INTEGER NOT NULL DEFAULT 0,
  participation_confirmed INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT NOT NULL,
  source_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','needs_info','ready','invited','testing','completed','declined','withdrawn','triaged','in_progress','resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
  internal_note TEXT NOT NULL DEFAULT '',
  play_url TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+90 days'))
);
CREATE INDEX beta_requests_queue_idx ON beta_requests(kind,status,created_at,id);
CREATE INDEX beta_requests_email_idx ON beta_requests(email,created_at);
CREATE INDEX beta_requests_expiry_idx ON beta_requests(expires_at);
CREATE TABLE beta_request_messages (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES beta_requests(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK(author_kind IN ('applicant','staff','automation')),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX beta_request_messages_request_idx ON beta_request_messages(request_id,created_at,id);
