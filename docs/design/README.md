# Design

How DigiMenu looks, reads and behaves on customers' phones, on the staff screen and in the admin app.

> **Status:** Proposed (WO-049), decision record [ADR-0011](../adr/0011-design-language-hig-inspired.md). **Owner:** UI/UX Designer. Changes go through a pull request with a [design review](review.md).

## Design thesis

DigiMenu is **the café's own menu, made to feel native on the customer's iPhone.** Most customers (80–90 %) open it in Safari on an iPhone, so we follow Apple's Human Interface Guidelines as they are, iOS conventions included: a large title, sheets with a grabber, one prominent action at the bottom, the system font, Dynamic Type, light and dark from the system. Android phones and the counter tablet get the same design and work just as well. **The café is the content:** its name, its colour on the main action, its dishes and prices to the millime, in French, Arabic or English. DigiMenu stays quiet everywhere except one place, **the ticket**, where the order becomes the object that the customer, the waiter and the counter share.

## Signature: the ticket

The one element DigiMenu is remembered by. When an order is received, or the list is shown to the waiter, the list turns into a ticket: a paper-like card with a tear line, two notches and one number set large (the table, or the order number `A12`). The staff screen shows the same ticket in a compact form. It comes from the café itself (the waiter's order pad, the table card's number), it carries real information that must be read at arm's length, and it uses no colour of its own, so every café's brand still works with it. Everything around it stays plain. Details: [components §1.3](components.md#13-the-ticket-signature).

## Pages

| Page | What it covers |
|---|---|
| [Principles](principles.md) | Apple's eight principles turned into concrete DigiMenu rules, and where we depart from Apple |
| [Foundations](foundations.md) | Platform stance, colour (with computed contrast), the café accent rule, glass, type, layout, spacing, motion, icons, right-to-left, writing, budget |
| [Components](components.md) | Specs for every customer, staff and owner component: anatomy, sizes, states, RTL, accessibility, Android |
| [Screens](screens.md) | Wireframes at 360 px (menu in French and Arabic, item sheet, list and checkout, editor) and the staff screen on a tablet |
| [Design review](review.md) | How every UI pull request is reviewed, with a short checklist for youth reviewers |
| [`core/ui/tokens.css`](../../core/ui/tokens.css) | The tokens as CSS custom properties; rules in [`core/ui/README.md`](../../core/ui/README.md) |

## The reference we use

Our reference is the **apple-design skill** ([github.com/dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill), revision `914b6a3`, 15 Oct 2026): a third-party design-review tool that contains Apple's Human Interface Guidelines as Markdown pages pulled from developer.apple.com, plus a review method. It is **not part of this repository** and we never run its scripts. The guideline text belongs to Apple; we quote it in short phrases only.

Citations in these pages look like `sheets.md › Best practices`: the page in the skill's `references/hig/` folder and the heading in it. Our own decisions are marked **judgment**.

## What we never use

- Apple's fonts as files (SF Pro, SF Arabic, New York): iPhones already show San Francisco through the system font.
- SF Symbols, or icons drawn to imitate them: we use the open-licence **Lucide** set ([foundations §8](foundations.md#8-icons)).
- Apple logos, Apple Pay buttons or marks, or Apple trademarks as part of DigiMenu's name or look.
- Real café names, logos, photos or menus in these pages: examples use the fictional demo café, Café Démo Jasmin.
