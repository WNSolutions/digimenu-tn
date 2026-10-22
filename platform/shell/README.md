# platform/shell/

The **Worker entry point**: everything that receives a request before any café-specific release code runs.

**Status:** Planned — Sprint 1 (boot path, release dispatcher, visit counting); Sprint 2 (sign-in and roles).

## What lives here

- **Router** for the path form `/<café>/…`, the landing page `/`, release files `/r/<version>/…` and the API `/api/…`; the admin host's routes.
- **Café resolver:** finds the café by slug, its pinned release, menu revision and active configuration (cached 30 s).
- **Release dispatcher:** sends each request to the pinned release's files and server hooks.
- **Static boot page** for `/<café>/t/<table>`: one file for every café and table, with a minimal renderer that shows names and prices if the release bundle fails.
- **Café home page** `/<café>`: the only server-rendered page (SEO, link previews), cached by menu revision.
- **Sign-in, sessions and roles** ([ADR-0006](../../docs/adr/0006-accounts-passwords-and-roles.md)); customer records API with role checks and logging ([ADR-0010](../../docs/adr/0010-customer-data-consent-and-deletion.md)).
- **Config validator** runner and **data-access layer** (café scope on every query).
- **Visit counting** inside the boot call (no separate beacon, no cookies).

## Rules

- **The 10 ms CPU limit** applies to every request: no slow work on the request path; paginate anything that loops over many rows.
- The routes `/<café>` and `/<café>/t/*` are a **permanent contract** and belong to the shell; no release can remove them ([ADR-0004](../../docs/adr/0004-permanent-table-link-and-hosts.md)).
- Customer hosts set **no cookies**. Sessions exist only on the admin host.
- All customer text is escaped or set as plain text. Strict Content-Security-Policy.
- Domain and host names come from configuration, never from code.

## Must not live here

- Menu rendering, list or checkout logic (that is release code in [`core/`](../../core/README.md)).
- Module features.
- Secrets in code; use Worker secrets (see [operations](../../docs/operations/README.md)).

## Related

[Overview: components and routes](../../docs/architecture/overview.md#hosts-and-routes) · [`platform/`](../README.md)
