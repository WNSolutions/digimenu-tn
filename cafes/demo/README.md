# cafes/demo/ — Café Démo Jasmin

A **fictional** café (FR "Café Démo Jasmin", AR "مقهى ياسمين التجريبي", EN "Jasmin Demo Café") that shows everything DigiMenu can do without exposing any real business. Its slug is `demo`, so its table links look like `/demo/t/5`.

**Status:** configuration, menu and tables ready; pictures planned with the `photos` module. Try it with `npm run dev` or `npm run demo`.

## What the demo contains

| Part | Content | Status |
|---|---|---|
| [`info.json`](info.json) | Names in FR/AR/EN, opening hours, three languages, dine-in through the staff screen, takeaway through WhatsApp hand-off, a few modules switched on and some off | Ready (draft v0) |
| [`menu.csv`](menu.csv) | 24 items (29 prices) in 6 categories (coffees, teas, juices, pastries, breakfast, snacks) with size variants, two items sold out, and a few **missing translations on purpose**. Columns: see [`tools/import/`](../../tools/import/README.md) | Ready |
| [`tables.csv`](tables.csv) | Tables `1` to `10` and `T1`, `T2` (terrace), each with a public demo check code | Ready |
| `media/` | Logo and item pictures made for the demo, under a free licence | Planned (with the `photos` module) |

## What it is used for

- **Previews and milestones:** every pull request preview shows the demo café.
- **Workshops:** trainees scan its table cards, mark an item sold out, change a price, print a QR card, and fix a planted error.
- **Tests:** end-to-end and accessibility tests run against it; screenshots in the docs come from it.

## Rules

- Everything here is **invented**. No real names, addresses, phone numbers or brands. The WhatsApp hand-off uses a dummy number that cannot reach anyone.
- Demo check codes are public, so the demo café never matters for security tests of real cafés.
- Orders at the demo café are **test orders**: they never create customer records and are excluded from analytics.
- Keep [`info.json`](info.json) valid against [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json).

## Must not live here

- Copies of a real café's menu, logo or photos, even edited.

## Related

[`cafes/`](../README.md) · [ADR-0003](../../docs/adr/0003-public-toolkit-and-private-deploy-repo.md)
