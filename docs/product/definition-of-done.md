# Definition of done

A code change is **done** when every box below is true. Reviewers use this list; authors tick it in the pull request template.

"Done" means merged into `main` and ready for a release. It does not mean live at a café: see [Done is not released](#done-is-not-released).

## 1. The issue

- [ ] The pull request links its issue (`Closes #...`), and every acceptance criterion in the issue is met.
- [ ] Anything left out is written in a new issue, linked from the pull request.

## 2. Automatic checks (CI)

The pull request cannot be merged until the `ci` check is green. Run `npm run check` on your computer first: it runs the same lint, format, type and unit-test steps.

| CI stage                     | What must pass                                                                                   | Runs today?              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| 1 · Hygiene                  | `npm ci` from the lockfile; no secret or forbidden file (for example `.dev.vars`)                | Yes                      |
| 2 · Lint and types           | ESLint (including import boundaries), Prettier, type check                                       | Yes                      |
| 3 · Module contract          | Manifest complete; FR/AR/EN keys identical; tests and guide present; version bumped if changed   | When modules land        |
| 4 · Unit tests               | Core (millimes, pricing, list format, validator) and every module                                | Yes                      |
| 5 · Configuration validation | Demo café and test fixtures are valid on this code                                               | When the validator lands |
| 6 · Migrations               | Fresh database, forward and back on the fixtures                                                 | When the database lands  |
| 7 · Build                    | Release bundle builds                                                                            | When the build lands     |
| 8 · Snapshots                | Demo café, "all modules on" and "all modules off": no change unless declared in the changelog    | When the menu renders    |
| 9 · End-to-end smoke         | Phone profile on throttled 3G: open a table link, browse, Arabic, add, check out, staff receives | From v0.1.0              |
| 10 · Budgets                 | At most 200 KB and 15 requests before photos; "all off" vs core within 2 KB                      | From v0.1.0              |
| 11 · Accessibility           | axe-core on menu, list and checkout, left-to-right and right-to-left                             | When the menu renders    |

The CI file in `.github/workflows/` is the source of truth for which stages run. Stage 12 (printed links) runs in the private deploy repository.

## 3. Tests

- [ ] New behaviour has unit tests; a bug fix has a test that failed before the fix.
- [ ] Prices are tested in whole millimes (no rounding drift).
- [ ] A change to who can do what updates the role tests (every role × capability pair).
- [ ] Test data is made up: no real café content, no real names or phone numbers.

## 4. Texts and screens

- [ ] No text is written in code; FR, AR and EN files have the same keys.
- [ ] The screen was checked in Arabic (right-to-left) and in French or English, on a phone-sized screen (360 px).
- [ ] Prices use 3 decimals and Western digits in every language.
- [ ] Tap targets are at least 44 × 44 px; state is never shown by colour only.
- [ ] Screenshots for any UI change are in the pull request.

## 5. Privacy and security

- [ ] No personal data, secrets or real café content in code, tests, fixtures, logs, screenshots or the pull request.
- [ ] Permissions are checked on the server, not only by hiding a button; café scope is checked in the data layer.
- [ ] Customer text is shown as plain text (escaped).
- [ ] New personal data or new access to customer records is declared (module manifest) and logged.

## 6. Modules, data and links

- [ ] A module change keeps the [module contract](../architecture/modules.md) complete and bumps the module version.
- [ ] No café-specific code: differences between cafés live in configuration and content only.
- [ ] A module that adds requests per visit states its cost on the free-plan quota.
- [ ] A change to a data format (configuration, menu, order, list) bumps its schema version and ships a migration with a dry run and an undo.
- [ ] Printed table links (`/<café>/t/<table>?k=<code>`) keep working.

## 7. Docs and review

- [ ] `CHANGELOG.md` has a line under `[Unreleased]`, unless the change is invisible to users and maintainers.
- [ ] Guides are updated if what a manager, staff member or maintainer does has changed.
- [ ] Ahmed (project lead) or the Tech Lead approved the pull request, and all review conversations are resolved.
- [ ] The pull request title follows Conventional Commits (`type(scope): summary`).

## Done is not released

A merged change reaches a café only through a release:

1. A version is tagged with a changelog summary in English and French.
2. In the private deploy repository, a **release window change** issue adds it to the window, and preview checks pass on every café's configuration.
3. **Ahmed approves in writing** (decision D-021).
4. The pilot café is pinned first and watched for 48 hours, including one peak service; then the other cafés, one per day.

Details: [branching and releases](../operations/branching-and-releases.md).
