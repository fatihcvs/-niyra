ALTER TABLE beta_requests ADD COLUMN platform TEXT NOT NULL DEFAULT 'android' CHECK(platform IN ('web','android','both'));

CREATE TABLE test_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_email TEXT NOT NULL UNIQUE REFERENCES users(email) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('generated','applicant','existing-beta')),
  status TEXT NOT NULL CHECK(status IN ('pending','active','revoked')),
  recipient_hash TEXT UNIQUE,
  issuance_nonce TEXT,
  source_application_id TEXT UNIQUE REFERENCES beta_requests(id) ON DELETE SET NULL,
  created_by_staff_id TEXT REFERENCES staff_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX test_accounts_created_idx ON test_accounts(created_at,id);

CREATE TABLE test_account_operations (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT REFERENCES test_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('create','reset')),
  request_hash TEXT NOT NULL,
  operation_nonce TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE test_account_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES test_accounts(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL UNIQUE REFERENCES beta_requests(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  token_nonce TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','sent','unknown','cancelled')),
  lease_hash TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+3 days'))
);
CREATE INDEX test_account_outbox_queue_idx ON test_account_outbox(state,created_at,id);
CREATE TABLE test_account_activations (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES test_accounts(id) ON DELETE CASCADE,
  outbox_id TEXT NOT NULL UNIQUE REFERENCES test_account_outbox(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE,
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+3 days')),
  consumed_at TEXT
);

-- Preserve every existing active account, its credentials, sessions and content.
INSERT INTO test_accounts(id,user_email,kind,status)
  SELECT 'existing-' || COALESCE(public_id,lower(hex(randomblob(16)))) ,email,'existing-beta','active' FROM users WHERE status='active';
INSERT INTO platform_settings(key,value_json) VALUES('betaAccessOnly','false') ON CONFLICT(key) DO NOTHING;

CREATE TRIGGER test_account_application_withdrawn AFTER UPDATE OF status ON beta_requests
WHEN NEW.status='withdrawn' AND OLD.status!='withdrawn'
BEGIN
  UPDATE test_accounts SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE source_application_id=NEW.id;
  DELETE FROM user_sessions WHERE user_email IN (SELECT user_email FROM test_accounts WHERE source_application_id=NEW.id);
  UPDATE test_account_activations SET token_hash=NULL WHERE account_id IN (SELECT id FROM test_accounts WHERE source_application_id=NEW.id);
  UPDATE test_account_outbox SET state='cancelled',recipient_email='',token_nonce='',lease_hash=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE application_id=NEW.id;
END;
CREATE TRIGGER test_account_application_expired BEFORE DELETE ON beta_requests
BEGIN
  UPDATE test_accounts SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE source_application_id=OLD.id AND status='pending';
  UPDATE test_account_activations SET token_hash=NULL WHERE account_id IN (SELECT id FROM test_accounts WHERE source_application_id=OLD.id);
END;
CREATE TRIGGER test_account_user_frozen AFTER UPDATE OF status ON users
WHEN NEW.status!='active'
BEGIN
  UPDATE test_account_activations SET token_hash=NULL WHERE account_id IN (SELECT id FROM test_accounts WHERE user_email=NEW.email);
  UPDATE test_account_outbox SET state='cancelled',recipient_email='',token_nonce='',lease_hash=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE account_id IN (SELECT id FROM test_accounts WHERE user_email=NEW.email);
END;
