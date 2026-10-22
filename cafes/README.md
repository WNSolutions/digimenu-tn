# cafes/

**Fictional café data** for development, tests, demos and training. The public repository never holds a real café.

## What lives here

| Folder | Purpose |
|---|---|
| [`demo/`](demo/README.md) | **Café Démo Jasmin**, a made-up café used for previews, workshops, screenshots and end-to-end tests |
| [`_fixtures/`](_fixtures/README.md) | Test cafés for snapshot tests: [`all-on`](_fixtures/all-on/README.md) (every module on) and [`all-off`](_fixtures/all-off/README.md) (every module off) |
| [`_template/`](_template/README.md) | The **onboarding template**: the files a maintainer fills in for a new café |

## Rules

- **Fictional only** (D-022). Names, menus, prices, photos and table codes here are invented.
- The folder name is the café's **slug**, and `info.json` must validate against [`cafe-config.schema.json`](../core/schemas/cafe-config.schema.json).
- A leading underscore (`_fixtures`, `_template`) means "not a café".
- No phone numbers, addresses or names of real people or businesses, even as examples.
- Café slugs must not appear anywhere in the code outside this folder and data files; CI checks it (MOD-15).

## Must not live here

- Real partner cafés: their content lives in the **private deploy repository** (`digimenu-deploy-<city>/cafes/<slug>/`), see [ADR-0003](../docs/adr/0003-public-toolkit-and-private-deploy-repo.md).
- Logos, photos or brand names of real businesses.
- Customer data of any kind.

## Related

[Module system: per-café configuration](../docs/architecture/modules.md#per-café-configuration-and-validation) · [tests/snapshot/](../tests/snapshot/README.md)
