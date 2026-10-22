# core/

The **customer-side core** of each release: what every café gets on the customer's phone. It is part of the release bundle, so each café runs the core of the release it is pinned to.

**Status:** Planned — Sprint 1 (menu, languages, list, show-to-waiter on the demo café).

## What lives here

- **Menu rendering:** category bar, sub-groups, items and variants, sold-out display, café header and info. The same render function runs in the browser and, for the café home page, at the edge.
- **My list:** add, quantities, note, saved on the phone per café (`dm:<café>:…`), versioned, re-checked against the current menu.
- **Checkout pipeline:** collects fields from modules, shows the privacy notice and choices, submits through the channel of the chosen order type, falls back to show-to-waiter.
- **Pricing:** integer millimes only, shared with the server so totals always match.
- **Language engine:** FR/AR/EN, right-to-left for Arabic, French fallback.
- **Core API** (`@digimenu/core-api`): the only thing modules may import.
- **Module registry:** loads exactly the modules enabled for the café.
- [`schemas/`](schemas/README.md): JSON Schema contracts. [`i18n/`](i18n/README.md): core interface texts.
- [`ui/`](ui/README.md): design tokens (CSS custom properties) and, later, shared styles and the icon sprite; rules in [docs/design](../docs/design/README.md).

## Rules

- **The core never imports from `modules/`.** Modules plug in only through [extension points](../docs/architecture/modules.md#extension-points).
- **Budget:** core script ≤ 20 KB gzipped; first visit ≤ 200 KB and ≤ 15 requests per café ([`tests/budget/`](../tests/budget/README.md)).
- Changes to the core API follow semver: adding is MINOR, breaking is MAJOR.
- No UI framework, no runtime dependencies without an ADR ([ADR-0002](../docs/adr/0002-cloudflare-worker-d1-plain-javascript.md)).
- Accessibility: WCAG 2.1 AA, tap targets ≥ 44 px, state never shown by colour only.

## Must not live here

- Café-specific code or texts (MOD-15).
- Optional features (they are [modules](../modules/README.md)).
- Server routing, sign-in or database access (they are in [`platform/`](../platform/README.md)).

## Related

[Architecture overview](../docs/architecture/overview.md) · [module system](../docs/architecture/modules.md)
