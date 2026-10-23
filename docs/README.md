# Documentation

Everything written about DigiMenu TN that is not code. Pick the section that matches what you want to do.

| Section | What you find there | Maintained by |
|---|---|---|
| [Architecture](architecture/README.md) | How the system is built: [overview](architecture/overview.md), [module system](architecture/modules.md), [data model](architecture/data-model.md), [releases and rollback](architecture/releases.md) | Software Architect |
| [Decision records (ADRs)](adr/README.md) | Why the important technical choices were made, one short record each | Software Architect |
| [Operations](operations/README.md) | Running the system: CI, deployments, secrets, backups, monitoring, runbooks | DevOps & Security Engineer |
| [Product](product/README.md) | What the system must do: requirements, user stories, module catalogue from the user's side | Product Analyst |
| [Design](design/README.md) | How DigiMenu looks and behaves: principles, tokens, components, screens and the design review | UI/UX Designer |
| [Spikes](spikes/README.md) | Short experiments that test an assumption before we build on it, each with a go / no-go and its numbers | Software Architect |

Other useful files at the root of the repository: [README](../README.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [SECURITY](../SECURITY.md) · [CHANGELOG](../CHANGELOG.md) · [LICENSE](../LICENSE)

## Where to start

| You are… | Read, in this order |
|---|---|
| New to the project | [README](../README.md) → [architecture overview](architecture/overview.md) → [ADR index](adr/README.md) |
| Building a module | [module system](architecture/modules.md) → [`modules/`](../modules/README.md) → [`core/schemas/`](../core/schemas/README.md) |
| Writing a migration or touching customer data | [data model](architecture/data-model.md) → [ADR-0010](adr/0010-customer-data-consent-and-deletion.md) |
| Preparing a release or a rollback | [releases](architecture/releases.md) → [operations](operations/README.md) |
| Deploying the toolkit in another city | [README](../README.md) → [ADR-0003](adr/0003-public-toolkit-and-private-deploy-repo.md) → [operations](operations/README.md) |

## Rules for documentation

- **English** for technical documentation. Guides for café staff and owners will be in French, with Arabic where useful.
- **Plain words, short paragraphs, tables where they help.** Many readers are new to software.
- **Describe what is true now.** Update the docs in the same pull request as the change.
- **Never** put real café data, people's names or contact details, secrets or customer data in the docs. Use the fictional demo café (`demo`).
- Planned: a maintainer guide for trained youth (French and English) and one-page guides per module, published with toolkit v1.0.
