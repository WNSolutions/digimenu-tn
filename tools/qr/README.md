# tools/qr/

The **QR table-card generator** (US-32, issue #13): from a café's table list, one card per table in the brand's table-tent design (D-060).

**Status:** Prototype (`npm run cards`). Print-ready files for the print shop (trim box, crop marks, colour proof) and the deploy repository's link check come with issue #25.

## Use

```sh
npm run cards                                   # DEMO cards for the demo café → dist/cards/demo.html
npm run cards -- --tables 5,7 --pdf cards.pdf   # some tables, also as a PDF (Playwright's Chromium)
npm run cards -- --base https://digimenu-preview.wnsolutions-tn.workers.dev   # cards that open the test address
npm run cards -- --cafe <folder> --print --log printed-links.csv --mark digimenu-mark.svg   # cards to print
```

`--help` lists every option.

## What a card contains

The front face of the tent, 100 × 145 mm plus 3 mm bleed (each page is 106 × 151 mm):

- Emerald `#004532` with the champagne `#C9A45C` frame 3.75 mm inside the edge.
- "DIGIMENU", with the DigiMenu mark when `--mark` gives the brand kit's SVG. The brand files are not in this public repository.
- The café's name.
- The table's QR code in emerald on an ivory panel, about 50 mm wide with its 4-module quiet zone, and "TABLE 07" under it.
- "Scan for the menu · Scannez pour le menu" and the Arabic line "امسح للقائمة".
- The short address `<host>/<café>` in champagne, for phones that cannot scan.

Fonts are Jost and Cairo (SIL Open Font License), embedded in the file, so it prints the same on any computer. The QR codes come from `core/qr.js`: error correction M, never typed by hand.

The approved tent design (D-060) replaces the issue's first idea of a "DigiMenu by Why Not Solutions" line on the card.

## Rules

- **Every card carries the table's check code** (`?k=`), even for a café with ordering off, so ordering can be switched on later without reprinting.
- **The same table always gets the same link**: it comes from `tables.csv` (label and check code). It changes only if the check code is revoked. Printed links never change ([ADR-0004](../../docs/adr/0004-permanent-table-link-and-hosts.md)).
- **Demo cards are marked "DEMO".** That is the default, and the demo café only ever gets demo cards.
- **`--print` refuses** until the link's domain answers `/api/health` as the production server, and needs `--log`. Every printed link is appended to that log (`printed_at,cafe,table,link`), which lives in the private deploy repository; CI re-opens every printed link (#25).
- Each new card design is test-scanned with at least 3 phones (Android and iPhone) before printing.

## Must not live here

- Generated cards or check codes of real cafés (they are private; check codes protect against prank orders).

## Related

[Releases: the permanent link contract](../../docs/architecture/releases.md#the-permanent-link-contract) · [`core/qr.js`](../../core/qr.js) · [`tools/`](../README.md)
