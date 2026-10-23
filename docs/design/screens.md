# Screens

> **Status:** Proposed with [ADR-0011](../adr/0011-design-language-hig-inspired.md) (WO-049). **Owner:** UI/UX Designer.
> Components: [components](components.md) · numbers: [foundations](foundations.md).

Wireframes at **compact width (360 px)**, the narrowest common phone and the width of the definition of done ([checklist §4](../product/definition-of-done.md#4-texts-and-screens)); iPhones are 375–440 px wide and simply get more room. The staff screen is shown on a counter tablet in landscape. Each frame is about 44 characters wide (1 character ≈ 8 px); notes to the right are not part of the screen. All content is the fictional demo café, Café Démo Jasmin.

Symbols: `(+)` add button, `(−)` remove one, `(x)` Close, `(<)` Back, `(i)` info, `[FR ▾]` language pop-up button, `▤` the `receipt` icon, `┆` content continues.

## Contents

1. [Customer menu, left to right (French)](#1-customer-menu-left-to-right-french)
2. [Customer menu, right to left (Arabic)](#2-customer-menu-right-to-left-arabic)
3. [Item sheet](#3-item-sheet)
4. [My list, checkout and the ticket](#4-my-list-checkout-and-the-ticket)
5. [Staff screen — counter tablet, landscape](#5-staff-screen--counter-tablet-landscape)
6. [Owner item editor](#6-owner-item-editor)
7. [Other sizes](#7-other-sizes)

## 1. Customer menu, left to right (French)

**Intent:** a customer at table 5 sees where they are, finds a category and adds items with one thumb, and the café's colour is spent only on the list capsule.

At rest (top of the page), and after scrolling: the café name moves into the top bar, which turns to glass (solid on low-end Android and with reduced transparency or increased contrast).

```text
┌────────────────────────────────────────────┐
│ · · · · · · · status bar (safe area) · · · │
│                            [FR ▾]   (i)    │   top bar, clear at rest
│ ┌────┐                                     │
│ │logo│ Café Démo                           │   Large Title 34/700
│ │    │ Jasmin                              │
│ └────┘                                     │
│ Ouvert · ferme à 23:00   ·   Table 5       │   Callout, ink-2
│ ╭───────╮                                  │
│ │ Cafés │  Thés   Jus   Viennoiseries  Pe  │   category bar, monochrome
│ ╰───────╯                                  │
│ Cafés                                      │   Title 2
│ Express                    1,500 DT  (+)   │   price column, + 44 px
│ Court et intense                           │
│ ─────────────────────────────────────────  │
│ Café crème                 2,800 DT  (+)   │
│ Espresso et lait chaud, servi dans une     │   Callout, 2 lines max
│ grande tasse                               │
│ ╭─────────────────╮                        │
│ │ 2 dans la liste │                        │   in-list caption
│ ╰─────────────────╯                        │
│ ─────────────────────────────────────────  │
│ Cappuccino                 3,500 DT        │
│ Mousse de lait         ╭────────╮          │
│                        │ Épuisé │          │   sold-out chip, no +
│                        ╰────────╯          │
┆                                            ┆
│    ╭──────────────────────────────────╮    │
│    │ ▤ Ma liste · 3          8,400 DT │    │   prominent capsule, accent
│    ╰──────────────────────────────────╯    │
│ · · · · · · home indicator (safe area) · · │
└────────────────────────────────────────────┘
```

```text
┌────────────────────────────────────────────┐
│ · · · · · · · status bar (safe area) · · · │
│            Café Démo Jasmin  [FR ▾]  (i)   │   inline title; glass bar
│   Cafés  ╭──────╮  Jus   Viennoiseries     │   selected = Ink capsule
│          │ Thés │                          │
│          ╰──────╯                          │
├────────────────────────────────────────────┤   edge: blur (glass) or 1 px line (solid)
│ Thés                                       │
│ Thé à la menthe            1,800 DT  (+)   │
│ Menthe fraîche, pignons en option          │
┆                                            ┆
└────────────────────────────────────────────┘
```

Android shows the same layout in Roboto; on a 2 GB phone the bar is solid with a 1 px line once content scrolls under it.

## 2. Customer menu, right to left (Arabic)

**Intent:** the same screen for an Arabic reader: everything that shows reading order mirrors; prices, numbers, the logo and icons of real objects do not.

Arabic text cannot be drawn reliably inside a fixed-width frame, so numbers in brackets stand for the Arabic strings listed below the frame.

```text
┌────────────────────────────────────────────┐
│· · · status bar (safe area) · · · · · · ·  │
│  (i)   [AR ▾]                              │   bar buttons move left
│                                    ┌────┐  │
│                           (1)      │logo│  │   (1) café name, right-aligned
│                                    └────┘  │
│                    (2)   ·   (3)           │   (2) open status, (3) table 5
│                                ╭───────╮   │
│ (8)    (7)    (6)    (5)       │  (4)  │   │   chips start on the right
│                                ╰───────╯   │
│                                       (4)  │   Title 2, right-aligned
│ (+)  1,500 DT                         (9)  │   prices stay "1,500 DT"
│                                      (10)  │
│ ─────────────────────────────────────────  │
│ (+)  2,800 DT                        (11)  │
│                                      (12)  │
┆                                            ┆
│  ╭──────────────────────────────────╮      │
│  │ 8,400 DT             (13) · 3  ▤ │      │   capsule mirrored, icon not flipped
│  ╰──────────────────────────────────╯      │
│ · · · · · home indicator (safe area) · · · │
└────────────────────────────────────────────┘
```

| # | Content (Arabic proposals, to be reviewed by a native speaker) |
|---|---|
| (1) | مقهى ياسمين التجريبي — café name from [`info.json`](../../cafes/demo/info.json), Large Title |
| (2) | Opening status, e.g. مفتوح · يغلق الساعة 23:00 (times stay `23:00`) |
| (3) | طاولة 5 (table 5; the digit stays a Western digit) |
| (4)–(8) | Category names, the first one selected, starting at the right edge |
| (9), (10) | Item name and description, right-aligned |
| (11), (12) | Next item; a French description without translation stays left-aligned in its own block |
| (13) | قائمتي (My List) with the count |

## 3. Item sheet

**Intent:** choose a size and quantity without leaving the menu, and add with the single prominent button.

Medium detent; dragging the grabber up shows the long description and module blocks at the large detent.

```text
┌────────────────────────────────────────────┐
│ ░░░░░░░░░░ menu, dimmed by scrim ░░░░░░░░░ │   --dm-scrim
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│╭──────────────────────────────────────────╮│   radius 24, medium detent
││                   ━━━━                   ││   grabber (button)
││ (x)                                      ││   Close, leading
││ Café crème                               ││   Title 2
││ Espresso et lait chaud, servi dans une   ││   Body
││ grande tasse.                            ││
││ Taille                                   ││   radio group
││  Petit                     2,000 DT      ││
││  ─────────────────────────────────────── ││
││  Grand                     2,800 DT   ✓  ││   default: first available
││ Quantité          ╭───────────────╮      ││
││                   │ (−)   2   (+) │      ││   stepper on --dm-fill
││                   ╰───────────────╯      ││
││ Note (facultatif)                        ││   this line only, 200 characters (D-045)
││ ╭──────────────────────────────────────╮ ││
││ │ Ex. : sans sucre                     │ ││   placeholder, Callout
││ ╰──────────────────────────────────────╯ ││
││ ╭──────────────────────────────────────╮ ││
││ │        Ajouter  ·  5,600 DT          │ ││   prominent, 50 px
││ ╰──────────────────────────────────────╯ ││
││ · · · · · home indicator (safe area) · · ││
└────────────────────────────────────────────┘
```

## 4. My list, checkout and the ticket

**Intent:** check the list, give only the details the café needs with the reason shown next to them, and watch the order become a ticket.

Step 1, the list (large detent because it has more than 3 lines):

```text
┌────────────────────────────────────────────┐
│╭──────────────────────────────────────────╮│
││                   ━━━━                   ││
││ (x)            Ma liste                  ││   Close leading, title
││ Table 5 · Sur place                      ││   where it goes
││ Café crème · Grand            5,600 DT   ││   Headline + line total
││ Note : sans sucre             Modifier   ││   the line's note; Modifier reopens it
││ 2,800 DT        ╭─────────────╮          ││   unit price, Footnote
││                 │ (−)  2  (+) │          ││
││                 ╰─────────────╯          ││
││ ──────────────────────────────────────── ││
││ Croissant                     1,800 DT   ││
││ (!) Prix modifié : avant 1,600 DT        ││   warning text + icon
││                 ╭─────────────╮          ││
││                 │ (−)  1  (+) │          ││
││                 ╰─────────────╯          ││
││ Note pour toute la commande (facultatif) ││
││ ╭──────────────────────────────────────╮ ││
││ │ À servir ensemble, s'il vous plaît   │ ││   order note, 200 chars (D-046)
││ ╰──────────────────────────────────────╯ ││
││ Total                         7,400 DT   ││   Headline, tabular
││ Vider la liste                           ││   destructive plain
││ ╭──────────────────────────────────────╮ ││
││ │              Commander               │ ││   prominent
││ ╰──────────────────────────────────────╯ ││
││            Montrer au serveur            ││   plain, always there
│╰──────────────────────────────────────────╯│
└────────────────────────────────────────────┘
```

Step 2, checkout (same sheet, Back instead of Close). The send button waits for a valid phone number and says why; "Montrer au serveur" is always available:

```text
┌────────────────────────────────────────────┐
│╭──────────────────────────────────────────╮│
││                   ━━━━                   ││
││ (<)            Commande                  ││   Back (step 2), large detent
││ ╭────────────────────┬─────────────────╮ ││
││ │      Sur place     │   À emporter    │ ││   segmented control
││ ╰────────────────────┴─────────────────╯ ││
││ Table 5                                  ││
││ Mauvaise table ? Scannez la carte de     ││   Footnote, ink-2
││ votre table.                             ││
││ Prénom                                   ││   label above field
││ ╭──────────────────────────────────────╮ ││
││ │ Votre prénom                         │ ││   hint inside the field
││ ╰──────────────────────────────────────╯ ││
││ Téléphone                                ││
││ ╭──────────────────────────────────────╮ ││
││ │ +216 │ 7 chiffres saisis         (x) │ ││   type=tel, LTR, Clear
││ ╰──────────────────────────────────────╯ ││
││ Entrez les 8 chiffres de votre numéro.   ││   error under field
││ Paiement  ╭─────────────┬─────────────╮  ││   M-04
││           │   Espèces   │    Carte    │  ││
││           ╰─────────────┴─────────────╯  ││
││ Café Démo Jasmin et Why Not Solutions    ││   short notice, Callout
││ gardent votre prénom et votre numéro     ││
││ pour vos commandes. Lire la notice       ││
││ complète                                 ││   link
││ Recevoir les offres par WhatsApp  ( ○  ) ││   switch, OFF by default
││ Ajoutez un numéro valide pour envoyer.   ││   why the button waits
││ ╭──────────────────────────────────────╮ ││
││ │   Envoyer la commande · 7,400 DT     │ ││   prominent (disabled here)
││ ╰──────────────────────────────────────╯ ││
││            Montrer au serveur            ││
│╰──────────────────────────────────────────╯│
└────────────────────────────────────────────┘
```

Step 3, the order is stored: the sheet's content becomes the ticket (the one orchestrated moment, 360 ms, a fade with reduced motion):

```text
┌────────────────────────────────────────────┐
│╭──────────────────────────────────────────╮│
││ (x)                                      ││
││  ╭────────────────────────────────────╮  ││   the ticket (signature)
││  │ Café Démo Jasmin            14:32  │  ││
││  │ Commande reçue                     │  ││
││  │ A12                                │  ││   Display 48/700
││  ◖┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄◗  ││   tear line + notches
││  │ 2 × Café crème · Grand  5,600 DT   │  ││
││  │ 1 × Croissant           1,800 DT   │  ││
││  │ Total                   7,400 DT   │  ││
││  ╰────────────────────────────────────╯  ││
││  ✓ Reçue                                 ││   status list
││  ● Acceptée — maintenant                 ││   current: Headline
││  ○ Prête                                 ││
││  ○ Servie                                ││
││  (↻) Actualiser · mis à jour à 14:33     ││   after 3 automatic checks
│╰──────────────────────────────────────────╯│
└────────────────────────────────────────────┘
```

## 5. Staff screen — counter tablet, landscape

**Intent:** make every new order impossible to miss from across the counter, and move each order to its next step with one 56 px tap.

Regular width (≥ 700 px): three columns by status, the newest alert across the top, the tab bar at the bottom on phones and at the top on tablets (shown at the bottom here only to keep the frame short). On a phone in portrait the same cards form one list, waiting orders first.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Café Démo Jasmin · Commandes                      ● Connecté     (||) Pause des commandes     (♪) Son   │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ (!) Nouvelle commande · Table 5 · A12                                                      [Voir]  │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│  NOUVELLES (2)                      EN PRÉPARATION (1)                  PRÊTES (1)                       │
│  ╭ Nouvelle · 0:42 ─────────────╮   ╭ Acceptée · Comptoir · 4:10 ──╮   ╭ Prête · 6:02 ────────────────╮  │
│  │ A12   Table 5 · Sur place    │   │ A11   À emporter · 14:45     │   │ A10   Table T2 · Sur place   │  │
│  │ 2 × Café crème · Grand       │   │ 1 × Jus d'orange · Grand     │   │ 3 × Thé à la menthe          │  │
│  │ 1 × Croissant                │   │ « sans glaçons »             │   │ Espèces                      │  │
│  │ « sans sucre »     Espèces   │   │ Carte                        │   │ Total            5,400 DT    │  │
│  │ Total            7,400 DT    │   │ Total            4,500 DT    │   │ ╭──────────────────────────╮ │  │
│  │ ╭──────────────────────────╮ │   │ ╭──────────────────────────╮ │   │ │          Servie          │ │  │
│  │ │         Accepter         │ │   │ │          Prête           │ │   │ ╰──────────────────────────╯ │  │
│  │ ╰──────────────────────────╯ │   │ ╰──────────────────────────╯ │   ╰──────────────────────────────╯  │
│  │ Refuser                      │   ╰──────────────────────────────╯                                     │
│  ╰──────────────────────────────╯                                                                        │
│  ╭ En retard · 3:15 ────────────╮                                                                        │
│  │ A09   Table 2 · Sur place    │                                                                        │
│  │ ...                          │                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                (receipt) Commandes ²      (book) Carte      (chart) Ventes      (…) Plus                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The amber strip and banner (`--dm-warning-fill`, Ink text) mean "waiting"; the red strip (`--dm-danger`) means "late". Both also say so in words and icons. The `²` is the waiting-orders badge.

## 6. Owner item editor

**Intent:** change a name or a price from a phone, and never save a price that is a thousand times wrong.

```text
┌────────────────────────────────────────────┐
│ · · · · · · · status bar (safe area) · · · │
│ (<) Carte        Modifier   [Enregistrer]  │   prominent, trailing
├────────────────────────────────────────────┤
│ NOMS                                       │   group header (Footnote)
│ ╭────────────────────────────────────────╮ │
│ │ Nom (français)                         │ │
│ │ Café crème                             │ │
│ │ ────────────────────────────────────── │ │
│ │   ‹ Arabic name field, right-aligned › │ │   dir=rtl, label in Arabic
│ │ ────────────────────────────────────── │ │
│ │ Name (English)                         │ │
│ │ Vide : le français sera affiché        │ │   missing translation hint
│ ╰────────────────────────────────────────╯ │
│ VARIANTES                                  │
│ ╭────────────────────────────────────────╮ │
│ │ Petit                  ╭─────────────╮ │ │
│ │                        │ 2,000   DT  │ │ │   price field, LTR
│ │                        ╰─────────────╯ │ │
│ │ ────────────────────────────────────── │ │
│ │ Grand                  ╭─────────────╮ │ │
│ │                        │ 4500    DT  │ │ │   typed without comma
│ │                        ╰─────────────╯ │ │
│ │ 4500 : 4,500 DT ou 4 500,000 DT ?      │ │   ambiguity check
│ │ [ 4,500 DT ]   [ 4 500,000 DT ]        │ │
│ │ ────────────────────────────────────── │ │
│ │ (+) Ajouter une variante               │ │
│ ╰────────────────────────────────────────╯ │
│ ╭────────────────────────────────────────╮ │
│ │ Disponible                     (  ● )  │ │   switch ON = success green
│ ╰────────────────────────────────────────╯ │
│ Historique · modifié hier (Manager)        │   US-28
│ Supprimer l'article                        │   destructive, action sheet
└────────────────────────────────────────────┘
```

## 7. Other sizes

| Width | What changes |
|---|---|
| 320 px (small phones) | Category chips scroll sooner; the capsule keeps 16 px side margins; prices may move under names |
| 375–440 px (iPhones) | More room in the name column; nothing else changes |
| Largest Text Size | Prices under names, steppers below line names, buttons stacked; titles capped ([foundations §4.2](foundations.md#42-text-size-follows-the-reader-dynamic-type)) |
| Phone landscape | Safe areas on both sides (`--dm-safe-x`); customer content at most 640 px wide |
| ≥ 700 px (tablets) | Sheets centred, at most 560 px wide; staff screen in three columns; admin tab bar at the top |
