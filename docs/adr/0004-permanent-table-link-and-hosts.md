# ADR-0004: Permanent table link `digimenu.wnsolutions.tn/<café>/t/<table>`, and the host layout

| | |
|---|---|
| **Status** | Accepted — printed form frozen on Fri 13 Nov 2026 |
| **Date** | 2026-10-21 (link form decided 2026-10-14, brand and domain confirmed 2026-10-21) |
| **Source decisions** | D-025, D-037, D-024 · C-01, US-01, US-16, MOD-14, NFR-12, NFR-19, NFR-22(e) |
| **Deciders** | Ahmed (project lead) for the link form and domain; Software Architect for the staff/admin host name |

## Context

Every table gets a printed QR card. Once printed, its link **cannot change** without reprinting every card, so the link form is a permanent contract.

The v0.1 architecture draft proposed one subdomain per café (`<café>.<domain>/t/<n>`). That needs DNS work for every new café, which only the project lead can do, and it does not work on the free `workers.dev` address that replicators and our emergency fallback use. The project chose the brand Why Not Solutions and the domain `wnsolutions.tn`; other WNS products may later use other subdomains of it. The staff and admin app must live on a separate host so a bug on a public menu page can never reach a signed-in session.

## Decision

### 1. Printed link form

```text
https://digimenu.wnsolutions.tn/<café>/t/<table>?k=<code>
```

- The short address printed under the QR is `digimenu.wnsolutions.tn/<café>`; it opens the café's menu for browsing and show-to-waiter.
- `k` is the table's **check code**: 6 characters, Crockford base32, random per table, stored in the database, revocable one card at a time. It is on **every** printed card, even for a café with ordering off, so ordering can be switched on later without reprinting. Dine-in orders require it.
- The form is **frozen on Fri 13 Nov 2026**, before cards are designed and printed.

### 2. Café slugs

- Lowercase letters, digits and hyphens, 2 to 32 characters (`^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$`).
- **Permanent** once a card is printed. Never reused for another café.
- Slugs share the first path segment with platform routes, so these words are reserved: `admin`, `api`, `app`, `assets`, `health`, `help`, `hooks`, `login`, `r`, `reset`, `static`, `status`, `t`, `verify`, `www`. The list lives in [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json); adding to it is allowed only if no café uses the word.

### 3. Tables

- Table labels are never reused or renamed. A retired table still opens the menu, counted as "no table". A revoked check code still opens the menu but cannot send dine-in orders.
- The QR generator logs every printed link in the private deploy repository; every deploy re-opens all of them on preview.

### 4. Hosts

| Host | Purpose | Cookies |
|---|---|---|
| `digimenu.wnsolutions.tn` | landing page `/`, café home `/<café>`, table pages, release files `/r/…`, customer API `/api/…` | **none** |
| `digimenu-admin.wnsolutions.tn` | staff screen, menu editor, dashboards, maintainer and Admin screens, admin API | one host-only session cookie (`__Host-` prefix) |

We chose a **one-level** staff/admin host (`digimenu-admin.`) rather than `admin.digimenu.` because Cloudflare's free certificate covers `wnsolutions.tn` and its first-level subdomains, while a two-level name may need a paid certificate. The admin host is never printed, so it can change later without reprinting anything.

### 5. Portability

The domain and host names come from deployment configuration, never from code (NFR-19). A replicator without a domain uses the same path form on `workers.dev`. Optional extra host names per café (`cafes.hostnames`) stay possible for the future, but are never printed.

## Consequences

- **Positive:** no DNS work per café, so a trained youth can onboard a new café in under 2 hours; the same link works on `workers.dev`; one certificate covers everything; session cookies cannot leak to menu pages or to other WNS products.
- **Negative / costs:** all cafés share one browser origin, so storage is isolated by a key prefix (`dm:<café>:`) and there is one service worker. Slugs share the URL space with platform routes (reserved list above).
- **Verified (spike 0005, Oct 2026):** the table page is served as **one static file** for every `/<café>/t/<table>` path without running the Worker, so menus keep working when the request quota runs out. The asset setting `not_found_handling = "single-page-application"` does it; no rewrite rule is needed ([note 0005](../spikes/0005-free-plan.md)).
- **Risk:** the domain is a single point of failure for every printed card. Mitigations: buy 2–3 years if the budget line allows (D-024), name a renewal owner and a backup, set renewal reminders, keep the DNS zone on Cloudflare.

## Alternatives considered

| Option | Why not |
|---|---|
| Subdomain per café (`<café>.digimenu…`) | DNS work per café; does not work on `workers.dev`; little value for five cafés. |
| Opaque short codes (`/x/7QF3K2`) | Cannot be typed or read aloud; the café name in the address builds trust. |
| Table number typed by the customer | Slower, error-prone, and no per-table analytics; the QR should carry the table. |
| Staff/admin pages on the menu host (`/admin`) | A bug on a public page could reach staff sessions. |

## References

- [Releases: the permanent link contract](../architecture/releases.md#the-permanent-link-contract) · [overview: hosts and routes](../architecture/overview.md#hosts-and-routes)
- [ADR-0006](0006-accounts-passwords-and-roles.md) (sessions on the admin host)
