-- 0003_accounts: staff accounts, roles and sessions (ADR-0006).
-- Passwords are stretched in the browser (PBKDF2-SHA256) and peppered here (HMAC, Worker secret).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT,
  iterations INTEGER NOT NULL DEFAULT 600000,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL
);

-- Role per café; admin has cafe_id '' (all cafés).
CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users (id),
  cafe_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'maintainer')),
  PRIMARY KEY (user_id, cafe_id)
);

CREATE TABLE sessions (
  token_sha256 TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  device_label TEXT NOT NULL DEFAULT '',
  remember INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One-time codes for a first password or a reset; stored as SHA-256, few tries, single use.
CREATE TABLE reset_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  code_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX reset_codes_user ON reset_codes (user_id);

UPDATE schema_meta SET data_schema_version = 3, migrated_at = datetime('now') WHERE id = 1;
