# Secrets

A **secret** is anything that lets someone act as us or read protected data: a password, an
API token, an encryption key. If a stranger could do harm with it, it is a secret.

**The rule:** secrets never go into Git (this public repo or the private one), issues, pull
requests, screenshots, CI logs, WhatsApp messages or emails. They live only in the places listed
below. Sources: REQUIREMENTS NFR-12 and NFR-22, `HOSTING_AND_COSTS.md` §5,
`WHATSAPP_AND_SIGNIN.md` A5 and B4.

## 1. What is secret here, and where it lives

| Item | Secret? | Where it lives | Who can see or change it |
| --- | --- | --- | --- |
| Cloudflare API token for deploys (`CLOUDFLARE_API_TOKEN`) | **Yes** | GitHub Actions secret of the **private deploy repo** (today's `deploy.yml`), or, if ADR-0005 is confirmed, a secret of the public repo's protected `production` environment. **Never** a plain repository secret of the public repo | Ahmed, Tech Lead |
| Cloudflare account ID (`CLOUDFLARE_ACCOUNT_ID`) | No (an identifier, useless without a token) | Deploy repo: Actions variable and `wrangler.toml` | deploy repo admins |
| D1 database IDs, Worker names | No (identifiers) | Deploy repo `wrangler.toml` | deploy repo admins |
| Login pepper `PEPPER_v1`, customer-data keys `PII_KEY_v1` and `PII_IDX_KEY`, WhatsApp key-encryption key `WA_KEK_v1` | **Yes, critical** | Cloudflare **Worker secrets** of the production Worker, plus an offline escrow copy in the two-person password-manager vault | Ahmed + one named backup person |
| `META_APP_SECRET` (only if we use the Tech Provider route for WhatsApp) | **Yes** | Worker secret | Ahmed |
| Each café's WhatsApp Business token | **Yes** | Entered **once** by the café owner in the admin app, stored **encrypted** (AES-256-GCM) in D1, decrypted only with `WA_KEK_v1`. Never in config files, never sent by WhatsApp or email, never shown back | nobody reads it; the Worker uses it |
| Staff and owner passwords | **Yes** | Never stored as such: only a slow salted hash + pepper in D1 (NFR-23). Reset by the café manager or Ahmed | the person only |
| Backup encryption: **public** key | No | May be committed in the deploy repo | anyone |
| Backup encryption: **private** key | **Yes, critical** | Offline only (password-manager vault), never on GitHub | Ahmed + backup person |
| Preview secrets | Yes, but different | Separate dummy values on the `digimenu-preview` Worker. **Never copy production keys or production personal data to preview** | Tech Lead |
| Cloudflare token for data jobs (backup, migrate, pin, media) | **Yes, critical**: it can read customer data | GitHub Actions secret of the **private** deploy repo only: these jobs never run in the public repo, whose logs and artifacts anyone can read | Ahmed, Tech Lead |
| `GITHUB_TOKEN` in workflows | Yes | Created by GitHub for each run, expires after it; our workflows give it read-only access | automatic |

Exact secret names are set by the platform code; the names above come from the design documents.

> **If the critical keys are lost, customer data cannot be decrypted and nobody can log in.**
> That is why each one has an offline copy held by two people.

## 2. How to set a secret

**Cloudflare Worker secret** (runtime keys), from a laptop with Wrangler logged in:

```sh
npx wrangler secret put PII_KEY_v1 --env production   # Wrangler asks for the value; it is not shown
```

Setting a secret creates and deploys a new version of the Worker, so only Ahmed or the Tech Lead
do this for production.

**GitHub Actions secret** (deploy token): deploy repo → **Settings → Secrets and variables →
Actions → New repository secret**. GitHub hides the value in logs, but anyone who can push a
workflow to that repository can use it. That is why only Ahmed and the Tech Lead have write
access to the deploy repo (on GitHub Free, private repositories have no "environments" to
restrict secrets further).

**The Cloudflare API token** is created in Cloudflare → My Profile → API Tokens with the smallest
permissions that work: Workers Scripts edit and D1 edit on our account, Workers Routes on the WNS
zone. It must **not** be able to edit DNS or settings of other WNS products on the same domain
(NFR-12). Set an expiry date and rotate it at handover.

## 3. Secrets on your laptop

`wrangler dev` reads local secrets from a file named `.dev.vars` at the repository root.

- `.dev.vars` is listed in `.gitignore`, so Git ignores it. Never rename it or force-add it.
- Use **fake values** for local work. A `.dev.vars.example` with the variable names and fake
  values will be added with the platform code: copy it to `.dev.vars`.
- Never put production values on a laptop.

## 4. Automatic protection

- **GitHub secret scanning and push protection** (free for public repositories) block a push that
  contains a known token format and alert on anything already in the history.
- **CI guard** (`ci.yml`): fails if `.dev.vars`, `.env`, key files or private keys are tracked.
- **`.gitignore`** in both repositories excludes the usual secret files.

Private repositories on GitHub Free get no secret scanning from GitHub, so be extra careful in
the deploy repo.

## 5. If a secret leaks

A secret is leaked the moment it is pushed, posted or shared, **even if you delete it a minute
later**: deleting a commit or a message does not remove copies.

1. **Revoke or rotate first.** Cloudflare token: Cloudflare → API Tokens → Roll or Delete.
   Worker key: put a new version (`PII_KEY_v2`) and follow the key-rotation runbook (re-encrypt).
   A café's WhatsApp token: the owner removes it in Meta Business Settings and reconnects.
2. **Tell Ahmed** immediately, privately.
3. **Clean up**: remove the secret from the file and push; ask GitHub Support to purge cached
   views if needed. Do not rewrite `main` history yourself.
4. **Write an incident note**: what leaked, when, for how long, what was done.
