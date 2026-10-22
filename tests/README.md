# tests/

**Cross-cutting test suites**: tests that check the system as a whole, or rules that span many folders. Every one of them must pass before a release (MOD-13).

**Status:** Planned — the suites arrive with the code they test. CI stages and their order are described in [operations](../docs/operations/README.md).

| Suite | Checks | Blocks a release when |
|---|---|---|
| [`contract/`](contract/README.md) | module manifests, import boundaries, text keys, role permissions, schema examples, no café-specific code | any rule is broken |
| [`snapshot/`](snapshot/README.md) | rendered menu, checkout fields and totals of the demo café and fixtures | output changes without a changelog entry |
| [`e2e/`](e2e/README.md) | a customer and a staff member using the system on a slow phone | any step fails |
| [`budget/`](budget/README.md) | page weight, request count, CPU time, quota cost | a limit is exceeded |
| [`a11y/`](a11y/README.md) | accessibility in French, Arabic (right-to-left) and English | a WCAG 2.1 AA violation is found |

## Where unit tests live

Unit tests sit **next to the code they test**, as `*.test.js` files run by Node's built-in runner (`node:test`): in `core/`, `platform/`, `tools/`, and each module's own `tests/` folder. Run them all with `npm test`.

## Rules

- Tests use the **fictional** demo café and fixtures only; never real café data or personal data.
- A test that depends on time or the network uses a fixed clock and fakes; flaky tests are fixed or removed, not retried.
- Snapshot updates are reviewed like code: say why the output changed.

## Must not live here

- Unit tests of a single file (keep them next to the file).
- Tests against real cafés (they run from the private deploy repository).

## Related

[Module system: isolation rules](../docs/architecture/modules.md#isolation-rules) · [releases](../docs/architecture/releases.md)
