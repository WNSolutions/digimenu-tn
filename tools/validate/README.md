# tools/validate/

The **configuration validator** as a command-line tool. It is the same validator package the server runs at publish time, the admin app runs while you type, and the pin pre-flight runs before a café changes release: one set of rules, four places.

**Status:** Planned — Sprint 1, with the module registry.

## What it checks

1. The café configuration matches [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json).
2. Every enabled module exists in the café's release and its version is compatible.
3. Dependencies, conflicts, one enabled channel per order type, default language enabled.
4. Each module's settings against its own settings schema, with defaults filled in.
5. Each module's own business rules.
6. Warnings: missing translations, missing Google review link, tables without check codes.

Errors stop publishing (exit code 1) and name what is wrong in plain words, e.g. "preorder needs order_types with takeaway on". Warnings are printed but do not fail.

## Rules

- No rule lives only here: every check is in the shared validator package, so the server and the tool always agree.
- Messages are written for a maintainer, not a developer, in English and French.

## Must not live here

- Real café configurations (pass them as a file path from the private deploy repository).

## Related

[Module system: validation](../../docs/architecture/modules.md#per-café-configuration-and-validation) · [`tools/`](../README.md)
