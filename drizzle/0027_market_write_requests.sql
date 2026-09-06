-- Keep the operation receipt when a listing, inquiry or price is deleted.
-- target_id intentionally has no entity FK: the same key must never resurrect content.
CREATE TABLE market_write_requests (
  owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
  university_id TEXT NOT NULL REFERENCES universities(id),
  action TEXT NOT NULL CHECK(action IN ('listing', 'inquiry', 'price')),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  target_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_email, idempotency_key)
);
CREATE INDEX market_write_requests_target_idx ON market_write_requests(action, target_id);
