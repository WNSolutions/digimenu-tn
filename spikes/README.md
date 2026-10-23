# spikes/

A **spike** is a short, throwaway experiment that answers one question before we build on an
assumption. Each spike lives in its own folder named after its issue (`0005-free-plan/` answers
issue #5).

## Rules

- **Throwaway.** Spike code is never imported by `platform/`, `core/` or `modules/`. When the
  answer is known, the real code is written again, properly, in the right place.
- **Reviewed like everything else.** A spike arrives through a pull request with CI green
  (ESLint, Prettier and unit tests run on it; it is not type-checked).
- **Fictional data only.** A made-up demo café, never a real menu or personal data (D-022).
- **No credentials here.** Spikes are deployed by a workflow of the private deploy repository,
  which holds the Cloudflare token (`docs/operations/secrets.md`).
- **The result is a note.** Every spike ends with a short note in `docs/spikes/` that gives a
  clear go / no-go and the numbers behind it. The note stays; the code may be deleted later.

| Spike | Question | Note |
| --- | --- | --- |
| [`0005-free-plan/`](0005-free-plan/README.md) | Does the chosen design fit Cloudflare's free plan? | [docs/spikes/0005-free-plan.md](../docs/spikes/0005-free-plan.md) |
