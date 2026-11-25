// @ts-check
/**
 * google_review (M-14), staff app: a card on "Visites" with the period's counts (issue #26).
 * Counts only: how many customers saw the invitation once served, and how many tapped through
 * to Google. Google itself shows the reviews and the rating.
 *
 * Imports nothing: everything comes in `api` (staff-api.js).
 */

/** @typedef {import('../../platform/admin/staff-api.js').StaffApi} StaffApi */

/**
 * @param {StaffApi} api
 * @param {Record<string, number>} counts   this module's counters for the period
 * @returns {import('../../platform/admin/staff-api.js').DashboardCard}
 */
export function dashboard(api, counts) {
  const shown = counts.shown ?? 0;
  const tap = counts.tap ?? 0;
  return {
    title: api.t('card.title'),
    tiles: [
      { label: api.t('card.shown'), value: String(shown) },
      { label: api.t('card.tap'), value: String(tap) },
      {
        label: api.t('card.rate'),
        value: shown ? `${Math.round((Math.min(tap, shown) / shown) * 100)} %` : '–',
      },
    ],
    note: api.t('card.note'),
  };
}
