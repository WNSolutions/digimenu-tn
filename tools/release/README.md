# tools/release/

**Release bundling and window checks.** Builds a tagged version once into an immutable release, and checks that a release window can be deployed.

**Status:** Planned — build in Sprint 1 (`v0.1.0`), window checks in Sprint 3 (per-café pinning).

## What it does

- **Build a release:** bundles the core and each module as separate content-hashed files under `/r/<version>/`, plus the server hooks; writes the release manifest (file list, module versions, CSS and texts per module); computes the artifact checksum attached to the GitHub Release.
- **Check a window** (`releases.json` in the private deploy repository) against [`release-window.schema.json`](../../core/schemas/release-window.schema.json):
  - at most 3 releases, one per role (`previous`, `stable`, `candidate`);
  - every release has the deployment's `platformApi` and accepts the current database schema;
  - checksums match the published artifacts;
  - no release is removed while a café is pinned to it.
- **Assemble the deployment:** platform shell + every release in the window, ready for the approved production workflow.

## Rules

- A release is **built once**; the same artifact goes to preview and production.
- The tool never deploys by itself. Production deploys run only in the approved workflow ([ADR-0005](../../docs/adr/0005-release-window-pinning-and-approval.md)).

## Must not live here

- Built artifacts (they are attached to GitHub Releases, not committed).
- Release windows of real deployments (they live in the private deploy repository).

## Related

[Releases, pinning and rollback](../../docs/architecture/releases.md) · [`tools/`](../README.md)
