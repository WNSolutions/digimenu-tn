# cafes/_fixtures/

**Test cafés** that exist only for automated tests. They are never shown to anyone.

**Status:** Planned — created with the first modules (Sprint 1) and updated whenever a module is added.

| Fixture | Configuration | Proves |
|---|---|---|
| [`all-on/`](all-on/README.md) | every module in the release switched on, with valid settings | modules work together; adding a module changes nothing else unless declared (MOD-06) |
| [`all-off/`](all-off/README.md) | every module switched off, no ordering types | "off means zero bytes": same requests as core only, weight within 2 KB (MOD-03) |

## Rules

- Fixtures follow the same [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json) as any café, with `"status": "fixture"`.
- Content is fictional and deliberately awkward: long names, all three languages, Arabic with numbers and Latin brand names, maximum quantities.
- A pull request that changes a snapshot of a fixture must explain the change in the changelog.

## Must not live here

- Real café data. Real cafés are snapshot-tested from the private deploy repository.

## Related

[`tests/snapshot/`](../../tests/snapshot/README.md) · [`tests/budget/`](../../tests/budget/README.md) · [`cafes/`](../README.md)
