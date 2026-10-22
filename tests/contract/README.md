# tests/contract/

**Contract tests**: rules that keep modules, the core and the platform honest with each other.

**Status:** Planned — first tests with the module registry (Sprint 1); role tests with accounts (Sprint 2).

## What lives here

| Test | Rule (requirement) |
|---|---|
| Manifest contract | Every `modules/<key>/module.json` validates against [`module.schema.json`](../../core/schemas/module.schema.json); tests, guide and changelog exist; the version is bumped when the module changes (MOD-04) |
| Customer-record declaration | A module that touches customer records without declaring it fails (MOD-04, NFR-22) |
| Import boundaries | Modules import only `@digimenu/core-api`; the core never imports a module; no module imports another (MOD-02) |
| Removal test | Delete one module folder: everything else still builds and passes (MOD-02) |
| Text keys | FR, AR and EN text files have identical keys, for the core and every module (MOD-17) |
| No café-specific code | No café slug appears in code outside `cafes/` and data files (MOD-15) |
| Schema examples | Every file in `core/schemas/examples/` and every `cafes/*/info.json` validates against its schema |
| Roles × permissions | Every role × capability pair of the permission table is allowed or refused exactly as specified, including hand-crafted requests (US-38) |

## Rules

- A contract test names the rule it protects and how to fix a failure, in plain words.
- When a rule changes, the architecture page and this test change in the same pull request.

## Must not live here

- Tests of behaviour inside one module (they belong in that module's `tests/`).

## Related

[Module system](../../docs/architecture/modules.md) · [data model: roles](../../docs/architecture/data-model.md#roles-and-what-each-one-can-reach) · [`tests/`](../README.md)
