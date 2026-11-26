-- Menu editor and restore (issue #20, US-27, C-08): each published revision keeps the whole
-- menu tree as staff edit it (hidden categories and sold-out entries included), so any recent
-- revision can be restored; and every change records the account that made it. The last 50
-- trees per café are kept. Additive.
CREATE TABLE menu_sources (
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  rev INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cafe_id, rev)
);

ALTER TABLE menu_changes ADD COLUMN actor TEXT;

UPDATE schema_meta SET data_schema_version = 7, migrated_at = datetime('now') WHERE id = 1;
