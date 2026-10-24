# Spike note 0005: does the design fit Cloudflare's free plan?

**Issue:** [#5](https://github.com/WNSolutions/digimenu-tn/issues/5) · **Code:** [`spikes/0005-free-plan/`](../../spikes/0005-free-plan/README.md) · **Requirements:** NFR-02, NFR-17, NFR-23 · **Owner:** Software Architect, with the DevOps & Security Engineer

**Status:** first Cloudflare run done (Fri 23 Oct 2026): 4 of 6 questions are a go. PBKDF2 and
AES-GCM still need one paced run (the live log dropped their events).

## Questions and decision rules

| # | Question | Go if | If no-go |
| --- | --- | --- | --- |
| 1 | `/<café>/t/<table>` is one static file served without running the Worker | the boot page is served and the tail shows **0** Worker runs for table-page requests | serve the boot page through the Worker with long edge caching; re-check the request quota (overview, "Still to verify") |
| 2 | The Worker reads and writes D1 | 150 menu rows read, writes succeed | blocker: report to the Tech Lead |
| 3 | The café hub pushes to two browsers over a hibernating WebSocket on the free plan | both browsers get a push before **and after** the hub hibernated (its `wakes` counter rose) | staff screen falls back to 30 s polling only (ADR-0002, overview) |
| 4 | CPU time to render a 150-line menu at the edge | p99 < 10 ms | render in the browser only; edge render limited to the boot data |
| 5 | Highest PBKDF2-SHA256 iteration count with p99 CPU ≤ 7 ms | ≥ 30,000 (expected 30,000–40,000) | browser-side stretching + server pepper (ADR-0006, "If the spike fails"); the Architect proposes it to the Tech Lead before Sun 25 Oct |
| 6 | AES-GCM field encryption per record | ≤ 50 µs | export customer data in smaller pages |

## Local check (Fri 23 Oct 2026, `wrangler dev` 4.151.3)

Behaviour only; local CPU numbers do not count.

| # | Result |
| --- | --- |
| 1 | a navigation request to `/demo/t/5` got `index.html` from the asset layer (Wrangler: "Sec-Fetch-Mode: navigate header present, using not_found_handling behavior") |
| 2 | 150 rows read; writes succeeded |
| 3 | push 1 reached 2/2 sockets; after 15 s idle the hub's `wakes` went 1 → 2 and push 2 still reached 2/2 sockets |
| 4–6 | all requests 200 (10,000 to 100,000 iterations; 1,000 AES records) |

Test pages at 360 px (local): [menu, French](img/0005-menu-fr.png) · [menu, Arabic](img/0005-menu-ar.png) · [hub test page](img/0005-hub.png). They are spike pages, not the design (docs/design).

## Run on Cloudflare

### Run 1: Fri 23 Oct 2026, 21:04 UTC (deploy repo check run `120655644563`, Worker `digimenu-spike`)

| # | Result | Numbers |
| --- | --- | --- |
| 1 | ✅ go | boot page served for `/demo/t/5`; **0** Worker runs for table-page requests |
| 2 | ✅ go | 150 menu rows read on every request; 20 writes, all 200 |
| 3 | ✅ go | push 1 reached 2/2; after 40 s idle the hub's `wakes` went 1 → 2 (it hibernated) and push 2 still reached 2/2; both sockets stayed open |
| 4 | ✅ go, to confirm | CPU p50 3 ms, p99 4 ms, max 4 ms; but the tail saw only 7 of 100 renders |
| 5 | ⚪ not measured | all 480 hash requests answered 200, even at 100,000 iterations, but the tail kept **none** of their events |
| 6 | ⚪ not measured | no AES events in the tail |

Other CPU figures from the same run (p99): menu JSON from D1 5 ms, D1 write + read 3 ms, hub
requests 2 ms.

**Why 5 and 6 are missing.** `wrangler tail` enters *sampling mode* when a Worker gets many
requests per second, and drops events. The tool sent 4 requests at a time and the tail kept 60
of about 700 events. The first analysis also turned "no data" into a false no-go. Both are fixed
on this branch: measured requests now go one at a time with a 350 ms pause, and a CPU verdict
counts only when the tail saw at least 80 % of that route's requests (`tools/analyze.mjs`).

### Run 2

_Pending: after deploy-repo PR #4, run **Actions → Spike** again._

## Decision

_Pending._ Once filled in: the iteration count goes into ADR-0006, the hub result into
ADR-0002 and `platform/hub/README.md`, the static-page result into ADR-0004, and the "Still to
verify in the spike" table of the architecture overview is updated.
