# Changelog — loyalty

## 0.2.0 — unreleased

- QR code on the card: card number, expiry (24 hours) and the server's signature; never the phone number or the card's secret. A card saved while offline drops an expired code and keeps the number.
- Staff "Scanner la carte" in the Fidélité tab (phone camera); wrong-café and expired codes are refused with a clear message.

## 0.1.0 — unreleased

- Joining at checkout (unticked, the notice's own text) makes a card; its secret goes to that phone only, also when the order is retried.
- One stamp per order when staff accept it (or mark a WhatsApp order "Reçue"); a rejected order takes its stamp back; optional minimum order total.
- Card page from "Fidélité" in the top bar or `/<café>/carte`: stamps, reward, card number; last card shown when offline; leave the programme.
- Staff "Fidélité" tab: find by card number or phone, counter stamp (one per 10 minutes, with undo), use a reward, one-time code for a new phone. Audit log entries.
- Settings: `stampsNeeded`, `reward`, `minOrderTotal`.
