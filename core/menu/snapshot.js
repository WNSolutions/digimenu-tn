// @ts-check
/**
 * Menu snapshot: the published, read-only copy of a café's menu that customers load
 * (data model: `menu_snapshots`). The café's pinned release builds it from the menu tree each
 * time the menu changes; the server re-checks every order against it, so the phone and the
 * server always use the same names, prices and availability.
 *
 * Format v1 (`schemaVersion: 1`):
 *
 *   { schemaVersion, rev, categories: [{ id, title, subtitle?,
 *       groups: [{ id, title?, description?,
 *         items: [{ id, name, description?, available,
 *           variants: [{ id, name?, price, available }] }] }] }] }
 *
 * - Texts are `LocalizedText` ({ fr, ar?, en? }); French is required.
 * - Prices are integer millimes. Every item has at least one variant; a single-price item has
 *   one unnamed variant, so there is only one price path (data model, "Variants").
 * - Order is the owner's order (`sort`), already applied: renderers keep array order.
 * - Hidden categories are left out. Sold-out entries stay in, with `available: false`: the
 *   café setting `menu.unavailable` ("grey" or "hide") decides how they show.
 */
import { assertMillimes } from '../money.js';

export const SNAPSHOT_SCHEMA = 1;

/** @typedef {import('../i18n.js').LocalizedText} LocalizedText */

/**
 * @typedef {object} SourceVariant
 * @property {string} id
 * @property {number} [sort]
 * @property {LocalizedText} [name]
 * @property {number} price      millimes
 * @property {boolean} [available]
 *
 * @typedef {object} SourceItem
 * @property {string} id
 * @property {number} [sort]
 * @property {LocalizedText} name
 * @property {LocalizedText} [description]
 * @property {boolean} [available]
 * @property {SourceVariant[]} variants
 *
 * @typedef {object} SourceGroup
 * @property {string} id
 * @property {number} [sort]
 * @property {LocalizedText} [title]
 * @property {LocalizedText} [description]
 * @property {SourceItem[]} items
 *
 * @typedef {object} SourceCategory
 * @property {string} id
 * @property {number} [sort]
 * @property {LocalizedText} title
 * @property {LocalizedText} [subtitle]
 * @property {boolean} [visible]
 * @property {SourceGroup[]} groups
 *
 * @typedef {{ categories: SourceCategory[] }} MenuSource
 */

/**
 * @typedef {{ id: string, name?: LocalizedText, price: number, available: boolean }} Variant
 * @typedef {{ id: string, name: LocalizedText, description?: LocalizedText, available: boolean,
 *   variants: Variant[] }} Item
 * @typedef {{ id: string, title?: LocalizedText, description?: LocalizedText, items: Item[] }} Group
 * @typedef {{ id: string, title: LocalizedText, subtitle?: LocalizedText, groups: Group[] }} Category
 * @typedef {{ schemaVersion: number, rev: number, categories: Category[] }} Snapshot
 */

/**
 * @template {{ sort?: number }} T
 * @param {T[]} list
 * @returns {T[]}
 */
function bySort(list) {
  return list
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (a.value.sort ?? a.index) - (b.value.sort ?? b.index) || a.index - b.index)
    .map(({ value }) => value);
}

/**
 * @param {LocalizedText | undefined} text
 * @returns {LocalizedText | undefined}
 */
function cleanText(text) {
  if (!text) return undefined;
  /** @type {LocalizedText} */
  const out = { fr: String(text.fr ?? '').trim() };
  for (const lang of /** @type {const} */ (['ar', 'en'])) {
    const value = text[lang];
    if (typeof value === 'string' && value.trim() !== '') out[lang] = value.trim();
  }
  return out.fr === '' && !out.ar && !out.en ? undefined : out;
}

/**
 * Builds a snapshot from the menu tree and lists every problem found. Problems never stop the
 * build of the valid parts; a caller that must publish only a clean menu checks `problems`.
 * @param {MenuSource} source
 * @param {number} rev  menu revision this snapshot publishes
 * @returns {{ snapshot: Snapshot, problems: string[] }}
 */
export function buildSnapshot(source, rev) {
  /** @type {string[]} */
  const problems = [];
  const ids = new Set();
  /** @param {string} id @param {string} where */
  const claim = (id, where) => {
    if (typeof id !== 'string' || id === '') problems.push(`${where}: missing id`);
    else if (ids.has(id)) problems.push(`${where}: id "${id}" is used twice`);
    ids.add(id);
  };

  /** @type {Category[]} */
  const categories = [];
  for (const cat of bySort(source.categories ?? [])) {
    claim(cat.id, `category ${cat.id}`);
    if (cat.visible === false) continue;
    const title = cleanText(cat.title);
    if (!title?.fr) {
      problems.push(`category ${cat.id}: French title is missing`);
      continue;
    }
    /** @type {Group[]} */
    const groups = [];
    for (const group of bySort(cat.groups ?? [])) {
      claim(group.id, `group ${group.id}`);
      /** @type {Item[]} */
      const items = [];
      for (const item of bySort(group.items ?? [])) {
        claim(item.id, `item ${item.id}`);
        const name = cleanText(item.name);
        if (!name?.fr) {
          problems.push(`item ${item.id}: French name is missing`);
          continue;
        }
        /** @type {Variant[]} */
        const variants = [];
        for (const v of bySort(item.variants ?? [])) {
          claim(v.id, `variant ${v.id}`);
          try {
            assertMillimes(v.price, `variant ${v.id} price`);
            if (v.price < 0) throw new RangeError(`variant ${v.id} price is negative`);
          } catch (err) {
            problems.push(/** @type {Error} */ (err).message);
            continue;
          }
          const vName = cleanText(v.name);
          variants.push({
            id: v.id,
            ...(vName ? { name: vName } : {}),
            price: v.price,
            available: v.available !== false,
          });
        }
        if (variants.length === 0) {
          problems.push(`item ${item.id}: no valid price`);
          continue;
        }
        const description = cleanText(item.description);
        items.push({
          id: item.id,
          name,
          ...(description ? { description } : {}),
          available: item.available !== false,
          variants,
        });
      }
      if (items.length === 0) continue;
      const gTitle = cleanText(group.title);
      const gDesc = cleanText(group.description);
      groups.push({
        id: group.id,
        ...(gTitle ? { title: gTitle } : {}),
        ...(gDesc ? { description: gDesc } : {}),
        items,
      });
    }
    if (groups.length === 0) continue;
    const subtitle = cleanText(cat.subtitle);
    categories.push({ id: cat.id, title, ...(subtitle ? { subtitle } : {}), groups });
  }
  return { snapshot: { schemaVersion: SNAPSHOT_SCHEMA, rev, categories }, problems };
}

/**
 * @typedef {{ category: Category, item: Item, variant: Variant }} Entry
 */

/**
 * Index of a snapshot by variant id, for re-checking a saved list or an order.
 * @param {Snapshot} snapshot
 * @returns {Map<string, Entry>}
 */
export function indexSnapshot(snapshot) {
  /** @type {Map<string, Entry>} */
  const index = new Map();
  for (const category of snapshot.categories) {
    for (const group of category.groups) {
      for (const item of group.items) {
        for (const variant of item.variants) index.set(variant.id, { category, item, variant });
      }
    }
  }
  return index;
}

/**
 * Whether a variant can be ordered right now: both the item and the variant are available.
 * @param {Entry} entry
 */
export function isOrderable(entry) {
  return entry.item.available && entry.variant.available;
}
