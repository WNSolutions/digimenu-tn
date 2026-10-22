# cafes/_fixtures/all-off/

A test café with **every module switched off** and no ordering types: menu, list and show-to-waiter only. Slug: `all-off`.

**Status:** Planned — created with the module registry (Sprint 1).

## What lives here

- `info.json`: `"modules": {}` and `"ordering": { "types": {} }`; French only.
- A small menu shared with the "core only" build.

## Rules

- This fixture is the reference for **"off means zero bytes"** (MOD-03): its page must make the same requests as a core-only build and weigh at most 2 KB more ([`tests/budget/`](../../../tests/budget/README.md)).
- It must keep working when every module folder is deleted (removal test, MOD-02).

## Must not live here

- Any enabled module, or settings for one.

## Related

[`_fixtures/`](../README.md) · [module system: off means zero bytes](../../../docs/architecture/modules.md#off-means-zero-bytes)
