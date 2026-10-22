# Contributing to DigiMenu TN

Welcome, and thank you for helping!

DigiMenu TN is a free, open-source QR menu and ordering system for small cafés in Tunisia, made by Why Not Solutions (WNS). Many of our contributors are learning to code, so **first contributions are very welcome**. If something on this page is unclear, that is our bug: open an issue or ask in Discussions.

## Contents

1. [Ways to help](#1-ways-to-help)
2. [Set up your computer](#2-set-up-your-computer)
3. [How a change gets in](#3-how-a-change-gets-in)
4. [Writing French, Arabic and English texts](#4-writing-french-arabic-and-english-texts)
5. [Modules](#5-modules)
6. [What never goes in this repository](#6-what-never-goes-in-this-repository)
7. [Security problems](#7-security-problems)
8. [Code of conduct and licence](#8-code-of-conduct-and-licence)

## 1. Ways to help

- **Report a bug or suggest a feature** with the issue forms (Issues → New issue).
- **Fix or add translations** (French, Arabic, English) and improve the guides.
- **Pick an issue** labelled `good first issue` or `help wanted`. Comment "I would like to work on this" first, so nobody else starts the same thing.
- **Test the demo café on your phone** and tell us what is slow or confusing.

Not sure what a label means? See [docs/product/labels.md](docs/product/labels.md). What is planned and when? See the [roadmap](docs/product/roadmap.md).

## 2. Set up your computer

You need [Git](https://git-scm.com/), [Node.js 22](https://nodejs.org/) (the version in `.nvmrc`) and a code editor.

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/digimenu-tn.git
cd digimenu-tn

# 2. Install exactly the versions listed in package-lock.json
npm ci

# 3. Run all checks, the same ones CI runs
npm run check
```

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run lint`      | Checks code style and import rules                  |
| `npm run typecheck` | Checks types (JSDoc)                                |
| `npm test`          | Runs the unit tests                                 |
| `npm run check`     | Runs all checks. **Run it before every push.**      |
| `npm run format`    | Fixes formatting automatically (if `check` says so) |

The [README](README.md) explains how to run the demo café on your computer.

## 3. How a change gets in

**1. Start from an issue.** Every change has an issue that says what and why. Typo fixes can skip this step.

**2. Create a short branch** from `main`, named after the kind of change:

| Branch          | Use it for    | Example                |
| --------------- | ------------- | ---------------------- |
| `feat/<what>`   | a new feature | `feat/menu-search`     |
| `fix/<what>`    | a bug fix     | `fix/arabic-total`     |
| `docs/<what>`   | documentation | `docs/rollback-guide`  |

Adding the issue number helps: `feat/42-menu-search`. The full rules (other prefixes, tags, releases) are in [docs/operations/branching-and-releases.md](docs/operations/branching-and-releases.md).

**3. Write Conventional Commits.** We squash and merge, so **your pull request title becomes the commit on `main`**. It must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): what changes`, in English, imperative, lower case, under 72 characters.

- **type:** `feat`, `fix`, `docs`, `test`, `refactor`, `ci` or `chore`
- **scope:** the area or module you changed, for example `menu`, `i18n`, `staff-screen`, `core` or a module key such as `payment_choice`

```text
feat(menu): add search for menus with more than 40 items
fix(i18n): keep prices left-to-right in Arabic
docs(onboarding): explain how to print QR cards
```

A change that breaks existing café configuration or menu data adds `!` after the type (`feat(core)!: new config format v4`) and explains the migration in the pull request.

**4. Open one pull request per change.** Small pull requests are reviewed faster. Fill in the template and link the issue (`Closes #42`). Draft pull requests are welcome if you want early feedback.

**5. Review.** Ahmed (project lead) or the Tech Lead reviews every pull request, and CI must be green before merge. Questions in a review are normal: answer them and push new commits to the same branch.

**6. Merge and release.** A maintainer merges. Merged code reaches a café only inside a release that Ahmed approves, pilot café first. A change is finished when it meets the [definition of done](docs/product/definition-of-done.md).

## 4. Writing French, Arabic and English texts

Every screen exists in French, Arabic and English.

- **Texts never go in code.** They live in `i18n/fr.json`, `i18n/ar.json` and `i18n/en.json` (`core/i18n/` for the core, `modules/<key>/i18n/` for a module).
- **Same keys in all three interface files.** CI checks it. Menu content is different: if an item has no Arabic or English name yet, the menu shows the French text and the maintainer report lists it.
- **Short and plain.** A waiter reads it in a rush; a customer reads it on a small phone.
- **Use placeholders, do not glue pieces together:** `"cart.count": "{count} articles"`, not `count + " articles"`. Word order changes between languages.
- **Arabic:** simple Modern Standard Arabic; check the screen right-to-left; do not write "left" or "right" in a text.
- **Numbers:** Western digits (0–9) in every language. Prices in TND with 3 decimals, for example `4,500 DT`.
- **Machine translation** is fine as a draft, but a person who reads the language checks it before merge.
- **Cannot write one of the languages?** Say so in your pull request; a reviewer will help before merge.

## 5. Modules

Every optional feature is a **module**: one folder `modules/<key>/` that a café switches on or off by configuration. Before you write one, read the [module contract](docs/architecture/modules.md) and open a **Module proposal** issue.

The short version: off by default · no café-specific code · talks to the core only through extension points, never to another module · texts in FR/AR/EN · tests and a one-page guide.

## 6. What never goes in this repository

This repository is public. It contains only a **made-up demo café**. Never commit:

- **Real café content:** menus, prices, logos, photos, café names, table lists, printed links or check codes
- **Customer data:** names, phone numbers, addresses, orders. Not in tests, fixtures, logs or screenshots either
- **Secrets:** passwords, API tokens, keys, `.dev.vars` files
- **Workshop participants' data:** names, certificate lists

Real café data lives in a private repository. If you committed something by mistake, do not just delete it in a new commit (Git history keeps it): tell the maintainers privately, as explained in [SECURITY.md](SECURITY.md).

## 7. Security problems

Please do not open a public issue for a security problem. Follow [SECURITY.md](SECURITY.md) to report it privately.

## 8. Code of conduct and licence

Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contribution is published under the [MIT licence](LICENSE).
