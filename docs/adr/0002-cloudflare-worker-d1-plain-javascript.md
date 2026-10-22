# ADR-0002: Cloudflare Worker, D1 and a Durable Object, in plain JavaScript without a UI framework

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-21 (decision approved 2026-10-14, confirmed 2026-10-21) |
| **Source decisions** | D-009 · NFR-01, NFR-02, NFR-17, NFR-18, NFR-19 |
| **Deciders** | Ahmed (project lead), on the engineering team's proposal |

## Context

The system must cost **$0 per month** to run, never pause when idle, allow commercial use, and keep at least 10× headroom on every free quota. Menus must open in about 3 seconds on 3G on entry-level phones (≤ 200 KB, ≤ 15 requests). Orders must be checked on the server and reach staff in seconds. Each café must be pinned to a tested version. Young people with mixed skills will maintain it.

Three options were scored on nine weighted criteria: (A) static site + Google Sheets + Apps Script, 3.35/5; (B) Cloudflare Worker + static assets + D1 + Durable Objects, **4.53/5**; (C) a framework single-page app on Firebase's free plan, 2.78/5. Only B met every hard constraint at once.

## Decision

We will build DigiMenu TN as **one Cloudflare Worker** on the free plan:

| Part | Choice | Why |
|---|---|---|
| Hosting and API | One Worker with static assets: boot page, landing page, release files, admin app, API, café hub and cron in one deployable | Static requests are free and unlimited, so menus survive quota exhaustion; one artifact; rollback to any of the last 100 versions |
| Database | Cloudflare **D1** (SQLite), one production database | Plain SQL youth can learn; export and 7-day Time Travel; no pausing |
| Live orders | **One Durable Object class**, one instance per café ("café hub"), hibernating WebSockets | Push instead of polling keeps requests about 14× inside the quota; serialises orders per café |
| Scheduled work | Cron Triggers in the same Worker (at most 3 of the 5 free) | Aggregates, retention jobs, quota alerts |
| Language | **Plain JavaScript** (ES modules) with **JSDoc types checked by `tsc --checkJs`** | The files you write are the files that run; type safety in CI without a compile step |
| User interface | **No UI framework**: tagged-template rendering and event delegation; a few Web Components in the admin app | Core about 15–20 KB gzipped instead of 45 KB+; the same render function runs in the browser and at the edge; web standards do not churn |
| Styling | Hand-written CSS with logical properties and custom-property tokens | Right-to-left by default; about 10 KB; no build chain |
| Build | esbuild | One fast dependency for bundling and content hashes |
| Contracts | JSON Schema 2020-12, compiled with Ajv at build time | One language-neutral contract that also generates admin forms; no `eval` at the edge |
| Tests | `node:test`; Playwright with axe-core | Built-in runner; one browser tool for end-to-end, budgets, accessibility and card PDFs |
| Tooling | Node 22, Wrangler CLI, GitHub Actions | Official tools; free CI for public repositories |

**Deliberately avoided:** React, Next.js and other server-rendering frameworks (weight, churn); Tailwind (a build chain for 10 KB of CSS); Google Sheets or Apps Script at runtime; Firebase and Supabase; Workers KV for data (1,000 writes a day); R2 and Cloudflare Zero Trust (sign-up asks for a payment method); Workers for Platforms (paid); ORMs; third-party analytics, cookies and captchas.

Every new runtime dependency needs a short written justification in its pull request, and an ADR if it changes this list (NFR-18).

## Consequences

- **Positive:** $0/month with about 14× headroom on the binding quota; menus stay up even if the request quota runs out; one deployable artifact; small pages for 3G; one way of writing UI everywhere.
- **Negative / costs:** more code to write and own than with a hosted backend. Cloudflare-specific bindings (D1, Durable Objects), contained by a thin data-access layer and standard SQLite SQL. The 10 ms CPU limit per request shapes several designs: password hashing ([ADR-0006](0006-accounts-passwords-and-roles.md)), server rendering only for the café home page, paginated exports.
- **Risks:** free-plan terms can change; we alert at 70 % of any quota, and the documented exit is Workers Paid ($5/month), which needs Ahmed's written approval. Durable Object WebSocket hibernation on the free plan is confirmed in the Sprint 1 spike.
- **Follow-ups:** DevOps owns the tool configuration (`package.json`, lint and type settings, `wrangler.toml`); see [operations](../operations/README.md).

## Alternatives considered

| Option | Why not |
|---|---|
| A — Google Sheets menu + Apps Script orders | No check before a change goes live; no per-café version pinning; server logic split across five hand-deployed scripts. Kept only as a menu **import** format. |
| C — Framework SPA on Firebase Spark | No server code on the free plan, so order totals cannot be checked on the server; hosting quota only about 2× expected traffic. |
| Supabase free | Projects pause after a week of inactivity. |
| Vercel Hobby, GitHub Pages, Netlify free | Non-commercial terms, commercial-use bans, or pausing on the free plan. |

## References

- [Architecture overview](../architecture/overview.md) · [free-plan budget](../architecture/overview.md#free-plan-budget)
- [ADR-0005](0005-release-window-pinning-and-approval.md) (one deployment, many releases) · [ADR-0006](0006-accounts-passwords-and-roles.md) (CPU limit and passwords)
