# ADR-0013: Loyalty ships at launch: customers are their phone number, and carry a card in Apple Wallet or Google Wallet

| | |
|---|---|
| **Status** | Accepted · stamps or points open (Q30) · Apple Wallet funding open (Q31) |
| **Date** | 2026-11-10 |
| **Source decisions** | D-064 (amends D-027 "loyalty after go-live"), D-063, D-027, D-030 · M-15, US-46, US-47, US-50 |
| **Deciders** | Ahmed (project lead); design proposed by the Software Architect |

## Context

Ahmed made customer loyalty a core layer and one of DigiMenu's main selling points, **ready before launch** (first cafés 23–27 Nov 2026), instead of a v1.1 module in December (D-064). Customers are recognised by the **phone number** they give at checkout, and get a **virtual card** they can add to **Apple Wallet** or keep on Android (**Google Wallet**).

Constraints that shape the design:

- **$0/month** for the project, and no SMS (D-030): a phone number cannot be verified by a code. So a typed number alone must never be enough to take someone's reward.
- Customer data rules already exist ([ADR-0010](0010-customer-data-consent-and-deletion.md)): consent recorded, fields encrypted, one record per phone across WNS cafés, deletion on request, and a **go-live gate** before any real customer data is collected.
- Many cafés will take orders through the free **WhatsApp hand-off** (D-063), possibly without a staff screen. DigiMenu cannot see whether a WhatsApp message was sent.
- 80–90 % of customers use iPhone (D-040). **Apple Wallet passes need the Apple Developer Program ($99 per year)**; the grant is fully allocated (D-003). **Google Wallet** is free but Google must approve the issuer before cards stop showing "[TEST ONLY]".

## Decision

1. **Loyalty is the `loyalty` module (M-15), built for the go-live release.** Each café switches it on and sets its rule. Switched off, it leaves no trace (MOD-03).
2. **A customer is a phone number, per café.** The central customer record ([ADR-0010](0010-customer-data-consent-and-deletion.md)) stays one per phone; the **loyalty account is per café** (each café has its own card, rule and reward). Joining is a separate, unticked choice at checkout ("Rejoindre la fidélité de {café}"), recorded like the other consents.
3. **A stamp needs a staff action.** One stamp is added per order **when staff confirm it** (staff screen: Accepted; WhatsApp hand-off: staff mark the reference as received in the staff app), or when staff **scan the customer's card** at the counter (for any purchase, including one not made through DigiMenu). A customer can never add a stamp alone. Every earn, redemption and reversal is a line in `loyalty_ledger`; a rejected or cancelled order reverses its stamp.
4. **The rule, set by the café's manager:** a **stamp card** ("10 commandes = 1 café offert": count, reward text, optional minimum order total). The ledger stores units, so **points per dinar** can be added later without changing stored data (Q30). Changing the rule applies to new stamps only.
5. **The card is first a web page** at `/<café>/carte` that works on every phone with no install: café name and colours, stamps collected, the reward, the masked number (last three digits), and a **QR code holding a signed card token** (never the phone number). The page can be added to the home screen. A card is opened on the phone through a link kept on that phone; on a new phone, staff (or Admin) re-issue it after checking the customer controls the number.
6. **Wallet passes are the same card in the phone's wallet**, offered on the card page once a café's wallet is set up:
   - **Google Wallet** (free): one loyalty class per café, one object per card, saved with a "Save to Google Wallet" link signed by the WNS service account (a Worker secret). New stamps update the object through the Google Wallet API, **fail-open**: a failed update never blocks an order.
   - **Apple Wallet**: a store card pass signed with the WNS Pass Type ID certificate, served with Apple's pass web service from the Worker. New stamps are pushed through Apple's push service; whether a Worker can send that push directly is checked first (spike). If it cannot, the pass still carries the card's QR code and a link to the live card page, and refreshes when the customer pulls it down. **Built only if Q31 provides the Apple Developer membership.**
   - Passes show no phone number: café name, card number, stamps, reward, QR code.
7. **Redeeming happens with staff only:** staff scan the card on the staff screen, see "Récompense disponible", tap "Utiliser"; the ledger records it. The customer cannot redeem from the card page.
8. **No messages are sent.** Loyalty adds no SMS and no WhatsApp message. Reward reminders by WhatsApp come only with the paid, opt-in `whatsapp_business` module (M-16, v1.1).
9. **Privacy:** loyalty inherits [ADR-0010](0010-customer-data-consent-and-deletion.md): encrypted phone, keyed-hash lookup, Admin-only customer data, deletion removes cards, balances and wallet objects, and **the go-live gate applies** (no real customer collected until consent, records, export, deletion, backup and Ahmed's legal check pass).
10. **Launch scope, in order of priority:** (a) earning on staff-confirmed orders and by scan, (b) the web card with QR, (c) redemption on the staff screen, (d) the manager's rule, (e) Google Wallet, (f) Apple Wallet. If (e) or (f) are not approved or not ready on launch day, the cafés launch with (a)–(d) and the wallet buttons appear later; stamps already count from day one.

## Consequences

- **Positive:** a feature cafés understand at once (the paper stamp card, without the paper); repeat visits become measurable for the grant report; WNS builds a consented customer base (D-027); no cost per customer and no app to install.
- **Negative / costs:** about a week of extra build before launch, on top of ordering, sign-in and the staff screen. Every café needs a staff action to give a stamp, so staff training covers it. Apple Wallet costs $99 per year, renewed every year after the grant or existing passes stop updating, which conflicts with $0/month unless someone takes it on (Q31). Google's review time is outside our control.
- **Follow-ups:** Ahmed creates the Google Wallet issuer account and requests publishing access (task T113); Ahmed answers Q30 and Q31 by Thu 12 Nov; the Apple push spike runs as soon as a certificate exists; the roadmap, requirements index, module catalogue and data model are updated with this ADR; GitHub issues for the launch scope go into milestone S3.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep loyalty after go-live (v1.1) | Replaced by D-064: it is a headline selling point for the pilot cafés. |
| Customer earns by typing their number, no staff action | Anyone could collect stamps on any number; without SMS we cannot verify it. |
| Verify the number by SMS or WhatsApp code | SMS dropped (D-030); automated WhatsApp needs the paid Business Platform. A customer-sent WhatsApp message can serve as a manual check when a card is re-issued. |
| A native app | Against "no app to install" and far beyond the budget and time. |
| A paid wallet-pass service (PassKit, Passcreator…) | Monthly cost after the grant, and customer data on a third party. |
| Only the phone number, no card | Ahmed asked for a card in the phone's wallet; a QR card also lets staff stamp purchases made without DigiMenu. |

## References

- [ADR-0007](0007-order-notifications-staff-screen-and-whatsapp.md) (WhatsApp hand-off, amended by D-063) · [ADR-0008](0008-module-system.md) (modules) · [ADR-0010](0010-customer-data-consent-and-deletion.md) (customer data)
- [Module catalogue](../architecture/modules.md) · [Data model](../architecture/data-model.md) · [Roadmap](../product/roadmap.md)
- Apple Wallet requires a Pass Type ID certificate from the Apple Developer Program; Google Wallet issuers start in demo mode until publishing access is granted.
