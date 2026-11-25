# google_review — Avis Google (M-14)

**What it does.** Once staff mark an order **Servie**, the customer's **Ma commande** screen shows the same invitation to everyone: "Vous avez aimé votre passage ? Donnez votre avis sur *café* sur Google", with a button straight to the café's Google review page. A link **Laisser un avis Google** is always at the bottom of the menu. Issue #26, US-44.

**Status:** experimental (0.1.0).

## Setting

| Setting | What it does | Default |
|---|---|---|
| `reviewUrl` | The café's own Google review link. **Needed**: without it the module stays off (no file, no route) and the validator warns. | none |

```json
"modules": {
  "google_review": {
    "enabled": true,
    "settings": { "reviewUrl": "https://g.page/r/…/review" }
  }
}
```

**Getting the link.** The café owner (or whoever manages its Google Business Profile) opens the profile on Google, taps **Demander des avis** (Ask for reviews) and copies the link (`https://g.page/r/…/review`). A link that starts with `https://search.google.com/local/writereview?placeid=…`, a Google Maps page of the café, or a `maps.app.goo.gl` share link also works. Any other address is refused: the button always goes straight to Google, never through a page of ours or a form in between.

Collect the link at onboarding (café checklist, "Google review link received, or `google_review` stays off") and keep the café's written OK with the other onboarding papers.

## What the customer sees

| Moment | Where | What |
|---|---|---|
| Any time | Bottom of the menu | **Laisser un avis Google** (EN "Review us on Google") |
| Order sent | Under the café's name | the chip **Commande A12 · Reçue**; tap it for **Ma commande** |
| Staff mark it **Servie** | Ma commande (opens by itself once when the phone sees it, unless another sheet is open) | "Vous avez aimé votre passage ?", one line, and the button **Laisser un avis Google** |

The phone follows its last order for 3 hours (core, `core/app/order-track.js`); see below for how often it checks.

## Fair to everyone (Google's rules)

- **The same invitation for every customer.** It depends only on the order being served: never on a rating, an amount, the table or anything else. The code receives none of these, so it cannot depend on them.
- **Never tied to a reward.** No points, stamps, discounts or gifts for a review, and no "rate us first" step that sends only happy customers to Google (review gating). Both are against Google's policy and can get the café's reviews removed.
- **Staff do not ask in exchange for anything** either: say so at the staff briefing.

## Counts (the "Visites" tab)

Counts only, no names, numbers or keys:

| Counter | Counted when |
|---|---|
| `google_review.shown` | the invitation is shown, once per order on that phone |
| `google_review.tap` | the customer taps the button |

The server keeps a count only for the phone's own order (its key), at this café, once it is served, and never for a test order (demo café, a Maintainer's test order). The footer link is not counted. A Manager, Maintainer or Admin sees **Avis Google** on **Visites**: invitations seen, taps to Google, and their share, for the period chosen. The reviews and the rating themselves are on Google.

## How often the phone checks

At most **3 automatic checks** per order (architecture overview, Tech Lead review A4): 4, 12 and 25 minutes after it was sent; a check due while the phone is locked or on another app waits until the menu is seen again. After that the customer refreshes: tapping the chip opens **Ma commande** and checks, and so does **Actualiser** ("Mis à jour à 14:32"). Nothing is checked once the order is served, refused or cancelled. So an order served after 25 minutes shows the invitation when the customer next opens Ma commande, not by itself.

## Files

| File | What |
|---|---|
| `client.js` | footer link and the invitation (`footer.link`, `orderStatus.block`) |
| `server.js` | `POST /api/m/google_review/count` (`shown`, `tap`) |
| `staff.js` | the **Avis Google** card on Visites (`admin.dashboardCard`) |
| `settings.schema.json` | `reviewUrl`, Google addresses only |
| `i18n/` | customer texts FR/AR/EN, staff texts FR/AR |

## Related

[Module system](../../docs/architecture/modules.md) · [requirements index, US-44](../../docs/product/requirements-index.md)
