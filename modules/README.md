# modules/

**Optional features**, one folder per module. Each café switches modules on or off by configuration only; the code is the same for every café.

**Status:** no modules yet. The first two, `languages` (M-12) and `whatsapp_handoff` (M-03), arrive in Sprint 1 with the module registry and the config validator.

## What lives here

```text
modules/<key>/
├── module.json            manifest — must follow core/schemas/module.schema.json
├── client.js              customer page contributions (optional)
├── staff.js               staff screen and admin contributions (optional)
├── server.js              server hooks (optional)
├── settings.schema.json   settings with safe defaults
├── i18n/fr.json, ar.json, en.json
├── tests/
├── GUIDE.md               one page for maintainers
└── CHANGELOG.md
```

The folder name is the module key (lowercase letters, digits, underscores). See the [example manifest](../core/schemas/examples/module.example.json) and the [module catalogue](../docs/architecture/modules.md#module-catalogue) for the planned modules M-01 to M-16.

## Rules

- **Import only `@digimenu/core-api`.** Never import another module or core internals.
- **Add, never change:** contribute only through [extension points](../docs/architecture/modules.md#extension-points).
- **Off by default.** A disabled module must add zero bytes and zero requests for that café.
- **Declare your data:** fields you store, personal fields you ask for, and whether you need customer records. Undeclared access fails CI.
- **Safe defaults** for every setting; FR/AR/EN texts with identical keys; tests, a guide and a changelog are required.
- CSS classes start with `m-<key>-`; use only the core's design tokens.
- A paid outside service (e.g. WhatsApp Business) is off by default, paid by the café, capped per day, and never blocks an order.

## Must not live here

- A module for one café: write a generic module any café can switch on.
- Credentials, phone numbers, café names.
- Youth certificates: they are a separate WNS tool ([ADR-0009](../docs/adr/0009-certificates-outside-the-cafe-toolkit.md)).

## Related

[Module system](../docs/architecture/modules.md) · [ADR-0008](../docs/adr/0008-module-system.md) · [CONTRIBUTING](../CONTRIBUTING.md)
