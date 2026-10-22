# cafes/_fixtures/all-on/

A test café with **every module of the current release switched on**, each with valid settings. Slug: `all-on`.

**Status:** Planned — `info.json` and menu content are created with the first modules.

## What lives here

- `info.json`: every module enabled; dine-in, takeaway and delivery on, each with a channel; all three languages.
- Menu content that exercises every module: items with photos, tags, specials, lead times; long names; Arabic and French mixed with numbers.

## Rules

- **Every new module is added here** in the same pull request that adds the module, with settings that pass the validator.
- Dependencies must be satisfied (e.g. `preorder` needs takeaway on). If two modules conflict, the fixture enables the one listed first in the catalogue and the conflict test covers the other.
- Snapshots of this café change only when the changelog says why.
- Paid outside services (WhatsApp Business) point to a fake test endpoint, never a real account.

## Must not live here

- Real phone numbers, links or accounts.

## Related

[`_fixtures/`](../README.md) · [module catalogue](../../../docs/architecture/modules.md#module-catalogue)
