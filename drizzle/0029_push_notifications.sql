CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES user_sessions(token_hash) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('web', 'fcm')),
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  token TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_email, session_hash, device_id),
  CHECK((kind = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND token IS NULL)
     OR (kind = 'fcm' AND endpoint IS NULL AND p256dh IS NULL AND auth IS NULL AND token IS NOT NULL))
);
CREATE INDEX push_subscriptions_owner_session_idx ON push_subscriptions(owner_email, session_hash);

CREATE TABLE push_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'sending', 'sent', 'expired', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_ms INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_ms INTEGER NOT NULL DEFAULT ((unixepoch() + 86400) * 1000),
  lease_token TEXT,
  lease_until_ms INTEGER,
  last_status INTEGER,
  finished_ms INTEGER,
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX push_deliveries_due_idx ON push_deliveries(state, next_attempt_ms, lease_until_ms);

-- Covers notifications created by ordinary routes AND notifications inside atomic D1 batches.
-- Subscription enrollment never backfills historical notifications.
CREATE TRIGGER notifications_enqueue_push AFTER INSERT ON notifications
BEGIN
  INSERT INTO push_deliveries (id, notification_id, subscription_id)
  SELECT lower(hex(randomblob(16))), NEW.id, subscription.id
  FROM push_subscriptions subscription
  JOIN user_sessions session ON session.token_hash = subscription.session_hash AND session.user_email = NEW.user_email
  JOIN users recipient ON recipient.email = NEW.user_email
  WHERE subscription.owner_email = NEW.user_email AND recipient.status = 'active'
    AND datetime(session.expires_at) > CURRENT_TIMESTAMP AND NEW.read_at IS NULL
    AND (NEW.actor_email IS NULL OR NEW.actor_email != NEW.user_email);
END;
