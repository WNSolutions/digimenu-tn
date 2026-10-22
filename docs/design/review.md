# Design review

> **Status:** Proposed with [ADR-0011](../adr/0011-design-language-hig-inspired.md) (WO-049). **Owner:** UI/UX Designer.

Every pull request that changes what people **see or hear** gets a short design review, run with the apple-design skill's method: its five lenses, its severity levels and its report format, adapted to our stack and our users. It sits next to the [definition of done](../product/definition-of-done.md), which still applies in full.

## When a design review is needed

| Needed | Not needed |
|---|---|
| Pull requests with `area: menu`, `area: ordering`, `area: staff-screen`, `area: admin`, `area: i18n` or `area: privacy` that change a screen, a text, a sound or a motion | Server-only, database-only or CI-only changes |
| Any change in [`core/ui/`](../../core/ui/README.md) (tokens, icons, shared styles) | Documentation that does not describe the interface |
| A module that adds anything to a customer, staff or admin screen | Test-only changes |

## Who does what

| Person | Does |
|---|---|
| **Author** | Runs the [checklist for youth reviewers](#checklist-for-youth-reviewers) on their own work and adds the screenshots below to the pull request |
| **Design reviewer** (UI/UX Designer; a trained youth may run the checklist part) | Writes the report in the format below, as a pull request review |
| **Approver** (Ahmed or the Tech Lead, as in the definition of done) | Does not merge while a Critical finding is open |

## Screenshots to attach

The pull request template asks for before/after screenshots in French or English and in Arabic. For UI changes we ask for this set:

| # | Device and browser | Language | Appearance and setting |
|---|---|---|---|
| 1 | iPhone, Safari | FR or EN | Light |
| 2 | iPhone, Safari | AR (right-to-left) | Dark |
| 3 | Android, Chrome, 360 px wide | Any | Light |
| 4 | iPhone, Safari | Any | Largest Text Size (Settings › Accessibility › Display & Text Size › Larger Text) |
| 5 | Staff or admin change only: tablet in landscape, or a browser window ≥ 1024 px | Any | Light |

No iPhone at hand? Take shots 1, 2 and 4 with Playwright's **WebKit** engine (Safari's engine) at an iPhone viewport, the same tool as [`tests/e2e/`](../../tests/e2e/README.md), and say so in the pull request. Chrome's device mode is **not** Safari. Screenshots show only the demo café and made-up data.

## How to run the review

The skill lives outside this repository (see [README](README.md#the-reference-we-use)). Read its `SKILL.md` and the reference pages you need; **do not run its scripts**.

### Step 1: establish the context

Write four lines at the top of the report:

- **Platform:** customer pages are iPhone Safari first, then Android Chrome; staff and admin screens also on a counter tablet ([foundations §1](foundations.md#1-platform-iphone-first)).
- **The screen's job** in one sentence, from [screens](screens.md); if the change has no screen there, write the sentence.
- **What changed**, and what you could and could not check (for example: "no Android phone; checked in Chrome at 360 px").
- **The thesis check:** does the change keep the café as the content and the ticket as DigiMenu's only bold element ([README](README.md#signature-the-ticket))?

### Step 2: open the references

Always: `accessibility.md`, `layout.md`, `typography.md`, `color.md`, `designing-for-ios.md`, `references/cross-platform.md`. Then the pages for what is on screen, about 8 to 12 files in total:

| The change touches | Also open |
|---|---|
| Sheets, the list, checkout, show-to-waiter | `sheets.md`, `modality.md`, `action-sheets.md` |
| Buttons, the list capsule, staff actions | `buttons.md`, `toolbars.md` |
| Item rows, list lines, the editor | `lists-and-tables.md`, `entering-data.md`, `text-fields.md`, `toggles.md` |
| Top bar, category bar, admin tab bar, glass | `toolbars.md`, `tab-bars.md`, `scroll-views.md`, `liquid-glass.md`, `materials.md` |
| Dark appearance | `dark-mode.md` |
| Icons | `icons.md`, `right-to-left.md` |
| Loading, errors, empty states, staff alerts | `loading.md`, `feedback.md`, `progress-indicators.md`, `alerts.md`, `writing.md` |
| Motion | `motion.md` |
| Branding, the café's colour | `branding.md`, `design-principles.md` |

Read before you cite: quote a short phrase and cite `file.md › Heading`. If no page covers a point, write **judgment**.

### Step 3: look through the five lenses, in this order

**Lens 1 — Accessibility.** A failure is **Critical**.

- Contrast computed from the token values, never guessed: 4.5:1 for all text, 3:1 for borders, focus rings and icons that carry meaning. A new colour gets its figures with the method in [foundations §13](foundations.md#13-how-the-figures-were-computed).
- Text: body ≥ 16 px, nothing under 13 px (14 px in Arabic); sizes in `rem`; the screen survives the largest Text Size and 200 % zoom.
- Targets ≥ 44 × 44 px (staff actions 56 px), with enough space between them.
- VoiceOver and TalkBack: every icon-only control has a name; state changes are announced.
- Nothing by colour alone; reduced motion, reduced transparency and increased contrast each change something; `lang` and `dir` are right.

**Lens 2 — Platform conventions.** Usually **High**.

- iOS behaviour as listed in [foundations §1](foundations.md#1-platform-iphone-first): large title, sheet with grabber, Close on the leading side and swipe down, one prominent action per view, safe areas, switches only in list rows, action sheets for destructive choices.
- Android: the Back button closes the top sheet or menu first; nothing depends on a gesture or on haptics.
- Navigation: no tab bar in customer pages; the admin tab bar keeps the role's tabs and never disables one.
- Glass only on the two floating bars, never on content, with the solid fallback ([foundations §3.2](foundations.md#32-glass-on-the-floating-bars)).

**Lens 3 — Visual design and craft.** **High** or **Medium**.

- Only tokens: no hex colours, pixel font sizes, shadows or durations written directly in component CSS; logical properties only.
- One colour, one meaning ([foundations §2.4](foundations.md#24-one-colour-one-meaning)); the café's accent only on the prominent action, `+` glyphs and links.
- Numbers typeset: `4,500 DT`, tabular digits, prices in `<bdi>`.
- Icons from the sprite, weight matched to the text next to them.
- Craft questions from the skill (`SKILL.md › Lens 3: Visual design and craft`): Does the screen keep DigiMenu's point of view? Does anything look like one of the template looks the skill names? Is the boldness still spent in one place? **Name one thing that could be removed**, or say there is none.

**Lens 4 — Interaction.** Usually **Medium**.

- Something useful shows at once while loading; actions in progress show a spinner in the button.
- Feedback inside the interface, not alerts; no alert for undoable actions; destructive and irreversible actions confirmed by an action sheet with a Cancel.
- Every sheet and step can be left (Close, swipe, Back) without losing work.
- Forms: labels above fields, the right keyboard, validation when a field is left, the reason a button is disabled shown next to it.

**Lens 5 — Content and writing.** Usually **Medium**.

- FR, AR and EN texts exist with the same keys; no text in code.
- Buttons start with a verb, and an action keeps its name through the flow; English in Title Case, French and Arabic in sentence case.
- Errors say what happened and how to fix it; no "Oups", no "we"; empty screens give the next step ([foundations §10](foundations.md#10-writing)).

### Step 4: write the report

Post it as a pull request review. Include only the sections that have content; the Summary is always there.

```text
## Design review: <screen or pull request>

Platforms checked: iPhone Safari (iOS version) · Android Chrome 360 px · tablet (if staff/admin)
Languages: FR, AR (RTL) · Appearances: light, dark · Text Size: default and largest

### Summary
Two or three sentences: the screen's job, whether the change keeps the café as the content
and the ticket as the only bold element. Rating: Excellent / Good / Needs work / Critical issues.

### Critical
- **What:** the problem, with numbers (for example "ink-2 on glass, 4.16:1, needs 4.5:1")
- **Why:** `file.md › Heading`: "short quote" (or: judgment)
- **Fix:** the concrete change (token, component, file and line)

### Improvements
- [High] What / Why / Fix
- [Medium] …

### Craft notes
Point of view, restraint, the one thing that could be removed.

### What works
Specific patterns to keep.

### Platform notes
iPhone, Android, counter tablet.
```

### Severity and what it means for merging

| Severity | Examples | Merge rule |
|---|---|---|
| **Critical** | Contrast or target size below the minimum; content unreadable at a large Text Size; a sheet that cannot be closed; Arabic layout broken; a price shown wrongly | Blocks the merge |
| **High** | Looks foreign on iPhone (for example a custom back gesture), a second prominent button, raw colours instead of tokens, glass on content | Fix before merge, or a linked issue agreed by the Tech Lead |
| **Medium** | A missed standard pattern, inconsistent wording, an alert where inline feedback would do | Fix now or open an issue |
| **Low** | Polish and edge cases | Optional |

The rating follows the skill: **Critical issues** if any Critical finding; **Needs work** with several High findings; **Good** with no Critical and at most a couple of High; **Excellent** when nothing is above Medium and the point of view holds.

## Tools that help

| Need | iPhone | Android | Desktop browser |
|---|---|---|---|
| Large text, increased contrast, reduce transparency, reduce motion | Settings › Accessibility › Display & Text Size, and Motion | Settings › Accessibility (font size, high-contrast text, remove animations) | Chrome DevTools › Rendering: emulate `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`, `prefers-reduced-transparency` |
| Screen reader | VoiceOver | TalkBack | — |
| Inspect the page | Safari Web Inspector (needs a Mac) | Chrome remote debugging | Chrome or Safari DevTools |
| Slow network | — | — | DevTools throttling: "Slow 3G"; our budget test uses the NFR-02 profile |
| Contrast figures | — | — | The method in [foundations §13](foundations.md#13-how-the-figures-were-computed) |

## Checklist for youth reviewers

Short enough to run in ten minutes. Tick each line in the pull request, or write what is wrong.

1. I opened the screen on an **iPhone** (or WebKit) and on an **Android phone at 360 px**.
2. In **Arabic** the layout is mirrored, but prices, phone numbers, order numbers and logos are not.
3. Every price looks like **4,500 DT**, in every language.
4. Everything I can tap is at least **44 × 44 px** (staff action buttons 56 px).
5. There is **one coloured button** on the screen at most.
6. **No colour without words:** sold out says "Épuisé", errors say what to do.
7. In **dark mode** everything is readable.
8. With the **largest Text Size**, nothing is cut off or overlapping.
9. With **Reduce Motion** on, nothing slides; things fade.
10. **VoiceOver or TalkBack** reads a sensible name for every icon button.
11. The CSS uses only **`var(--dm-…)` tokens** and logical properties (`margin-inline-start`, not `margin-left`).
12. Texts are in the **FR, AR and EN files**, and buttons start with a verb.
13. Screenshots show **only the demo café** and made-up data.
