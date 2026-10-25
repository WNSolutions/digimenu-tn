# ADR-0006: Username and password sign-in on any device, with four roles

| | |
|---|---|
| **Status** | Accepted — minimum password length and reset-code lifetime still to settle (see Consequences) |
| **Date** | 2026-10-21 (decision approved 2026-10-14); password hashing revised 2026-10-26 after the free-plan spike (D-053) |
| **Source decisions** | D-026, D-053 · C-14, US-36, US-37, US-38, NFR-11, NFR-23 · [spike note 0005](../spikes/0005-free-plan.md) |
| **Deciders** | Ahmed (project lead) for sign-in and roles; Software Architect for the mechanism |

## Context

Staff, managers, maintainers and Ahmed must sign in on **any device**: the counter tablet, a waiter's own phone, a laptop. There is no paid email or SMS service, so no reset emails or text codes. Managers must be able to create staff accounts and reset their passwords themselves. The v0.1 draft proposed personal invite links per device with no passwords; Ahmed replaced that with username and password (D-026).

On Cloudflare's free plan a request gets **10 ms of CPU**. Slow password hashing runs inside that limit. PBKDF2 through Web Crypto is available, but the runtime caps its iteration count (reported as 100,000) and the common recommendation of 600,000 iterations does not fit. bcrypt or Argon2 compiled to WebAssembly take about 100 ms.

## Decision

### Roles

Roles follow D-026 and are read from the database on **every** request, never cached in the cookie:

| Role | Scope | In short |
|---|---|---|
| **Admin** | all cafés | Ahmed. Releases, all accounts, customer records, exports. |
| **Manager** | one café | Menu, prices, staff accounts, sales dashboard of own café. |
| **Staff** | one café | Staff screen, order status, sold out. |
| **Maintainer** | assigned cafés | Setup, tables, QR cards, kill switch, rollback; no sales or customer data. |

The full permission table is in the [requirements](../product/README.md) (§2.1). The server allows exactly those actions and refuses everything else; a test covers every role × capability pair ([`tests/contract/`](../../tests/contract/README.md)). Café scope is enforced in the data-access layer.

### Passwords

- **The phone does the slow part; the server adds the pepper (D-053).** The free-plan spike measured server-side PBKDF2-SHA256 at about 0.2 ms of CPU per 1,000 iterations: only 20,000 iterations stay under a 7 ms budget, against the 30,000 minimum this ADR set. So the slow stretching moves to the browser:
  1. The sign-in page asks the server for the account's salt (`POST /auth/salt` with café + username). Unknown usernames get a fake salt computed as `HMAC-SHA256(pepper, café|username)`, cut to 16 bytes, so the answer never reveals which accounts exist. The call is rate-limited like sign-in.
  2. The browser derives `key = PBKDF2-SHA256(password, salt, iterations)` with Web Crypto, `iterations` = **600,000** by default, and sends only `key` over HTTPS. The password itself never leaves the device.
  3. The server stores and checks `pbkdf2c-sha256$<iterations>$<salt>$<HMAC-SHA256(pepper, key)>$p<pepper version>` with a constant-time comparison: under 1 ms of CPU.
- The **pepper** is a secret key in Worker secrets, so a leaked database or backup alone cannot be cracked. Even with the pepper, every guess costs the attacker the full 600,000 iterations.
- `key` is password-equivalent in transit: HTTPS only, never logged, never stored.
- The iteration count is stored per account. Before v1.0 it is measured on the slowest staff phone of the pilots (target: sign-in under 1.5 s); a lower count, never under 310,000, is chosen only if that phone is too slow. Raising it later re-wraps the hash at the next sign-in.
- Hashing happens **only** when a password is set or at sign-in. Every other request uses the session token.
- Rules follow NIST SP 800-63B: no composition rules, no forced periodic changes, maximum 128 characters, paste and password managers allowed, checked against a list of common passwords plus the café name and username.
- Unknown usernames get a fake salt and still run the server-side HMAC, so neither the answer nor its timing reveals which accounts exist. One generic error message.

### Sessions

- 32 random bytes per session; only the SHA-256 is stored. Cookie `__Host-dm_sid`, `HttpOnly; Secure; SameSite=Strict; Path=/`, on the **admin host only** ([ADR-0004](0004-permanent-table-link-and-hosts.md)). Never accepted from a URL.
- "Remember this device": up to 90 days of use for Staff and Managers, 14 days for Admin; otherwise signed out after 12 hours without activity or when the browser closes. "My devices" lists sessions and can sign any of them out.
- A password change or reset signs out every device of that account. Sensitive actions (customer export or deletion, role changes, resetting someone else's password) need a sign-in within the last 15 minutes.
- Cross-site requests: SameSite=Strict, an `Origin` check, and JSON-only bodies on state-changing calls.

### Resets without email

- A Manager resets Staff of their own café; Admin resets anyone. Maintainer accounts are created and reset by Admin only.
- A reset shows a **one-time code** to the person resetting, once. It is stored only as a hash, works once, and allows a few tries. The staff member enters username, code and a new password. The reset is logged.

### Brute force

- Limits are checked **before** hashing so attackers cannot burn CPU. Per account: growing delays after 5 failures, no permanent lock-out for Staff (so nobody can lock a café out during service), hard disable after 100 consecutive failures. Per IP hash and café: loose limits, because mobile carriers share IP addresses. A free Turnstile check on the sign-in form only if attacks appear.

### Second factor

- An authenticator-app code (TOTP, free, no SMS) for the **Admin** account (Should, Sprint 3), recommended for Maintainers, optional for Managers.

## Consequences

- **Positive:** works on any device with no app, email or SMS; managers are autonomous; a database or backup leak alone does not expose passwords; role changes take effect immediately.
- **Negative / costs:** sign-in needs JavaScript and takes about a second on a cheap phone while the browser stretches the password; the sign-in flow is two calls (salt, then sign-in). Losing the pepper key means nobody can sign in, so it is escrowed offline with the other keys ([ADR-0010](0010-customer-data-consent-and-deletion.md)).
- **Spike result (26 Oct 2026):** server-side hashing at 30,000 iterations did not fit the free CPU budget, so the fallback planned here became the decision (D-053, Ahmed). Server-only hashing at 20,000 iterations was the simpler alternative, rejected because each guess would cost an attacker who also holds the pepper about 30 times less.
- **Still to settle:**
  - **Minimum password length.** The requirement says at least 8 characters; the security review recommends 15 for Admin and Maintainer and 12 for Manager and Staff. Ahmed decides.
  - **Reset-code lifetime.** The requirement says the temporary password is valid 24 hours; the security review recommends 30 minutes, handed over in person. The shorter value is safer; to confirm with the Tech Lead.

## Alternatives considered

| Option | Why not |
|---|---|
| Personal invite link per device, no passwords (v0.1) | Replaced by D-026: staff change devices and share tablets. Kept only as the idea behind one-time reset codes. |
| Email magic links or SMS codes | Need a paid email or SMS service. |
| Passkeys (WebAuthn) | Tied to a device or platform account; does not fit shared café tablets. Possible later as an option for Admin. |
| bcrypt or Argon2 in WebAssembly | About 100 ms of CPU, far above the 10 ms limit. |
| Cloudflare Access | Sign-up asks for payment details. |

## References

- [Data model: accounts](../architecture/data-model.md#roles-and-what-each-one-can-reach) · [overview: security](../architecture/overview.md#security-and-privacy-in-brief)
- NIST SP 800-63B (digital identity guidelines, authentication)
