# Labels

Labels tell everyone, at a glance, **what kind of work** an issue is, **which part** of DigiMenu it touches, **how important** it is and **where it stands**. The same 34 labels exist in both repositories (the public toolkit and the private deploy repository), so issue forms work the same everywhere.

## The rules in one minute

| Prefix      | How many per issue          | Who sets it                                           |
| ----------- | --------------------------- | ----------------------------------------------------- |
| `type:`     | exactly one                 | the issue form sets it; a maintainer corrects it      |
| `area:`     | one or more                 | a maintainer, during triage                           |
| `priority:` | at most one                 | a maintainer, during triage (Ahmed decides in a tie)  |
| `status:`   | at most one; none when done | the issue form sets `needs-triage`; then the assignee |
| others      | any                         | a maintainer                                          |

Colours follow the prefix: blues for `type:`, one teal for every `area:`, red to yellow for `priority:`, purples for `status:`.

## `type:` what kind of work

| Label           | Colour    | Use it for                                                                |
| --------------- | --------- | ------------------------------------------------------------------------- |
| `type: bug`     | `#0a3d91` | Something does not work as expected                                       |
| `type: feature` | `#1565c0` | New feature or improvement, written as a user story                       |
| `type: task`    | `#1e88e5` | Engineering work with a goal and a done-when checklist                    |
| `type: docs`    | `#64b5f6` | Documentation and guides                                                  |
| `type: module`  | `#a8cff8` | New optional per-café module or a change to one (module contract, MOD-04) |

Pull request titles use Conventional Commit types (`feat`, `fix`, `docs` ...), not these labels. See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## `area:` which part of DigiMenu

All `area:` labels are teal (`#c2e7e1`). The area names are also the commit scopes.

| Label                | Covers                                                                       | Requirement IDs                       |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `area: menu`         | Customer menu, My list, café info and opening hours                          | US-01 to US-10, C-01 to C-07          |
| `area: ordering`     | Checkout, orders, requests and order status                                  | US-11 to US-22, M-01 to M-07          |
| `area: staff-screen` | Staff screen on counter devices and waiters' phones                          | US-14, US-15, US-45, NFR-24           |
| `area: admin`        | Menu editor, admin app and admin overview                                    | US-27, US-28, US-35, C-08, C-12       |
| `area: accounts`     | Sign-in, passwords, sessions, roles and permissions                          | US-36 to US-38, C-14, NFR-23          |
| `area: privacy`      | Customer records, consent, privacy notice, export and deletion               | US-40 to US-43, C-15, NFR-13 to 15    |
| `area: analytics`    | Visit counts, dashboards and impact export                                   | US-30, US-31, US-39, C-10, C-16       |
| `area: modules`      | Module system (contract, registry, validator, switches) and optional modules | US-29, MOD-01 to MOD-06, M-14 to M-16 |
| `area: releases`     | Versions, release window, café pins, rollback and migrations                 | US-34, MOD-07 to MOD-11               |
| `area: qr-cards`     | QR table-card generator, check codes and printed links                       | US-16, US-32, C-11, MOD-14            |
| `area: i18n`         | French, Arabic and English texts; right-to-left layout                       | US-05, C-04, M-12, MOD-17, NFR-21     |
| `area: platform`     | Worker shell, café hub, database and data access                             | NFR-16, NFR-17                        |
| `area: ci`           | CI, test tooling, budgets and repository automation                          | MOD-13, NFR-01                        |
| `area: onboarding`   | New café setup, demo café, import template and youth guides                  | US-33, NFR-18                         |
| `area: certificates` | Youth certificates: register, PDFs, verification page                        | US-51 to US-55                        |

## `priority:` how important

Priorities follow the MoSCoW words of the requirements, measured against **go-live** (the release installed at the pilot cafés, 23 Nov to 4 Dec). `critical` is only for problems happening now.

| Label                | Colour    | Meaning                                                             |
| -------------------- | --------- | ------------------------------------------------------------------- |
| `priority: critical` | `#b60205` | A live café or personal data is affected: fix now (drop other work) |
| `priority: must`     | `#d93f0b` | Cannot go live without it (MoSCoW Must)                             |
| `priority: should`   | `#f9a825` | Planned for go-live, may move to wave 2 (MoSCoW Should)             |
| `priority: could`    | `#fff3bf` | If time allows, or after go-live (MoSCoW Could)                     |

A `priority: critical` bug at a live café is fixed with a patch release, or the café is rolled back or the module switched off first (see [branching and releases](../operations/branching-and-releases.md)).

## `status:` where it stands

GitHub already shows open/closed and the assignee. Status labels add the states in between.

| Label                    | Colour    | Meaning                                                          |
| ------------------------ | --------- | ---------------------------------------------------------------- |
| `status: needs-triage`   | `#ede3f8` | New: a maintainer will check it and add labels                   |
| `status: needs-info`     | `#d4c1f0` | Waiting for more details from the author                         |
| `status: ready`          | `#b394e3` | Clear and ready to be picked up                                  |
| `status: in-progress`    | `#8f63d2` | Someone is working on it (see the assignee)                      |
| `status: blocked`        | `#6a3fb5` | Cannot move until something else is done (say what in a comment) |
| `status: needs-approval` | `#4a2380` | Waits for Ahmed's written approval (release, pin, module on)     |

The usual path: `needs-triage` → `ready` → `in-progress` → pull request merged → issue closed (remove the status label). `needs-info` and `blocked` can happen at any time. `needs-approval` is used mostly in the private deploy repository, because Ahmed approves every release before it reaches a café (decision D-021).

## Other labels

| Label              | Colour    | Meaning                                              |
| ------------------ | --------- | ---------------------------------------------------- |
| `good first issue` | `#7057ff` | Small, well-explained task for a first contribution  |
| `help wanted`      | `#008672` | Maintainers would welcome help on this               |
| `security`         | `#e11d21` | Security hardening that is safe to discuss in public |
| `dependencies`     | `#0366d6` | Dependency updates (Dependabot uses this label)      |

- **`good first issue`** only when the issue names the files to change, has a clear "done when" list and needs no knowledge of the whole system. A maintainer promises a quick review.
- **`security`** is for hardening work (rate limits, permissions, headers). A **vulnerability** is never an issue: it is reported privately as described in [SECURITY.md](../../SECURITY.md).

## Triage (maintainers)

Within two working days of a new issue:

1. Check that it is not a duplicate and contains no personal data or private café content. If it does, edit it out first.
2. Fix the `type:` if needed and add one or more `area:` labels.
3. Add a `priority:` and a milestone (sprint), or close it with a short, kind explanation.
4. Replace `status: needs-triage` with `status: ready`, `status: needs-info` or `status: blocked`.

## Changing the labels

The Tech Lead creates the labels on GitHub from the names, colours and descriptions on this page. To add, rename or remove a label, open a pull request that updates this page, then ask the Tech Lead to apply the change in both repositories. Keep the total at 40 labels or fewer.
