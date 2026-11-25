# ADR-0010: Customer records with recorded consent, field encryption, Admin-only access and deletion on request

| | |
|---|---|
| **Status** | Accepted — retention period and legal points are open with Ahmed (see Consequences) |
| **Date** | 2026-10-21 (decision approved 2026-10-14) |
| **Source decisions** | D-027 · C-15, US-40 to US-43, NFR-13, NFR-14, NFR-15, NFR-16, NFR-22 |
| **Deciders** | Ahmed (project lead) for keeping the data; Software Architect for the protection design |

## Context

Ahmed decided to **keep customer data** — first name, phone number and order history — for every order, for loyalty and future WNS marketing, with the partner cafés' agreement (D-027). He takes responsibility for the legal requirements (Tunisia's personal-data law and any declaration to the national authority, INPDP); the system must provide the tools: notice, consent record, export, deletion and an access log.

This reverses three rules of the v0.1 draft: dine-in orders asked for nothing personal; personal fields were blanked after 30 days; backups held no personal data. Phone numbers are typed by customers and **not verified** (no SMS).

## Decision

1. **Collect with notice and choice.** First name and phone for every order type (dine-in: per-café setting `dineInDetails`, default `required`); address for delivery; name and phone for event and reservation requests. A 2–3 line notice above Confirm links to the full notice. Two separate, unticked choices: order updates and marketing. Ordering never depends on ticking them.
2. **Store atomically.** The order, the customer record and the consent records are written together or not at all. Each consent record keeps time, café, order, purpose, decision, the **exact notice version** and language shown.
3. **One record per phone** across all WNS cafés, found by a **keyed hash** of the phone number. Typing a number never reveals a stored name; pre-fill comes only from the customer's own browser.
4. **Encrypt field by field.** First name, phone and address are encrypted with AES-256-GCM using a key kept in Worker secrets, on top of Cloudflare's encryption at rest. Only the last three digits are stored in clear, for masked display. Phones are decrypted only when an allowed role views them, for a WhatsApp message (v1.1), or for an export.
5. **Admin-only access, always logged.** Customer records are reachable only through core functions that check the role. Every list, search, view, export, deletion and consent change goes to an **append-only** audit log, kept at least 24 months. Managers and staff see only what an order card needs (first name; full phone and address only on open takeaway or delivery orders). Maintainers see none.
6. **Versioned privacy notice.** Every edit creates a new version; old versions stay readable; consent records point to the version shown.
7. **Export and deletion on request.** Admin checks that the person controls the number, then exports one file (record, orders, consent history) or deletes: the customer record is removed, contact fields on orders are blanked (orders remain as anonymous lines for counts and sales), loyalty balances are removed, and a **suppression entry** (keyed hash only) prevents any future message. Deletions are logged without the phone number and cannot be undone.
8. **Backups.** Weekly export, **encrypted as a whole file** on top of the field encryption, stored only in private places, kept on a **rolling 8 weeks** so deletions reach backups. Backup files are stored as private workflow artifacts with an expiry, or offline — **never committed to git**, because git history keeps every version forever and would break the 8-week promise. The restore is tested before go-live.
9. **Keys are escrowed offline** (field key, lookup key, password pepper, backup key) with Ahmed and a named backup person. If they are lost, the data cannot be recovered.
10. **Never** in analytics, application logs, error reports, CI logs, test fixtures, preview databases or the public repository. Test orders never create customer records.
11. **Go-live gate.** No real customer data is collected at a café until the role tests, consent, customer records with the access log, export and deletion, the approved notice in FR/AR/EN, an encrypted backup with a tested restore, and Ahmed's legal check have all passed. Until then the café runs menu and show-to-waiter only.

## Implementation notes (25 Nov 2026, issue #23)

- **Clients tab** in the staff app, shown to Admin only (`/admin/api/customers`, 404 for every other role, and the attempt is logged). Search by full number (keyed hash), the last three digits, or first name (accents and case ignored; names are decrypted page by page, never searched in clear). Filters: café, current choice (offers, loyalty), dates.
- **The list masks the phone** (`•• ••• 456`); opening a record shows it in full and is logged as a view.
- **Export of one person:** one JSON file with the record, every order with its lines, the consent history, and each module's part (the loyalty card and its stamps).
- **Bulk export:** pages of 200, joined into a CSV in the Admin's browser, so no file is kept on the server. Each page is logged with its record count.
- **Withdrawal on request:** Admin records that the person no longer wants offers (a `granted = 0` consent, source `admin`). Loyalty is left from the card, or by deletion. Admin never records a consent for someone.
- **Deletion:** a first tap shows what will happen, then Admin types the last three digits of the number.
  - Modules erase their part first (`customer.records`, fail-closed). Then one batch puts the keyed hash on the suppression list, removes contact and free-text notes from every order (lines and totals stay, anonymous), and deletes the consents and the record.
  - Logged with the record id and the number of orders, never the number or the name.
- **Consent semantics already in place:** each order records the offers choice as ticked or not, so the latest choice wins. Joining loyalty is recorded only when ticked.
- **Encrypted weekly backup (deploy repository, `backup.yml`, 25 Nov):**
  - Sundays 03:17 Tunis time and on demand: D1 export, encrypted with age to the public key(s) in the repository variable `BACKUP_RECIPIENT`, kept as a private artifact for 56 days, never in Git.
  - Every run proves the restore with a throwaway key: decrypt, byte comparison, import into a fresh database, integrity check, row counts per table. First run on preview passed.
  - Ahmed's one real restore with his offline key is the last step (`backups/RESTORE.md`).
- **Still to do before the go-live gate:** that real restore, and the retention job (proposal: 24 months without an order).

## Consequences

- **Positive:** a customer base built with provable consent; a leaked database or backup alone does not expose names or phones; every access to customer data is traceable; the design leaves room for a future per-café "marketing access" without moving data.
- **Negative / costs:** more checkout fields than the v0.1 design, which may lower dine-in ordering; Ahmed can make the phone optional per café. Key management becomes critical. Encryption adds microseconds per record, so exports are paginated to stay inside the CPU limit.
- **Open with Ahmed:** the retention period (proposal: delete records with no order for 24 months); the name of the data controller and the contact for requests; whether staff see first names on every order; whether keeping a suppression list of opted-out numbers is acceptable; the legal check with a qualified person before the first real order (due Fri 20 Nov 2026).

## Alternatives considered

| Option | Why not |
|---|---|
| Collect nothing for dine-in and purge after 30 days (v0.1) | Replaced by D-027. |
| Customer accounts with passwords | Out of scope; customers are identified by phone only. |
| Rely only on Cloudflare's encryption at rest | Does not protect against a leaked API token, a stolen export or backup, or a bug that lists rows. |
| Backups committed to the private repository | Git history would keep deleted customers' data forever. |
| Per-café customer databases | Breaks "one customer record across WNS cafés" and multiplies keys and backups. |

## References

- [Data model: customer data](../architecture/data-model.md#customer-data-consent-encryption-deletion) · [retention](../architecture/data-model.md#retention)
- [ADR-0006](0006-accounts-passwords-and-roles.md) (roles) · [ADR-0007](0007-order-notifications-staff-screen-and-whatsapp.md) (message consent)
