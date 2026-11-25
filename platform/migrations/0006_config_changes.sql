-- Module switches and kill switch (issue #21, MOD-05, MOD-06, MOD-16): every switch makes a new
-- configuration version that says what changed; a Maintainer's "on" at a live café waits as a
-- draft until Admin approves or refuses it. Additive: nullable columns.
ALTER TABLE config_versions ADD COLUMN change TEXT;
ALTER TABLE config_versions ADD COLUMN decided_by TEXT;
ALTER TABLE config_versions ADD COLUMN decided_at TEXT;
ALTER TABLE config_versions ADD COLUMN decision TEXT;

UPDATE schema_meta SET data_schema_version = 6, migrated_at = datetime('now') WHERE id = 1;
