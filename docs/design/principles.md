# Design principles

> **Status:** Proposed with [ADR-0011](../adr/0011-design-language-hig-inspired.md) (WO-049). **Owner:** UI/UX Designer.

Apple reintroduced eight design principles in June 2026 (`design-principles.md`). We use them as the **first filter** in every design review: a screen that breaks a principle has a bigger problem than any single guideline it breaks. Below, each principle becomes concrete DigiMenu rules.

Citations name the file and heading in Apple's Human Interface Guidelines as copied in the apple-design skill (see [README](README.md#the-reference-we-use)). **Judgment** marks our own rules. Numbers live in [foundations](foundations.md); component details in [components](components.md).

## Purpose — make something meaningful

*What matters most: the customer reads the café's real menu, in their language, in seconds, and the waiter gets a clear order.*

1. **The QR opens the menu itself.** No splash screen, no home page, no DigiMenu screen first. Something useful shows at once, even before the full menu arrives. `loading.md › Best practices`: "Show something as soon as possible." `branding.md › Best practices`: "Avoid using a launch screen as a branding opportunity."
2. **One job and one prominent action per screen.** Each screen in [screens](screens.md) states its job in one sentence; only one button carries the café's colour. `buttons.md › Style`: "Keep the number of prominent buttons to one or two per view."
3. **Solve the café's problem, not a generic one.** Prices to the millime, the table read from the QR, "Show to waiter" when ordering is off, a staff alert loud enough for a busy counter. `design-principles.md › Purpose`: "Find new ways to solve the problem."

## Agency — let people do things their own way

1. **Ordering is never forced.** "Montrer au serveur" is always one tap away, sends nothing and asks for nothing (US-10, US-11). Personal details are asked only at checkout. `design-principles.md › Agency`: "Give people the freedom to explore."
2. **Every layer can be left three ways, and nothing is lost.** Close button, swipe down, or Back (iPhone edge swipe, Android Back). The list stays saved on the phone. `sheets.md › Best practices`: "Provide an alternative to the Done button." `accessibility.md › Mobility`: "Offer alternatives to gestures."
3. **Mistakes are cheap to undo.** A removed list line leaves an "Annuler" row until the sheet closes; every menu edit can be undone (US-28). No confirmation alert for common undoable actions; confirmation only for what cannot be undone, such as emptying the list. `design-principles.md › Agency`: "Help people recover from mistakes." `alerts.md › Best practices`: "Avoid displaying alerts for common, undoable actions, even when they’re destructive."
4. **The reader chooses the language,** from every screen, and the choice is remembered (US-05). Judgment, from US-05.

## Responsibility — act in people's best interest

1. **Ask for data only when it is needed, and say why right there.** First name and phone appear only at checkout, with the short privacy notice just above the Confirm button (US-40, D-027). `design-principles.md › Responsibility`: "Provide a clear rationale when asking for permission". `entering-data.md › Best practices`: "Be clear about the data you need."
2. **Marketing consent is separate and off.** A switch in its own row, off by default; Confirm never depends on it. Judgment, required by D-027 and US-40.
3. **Show staff only what their role needs.** Order cards show a first name, not a phone number, except on open takeaway orders (§2.1 of the requirements); sounds and banners never contain personal data. `design-principles.md › Responsibility`: "Only collect what your product needs to function".
4. **Respect the customer's data plan and battery.** No web fonts, no autoplay, no decorative images; photos load only near the screen and never in Save-Data mode (NFR-03). Judgment; see `accessibility.md › Cognitive`: "Let people control audio and video playback."

## Familiarity — build on what people know

1. **Use iOS patterns the way iPhone users know them.** Large title that collapses into the bar (`toolbars.md › Phone (iOS)`), sheets with a grabber and medium and large detents (`sheets.md › Mobile (iOS, iPadOS)`), switches only in list rows (`toggles.md › Mobile (iOS, iPadOS)`), a segmented control for the order type (`segmented-controls.md › Mobile (iOS, iPadOS)`), an action sheet to confirm a destructive choice (`action-sheets.md › Best practices`), a tab bar in the admin app (`tab-bars.md`). Android users get the same patterns; they are common there too.
2. **Restyle, never re-behave.** A component may carry the café's colour; it keeps Apple's size, place and gesture. `branding.md › Best practices`: "Express your brand with familiar components."
3. **Borrow from the café, not from tech.** The table card, the waiter's order ticket, the "Épuisé" written on a board: the interface uses things everyone in a Tunisian café already knows. `design-principles.md › Familiarity`: "Use concepts that people know."
4. **One behaviour everywhere.** The same `+`, the same sheet, the same wording for the same action, in the customer page and the admin app. `design-principles.md › Familiarity`: "Keep visuals and interactions consistent".

## Flexibility — adapt to diverse contexts and needs

1. **iPhone first, never iPhone only.** Every component in [components](components.md) states what an Android user and the counter tablet see. `design-principles.md › Flexibility`: "Approach every platform with intention."
2. **Text follows the reader.** iPhone Text Size (Dynamic Type) drives all type through `rem`; layouts stack at large sizes; zoom is never blocked. `accessibility.md › Vision`: "Support larger text sizes." `layout.md › Adaptability`: "Be prepared for text-size changes."
3. **Every system setting has an answer.** Light and dark from the system, with no switch of our own (`dark-mode.md › Best practices`: "Avoid offering an app-specific appearance setting."); increased contrast, reduced motion and reduced transparency each change the tokens ([foundations §11](foundations.md#11-accessibility-baseline)).
4. **French, Arabic and English are equal.** Arabic is fully right-to-left, prices and numbers stay readable in every direction. `layout.md › Adaptability` lists "left-to-right/right-to-left layout direction" among the things a layout must handle; rules in [foundations §9](foundations.md#9-right-to-left).

## Simplicity — be clear and direct

1. **Content first.** No hero, carousel, decorative background or animation library; the café header takes about a quarter of the first screen and the first category is visible without scrolling. `branding.md › Best practices`: "Ensure branding always defers to content."
2. **Reveal details progressively.** Rows show the name, two lines of description and the price; everything else is in the item sheet. `layout.md › Visual hierarchy`: "Use progressive disclosure to make layouts cleaner and easier to interact with."
3. **Few, plain words.** Verbs on buttons, no jargon, no "Submit". `writing.md › Best practices`: "Be action oriented." `design-principles.md › Simplicity`: "Be concise."
4. **Remove one accessory per review.** Already removed: DigiMenu's logo on customer screens (only a one-line attribution remains, C-13), a scroll progress bar on the category bar, item photos as decoration, and "fly to cart" animations. Judgment, from the skill's craft lens (`SKILL.md › Lens 3: Visual design and craft`).

## Craft — care about every detail

1. **Numbers are typeset.** Tabular digits, prices aligned on the end edge, always three millime digits, a no-break space before `DT`, prices isolated so Arabic never reorders them. `right-to-left.md › Numbers and characters`: "Don’t reverse the order of numerals in a specific number."
2. **Every control is finished.** A press state, a visible focus ring and a 44 × 44 px target for everything you can tap. `buttons.md › Best practices`: "Always include a press state for a custom button." `accessibility.md › Mobility`: "Offer sufficiently sized controls."
3. **Concentric corners on a 4 px grid.** Inner radius = outer radius − inset. `toolbars.md › Best practices` asks custom components to keep corners concentric with their container.
4. **Test where cafés are.** A sunny terrace, a dim evening, a 2 GB Android phone, an iPhone at the largest Text Size, Arabic. `color.md › Best practices`: "Test your app’s color scheme under a variety of lighting conditions." `design-principles.md › Craft`: "Test your product in real-world settings".

## Delight — make it human

1. **The feeling is hospitality.** Relaxed, looked after, never hurried: the interface behaves like a good waiter. `design-principles.md › Delight`: "Identify the emotion you want to inspire." The emotion is judgment.
2. **One defining moment: the ticket.** When an order is received, or the list is shown to the waiter, the list becomes a ticket with the number set large. The same ticket appears on the staff screen. Nowhere else does DigiMenu raise its voice. `design-principles.md › Delight`: "Create defining moments."
3. **No decoration.** No confetti, no sounds for customers, no animation on `+`. `design-principles.md › Delight`: "Don’t mistake delight for decoration." `motion.md › Providing feedback`: "In apps, generally avoid adding motion to UI interactions that occur frequently."
4. **Words match the moment.** Warm when things go well ("Commande reçue. Le café la prépare."), direct when they don't ("Commande non envoyée. Montrez la liste au serveur."). `writing.md › Getting started`: "Match your tone to the context."

## Where we depart from Apple, and why

| Apple says | We do | Why |
|---|---|---|
| Minimum text 11 pt (`typography.md › Ensuring legibility`) | Minimum 13 px, 14 px in Arabic | Arabic legibility, sunlight, one `rem` scale ([foundations §4.3](foundations.md#43-type-scale)) |
| Bold or 18 pt text may use 3:1 (`accessibility.md › Vision`) | 4.5:1 for all text | WCAG 2.1 AA as written in NFR-07 |
| Filled symbols in tab bars (`tab-bars.md › Best practices`) | Outline icons; the selected tab gets a capsule, a heavier stroke and a semibold label | No Apple symbols; the open set we use has no filled variants ([foundations §8.1](foundations.md#81-the-set-lucide)) |
| Liquid Glass on bars and sheets | Glass on two bars only; sheets are solid | Budget and legibility on phones that are not iPhones ([foundations §3.2](foundations.md#32-glass-on-the-floating-bars)) |
| Haptic feedback on key events | None for customers | Safari has no vibration API; nothing relies on it |
| Reduce Transparency gets an opaque fallback (`liquid-glass.md › Review checklist`) | Opaque fallback where the browser reports the setting; 80 % fill elsewhere | Safari does not expose the setting ([foundations §3.2](foundations.md#32-glass-on-the-floating-bars)) |
