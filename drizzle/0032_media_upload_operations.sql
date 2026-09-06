-- Independent of users/media cascades: an in-flight PUT must remain visible to erasure.
CREATE TABLE media_upload_operations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL,
  owner_public_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('notes', 'profile', 'pulse', 'post', 'market')),
  state TEXT NOT NULL DEFAULT 'putting' CHECK(state IN ('putting', 'settled', 'unknown')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT,
  CHECK((state = 'settled') = (settled_at IS NOT NULL))
);
CREATE INDEX media_upload_operations_owner_state_idx ON media_upload_operations(owner_email, state);
