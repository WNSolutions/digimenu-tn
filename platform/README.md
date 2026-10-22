# platform/

The **shared runtime** that every café uses, whatever release it is pinned to. It changes rarely and carefully.

**Status:** Planned — first code in Sprint 1 (spike and boot path).

## What lives here

| Folder | Contents |
|---|---|
| [`shell/`](shell/README.md) | Worker entry point: routing, café lookup, release dispatcher, sign-in and roles, config validator, data access, visit counting, boot page, café home page |
| [`hub/`](hub/README.md) | The café hub Durable Object (live orders over WebSockets) and the scheduled jobs |
| [`admin/`](admin/README.md) | The admin app: staff screen, menu editor, dashboards, maintainer and Admin screens |
| [`migrations/`](migrations/README.md) | Numbered SQL migrations for the D1 database |

## Rules

- **Shared by all cafés, not pinned.** A change here reaches every café at once, so it must work with **every release in the window** and needs extra care in review ([releases](../docs/architecture/releases.md)).
- The platform exposes a versioned `platformApi` (an integer) that releases call. Breaking it means a new `platformApi` number and a plan for the releases in the window.
- Keep it small. Customer-facing features belong in [`core/`](../core/README.md) or in a [module](../modules/README.md).
- Café scope is checked on every query, and roles on every request.

## Must not live here

- Code for one particular café (MOD-15).
- Optional features (they are modules).
- Secrets, real café data, personal data.

## Related

[Architecture overview](../docs/architecture/overview.md) · [ADR-0002](../docs/adr/0002-cloudflare-worker-d1-plain-javascript.md)
