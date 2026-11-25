# tools/

**Command-line tools** that maintainers and CI run on a laptop or in GitHub Actions. They are not part of what customers download.

**Status:** Planned — each tool arrives with the feature it supports (see each folder).

| Tool | Does | First needed |
|---|---|---|
| [`qr/`](qr/README.md) | QR table cards in the tent design, as HTML or PDF, and the printed-links log (`npm run cards`) | Prototype now; print-ready files with #25 |
| [`import/`](import/README.md) | Imports a café menu from the spreadsheet template, reporting bad rows | Sprint 1 |
| [`validate/`](validate/README.md) | Checks a café configuration, the same validator as the server | Sprint 1 |
| [`release/`](release/README.md) | Builds a release bundle and checks a release window | Sprint 1 (build), Sprint 3 (window) |
| [`demo/`](demo/README.md) | Builds the demo café's boot data, and the demo as one standalone HTML file (`npm run demo`) | Sprint 1 |
| [`seed/`](seed/seed.js) | Writes the SQL that puts a café (configuration, tables, menu, first snapshot) into D1 (`npm run seed`) | Sprint 3 |
| [`dev/`](dev/README.md) | Local dev server for the customer page (`npm run dev`) | Sprint 1 |
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
