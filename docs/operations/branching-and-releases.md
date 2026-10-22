# Branching and releases

How a change travels from your laptop to a café, and how a café goes back if something breaks.
Sources: ARCHITECTURE §5 (versioning, releases, rollback), REQUIREMENTS MOD-07 to MOD-09, MOD-13,
decision D-021.

## 1. Trunk-based development

We have one long-lived branch: **`main`**. It must always pass CI and be releasable.

```text
main ──●────────●────────●──────────●──▶   (each ● = one squashed pull request)
        \      /  \     /
         feat/…    fix/…        short branches: hours or a few days, never weeks
```

1. Update `main`: `git switch main && git pull`.
2. Create a short branch named after the change type:
   `feat/payment-choice`, `fix/arabic-prices`, `docs/rollback-guide`, `chore/update-eslint`.
3. Commit small steps. Run `npm run check` before you push.
4. Push and open a **pull request** (PR) to `main`. Fill in the PR template.
5. **CI must be green.** A second person reviews when the team has one (until then, Ahmed).
6. **Squash and merge.** All commits of the PR become one commit on `main`; the branch is deleted
   automatically.

Never push directly to `main`, and never force-push it (the repository ruleset blocks both).

## 2. Commit messages: Conventional Commits

Because we squash, **the PR title becomes the commit message on `main`**, so the PR title must
follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <what changes, in the imperative, lower case>
```

| Type       | Use it for                                    | Example                                          |
| ---------- | --------------------------------------------- | ------------------------------------------------ |
| `feat`     | a new feature or module                       | `feat(payment_choice): add card option`          |
| `fix`      | a bug fix                                     | `fix(core): round prices to the millime`         |
| `docs`     | documentation only                            | `docs(ops): explain the pin workflow`            |
| `test`     | tests only                                    | `test(core): cover the empty menu`               |
| `refactor` | code change with no behaviour change          | `refactor(shell): split the router`              |
| `chore`    | tooling, dependencies                         | `chore(deps): bump eslint to 10.14.0`            |
| `ci`       | GitHub Actions workflows                      | `ci: cache npm downloads`                        |

A change that breaks compatibility adds `!`: `feat(core)!: new config format v4`, and explains
the migration in the PR.

## 3. Version numbers: SemVer `vMAJOR.MINOR.PATCH`

Each toolkit release is a git tag such as `v1.5.0`, with a changelog entry in French and English
(`CHANGELOG.md`, MOD-07).

| Part      | Raise it when…                                                                  | Café data or config must change? |
| --------- | -------------------------------------------------------------------------------- | -------------------------------- |
| **MAJOR** | the config or menu format, or an extension-point contract, becomes incompatible | yes, with a migration (MOD-11)   |
| **MINOR** | a module or feature is added                                                     | never                            |
| **PATCH** | a bug is fixed                                                                   | never                            |

Release candidates use a suffix: `v1.6.0-rc.1`. Modules also carry their own version in
`module.json`; the platform shell has its own `platformApi` number (ARCHITECTURE §5.1).

## 4. From a merged PR to a café

```text
public repo                         private deploy repo                         cafés
───────────                         ───────────────────                         ─────
merge to main ─▶ tag vX.Y.Z ─▶ PR: add release to window ─▶ preview checks ─▶ Ahmed runs deploy ─▶ pin pilot café ─▶ 48 h ─▶ one café per day
```

1. **Tag.** When `main` holds what we want to ship, the changelog is updated and the commit is
   tagged `vX.Y.Z` (today by hand in GitHub → Releases; later by the `release.yml` workflow,
   which builds the release once and attaches it to the GitHub Release).
2. **Candidate.** In the private deploy repo, a PR adds the version to `releases.json`. The
   production Worker holds a **window of at most 3 releases**: previous, stable, candidate.
   Adding a release changes no café: each café stays pinned to its current release.
3. **Preview checks** (deploy repo CI, on an anonymised copy of production): every café's config
   is valid on the new release, café snapshots, every printed QR link, migration dry-run,
   end-to-end smoke test per café.
4. **Approval = Ahmed runs the deploy.** Only the GitHub accounts listed in the deploy repo's
   `DEPLOY_ALLOWED_ACTORS` variable (Ahmed; later the Tech Lead) can run `deploy.yml` (D-021).
   The deploy changes no café pin. (Open decision, ADR-0005: the production deploy may move to
   the public repo, where GitHub itself asks Ahmed to approve each run.)
5. **Pilot café first.** The pilot café (D-029, still to be chosen) is pinned to the new release
   and watched for 48 hours including one busy service: orders arrive, edits go live, no
   `module_error`.
6. **Other cafés, one per day.** Moving a café **forward** to a new release is Ahmed's decision.
7. **Retire** the oldest release once no café is pinned to it.

## 5. Rolling back (target: ≤ 15 minutes, MOD-09)

Trained youth **may** roll a café back or switch a module off; they **may not** publish a new
version (D-021).

| Problem                                    | What to do                                                                                                                         | Who                              | Time     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| New release misbehaves at one café         | Admin app → Café → Release → "Back to previous release". Fallback: `pin-cafe.yml` in the deploy repo                             | trained youth (Maintainer role)  | 2–5 min  |
| One module fails (for example ordering)    | Kill switch: Admin app → Modules → off → Publish. The café falls back to "show to waiter"                                         | trained youth                    | ≤ 2 min  |
| The platform deploy breaks every café      | Cloudflare dashboard → Workers → `digimenu` → Deployments → previous version → Rollback                                           | Ahmed / Tech Lead (youth with the guide) | ≤ 5 min |
| Wrong menu change                          | Undo, or restore a menu revision in the admin app                                                                                  | owner, youth                     | ≤ 1 min  |
| Data damaged by a migration                | Restore from the migration backup; D1 Time Travel as last resort                                                                    | Admin only                       | ≤ 30 min |

Rolling back never touches menus, configuration, orders or customer data: they are data, not
code (MOD-10). After any rollback: write a short incident note, then **fix forward** with a
patch release through the normal flow above.

## 6. Urgent fixes

There is no special hotfix branch. Make a `fix/…` branch from `main`, open a PR, let CI pass,
squash-merge, and release a PATCH version. If cafés are affected meanwhile, roll them back first
(section 5): rollback is the fast path, the fix can then take the time it needs.
