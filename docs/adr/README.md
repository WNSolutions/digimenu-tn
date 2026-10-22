# Architecture Decision Records

Short records of the important technical decisions in DigiMenu TN: the context, what we decided, and what follows from it. Why we keep them: [ADR-0001](0001-record-architecture-decisions.md).

## Index

| ADR | Decision | Status | Source decisions |
|---|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | — |
| [0002](0002-cloudflare-worker-d1-plain-javascript.md) | Cloudflare Worker, D1 and a Durable Object, in plain JavaScript without a UI framework | Accepted | D-009 |
| [0003](0003-public-toolkit-and-private-deploy-repo.md) | A public MIT toolkit and a private deploy repository per deploying organisation | Accepted | D-022 |
| [0004](0004-permanent-table-link-and-hosts.md) | Permanent table link `digimenu.wnsolutions.tn/<café>/t/<table>`, and the host layout | Accepted (frozen Fri 13 Nov 2026) | D-025, D-037, D-024 |
| [0005](0005-release-window-pinning-and-approval.md) | Release window, per-café pinning, and Ahmed's approval gate | Accepted · pilot café **open** (D-029) | D-021, D-029 |
| [0006](0006-accounts-passwords-and-roles.md) | Username and password sign-in on any device, with four roles | Accepted · password length open | D-026 |
| [0007](0007-order-notifications-staff-screen-and-whatsapp.md) | Orders go to the staff screen; WhatsApp only as hand-off or an optional paid module; no Telegram, no SMS | Accepted | D-023, D-028, D-030 |
| [0008](0008-module-system.md) | Optional features are modules with a manifest, switched per café by configuration only | Accepted | D-009, D-028 |
| [0009](0009-certificates-outside-the-cafe-toolkit.md) | Youth certificates are a separate WNS tool in `WNSolutions/wns-certificates`, not a café module and not part of this repository | Accepted · repository to be created by Ahmed | D-032 |
| [0010](0010-customer-data-consent-and-deletion.md) | Customer records with recorded consent, field encryption, Admin-only access and deletion on request | Accepted · retention open | D-027 |
| [0011](0011-design-language-hig-inspired.md) | Design based on Apple's Human Interface Guidelines, applied as is for an iPhone-first audience; no Apple assets | Accepted | D-039, D-040, D-044 |

**Source decisions** are IDs in the project's internal decision log, kept by the project lead. Each ADR restates what matters, so you do not need the log to understand it. Requirement IDs such as `MOD-14` or `US-36` refer to the [product requirements](../product/README.md).

## Open questions that affect these ADRs

| Question | Affects | Owner | Due |
|---|---|---|---|
| Which café receives each new version first (D-029)? | [0005](0005-release-window-pinning-and-approval.md) | Ahmed | Sun 22 Nov 2026 |
| Minimum password length for Manager and Staff: 12, 15, or 8 as in the requirements? | [0006](0006-accounts-passwords-and-roles.md) | Ahmed | before accounts go live (Sprint 2) |
| Retention period and data controller named in the privacy notice | [0010](0010-customer-data-consent-and-deletion.md) | Ahmed | Fri 13 Nov 2026 |
| May a Maintainer switch a module **on** at a live café, or only off? | [0008](0008-module-system.md) | Ahmed | Sun 8 Nov 2026 |
| Create the `WNSolutions/wns-certificates` repository (name confirmed 22 Oct 2026, D-041) | [0009](0009-certificates-outside-the-cafe-toolkit.md) | Ahmed | when WO-042 starts, before WO-044 |
| Final approval mechanism: public-repo `production` environment or the interim allow-listed deploy workflow | [0005](0005-release-window-pinning-and-approval.md) | Tech Lead | before the first production deploy |

## How to add an ADR

1. Copy [`template.md`](template.md) to `NNNN-short-title.md`, using the next free number.
2. Fill in every section; keep it short and plain. Status starts as **Proposed**.
3. Open a pull request. When the decision is taken, set the status to **Accepted** and add the row to the index above.
4. To change an accepted decision, write a **new** ADR that supersedes it, and update the old one's status line only.

An ADR is required for a new runtime technology or dependency, a change to a public contract (printed link form, JSON schemas, module manifest, extension points), the security or privacy model, or the release process.
