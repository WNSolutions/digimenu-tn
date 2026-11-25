# platform/brand/

**The DigiMenu brand layer**, for DigiMenu's own screens only: the home page (`/`), the staff sign-in and first-time screens, and the staff app's frame (D-068, 25 Nov 2026). A café's menu never loads it: there the café's own colour and logo lead, and DigiMenu appears only in the footer line "DigiMenu by Why Not Solutions".

| File | What it holds |
|---|---|
| [`brand.css`](brand.css) | Fonts (`@font-face`), colours, and the brand screen pieces: the emerald screen with its champagne frame, the logo, tagline, small capitals, the ivory card for forms |

## Where the parts come from

| Part | Source | Licence |
|---|---|---|
| Colours, frame, type rules | Brand kit v1.2 (D-052, D-059, D-060), design system "WNS & DigiMenu" | Why Not Solutions |
| Jost (Latin) and Cairo (Arabic), weights 300, 400 and 500 | `@fontsource/jost`, `@fontsource/cairo`, copied by the release build to `/brand/fonts/` with their licence files | SIL Open Font License 1.1 |
| Logo files (`digimenu-logo-reversed.svg`, `digimenu-mark-reversed.svg`, favicons) | The private deploy repository's `brand/` folder, copied by `tools/release/build.js --brand` | Why Not Solutions trademarks, **not** covered by this repository's MIT licence |

Without the logo files (a fork, or `npm run dev` without `--brand`), the screens show the name "DigiMenu" in plain text.

## Rules (from the brand guide)

- Emerald `#004532` about 60 %, ivory `#FBF7EE` about 30 %, champagne `#C9A45C` 10 % or less.
- Champagne is never text on ivory; below 14 px it is weight 500 or heavier, on emerald only.
- No lighter tint of the green, no gradients, shadows or glass; square corners.
- The thin champagne frame sits inside green surfaces of about 200 px or more (inset 4 % of the shorter side, at least 8 px; 1 px line; 2–3 px corners); light cards use `#E6E0D2`.
- The logo lettering is drawn in the files: never retype it.

## Related

[`platform/admin/`](../admin/README.md) · [`platform/shell/public/boot.js`](../shell/public/boot.js) (home page) · [`tools/release/`](../../tools/release/README.md)
