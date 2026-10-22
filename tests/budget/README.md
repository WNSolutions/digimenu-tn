# tests/budget/

**Budget tests**: the limits that keep pages fast on 3G and the project at $0 per month.

**Status:** Planned — page-weight check in Sprint 1, the rest with the features they measure.

## Limits checked

| Budget | Limit | Requirement |
|---|---|---|
| First visit, before photos (page, styles, scripts, menu data; compressed) | ≤ 200 KB and ≤ 15 requests, **per café configuration** | NFR-01 |
| Core script | ≤ 20 KB gzipped | architecture |
| "All modules off" vs "core only" | same request list, weight within 2 KB | MOD-03 |
| CPU time of the café home page render | well under the 10 ms free limit | ADR-0002 |
| Requests per visit and per order | unchanged unless the pull request justifies the quota cost | free-plan budget |

## Rules

- A pull request that adds a request per visit must state its daily quota cost against the [free-plan budget](../../docs/architecture/overview.md#free-plan-budget).
- No polling loops: a test fails if the staff screen or customer page polls faster than allowed.

## Must not live here

- Functional tests (they belong in [`e2e/`](../e2e/README.md) or next to the code).

## Related

[ADR-0002](../../docs/adr/0002-cloudflare-worker-d1-plain-javascript.md) · [`tests/`](../README.md)
