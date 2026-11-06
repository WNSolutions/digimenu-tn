# tools/dev/

The **local dev server** for the customer page, with the demo café. No Cloudflare account needed.

**Status:** Ready (Sprint 1). It will give way to `wrangler dev` when the Worker lands.

```bash
npm run dev
# open http://localhost:8787/demo/t/5?k=7QF3K9   (table 5)
#      http://localhost:8787/demo                 (menu without a table)
```

| Address | Serves |
|---|---|
| `/<café>`, `/<café>/t/<table>` | the static boot page ([`platform/shell/public/`](../../platform/shell/public/index.html)) |
| `/api/boot` | built from [`cafes/demo/`](../../cafes/demo/README.md) on every request: edit `menu.csv`, reload |
| `/r/dev/app.css` | `core/ui/tokens.css` + `core/ui/menu.css` |
| `/r/dev/…` | the files of `core/` as they are (no bundling in dev) |

It listens on `127.0.0.1` only, unless you pass `--host`. Options: `--port`, `--host`, `--help`.

## Related

[`tools/`](../README.md) · [`tools/demo/`](../demo/README.md)
