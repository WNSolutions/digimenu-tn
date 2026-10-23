# Spike note 0005: does the design fit Cloudflare's free plan?

**Issue:** [#5](https://github.com/WNSolutions/digimenu-tn/issues/5) · **Code:** [`spikes/0005-free-plan/`](../../spikes/0005-free-plan/README.md) · **Requirements:** NFR-02, NFR-17, NFR-23 · **Owner:** Software Architect, with the DevOps & Security Engineer

**Status:** waiting for the first run on Cloudflare. It needs the deploy key in the private
deploy repository (SETUP_GUIDE_ACCOUNTS.md, step 6). Local checks have passed.

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

## Run on Cloudflare

_To be filled from the workflow's `summary.md` after the first run: one line per question with
the numbers, then the decision._

## Decision

_Pending._ Once filled in: the iteration count goes into ADR-0006, the hub result into
ADR-0002 and `platform/hub/README.md`, the static-page result into ADR-0004, and the "Still to
verify in the spike" table of the architecture overview is updated.
