# ADR-0014: A café's menu can wear the café's own theme

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-25 |
| **Source decisions** | D-070 (extends D-068) · amends [ADR-0011](0011-design-language-hig-inspired.md) (no web fonts, neutral page) · extends [ADR-0012](0012-optional-button-colour.md) |
| **Deciders** | Ahmed (project lead) |

## Context

Until now a café's menu was a neutral page in the phone's light or dark mode, with the café's colour on the cover and the main actions and its logo in a circle (D-068). On 25 Nov 2026, looking at Jobi's menu (the first café to onboard, D-069), Ahmed found it "very boring" with "no branding" and asked for the café's own branding, taken from its Instagram.

Jobi's identity is consistent across its printed menu, Instagram and website: a dark burgundy page, cream text, olive-green double rules, a condensed italic display face for section titles, a white line logo, warm photos of its terracotta and cactus interior. A neutral page in the café's accent colour cannot carry that.

## Decision

A café may set **`branding.theme`** in its configuration. When it is present and passes the checks, the menu takes it in light and dark mode alike, as the café's printed menu does:

| Field | What it does |
|---|---|
| `background` (required) | Page colour. Decides whether the page is dark or light |
| `surface` | Cards and sheets; absent, a shade of the page colour |
| `text` | Main text; absent, white on a dark page, near-black on a light one |
| `line` | Two thin rules under the header and after each section title (decoration only, never text) |
| `font` | A display font for titles, section names, category chips and prices, from a **curated list** (today: Mohave, SIL OFL, Latin only; Arabic stays in the system font) |
| `cover` | A photo on the cover, darkened at the top for the bar and fading into the page |
| `logo` | `plate` (the logo in a circle, as before) or `bare` (a transparent logo drawn large on the photo, standing for the café's name, which stays in the page for screen readers) |

Rules:

1. **Every colour is derived and checked** (`core/ui/accent.js`, `themeTokens`): main and secondary text at least 4.5:1 on the page and on cards (7:1 recommended), control borders 3:1, buttons 3:1 with a 4.5:1 label, links and `+` glyphs 4.5:1, status colours readable. A theme that fails is **not sent**: the menu falls back to the neutral page, and the validator shows the error.
2. **Buttons** keep their source: `buttonColor` or `primaryColor`, moved toward the light or the dark until they stand out on the page colour, and refused beyond 25 %.
3. **Fonts** are not uploaded by cafés: only fonts in the toolkit's curated list, shipped by the release at `/fonts/` and declared in the menu CSS. A menu downloads a font only if its theme uses it (about 15 KB per style, two styles).
4. **The structure does not change**: same components, sizes, touch targets, order and accessibility; only colours, the title face and the cover change. DigiMenu still appears only in the footer line.
5. Café data, logos and photos stay in the private deploy repository (D-022); covers follow the media rules (written OK, no recognisable people without consent, at most 120 KB).

A café may also choose **short prices** (`menu.prices: "short"`): `16 DT`, `5,5 DT`, as many printed menus write them. Amounts are unchanged.

## Consequences

- **Positive:** each café's menu looks like the café (its colours, its face, its photo), which is what owners recognise and what Ahmed asked for; the checks keep every theme readable; cafés without a theme are unchanged.
- **Negative / costs:**
  - The page-weight rule of ADR-0011 ("no web fonts") now has an exception: up to about 30 KB of fonts for a themed menu, cached for 30 days.
  - Screenshots and tests must cover a dark theme as well as the neutral page.
  - The curated font list needs care: each font is checked for licence (OFL), legibility at small sizes and weight before it is added.
- **Follow-ups:** the menu editor (#20) lets Admin set and preview a theme; more fonts are added when a café needs one; a café's cover moves to the media host when it exists.
