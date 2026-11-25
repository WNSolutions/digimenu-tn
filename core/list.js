// @ts-check
/**
 * "My list": what the customer is choosing, kept on the phone only (US-08, US-09, C-05).
 *
 * - One list per café, saved under `dm:<café>:list`, with a format version `v` and the time it
 *   was saved. It survives a reload, a closed tab or a lost connection for 6 hours (setting),
 *   then it is cleared. An unknown or older format is migrated, or cleared without an error.
 * - A line is one variant with one note: the same item with another note is another line
 *   (D-045, D-046). The list also has one note for the whole order. Notes: 200 characters.
 * - Totals use integer millimes and the CURRENT menu snapshot: a line whose price changed shows
 *   the new price; a sold-out or removed line is flagged and left out of the total.
 *
 * Everything here is pure (no DOM, no storage) except `loadList`/`saveList`, which take the
 * storage as a parameter so tests can pass a fake.
 */
import { lineTotal, sum } from './money.js';
import { isOrderable } from './menu/snapshot.js';

export const LIST_FORMAT = 1;
export const NOTE_MAX = 200;
export const DEFAULT_MAX_QTY = 20;
export const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * @typedef {object} Line
 * @property {string} itemId
 * @property {string} variantId
 * @property {number} qty
 * @property {string} note
 * @property {number} price   unit price in millimes when the line was added (to spot changes)
 *
 * @typedef {{ v: number, lines: Line[], note: string }} List
 */

/** @returns {List} */
export function emptyList() {
  return { v: LIST_FORMAT, lines: [], note: '' };
}

/**
 * Trims a note and cuts it to the limit (counted in characters, not bytes).
 * @param {string} note
 */
export function cleanNote(note) {
  return Array.from(String(note ?? '').trim())
    .slice(0, NOTE_MAX)
    .join('');
}

/**
 * The identity of a line: variant + note.
 * @param {{ variantId: string, note: string }} line
 */
export function lineKey(line) {
  return `${line.variantId}\u0000${line.note}`;
}

/**
 * Adds `qty` of a variant (with an optional note). Returns a new list; the quantity of a line
 * never goes above `maxQty`.
 * @param {List} list
 * @param {{ itemId: string, variantId: string, price: number }} what
 * @param {number} [qty]
 * @param {string} [note]
 * @param {number} [maxQty]
 * @returns {List}
 */
export function addToList(list, what, qty = 1, note = '', maxQty = DEFAULT_MAX_QTY) {
  const clean = cleanNote(note);
  const key = lineKey({ variantId: what.variantId, note: clean });
  const lines = list.lines.slice();
  const at = lines.findIndex((l) => lineKey(l) === key);
  if (at >= 0) {
    lines[at] = { ...lines[at], qty: Math.min(maxQty, lines[at].qty + qty), price: what.price };
  } else {
    lines.push({
      itemId: what.itemId,
      variantId: what.variantId,
      qty: Math.min(maxQty, qty),
      note: clean,
      price: what.price,
    });
  }
  return { ...list, lines };
}

/**
 * Sets the quantity of a line; 0 removes it.
 * @param {List} list
 * @param {string} key   from lineKey()
 * @param {number} qty
 * @param {number} [maxQty]
 * @returns {List}
 */
export function setQty(list, key, qty, maxQty = DEFAULT_MAX_QTY) {
  const q = Math.max(0, Math.min(maxQty, Math.floor(qty)));
  const lines = list.lines
    .map((l) => (lineKey(l) === key ? { ...l, qty: q } : l))
    .filter((l) => l.qty > 0);
  return { ...list, lines };
}

/**
 * @param {List} list
 * @param {string} note
 * @returns {List}
 */
export function setListNote(list, note) {
  return { ...list, note: cleanNote(note) };
}

/**
 * How many of a variant are in the list, all notes together (for "2 in your list").
 * @param {List} list
 * @param {string} variantId
 */
export function countOf(list, variantId) {
  return list.lines.reduce((n, l) => (l.variantId === variantId ? n + l.qty : n), 0);
}

/**
 * How many of an item are in the list, all variants and notes together.
 * @param {List} list
 * @param {string} itemId
 */
export function countOfItem(list, itemId) {
  return list.lines.reduce((n, l) => (l.itemId === itemId ? n + l.qty : n), 0);
}

/**
 * @typedef {'ok' | 'price_changed' | 'unavailable' | 'gone'} LineStatus
 * @typedef {{ line: Line, key: string, status: LineStatus,
 *   entry?: import('./menu/snapshot.js').Entry, unitPrice: number, total: number }} CheckedLine
 */

/**
 * Re-checks every line against the current menu (US-09).
 * - `gone`: the variant is no longer on the menu. `unavailable`: it is sold out.
 *   Both are left out of the total and flagged.
 * - `price_changed`: still orderable, at the new price (shown, and used in the total).
 * @param {List} list
 * @param {Map<string, import('./menu/snapshot.js').Entry>} index   from indexSnapshot()
 * @returns {{ lines: CheckedLine[], count: number, total: number, flagged: number }}
 */
export function checkList(list, index) {
  /** @type {CheckedLine[]} */
  const lines = list.lines.map((line) => {
    const entry = index.get(line.variantId);
    const key = lineKey(line);
    if (!entry || entry.item.id !== line.itemId) {
      return {
        line,
        key,
        status: /** @type {LineStatus} */ ('gone'),
        unitPrice: line.price,
        total: 0,
      };
    }
    const unitPrice = entry.variant.price;
    if (!isOrderable(entry))
      return { line, key, entry, status: 'unavailable', unitPrice, total: 0 };
    const status = unitPrice === line.price ? 'ok' : 'price_changed';
    return { line, key, entry, status, unitPrice, total: lineTotal(unitPrice, line.qty) };
  });
  const counted = lines.filter((l) => l.status === 'ok' || l.status === 'price_changed');
  return {
    lines,
    count: counted.reduce((n, l) => n + l.line.qty, 0),
    total: sum(counted.map((l) => l.total)),
    flagged:
      lines.length - counted.length + lines.filter((l) => l.status === 'price_changed').length,
  };
}

/**
 * The storage key of a café's list.
 * @param {string} cafe  slug
 */
export function listStorageKey(cafe) {
  return `dm:${cafe}:list`;
}

/**
 * @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void,
 *   removeItem(key: string): void }} StorageLike
 */

/**
 * Reads the saved list of a café. Anything unreadable, too old or in an unknown format gives an
 * empty list (and is removed): the customer never sees an error for it.
 * @param {StorageLike | null | undefined} storage
 * @param {string} cafe
 * @param {number} now          Date.now()
 * @param {number} [maxAgeMs]
 * @returns {List}
 */
export function loadList(storage, cafe, now, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!storage) return emptyList();
  const key = listStorageKey(cafe);
  try {
    const raw = storage.getItem(key);
    if (!raw) return emptyList();
    const saved = JSON.parse(raw);
    const migrated = migrateList(saved);
    if (!migrated || typeof saved.savedAt !== 'number' || now - saved.savedAt > maxAgeMs) {
      storage.removeItem(key);
      return emptyList();
    }
    return migrated;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clean */
    }
    return emptyList();
  }
}

/**
 * Brings a saved list to the current format, or returns null if it cannot be read.
 * Format history: 1 = first format (Sprint 1).
 * @param {any} saved
 * @returns {List | null}
 */
export function migrateList(saved) {
  if (!saved || saved.v !== LIST_FORMAT || !Array.isArray(saved.lines)) return null;
  /** @type {Line[]} */
  const lines = [];
  for (const l of saved.lines) {
    if (
      typeof l?.itemId === 'string' &&
      typeof l.variantId === 'string' &&
      Number.isInteger(l.qty) &&
      l.qty > 0 &&
      Number.isSafeInteger(l.price)
    ) {
      lines.push({
        itemId: l.itemId,
        variantId: l.variantId,
        qty: l.qty,
        note: cleanNote(l.note ?? ''),
        price: l.price,
      });
    }
  }
  return { v: LIST_FORMAT, lines, note: cleanNote(saved.note ?? '') };
}

/**
 * Saves the list (or removes it when empty). Storage errors (private mode, full) are ignored:
 * the list still works for this visit.
 * @param {StorageLike | null | undefined} storage
 * @param {string} cafe
 * @param {List} list
 * @param {number} now
 */
export function saveList(storage, cafe, list, now) {
  if (!storage) return;
  try {
    const key = listStorageKey(cafe);
    if (list.lines.length === 0 && list.note === '') storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ ...list, savedAt: now }));
  } catch {
    /* storage unavailable: keep the list in memory only */
  }
}
