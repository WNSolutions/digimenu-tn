-- 0001_init: platform, configuration, menu and analytics (docs/architecture/data-model.md).
-- Orders, customers and accounts arrive in later migrations with their features (expand only).
-- No real data here: cafés are added with tools/seed/ from their private folders.

CREATE TABLE schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_schema_version INTEGER NOT NULL,
  migrated_at TEXT NOT NULL
);
INSERT INTO schema_meta (id, data_schema_version, migrated_at) VALUES (1, 1, datetime('now'));

-- Releases known to the deployment (the release window holds up to 3).
CREATE TABLE releases (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'stable', 'previous', 'retired')),
  platform_api INTEGER NOT NULL,
  data_schema_min INTEGER NOT NULL,
  data_schema_max INTEGER NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE cafes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('demo', 'onboarding', 'live', 'paused', 'closed')),
  pinned_release TEXT NOT NULL REFERENCES releases (version),
  active_config_version INTEGER NOT NULL,
  menu_rev INTEGER NOT NULL DEFAULT 0,
  hostnames TEXT NOT NULL DEFAULT '[]',
  go_live_on TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE release_pins (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  release TEXT NOT NULL,
  previous_release TEXT,
  pinned_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  config_version INTEGER NOT NULL,
  pinned_at TEXT NOT NULL
);

-- Immutable published configurations; cafes.active_config_version points to one.
CREATE TABLE config_versions (
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  version_no INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  body TEXT NOT NULL,
  validation_report TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'superseded')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cafe_id, version_no)
);

-- Labels are never reused or renamed; a lost card gets a new code (code_version + 1).
CREATE TABLE tables (
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  label TEXT NOT NULL,
  check_code TEXT NOT NULL,
  code_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (cafe_id, label)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  sort INTEGER NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX categories_cafe ON categories (cafe_id, sort);

CREATE TABLE sub_groups (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  sort INTEGER NOT NULL,
  title TEXT,
  description TEXT
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  sub_group_id TEXT REFERENCES sub_groups (id),
  sort INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  ext TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX items_cafe ON items (cafe_id, category_id, sort);

-- Every item has at least one variant; price in integer millimes.
CREATE TABLE variants (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  item_id TEXT NOT NULL REFERENCES items (id),
  sort INTEGER NOT NULL,
  name TEXT,
  price INTEGER NOT NULL CHECK (price >= 0 AND price <= 9999999),
  available INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX variants_item ON variants (item_id, sort);

-- Published menu revisions, built by the café's pinned release.
CREATE TABLE menu_snapshots (
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  rev INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  built_by_release TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cafe_id, rev)
);

CREATE TABLE menu_changes (
  id TEXT PRIMARY KEY,
  cafe_id TEXT NOT NULL REFERENCES cafes (id),
  rev INTEGER NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  before TEXT,
  after TEXT,
  actor_role TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('editor', 'import', 'undo', 'migration', 'seed')),
  at TEXT NOT NULL
);
CREATE INDEX menu_changes_cafe ON menu_changes (cafe_id, rev);

-- One counter per café, day, hour, metric and dimension. No cookies, IPs or device ids.
CREATE TABLE analytics_counters (
  cafe_id TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  metric TEXT NOT NULL,
  dim TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cafe_id, day, hour, metric, dim)
);

-- Append-only: account, configuration, release and customer-data actions.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  cafe_id TEXT,
  target TEXT,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);
