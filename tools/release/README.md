# tools/release/

**Release bundling and window checks.** Builds a tagged version once into an immutable release, and checks that a release window can be deployed.

**Status:** In use — [`build.js`](build.js) builds a release and the static site (`npm run release -- --version 0.1.0`), with the 20 KB budget check and the `_headers` security policy; [`window.js`](window.js) registers a window of releases and checks it (#24); [`pin.js`](pin.js) moves one café without the staff app (#24).

## What it does

- **Build a release:** bundles the core and each module as separate content-hashed files under `/r/<version>/`, plus the server hooks; writes the release manifest (file list, module versions, CSS and texts per module); computes the artifact checksum attached to the GitHub Release.
- **Brand and logos** (D-068): copies DigiMenu's brand layer to `/brand/` (styles from [`platform/brand/`](../../platform/brand/README.md), Jost and Cairo from `@fontsource` with their licences) and café logos to `/media/<café>/`, published as static files so they never cost a Worker request. The DigiMenu logo files (`--brand`) and real cafés' logos (`--media`) come from the private deploy repository; only image files with plain lowercase names at the top of each folder are copied. Production deploys pass both; preview passes `--brand` only, so no real café's logo is on the preview address.
- **Say what a release needs** (#24): the manifest names the database migration it was built against (`dataSchema`), the configuration and menu snapshot formats it reads (`reads`), and each module's `version` and `settingsVersion`. The pin pre-flight reads them.
- **Assemble a window:** `build.js --keep <earlier build>` puts earlier releases' `r/<version>/` next to the new one (and the theme fonts they name). The deploy builds each release of `releases.json` from its commit or tag.
- **Check and register a window** ([`window.js`](window.js), shape of `releases.json` in [`release-window.schema.json`](../../core/schemas/release-window.schema.json)):
  - `digest --site <dir> --version <v>`: one SHA-256 for a release's files; the same build gives the same digest, so the deploy checks it against `artifactSha256`;
  - `sql --site <dir> [--status <v>=<role>]`: registers the releases on the site (at most 3) in the `releases` table and retires the others; changes no café;
  - `check --site <dir> [--except demo]`: the query listing cafés pinned to a release the site would no longer carry; the deploy stops while it returns a row.
- **Move a café without the staff app** ([`pin.js`](pin.js)): `query` reads the café's state, `plan` applies the staff app's rules and pre-flight and prints the SQL of the move (history and audit included), or the reason it is refused. Run by the deploy repo's **Pin café** workflow.

## Rules

- A release is **built once**; the same artifact goes to preview and production.
- The tool never deploys by itself. Production deploys run only in the approved workflow ([ADR-0005](../../docs/adr/0005-release-window-pinning-and-approval.md)).

## Must not live here

- Built artifacts (they are attached to GitHub Releases, not committed).
- Release windows of real deployments (they live in the private deploy repository).

## Related

[Releases, pinning and rollback](../../docs/architecture/releases.md) · [`tools/`](../README.md)
