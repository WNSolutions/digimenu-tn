# ADR-0005: Release window, per-café pinning, and Ahmed's approval gate

| | |
|---|---|
| **Status** | Accepted — the choice of pilot café (D-029) is **open**, due Sun 22 Nov 2026; the Tech Lead confirms the approval mechanism before the first production deploy |
| **Date** | 2026-10-21 (approval rule decided 2026-10-14) |
| **Source decisions** | D-021, D-009 · D-029 (open) · MOD-07, MOD-08, MOD-09, MOD-13, MOD-16, US-34 |
| **Deciders** | Ahmed (project lead) for the approval rule; Software Architect and Tech Lead for the mechanism |

## Context

Ahmed's requirement is that new features can be added "without breaking what already runs". Each café must run a tested version, a new version must reach one café before the others, and any café must go back to its previous version in 15 minutes. At the same time, one build should serve every café, so there are never per-café copies of the code.

Ahmed decided that **he approves every new version** before it reaches a café; trained youth may roll a café back or switch a module off, but **cannot publish** (D-021).

On GitHub's free plan, protected deployment environments with required reviewers exist only for **public** repositories.

## Decision

1. **Build once, deploy a window, activate per café.** Each tag is built once into an immutable release. One production deployment carries a window of **at most 3** releases (`previous`, `stable`, `candidate`), **normally 2**. The window is declared in `releases.json` in the private deploy repository, with the shape in [`release-window.schema.json`](../../core/schemas/release-window.schema.json).
2. **The pin is data.** Each café's release is a value in the database with a full history. Changing it is a one-minute data change with an automatic pre-flight, not a redeploy. Adding a release to the window changes no café.
3. **Approval gate: only Ahmed can approve a production deploy.** Nobody else, human or agent, can.
   - **Target mechanism** (Tech Lead review): the workflow that holds the production Cloudflare token runs in the **public** toolkit repository, in a GitHub `production` environment whose **required reviewer is Ahmed**, so GitHub itself enforces the rule. The private repository then holds no production token.
   - **Interim mechanism** (built by DevOps): `deploy.yml` in the private deploy repository, which only accounts on an allow-list (today: Ahmed) can run, with write access to that repository limited to Ahmed and the Tech Lead.
   - The Tech Lead confirms which mechanism is used **before the first production deploy**; both satisfy D-021.
4. **Who moves pins.** Admin pins cafés **forward**. A Maintainer may pin a café **back** to the release it ran before, if that release is still in the window, and may switch any module off (kill switch). Both actions are logged and notify Admin.
5. **Pilot first.** A new release goes to one pilot café, then the others: for minor and major releases, 48 hours including one peak service, then one café per day; for patch releases, a smoke check, then the same day.
6. **Pilot café: open (D-029).** Until Ahmed decides, no partner café is pinned to a candidate; candidates run on the demo café and preview only.
7. **Go-live freeze.** From Fri 20 Nov to Fri 4 Dec 2026 only patch releases are published; no v1.1 code is in the go-live release.

## Consequences

- **Positive:** every café runs published, tested code; one café can move or roll back without touching the others; rollback by a trained youth in minutes from the admin app; the approval rule is enforced by GitHub, not by trust.
- **Negative / costs:** the platform shell, café hub and database schema are **shared** by all cafés and cannot be pinned; they must stay small, backward compatible with every release in the window, and change rarely. A shell rollback applies to every café. Every release in the window must accept the current database schema (expand/contract migrations).
- **Dependency on Ahmed:** releases wait for his approval. Approval is one tap on GitHub from a phone; the release plan schedules it.
- **Follow-ups:** DevOps implements the chosen approval mechanism and the deploy workflow ([operations](../operations/README.md)). The rollback procedure is rehearsed and timed before go-live wave 1 and before v1.0. HQ records D-029 when Ahmed decides.

## Alternatives considered

| Option | Why not |
|---|---|
| One Worker per café | Five deployments to keep in step; code drift; more quota per café. |
| A branch or fork per café | Copies of the code; breaks "same code for every café" (MOD-15). |
| Feature flags only, no pins | Cannot roll one café back to older code. |
| Required reviewers on the private repository | Needs a paid GitHub plan. |
| Approval by "Ahmed or a delegate" | Not what D-021 says; a delegate can be added later only by a new decision. |

## References

- [Releases, pinning and rollback](../architecture/releases.md)
- [ADR-0003](0003-public-toolkit-and-private-deploy-repo.md) (two repositories)
