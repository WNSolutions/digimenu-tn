# ADR-0006: Username and password sign-in on any device, with four roles

| | |
|---|---|
| **Status** | Accepted — minimum password length and reset-code lifetime still to settle (see Consequences) |
| **Date** | 2026-10-21 (decision approved 2026-10-14) |
| **Source decisions** | D-026 · C-14, US-36, US-37, US-38, NFR-11, NFR-23 |
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

- Stored as `pbkdf2-sha256$<iterations>$<salt>$<HMAC-SHA256(pepper, PBKDF2(password, salt, iterations))>$p<pepper version>`. The **pepper** is a secret key in Worker secrets, so a leaked database or backup alone cannot be cracked.
- Iterations = the highest count whose p99 CPU is ≤ 7 ms on the deployed preview Worker (expected 30,000–40,000), measured in the Sprint 1 spike. Hashes upgrade transparently at the next sign-in.
- Hashing happens **only** when a password is set or at sign-in. Every other request uses the session token.
- Rules follow NIST SP 800-63B: no composition rules, no forced periodic changes, maximum 128 characters, paste and password managers allowed, checked against a list of common passwords plus the café name and username.
- Unknown usernames still run a dummy hash, so timing does not reveal which accounts exist. One generic error message.

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
- **Negative / costs:** password hashing is weaker per guess than the common recommendation because of the CPU limit; the pepper compensates. Losing the pepper key means nobody can sign in, so it is escrowed offline with the other keys ([ADR-0010](0010-customer-data-consent-and-deletion.md)).
- **If the spike fails** (fewer than about 30,000 iterations fit): the browser stretches the password with PBKDF2 at a high count, and the server applies a fast keyed hash with the pepper. Proposed to the Tech Lead before relying on it.
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
