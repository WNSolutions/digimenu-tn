# Changelog

All notable changes to DigiMenu TN are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How we use this file

- **Every pull request** that changes behaviour adds a line under `[Unreleased]`, in the right group: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security`.
- **Every release** turns `[Unreleased]` into a version section and starts it with a one-line summary in English and in French, for café owners and maintainers:

  ```markdown
  ## [0.2.0] - 2026-11-08

  **EN:** Orders now reach the staff screen.
  **FR:** Les commandes arrivent maintenant sur l'écran du personnel.
  ```

- **Version numbers** (`MAJOR.MINOR.PATCH`):
  - `MAJOR`: café configuration, menu data or a module extension point changes in a way that is not compatible.
  - `MINOR`: a new module or feature. Never requires a change to café data or configuration.
  - `PATCH`: a fix. Never requires a change to café data or configuration.
- If a release ships while an automated check is failing, Ahmed's written OK is recorded in that release's section.

## [Unreleased]

### Added

- Repository foundation (WO-048): contribution guide, code of conduct, issue forms, pull request template, and product docs (roadmap, requirements index, labels, definition of done).
- Customer menu for the demo café (#6–#10, first part): menu with category bar, sizes and sold-out items; French, Arabic (right to left) and English with French fallback; opening hours; "Ma liste" saved on the phone for 6 hours with notes, re-checked against the menu; "Montrer au serveur" ticket with its own language switch. Prices in integer millimes everywhere.
- Static boot page: one `/api/boot` call, saved copy when offline, names-and-prices fallback if the release cannot load.
- Menu import from the spreadsheet (CSV) with plain-language reports, including ambiguous prices such as "4500" (D-045).
- Ordering through WhatsApp (D-063, module `whatsapp_handoff`, M-03): "Commander par WhatsApp" in Ma liste opens the customer's WhatsApp with the order written in the café's language; "Montrer au serveur" stays as a second choice; a closed café shows when orders start again. First piece of the module system: the customer page's extension registry (`list.action`), and a channel can now be one module or two.
- Loyalty moves into the go-live release (D-064): [ADR-0013](docs/adr/0013-loyalty-at-launch-phone-number-and-wallet-card.md) (phone number per café, stamps on staff-confirmed orders or a staff scan, web card with QR, Apple Wallet and Google Wallet); roadmap, requirements, module catalogue and data model updated.
- Staff app (#11, #15, #18, #45) at `/admin/`: sign-in with the password stretched on the device and peppered on the server (ADR-0006), one-time setup codes instead of e-mail (`tools/accounts/`), host-only session cookie, growing delays after failed sign-ins; orders screen with sound, "Reçue" / "Pas reçue" for WhatsApp orders and status buttons; menu editor where staff mark sold out and managers change prices, each change publishing a new menu revision with its change history. Migration `0003_accounts.sql`. `npm run dev` serves the staff app with a local demo manager.
- Orders (#15, #19): `POST /api/orders` prices every line on the server from the published menu, numbers orders of the day (A1, A2…), stores the order with the customer record and consents in one transaction (name and phone encrypted, phone found by a keyed hash, ADR-0010), refuses sold-out items, wrong table codes, closed hours and floods from one table, and answers retries with the same order. Checkout on the phone: first name, phone, the short privacy notice, an unticked offers box; WhatsApp ordering now stores the order first and puts its number in the message (D-063). Migration `0002_orders_customers.sql`. `npm run dev` runs the real Worker on an in-memory database (`--now` to try ordering at night).
- Live server (Worker `digimenu`): `/api/boot` reads the café, table, pinned release and menu from D1 and counts visits with no cookies; first migration `0001_init.sql`; release builder with hashed files, a manifest and a Content-Security-Policy (`npm run release`); café seed tool (`npm run seed`); Wrangler configuration template. The boot page now has a landing at `/` and says when a link names no café.
- Loyalty (#41, #42, module `loyalty`, M-15, D-064): customers join at checkout (unticked, the notice's own text) and get a stamp card at `/<café>/carte` or from "Fidélité" in the menu's top bar; one stamp when staff accept an order (or mark a WhatsApp order "Reçue"), taken back if it is refused; staff app "Fidélité" tab to find a card by number or phone, add a counter stamp (with undo), use a reward and give a one-time code for a new phone; customers can leave, which clears the stamps. Migration `0004_loyalty.sql`. The demo café has it on (10 stamps = a free coffee).
- Café menu cover (D-068): the menu opens on a band in the café's own colour with the café's logo in a circle on its edge, then its name, address and status, centred; the top bar and the browser's bar follow the cover until the menu scrolls. Item rows centre the name and the price. Café logos are static files (`/media/<café>/<file>`, from `branding.logo`), published with the site: the demo café's invented logo from this repository, real cafés' from the deploy repository (`build.js --media`). The demo café has a logo.
- DigiMenu brand on DigiMenu's own screens (D-068): the home page, the staff sign-in and first-time screens, and the staff app's frame use emerald, ivory and champagne, Jost and Cairo, the champagne frame and the logo files (`platform/brand/`). Fonts come from `@fontsource` (SIL OFL, licences shipped next to them); the logo files come from the deploy repository (`build.js --brand`) and are not covered by the MIT licence; a build without them shows the name in plain text. Café menus never load any of it.
- Dev server: `--cafe <folder>` shows a real café from the private deploy repository before it goes live, `--media` and `--brand` serve its logo and the DigiMenu logo files; `/` now shows the home page.
- Retention (D-067): customer records with no order for 24 months are deleted every night (Worker cron trigger, 03:43 Tunis time), loyalty card included; orders stay as anonymous lines; one audit line per run. Deletion on request and retention share one erase step (`customer-erase.js`).
- Customer records for Admin (#23, ADR-0010): a Clients tab in the staff app, Admin only, to search by number, last three digits or first name, filter by café, choice and dates, open a record, export one person's file (JSON) or everyone (CSV built in the browser), record a withdrawal of offers, and delete on request after two confirmations. Deletion erases module data first (fail-closed), suppresses the number by keyed hash, keeps orders as anonymous lines and is logged without the number. Every list, search, view, export, change, deletion and refused attempt is in the audit log. New server point `customer.records`; `/admin/api/cafes` lets Admin (and anyone working in several cafés) switch café.
- QR table cards (#13, `npm run cards`): one card per table in the brand's tent design (D-060), 100 × 145 mm with 3 mm bleed, HTML or PDF with Jost and Cairo embedded; each QR code holds the table's permanent link with its check code. Demo cards are marked DEMO; cards to print are refused until the domain answers as production, never made for the demo café, and every printed link is appended to a log.
- Loyalty card QR code and staff scanning: the card shows a signed QR code (card number, 24-hour expiry, server signature; no phone number), and the staff app's Fidélité tab scans it with the phone camera. QR encoder `core/qr.js` (byte mode, error correction M, versions 1–10, checked against two decoders) shared by the server and tools; the camera reader falls back to jsQR, loaded only when needed. Only the staff app may use the camera.
- Module system, next points: customer `header.action`, `sheet.page` (with its own link), `checkout.fields`, `postOrder.block`, drawn by the core from module descriptions; server `order.afterStore` and `order.statusChanged` (fail-open) and module routes `/api/m/<module>/…` and `/admin/api/m/<module>/…`; staff app `staff.panel` tabs. Module server and staff code is listed in two generated files (`node tools/modules/registry.js`, checked by the tests).
- `npm run dev` (local server with the demo café) and `npm run demo` (the demo café as one standalone HTML file, with a size check against the 20 KB budget).

[Unreleased]: https://github.com/WNSolutions/digimenu-tn/commits/main
