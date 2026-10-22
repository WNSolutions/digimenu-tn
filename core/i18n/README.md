# core/i18n/

**Interface texts of the core**, one file per language: `fr.json`, `ar.json`, `en.json`. Texts live outside the code, so adding or correcting a language never touches code (MOD-17).

**Status:** Planned — Sprint 1.

## What lives here

- Keys and texts for the core screens: menu, list, checkout, show-to-waiter, errors, privacy notice labels.
- Example key style: `list.empty`, `checkout.confirm`, `item.soldOut` (FR "Épuisé", AR "غير متوفر", EN "Sold out").

## Rules

- **The three files have exactly the same keys.** CI fails otherwise. French is the fallback when a text is missing.
- Plain text only: no HTML in strings. Placeholders use `{name}` style.
- Prices use Western digits in every language ("4,500 DT"); phone numbers stay left-to-right inside Arabic text.
- Write for customers on a phone: short, friendly, no jargon. Arabic texts are reviewed by a native speaker before a release.
- Machine translation is never published without human review.

## Must not live here

- Module texts: each module keeps its own `i18n/` folder in `modules/<key>/`.
- Menu content (item names and descriptions are café data in the database).
- Café-specific wording.

## Related

[`core/`](../README.md) · [module system](../../docs/architecture/modules.md)
