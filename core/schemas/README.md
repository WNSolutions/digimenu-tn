# core/schemas/

**JSON Schema (draft 2020-12) contracts** shared by the server, the admin app, the tools and CI. A schema here is a promise: other code and other repositories rely on it.

**Status:** draft v0 (WO-048). Field names may still change until release v0.1.0, when the formats become `schemaVersion: 1`.

## What lives here

| File | Describes | Used by |
|---|---|---|
| [`module.schema.json`](module.schema.json) | `modules/<key>/module.json`, the module manifest | module contract test, release build |
| [`cafe-config.schema.json`](cafe-config.schema.json) | a café's configuration: slug, names, languages, hours, ordering types, modules and settings, starting release | config validator, admin app forms, onboarding seeds (`cafes/<slug>/info.json`) |
| [`release-window.schema.json`](release-window.schema.json) | `releases.json` in a private deploy repository | release tool, deploy workflow |
| [`examples/`](examples/README.md) | valid examples of the files above | contract tests, documentation |

**Planned:** schemas for the published menu snapshot, the order sent by the phone, the saved list on the phone, and the privacy notice.

## Rules

- **Draft 2020-12** only. Every schema has an `$id`, a `title`, and a `$comment` stating its draft or version status.
- Schemas are compiled at build time (Ajv standalone); nothing is compiled with `eval` at the edge.
- Every format carries a version field (`schemaVersion`). A **breaking** change means a new major format, a migration function, and a release that still reads the previous major format (MOD-11).
- Rules JSON Schema cannot express (e.g. "the default language is enabled", "each order type's channel is an enabled module") are checked by the config validator; the schema's `$comment` says so.
- Keep [`examples/`](examples/README.md) valid: CI checks every example against its schema.

## Must not live here

- Module **settings** schemas: each module keeps its own `settings.schema.json` in its folder.
- Real café configurations (they live in the private deploy repository).

## Related

[Module system](../../docs/architecture/modules.md) · [releases](../../docs/architecture/releases.md) · [demo café config](../../cafes/demo/info.json)
