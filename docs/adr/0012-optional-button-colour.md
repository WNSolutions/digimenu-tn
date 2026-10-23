# ADR-0012: Buttons use the café's colour darkened automatically, or an optional separate button colour

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-10-22 |
| **Source decisions** | D-049 (supersedes D-047) · extends [ADR-0011](0011-design-language-hig-inspired.md) · C-06 |
| **Deciders** | Ahmed (project lead), on the UI/UX Designer's question |

## Context

Each café has one brand colour, `branding.primaryColor`. The design ([foundations §2.3](../design/foundations.md#23-the-cafés-accent-colour)) uses it for the one prominent button per screen, for links and for `+` glyphs. To keep text readable, the config validator darkens the colour until the button reaches 3:1 against the page and its label 4.5:1. If that takes more than 25 % darkening, the validator refuses the colour.

Some cafés have light brand colours, such as a yellow. Darkened enough to pass, a yellow turns into a brownish mustard that the café may not recognise as its own. On 22 Oct 2026 Ahmed chose to keep both ways open, for flexibility later.

## Decision

We will support two ways to colour buttons, and the café chooses:

1. **Automatic (default).** No new field: fills come from `primaryColor`, darkened as today. Nothing changes for cafés that do not set anything.
2. **Separate button colour (optional).** A café may set `branding.buttonColor`, a 6-digit hex colour. Then the fill tokens (`--dm-cafe-accent`, `--dm-cafe-on-accent` and their `-dark` variants) come from `buttonColor`. Links and `+` glyphs (`--dm-cafe-accent-text`) still come from `primaryColor`.

`buttonColor` goes through the **same checks** as `primaryColor`: the same darkening steps, the same 3:1 and 4.5:1 thresholds, the same error above 25 % darkening. Neither field can lower the contrast rules.

## Consequences

- **Positive:** a café with a light brand colour keeps that colour in its logo and links and gets buttons in a shade it picks, not one the validator invents. Existing configurations stay valid.
- **Negative / costs:** one more optional field to explain in the owner guide and in the youth workshop; the validator tests double for the fill tokens.
- **Follow-ups:**
  - Config validator: check `buttonColor` like `primaryColor` and derive the fill tokens from it when present (tracked with the validator work, S1).
  - Menu editor café info (S2): show "Couleur des boutons (facultatif)" under the brand colour, with a live preview of the button.
  - Owner guide and workshop material: one paragraph and one example.

## Alternatives considered

| Option | Why not |
|---|---|
| Automatic darkening only (D-047, now superseded) | A light brand colour could become a shade the café does not recognise; no way to fix it without changing the brand colour itself. |
| Separate button colour required for every café | Extra work for the many cafés whose colour already works; the automatic path covers them. |
| Let the café turn the contrast checks off | Unreadable buttons for customers; against NFR-06 and ADR-0011. |

## References

- [Design foundations §2.3, the café's accent colour](../design/foundations.md#23-the-cafés-accent-colour)
- [`cafe-config.schema.json`](../../core/schemas/cafe-config.schema.json): `branding.primaryColor`, `branding.buttonColor`
- [ADR-0011](0011-design-language-hig-inspired.md)
