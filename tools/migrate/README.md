# tools/migrate/

The **database migration runner**: applies the SQL files in [`platform/migrations/`](../../platform/migrations/README.md) safely, with a backup and a way back.

**Status:** Planned for toolkit v1.0. Until then, migrations follow the manual procedure: export the database, apply the SQL file, keep D1 Time Travel (7 days) as a last resort ([releases](../../docs/architecture/releases.md#database-migrations)).

## Planned commands

| Command | Does |
|---|---|
| `plan` | Applies the migration to a local copy and prints the difference: rows per table and café, sum of prices in millimes per café, a sample of changed rows |
| `backup` | Exports the database as an encrypted workflow artifact and records the Time Travel timestamp |
| `apply` | Runs the migration on the target database |
| `verify` | Re-computes the `plan` checksums and compares them |
| `undo` | Runs the paired down-migration, or restores the backup |

## Rules

- Migrations run **only** through this tool or the documented manual procedure, **never** as part of a code deploy.
- `plan` must pass before `apply`; production `apply` needs Admin.
- Backups that contain personal data are encrypted and never committed to git ([ADR-0010](../../docs/adr/0010-customer-data-consent-and-deletion.md)).

## Must not live here

- SQL migration files (they live in `platform/migrations/`).
- Database exports or backups.

## Related

[Data model](../../docs/architecture/data-model.md) · [`tools/`](../README.md)
