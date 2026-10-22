# ADR-0008: Optional features are modules with a manifest, switched per café by configuration only

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-21 |
| **Source decisions** | D-009 (modules per café), D-028 (standard template) · MOD-01 to MOD-06, MOD-12, MOD-15 to MOD-18 |
| **Deciders** | Software Architect, reviewed by the Tech Lead; principle set by Ahmed ("point 3": add features without breaking what runs) |

## Context

The five pilot cafés work differently: some take takeaway, some want photos, some will pay for WhatsApp messages, most will not. Ahmed's requirement is that each partner can get "special features" and that new features can be added **without breaking what already runs**. Trained youth must be able to change a café's features without touching code. The project cannot afford separate copies of the code per café.

## Decision

1. **Same code for every café.** A partner's need becomes a **generic module** that any café can switch on. No café-specific code anywhere; CI fails if a café slug appears outside `cafes/` and data (MOD-15).
2. **A module is one folder** `modules/<key>/` with a **manifest** (`module.json`) that follows [`module.schema.json`](../../core/schemas/module.schema.json). The manifest declares key, version, dependencies, settings with safe defaults, FR/AR/EN texts, extension points used, data stored, **personal fields and customer-record access**, outside paid services, tests, a one-page guide and a changelog (MOD-04). CI rejects a module whose manifest is incomplete.
3. **Modules only add, at named extension points.** The core owns URLs, pricing, the list, the order lifecycle, sign-in and data access. The full list of extension points is named and reserved now; each point is built with the first module that needs it; a new point arrives only in a core MINOR release. One new server point, `order.statusChanged`, is added to the v0.1 list for the review invitation, loyalty and WhatsApp messages.
4. **Off means zero bytes.** A disabled module adds no file, CSS, text, request or server route for that café (MOD-03). CI proves it by comparing "all modules off" with "core only".
5. **Isolation.** Modules import only the public core API, never each other. Each sees only its own settings, texts, storage prefix, data namespace and events. Contributions run inside guards: a failing customer-side contribution is skipped; a failing `order.validate` refuses the order safely; a failing after-the-fact hook is logged and the order stands.
6. **One validator, four places.** The same configuration validator runs in the admin app, on the server at publish, in CI and in the pin pre-flight. Errors block publishing and the **last valid configuration stays live** (MOD-05).
7. **Order types are core configuration** (`ordering.types`), each with exactly one channel module. The `order_types` module provides the selector and fields.
8. **Who switches.** A Maintainer may switch any module **off** at once (kill switch, MOD-16). Switching a module **on** at a live café is prepared by a Maintainer and approved by Admin. Paid modules are switched on only by Admin with the café's written agreement (MOD-18). Every module is off by default in code; new cafés start from the standard template (`order_types` with dine-in, `send_order`, `languages`, and `google_review` when the café has a review link).

Details: [module system](../architecture/modules.md).

## Consequences

- **Positive:** a partner's request changes switches, not code; one café's features cannot change another café; a failing module can be switched off in minutes without a release; modules are small enough for a trained youth to read; the manifest makes privacy review mechanical (who touches personal data is declared).
- **Negative / costs:** more structure than a small app usually has: manifests, schemas, a registry and guards must be built before the first module. Cross-module features must be designed as core extension points first.
- **Follow-ups:** Sprint 1 builds the registry, the validator and two reference modules (`languages`, `whatsapp_handoff`). Contract tests and the removal test land with them ([`tests/contract/`](../../tests/contract/README.md)). Whether a Maintainer may switch a module **on** without Admin approval is a question for Ahmed; until he answers, "on" needs Admin.

## Alternatives considered

| Option | Why not |
|---|---|
| `if (cafe === …)` checks in the code | Café-specific code; every partner change is a code change and a release. |
| A branch or fork per café | Copies drift; fixes must be applied five times. |
| Loading module code at runtime from URLs | Security risk; breaks immutable, tested releases. |
| A framework's plugin system | Adds a UI framework ([ADR-0002](0002-cloudflare-worker-d1-plain-javascript.md)). |

## References

- [Module system](../architecture/modules.md) · [`modules/`](../../modules/README.md) · [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json)
