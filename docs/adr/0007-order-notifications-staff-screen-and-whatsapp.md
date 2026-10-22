# ADR-0007: Orders go to the staff screen; WhatsApp only as hand-off or an optional paid module; no Telegram, no SMS

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-21 (decisions 2026-10-14) |
| **Source decisions** | D-023, D-028, D-030 · M-02, M-03, M-16, US-14, US-45, MOD-18, NFR-17, NFR-24 |
| **Deciders** | Ahmed (project lead) |

## Context

Staff must notice every order quickly, in a noisy café, on a counter tablet or on their own phone. The v0.1 draft added Telegram as an optional backup alert. Telegram is little used in Tunisia, so Ahmed removed it (D-023). Customers and cafés use WhatsApp, but automated WhatsApp messages are only allowed through the official WhatsApp Business Platform, which charges per message. SMS costs money and was dropped (D-030). The project itself must stay at $0/month.

A web page has a known limit: it cannot guarantee an alert while the phone is locked or the browser is closed (NFR-24).

## Decision

1. **The staff screen is the standard channel and the system of record** (M-02, D-028).
   - Orders are pushed by the café hub over hibernating WebSockets to **every signed-in staff device** of the café (counter tablet and waiters' phones).
   - "Start shift" unlocks sound, plays a test sound and keeps the screen awake where the browser allows.
   - The alert repeats at least every 60 seconds on all devices until someone accepts; after 3 minutes the order is highlighted as an escalation. When one person accepts, the others show "Accepted by" and that person's name, and stop.
   - A device that reconnects fetches missed orders, oldest first. If no staff device is connected for 10 minutes during opening hours with ordering on, the manager and Admin see an alert.
   - Staff can pause ordering. If ordering fails or is paused, customers get the **show-to-waiter** list, which sends nothing.
2. **WhatsApp hand-off for takeaway** (M-03), free. The order, customer details and consent are **stored first**; then WhatsApp opens to the café's number with the order number and summary pre-filled. The staff screen shows it as "WhatsApp — to confirm" until staff confirm it.
3. **WhatsApp Business Platform** (M-16), **optional per café, from v1.1, paid by the café** on its own Meta account. Switched on only by Admin with the café's written agreement. Credentials are encrypted and never reach a browser. A per-café daily cap prevents surprise bills. It **fails open**: an order never waits for WhatsApp. Staff alerts carry the order number, table or pickup time and item count, **never the customer's name or phone**. Default alert mode is `escalate` (send only if no staff screen is connected or the order is not accepted within 60 seconds); Ahmed confirms the default before v1.1.
4. **Not used:** Telegram in any form; SMS; email campaigns; push notifications to customers; automation of WhatsApp Web or of personal WhatsApp accounts (ban risk and against WhatsApp's terms).
5. **Customers check order status** with at most 3 automatic checks, then a "tap to refresh" button, to protect the request quota.

## Consequences

- **Positive:** $0/month for the project; one reliable channel to train staff on; works on any phone with a browser; WhatsApp is available to cafés that want it and pay for it; no customer phone numbers travel in staff alerts.
- **Negative / costs:** a locked phone may miss an alert. Mitigations: wake lock and charging, repeated alerts, the "no staff device" alert, a counter device where possible, and each café's real devices tested before ordering is switched on there. WhatsApp webhooks add Worker requests (about 10× headroom remains with the `escalate` default).
- **Follow-ups:** M-16 design waits for the WhatsApp setup and pricing work (WO-041) and is built after go-live. "Web push to a staff app added to the home screen" is a possible later improvement, to assess separately.

## Alternatives considered

| Option | Why not |
|---|---|
| Telegram bot alerts (v0.1) | Little used in Tunisia; removed by D-023. |
| SMS alerts | Paid; dropped by D-030. |
| Staff screen polling every few seconds | Breaks the free request quota (about 10,000 requests per device per day at 5 s). |
| WhatsApp as the only order channel | No server-side record unless stored first; no status, dashboards or loyalty. |

## References

- [Overview: main flows](../architecture/overview.md#main-flows) · [modules: catalogue](../architecture/modules.md#module-catalogue)
- [ADR-0010](0010-customer-data-consent-and-deletion.md) (consent for messages)
