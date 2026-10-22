# Security policy

DigiMenu TN is a small, volunteer-run open-source project by Why Not Solutions (WNS). It runs
real menus and real orders for partner cafés in Monastir, Tunisia, and it stores customer
names and phone numbers. Thank you for helping us keep it safe.

## Report a vulnerability privately

**Do not open a public issue, pull request or discussion for a security problem.**

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability** (GitHub private vulnerability reporting).
3. Describe the problem, the steps to reproduce it and the impact you expect.

Only the maintainers can read your report. You can write in English or French.

If the **Report a vulnerability** button is missing, open an issue titled
"Security contact request" **with no details**, and we will reply with a private channel.

## Never post private data

In issues, pull requests, discussions, screenshots or logs, never post:

- customer data (names, phone numbers, addresses, order history);
- real café data that is not already public (configurations, exports, backups, staff accounts);
- passwords, tokens, API keys or private keys, even expired ones.

If you see such data posted anywhere in this project, report it privately as described above.

## Scope

In scope:

- the code in this repository (platform shell, core, modules, tools);
- the live DigiMenu service run by WNS: café menu links under `digimenu.wnsolutions.tn` and the
  staff/admin app;
- our GitHub Actions workflows and repository configuration.

Out of scope:

- the services we build on (Cloudflare, GitHub, Meta/WhatsApp): report to them directly;
- denial-of-service or load testing, spam, and social engineering of café staff or maintainers;
- physical attacks such as replacing a printed QR card (please tell us anyway: it helps the cafés);
- findings that need a rooted phone or a browser that no longer receives security updates.

## Testing rules (safe harbour)

We will not take action against good-faith research that follows these rules:

- Test on your own computer with the fictional **demo café** (`wrangler dev`), not on the live
  cafés.
- Never place real orders, change real menus or access data that is not yours. If you reach
  personal data by accident, stop, do not keep a copy, and tell us.
- Give us reasonable time to fix the problem before you publish anything.

## What happens next

We are a small team, so these targets are best effort:

| Step                                                | Target                                        |
| --------------------------------------------------- | --------------------------------------------- |
| We confirm we received your report                  | 5 working days                                |
| We tell you whether we accept it and how serious it is | 10 working days                            |
| A fix or a safe workaround for a critical problem  | 14 days (a café can be rolled back in minutes) |
| We publish a GitHub Security Advisory and credit you (if you wish) | when the fix is released      |

## Supported versions

Each café runs one release from a window of at most three releases (previous, stable,
candidate). Security fixes are made on the newest release and shipped as a patch release
(`vX.Y.Z`); cafés on older releases are moved forward. Versions outside the window are not
supported.
