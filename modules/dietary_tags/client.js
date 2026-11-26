// @ts-check
/**
 * dietary_tags (M-10), customer side (issue #29, US-25).
 *
 * The café ticks, per item, what applies (staff app, Carte, the item's "Régimes et allergènes";
 * stored in items.ext.dietary_tags.tags). The customer then sees, under the item's name:
 * - one label per diet (vegetarian, vegan, gluten-free, lactose-free, spicy), each with its icon;
 * - one label for the allergens it contains, with a warning icon: "Contient : lait, œufs";
 * and in the item sheet the same labels and the note "Étiquettes fournies par le café :
 * demandez au personnel en cas d'allergie." The text is always there: never an icon alone.
 *
 * Tags outside the fixed list are ignored. Icons are Lucide's (ISC licence), as path data.
 * Imports nothing: everything comes from `api` (MOD-02). The type imports are for the checker.
 */

/** @typedef {import('../../core/app/extensions.js').ModuleApi} ModuleApi */

export const DIETS = /** @type {const} */ ([
  'vegetarian',
  'vegan',
  'gluten_free',
  'lactose_free',
  'spicy',
]);

/** The 14 allergens to declare (EU list, followed by Tunisian practice), in a fixed order. */
export const ALLERGENS = /** @type {const} */ ([
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
]);

/**
 * Lucide 1.61.0 icons as path data (ISC License, Copyright (c) Lucide Icons and Contributors):
 * leaf, vegan, wheat-off, milk-off, flame, triangle-alert. Lines are written as paths.
 */
const ICONS = {
  vegetarian: [
    'M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20',
    'M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13',
  ],
  vegan: [
    'M16 8q6 0 6-6-6 0-6 6',
    'M17.41 3.59a10 10 0 1 0 3 3',
    'M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14',
  ],
  gluten_free: [
    'm2 22 10-10',
    'm16 8-1.17 1.17',
    'M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z',
    'm8 8-.53.53a3.5 3.5 0 0 0 0 4.94L9 15l1.53-1.53c.55-.55.88-1.25.98-1.97',
    'M10.91 5.26c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62',
    'M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z',
    'M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z',
    'm16 16-.53.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.49 3.49 0 0 1 1.97-.98',
    'M18.74 13.09c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28',
    'M2 2 22 22',
  ],
  lactose_free: [
    'M8 2h8',
    'M9 2v1.343M15 2v2.789a4 4 0 0 0 .672 2.219l.656.984a4 4 0 0 1 .672 2.22v1.131M7.8 7.8l-.128.192A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3',
    'M7 15a6.47 6.47 0 0 1 5 0 6.472 6.472 0 0 0 3.435.435',
    'M2 2 22 22',
  ],
  spicy: [
    'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4',
  ],
  allergens: [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    'M12 9v4',
    'M12 17h.01',
  ],
};

/**
 * The item's tags from the fixed list, in the fixed order.
 * @param {unknown} ext   items.ext.dietary_tags
 */
export function tagsOf(ext) {
  const raw = /** @type {any} */ (ext)?.tags;
  const tags = new Set(Array.isArray(raw) ? raw : []);
  return {
    diets: DIETS.filter((d) => tags.has(d)),
    allergens: ALLERGENS.filter((a) => tags.has(a)),
  };
}

/** @param {ModuleApi} api */
export default function register(api) {
  /** @param {unknown} ext @param {import('../../core/i18n.js').Lang} lang */
  const labels = (ext, lang) => {
    const t = api.texts(lang);
    const { diets, allergens } = tagsOf(ext);
    const out = diets.map((d) => ({ text: t(`diet.${d}`), icon: { paths: ICONS[d] } }));
    if (allergens.length)
      out.push({
        text: t('contains', {
          list: allergens.map((a) => t(`allergen.${a}`)).join(t('separator')),
        }),
        icon: { paths: ICONS.allergens },
      });
    return out;
  };

  api.contribute('menu.itemBadge', ({ ext, lang }) => labels(ext, lang));

  // In the sheet: the note, whenever the item carries any tag.
  api.contribute('menu.itemDetail', ({ ext, lang }) => {
    const { diets, allergens } = tagsOf(ext);
    return diets.length || allergens.length
      ? [{ kind: 'text', tone: 'muted', text: api.texts(lang)('note') }]
      : null;
  });
}
