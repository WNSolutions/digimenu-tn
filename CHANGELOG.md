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

[Unreleased]: https://github.com/WNSolutions/digimenu-tn/commits/main
