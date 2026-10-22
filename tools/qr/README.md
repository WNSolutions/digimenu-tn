# tools/qr/

The **QR table-card generator** (US-32): from a café's table list, one print-ready PDF card per table.

**Status:** Planned — prototype in Sprint 1 (demo card for table 5), production cards in Sprint 3 (printed 16–20 Nov 2026).

## What a card contains

- The café's logo, the table number in large type, and the QR code of the permanent link `https://digimenu.wnsolutions.tn/<café>/t/<table>?k=<code>`.
- The short address in text (`digimenu.wnsolutions.tn/<café>`) for phones that cannot scan.
- "Scan for the menu" in French, Arabic and English, and a small "DigiMenu by Why Not Solutions" line (wording to be confirmed by Ahmed).

## Rules

- **Every card carries the table's check code** (`?k=`), even for a café with ordering off, so ordering can be switched on later without reprinting.
- The same table always gets the same link unless its check code was revoked. Printed links never change ([ADR-0004](../../docs/adr/0004-permanent-table-link-and-hosts.md)).
- Every generated link is **appended to `printed-links.csv`** in the private deploy repository; CI re-opens all of them on every deploy.
- The tool **refuses to make cards for printing** until the real domain is active; before that it makes demo cards only.
- Each new card design is test-scanned with at least 3 phones (Android and iPhone) before printing.
- QR codes as SVG; PDF through the same browser tool used for tests (no extra PDF library).

## Must not live here

- Generated cards or check codes of real cafés (they are private; check codes protect against prank orders).

## Related

[Releases: the permanent link contract](../../docs/architecture/releases.md#the-permanent-link-contract) · [`tools/`](../README.md)
