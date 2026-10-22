# ADR-0003: A public MIT toolkit and a private deploy repository per deploying organisation

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-21 (licence decision 2026-10-14) |
| **Source decisions** | D-022 · NFR-12, NFR-19, NFR-20, NFR-22 |
| **Deciders** | Ahmed (project lead), on the engineering team's proposal |

## Context

DigiMenu TN promises an **open-source toolkit** that others can reuse. The partner cafés' menus, logos, photos and orders, and all customer data, must stay **private**. GitHub's free plan protects deployment environments with required reviewers only in **public** repositories. Other cities should be able to deploy the toolkit with their own free accounts and domain, without access to WNS's accounts.

## Decision

We will keep **two kinds of repository** in the GitHub organisation `WNSolutions`:

1. **`digimenu-tn` — public, MIT licence.** Code, JSON schemas, tools, tests, documentation, a **fictional demo café** and test fixtures. Nothing that belongs to a real café or a real person.
2. **`digimenu-deploy-monastir` — private.** One such repository per deploying organisation (`digimenu-deploy-<city>`, usable as a template by replicators). It holds the release window, café onboarding seeds, media sources, the printed-links log, and backup instructions. Where the production deploy workflow and its token live is set by [ADR-0005](0005-release-window-pinning-and-approval.md) (target: the public repository's protected environment).

| Content | Public `digimenu-tn` | Private `digimenu-deploy-<city>` | Never in any repository |
|---|---|---|---|
| Code, schemas, tools, tests, docs | ✓ | — | — |
| Fictional demo café, fixtures | ✓ | — | — |
| Real café onboarding seeds (menu files, info, tables) | — | ✓ | — |
| Real logos and photos (with the café's written OK) | — | ✓ | — |
| Release window `releases.json` | — | ✓ | — |
| Printed links with check codes | — | ✓ | — |
| Encrypted database backups | — | instructions only; files kept as private workflow artifacts ([ADR-0010](0010-customer-data-consent-and-deletion.md)) | unencrypted exports |
| Secrets, API tokens, passwords, encryption keys | — | — | ✓ never |
| Customer names, phones, orders in readable form | — | — | ✓ never |
| Staff members' personal phone numbers or emails | — | — | ✓ never |

The **MIT licence covers the code only.** Café logos, photos and brand names are not covered and need each café's written permission before use, even in the private repository.

## Consequences

- **Positive:** anyone can reuse and study the toolkit; partners' content and customers' data are protected; the production approval gate can use GitHub's free protected environments in the public repository; replicators copy the private template and plug in their own accounts.
- **Negative / costs:** two repositories to keep in step (the private window refers to public release tags). Public CI must never see real café data, so preview deployments of pull requests use the demo café and fixtures only. Snapshot and printed-link tests on real cafés run from the private side.
- **Follow-ups:** a CI search for café slugs outside `cafes/` and data (MOD-15). Secret scanning and forbidden-file checks in CI (DevOps, [SECURITY.md](../../SECURITY.md)). Every folder README says what must not live there.

## Alternatives considered

| Option | Why not |
|---|---|
| One public repository with real cafés in it | Breaks D-022; exposes partner content and check codes. |
| One private repository for everything | Breaks the open-source promise; no free protected environment for the approval gate. |
| One private repository per café | Five times the setup and drift for the same code; harder for youth to maintain. |

## References

- [Architecture overview](../architecture/overview.md) · [releases](../architecture/releases.md)
- Public demo café: [`cafes/demo/`](../../cafes/demo/README.md)
