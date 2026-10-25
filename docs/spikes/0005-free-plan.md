# Spike note 0005: does the design fit Cloudflare's free plan?

**Issue:** [#5](https://github.com/WNSolutions/digimenu-tn/issues/5) · **Code:** [`spikes/0005-free-plan/`](../../spikes/0005-free-plan/README.md) · **Requirements:** NFR-02, NFR-17, NFR-23 · **Owner:** Software Architect, with the DevOps & Security Engineer

**Status:** measured (runs of 23 and 25 Oct 2026). 5 of 6 go. **Password hashing is a no-go at
30,000 iterations**: the ADR-0006 fallback is needed, and Ahmed chooses its form.

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

### Run 2: Sun 25 Oct 2026, 22:55 UTC (check run `121316817417`), paced requests

The tail still sampled (it kept about 38 % of the events, evenly across routes), so each figure
below rests on 15 or 16 random requests per iteration count, 27 renders and 7–8 AES requests.
That is too few for a true p99, but the trend is unambiguous.

| PBKDF2-SHA256 + pepper | CPU p50 | CPU p90 | CPU max | Requests answered |
| ---: | ---: | ---: | ---: | --- |
| 10,000 iterations | 2 ms | 3 ms | 4 ms | 40 of 40 |
| 20,000 | 4 ms | 6 ms | 6 ms | 40 of 40 |
| 30,000 | 7 ms | 11 ms | 11 ms | 40 of 40 |
| 40,000 | 8 ms | 13 ms | 16 ms | 40 of 40 |
| 50,000 | 11 ms | 12 ms | 18 ms | 40 of 40 |
| 60,000 | 12 ms | 18 ms | 19 ms | 40 of 40 |
| 80,000 | 16 ms | 18 ms | 18 ms | 40 of 40 |
| 100,000 | 20 ms | 32 ms | 33 ms | 40 of 40 |

- **Hash:** about 0.2 ms of CPU per 1,000 iterations at the median. Only **20,000** stays under the
  7 ms budget; 30,000 already reaches 11 ms at p90. Every request still answered 200, even at
  33 ms: Cloudflare tolerates occasional overruns of the 10 ms free limit, but a design that
  overruns on every sign-in would be cut off, so it must not rely on that.
- **AES-GCM:** median 8 ms for 1,000 records vs 0 ms for none, **about 8 µs per record**: go (budget
  50 µs).
- **Edge render, 150 lines:** p50 1 ms, max 3 ms over 27 renders: go, confirming run 1.
- **Hub:** woke 3 → 4 after 40 s idle, both pushes reached 2/2: go again.

## Decision

| # | Answer |
| --- | --- |
| 1 | **Go.** Table pages are static files; menus keep loading when the Worker quota runs out |
| 2 | **Go.** D1 reads 150 rows in about 1–5 ms of CPU |
| 3 | **Go.** The café hub keeps staff screens connected through hibernation; no polling needed |
| 4 | **Go.** A 150-line edge render costs about 1–4 ms of CPU |
| 5 | **No-go at 30,000 iterations.** ADR-0006's fallback applies; its exact form is Ahmed's choice (pending) |
| 6 | **Go.** About 8 µs per encrypted record |

Once the hashing choice is made: the iteration count goes into ADR-0006, the hub result into
ADR-0002 and `platform/hub/README.md`, the static-page result into ADR-0004, and the "Still to
verify in the spike" table of the architecture overview is updated.
