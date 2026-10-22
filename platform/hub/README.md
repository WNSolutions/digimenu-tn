# platform/hub/

The **café hub** — one Durable Object per café — and the **scheduled jobs**. Both run inside the same Worker as the shell.

**Status:** Planned — go/no-go in the Sprint 1 spike (WebSocket hibernation on the free plan); orders in Sprint 2.

## What lives here

- **`CafeHub` Durable Object** (one class, one instance per café):
  - numbers the orders of the day (e.g. A12) and enforces the unique client key, so a double tap never creates two orders;
  - applies rate limits per table and per device, the café-wide burst cap and the pause flag (kept in memory, not in the database, to save writes);
  - pushes new orders and status changes to every signed-in staff device over **hibernating WebSockets**;
  - from v1.1, keeps the WhatsApp message outbox in its own storage (M-16).
- **Scheduled jobs** (cron, at most 3 of the 5 free triggers):
  - hourly: close the analytics hour, check quotas (alert at 70 %), watch for unacknowledged orders;
  - daily: retention jobs, pruning of old menu snapshots, sessions and reset codes.

## Rules

- **Never poll.** Push over WebSockets; polling breaks the free request quota.
- A change to the Durable Object **class** ships in its own additive deploy: Cloudflare blocks a rollback across a class change.
- Orders are written to the database **once**, with the customer and consent records, in one batch.
- Retention jobs follow the [data model](../../docs/architecture/data-model.md#retention); no 30-day purge of customer data (removed by D-027).

## Must not live here

- Business rules for a single module (use extension points such as `schedule.daily`).
- Sending any message through Telegram or SMS ([ADR-0007](../../docs/adr/0007-order-notifications-staff-screen-and-whatsapp.md)).

## Related

[Overview: main flows](../../docs/architecture/overview.md#main-flows) · [`platform/`](../README.md)
