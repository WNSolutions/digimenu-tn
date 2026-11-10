// @ts-check
/**
 * Shared state of the customer page and the small helpers every view uses.
 */
import fr from '../i18n/fr.json' with { type: 'json' };
import ar from '../i18n/ar.json' with { type: 'json' };
import en from '../i18n/en.json' with { type: 'json' };
import { translator, pick, dirOf } from '../i18n.js';
import { formatPrice } from '../money.js';

/** @typedef {import('../i18n.js').Lang} Lang */
/** @typedef {import('../i18n.js').LocalizedText} LocalizedText */
/** @typedef {import('../menu/snapshot.js').Snapshot} Snapshot */
/** @typedef {import('../list.js').List} List */

/** @type {Record<Lang, import('../i18n.js').Texts>} */
export const TEXTS = { fr, ar, en };

/**
 * What `/api/boot` returns (format 1). The platform shell builds it from the café's active
 * configuration, its table and its published menu snapshot.
 *
 * @typedef {object} Boot
 * @property {number} v
 * @property {{ slug: string, name: LocalizedText, logo?: string,
 *   languages: { enabled: Lang[], default: Lang },
 *   hours?: import('../hours.js').Hours, timeZone?: string,
 *   info?: { address?: LocalizedText },
 *   unavailable: 'grey' | 'hide', maxQtyPerLine: number, listMaxAgeHours?: number,
 *   accent?: Record<string, string> }} cafe
 * @property {{ label: string, valid: boolean } | null} table
 * @property {Snapshot} menu
 * @property {{ savedAt: number } | null} [offline]   set by the boot page when this is the saved copy
 * @property {import('./extensions.js').BootModule[]} [modules]   only the modules switched on (MOD-03)
 */

/**
 * @typedef {object} Ctx
 * @property {Boot} boot
 * @property {Lang} lang
 * @property {List} list
 * @property {Map<string, import('../menu/snapshot.js').Entry>} index
 * @property {(key: string, vars?: Record<string, string | number>) => string} t
 * @property {(text: LocalizedText | undefined) => { text: string, lang: Lang }} pick
 * @property {(millimes: number) => string} price
 * @property {'ltr' | 'rtl'} dir
 * @property {(list: List) => void} setList
 * @property {(lang: Lang) => void} setLang
 * @property {(message: string) => void} announce
 * @property {() => Date} now
 * @property {() => ReturnType<typeof import('../list.js').checkList>} check   the list checked against the menu (cached)
 * @property {import('./extensions.js').Registry} ext   contributions of the enabled modules
 * @property {Promise<void>} ready   resolves once the enabled modules are registered
 */

/**
 * Builds the language-dependent parts of a context.
 * @param {Lang} lang
 */
export function langParts(lang) {
  return {
    lang,
    dir: dirOf(lang),
    t: translator(TEXTS[lang], TEXTS.fr),
    /** @param {LocalizedText | undefined} text */
    pick: (text) => pick(text, lang),
    price: formatPrice,
  };
}
