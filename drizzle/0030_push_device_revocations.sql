-- Native enrollment device identities are immutable consent+token generations.
-- Keep their retirement after metadata removal so an unknown, delayed POST cannot
-- resurrect an opt-out. Session deletion also removes the bounded ledger.
CREATE TABLE push_device_revocations (
  session_hash TEXT NOT NULL REFERENCES user_sessions(token_hash) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_hash, device_id)
);

CREATE TRIGGER push_native_retire_after_delete AFTER DELETE ON push_subscriptions
WHEN OLD.kind = 'fcm'
BEGIN
  INSERT OR IGNORE INTO push_device_revocations (session_hash, device_id)
  SELECT OLD.session_hash, OLD.device_id
  WHERE EXISTS (SELECT 1 FROM user_sessions WHERE token_hash = OLD.session_hash);
END;

CREATE TRIGGER push_native_reject_retired_device BEFORE INSERT ON push_subscriptions
WHEN NEW.kind = 'fcm' AND EXISTS (
  SELECT 1 FROM push_device_revocations WHERE session_hash = NEW.session_hash AND device_id = NEW.device_id
)
BEGIN
  SELECT RAISE(ABORT, 'Native push device generation ended');
END;
