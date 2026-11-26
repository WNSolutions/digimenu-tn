# dietary_tags (M-10): allergens and dietary tags

**For:** maintainers. **Status:** experimental (0.1.0). **Issue:** #29 (US-25).

## What it does

On each item the café chooses, customers see small labels under the name, each with an icon and its text (never an icon alone):

- one per diet: **Végétarien**, **Vegan**, **Sans gluten**, **Sans lactose**, **Épicé**;
- one for the allergens it contains: **Contient : œufs, lait**, with a warning icon. The list is the 14 allergens to declare (gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree nuts, celery, mustard, sesame, sulphites, lupin, molluscs).

In the item sheet: the same labels, and the note **"Étiquettes fournies par le café : demandez au personnel en cas d'allergie."** French, Arabic and English.

## Switching it on for a café

1. Staff app → café → **Modules** → **Allergènes et régimes** → switch on (a live café: a request Admin approves).
2. Staff app → **Carte** → open an item → **Allergènes et régimes**: tick what applies → **Enregistrer**. Each save is one change in the menu's **Versions**, with undo.
3. Check on a phone: the labels under the item's name, the note in its sheet.

Off: nothing is shown and nothing is loaded; the ticks stay stored, ready if the module is switched on again.

## Rules

- **The café is responsible for its tags.** Never tick for them from a photo or a guess: ask the café, item by item, and keep their written list. When unsure, tick nothing: the note still tells customers to ask staff.
- A fixed list only: no free text, so every tag has its icon and its words in each language. A tag outside the list is ignored.
- Stores only `items.ext.dietary_tags.tags` (a list of names from the fixed list). No order data, no customer data, no outside service.

## Files

`module.json` · `item.schema.json` (the fixed list, staff names for each tag) · `client.js` (labels and the note) · `i18n/` (customer texts) · `tests/`.

The core draws the labels (`core/app/item-extras.js`, loaded only when a module adds item labels); the menu editor builds the boxes from `item.schema.json`, and the server refuses anything else (`platform/shell/src/menu-api.js`, `itemExt`).
