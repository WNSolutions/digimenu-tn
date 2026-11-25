# loyalty — Carte de fidélité (M-15)

**What it does.** Customers join the café's loyalty programme when they order, by ticking **Rejoindre la fidélité** in checkout (the privacy notice's own text, never pre-ticked). They get a stamp card on their phone: **Fidélité** in the menu's top bar, or the link `/<café>/carte`, which they can add to the home screen. Each order **staff confirm** adds one stamp; when the card is full, staff give the reward. Design: [ADR-0013](../../docs/adr/0013-loyalty-at-launch-phone-number-and-wallet-card.md), decision D-064.

**Status:** experimental (0.2.0). Wallet passes (Google Wallet, Apple Wallet) come next.

## Settings

| Setting | What it does | Default |
|---|---|---|
| `stampsNeeded` | Stamps for one reward, 2 to 50 | `10` |
| `reward` | The reward as customers and staff read it, `{ "fr": …, "ar": …, "en": … }` (French required) | "Une récompense" |
| `minOrderTotal` | Smallest order total, in millimes, that earns a stamp (`0` = every order). Counter stamps are the staff's choice. | `0` |

```json
"modules": {
  "loyalty": {
    "enabled": true,
    "settings": {
      "stampsNeeded": 10,
      "reward": { "fr": "Un café offert", "ar": "قهوة مجانية", "en": "A free coffee" }
    }
  }
}
```

A café can switch loyalty on only once its privacy notice has a `loyalty` opt-in text (`optIn.loyalty`): without it, checkout shows no join box. Changing the rule applies to new stamps; stamps already given stay.

## How a stamp is earned

| What happens | Stamp |
|---|---|
| Customer joins at checkout | the card is made, with 0 stamps |
| Staff tap **Accepter** (staff screen) or **Reçue** (WhatsApp order) | +1 for that order, once |
| Staff tap **Refuser** after accepting | the order's stamp is taken back |
| **Pas reçue** (WhatsApp message never arrived) | nothing; **Reçue** later gives the stamp |
| Staff tap **Ajouter un tampon** in the Fidélité tab (purchase paid at the counter) | +1; one per card every 10 minutes, **Annuler ce tampon** right after a mistake |
| Staff tap **Utiliser la récompense** (two taps) | the stamps of one reward are used |

A customer can never add a stamp alone, and a typed phone number is never enough to see or use someone's card: there is no SMS check (D-030). The card's secret link goes only to the phone that joined.

## What staff see (Fidélité tab)

Tap **Scanner la carte** and point the phone at the QR code on the customer's card, or type the **card number** shown under it, or the customer's **phone number**. The QR code holds the card number, an expiry and the server's signature, never the phone number or the card's secret; it is valid 24 hours and the card page shows a fresh one each time it opens with internet. Phones whose browser has no QR reader (iPhone Safari) load one the first time staff scan. The card shows the first name, the last three digits of the phone, stamps and rewards, and the buttons above.

**New phone.** Staff check the customer has the number (for example the customer calls or writes to the café from it), tap **Nouveau téléphone**, then give the 10-character code. On the new phone: menu, **Fidélité**, enter the code. The code works once, for 15 minutes; the old phone no longer sees the card.

## What the customer can do

See stamps, the reward, the QR code and the card number; open the card on a new phone with a staff code; **Quitter la fidélité** (the card stops, its stamps are cleared, the choice is recorded as a consent withdrawal). Joining again later starts from zero with the same card number.

## Data

- `loyalty_cards`: one card per customer and café (card number, hash of the card's secret, sealed copy of it for a retried order, status, transfer code hash). No phone number.
- `loyalty_ledger`: every earn, reward used and reversal, with the order or the staff member, and the time.
- Reads the central customer record (ADR-0010) for the first name and last three digits shown to staff. Every card opened by staff, and every stamp, undo, reward and new-phone code, is in the audit log.
- Switching the module off hides everything; cards and stamps stay for when it is switched on again.

## Files

`client.js` (customer page: top-bar button, card page, checkout, after-order block) · `server.js` (order hooks, customer and staff calls) · `staff.js` (Fidélité tab) · `i18n/` (customer texts FR/AR/EN; staff texts FR/AR) · migration `platform/migrations/0004_loyalty.sql`.
