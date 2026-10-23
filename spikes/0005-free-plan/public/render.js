/**
 * Menu renderer used in BOTH places, as the architecture plans (ARCHITECTURE §9):
 *   - at the edge, by the Worker, for the server-rendered page `/ssr/<café>/t/<table>`;
 *   - in the browser, by `boot.js`, for the static table page `/<café>/t/<table>`.
 *
 * It only builds a string. Every text from the database goes through `escapeHtml`, so a menu
 * item can never inject markup or script.
 */

/**
 * @typedef {'fr' | 'ar' | 'en'} Lang
 *
 * @typedef {object} MenuItem
 * @property {number} id
 * @property {string} category        category key, e.g. "boissons-chaudes"
 * @property {string} nameFr
 * @property {string} nameAr
 * @property {string} nameEn
 * @property {string} descFr
 * @property {string} descAr
 * @property {string} descEn
 * @property {number} priceMillimes   1 DT = 1000 millimes; never a float
 *
 * @typedef {object} RenderOptions
 * @property {string} cafeName
 * @property {string} table
 * @property {Lang} lang
 */

const ESCAPES = /** @type {Record<string, string>} */ ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Makes any text safe to place inside HTML text or a quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/**
 * Formats a price in millimes as Tunisian dinars, the same way in every language (D-045):
 * 4500 → "4,500 DT".
 * @param {number} millimes
 * @returns {string}
 */
export function formatPrice(millimes) {
  if (!Number.isInteger(millimes) || millimes < 0) throw new RangeError('price must be millimes');
  const dinars = Math.floor(millimes / 1000);
  const rest = String(millimes % 1000).padStart(3, '0');
  return `${dinars},${rest} DT`;
}

/** @type {Record<Lang, { title: string, table: string, dir: 'ltr' | 'rtl' }>} */
const LABELS = {
  fr: { title: 'La carte', table: 'Table', dir: 'ltr' },
  ar: { title: 'قائمة الطعام', table: 'طاولة', dir: 'rtl' },
  en: { title: 'Menu', table: 'Table', dir: 'ltr' },
};

/**
 * Picks the text of one item in the requested language, falling back to French.
 * @param {MenuItem} item
 * @param {Lang} lang
 */
function texts(item, lang) {
  if (lang === 'ar') return { name: item.nameAr || item.nameFr, desc: item.descAr || item.descFr };
  if (lang === 'en') return { name: item.nameEn || item.nameFr, desc: item.descEn || item.descFr };
  return { name: item.nameFr, desc: item.descFr };
}

/**
 * Renders the menu body (header + one section per category) as an HTML string.
 * @param {MenuItem[]} items   already sorted by category, then position
 * @param {RenderOptions} options
 * @returns {string}
 */
export function renderMenu(items, options) {
  const label = LABELS[options.lang] ?? LABELS.fr;
  /** @type {string[]} */
  const out = [];
  out.push(
    `<header class="menu-header"><h1>${escapeHtml(options.cafeName)}</h1>`,
    `<p class="menu-table">${label.table} ${escapeHtml(options.table)}</p></header>`,
    `<main class="menu" dir="${label.dir}" lang="${options.lang}">`,
    `<h2 class="visually-hidden">${label.title}</h2>`,
  );
  let current = '';
  for (const item of items) {
    if (item.category !== current) {
      if (current) out.push('</ul></section>');
      current = item.category;
      out.push(
        `<section class="menu-section" id="cat-${escapeHtml(current)}">`,
        `<h3>${escapeHtml(current)}</h3><ul class="menu-list">`,
      );
    }
    const t = texts(item, options.lang);
    out.push(
      `<li class="menu-item" data-id="${item.id}">`,
      `<div class="menu-item-text"><span class="menu-item-name">${escapeHtml(t.name)}</span>`,
      `<span class="menu-item-desc">${escapeHtml(t.desc)}</span></div>`,
      // dir="ltr" keeps "4,500 DT" in that order inside Arabic text.
      `<span class="menu-item-price" dir="ltr">${formatPrice(item.priceMillimes)}</span></li>`,
    );
  }
  if (current) out.push('</ul></section>');
  out.push('</main>');
  return out.join('');
}

/**
 * Wraps the menu body in a full HTML page (used by the server-rendered route only).
 * @param {MenuItem[]} items
 * @param {RenderOptions} options
 * @returns {string}
 */
export function renderPage(items, options) {
  const label = LABELS[options.lang] ?? LABELS.fr;
  return (
    `<!doctype html><html lang="${options.lang}" dir="${label.dir}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(options.cafeName)} · ${label.title}</title>` +
    '<link rel="stylesheet" href="/spike.css"></head><body>' +
    renderMenu(items, options) +
    '</body></html>'
  );
}
