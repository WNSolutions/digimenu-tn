# cafes/_template/

The **onboarding template**: the files a maintainer fills in to bring a new café online, without writing code (US-33: live in at most 2 hours once the content is ready).

**Status:** Planned — template files and guide by the end of Sprint 3 (used for the pilot cafés), polished for toolkit v1.0.

## Planned files

| File | Contains | Checked by |
|---|---|---|
| `info.json` | café configuration seed: slug, names FR/AR/EN, languages, hours, ordering types, modules from the standard template, dine-in details setting, Google review link, starting release | [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json) |
| `menu.csv` (or `menu.xlsx`) | one row per item or variant: category, sub-group, names FR/AR/EN, description, price in dinars with 3 decimals, availability | [`tools/import/`](../../tools/import/README.md) |
| `tables.csv` | one row per table label (e.g. `1`–`18`, `T1`–`T6`) | [`tools/qr/`](../../tools/qr/README.md) |
| `CHECKLIST.md` | what to collect at the café visit, and the steps to go live | — |

## How it is used

1. A maintainer copies the template into the **private deploy repository**: `cafes/<slug>/onboarding/`.
2. The café's content is filled in there, never in this public repository.
3. The import tool and the validator check it; Admin approves the configuration; the café goes live on its starting release.

## Rules

- The template holds **placeholders only**, never real content.
- New cafés start from the standard modules: `order_types` (dine-in), `send_order`, `languages`, and `google_review` when the café has a review link.
- The manager account is created in the admin app; **passwords are never written in any file**.

## Must not live here

- A filled-in template for a real café.

## Related

[`cafes/`](../README.md) · [ADR-0003](../../docs/adr/0003-public-toolkit-and-private-deploy-repo.md)
