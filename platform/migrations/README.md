# platform/migrations/

Numbered **SQL migrations** for the D1 database. They change the shape of the database; they never carry real data.

**Status:** [`0001_init.sql`](0001_init.sql) platform, configuration, menu and analytics tables · `0002` orders, customers, consents, privacy notice · `0003` accounts, sessions, one-time codes · `0004` loyalty cards and ledger · [`0005_ordering_pause.sql`](0005_ordering_pause.sql) pause orders (#29) · [`0006_config_changes.sql`](0006_config_changes.sql) what each configuration version changed, and Admin's decision on a Maintainer's request (#21).

## What lives here

```text
platform/migrations/
├── 0001_init.sql          first schema
├── 0002_<what>.sql        each later change, numbered in order
└── down/
    └── 0002_<what>.down.sql   the paired undo, where one is possible
```

## Rules

- **Expand, then contract.** First add tables or nullable/defaulted columns; never rename or drop in the same step. Drop an old field only when no release in the window still uses it (at least one MAJOR release later).
- **Never edit a migration that has been merged.** Write a new one.
- Migrations are run by the migration tool or the documented manual procedure, **never by a code deploy** ([releases](../../docs/architecture/releases.md#database-migrations)). Until v1.0: export the database first, apply, keep D1 Time Travel as a last resort.
- Every migration is tested on a fresh database and forward/back on the fixtures.
- Keep writes cheap: at most 2 secondary indexes on `orders`; counters instead of raw event rows.

## Must not live here

- Seed data for real cafés, or any personal data.
- Data fixes for one café (do them through the app or the import tool, which log the change).

## Related

[Data model](../../docs/architecture/data-model.md) · [`tools/migrate/`](../../tools/migrate/README.md) · [`platform/`](../README.md)
