# tests/e2e/

**End-to-end tests** with Playwright: a real browser on a phone-sized screen and a slow network does what a customer and a staff member would do.

**Status:** Planned — one smoke test in Sprint 1, full flow with ordering in Sprint 2.

## The smoke journey

1. Open a table link (`/demo/t/5?k=…`) on a mobile viewport with **throttled 3G**.
2. Browse categories; switch to **Arabic** and check the right-to-left layout; switch back.
3. Add items, change quantities, reload: the list survives.
4. Check out with **each enabled order type**: details, notice, unticked marketing box, confirm.
5. A signed-in **staff screen** receives the order, accepts it; the customer's page shows the new status.
6. Show-to-waiter works when ordering is paused.

## Rules

- Runs against the demo café on a local or preview deployment; never against production data.
- Uses the same test accounts created by the test setup; no real passwords in the repository.
- Each step has a clear name, so a failure tells a maintainer where the journey broke.

## Must not live here

- Tests against real cafés (the private deploy repository runs the same journey per café on preview).

## Related

[Overview: main flows](../../docs/architecture/overview.md#main-flows) · [`tests/`](../README.md)
