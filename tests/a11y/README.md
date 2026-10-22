# tests/a11y/

**Accessibility tests** with axe-core inside Playwright, in left-to-right (French, English) and right-to-left (Arabic) layouts.

**Status:** Planned — with the first customer pages (Sprint 1), extended to the staff screen in Sprint 2.

## Pages checked

Menu, item detail, list, checkout, show-to-waiter, order status, and the staff screen.

## Target: WCAG 2.1 AA (NFR-07)

- Text contrast at least 4.5:1, including the café's brand colour.
- Tap targets at least 44 × 44 px; body text at least 16 px; zoom never blocked.
- Icon buttons have text labels for screen readers; state is never shown by colour only (e.g. "Sold out" is written, not just greyed).
- Every page declares its language and direction (`lang`, `dir`).

## Rules

- A violation blocks the release. A rule may be disabled only for a documented false positive, with a comment.
- Automated checks do not replace a quick manual check on a real phone with Arabic before each release.

## Must not live here

- Tests against real cafés.

## Related

[`tests/`](../README.md) · [`core/`](../../core/README.md)
