// @ts-check
/**
 * Language engine of the core (US-05, C-04, NFR-07, NFR-21).
 *
 * - Interface texts come from `core/i18n/<lang>.json` (same keys in every file; CI checks it).
 * - Menu content is `LocalizedText`: `{ fr, ar?, en? }`. French is required and is the fallback,
 *   so a missing translation shows the French text, never a blank.
 * - Arabic is right-to-left. Prices, numbers and Latin names keep their own order inside `<bdi>`
 *   (that is done by the renderer).
 */

/** @typedef {'fr' | 'ar' | 'en'} Lang */
/** @typedef {{ fr: string, ar?: string, en?: string }} LocalizedText */
/** @typedef {Record<string, string>} Texts */

/** Languages the core knows, in the order the language menu lists them. */
export const LANGS = /** @type {const} */ (['fr', 'ar', 'en']);

/**
 * @param {unknown} value
 * @returns {value is Lang}
 */
export function isLang(value) {
  return value === 'fr' || value === 'ar' || value === 'en';
}

/**
 * Writing direction of a language.
 * @param {Lang} lang
 * @returns {'rtl' | 'ltr'}
 */
export function dirOf(lang) {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Replaces `{name}` placeholders. Unknown placeholders stay visible, so a mistake is noticed.
 * @param {string} template
 * @param {Record<string, string | number>} [vars]
 */
export function fill(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * Makes the `t(key, vars)` function for one language. A key missing in that language falls back
 * to French; a key missing everywhere returns the key itself (visible in review, never blank).
 * @param {Texts} texts      texts of the chosen language
 * @param {Texts} [fallback] French texts
 */
export function translator(texts, fallback = texts) {
  /**
   * @param {string} key
   * @param {Record<string, string | number>} [vars]
   */
  return function t(key, vars) {
    const template = texts[key] ?? fallback[key] ?? key;
    return fill(template, vars);
  };
}

/**
 * Picks the text of a menu entry in a language, with the French fallback.
 * Returns the language actually used, so the renderer can mark a French description shown on
 * an Arabic page with `lang="fr" dir="ltr"`.
 * @param {LocalizedText | undefined} text
 * @param {Lang} lang
 * @returns {{ text: string, lang: Lang }}
 */
export function pick(text, lang) {
  if (!text) return { text: '', lang };
  const wanted = text[lang];
  if (typeof wanted === 'string' && wanted.trim() !== '') return { text: wanted, lang };
  return { text: text.fr ?? '', lang: 'fr' };
}

/**
 * Chooses the language for this visit (US-05):
 * 1. the language this phone chose before for this café, if the café still offers it;
 * 2. otherwise the first of the phone's languages that the café offers;
 * 3. otherwise the café's default language.
 * @param {{ enabled: Lang[], default: Lang }} cafe
 * @param {string | null | undefined} saved
 * @param {readonly string[]} [phoneLanguages]  e.g. navigator.languages: ["ar-TN", "fr"]
 * @returns {Lang}
 */
export function chooseLanguage(cafe, saved, phoneLanguages = []) {
  if (isLang(saved) && cafe.enabled.includes(saved)) return saved;
  for (const tag of phoneLanguages) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (isLang(primary) && cafe.enabled.includes(primary)) return primary;
  }
  return cafe.enabled.includes(cafe.default) ? cafe.default : 'fr';
}

/**
 * Lists the menu entries that have no text in a language (the maintainer report, US-05).
 * @param {Iterable<{ where: string, text: LocalizedText | undefined }>} entries
 * @param {Lang[]} langs  the café's enabled languages
 * @returns {{ where: string, lang: Lang }[]}
 */
export function missingTranslations(entries, langs) {
  /** @type {{ where: string, lang: Lang }[]} */
  const missing = [];
  for (const { where, text } of entries) {
    if (!text) continue;
    for (const lang of langs) {
      const value = text[lang];
      if (typeof value !== 'string' || value.trim() === '') missing.push({ where, lang });
    }
  }
  return missing;
}
