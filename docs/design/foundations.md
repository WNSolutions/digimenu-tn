# Foundations

> **Status:** Proposed with [ADR-0011](../adr/0011-design-language-hig-inspired.md) (WO-049). **Owner:** UI/UX Designer.
> **Tokens in code:** [`core/ui/tokens.css`](../../core/ui/tokens.css). Every number on this page is either a token there or a rule for using one.

Citations such as `color.md › Best practices` point to Apple's Human Interface Guidelines (HIG) as copied in the apple-design skill (see [README](README.md#the-reference-we-use)). "Judgment" marks our own decisions where Apple says nothing.

## Contents

- [1. Platform: iPhone first](#1-platform-iphone-first)
- [2. Colour](#2-colour)
- [3. Materials and elevation](#3-materials-and-elevation)
- [4. Typography](#4-typography)
- [5. Layout and navigation](#5-layout-and-navigation)
- [6. Spacing, shape and touch](#6-spacing-shape-and-touch)
- [7. Motion](#7-motion)
- [8. Icons](#8-icons)
- [9. Right-to-left](#9-right-to-left)
- [10. Writing](#10-writing)
- [11. Accessibility baseline](#11-accessibility-baseline)
- [12. Design budget](#12-design-budget)
- [13. How the figures were computed](#13-how-the-figures-were-computed)

## 1. Platform: iPhone first

80–90 % of customers open DigiMenu in **Safari on iPhone** (D-040). We therefore apply the HIG **as is**, including iOS conventions, and make Android and the counter tablet work well without changing the iPhone design.

| Surface | Designed for | Must also work well on |
|---|---|---|
| Customer menu, list, checkout, ticket | Safari on iPhone, portrait, 375–440 pt wide | Chrome and Samsung Internet on Android 8+, in-app browsers of scanner and social apps, 320–360 px wide (NFR-06) |
| Staff screen | iPhone or iPad at the counter | Android phone or tablet, portrait or landscape |
| Owner and maintainer screens | iPhone | Android phone, laptop browser |

What "as is" means in a web page:

| iOS convention | How DigiMenu does it on the web | What an Android user sees |
|---|---|---|
| Large title that collapses into the navigation bar (`toolbars.md › Phone (iOS)`) | Café name as a 34 px title; an inline title appears in the top bar once it scrolls away | Same |
| Sheets with grabber, medium and large detents, swipe down to dismiss (`sheets.md › Mobile (iOS, iPadOS)`) | One bottom sheet component built on `<dialog>`, draggable, with a Close button | Same sheet (Material bottom sheets look alike); the system **Back** button or gesture closes it |
| Primary action at the bottom, within thumb reach (`designing-for-ios.md › Best practices`) | Floating "My list" capsule; sheet actions pinned above the home indicator | Same |
| Safe areas (`layout.md › Guides and safe areas`) | `viewport-fit=cover` and `--dm-safe-*` tokens | Insets are 0 on most Android phones; nothing changes |
| Dynamic Type (`typography.md › Supporting Dynamic Type`) | Root size follows iOS **Text Size** through `font: -apple-system-body`; all type in `rem` | Root size 17 px; Chrome's text scaling and zoom enlarge it |
| Pop-up menus, switches in rows, segmented controls, action sheets | Small web components with the iOS sizes and behaviour | Same components; they read as standard controls on Android too |
| Tab bar (admin app only) | Bottom on phones, top on tablets (`tab-bars.md › Tablet (iPadOS)`) | Same |
| Liquid Glass on the floating layer | Translucent, blurred top bar ([§3.2](#32-glass-on-the-floating-bars)) | Same where the phone can afford it; a solid bar on low-end phones |
| Haptics | None: Safari has no vibration API, and feedback never depends on it (`playing-haptics.md › Best practices`: "Make haptics optional.") | Staff alerts may also vibrate (ADR-0007); customers get no vibration |
| Swipe back | Every sheet and step is a browser history entry, so the iPhone edge swipe and the Android Back button both close the top layer first | Same |

**Not ours to use:** Apple's font files (SF Pro, SF Arabic, New York), SF Symbols or drawings that imitate them, Apple logos, Apple Pay marks. iPhones still show San Francisco because we ask for the **system font** ([§4.1](#41-font-stack)); `typography.md › Using system fonts` says "don’t embed system fonts in your app or game".

## 2. Colour

### 2.1 Roles and values

Neutral greys so that **each café's colour is the only colour** in the interface. Dark values are not inversions: backgrounds get dimmer and elevated surfaces lighter (`dark-mode.md › Mobile (iOS, iPadOS)`). White text is softened to `#F2F2F2` so it does not glare on a dark page (judgment).

| Role | Token | Light | Dark | Use for |
|---|---|---|---|---|
| Page | `--dm-bg` | `#FFFFFF` | `#121212` | Menu page, content layer |
| Grouped page | `--dm-bg-grouped` | `#F2F2F2` | `#121212` | Behind grouped lists: checkout, editor, staff screen |
| Surface | `--dm-surface` | `#FFFFFF` | `#1F1F1F` | Sheets, cards, solid bars (elevated) |
| Fill | `--dm-fill` | `#EBEBEB` | `#2C2C2C` | `+` buttons, steppers, chips, off switches |
| Separator | `--dm-sep` | `#E0E0E0` | `#333333` | Hairlines between rows (decorative) |
| Control border | `--dm-border` | `#8A8A8A` | `#8A8A8A` | Text fields, off-switch outline (3:1) |
| Ink | `--dm-ink` | `#1A1A1A` | `#F2F2F2` | All primary text, selected category chip |
| Ink 2 | `--dm-ink-2` | `#5C5C5C` | `#ADADAD` | Descriptions, meta, sold-out names |
| Success | `--dm-success` / `--dm-on-success` | `#1D7A36` / `#FFFFFF` | `#5CCF7B` / `#121212` | Sent, accepted, available, switch on |
| Warning | `--dm-warning` (text) | `#8A5000` | `#FFB84D` | Changed price, paused, offline |
| Warning fill | `--dm-warning-fill` / `--dm-on-warning` | `#FFB020` / `#1A1A1A` | `#FFB020` / `#1A1A1A` | New-order banner on the staff screen |
| Danger | `--dm-danger` / `--dm-on-danger` | `#C42B1C` / `#FFFFFF` | `#FF7A6B` / `#121212` | Failed, rejected, late order, destructive, badge |
| Sold out | `--dm-soldout` / `--dm-soldout-fill` | = Ink 2 / = Fill | = Ink 2 / = Fill | "Épuisé" chip (neutral on purpose) |
| Focus | `--dm-focus` | `#1A5FD0` | `#7DB0FF` | Keyboard focus ring only |
| Scrim | `--dm-scrim` | black 30 % | black 50 % | Behind sheets; 60 % with reduced transparency or increased contrast |
| Accent (café) | `--dm-accent`, `--dm-on-accent`, `--dm-accent-text` | from the café | from the café | See [§2.3](#23-the-cafés-accent-colour) |

Success and danger use the same value as text and as a fill, so they need only two tokens each. **Increased contrast** (`prefers-contrast: more`, which iPhone's "Increase Contrast" sets) darkens Ink 2 to `#3D3D3D` (dark `#D0D0D0`), the control border to `#5C5C5C` (dark `#B0B0B0`) and separators to `#8A8A8A`, as `color.md › Best practices` asks for "an increased contrast option".

### 2.2 Computed contrast

WCAG 2.1 AA, which `accessibility.md › Vision` uses as its guide. We require **4.5:1 for all text**, without the 3:1 allowance Apple's table gives to bold or 18 pt text, and 3:1 for non-text parts such as borders and focus rings. All figures computed ([§13](#13-how-the-figures-were-computed)); 0 failures.

| Pair | Needs | Light | Dark |
|---|---|---|---|
| Ink on page / grouped / surface / fill | 4.5 | 17.40 / 15.55 / 17.40 / 14.60 | 16.73 / 16.73 / 14.72 / 12.47 |
| Ink 2 on page / grouped / surface / fill | 4.5 | 6.69 / 5.97 / 6.69 / 5.61 | 8.35 / 8.35 / 7.34 / 6.22 |
| Control border on surface / grouped | 3 | 3.45 / 3.08 | 4.77 / 5.43 |
| Success text on page / grouped / surface | 4.5 | 5.40 / 4.82 / 5.40 | 9.52 / 9.52 / 8.37 |
| On-success on success fill | 4.5 | 5.40 | 9.52 |
| Warning text on page / grouped / surface | 4.5 | 6.51 / 5.81 / 6.51 | 10.90 / 10.90 / 9.59 |
| On-warning on warning fill | 4.5 | 9.52 | 9.52 |
| Danger text on page / grouped / surface | 4.5 | 5.66 / 5.06 / 5.66 | 7.36 / 7.36 / 6.47 |
| On-danger on danger fill | 4.5 | 5.66 | 7.36 |
| Sold-out label on sold-out fill | 4.5 | 5.61 | 6.22 |
| Focus ring on page / grouped / surface | 3 | 5.85 / 5.22 / 5.85 | 8.50 / 8.50 / 7.48 |
| Selected chip: page colour on ink | 4.5 | 17.40 | 16.73 |
| Ink on glass bar, **worst** backdrop (black under light glass = `#CCCCCC`; white under dark glass = `#4C4C4C`) | 4.5 | 10.84 | 7.67 |
| Ink 2 on glass bar, worst backdrop | 4.5 | 4.16 ✗ | 3.83 ✗ |
| Increased contrast: Ink 2 on fill / grouped | 7 | 9.11 / 9.70 | 9.05 / 12.15 |
| Increased contrast: control border on surface | 4.5 | 6.69 | 7.60 |
| Demo café accent `#1F6F5C`: label on fill / accent text on page, surface, fill | 4.5 (fill on page 3) | 6.02 / 6.02, 6.02, 5.05 | 6.02 / 5.28, 4.64, 3.94 (glyphs only on fill) |
| No café accent (monochrome default): label on fill | 4.5 | 17.40 | 16.73 |

The ✗ row is why **Ink 2 is never used on glass**: only Ink text sits on the top bar. Body text pairs reach 7:1 or more, which `dark-mode.md › Dark Mode colors` recommends "especially in small text"; Ink 2 stays between 5.6 and 8.4 because it is never the only carrier of important information.

### 2.3 The café's accent colour

Each café has one colour in its configuration, `branding.primaryColor` (for the demo, `#1F6F5C`). Apple's rule decides where it goes: "Apply your app’s accent color judiciously" and save it for primary actions and status (`branding.md › Best practices`); on glass, "apply color to the background rather than to symbols or text" (`color.md › Liquid Glass color`).

**Where the accent appears:** the one prominent button per view (fill), the `+` glyphs, links. **Never** on: glass bars (the category bar and the admin tab bar stay monochrome), prices, status, errors, large backgrounds.

The validator ([`tools/validate/`](../../tools/validate/README.md)) turns the brand colour into six values per café, stored with the published configuration and applied by the core script with `document.documentElement.style.setProperty()` (allowed by our Content-Security-Policy, unlike inline styles):

| Token set by the café config | Rule |
|---|---|
| `--dm-cafe-accent` (light fill) | The brand colour, darkened in steps of 2.5 % toward black until it has **3:1 against the page** and its label reaches 4.5:1 |
| `--dm-cafe-on-accent` | White or Ink `#1A1A1A`, whichever contrasts more with the fill; **at least 4.5:1** |
| `--dm-cafe-accent-text` | The brand colour, darkened until **4.5:1 on page, grouped page and surface**, and 3:1 on Fill (for `+` glyphs) |
| `-dark` variants of the three | The same rules against the dark surfaces, **lightening** toward white |

Without these values, `tokens.css` falls back to a **monochrome** accent (Ink fill, page-colour label: 17.40:1 light, 16.73:1 dark).

**What the validator rejects or warns about** (thresholds are judgment, tested on the brands below):

| Check | Result |
|---|---|
| Not a 6-digit hex colour | **Error** (already in the [café config schema](../../core/schemas/cafe-config.schema.json)) |
| Light fill had to be darkened by **more than 25 %** to reach 3:1 | **Error**: "This colour is too light for buttons on a white page. Choose a deeper shade, for example `#B98D00`." The café's logo keeps its own colours. |
| Dark fill had to be lightened by 40 % or more | Warning |
| Hue within 20° of the danger red or success green, with OKLCH chroma above 0.1 | Warning: errors and confirmations still carry an icon and words, so nothing relies on colour |
| OKLCH chroma below 0.04 (almost grey) | Warning: the primary action will not stand out from text |

Worked examples (computed):

| Brand | Light fill · label | Light accent text | Dark fill · label | Dark accent text | Validator |
|---|---|---|---|---|---|
| `#1F6F5C` demo green | `#1F6F5C` · white 6.02 | `#1F6F5C` 6.02 | `#1F6F5C` (3.11 on page) · white 6.02 | `#579385` 5.28 | OK |
| `#D62828` red | `#D62828` · white 5.01 | `#D12727` 5.21 | `#D62828` · white 5.01 | `#E05E5E` 5.29 | Warning: close to danger red |
| `#FFC300` yellow | `#B98D00` (−27.5 %) · ink 5.70 | `#866600` 5.37 | `#FFC300` · ink 10.82 | `#FFC300` 11.65 | **Error**: too light |
| `#1D3557` navy | `#1D3557` · white 12.36 | `#1D3557` 12.36 | `#50627D` (+22.5 %) · white 6.21 | `#7D8B9E` 5.40 | OK |
| `#000000` black | `#000000` · white 21.00 | `#000000` 21.00 | `#666666` (+40 %) · white 5.74 | `#868686` 5.15 | Warnings: almost grey; lightened 40 % |
| `#7B2CBF` purple | `#7B2CBF` · white 7.11 | `#7B2CBF` 7.11 | `#853CC4` (+7.5 %) · white 6.10 | `#A671D4` 5.29 | OK |
| `#F4A261` sand | `#C3824E` (−20 %) · ink 5.49 | `#92613A` 5.26 | `#F4A261` · ink 8.44 | `#F4A261` 9.09 | OK |

### 2.4 One colour, one meaning

`color.md › Best practices`: "Avoid using the same color to mean different things." Every coloured state also has an **icon and words** (`accessibility.md › Vision`: "Convey information with more than color alone").

| Colour | Means | Always paired with |
|---|---|---|
| Café accent | "This is the main thing to do here" | A verb label ("Ajouter", "Envoyer la commande") |
| Success green | Done, sent, accepted, available, switch on | `circle-check` or `check` icon, past-tense words |
| Warning amber | Look at this soon: new order waiting, price changed, ordering paused, offline | `bell-ring`, `triangle-alert` or `wifi-off`, a short sentence |
| Danger red | Failed, rejected, late, destructive, unread badge | `triangle-alert` or `clock`, words that say what to do |
| Neutral grey | Sold out (a normal part of café life, not an error) | The word "Épuisé / Sold Out / غير متوفر" |
| Focus blue | Keyboard focus only | A 3 px ring with 2 px offset |

Red can mean good luck or danger depending on culture (`color.md › Inclusive color`); in a Tunisian café red brands are common, which is one more reason danger never relies on red alone.

## 3. Materials and elevation

### 3.1 Two layers

We follow Apple's two-layer model (`materials.md › Liquid Glass`; `liquid-glass.md › The two layers`):

| Layer | Contains | Material |
|---|---|---|
| Content | Café header, category headings, item rows, photos, tickets, order cards | Opaque: `--dm-bg`, `--dm-surface`. **Never glass** ("Don’t use Liquid Glass in the content layer.") |
| Functional | Customer top bar (inline title + category bar), admin tab bar on phones, sheets, menus, the floating list capsule | Glass on the two bars only; sheets and menus are solid surfaces; the capsule is a solid accent fill |

### 3.2 Glass on the floating bars

Glass is used on exactly **two surfaces**: the customer top bar and the admin tab bar on phones (`materials.md › Liquid Glass`: "Use Liquid Glass effects sparingly."). Sheets stay solid because they hold a lot of text and a large blurred area costs the most.

| Property | Value | Source |
|---|---|---|
| Fill | `--dm-glass`: white 80 % (light), `#1F1F1F` 80 % (dark) | `liquid-glass.md › Cross-platform translation`: regular fill "about 60 to 80% opacity" |
| Blur and saturation | `blur(20px) saturate(1.4)` | Same section: regular blur "about 20 to 40 px", saturation "roughly 1.2 to 1.5 times" |
| Text on glass | Ink only; worst case 10.84:1 light, 7.67:1 dark | [§2.2](#22-computed-contrast) |
| Edge | No hairline: the blur is the scroll edge effect; the bar is clear when nothing scrolls under it | `scroll-views.md › Scroll edge effects` |

**When glass is on.** The core script sets `data-dm-glass` on `<html>` unless the phone reports **2 GB of memory or less** (`navigator.deviceMemory`, Chromium only) or **Save-Data**. `tokens.css` then switches `--dm-bar-bg` and `--dm-bar-filter`, but only where the browser supports `backdrop-filter` (with or without the `-webkit-` prefix). Components write both properties:

```css
.dm-topbar {
  background: var(--dm-bar-bg);
  -webkit-backdrop-filter: var(--dm-bar-filter);
  backdrop-filter: var(--dm-bar-filter);
}
```

**Solid fallback** (`--dm-surface`, plus a 1 px `--dm-sep` line at the bar's lower edge once content scrolls under it):

| Situation | Result |
|---|---|
| Browser without `backdrop-filter` | Solid |
| Low-end Android (≤ 2 GB) or Save-Data on | Solid. `liquid-glass.md › React Native`: "On Android, blur is costly and inconsistent across versions". |
| `prefers-reduced-transparency: reduce` (Chrome, Samsung Internet) | Solid |
| `prefers-contrast: more` (iPhone "Increase Contrast", and any other system whose browser reports it) | Solid |
| iPhone with **Reduce Transparency** on | **Known limit.** Safari does not expose this setting (`liquid-glass.md › Tauri and Electron`: "`prefers-reduced-transparency` is Chromium-only"). The fill is 80 % opaque, so text contrast is computed **without** relying on the blur (10.84:1 even over a black photo), and Increase Contrast still gives the solid bar. Re-check when WebKit adds the media query. |

**Cost against the budget.** 0 requests, about 0.2 KB of CSS, no images. The real cost is GPU work while scrolling (`liquid-glass.md › Tauri and Electron`: "`backdrop-filter` over animating content is expensive. Keep glass regions few and small"). Acceptance test before go-live: scroll the demo menu on the reference 2 GB Android with glass forced on and off, and on a 4 GB Android. If the 4 GB phone drops frames, raise the threshold to 4 GB.

### 3.3 Elevation

| Level | What | Light | Dark |
|---|---|---|---|
| 0 | Content | No shadow | No shadow |
| 1 | Floating controls: list capsule, menus | `--dm-elev-1` (0 4 16 px, black 12 %) | Same, black 50 %, on `--dm-surface` |
| 2 | Sheets | `--dm-elev-2` (0 −8 32 px) + scrim | Lighter surface `#1F1F1F` over `#121212` + scrim |

## 4. Typography

### 4.1 Font stack

```text
system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif
```

| Device | What people see |
|---|---|
| iPhone, iPad, Mac | San Francisco (SF Pro, and SF Arabic for Arabic), with Apple's optical sizes and tracking applied by the system |
| Android | Roboto for Latin; the phone's Arabic system font (Noto) for Arabic |
| Windows laptop | Segoe UI (Latin and Arabic) |

One family, no web fonts: 0 KB and 0 requests (`typography.md › Conveying hierarchy`: "Minimize the number of typefaces you use"). Café brand fonts are not loaded: the café's identity is its name, logo and colour.

### 4.2 Text size follows the reader (Dynamic Type)

- On iPhone and iPad, `tokens.css` sets `font: -apple-system-body` on the root, so **1 rem equals the Body size of the reader's Text Size setting**: 17 px by default, 14 px at the smallest, 53 px at the largest accessibility size (`typography.md › Specifications`). The rule is limited to iOS by `-webkit-touch-callout`, because macOS Safari would make it 13 px.
- Elsewhere the root is `106.25 %` (17 px); Chrome's text scaling and page zoom enlarge it.
- Every font size is in `rem`. Titles are capped so that body text, not headings, gains the most room at large sizes (`typography.md › Conveying hierarchy`: "Prioritize important content when responding to text-size changes.").
- Layouts stack at large sizes: the price moves under the item name, button rows become columns (`typography.md › Supporting Dynamic Type`: "Consider adjusting your layout at large font sizes.").
- Text fields use at least 16 px (`max(16px, var(--dm-body))`) so Safari never zooms the page when a field is focused.
- Never block zoom: the viewport tag is `width=device-width, initial-scale=1, viewport-fit=cover`, without `maximum-scale` or `user-scalable=no` (NFR-07).

### 4.3 Type scale

Sizes at the default Text Size. Line heights are unitless tokens with **Latin / Arabic** values: Arabic script has tall letters, descenders and vowel marks, so it gets about 20 % more (judgment; `typography.md › Using system fonts` also warns against tight leading for three or more lines).

| Style | Token | Size | Weight | Line height | Apple's style (Large) | Used for |
|---|---|---|---|---|---|---|
| Display | `--dm-display` | 48 px (max 64) | 700 | tight 1.2 / 1.4 | — (ours) | Number on the ticket |
| Large Title | `--dm-large-title` | 34 px (max 48) | 700 | tight | Large Title 34 | Café name |
| Title 1 | `--dm-title-1` | 28 px (max 40) | 700 | tight | Title 1 28 | Order number on staff cards, table on show-to-waiter |
| Title 2 | `--dm-title-2` | 22 px (max 34) | 700 | tight | Title 2 22 | Category headings |
| Title 3 | `--dm-title-3` | 20 px | 600 | ui 1.3 / 1.5 | Title 3 20 | Sheet titles, show-to-waiter lines (≥ 18 px, US-10) |
| Headline | `--dm-body` + 600 | 17 px | 600 | ui | Headline 17 | Item names, button labels, totals |
| Body | `--dm-body` | 17 px | 400 | text 1.45 / 1.7 | Body 17 | Paragraphs, field text |
| Callout | `--dm-callout` | 16 px | 400 | text | Callout 16 | Descriptions, privacy notice, help under fields |
| Footnote | `--dm-footnote` | 13 px (Arabic 14) | 400 | ui | Footnote 13 | Times, "updated at", attribution line |
| Caption | `--dm-footnote` + 600 | 13 px (Arabic 14) | 600 | ui | Caption 1 12, Caption 2 11 | Chips, badges, tab labels |

Weights are 400, 600 and 700 only (`typography.md › Ensuring legibility`: "In general, avoid light font weights.").

**Why 13 px and not Apple's 11 pt minimum.** `accessibility.md › Vision` gives 17 pt default and 11 pt minimum on iOS. We keep 17 px and raise the floor to 13 px (14 px in Arabic), as judgment, for three reasons: (1) Apple's small styles grow along their own Dynamic Type curves, while ours scale with one `rem`, so a floor (`max(13px, …)`) protects the smallest sizes; (2) Arabic letters look smaller than Latin at the same size; `right-to-left.md › Controls` suggests "about 2 points" more when Arabic sits next to capitalised Latin text; (3) customers read on terraces in sunlight and on entry-level screens (`color.md › Best practices`: "Test your app’s color scheme under a variety of lighting conditions."). Body text stays at 16 px or more, as NFR-07 requires.

**Never:** letter-spacing on text (the system font sets its own tracking, and spacing breaks Arabic joining); `text-transform: uppercase` (Arabic has no capitals and French capitals lose accents).

### 4.4 Numbers, prices and mixed scripts

| Rule | Example | Why |
|---|---|---|
| Western digits in every language, from `Intl.NumberFormat` with `numberingSystem: 'latn'` | `4,500 DT` in FR, AR and EN | NFR-21 |
| Comma before 3 millime digits, always 3 | `4,500 DT`, `12,000 DT`, `0,500 DT` | US-03 |
| Thousands with a narrow no-break space | `1 250,000 DT` | French convention |
| No-break space before `DT` | `4,500 DT` never breaks before `DT` | Craft |
| `font-variant-numeric: tabular-nums` on prices, quantities, order numbers, times | Columns of prices line up | Judgment |
| Every price inside `<bdi>` (direction from its own first letter) | With `DT` the price reads left to right inside Arabic text; with an Arabic unit (`د.ت`) it follows the Arabic order | `right-to-left.md › Numbers and characters`: "Don’t reverse the order of numerals in a specific number." |
| Phone numbers, order numbers (`A12`), table labels (`T2`) in `<bdi dir="ltr">` | `+216 XX XXX XXX` stays in order inside Arabic | NFR-21 |

## 5. Layout and navigation

### 5.1 Size classes, margins and safe areas

| Width | Class | Customer page | Staff screen |
|---|---|---|---|
| < 700 px | Compact (phones portrait, small phones landscape) | One column, 16 px margins | One list of orders, newest waiting first |
| ≥ 700 px | Regular (tablets, large phones landscape) | One column, at most 640 px wide, centred | Three columns: New, In progress, Ready |

`layout.md › Size classes`: "Determine layout based on size classes, not device type or orientation." The 700 px breakpoint is judgment; functions stay the same at every width ("Keep functionality the same as size classes change").

- Margins: `--dm-margin` 16 px (24 px at regular width), plus `--dm-safe-x` in landscape.
- Safe areas: `--dm-safe-top` above the top bar, `--dm-safe-bottom` under every bottom action (`layout.md › Guides and safe areas`: "Respecting the safe area is essential").
- `--dm-safe-x` is the larger of the left and right insets, applied on both sides, so it is correct in both reading directions.
- Primary actions sit in the lower half of the screen: "easier and more comfortable … in the middle or bottom area of the display" (`designing-for-ios.md › Best practices`).

### 5.2 Navigation model

| App | Structure | Why |
|---|---|---|
| Customer | **One view** (the menu) and **sheets** for item details, the list, checkout and order status. No tab bar. | The customer has one place to be. The list and checkout are a scoped task "closely related to their current context" (`sheets.md`), and `tab-bars.md › Best practices` says "Use a tab bar to support navigation, not to provide actions." |
| Admin | **Tab bar**, with the tabs of the signed-in role: Commandes, Carte, Ventes, Plus (at most 5; never hidden or disabled within a role) | `tab-bars.md › Best practices`: "Avoid overflow tabs." and "Don’t disable or hide tab bar buttons". Bottom on phones; at the top on tablets (`tab-bars.md › Tablet (iPadOS)`). |

Back behaviour: opening a sheet or a checkout step pushes a history entry. The iPhone edge swipe, the Android Back button and the browser's back button therefore close the top layer first, never the whole menu. Only one sheet is open at a time (`sheets.md › Best practices`).

## 6. Spacing, shape and touch

| Token | Value | Typical use |
|---|---|---|
| `--dm-space-1` | 4 px | Icon to label |
| `--dm-space-2` | 8 px | Between chips; inside compact rows |
| `--dm-space-3` | 12 px | Row padding (block); gap around bezelled buttons |
| `--dm-space-4` | 16 px | Page margin, card padding |
| `--dm-space-5` | 24 px | Between groups; around unbordered controls |
| `--dm-space-6` | 32 px | Between categories; empty states |
| `--dm-radius-m` | 12 px | Fields, photos, cards inside sheets |
| `--dm-radius-l` | 16 px | Grouped list containers, staff cards |
| `--dm-radius-sheet` | 24 px | Top corners of sheets |
| `--dm-radius-full` | 999 px | Capsule buttons, chips, `+` buttons, switches |

**Concentric corners:** an element inset by *d* inside a container with radius *R* gets radius *R − d* (a group 8 px inside a sheet: 24 − 8 = 16). `toolbars.md › Best practices` asks custom components to keep corners "concentric with the bar’s corners".

**Touch targets:** at least **44 × 44 px** (`--dm-target`, `accessibility.md › Mobility` and NFR-07). A visible control may be smaller (the `+` circle is 36 px) only if its hit area is 44 px. Neighbouring bezelled controls keep about 12 px between their visible edges; unbordered ones about 24 px (`accessibility.md › Mobility`: "Consider spacing between controls as important as size."). Staff actions used in a rush (Accepter, Prête, Servie) are **56 px** high (`--dm-target-staff`, judgment).

## 7. Motion

| Token | Value | Use | With reduced motion |
|---|---|---|---|
| `--dm-dur-1` | 120 ms | Press state, chip selection | 1 ms |
| `--dm-dur-2` | 240 ms | List capsule appears, sheet snaps to a detent, new staff card | 1 ms, then a fade |
| `--dm-dur-3` | 360 ms | Sheet opens or closes; the list turns into the ticket | 1 ms, then a fade |
| `--dm-dur-fade` | 160 ms | Cross-fades | Unchanged |
| `--dm-ease` | `cubic-bezier(0.2, 0, 0, 1)` | Everything except sheets | — |
| `--dm-ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets (close to the iOS sheet feel; judgment) | — |

Rules:

- **One orchestrated moment:** after "Envoyer la commande" succeeds, the list sheet becomes the ticket (360 ms). Nothing else is choreographed.
- **Frequent actions don't move:** tapping `+` gives a press state and updates the count; no item flies to the list (`motion.md › Providing feedback`: "In apps, generally avoid adding motion to UI interactions that occur frequently.").
- Sheets follow the finger while dragged, and any tap during an animation acts at once (`motion.md › Providing feedback`: "Let people cancel motion.").
- Reduced motion replaces movement with fades, as `accessibility.md › Cognitive` lists ("Replacing transitions in x-, y-, and z-axes with fades"). Durations become 1 ms, not 0, so `transitionend` still fires.
- No blinking, no flashing (more than 3 flashes per second is never allowed); the staff alert is loud through size, colour, words and sound, not animation (`accessibility.md › Cognitive`: "Be cautious with fast-moving and blinking animations.").

## 8. Icons

### 8.1 The set: Lucide

**Lucide** (version 1.61.0 measured for this page; pin the exact version when the sprite is vendored), ISC licence; the icons Lucide inherited from Feather are under MIT. Both notices travel with the sprite. We use the drawings unchanged: we never redraw or imitate SF Symbols.

Why Lucide is the closest open set to SF Symbols for our needs:

1. **Same construction.** SF Symbols' outline style is single-weight strokes with round ends; Lucide is drawn the same way (24-unit grid, round caps and joins).
2. **Weight matched to text.** SF Symbols come in weights that match the font, "precise weight matching between symbols and adjacent text" (`typography.md › Using system fonts`). Lucide's stroke width is a live value, so one sprite matches Regular, Semibold and Bold text through CSS (`icons.md › Best practices`: "In general, match the weights of interface icons and adjacent text.").
3. **Bytes.** The 20 customer icons weigh **3,696 B raw, 1,086 B gzip, 980 B brotli** as a `<symbol>` sprite. The same 20 in Phosphor (MIT) weigh 7,508 B raw, 2,557 B gzip, and 4,792 B gzip with a second weight, because Phosphor stores each weight as a separate filled drawing.

Trade-off: Lucide has **no filled variants**, and `tab-bars.md › Best practices` prefers filled tab icons. In the admin tab bar the selected tab is shown by a capsule behind it, a heavier stroke (2.5) and a semibold label instead (accepted, Low; [components §1.4](components.md#14-admin-tab-bar)).

### 8.2 Size and weight

| Next to | Icon size | `stroke-width` |
|---|---|---|
| Regular text (400) | 1.25 em of that text (22 px at 17 px) | 1.75 |
| Semibold text (600), buttons | 1.25 em | 2 |
| Bold text (700), titles | 1.1 em | 2.25 |
| Alone in a bar (44 px target) | 24 px | 2 |

Sizes are in `em`, so icons grow with Text Size (`typography.md › Supporting Dynamic Type`: "Increase the size of meaningful interface icons as font size increases."). Every icon-only button has a text name for screen readers (`icons.md › Best practices`: "Provide alternative text labels for custom interface icons.").

### 8.3 The icons we need

| Icon (Lucide name) | Meaning | Where | In Arabic (RTL) |
|---|---|---|---|
| `plus`, `minus` | Add one, remove one | `+` button, steppers | Same glyphs; stepper order reverses |
| `x` | Close | Sheets, menus | Same |
| `chevron-left` | Back | Checkout step, editor | **Flipped** (points right) |
| `chevron-down` | Opens a menu | Language button, pick-up time | Same |
| `languages` | Language | Top bar | Same |
| `info` | Café info | Top bar | Same |
| `receipt` | My list, the ticket | List capsule, ticket | Same (a real object) |
| `trash-2` | Remove a line, empty the list | List sheet | Same |
| `check` | Selected, done | Menus, variant rows | Same (universal mark) |
| `circle-check` | Sent, accepted, served | Ticket, status | Same |
| `clock` | Hours, waiting time, late | Header, staff cards | Same (clocks work the same everywhere) |
| `map-pin`, `phone` | Address, call the café | Info sheet | Same |
| `message-circle` | WhatsApp hand-off (with the word "WhatsApp"; no WhatsApp logo) | Takeaway checkout | Same |
| `refresh-cw` | Update order status | Status | Same |
| `triangle-alert` | Problem, needs attention | Errors, changed prices | Same |
| `wifi-off` | Offline | Banners | Same |
| `utensils`, `shopping-bag` | Dine-in, takeaway | Order type, staff cards | Same |
| Admin only: `bell-ring`, `circle-pause`, `circle-play`, `ban`, `pencil`, `undo-2`, `volume-2`, `book-open`, `chart-column`, `ellipsis`, `eye`, `eye-off` | New order, pause and resume ordering, sold out, edit, undo, sound check, menu tab, sales tab, more, show and hide password | Staff and owner screens | `undo-2` is **flipped**; the rest stay |

The 12 admin-only icons weigh 2,552 B raw, 877 B gzip; the admin app's sprite holds them plus the customer set. Each sprite is inlined as a string in its app's script (customer: core, admin: admin app), so icons cost **no request** and appear with the first render. Components draw them with `<svg class="dm-icon"><use href="#i-plus"/></svg>` and set `fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round` in CSS.

## 9. Right-to-left

Arabic pages carry `<html lang="ar" dir="rtl">`. Because all CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`), most mirroring is automatic.

| Mirrors | Does not mirror |
|---|---|
| Page layout, alignment, reading order of rows | Digits inside a number, prices, phone numbers, order numbers ("Don’t reverse the order of numerals in a specific number.") |
| Category bar: starts on the right and scrolls to the left (US-02) | Logos, photos, the QR code ("Don’t flip logos or universal signs and marks."; "Avoid flipping images like photographs") |
| Back chevron, `undo-2` ("Flip controls that help people navigate or access items in a fixed order.") | `check`, `plus`, `minus`, `clock`, `receipt`, `phone` (real objects and universal marks) |
| Quantity stepper: minus at the start, plus at the end ("Reverse the order of numerals that show progress or a counting direction") | Latin text inside Arabic (a French dish name stays left-to-right inside its `<bdi>`) |
| Sheet buttons: Close stays on the leading side, which is the right in Arabic | Swipe-to-dismiss direction of sheets (always down) |

All quotes from `right-to-left.md`. Further rules:

- A paragraph is aligned by **its own language**, not by the page ("Align a paragraph based on its language, not on the current context."): a French description shown in the Arabic menu (missing translation) stays left-aligned in its `<p lang="fr" dir="ltr">`.
- One- and two-line labels follow the page direction, and all rows of a list share one alignment ("Use a consistent alignment for all text items in a list.").
- Arabic line heights are larger ([§4.3](#43-type-scale)) and the minimum size is 14 px.

## 10. Writing

`writing.md › Getting started`: "Determine your app’s voice." Ours is **a good waiter**: brief, polite, never technical. French uses *vous*.

| Rule | Example | Source |
|---|---|---|
| Buttons start with a verb | "Ajouter", "Envoyer la commande", "Montrer au serveur" | `writing.md › Best practices`: "Be action oriented." |
| An action keeps its name to the end | "Envoyer la commande" → "Commande envoyée" | `SKILL.md › Lens 5` |
| Capitalisation follows each language's Apple convention: **English Title Case** for buttons and titles; **French and Arabic sentence case** | "Send Order" / "Envoyer la commande" | `writing.md › Best practices`: "Adopt capitalization rules that align with your app’s style, then apply them consistently." |
| No "we", no "Oops" | "Commande non envoyée. Vérifiez la connexion, ou montrez la liste au serveur." | `writing.md › Best practices`: "Avoid using *we* altogether"; "Write clear error messages." |
| Possessives only where they help, then always the same | "Ma liste" everywhere (avoids confusion with "la carte") | `writing.md › Best practices`: "Use possessive pronouns sparingly." |
| Errors next to the field, saying how to fix it | "Entrez les 8 chiffres de votre numéro." | `writing.md › Best practices`: "Show hints in text fields." |
| Empty screens invite the next step | "Votre liste est vide. Touchez + pour ajouter un article." | `writing.md › Best practices`: "Provide clear next steps on any blank screens." |
| Say "touchez", never "cliquez", on phones | "Touchez pour actualiser" | `writing.md › Best practices` |

Core words (Arabic proposals to be checked by a native reviewer before Sprint 2):

| Concept | FR | EN | AR (proposal) |
|---|---|---|---|
| Add | Ajouter | Add | أضف |
| My list | Ma liste | My List | قائمتي |
| Show to the waiter | Montrer au serveur | Show to Waiter | أظهر للنادل |
| Send order | Envoyer la commande | Send Order | أرسل الطلب |
| Sold out (US-04) | Épuisé | Sold Out | غير متوفر |
| Order received — No. A12 | Commande reçue — N° A12 | Order Received — No. A12 | تم استلام الطلب — رقم A12 |
| Ordering paused | Commandes en pause — demandez au serveur | Ordering Paused — Please Ask Your Waiter | الطلبات متوقفة — اطلب من النادل |

## 11. Accessibility baseline

| Need | Our answer |
|---|---|
| Screen readers (VoiceOver, TalkBack) | Real buttons and links; every icon-only control named; live regions announce "Ajouté : Café crème, 2 dans la liste" and order status changes |
| Keyboard (iPad with keyboard, laptop) | Logical tab order; `:focus-visible` ring 3 px `--dm-focus`, 2 px offset; Escape closes sheets and menus |
| Larger text | Dynamic Type on iOS, rem everywhere, stacked layouts, 200 % zoom works (`accessibility.md › Vision`: "Support larger text sizes.") |
| Contrast | [§2.2](#22-computed-contrast); increased-contrast values |
| Colour vision | Never colour alone ([§2.4](#24-one-colour-one-meaning)) |
| Reduced motion, reduced transparency, increased contrast | Fades, solid bars, stronger lines ([§3.2](#32-glass-on-the-floating-bars), [§7](#7-motion)) |
| Gestures | Every swipe has a button: Close on sheets, a remove button on list lines (`accessibility.md › Mobility`: "Offer alternatives to gestures.") |
| Time limits | Nothing disappears on a timer; undo stays until the sheet closes (`accessibility.md › Cognitive`: "Minimize use of time-boxed interface elements.") |
| Language and direction | `lang` and `dir` on `<html>` and on every text in another language |

## 12. Design budget

Within NFR-01 (≤ 200 KB and ≤ 15 requests on a first visit) and ADR-0002 (CSS about 10 KB, core script ≤ 20 KB gzip):

| Item | Budget | Today |
|---|---|---|
| `tokens.css` | ≤ 4 KB raw | 3,996 B raw, 1,347 B gzip |
| All core CSS, tokens included | ≈ 10 KB raw | To measure when components are written |
| Customer icon sprite (20 icons, inside the core script) | ≤ 1.5 KB gzip | 1,086 B gzip |
| Fonts | 0 B, 0 requests | System fonts |
| Glass | 0 requests | ≈ 0.2 KB CSS |
| Decorative images | None | The ticket's notches and tear line are CSS |
| Requests added by the design layer | 0 | Tokens and components ship in the core CSS file; icons in the core script |

## 13. How the figures were computed

Contrast uses the WCAG 2.1 relative-luminance formula. Accent derivation mixes in sRGB in steps of 2.5 %. Hue and chroma checks use OKLCH. The core of the script, runnable with Node 22:

```js
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
const over = (fg, alpha, backdrop) => mix(backdrop, fg, alpha); // glass composited on a backdrop

// Light fill for a café: darken until 3:1 on the page and a 4.5:1 label exists.
function lightFill(brand, page = '#ffffff', ink = '#1a1a1a') {
  let t = 0, fill = brand;
  const label = (f) => Math.max(contrast('#ffffff', f), contrast(ink, f));
  while (t < 1 && (contrast(fill, page) < 3 || label(fill) < 4.5)) fill = mix(brand, '#000000', (t += 0.025));
  return { fill, darkenedPercent: Math.round(t * 1000) / 10 };
}

console.log(contrast('#5c5c5c', '#f2f2f2').toFixed(2));               // 5.97
console.log(contrast('#1a1a1a', over('#ffffff', 0.8, '#000000')).toFixed(2)); // 10.84
console.log(lightFill('#ffc300'));                                      // { fill: '#b98d00', darkenedPercent: 27.5 }
```

The full script (every table on this page) will move into the config validator with its tests when the validator is built ([`tools/validate/`](../../tools/validate/README.md)).
