# tests/snapshot/

**Snapshot tests**: record what the system produces for a known café, and fail when it changes without a reason.

**Status:** Planned — Sprint 1 (demo café menu), extended with each module.

## What lives here

For the [demo café](../../cafes/demo/README.md) and the [`all-on`](../../cafes/_fixtures/all-on/README.md) and [`all-off`](../../cafes/_fixtures/all-off/README.md) fixtures:

- the rendered menu HTML in French, Arabic and English;
- the checkout fields shown for each order type;
- list and order totals in millimes for fixed baskets.

## Rules

- Any difference must be **declared in the changelog** of the release (MOD-06). Updating a snapshot without saying why is not allowed.
- Snapshots of the five real cafés (old release vs new release) run from the private deploy repository, never here.
- Keep snapshots readable (formatted HTML, sorted keys) so a reviewer can see what changed.

## Must not live here

- Snapshots of real cafés.

## Related

[Module system: isolation rules](../../docs/architecture/modules.md#isolation-rules) · [`tests/`](../README.md)
