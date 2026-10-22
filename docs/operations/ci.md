# Continuous integration (CI)

**CI** is a robot that runs our checks every time someone proposes a change. It runs on GitHub
Actions (free for public repositories). If any check fails, the pull request shows a red ❌ and
cannot be merged. Green ✅ means the change passed every check we have today.

You can run exactly the same checks on your laptop before pushing:

```sh
npm ci          # install the exact tool versions from package-lock.json
npm run check   # lint, formatting, type check, tests
```

## 1. The workflows

Workflows are YAML files in `.github/workflows/`.

### Public repo `digimenu-tn`

| File | Runs when | What it does |
| --- | --- | --- |
| `ci.yml` | every pull request, every push to `main` | installs tools, secret guard, ESLint, Prettier, type check, unit tests. Its job is named **`ci`**: that name is the required check on `main` |
| `release.yml` | by hand (Actions → Release → Run workflow) | **placeholder** that already checks the version format and that `CHANGELOG.md` has a `## [X.Y.Z]` section with `**EN:**` and `**FR:**` lines; it tags nothing yet. Later: build, tag, GitHub Release |

### Private repo `digimenu-deploy-monastir`

`checks.yml` runs on every push and pull request (secret and forbidden-file guard, JSON
validity). The others are started by hand (`workflow_dispatch`) and, apart from their guard
steps, are placeholders today: they print what they will do.

| File | Will do | Who may run it |
| --- | --- | --- |
| `checks.yml` | stage 1 hygiene on every push and pull request | automatic |
| `deploy.yml` | deploy the release window to preview or production; no café pin changes | accounts in `DEPLOY_ALLOWED_ACTORS` (Ahmed; later the Tech Lead) |
| `pin-cafe.yml` | move one café to another release of the window (fallback when the admin app is down) | back to an older release: `PIN_ALLOWED_ACTORS`; forward: `DEPLOY_ALLOWED_ACTORS` only (D-021) |
| `publish-media.yml` | publish logos, photos and daily fallback menus to `digimenu-media` | `DEPLOY_ALLOWED_ACTORS` |
| `backup.yml` | weekly encrypted D1 export, kept 8 weeks | `DEPLOY_ALLOWED_ACTORS` |
| `migrate.yml` | D1 migrations: plan (dry run), backup, apply, verify, undo | plan: `PIN_ALLOWED_ACTORS`; the others: `DEPLOY_ALLOWED_ACTORS` |

The allow-lists are **repository variables** (deploy repo → Settings → Secrets and variables →
Actions → Variables), comma-separated GitHub usernames. Only repository admins can change them.

## 2. The 13 stages (ARCHITECTURE §8): live today vs. planned

| # | Stage | Status | Tool added then |
| --- | --- | --- | --- |
| 1 | Hygiene: `npm ci` from lockfile, secret scan, licence check | **Live** (licence check planned) | — |
| 2 | Lint + types: ESLint with import boundaries, `tsc --checkJs` (+ Prettier) | **Live** (Stylelint planned with the first CSS) | Stylelint |
| 3 | Module contract: manifest, FR/AR/EN keys, tests + guide, version bump, import scan | Planned (first module) | — (our own script in `tools/`) |
| 4 | Unit tests (`node:test`) | **Live** (smoke test only for now) | — |
| 5 | Config validation: demo + fixtures on the candidate | Planned (S1 MVP) | Ajv (standalone) |
| 6 | Migrations: fresh DB + forward/back round trip | Planned (first migration) | Wrangler |
| 7 | Build: esbuild, hashes, release manifest | Planned (S1 MVP) | esbuild |
| 8 | Snapshots: demo, all-on, all-off fixtures | Planned (S1 MVP) | — |
| 9 | E2E smoke: Playwright, mobile + throttled 3G | Planned | Playwright |
| 10 | Budgets: ≤ 200 KB and ≤ 15 requests per café | Planned | Playwright |
| 11 | Accessibility: axe-core, LTR and RTL | Planned | @axe-core/playwright |
| 12 | Printed links (deploy repo only) | Planned (before the 13 Nov link freeze) | Playwright |
| 13 | Release | Placeholder (`release.yml`: version + changelog EN/FR check live; `deploy.yml`: actor guard + window check live) | — |

Tools are added **when the code they check lands**, never before, so every dependency in
`package.json` is in use. When the Worker code arrives, `wrangler` and the Workers type
definitions are added too.

Test file names: unit tests are `*.test.js` (run by `node --test`); browser tests will be
`*.spec.js` (run by Playwright).

## 3. Reading a failed run (red ❌)

1. On the pull request, scroll to the checks box and click **Details** next to the red `ci`.
   (Or: repository → **Actions** tab → the red run → job **ci**.)
2. The failed step has a red ❌. Click it to expand the log, and read the **last 20 lines**:
   the error is almost always there, with a file name and line number.
3. Fix it on your laptop, run `npm run check`, commit, push. CI runs again by itself.

| Failed step | Typical message | Fix |
| --- | --- | --- |
| Install dependencies | `npm ci can only install packages when your package.json and package-lock.json are in sync` | run `npm install`, commit the updated `package-lock.json` |
| Guard against secrets | `These files must never be committed` or `A private key or token appears` | remove the file (`git rm --cached <file>`); if it was a real secret, **revoke it now** ([secrets.md](secrets.md) §5) |
| Lint (ESLint) | `core/price.js  12:7  error  'total' is assigned a value but never used  no-unused-vars` | open the file at that line; the rule name at the end explains the problem (search "eslint &lt;rule name&gt;") |
| Lint: import boundary | `'../other/client.js' import is restricted from being used by a pattern. A module may not import…` | modules talk to the core only through `@digimenu/core-api` (ARCHITECTURE §4.5) |
| Check formatting | `[warn] core/price.js` / `Code style issues found` | run `npm run format`, commit |
| Type-check | `core/price.js(8,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'` | fix the value or the JSDoc type at that line and column |
| Unit tests | `✖ rounds to the millime` with `expected` / `actual` values | run `npm test` locally, fix the code (or the test, if the test is wrong) |

Other situations:

- **Yellow dot** = still running. **Grey** = cancelled (a newer push replaced it; normal).
- A failure that has nothing to do with your change (network error, GitHub outage): click
  **Re-run jobs**. If it fails twice the same way, it is real.
- **Dependabot** pull requests (`chore(deps): …`, `ci: …`) run the same CI. Merge them when green;
  for a major update, read the tool's release notes first.

## 4. Security choices in our workflows (and why)

- `permissions: contents: read`: the workflow's token can read the code but change nothing.
- Actions are pinned to a major version (`actions/checkout@v5`) and updated weekly by Dependabot.
  We use only actions published by GitHub, so no third-party code runs with our token.
- Workflow inputs are passed to scripts through `env:` variables, never pasted into the script
  text, so a crafted input cannot run commands.
- The public repo holds no Cloudflare credentials today, and never as a plain repository
  secret. Where the production deploy will run is an open decision: `deploy.yml` in the private
  repo behind the allow-list (built), or a public-repo workflow behind a protected `production`
  environment with Ahmed as required reviewer (ADR-0005).
- We never use the `pull_request_target` trigger: it would run code from forks with our token.
- Secret scanning: GitHub's own secret scanning and push protection (free on public repos) plus
  the guard step in `ci.yml`. We do not use the gitleaks GitHub Action: its README asks
  organisation accounts for a licence key (`GITLEAKS_LICENSE`), and we could not confirm that it
  is free for us. GitHub's built-in scanning covers the need at no cost. The private deploy repo
  gets no GitHub secret scanning on the Free plan, so it relies on the guard step and care.
