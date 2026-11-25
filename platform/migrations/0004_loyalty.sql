-- 0004_loyalty: loyalty cards and their ledger (ADR-0013, D-064).
-- The customer is known by phone number (customers.phone_idx); no phone number is stored here.

CREATE TABLE loyalty_cards (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  customer_id TEXT NOT NULL REFERENCES customers (id),
  -- Short code staff type or read from the card (no 0/O, 1/I/L, 5/S, B/8 mix-ups).
  number TEXT NOT NULL,
  -- The card page's secret: only its hash is used for lookup; the sealed copy lets a retried
  -- order (same client key, same phone) receive it again.
  token_sha256 TEXT NOT NULL UNIQUE,
  token_ct TEXT NOT NULL,
  created_order_id TEXT REFERENCES orders (id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  -- A one-time code staff give to move the card to a new phone (sha256, valid 15 minutes).
  transfer_sha256 TEXT,
  transfer_until TEXT,
  google_object_id TEXT,
  apple_serial TEXT,
  created_at TEXT NOT NULL,
  left_at TEXT,
  UNIQUE (cafe_id, customer_id),
  UNIQUE (cafe_id, number)
);

-- Every stamp, reward used and reversal. units = stamps (a reward uses the stamps it needed).
CREATE TABLE loyalty_ledger (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  card_id TEXT NOT NULL REFERENCES loyalty_cards (id),
  kind TEXT NOT NULL CHECK (kind IN ('earn', 'redeem', 'reverse')),
  units INTEGER NOT NULL CHECK (units > 0),
  order_id TEXT REFERENCES orders (id),
  source TEXT NOT NULL CHECK (source IN ('order', 'staff', 'customer')),
  staff_user_id TEXT,
  at TEXT NOT NULL
);
CREATE INDEX loyalty_cards_transfer ON loyalty_cards (cafe_id, transfer_sha256) WHERE transfer_sha256 IS NOT NULL;
CREATE INDEX loyalty_ledger_card ON loyalty_ledger (card_id, at);
-- At most one stamp and one reversal per order.
CREATE UNIQUE INDEX loyalty_ledger_order ON loyalty_ledger (order_id, kind) WHERE order_id IS NOT NULL;

UPDATE schema_meta SET data_schema_version = 4, migrated_at = datetime('now') WHERE id = 1;
