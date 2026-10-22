# platform/admin/

The **admin app**, served on the separate staff/admin host. One app, with screens shown according to the signed-in role.

**Status:** Planned — Sprint 1 (sold out and price for the demo), Sprint 2 (full editor, staff screen, accounts).

## What lives here

| Screen | Roles |
|---|---|
| Sign-in, "My devices", change password, reset with a one-time code | everyone |
| **Staff screen**: incoming orders, accept / ready / served / reject, pause ordering, "Start shift" | Staff, Manager, Admin |
| **Menu editor**: availability, prices, items, variants, translations, history and undo | Manager, Admin; Staff for availability; Maintainer at setup |
| **Manager dashboard**: sales through DigiMenu, best sellers, busy hours | Manager (own café), Admin |
| **Maintainer screens**: café settings, tables and QR cards, module switches, roll back a café | Maintainer (assigned cafés), Admin |
| **Admin overview**: releases, modules, health, quota alerts, impact export | Admin |
| **Customer records** and **privacy notice** editor | Admin only |

## Rules

- Permissions are **checked on the server**. Hiding a button is never the protection.
- Settings forms are **generated from JSON Schemas** (core and module settings), not hand-coded per module.
- FR/AR/EN with right-to-left layout for Arabic; usable on a 360 px phone in portrait and on a tablet in landscape.
- All customer text (names, notes) is displayed as plain text.
- Small Web Components only (e.g. a price input, language tabs); no UI framework ([ADR-0002](../../docs/adr/0002-cloudflare-worker-d1-plain-javascript.md)).

## Must not live here

- Customer-facing menu pages (they are in the release, see [`core/`](../../core/README.md)).
- Direct database access: the app talks only to the admin API of the [shell](../shell/README.md).

## Related

[Data model: roles](../../docs/architecture/data-model.md#roles-and-what-each-one-can-reach) · [ADR-0006](../../docs/adr/0006-accounts-passwords-and-roles.md) · [`platform/`](../README.md)
