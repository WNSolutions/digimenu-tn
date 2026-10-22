# ADR-0001: Record architecture decisions

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-21 |
| **Source decisions** | Project rule "never treat something as decided unless it is logged"; work order WO-048 |
| **Deciders** | Software Architect, for the engineering team |

## Context

DigiMenu TN is built by a very small team: one project lead (Ahmed), an AI engineering team, and, from November 2026, trained young maintainers. Later, people in other cities may reuse the toolkit. All of them need to know not only *what* the system does but *why* it was built that way, so they do not undo a good choice by accident.

Project-level decisions are logged in the project's internal decision log, with IDs such as `D-021`. That log is not public, mixes technical and non-technical topics, and is written for the project lead. The code repository needs its own short, public record of technical decisions.

## Decision

We will keep **Architecture Decision Records** (ADRs) in [`docs/adr/`](README.md).

- One decision per file, named `NNNN-short-title.md` with a 4-digit number that is never reused.
- Every ADR follows the [template](template.md): status table, Context, Decision, Consequences, Alternatives considered, References.
- The status table lists the **source decision IDs** (e.g. `D-025`) and requirement IDs (e.g. `MOD-14`), so anyone with access to the project log can trace the decision. The ADR restates what matters, so public readers do not need the log.
- Statuses: **Proposed** (written, waiting for a decision), **Accepted**, **Superseded by ADR-NNNN**, **Deprecated**.
- An accepted ADR is **not rewritten**. If the decision changes, a new ADR supersedes it, and the old one gets a one-line status update and a link. Typos may be fixed.
- An ADR is required for: a new runtime technology or dependency; a change to a public contract (printed link form, JSON schemas, module manifest, extension points); the security or privacy model; the release process.
- ADRs are written in English, in plain words, short enough to read in five minutes.

## Consequences

- **Positive:** newcomers and replicators learn the reasons behind the design in one place; reviews can point to an ADR instead of repeating arguments; decisions become explicit before code depends on them.
- **Negative / costs:** a few minutes of writing per decision; the index must be kept current.
- **Follow-ups:** the [ADR index](README.md) lists every ADR with its status. Architecture pages in [`docs/architecture/`](../architecture/README.md) describe the current state and link to ADRs for the reasons.

## Alternatives considered

| Option | Why not |
|---|---|
| Rely on the internal project decision log only | Not public, not focused on technical choices, no room for context and consequences. |
| Keep decisions in pull request descriptions | Hard to find later; scattered across many pages. |
| One long design document | Changes overwrite the history of why; hard to see what was decided when. |

## References

- [ADR index](README.md) · [ADR template](template.md)
- Michael Nygard, "Documenting Architecture Decisions" (2011), the format this follows.
