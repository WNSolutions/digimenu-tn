# core/ui/

The **design layer** shared by the customer pages, the staff screen and the admin app: design tokens now, shared styles and the icon sprite later. The rules behind every value are in [`docs/design/`](../../docs/design/README.md) and [ADR-0011](../../docs/adr/0011-design-language-hig-inspired.md).

**Status:** [`tokens.css`](tokens.css) ready (WO-049, Proposed). Base styles, component styles and the Lucide icon sprite come with the first customer screens (Sprint 1).

## What lives here

- [`tokens.css`](tokens.css): colours for light and dark, increased contrast, the café accent hook, the floating-bar material (glass or solid), type sizes in `rem`, line heights for Latin and Arabic, spacing, radii, touch targets, safe areas, elevation and motion. 3,996 bytes, 1,347 bytes gzip.
- Planned: base styles, the shared component styles ([components](../../docs/design/components.md)), and the icon sprites (Lucide, with its ISC and MIT notices).

## Rules

- **Tokens only.** Component and module CSS uses `var(--dm-…)`; no hex colours, pixel font sizes, shadows or durations written by hand. Module classes start with `m-<key>-` ([module system](../../docs/architecture/modules.md#isolation-rules)).
- **Logical properties only:** `margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start`. Right-to-left then works by itself ([foundations §9](../../docs/design/foundations.md#9-right-to-left)).
- **The café's colour is set, never typed.** The core script copies six values from the validated café configuration onto `<html>` with `document.documentElement.style.setProperty()`: `--dm-cafe-accent`, `--dm-cafe-on-accent`, `--dm-cafe-accent-text` and their `-dark` versions ([foundations §2.3](../../docs/design/foundations.md#23-the-cafés-accent-colour)). Without them the accent is monochrome.
- **Glass is a switch, not a style.** The customer page sets `data-dm-glass` on `<html>` unless the phone has 2 GB of memory or less or Save-Data is on. Floating bars use `background: var(--dm-bar-bg)` and both `-webkit-backdrop-filter` and `backdrop-filter: var(--dm-bar-filter)`. Never on content ([foundations §3.2](../../docs/design/foundations.md#32-glass-on-the-floating-bars)).
- **Type follows the reader.** Font sizes in `rem` through the tokens; text fields at least 16 px; never block zoom.
- **No Apple assets.** No SF fonts as files, no SF Symbols or look-alikes, no Apple logos or Apple Pay marks.
- **Budget:** `tokens.css` stays under 4 KB; all core CSS about 10 KB; the customer icon sprite under 1.5 KB gzip ([foundations §12](../../docs/design/foundations.md#12-design-budget)).
- After editing a CSS file, run `npx prettier --write <file>` and `npm run check`.

## Must not live here

- Café-specific colours, logos or fonts (they come from café configuration and media).
- Module styles (they live in the module's folder and use these tokens).
- Images used for decoration.

## Related

[Design pages](../../docs/design/README.md) · [design review](../../docs/design/review.md) · [`core/`](../README.md)
