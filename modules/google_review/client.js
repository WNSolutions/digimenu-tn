// @ts-check
/**
 * google_review (M-14), customer side (issue #26, US-44).
 *
 * - Once staff mark the order Served, "Ma commande" shows the same invitation to every
 *   customer: "Vous avez aimé votre passage ? Donnez votre avis sur <café> sur Google", and a
 *   button straight to the café's Google review page.
 * - A link at the bottom of the menu is always there: "Laisser un avis Google".
 * - Never tied to a rating, an amount, points or a reward (Google's rules against review
 *   gating and incentives): this code receives none of them, so it cannot depend on them.
 * - Counts only: "shown" once per order on this phone, and "tap" on the button, checked on the
 *   server against the phone's own served order.
 * - No valid link: the module registers nothing (the boot leaves it out already).
 *
 * Imports nothing: everything comes from `api` (MOD-02). The type imports are for the checker.
 */

/** @typedef {import('../../core/app/extensions.js').ModuleApi} ModuleApi */
/** @typedef {import('../../core/app/extensions.js').Block} Block */

/**
 * Google review links only: a Business Profile "ask for reviews" link (g.page/r/…/review,
 * search.google.com/local/writereview?placeid=…), a Maps place page or a Maps share link.
 * Same rule as settings.schema.json.
 */
export const REVIEW_URL =
  /^https:\/\/(g\.page|search\.google\.com|(www\.|maps\.)?google\.(com|tn)|maps\.app\.goo\.gl)\/[^\s]*$/;

/**
 * The café's review link, or null when it is missing or not a Google link.
 * @param {Record<string, unknown> | undefined} settings
 */
export function reviewUrl(settings) {
  const url = typeof settings?.reviewUrl === 'string' ? settings.reviewUrl.trim() : '';
  return url.length <= 300 && REVIEW_URL.test(url) ? url : null;
}

/** @param {ModuleApi} api */
export default function register(api) {
  const url = reviewUrl(api.settings);
  if (!url) return;

  api.contribute('footer.link', ({ lang }) => ({ label: api.texts(lang)('footer'), href: url }));

  api.contribute('orderStatus.block', ({ status, orderKey, cafe, lang }) => {
    if (status !== 'served') return null;
    const t = api.texts(lang);
    // Counted once per order on this phone, however often the sheet opens (one order is
    // followed at a time, so the last one is enough to remember).
    const id = orderKey.slice(0, 16);
    if (api.storage.get('shown') !== id) {
      api.storage.set('shown', id);
      void api.call('count', { event: 'shown', key: orderKey });
    }
    /** @type {Block[]} */
    const blocks = [
      { kind: 'title', text: t('invite.title') },
      { kind: 'text', text: t('invite.text', { cafe: api.pick(cafe, lang).text }) },
      {
        kind: 'link',
        label: t('invite.button'),
        href: url,
        look: 'prominent',
        tapped: () => void api.call('count', { event: 'tap', key: orderKey }),
      },
    ];
    return blocks;
  });
}
