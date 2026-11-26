# Rolling a café back

> **For:** trained youth with the **Maintainer** role, and Admin. **Promise:** a café is back on
> its previous version **within 15 minutes** of deciding to (MOD-09). **Rules:** [releases](../architecture/releases.md#who-can-do-what).
> A French one-page card for the youth toolkit (#30) is made from this page.

Rolling back puts **one café** back on the version it ran before. It changes nothing else: the
menu, prices, café information, module switches, orders and customer records stay exactly as they
are, because they are data, not code. It never publishes anything: only Ahmed's deploy adds a
version to the site (D-021).

## First: is it the version, or one module?

| What you see | Do this |
| --- | --- |
| The problem started right after the café moved to a new version ("Version de ce café" shows the date), and it affects the café in general: pages do not load, orders do not arrive, buttons do nothing | **Roll back** (below) |
| One feature fails (orders, WhatsApp, loyalty…) and the rest works | **Kill switch**: staff app → café → **Modules** → that module → **Désactiver** → tap again. Faster, and the café falls back to "show to the waiter" |
| Every café has the problem | It is the platform, not one café's version: call Ahmed (Cloudflare rollback, [branching and releases § 5](branching-and-releases.md#5-rolling-back-target--15-minutes-mod-09)) |
| A wrong price or item | Not a version problem: **Carte** → **Versions** → **Annuler le dernier changement** |

## Roll back in the staff app (2–5 minutes)

1. Open the staff app and sign in with your own account (production: `digimenu-admin.wnsolutions.tn/admin/`; preview: the preview address `/admin/`).
2. At the top, choose the café.
3. Open the **Modules** tab. The first card is **Version de ce café**: "Ce café utilise la version … Depuis le …".
4. Tap **Revenir à la version précédente (x.y.z)**.
5. In the box that opens, write **one line**: what you saw and when. Example: `Commandes bloquées depuis 12:10`.
6. Tap again: **Confirmer : revenir à x.y.z**.
7. Wait for the green line **"Fait : le café utilise maintenant la version x.y.z"**.
8. Check: on a phone, open one of the café's table links and **reload** it: the menu shows. Ask the staff to reload their screen; the next order should arrive. Other servers pick up the change within 30 seconds; every customer gets it on their next page load.
9. Tell Ahmed at once (café, time, your line from step 5), then write the incident note below.

Stopwatch target: steps 1–7 take about 2 minutes. The 15 minutes are for deciding and checking.

### If there is no button, or it says "Pas possible"

- **"Pas possible : elle n'a pas ces modules, activés ici : …"** The previous version does not have a module that was switched on since. Switch that module off first (kill switch, above), then the button appears.
- **"Pas possible" for another reason** (database, formats): call Ahmed. Do not try anything else.
- **No button at all.** Either the café has no previous version on the site (for example its first version), or going "back" would mean going to a newer version, which only Admin may do. Call Ahmed.
- **"Vous pouvez seulement revenir à la version précédente."** Your role allows only that one move. Admin may move a café to any version on the site.

## Without the staff app (fallback)

If the staff app itself does not open, the same move can be made from GitHub, from a phone or a
laptop, by the accounts listed in the deploy repo's `PIN_ALLOWED_ACTORS` (rollback only) or
`DEPLOY_ALLOWED_ACTORS` (Ahmed: any move):

1. Private deploy repo → **Actions** → **Pin café** → **Run workflow** (branch `main`).
2. Fill in: the café (its slug, e.g. `jobi`), the version to go back to (e.g. `0.16.0`), why (one line), and where (`production`).
3. Run. The workflow reads the café from the database, applies the same rules and the same checks as the staff app (`tools/release/pin.js`), and refuses with the reason if the move is not allowed. Its summary says from which version to which.
4. Then steps 8 and 9 above.

## The incident note

Short, the same day, sent to Ahmed:

```text
Date and time:      26/11/2026 12:10 (problem seen), 12:16 (back on the previous version)
Café:               …
What people saw:    …
Version:            0.17.0 -> 0.16.0
Who rolled back:    …  (staff app / Pin café workflow)
Time taken:         6 minutes
Next step:          Ahmed / the Tech Lead fix it in a patch release; the café moves forward again only with Ahmed
```

## Rehearsal (before go-live wave 1 and before v1.0)

Every Maintainer rehearses once on **preview** before working on live cafés, timed (MOD-09):

1. Ahmed (or Claude, D-065) deploys a new preview version **keeping the previous one** (deploy input `keep`). The demo café moves to the new version, and its history keeps the previous one.
2. The person being trained signs in to the preview staff app with their own Maintainer account for the demo café.
3. Someone says "go" and starts a stopwatch. The person follows steps 2–8 above on the demo café.
4. Stop the watch when the table link, reloaded, shows the menu. **Pass: under 15 minutes.**
5. Write it down: name, date, time taken, anything unclear in this page (then fix this page).

The next deploy of preview moves the demo café forward again by itself.
