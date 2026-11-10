// @ts-check
/**
 * Extension points of the customer page (docs/architecture/modules.md, "Extension points").
 *
 * A module's `client.js` exports one function, `register(api)`. It imports nothing: everything
 * it may use comes in `api` (MOD-02). Modules only ADD: a contribution describes what to show,
 * and the core draws it, so a module never touches the page itself.
 *
 * A module that throws is switched off for this page view and the page keeps working
 * (customer-side contributions fail open; the server's `order.validate` is the one that fails
 * closed).
 *
 * Points built so far: `list.action` (a way to send the order from "Ma liste").
 */
import { translator, pick } from '../i18n.js';
import { formatPrice } from '../money.js';

/** @typedef {import('../i18n.js').Lang} Lang */
/** @typedef {import('../i18n.js').LocalizedText} LocalizedText */

export const CLIENT_POINTS = /** @type {const} */ (['list.action']);
/** @typedef {typeof CLIENT_POINTS[number]} ClientPoint */

/**
 * What a `list.action` contribution receives.
 * @typedef {object} ListActionContext
 * @property {ReturnType<typeof import('../list.js').checkList>} checked  lines checked against the menu
 * @property {string} note   the note for the whole order
 * @property {{ slug: string, name: LocalizedText, languages: { enabled: Lang[], default: Lang } }} cafe
 * @property {{ label: string, valid: boolean } | null} table
 * @property {Lang} lang     the customer's page language
 * @property {Date} now
 */

/**
 * What a `list.action` contribution returns: a link the core draws as the list's main button.
 * @typedef {object} ListAction
 * @property {'link'} kind
 * @property {string} href     https only
 * @property {string} label
 * @property {string} [icon]   a name from core/ui/icons.js
 * @property {string} [note]   one short line above the button
 * @property {string} [after]  shown once the customer has tapped the button
 */

/**
 * What a module receives in `register(api)`.
 * @typedef {object} ModuleApi
 * @property {string} key
 * @property {Record<string, unknown>} settings   the café's validated settings for this module
 * @property {(lang: Lang) => (key: string, vars?: Record<string, string | number>) => string} texts
 *   the module's own texts in a language (French fallback)
 * @property {(text: LocalizedText | undefined, lang: Lang) => { text: string, lang: Lang }} pick
 * @property {(millimes: number) => string} price
 * @property {(point: 'list.action', fn: (c: ListActionContext) => ListAction | null) => void} contribute
 */

/**
 * A module as the boot answer lists it: only modules switched on for this café (MOD-03).
 * @typedef {object} BootModule
 * @property {string} key
 * @property {string} [entry]   URL of the module's client.js in this release
 * @property {Record<string, unknown>} [settings]
 * @property {Partial<Record<Lang, Record<string, string>>>} [texts]
 */

/** @typedef {(api: ModuleApi) => void} RegisterFn */

/**
 * Collects the contributions of the enabled modules.
 * @param {(message: string, err: unknown) => void} [report]  where module errors go
 */
export function createRegistry(report = (message, err) => console.error(message, err)) {
  /** @type {{ key: string, fn: (c: ListActionContext) => ListAction | null }[]} */
  const listActions = [];

  return {
    /**
     * Runs a module's `register` with its API. A module that throws adds nothing.
     * @param {BootModule} mod
     * @param {RegisterFn} register
     */
    add(mod, register) {
      const texts = mod.texts ?? {};
      /** @type {typeof listActions} */
      const mine = [];
      /** @type {ModuleApi} */
      const api = {
        key: mod.key,
        settings: Object.freeze({ ...(mod.settings ?? {}) }),
        texts: (lang) => translator(texts[lang] ?? {}, texts.fr ?? {}),
        pick,
        price: formatPrice,
        contribute(point, fn) {
          if (point !== 'list.action') throw new Error(`unknown extension point: ${point}`);
          mine.push({ key: mod.key, fn });
        },
      };
      try {
        register(api);
        listActions.push(...mine);
      } catch (err) {
        report(`module ${mod.key} failed to register`, err);
      }
    },

    /**
     * The list actions for this moment. Invalid or failing contributions are left out.
     * @param {ListActionContext} context
     * @returns {(ListAction & { key: string })[]}
     */
    listActions(context) {
      /** @type {(ListAction & { key: string })[]} */
      const out = [];
      for (const { key, fn } of listActions) {
        try {
          const action = fn(context);
          if (action && isSafeAction(action)) out.push({ ...action, key });
        } catch (err) {
          report(`module ${key}: list.action failed`, err);
        }
      }
      return out;
    },
  };
}

/** @typedef {ReturnType<typeof createRegistry>} Registry */

/**
 * Only https links with a text label are drawn.
 * @param {ListAction} action
 */
function isSafeAction(action) {
  return (
    action.kind === 'link' &&
    typeof action.label === 'string' &&
    action.label.trim() !== '' &&
    typeof action.href === 'string' &&
    /^https:\/\/[^\s]+$/.test(action.href)
  );
}
