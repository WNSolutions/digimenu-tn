# Components

> **Status:** Proposed with [ADR-0011](../adr/0011-design-language-hig-inspired.md) (WO-049). **Owner:** UI/UX Designer.
> Tokens: [`core/ui/tokens.css`](../../core/ui/tokens.css) · numbers and rules: [foundations](foundations.md) · layouts: [screens](screens.md).

Each component lists its **job**, **anatomy**, **sizes**, **states**, **right-to-left** behaviour, **accessibility** (role and spoken name), what **Android** and the **counter tablet** show, and the guidelines it follows. Sizes are at the default text size; type grows with the reader's setting ([foundations §4.2](foundations.md#42-text-size-follows-the-reader-dynamic-type)). Module contributions plug in at the [extension points](../architecture/modules.md#extension-points) named below and use the same tokens.

## Contents

1. [Shared building blocks](#1-shared-building-blocks): buttons, sheet, the ticket, admin tab bar
2. [Café header and top bar](#2-café-header-and-top-bar)
3. [Language switch](#3-language-switch)
4. [Sticky category bar](#4-sticky-category-bar)
5. [Menu item row](#5-menu-item-row)
6. [Item detail sheet](#6-item-detail-sheet)
7. [Sold-out state](#7-sold-out-state)
8. [My list capsule and list sheet](#8-my-list-capsule-and-list-sheet)
9. [Checkout with consent choices](#9-checkout-with-consent-choices)
10. [Order status](#10-order-status)
11. [Show-to-waiter screen](#11-show-to-waiter-screen)
12. [Staff order card and new-order alert](#12-staff-order-card-and-new-order-alert)
13. [Staff: mark sold out](#13-staff-mark-sold-out)
14. [Owner item editor](#14-owner-item-editor)
15. [Loading, empty and error states](#15-loading-empty-and-error-states)

---

## 1. Shared building blocks

### 1.1 Buttons

| Style | Look | Use | How many |
|---|---|---|---|
| **Prominent** | Capsule, `--dm-accent` fill, `--dm-on-accent` label (Headline 17/600), 50 px high | The main action of the view: Ajouter, Envoyer la commande, Accepter | **One per view** (`buttons.md › Style`) |
| **Tinted** | Capsule or circle, `--dm-fill`, label in `--dm-ink`; the `+` glyph in `--dm-accent-text` | Secondary actions, `+`, steppers | Any |
| **Plain** | Text only, `--dm-accent-text`, 44 px target | Montrer au serveur, links, Annuler | Any |
| **Destructive** | Plain or tinted with `--dm-danger` text | Vider la liste, Refuser, Supprimer | Confirmed by an action sheet when it cannot be undone |

- **States:** pressed (fill brightness 92 % light, 115 % dark, 120 ms, no scaling); focus ring; disabled (40 % opacity, with a sentence nearby that says why); busy (spinner in place of the icon, label changes, e.g. "Envoyer la commande" → "Envoi…", width unchanged; `buttons.md › Mobile (iOS, iPadOS)`).
- In a top bar, a prominent action sits on the **trailing** side (`toolbars.md › Actions`: "put it on the trailing side of the toolbar").
- **Android:** same look; the browser's grey tap flash is turned off (`-webkit-tap-highlight-color: transparent`) so only our press state shows.
- `buttons.md › Best practices`: "Always include a press state for a custom button."

### 1.2 Sheet

The one modal container for item details, the list, checkout, order status, café info and menus that need room.

```text
╭──────────────────────────────────────╮   top corners --dm-radius-sheet (24)
│                ━━━━                  │   grabber 36 × 5, a button (44 px target)
│ ✕                Title            ▢ │   44 px bar: Close leading, title, optional action trailing
│                                      │
│  content (scrolls)                   │
│                                      │
│ ╭──────────────────────────────────╮ │   bottom actions, pinned
│ │        Prominent action          │ │   50 px + --dm-safe-bottom
│ ╰──────────────────────────────────╯ │
╰──────────────────────────────────────╯
```

- **Detents:** *medium* = half the visible screen; *large* = full height minus `--dm-safe-top` and 8 px. Item sheet: medium and large. List: medium with up to 3 lines, otherwise large. Checkout: large only. `sheets.md › Mobile (iOS, iPadOS)`: "consider supporting the medium detent to allow progressive disclosure".
- **Behaviour:** opens from the bottom (`--dm-dur-3`, `--dm-ease-sheet`) over `--dm-scrim`; follows the finger when the grabber, the top bar, or content already scrolled to its top is dragged; dismisses when dragged past 30 % or flicked down; tapping the scrim closes it. **One sheet at a time** (`sheets.md › Best practices`). Close is on the leading side ("the Cancel button belongs on the leading edge of the top toolbar"). A step inside a sheet shows Back instead of Close; never Close, Back and Done together.
- **Unsaved input** (a typed name, an edited field): closing asks with an action sheet, "Abandonner la saisie ?" → [Abandonner] [Continuer]. `modality.md › Best practices`: "help people avoid data loss by getting confirmation before closing a modal view".
- **Keyboard:** when a field gets focus, the sheet goes to *large* and scrolls the field into view.
- **History:** opening pushes a history entry, so Back (Android button, iPhone edge swipe, browser) closes the sheet first.
- **Build:** `<dialog>` with `showModal()` gives focus trapping, Escape and an inert page. On Safari older than 15.4 (no `<dialog>`), the sheet opens as a full-height panel without dragging.
- **RTL:** Close stays on the leading side, which is the right in Arabic; dragging stays vertical.
- **Accessibility:** `aria-labelledby` points to the title; the grabber is a button named "Agrandir" or "Réduire" (`sheets.md`: a grabber "works with VoiceOver"); focus returns to the control that opened the sheet.
- **Android:** the same sheet (Material bottom sheets look alike); the system Back closes it. **Tablet (≥ 700 px):** the sheet is centred, at most 560 px wide, with all four corners rounded.

### 1.3 The ticket (signature)

The order as a ticket: **the one object the customer, the waiter and the counter all share.** It is DigiMenu's only bold element ([README](README.md#signature-the-ticket)).

```text
╭──────────────────────────────────────╮
│ Café Démo Jasmin               14:32 │   Footnote, ink-2
│ Table                                │   Headline
│ 5                                    │   Display 48/700, tabular digits
◖┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄◗   tear line: dashed --dm-sep, two 12 px notches
│ 2 × Café crème · Grand      5,600 DT │   Title 3 on show-to-waiter, Body elsewhere
│     Note : sans sucre                │   the line's note, Callout, ink-2
│ 1 × Croissant               1,800 DT │
│ Note : à servir ensemble             │   the order's note, Callout, ink-2
│ Total                       7,400 DT │   Headline, end-aligned
╰──────────────────────────────────────╯
```

- **One number per ticket,** set in Display: the **table** on the show-to-waiter screen, the **order number** (`A12`) on the status screen and staff cards (compact variant: Title 1, 28 px).
- `--dm-surface` on `--dm-bg-grouped`, radius 16, a 1 px `--dm-sep` outline, no shadow (it is content). The notches are two pseudo-elements in the page colour; no image. **No accent colour, no gradient.**
- It is not the "big number" template the skill warns about (`SKILL.md › Lens 3: Visual design and craft`): the number is the information, it must be read at arm's length by a waiter, and there is no gradient. Judgment.
- **RTL:** lines and labels mirror; the number, prices and times stay left-to-right inside `<bdi>`.
- **Accessibility:** a `<section>` with heading "Table 5" or "Commande A12"; lines are a list; the total is read last.
- **Android and tablet:** identical.

### 1.4 Admin tab bar

| Role | Tabs (icon) |
|---|---|
| Staff | Commandes (`receipt`) · Carte (`book-open`) |
| Manager, Admin | Commandes · Carte · Ventes (`chart-column`) · Plus (`ellipsis`) |
| Maintainer | Carte · Plus |

- **Phone:** bottom, 56 px plus `--dm-safe-bottom`, on the glass bar material; icon 24 px over a Caption label. **Tablet (≥ 700 px):** a centred group of tabs at the top (`tab-bars.md › Tablet (iPadOS)`: "The system displays a tab bar near the top of the screen.").
- **Selected tab:** a `--dm-fill` capsule behind icon and label, label 600, stroke 2.5; others Ink 400, stroke 1.75. **No accent colour:** the accent fails on dark glass (2.42:1 for the demo café), and `tab-bars.md › Best practices` prefers "a monochromatic appearance for tab bars" over colourful content.
- **Badge** on Commandes: waiting orders, `--dm-danger` circle (3.53:1 against the worst glass backdrop), white Caption digits (5.66:1). `tab-bars.md › Best practices`: "Use a badge to indicate that critical information is available."
- Tabs never change within a role and are never disabled ("Don’t disable or hide tab bar buttons"). Sheets cover the tab bar; screens do not.
- **Accessibility:** `<nav>` with links; `aria-current="page"` on the selected tab; the badge is in the name: "Commandes, 2 en attente".
- **Android:** identical; the system Back moves back through screens inside a tab, never between tabs.

## 2. Café header and top bar

**Job:** tell customers where they are (café, table, open or closed) without pushing the menu down.

```text
 [glass top bar, 44 px + safe top]  ‹inline title appears here›   [ FR ⌄ ] [ ⓘ ]
 [logo 48]  Café Démo Jasmin                                 ← Large Title 34/700
            Ouvert · ferme à 23:00   ·   Table 5             ← Callout, ink-2, icons clock / utensils
```

- **Anatomy:** a **large title** block in the content layer (optional logo 48 × 48 px, radius 12; café name in Large Title; one status line with the opening state and the table chip), and the **top bar** in the functional layer (trailing: language button and info button). When the large title scrolls under the bar, the café name appears in the bar as an inline title (Headline). `toolbars.md › Phone (iOS)`: "Use a large title to help people stay oriented as they navigate and scroll."
- **The bar at rest** has no background (it sits on the page); once content scrolls under it, it takes `--dm-bar-bg` (glass or solid). The category bar ([§4](#4-sticky-category-bar)) is part of the same layer.
- **States:** open; "Fermé · ouvre à 08:00" (ordering off, menu still browsable, US-06); no table (chip hidden; dine-in ordering explains why at checkout); unknown table (same as no table).
- **Logo:** shown once, here only, never flipped, never in the bar (`branding.md › Best practices`: "Resist the temptation to display your logo throughout your app"). No logo: nothing in its place.
- **Title:** the café's name, never "DigiMenu" (`toolbars.md › Titles`: "Don’t title windows with your app name.").
- **RTL:** title and status align right; bar buttons move to the left.
- **Accessibility:** the café name is the page's `<h1>`; the info button is named "Infos du café"; the table chip is text, and tapping it explains "Mauvaise table ? Scannez la carte de votre table." (US-01).
- **Android:** same layout with Roboto; solid bar on low-end phones.

## 3. Language switch

**Job:** change the language in one tap from any screen (US-05).

- **Anatomy:** a **pop-up button** in the top bar: `languages` icon, the current code ("FR"), `chevron-down`; 44 × 44 px minimum. Its menu (solid surface, `--dm-elev-1`, radius 12) lists only the café's enabled languages, **each in its own language and script**: "Français", "العربية", "English", with `check` on the current one. `pop-up-buttons.md › Best practices`: "Use a pop-up button to present a flat list of mutually exclusive options or states."
- **Behaviour:** choosing a language closes the menu and re-renders in place: same category, same scroll position, list kept; the direction flips for Arabic. The choice is remembered on the phone. With one language enabled, the button is not shown.
- **Also on:** the show-to-waiter screen, as a segmented control for the waiter ([§11](#11-show-to-waiter-screen)).
- **RTL:** the menu opens from the button toward the page's inline-end side.
- **Accessibility:** button named "Langue : Français" (in the current language), `aria-haspopup="menu"`, `aria-expanded`; items `role="menuitemradio"` with `aria-checked`, each with its own `lang` and `dir`. Escape closes.
- **Android:** the same custom menu (not a native `<select>`, which cannot mark each option's language and direction).

## 4. Sticky category bar

**Job:** jump between categories on a long menu and always show where you are (US-02).

- **Anatomy:** a horizontally scrolling row of category names under the top bar, in the same glass or solid layer. Selected category: an **Ink capsule** with page-colour text (17.40:1 light, 16.73:1 dark), weight 600. Others: Ink text, weight 400, no background. The bar is **monochrome**: `toolbars.md › Best practices`: "Reduce the use of toolbar backgrounds and tinted controls."
- **Sizes:** bar 52 px; each chip 36 px visible inside a 44 px target; inline padding 14 px; 8 px between chips; the last chip is partly visible to show there is more (`scroll-views.md › Best practices`: "Make it apparent when content is scrollable.").
- **Behaviour:** tapping a chip scrolls the menu to that category in under 0.5 s (smooth scroll, instant with reduced motion); while the customer scrolls, the visible category becomes selected and its chip scrolls into view (`scroll-views.md › Best practices`: "In some cases, scroll automatically to help people find their place."). No scroll progress bar.
- **Why not a segmented control or tabs:** cafés have 6 to 12 categories, more than "about five segments on iPhone" (`segmented-controls.md › Best practices`), and they are places on one page, not separate views.
- **RTL:** chips run right to left and the bar starts at the right edge (US-02).
- **Accessibility:** `<nav aria-label="Catégories">` with links to `#cat-…` headings; `aria-current="true"` on the selected one.
- **Android:** identical.

## 5. Menu item row

**Job:** read name, description and price fast, and add in one tap.

```text
Without photo                                    With photo (M-08)
Café crème                       2,800 DT  (+)   [photo]  Café crème             (+)
Espresso et lait chaud, servi                    64 × 64  Espresso et lait chaud
dans une grande tasse                                     2,800 DT

With variants (each variant is its own row, US-03)
Jus d'orange pressé
Orange de Tunisie, sans sucre ajouté
   Petit                         3,000 DT  (+)
   Grand                         4,500 DT  (+)
```

- **Anatomy:** name (Headline, Ink), description (Callout, Ink 2, at most 2 lines), price (Body, Ink, tabular, **end-aligned in a price column**), `+` button (tinted circle, 36 px visible, 44 px target, glyph `--dm-accent-text`, stroke 2.25). A row with a photo puts the photo at the leading end (`lists-and-tables.md › Style`: "display a small image in the leading end of a row") and the price under the description. Variant rows are indented 16 px (`layout.md › Visual hierarchy`: "use indentation to convey hierarchy").
- **Sizes:** at least 64 px high; 12 px vertical padding; separators `--dm-sep`, inset from the leading edge (iOS inset separators); 24 px above each category heading (Title 2).
- **Behaviour:** tapping the row opens the item sheet; tapping `+` adds one of that item or variant (default variant if there is only one) in under 0.1 s (US-08). No animation; the list capsule count changes and a spoken note confirms.
- **States:** default; pressed (row background `--dm-fill`); **in the list** (a small Caption capsule "2 dans la liste", Ink on Fill, under the price); at the line maximum (`+` disabled, capsule says "20 au maximum"); sold out ([§7](#7-sold-out-state)); module badges (`menu.itemBadge`: icon + text, never colour only).
- **Large text:** from root size 23 px (Text Size xxxLarge) the price moves under the name, so names are not truncated (`typography.md › Supporting Dynamic Type`).
- **RTL:** photo on the right, `+` and price column on the left; prices in `<bdi>`.
- **Accessibility:** each item is a list item with its name as a heading level 3; the row's open button is named by the item name; `+` is named "Ajouter Café crème, 2,800 DT"; after adding, a polite live region says "Ajouté : Café crème. 2 dans la liste."
- **Android:** identical. **Photos:** lazy, ≤ 30 KB, not loaded with Save-Data until "Afficher les photos" is tapped (US-23); a failed photo leaves no empty frame.

## 6. Item detail sheet

**Job:** choose a variant and quantity, read everything about the item, and add it.

- **Anatomy (medium detent):** grabber; Close (leading); photo if any (16:9, at most 200 px high); name (Title 2); description (Body, full); **variants** as a list with a `check` on the selected row (`lists-and-tables.md › Best practices`: "Provide appropriate feedback when people select a list item."), the first available variant selected by default; **quantity stepper**; module blocks (`menu.itemDetail`, e.g. dietary tags and their disclaimer); bottom: prominent **"Ajouter · 5,600 DT"** (quantity × variant price, updated live).
- **Large detent:** the same content with the long description and all module blocks visible.
- **Quantity stepper:** `−` value `+`, three 44 px parts on a `--dm-fill` capsule; value in Headline, tabular; minimum 1; at the café's maximum (default 20), `+` is disabled and "20 au maximum" appears (US-08).
- **Note for this item (D-045, D-046):** an optional "Note" field (Callout, up to 200 characters, counter shown at 150), placeholder "Ex. : sans sucre". The note belongs to this line: the same item with a different note is a separate line in the list. The list also has **one optional note for the whole order** ([§8](#8-my-list-capsule-and-list-sheet)).
- **States:** sold-out item (the sheet opens for information; the bottom action is replaced by the "Épuisé" chip); sold-out variant (row shown with the chip, not selectable); after adding: the sheet closes and the live region confirms.
- **RTL:** stepper mirrors (`−` on the right, `+` on the left; `right-to-left.md › Numbers and characters`: reverse "a counting direction"); Close on the right.
- **Accessibility:** dialog named by the item name; variants are a radio group named "Taille" (or the item's variant label); stepper buttons named "Moins" and "Plus" with the value announced; the add button says the total.
- **Android:** identical; Back closes. **No haptics** on iPhone or Android.

## 7. Sold-out state

**Job:** show what is not available before people choose it (US-04), without looking like an error.

- **Customer row:** the `+` button is replaced by a **chip** "Épuisé / Sold Out / غير متوفر" (Caption 13/600, `--dm-soldout` on `--dm-soldout-fill`, 5.61:1 light, 6.22:1 dark, capsule, 28 px high); name and price turn Ink 2 (still ≥ 5.6:1). **No strikethrough** (hurts reading) and **no red** (it is not a failure, [foundations §2.4](foundations.md#24-one-colour-one-meaning)). With the café's "hide" setting, the item is not shown at all.
- **Variant:** only that variant row shows the chip.
- **In the list:** a line that became unavailable shows `triangle-alert` and "N'est plus disponible" in `--dm-warning`, is left out of the total, and offers "Retirer" (US-04, US-09).
- **Staff and owner:** see [§13](#13-staff-mark-sold-out).
- **Accessibility:** the word is in the text, so screen readers read "Café crème, épuisé".
- **Android:** identical.

## 8. My list capsule and list sheet

**Job:** see what you chose, adjust it, then order or show it to the waiter.

**The capsule** (menu screen):

- A floating prominent capsule at the bottom, 16 px from the sides (at most 480 px wide), 8 px above `--dm-safe-bottom`: `receipt` icon, "Ma liste · 3", and the total end-aligned ("8,400 DT"). `--dm-accent` fill, `--dm-on-accent` text, `--dm-elev-1`, 50 px high. Below it, the page fades softly into `--dm-bg` so rows never collide with it (a bottom scroll edge, no blur).
- Shown only when the list has items; appears with a rise and fade (`--dm-dur-2`; fade only with reduced motion). It is the **one prominent action** of the menu screen.
- After an order is sent, it becomes "Commande A12 · Acceptée" (tinted, not prominent) and reopens the status ([§10](#10-order-status)).

**The list sheet:**

- **Top bar:** Close (leading), title "Ma liste".
- **Content:** where the order goes ("Table 5", or "Sans table : montrez la liste au serveur"); one row per line: name and variant (Headline), unit price (Footnote, Ink 2), stepper, line total (end-aligned, tabular). Setting a quantity to 0 removes the line and leaves an "Café crème retiré · Annuler" row until the sheet closes. **Swipe a line toward the leading edge** to reveal "Retirer" (Should; the stepper and the button always do the same, `accessibility.md › Mobility`; swipes start at least 24 px from the screen edge so they never fight the system back swipe). One **note** field for the whole list (200 characters, US-08). Changed lines flagged with `triangle-alert` and the new price (US-09). Total (Headline, tabular). At the bottom of the content: "Vider la liste" (destructive plain button) → action sheet "Vider la liste ?" [Vider la liste] [Annuler] (`action-sheets.md › Best practices`).
- **Bottom actions**, depending on ordering:

| Situation | Prominent | Plain below it | Line above the buttons |
|---|---|---|---|
| Dine-in or takeaway ordering available | Commander | Montrer au serveur | — |
| Ordering off, paused, closed, or no valid table | Montrer au serveur | — | Why: "Commandes en pause — montrez la liste au serveur." |

- **RTL:** rows, steppers and buttons mirror; swipe goes toward the leading edge (right).
- **Accessibility:** the capsule is a button named "Ma liste, 3 articles, 8,400 DT"; lines are a list; stepper buttons include the item ("Moins de Café crème"); totals update in a polite live region.
- **Android:** identical; Back closes the sheet.

## 9. Checkout with consent choices

**Job:** send the order with the fewest fields, saying clearly what personal data is kept and why (D-027, US-11, US-40).

Checkout is **step 2 inside the list sheet** (Back on the leading side, title "Commande"), always at the large detent, on `--dm-bg-grouped` with grouped rows on `--dm-surface`. One path, no sub-flows (`modality.md › Best practices`: "Take care to avoid creating a modal experience that feels like an app within your app.").

| Group | Content | Notes |
|---|---|---|
| Order type | Segmented control **Sur place · À emporter** (only enabled types; one type → a plain line) | `segmented-controls.md › Mobile (iOS, iPadOS)`: "Consider a segmented control to switch between closely related subviews." |
| | Dine-in: "Table 5" (not editable) and the hint "Mauvaise table ? Scannez la carte de votre table." | US-01 |
| | Takeaway: pick-up time pop-up button: "Dès que possible (14:50)" or a slot | US-12; WhatsApp hand-off shows `message-circle` and the word "WhatsApp" |
| Your details | **Prénom** (`autocomplete="given-name"`) and **Téléphone** (`type="tel"`, `autocomplete="tel"`, fixed "+216" prefix label, 8 digits; a number starting with `+` is read as international) | Labels above fields, hints inside (`text-fields.md › Best practices`); "(facultatif)" when the café's setting is `optional`; pre-filled from this phone only (US-40); Clear button at the trailing end (`text-fields.md › Mobile (iOS, iPadOS)`) |
| Payment (M-04) | Segmented control **Espèces · Carte** | `checkout.fields` extension point |
| Module fields | As provided by modules | `checkout.fields` |
| Privacy | Short notice, 2–3 lines (Callout, Ink 2, 5.97:1 on grouped), then the link "Lire la notice complète" (opens as a step with Back) | Directly above the buttons, as US-40 asks |
| Offers | A list row with a **switch, off by default**: "Recevoir les offres de Café Démo Jasmin et Why Not Solutions par WhatsApp" | `toggles.md › Mobile (iOS, iPadOS)`: "Use the switch toggle style only in a list row." Ordering never depends on it |

- **Switch:** 51 × 31 px inside a 44 px row; on = `--dm-success` track (5.40:1 on the page) with a white thumb; off = `--dm-fill` track with a 1.5 px `--dm-border` outline (3.45:1 against the page). State is also shown by the thumb position, never by colour alone. Green is Apple's default switch colour (`toggles.md › Mobile (iOS, iPadOS)`: "Change the default color of a switch only if necessary."), and in our palette it means "on".
- **Validation:** each field is checked when the customer leaves it, and the message appears under it: "Entrez les 8 chiffres de votre numéro." (`entering-data.md › Best practices`: "Dynamically validate field values."). Fields use at least 16 px text so Safari does not zoom.
- **Bottom actions:** prominent **"Envoyer la commande · 8,400 DT"**; it stays disabled until required fields are valid, with the reason just above it ("Ajoutez votre prénom et votre numéro pour envoyer."; `entering-data.md › Best practices`). Plain **"Montrer au serveur"** below it, always available (US-11).
- **Sending:** spinner and "Envoi…" in the button; a second tap does nothing (one client key). Success → the list turns into the ticket ([§10](#10-order-status)). Refused (422) → back to the list with the named lines flagged. Network failure → an error line above the buttons and the prominent button becomes "Montrer au serveur"; nothing is sent later (US-14).
- **RTL:** the form mirrors; the phone field stays left-to-right (`dir="ltr"`, NFR-21) with "+216" on its left.
- **Accessibility:** visible labels; errors linked with `aria-describedby` and `aria-invalid`; segmented controls are radio groups; the switch is `role="switch"` with `aria-checked`; the notice is read before the buttons.
- **Android:** identical; Chrome's autofill fills name and phone.

## 10. Order status

**Job:** confirm the order exists and show where it is, without polling the server (ARCH A4).

- **The moment:** when the server confirms, the list sheet content becomes the **ticket** with "Commande reçue" and the number **A12** in Display (`--dm-dur-3`; a fade with reduced motion). `feedback.md › Best practices`: "When it makes sense, confirm that a significant action or task has completed."
- **Below the ticket:** a vertical status list, Reçue → Acceptée → Prête → Servie, each with `circle-check` when done; the current step is in Headline with "maintenant". Rejected: `triangle-alert` in `--dm-danger`, the reason, and "Montrer au serveur".
- **Updates:** at most 3 automatic checks, then a plain button "Actualiser" (`refresh-cw`) with "Mis à jour à 14:32" (`progress-indicators.md › Mobile (iOS, iPadOS)`: a refresh title can say "when the last update occurred").
- **After Served:** the `postOrder.block` extension point shows module blocks, such as the Google review invitation (M-14), the same for everyone.
- **Leaving:** Close keeps the status reachable from the capsule "Commande A12 · Acceptée".
- **Accessibility:** status changes are announced in a polite live region; the number is read as "A 12".
- **Android:** identical.

## 11. Show-to-waiter screen

**Job:** a clear summary the waiter can read at arm's length; it sends nothing and asks for nothing (US-10).

- **Full screen**, not a sheet (`modality.md › Best practices`: "Consider using a full-screen modal style for in-depth content or a complex task."): top bar with Close (leading) and a **segmented control "FR · عربي · EN"** that changes only this summary's language, for the waiter (US-10).
- **The ticket** with the **table number in Display** (or "Sans table"), lines in **Title 3 (20 px, ≥ 18 px)**, quantities in 700, variants, each line's note under its line, the order's note, total.
- Works in landscape (the phone can be turned toward the waiter). No timer; it stays until closed.
- **RTL:** follows the summary's chosen language, not the page's.
- **Accessibility:** heading "Table 5"; lines as a list.
- **Android:** identical.

## 12. Staff order card and new-order alert

**Job:** no order is missed in a noisy café, and handling one is faster than paper (US-14, US-45, ADR-0007).

**Order card** (a compact ticket):

```text
╭ Nouvelle · il y a 0:42 ──────────────────────────╮  strip: --dm-warning-fill, on-warning text
│ A12          Table 5 · Sur place        Espèces  │  Title 1 28/700 · Headline · Caption chip
│ 2 × Café crème · Grand                           │  Headline
│     « sans sucre »                               │  the line's note, Callout, plain text, quoted
│ 1 × Croissant                                    │
│ Note : « à servir ensemble »                     │  the order's note, Callout, plain text
│ Total                                 7,400 DT   │
│ ╭────────────────────────────╮  Refuser          │  Accepter: prominent, 56 px
│ │          Accepter          │                   │  Refuser: destructive plain
│ ╰────────────────────────────╯                   │
╰──────────────────────────────────────────────────╯
```

- **Content:** order number (Title 1, tabular), type icon and "Table 5" or "À emporter · 14:45 ·" and the customer's first name, payment choice, lines, each line's note under its line and the order's note before the total, as **plain text** in quotes (US-16), module blocks (`staff.orderCardBlock`), total, age ("il y a 0:42", live).
- **Actions** (56 px, `--dm-target-staff`): one prominent next step: **Accepter** → **Prête** → **Servie** (or **Récupérée**). **Refuser** opens an action sheet of reasons (Épuisé · Trop d'attente · Autre). Accepted on another device: "Acceptée · Comptoir" (the display name of the account that accepted) and the alert stops (US-45).
- **Strip states (always words + icon):** **Nouvelle** (`bell-ring`, `--dm-warning-fill` with Ink text, 9.52:1); **En retard · 3 min** after the café's alert time (`clock`, `--dm-danger` with `--dm-on-danger`, 5.66:1 / 7.36:1); "WhatsApp — à confirmer" for hand-offs (`message-circle`). Only Ink text goes on the amber fill (Ink 2 would be 3.66:1).

**New-order alert:**

| Channel | iPhone / iPad | Android phone or tablet |
|---|---|---|
| Banner | Full-width at the top of the Commandes screen: `bell-ring` + "Nouvelle commande · Table 5 · A12" (Title 3, 700) on `--dm-warning-fill`; turns into the danger style when late | Same |
| New card | Enters at the top of the queue (`--dm-dur-2`; fade with reduced motion) | Same |
| Sound | Two-tone chime, repeated at least every 60 s on every device until someone accepts; unlocked by "Commencer le service" | Same |
| Vibration | **None** (Safari has no vibration API) | Vibrates with each chime where supported |
| Badge and title | Badge on the Commandes tab; page title "(2) Commandes" | Same |
| Screen awake | Wake Lock where Safari supports it; otherwise the screen says how to change the auto-lock time | Wake Lock in Chrome |

- **No flashing:** loud through size, colour, words and sound, not blinking (`accessibility.md › Cognitive`: "Be cautious with fast-moving and blinking animations.").
- **Connection status** in the top bar: "Connecté" or `wifi-off` "Hors ligne — reconnexion…" in `--dm-warning` (`feedback.md › Best practices`: "Consider integrating status feedback into your interface.").
- **Start of shift:** a screen with one prominent button **"Commencer le service"**, which plays a test sound and turns on Wake Lock.
- **Counter tablet (landscape, ≥ 700 px):** three columns, **Nouvelles · En préparation · Prêtes**, oldest at the top of each; the banner spans all three ([screens](screens.md#5-staff-screen--counter-tablet-landscape)). **Phone:** one list, waiting orders first.
- **RTL:** mirrors; order numbers, times and phone numbers in `<bdi dir="ltr">`.
- **Accessibility:** the banner is `role="alert"`; card actions include the number ("Accepter A12").

## 13. Staff: mark sold out

**Job:** mark an item or variant sold out in under 30 seconds (US-27), from the Carte tab.

- **Anatomy:** a search field at the top ("Rechercher un article"), then items grouped by category on `--dm-bg-grouped`; each item and variant is a list row with its name and a **switch "Disponible"** on the trailing side (on = available).
- **Off:** the row shows the "Épuisé" chip and the time ("depuis 14:32"); customers see it within a minute (US-27). An inline "Annuler" (`undo-2`) stays on the row until the next change. No toast that disappears on a timer (`accessibility.md › Cognitive`).
- **Staff** see only this switch; prices and items are not editable for them (§2.1 of the requirements).
- **Offline:** switches are disabled, with "Hors ligne — les changements reprendront à la reconnexion" in `--dm-warning`.
- **RTL:** switch on the left; the switch's on position also mirrors.
- **Accessibility:** each switch is named by the item: "Café crème, Grand, disponible".
- **Android and tablet:** identical; on a tablet the list sits in a 640 px column.

## 14. Owner item editor

**Job:** change a name, price or availability from a phone, safely, in under two minutes (US-27, NFR-18).

- **A full screen, not a sheet** (`sheets.md › Best practices`: "For complex or prolonged user flows, consider alternatives to sheets."). Top bar: Back "Carte" (leading), title "Modifier", prominent **"Enregistrer"** on the trailing side (`toolbars.md › Actions`).
- **Groups:** Noms (three fields: "Nom (français)", "الاسم (عربي)" with `dir="rtl"`, "Name (English)"; an empty translation shows "Vide : le français sera affiché"); Descriptions (same); Catégorie (pop-up button); **Prix** or **Variantes** (name + price each, "Ajouter une variante"); Disponible (switch); module fields (`admin.itemFields`, e.g. photo, dietary tags); Historique (who changed what, when, US-28); at the bottom "Supprimer l'article" (destructive, confirmed by an action sheet).
- **Price field (millimes):** `inputmode="decimal"`, the unit "DT" fixed at the trailing end, placeholder "0,000". Accepts "4,5", "4.5", "4,500" → shown as **4,500 DT** with the reading underneath in words: "= 4 dinars 500 millimes". More than 3 decimals is refused ("3 chiffres au maximum après la virgule", US-27). A whole number of 100 or more without a comma ("4500") is ambiguous in Tunisia, where prices are often said in millimes, so the field **always** asks: **"4500 : 4,500 DT ou 4 500,000 DT ?"** with two buttons, and nothing is saved until the owner picks one (D-045). A change of more than 5 times the old price asks for confirmation. Stored as integer millimes. `entering-data.md › Best practices`: "Dynamically validate field values."; `text-fields.md › Best practices`: "Use a number formatter to help with numeric data."
- **Saving:** "Enregistré · visible par les clients dans 1 min environ" with "Annuler" (US-27, US-28). Unsaved changes + Back → action sheet "Abandonner les modifications ?" [Abandonner] [Continuer à modifier].
- **RTL:** the screen mirrors; each text field keeps the direction of its language (`right-to-left.md › Text alignment`: "Align a paragraph based on its language"); the price field is always left-to-right.
- **Accessibility:** labels above fields; the price reading is linked with `aria-describedby`; errors next to the field.
- **Android and laptop:** identical; on a laptop the form is at most 640 px wide.

## 15. Loading, empty and error states

**Loading** (`loading.md › Best practices`: "Show something as soon as possible."):

- The static boot page shows names and prices at once with its minimal renderer; never a blank page or a spinner alone.
- While the full menu loads: grey placeholder blocks for the header and the first rows (`--dm-fill`, **no shimmer** animation). After 3 s, a Footnote "Chargement du menu…" (`progress-indicators.md › Best practices`: avoid vague terms like "loading" with no value, so the text names *what* loads).
- Offline or slow: the last saved menu with a banner `wifi-off` "Menu enregistré à 14:32 — il peut avoir changé." in `--dm-warning`; ordering switches to show-to-waiter only (NFR-08).
- Actions in progress: spinner inside the button ([§1.1](#11-buttons)).

**Empty** (`writing.md › Best practices`: "Provide clear next steps on any blank screens."):

| Where | Text | Action |
|---|---|---|
| List | "Votre liste est vide. Touchez + pour ajouter un article." | Plain "Voir la carte" |
| Staff, no orders | "Aucune commande en attente. Les nouvelles commandes arrivent ici, avec un son." + "Son activé" with `check` | "Tester le son" |
| Search, no result | "Aucun article pour « croisant »." | "Effacer la recherche" |
| Category with no visible item | Not shown | — |

**Errors** (`writing.md › Best practices`: "Write clear error messages."; never "Oups", never "we"):

| Situation | Message (FR) | Where |
|---|---|---|
| Send failed (network) | "Commande non envoyée. Vérifiez la connexion, ou montrez la liste au serveur." | Above the buttons, `triangle-alert`, `--dm-danger` |
| Item became unavailable (422) | "« Croissant » n'est plus disponible. Retirez-le pour continuer." | On the line |
| No valid table | "Pour commander sur place, scannez la carte de votre table." | Above the buttons |
| Too many orders (rate limit) | "Merci de demander au serveur." | Above the buttons |
| Café closed | "Fermé — ouvre à 08:00. Vous pouvez consulter la carte." | Header and list |
| Invalid phone | "Entrez les 8 chiffres de votre numéro." | Under the field |

**Alerts** only for decisions that cannot be undone, and as action sheets on phones; never when a page opens (`alerts.md › Best practices`: "Avoid showing an alert when your app starts.").
