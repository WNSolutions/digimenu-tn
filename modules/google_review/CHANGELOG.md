# Changelog — google_review

## 0.1.0 — unreleased

- The same Google review invitation for every customer once staff mark the order Served, in "Ma commande" (title, one line, a button straight to Google); counted once per order.
- "Laisser un avis Google" always at the bottom of the menu.
- Counts only, on the server, for the phone's own served order and never for test orders: `google_review.shown`, `google_review.tap`. The **Avis Google** card on Visites.
- Setting `reviewUrl` (Google addresses only), needed: without it the module stays off and the validator warns.
