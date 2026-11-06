# tools/demo/

Builds the **fictional demo café** ([`cafes/demo/`](../../cafes/demo/README.md)) for local use and for showing DigiMenu to cafés.

**Status:** Ready (Sprint 1).

| File | Does |
|---|---|
| [`boot.js`](boot.js) | Reads `info.json`, `menu.csv` and `tables.csv` and builds the same answer the Worker's `/api/boot` will give. Used by the dev server and the build. |
| [`build.js`](build.js) | `npm run demo`: writes `dist/demo/index.html`, the customer page of table 5 in **one file** that works with no server and no network. Prints the size of the customer code against the 20 KB budget and fails if it is over. |

Options: `npm run demo -- --table T1` (another table), `--out <folder>`, `--help`.

## Rules

- Only the demo café. Real cafés are built from the private deploy repository.
- The standalone file is for showing and testing. The real path (static boot page, `/api/boot`, `/r/<version>/`) is what [`tools/dev/`](../dev/README.md) serves and what the Worker will serve.

## Related

[`tools/`](../README.md) · [`cafes/demo/`](../../cafes/demo/README.md)
