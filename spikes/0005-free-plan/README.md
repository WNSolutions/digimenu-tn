# Spike #5: does the design fit Cloudflare's free plan?

Issue [#5](https://github.com/WNSolutions/digimenu-tn/issues/5). Throwaway code ([rules](../README.md)).
The answer goes in [docs/spikes/0005-free-plan.md](../../docs/spikes/0005-free-plan.md).

## What it checks

| # | Question | How |
| --- | --- | --- |
| 1 | Is `/<café>/t/<table>` one static file served **without** running the Worker? | `assets.not_found_handling = "single-page-application"`; the tail must show no Worker run for those requests |
| 2 | Does the Worker read and write D1? | `/api/<café>/menu` (150 rows) and `POST /api/spike/db` |
| 3 | Does the café hub push to two browsers over a **hibernating** WebSocket on the free plan? | two sockets, a push, 40 s idle, a second push; the hub's `wakes` counter must go up while both sockets keep receiving |
| 4 | How much CPU does rendering a 150-line menu at the edge take (limit 10 ms)? | `/ssr/<café>/t/<table>`, 100 requests |
| 5 | Which PBKDF2 iteration count keeps p99 CPU ≤ 7 ms (ADR-0006)? | `/api/spike/hash?iter=N`, 60 requests for each N from 10,000 to 100,000 |
| 6 | Does AES-GCM cost ≤ 50 µs per record (ADR-0010)? | `/api/spike/aes?n=0` and `?n=1000` |

CPU time cannot be read from inside a Worker (its timers only move on I/O), so it is taken from
the Worker's tail events (`wrangler tail --format json`), with Workers Logs in the dashboard as a
second source.

## Files

| Path | What |
| --- | --- |
| `src/worker.js` | routes, D1 queries |
| `src/hub.js` | `CafeHub` Durable Object (hibernating WebSockets) |
| `src/bench.js` | password hash (ADR-0006 format) and AES-GCM records |
| `public/` | static table page, `render.js` (same renderer at the edge and in the browser), hub test page `staff.html` |
| `migrations/0001_spike_tables.sql` | fictional demo café with 150 items in FR / AR / EN |
| `tools/measure.mjs` | runs all checks against a URL, writes `results.json` |
| `tools/analyze.mjs` | `results.json` + tail → `summary.md` with a go / no-go per question |
| `wrangler.template.jsonc` | configuration; copied to `wrangler.jsonc` (git-ignored) for a run |

## Run it on Cloudflare

The private deploy repository runs it: **Actions → Spike → Run workflow** in
`digimenu-deploy-monastir` (only accounts in `DEPLOY_ALLOWED_ACTORS`). It needs the
`CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable
(00_HQ_Start_Here/SETUP_GUIDE_ACCOUNTS.md, step 6). The run creates the D1 database
`digimenu-spike` if needed, deploys the Worker `digimenu-spike` on workers.dev, measures for
about 3 minutes and attaches `summary.md` to the run.

## Run it on your laptop

```sh
cd spikes/0005-free-plan
cp wrangler.template.jsonc wrangler.jsonc
npx wrangler@4.151.3 d1 migrations apply digimenu-spike --local
npx wrangler@4.151.3 dev
# in a second terminal
node tools/measure.mjs --base http://localhost:8787 --quick --out results.json
```

Open `http://localhost:8787/demo/t/5` (menu), `/demo/t/5?lang=ar`, and `/staff.html` in two
windows (hub). Local CPU numbers mean nothing: only the deployed Worker counts.

## Clean up

When the note is accepted, delete the Worker `digimenu-spike` and the D1 database
`digimenu-spike` in the Cloudflare dashboard (they share the account's free quotas).
