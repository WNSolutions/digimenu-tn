// @ts-check
/**
 * google_review (M-14), server side: counts only (issue #26).
 *
 *   POST /api/m/google_review/count { cafe, event: "shown" | "tap", key }
 *
 * Adds one to the café's counter `google_review.shown` or `google_review.tap` for this hour.
 * The phone sends its own key for the order; the count is kept only if that order is at this
 * café and served (and not a test order), so a script cannot fill the counters without served
 * orders. Nothing about the customer or the order is stored: no number, no key, no amount.
 *
 * Imports nothing from the platform: everything comes in `api` (module-host.js).
 */

/** @typedef {import('../../platform/shell/src/module-host.js').ServerApi} ServerApi */
/** @typedef {import('../../platform/shell/src/module-host.js').RouteAnswer} RouteAnswer */

export const EVENTS = ['shown', 'tap'];

export const routes = {
  /**
   * @param {ServerApi} api
   * @param {any} body
   * @returns {Promise<RouteAnswer>}
   */
  async count(api, body) {
    const event = String(body?.event ?? '');
    if (!EVENTS.includes(event)) return { status: 400, body: { error: 'bad_event' } };
    const order = await api.orderStatus(String(body?.key ?? ''));
    if (!order) return { status: 404, body: { error: 'unknown_order' } };
    if (order.status !== 'served') return { status: 409, body: { error: 'not_served' } };
    // Test orders (the team trying a live café) are not the café's customers.
    if (order.test) return { status: 200, body: { ok: true, counted: false } };
    await api.count(event);
    return { status: 200, body: { ok: true, counted: true } };
  },
};
