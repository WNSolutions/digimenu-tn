# ADR-0011: Base DigiMenu's design on Apple's Human Interface Guidelines, applied as is for an iPhone-first audience

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-22 |
| **Source decisions** | D-039 (Ahmed's order, 22 Oct 2026: "I want to use Apple guidelines and have my DigiMenu design based on that and inspired from it"), D-040 (22 Oct 2026: 80–90 % of customers use iPhone; apply the apple-design skill as is, iOS conventions included) · WO-049 · NFR-01, NFR-02, NFR-06, NFR-07, NFR-21 |
| **Deciders** | Ahmed (project lead), on the UI/UX Designer's proposal |

## Context

DigiMenu had no design language yet: the first customer screens are due in Sprint 1. Ahmed asked for a design based on Apple's Human Interface Guidelines (HIG) and later confirmed that **80–90 % of customers open the menu in Safari on an iPhone**. The other 10–20 % use Android phones, often entry-level ones on 3G, and staff may use an Android or Apple tablet at the counter.

The design must also respect what is already decided: no UI framework, hand-written CSS with logical properties and custom-property tokens, system fonts and inline SVG icons ([ADR-0002](0002-cloudflare-worker-d1-plain-javascript.md)); at most 200 KB and 15 requests on a first visit (NFR-01); WCAG 2.1 AA, 44 px targets and 16 px body text (NFR-07); French, Arabic right-to-left and English with Western digits and prices to the millime (NFR-21); each café's own name, logo and colour from its configuration. Apple's fonts, SF Symbols, logos and Apple Pay marks are licensed for other uses and cannot be shipped in a web toolkit.

The HIG is available to the team through the **apple-design skill**, a third-party review tool that contains Apple's guideline pages and a review method.

## Decision

1. **We follow the HIG as is, iOS conventions included,** for customer pages, the staff screen and the admin app: large titles, sheets with grabber and detents, one prominent action per view, switches in list rows, segmented controls, action sheets for destructive choices, a tab bar in the admin app, safe areas, light and dark from the system with no in-app switch. Android and the counter tablet get **the same design**; each component documents what an Android user sees ([components](../design/components.md)). The reference is the skill at a pinned revision; we cite `file.md › Heading` and never run its scripts.
2. **We use no Apple assets.** The **system font stack** shows San Francisco on Apple devices and Roboto or Noto elsewhere. Icons come from **Lucide** (ISC; the icons it took from Feather are MIT), vendored as an inline SVG sprite with both licence notices, with stroke weights matched to adjacent text. No SF Symbols look-alikes, no Apple logos or Apple Pay marks.
3. **Design tokens live in [`core/ui/tokens.css`](../../core/ui/tokens.css)**, under 4 KB: semantic colour roles for light and dark, an increased-contrast set, a type scale in `rem` that follows iPhone Text Size (Dynamic Type) through `font: -apple-system-body`, spacing, radii, touch targets, safe areas, motion with a reduced-motion answer, and the floating-bar material. Components use tokens and logical properties only. Every text colour pair meets 4.5:1, computed ([foundations §2.2](../design/foundations.md#22-computed-contrast)).
4. **Each café's colour is derived, not trusted.** The config validator turns `branding.primaryColor` into six values (fill, label and text colour for light and dark) that meet 3:1 for the fill and 4.5:1 for text, and **rejects** a colour that must be darkened by more than 25 % to work on a white page ([foundations §2.3](../design/foundations.md#23-the-cafés-accent-colour)). The accent appears only on the one prominent action, `+` glyphs and links.
5. **Glass (Liquid Glass) only on two floating bars**, the customer top bar and the admin tab bar on phones: 80 % fill, 20 px blur. It falls back to a solid bar without `backdrop-filter`, on phones with 2 GB of memory or less or Save-Data, and with reduced transparency or increased contrast. Never on content. Safari does not expose Reduce Transparency, so text contrast is computed without relying on the blur.
6. **One signature, the ticket.** DigiMenu's own voice is limited to the order shown as a ticket, shared by the customer, the waiter and the staff screen. Everything else defers to the café's content.
7. **Every UI pull request gets a design review** with the skill's five lenses and severity levels ([design review](../design/review.md)); a Critical finding blocks the merge.

## Consequences

- **Positive:** customers on iPhone get an interface that behaves as they expect, with their text size, appearance and accessibility settings respected. One documented rule set for trained youth to follow and review against. The design layer adds **no request**: tokens are 3,996 B (1,347 B gzip), the 20 customer icons 1,086 B gzip, fonts 0 B. Café brands stay recognisable without risking unreadable buttons.
- **Negative / costs:** iOS components (draggable sheets, pop-up menus, switches) must be written in plain JavaScript and must fit the 20 KB core budget. Some iOS details read slightly foreign on Android; we accept that for 10–20 % of customers and keep Android's Back button working everywhere. Safari's hidden Reduce Transparency setting is a known gap. Apple updates the HIG several times a year, so the pinned revision must be refreshed deliberately.
- **Follow-ups:**
  - Validator: implement the accent rule with tests ([`tools/validate/`](../../tools/validate/README.md)).
  - `core/ui/`: vendor the Lucide sprites with licence notices; write base and component CSS within about 10 KB.
  - CI: a style lint that refuses raw colours and physical properties in component CSS (Stylelint is planned in [CI](../operations/ci.md)).
  - Test the glass threshold on a 2 GB and a 4 GB Android phone before go-live.
  - Native Arabic review of the interface wording before Sprint 2.
  - Pull request template: add the screenshot set from the design review (Tech Lead).

## Alternatives considered

| Option | Why not |
|---|---|
| Material Design (Android's design language) | Most customers are on iPhone (D-040); Material would feel foreign to them. |
| One neutral web pattern that follows neither platform | Was the plan when Android was assumed to be the majority; superseded by D-040. |
| Liquid Glass on every bar and sheet | Costly on Android GPUs, harder to read over text-heavy sheets, and Apple asks to use it sparingly. |
| Phosphor icons (MIT) | Measured 2.4 times heavier for the same 20 icons (2,557 B vs 1,086 B gzip), and a second weight doubles it. |
| SF Symbols and Apple's fonts | Licensed for other uses; not allowed in a web toolkit. The system font already shows San Francisco on iPhones. |
| A UI component library | Ruled out by [ADR-0002](0002-cloudflare-worker-d1-plain-javascript.md) (weight, churn, build chain). |
| Loading each café's brand font | Adds weight and requests on 3G for little benefit; the café's identity is its name, logo and colour. |

## References

- [Design pages](../design/README.md): [principles](../design/principles.md) · [foundations](../design/foundations.md) · [components](../design/components.md) · [screens](../design/screens.md) · [design review](../design/review.md)
- [ADR-0002](0002-cloudflare-worker-d1-plain-javascript.md) (plain JavaScript, no UI framework) · [ADR-0007](0007-order-notifications-staff-screen-and-whatsapp.md) (staff alerts) · [ADR-0010](0010-customer-data-consent-and-deletion.md) (consent at checkout)
- Café configuration: [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json) (`branding.primaryColor`)
