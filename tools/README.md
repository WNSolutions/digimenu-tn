# tools/

**Command-line tools** that maintainers and CI run on a laptop or in GitHub Actions. They are not part of what customers download.

**Status:** Planned — each tool arrives with the feature it supports (see each folder).

| Tool | Does | First needed |
|---|---|---|
| [`qr/`](qr/README.md) | Generates print-ready QR table cards (PDF) and logs every printed link | Sprint 1 (prototype), Sprint 3 (cards printed 16–20 Nov) |
| [`import/`](import/README.md) | Imports a café menu from the spreadsheet template, reporting bad rows | Sprint 1 |
| [`validate/`](validate/README.md) | Checks a café configuration, the same validator as the server | Sprint 1 |
| [`release/`](release/README.md) | Builds a release bundle and checks a release window | Sprint 1 (build), Sprint 3 (window) |
| [`migrate/`](migrate/README.md) | Plans, backs up, applies, verifies and undoes database migrations | v1.0 (manual procedure until then) |

## Rules

- **Node.js 22, plain JavaScript (ES modules)**, same style and type checks as the rest of the code.
- Every tool prints `--help` in plain English and returns a non-zero exit code on failure, so CI can rely on it.
- Domain, host names and account ids come from configuration or arguments, **never from code**.
- Tools never print secrets or personal data, and never write real café data into this repository.
- A tool that writes to a real database asks for confirmation unless run by an approved workflow.

## Must not live here

- Code that runs inside the Worker (that is [`platform/`](../platform/README.md) or [`core/`](../core/README.md)).
- One-off scripts for a single café.

## Related

[Architecture overview](../docs/architecture/overview.md) · [operations](../docs/operations/README.md)
