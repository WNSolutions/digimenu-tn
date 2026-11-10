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
- `npm run dev` (local server with the demo café) and `npm run demo` (the demo café as one standalone HTML file, with a size check against the 20 KB budget).

[Unreleased]: https://github.com/WNSolutions/digimenu-tn/commits/main
