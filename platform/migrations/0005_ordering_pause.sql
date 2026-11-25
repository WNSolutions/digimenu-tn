-- Pause orders (issue #29, US-17): staff stop new orders in a rush; customers see "ask your
-- waiter" within a minute. Additive: a nullable column, empty means orders are open.
ALTER TABLE cafes ADD COLUMN ordering_paused_at TEXT;

UPDATE schema_meta SET data_schema_version = 5, migrated_at = datetime('now') WHERE id = 1;
