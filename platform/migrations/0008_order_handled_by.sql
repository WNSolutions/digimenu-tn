-- Staff screen (issue #16, US-45): who last moved an order on, so every device shows
-- "Acceptée par Sami" and stops alerting. Additive: a nullable column.
ALTER TABLE orders ADD COLUMN handled_by TEXT;

UPDATE schema_meta SET data_schema_version = 8, migrated_at = datetime('now') WHERE id = 1;
