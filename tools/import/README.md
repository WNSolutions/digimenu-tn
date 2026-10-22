# tools/import/

The **menu import tool**: reads a café's menu from the spreadsheet template (CSV, or XLSX saved as CSV) and loads it into the database through the admin API.

**Status:** Planned — Sprint 1 (demo café), used for the real menus in Sprint 2.

## What it does

1. Reads `menu.csv` from the café's onboarding folder ([template](../../cafes/_template/README.md)).
2. Checks every row: required French name, price with at most 3 decimals ("4,5", "4.500" and "4500" all mean 4,500 DT), known category, valid variants.
3. **Skips bad rows and reports them** in plain language; the rest of the menu still loads (MOD-12).
4. Writes the menu as a new menu revision, logged with source `import`, so it can be undone.
5. Lists missing Arabic and English translations.

## Rules

- Prices are converted to integer millimes once, here; nothing downstream parses prices again.
- The import goes through the admin API and its permission checks, never straight into the database.
- A dry-run mode shows what would change without writing anything.

## Must not live here

- Real menu files: they stay in the private deploy repository.

## Related

[Data model](../../docs/architecture/data-model.md) · [`tools/`](../README.md)
