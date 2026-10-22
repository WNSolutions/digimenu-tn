# Environments

The same code runs in three places. Source: ARCHITECTURE §3.4, updated by decisions D-025/D-037
(domain `wnsolutions.tn`, path-form links) and D-027 (customer data). All three run on free
plans: **$0 per month** (NFR-17).

## 1. The three environments

|  | **Dev** (your laptop) | **Preview** | **Production** |
| --- | --- | --- | --- |
| Runs on | `wrangler dev`: local Worker, local D1 database, local café hub | Cloudflare Worker **`digimenu-preview`** on a `*.workers.dev` address | Cloudflare Worker **`digimenu`** on **`digimenu.wnsolutions.tn`** (menus) and **`digimenu-admin.wnsolutions.tn`** (staff and admin app, ADR-0004) |
| Data | fictional demo café + test fixtures | D1 **`digimenu-preview`**: demo café, fixtures and import files. **Never production personal data.** (An anonymised copy of production may come later, Sprint 3 or v1.0) | D1 **`digimenu-prod`** (live menus, orders, customer records) + media project `digimenu-media` |
| Secrets | fake values in `.dev.vars` (git-ignored) | separate dummy values | production Worker secrets ([secrets.md](secrets.md)) |
| Who deploys | you | the deploy repo workflow (see §3) | **only Ahmed or the Tech Lead**, by running `deploy.yml` (D-021) |
| Used for | building, unit tests, trying things | review, end-to-end tests, café snapshots, printed-link checks, owner previews | the cafés; each café pinned to one release of the window |
| Who can open it | you | anyone with the link: never put real personal data there | the public (menus), signed-in staff (admin) |

Table links in production use the path form, frozen on Fri 13 Nov:
`https://digimenu.wnsolutions.tn/<café>/t/<table>?k=<code>` (D-025, MOD-14). The domain comes
from configuration (`wrangler.toml` in the deploy repo), never from code, so another city can
deploy the toolkit on its own domain or on `workers.dev` (NFR-19).

## 2. How a change moves between environments

```text
Dev (laptop) ──PR + CI──▶ main ──tag vX.Y.Z──▶ deploy repo window ──▶ Preview checks ──Ahmed──▶ Production ──pin──▶ pilot café ──▶ other cafés
```

Details and rollback: [branching-and-releases.md](branching-and-releases.md).

## 3. Free-plan limits to keep in mind

Preview and production live in the **same Cloudflare account**, so they **share** its daily
quotas. Figures from `HOSTING_AND_COSTS.md` (checked 10 Oct 2026); Cloudflare can change them.

| Limit (Cloudflare Free) | Value | What it means for us |
| --- | --- | --- |
| Worker requests | 100,000 per day per account | Preview tests use the same quota as the cafés: keep end-to-end runs small. Static files (menus, scripts, photos) are free and unlimited |
| CPU time | 10 ms per request | heavy work (password hashing) is measured in the spike |
| Cron triggers | 5 per account | production uses 2–3; preview uses none (run jobs by hand) |
| D1 | 10 databases, 5 GB per account, 500 MB per database; 5 M rows read and 100 k rows written per day | preview and production databases count together |
| Durable Objects | SQLite storage only on Free | the café hub is declared as a SQLite class |
| GitHub Actions | free for public repos; 2,000 minutes per month for private repos | deploy repo jobs must stay short |

The platform checks usage every hour and alerts at 70 % of any quota (NFR-17).

**Open points (for the Tech Lead and Ahmed):**

- **Where the production deploy runs.** Built today: `deploy.yml` in the private deploy repo,
  limited to `DEPLOY_ALLOWED_ACTORS`. Proposed in ADR-0005: a workflow in the public repo inside a
  protected `production` environment whose required reviewer is Ahmed (free on public repos).
  Either way, Ahmed's approval comes first (D-021).
- **Preview deploys per pull request.** A Cloudflare API token cannot be limited to one Worker:
  a token that can deploy preview can also overwrite production. So a preview token in the public
  repo must be either an environment secret limited to `main`, or a token of a second, free
  Cloudflare account used only for preview. Until this is decided, the public repo holds **no**
  Cloudflare credentials.

## 4. Dev setup in short

```sh
nvm use            # Node 22, from .nvmrc
npm ci             # exact tool versions
npm run check      # same checks as CI
npx wrangler dev   # local Worker: added with the platform code (wrangler is not installed yet)
```
