// @ts-check
/**
 * "Ma commande", the part that stays in the core (issue #26): the phone's last order at a café,
 * kept on this phone for 3 hours, and when to check its status. The chip and the sheet are in
 * order-track.js, loaded only once the phone has an order to follow.
 *
 * At most 3 automatic checks per order (architecture overview, Tech Lead review A4), at 4, 12
 * and 25 minutes after sending; after that the customer refreshes.
 */

const MIN = 60_000;
export const KEEP_MS = 180 * MIN;
/** The automatic checks, in minutes after the order was sent (at most 3, A4). */
export const AUTO_AT = [4, 12, 25];
/** Statuses after which nothing changes any more ("unconfirmed" can still be accepted). */
export const FINAL = ['served', 'rejected', 'cancelled'];
export const KNOWN = ['received', 'handoff', 'accepted', 'ready', 'unconfirmed', ...FINAL];

/**
 * @typedef {object} Tracked
 * @property {string} key       the order's client key
 * @property {string} number    number of the day
 * @property {number} at        when it was sent (ms)
 * @property {string} status
 * @property {number} [checked] when its status was last asked (ms)
 */

/** @param {string} cafe */
const storeKey = (cafe) => `dm:${cafe}:order`;

/**
 * The order this phone sent last at this café, if recent.
 * @param {Storage | null} storage
 * @param {string} cafe
 * @param {number} now
 * @returns {Tracked | null}
 */
export function loadTracked(storage, cafe, now) {
  try {
    const t = JSON.parse(storage?.getItem(storeKey(cafe)) ?? 'null');
    if (
      !t ||
      typeof t.key !== 'string' ||
      typeof t.number !== 'string' ||
      typeof t.at !== 'number' ||
      now - t.at > KEEP_MS ||
      now < t.at
    )
      return null;
    return {
      key: t.key,
      number: t.number,
      at: t.at,
      status: KNOWN.includes(t.status) ? t.status : 'received',
      ...(typeof t.checked === 'number' && t.checked >= t.at ? { checked: t.checked } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null} storage
 * @param {string} cafe
 * @param {Tracked | null} t   null forgets it
 */
export function saveTracked(storage, cafe, t) {
  try {
    if (t) storage?.setItem(storeKey(cafe), JSON.stringify(t));
    else storage?.removeItem(storeKey(cafe));
  } catch {
    /* storage blocked: followed for this visit only */
  }
}

/**
 * The next automatic check, in ms from now, or null when none is left. A check is due at
 * each point of AUTO_AT that comes after the last check, so reloading the page never adds one.
 * @param {Tracked} t
 * @param {number} now
 */
export function nextCheck(t, now) {
  const since = Math.max(t.checked ?? t.at, t.at);
  const due = AUTO_AT.map((m) => t.at + m * MIN).find((when) => when > since);
  return due === undefined ? null : Math.max(0, due - now);
}
