// @ts-check
/**
 * Money in DigiMenu: integer **millimes** from end to end (data model, "Money").
 *
 * 1 DT = 1,000 millimes. `4500` means 4,500 DT. Prices are converted to millimes once, when they
 * are typed or imported, and never parsed again. Totals add whole numbers, so 3 × 1,350 DT is
 * exactly 4,050 DT, with no rounding drift. The same functions run on the phone, at the edge and
 * in the tools, so the customer and the server always agree on a total.
 *
 * Display (docs/design/foundations.md §4.4): the same in French, Arabic and English: Western
 * digits, a comma before exactly 3 millime digits, a narrow no-break space between thousands and
 * a no-break space before "DT": `4,500 DT`, `1 250,000 DT`.
 */

/** Narrow no-break space (thousands separator). */
const THIN = '\u202f';
/** No-break space (before the unit). */
const NBSP = '\u00a0';

/** Largest price we accept for one variant: 9 999,999 DT. Anything above is a typing mistake. */
export const MAX_PRICE = 9_999_999;

/**
 * Throws unless `value` is a whole number of millimes that can be added safely.
 * @param {number} value
 * @param {string} [what]
 */
export function assertMillimes(value, what = 'amount') {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${what} must be a whole number of millimes, got ${value}`);
  }
}

/**
 * Formats millimes for display: `4500` → `4,500 DT`, `1250000` → `1 250,000 DT`, `-500` → `-0,500 DT`.
 * @param {number} millimes
 * @returns {string}
 */
export function formatPrice(millimes) {
  assertMillimes(millimes);
  const sign = millimes < 0 ? '-' : '';
  const abs = Math.abs(millimes);
  const dinars = String(Math.floor(abs / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const rest = String(abs % 1000).padStart(3, '0');
  return `${sign}${dinars},${rest}${NBSP}DT`;
}

/**
 * Price of a quantity: `lineTotal(1350, 3)` → `4050`.
 * @param {number} unitPrice  millimes
 * @param {number} qty        whole number ≥ 0
 */
export function lineTotal(unitPrice, qty) {
  assertMillimes(unitPrice, 'unit price');
  if (!Number.isInteger(qty) || qty < 0) throw new TypeError(`quantity must be a whole number ≥ 0`);
  const total = unitPrice * qty;
  assertMillimes(total, 'line total');
  return total;
}

/**
 * Sum of amounts in millimes.
 * @param {Iterable<number>} amounts
 */
export function sum(amounts) {
  let total = 0;
  for (const a of amounts) {
    assertMillimes(a);
    total += a;
  }
  assertMillimes(total, 'total');
  return total;
}

/**
 * @typedef {{ ok: true, millimes: number }
 *   | { ok: false, reason: 'empty' | 'invalid' | 'too_many_decimals' | 'too_large' | 'negative' }
 *   | { ok: false, reason: 'ambiguous', choices: [number, number] }} ParsedPrice
 */

/**
 * Reads a price typed by a person (editor) or written in the import spreadsheet.
 *
 * - `4,5` · `4.5` · `4,500` · `4.500` → 4500 (4,500 DT); `12` → 12000; `0,5` → 500.
 * - A comma or a dot is the decimal separator; at most 3 decimals.
 * - **A whole number of 100 or more without a separator is ambiguous** (D-045): `4500` could be
 *   4,500 DT or 4 500,000 DT, so the caller must ask. The result lists both choices.
 * - Spaces (also no-break) are ignored, and a trailing "DT" or "dt" is allowed: `4,500 DT`.
 * - Anything else ("4,5dt" glued, letters, two separators, 4 decimals) is refused.
 *
 * @param {string} text
 * @returns {ParsedPrice}
 */
export function parsePrice(text) {
  const raw = String(text ?? '')
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .trim();
  if (raw === '') return { ok: false, reason: 'empty' };
  if (raw.startsWith('-')) return { ok: false, reason: 'negative' };
  // The unit may follow after a space ("4,500 DT"), never glued ("4,5dt" is refused).
  const body = raw.replace(/ (dt|DT|Dt)$/, '').replace(/ /g, '');
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(body);
  if (!m) return { ok: false, reason: 'invalid' };
  const [, whole, decimals] = m;
  if (decimals !== undefined && decimals.length > 3)
    return { ok: false, reason: 'too_many_decimals' };
  const dinars = Number(whole);
  if (decimals === undefined && dinars >= 100) {
    const asMillimes = dinars;
    const asDinars = dinars * 1000;
    if (asDinars > MAX_PRICE) {
      return asMillimes > MAX_PRICE
        ? { ok: false, reason: 'too_large' }
        : { ok: true, millimes: asMillimes };
    }
    return { ok: false, reason: 'ambiguous', choices: [asMillimes, asDinars] };
  }
  const millimes = dinars * 1000 + Number((decimals ?? '').padEnd(3, '0'));
  if (millimes > MAX_PRICE) return { ok: false, reason: 'too_large' };
  return { ok: true, millimes };
}
