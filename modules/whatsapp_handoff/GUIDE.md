# whatsapp_handoff — Commande par WhatsApp (M-03)

**What it does.** In "Ma liste", the main button becomes **Commander par WhatsApp**. The customer's own WhatsApp opens to the café's number with the order already written (table, lines, notes, total, a short reference). The customer presses **Send**. DigiMenu sends nothing itself: it is free and needs no WhatsApp Business account ([ADR-0007](../../docs/adr/0007-order-notifications-staff-screen-and-whatsapp.md), D-063).

**Status:** experimental (0.1.0, Sprint 1). The order is not stored yet: from Sprint 2 it is stored first, and the reference becomes the order number of the day.

## Settings

| Setting | What it does | Default |
|---|---|---|
| `number` | The café's WhatsApp number, `+216` and 8 digits. The owner chooses which phone receives orders. | none: only the demo café may leave it empty (WhatsApp then asks whom to send to) |
| `messageLanguage` | Language of the message staff read: the café's default language, or `fr`, `ar`, `en` | `default` |

Turn it on for an order type in the café configuration, alone or with the staff screen:

```json
"ordering": { "types": { "dine_in": { "channel": ["whatsapp_handoff", "send_order"] } } },
"modules": { "whatsapp_handoff": { "enabled": true, "settings": { "number": "+21620000000" } } }
```

The first channel is the main button. "Montrer au serveur" always stays as a second choice.

## What staff see

```text
Nouvelle commande · Café Démo Jasmin
Sur place · Table 5
Réf. K7PX

2 × Express — 3,000 DT
   Note : bien chaud
1 × Café crème · Grand — 2,800 DT

Total : 5,800 DT

Envoyé depuis la carte DigiMenu
```

Sold-out lines are left out. If the customer reads the menu in another language, the message says so ("Langue du client : arabe").

## When the café is closed

The button is replaced by a line saying when orders start again, and "Montrer au serveur".

## Switching it off

Set `"enabled": false`. The button disappears; "Montrer au serveur" becomes the main button again. Nothing is deleted.

## Limits

- The customer needs WhatsApp on the phone and a connection. Without it, "Montrer au serveur" still works.
- DigiMenu cannot know whether the customer pressed Send. Staff confirm by replying, as they do today.
- Messages that reach staff with no tap from the customer need the paid WhatsApp Business Platform (`whatsapp_business`, M-16, v1.1).
