# docs/architecture

How DigiMenu TN is built, and why. Start with the overview, then read the page for the part you work on.

| Page | Read it when you… |
|---|---|
| [Overview](overview.md) | are new to the project, or need the big picture: components, hosts, flows, environments, free-plan budget, and what changed since the v0.1 draft. |
| [Module system](modules.md) | build or review a module, change a café's features, or touch the config validator. |
| [Data model](data-model.md) | write a migration, a query or anything that touches customer data. |
| [Releases, pinning and rollback](releases.md) | tag a release, move a café to a new version, or need to roll one back. |

## Rules for this folder

- These pages describe **what is true now**. When the design changes, update the page in the same pull request as the code.
- A choice with lasting consequences also gets an [Architecture Decision Record](../adr/README.md). Pages link to ADRs for the "why".
- Diagrams are [Mermaid](https://mermaid.js.org/) code blocks; GitHub renders them. Keep labels in plain ASCII and check that they render in the pull request preview.
- Use the fictional demo café (`demo`) in examples. Never name a real partner café.

## Must not live here

- Operational how-tos, runbooks and CI details → [operations](../operations/README.md).
- Requirements, user stories and acceptance criteria → [product](../product/README.md).
- Secrets, real café data, personal data.
