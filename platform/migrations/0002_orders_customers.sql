-- 0002_orders_customers: orders, customer records and consent (ADR-0007, ADR-0010).
-- Personal fields are encrypted by the Worker before they reach this database.

-- Number of the day, per café: one atomic counter row per café and local day.
CREATE TABLE order_counters (
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cafe_id, day)
);

-- One record per phone number across all WNS cafés. Only the last 3 digits are in clear.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  phone_idx TEXT NOT NULL UNIQUE,
  pii_ct TEXT NOT NULL,
  phone_last3 TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  first_order_at TEXT NOT NULL,
  last_order_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  client_key TEXT NOT NULL,
  day TEXT NOT NULL,
  number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('dine_in', 'takeaway')),
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'handoff', 'accepted', 'ready', 'served', 'rejected', 'unconfirmed', 'cancelled')),
  table_label TEXT,
  lines TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  customer_id TEXT REFERENCES customers (id),
  contact_ct TEXT,
  lang TEXT NOT NULL,
  release TEXT NOT NULL,
  menu_rev INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  ext TEXT NOT NULL DEFAULT '{}',
  is_test INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  closed_at TEXT,
  UNIQUE (cafe_id, client_key)
);
CREATE INDEX orders_cafe_day ON orders (cafe_id, day, status);

CREATE TABLE privacy_notice_versions (
  version_no INTEGER PRIMARY KEY,
  short_text TEXT NOT NULL,
  full_text TEXT NOT NULL,
  opt_in_text TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id),
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  order_id TEXT REFERENCES orders (id),
  purpose TEXT NOT NULL CHECK (purpose IN ('order_updates', 'marketing', 'loyalty')),
  granted INTEGER NOT NULL,
  notice_version INTEGER NOT NULL REFERENCES privacy_notice_versions (version_no),
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX consents_customer ON consents (customer_id, purpose);

-- Keyed hashes of phones that must never be messaged again (survive deletion).
CREATE TABLE suppressions (
  phone_idx TEXT PRIMARY KEY,
  since TEXT NOT NULL
);

UPDATE schema_meta SET data_schema_version = 2, migrated_at = datetime('now') WHERE id = 1;
