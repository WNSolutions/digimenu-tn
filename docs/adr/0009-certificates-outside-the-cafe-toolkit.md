# ADR-0009: Youth certificates are a separate WNS tool, not a café module and not part of this repository

| | |
|---|---|
| **Status** | Accepted — code lives in a separate repository, `WNSolutions/wns-certificates`, which Ahmed creates when WO-042 starts |
| **Date** | 2026-10-21 |
| **Source decisions** | D-032 · requirements addendum v0.3 (project tool P-01 `certificates`, US-51 to US-55) · work orders WO-042 to WO-047 |
| **Deciders** | Software Architect, for the Tech Lead (owner of WO-042); the repository is created by Ahmed, the only GitHub owner |

## Context

The project trains young people to maintain the menus and gives them two certificates (Participation and Completion). D-032 asks the tech team for a **certificate register**, a **PDF with a QR code**, an online **verification page** (`wnsolutions.tn/verify/<id>`) and an **"Add to LinkedIn"** button. Facts that matter for where this lives:

- It concerns **participants**, not cafés. It is not switched on per café and has nothing to do with menus or orders.
- The register holds **personal data**, including people aged 16–17 (with parent or guardian consent). Only participants who consented get a public verification page.
- The verification page lives on the **WNS main domain**, not on the DigiMenu host.
- The first certificates are due by **26 Nov 2026**, during the café go-live weeks, when café releases are frozen to patches.
- The requirements already call it a "project tool, WNS admin side; not a café module".

## Decision

1. **Not a module.** There is no `modules/certificates/` slot and no café configuration switch for certificates. The module system ([ADR-0008](0008-module-system.md)) is for features a café switches on for its customers.
2. **Not in this repository.** No certificate code, templates or participant data are merged into `digimenu-tn` or into the café deploy repository. The certificate tool is not part of the café release window and does not wait for a café release approval to ship.
3. **Where the code lives:** a separate repository, **`WNSolutions/wns-certificates`**, with its own simple deployment for `wnsolutions.tn/verify/<id>`. Ahmed creates it (one-time, about 5 minutes) when WO-042 starts; if he picks another name at creation, that name replaces this one and the Tech Lead updates this line.
   - The **code** in it is public under MIT, like this toolkit, with fictional sample data only.
   - The **register** (participants' names, consent) is **never** in that public repository: it is kept private (a private file or private repository owned by Ahmed), and only consenting participants get a verification page.
4. **Until that repository exists**, the certificate work (WO-042 to WO-047) may be **tracked** as issues in this repository's tracker with the label `area: certificates`, but its code waits for `wns-certificates`.
5. **Reuse, not coupling.** The certificate tool may copy or depend on this toolkit's QR generator ([`tools/qr/`](../../tools/qr/README.md)), which is MIT-licensed.

A design hint for WO-043 (not a decision): with about 40 certificates, verification pages can be **static pages generated from the private register** (only for consenting participants, `noindex`, no list page), which costs nothing and needs no database.

## Consequences

- **Positive:** café releases and certificate deadlines cannot block each other; minors' data stays apart from café and customer data; DigiMenu's deploy credentials never need to touch the WNS main domain (NFR-12); the café toolkit stays focused for replicators.
- **Negative / costs:** one more repository and deployment to set up and document; the QR code logic is reused by copy or as a dependency.
- **Follow-ups:** Ahmed creates `WNSolutions/wns-certificates` (public, MIT) when WO-042 starts; WO-043 to WO-047 design and build there; the certificate issues link to it once it exists.

## Alternatives considered

| Option | Why not |
|---|---|
| A café module `modules/certificates/` | Wrong abstraction: not per café, not for customers, not pinned to café releases. |
| `tools/certificates/` here, with the verification route in the DigiMenu Worker | Couples a WNS-wide page and its personal data to café deploys and the café approval gate; DigiMenu credentials would need routes on the main domain. |
| A hosted certificate service | Monthly fees or limits on free plans; personal data on another platform. |

## References

- [Module system](../architecture/modules.md) · [ADR-0003](0003-public-toolkit-and-private-deploy-repo.md) (what is public and private)
