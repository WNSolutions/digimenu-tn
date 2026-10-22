# core/schemas/examples/

**Valid, fictional examples** of the files described by the schemas one folder up. They show newcomers what a correct file looks like, and contract tests use them.

| Example | Schema |
|---|---|
| [`module.example.json`](module.example.json) — manifest of the `payment_choice` module (M-04), before it exists | [`module.schema.json`](../module.schema.json) |
| [`release-window.example.json`](release-window.example.json) — a stable release and a candidate waiting for approval | [`release-window.schema.json`](../release-window.schema.json) |

The café configuration example is the demo café's own [`info.json`](../../../cafes/demo/info.json).

## Rules

- Every example must stay **valid** against its schema; CI checks it.
- Examples are **made up**: fictional names, placeholder checksums, no real links, phone numbers or people.
- When a schema changes, update its example in the same pull request.

## Must not live here

- Real café configurations, real release records, anything copied from a deploy repository.
