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
 * Points built so far:
 *   list.action      a way to send the order from "Ma liste"
 *   header.action    a button in the top bar that opens one of the module's sheet pages
 *   sheet.page       a sheet the core draws from blocks; may have its own link (/<café>/<path>)
 *   checkout.fields  a consent choice or an information line in checkout, and data to send
 *   postOrder.block  blocks under the order number once the order is stored
 *   orderStatus.block blocks on "Ma commande" for the status staff last set (#26)
 *   footer.link      one link in the menu's footer, e.g. "Laisser un avis Google" (#26)
 *   menu.itemBadge   small labels on an item (icon + text), from its `ext.<module>` data (#29)
 *   menu.itemDetail  blocks in the item sheet, from the same data (#29)
 * The two item points are drawn by core/app/item-extras.js, a file loaded only when a module
 * contributes to them (outside the core's size budget).
 */
import { translator, pick } from '../i18n.js';
import { formatPrice } from '../money.js';

/** @typedef {import('../i18n.js').Lang} Lang */
/** @typedef {import('../i18n.js').LocalizedText} LocalizedText */

export const CLIENT_POINTS = /** @type {const} */ ([
  'list.action',
  'header.action',
  'sheet.page',
  'checkout.fields',
  'postOrder.block',
  'orderStatus.block',
  'footer.link',
  'menu.itemBadge',
  'menu.itemDetail',
]);
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
 * A stored order as the server returns it (POST /api/orders).
 * @typedef {object} StoredOrder
 * @property {string} id
 * @property {string} number     number of the day, e.g. "A12"
 * @property {string} status
 * @property {number} total      millimes
 * @property {string | null} table
 * @property {string} note
 * @property {{ qty: number, name: LocalizedText, variantName?: LocalizedText, total: number, note?: string }[]} lines
 * @property {Record<string, unknown>} [modules]   what each module's server hook answered
 */

/**
 * What a `list.action` contribution returns: the list's main button.
 * - `link`: the core opens `href`.
 * - `checkout`: a channel. With a server, the core runs checkout (details, notice, consent),
 *   stores the order, then shows `complete(order)` as the next step. Without a server
 *   (standalone demo), the core opens `href` directly.
 * @typedef {object} ListAction
 * @property {'link' | 'checkout'} kind
 * @property {string} href     https only
 * @property {string} label
 * @property {string} [icon]   a name from core/ui/icons.js
 * @property {string} [note]   one short line above the button
 * @property {string} [after]  shown once the customer has tapped the button
 * @property {(order: StoredOrder) => { href: string, label: string, note?: string }} [complete]
 */

/**
 * A piece of content a module asks the core to draw. Text is always set as text, never as HTML.
 * @typedef {{ kind: 'title', text: string }
 *   | { kind: 'text', text: string, tone?: 'muted' | 'success' | 'error' }
 *   | { kind: 'stamps', filled: number, total: number, label: string }
 *   | { kind: 'code', label: string, value: string }
 *   | { kind: 'qr', rows: string[], label: string }
 *   | { kind: 'form', fields: FormField[], submit: string,
 *       run: (values: Record<string, string>) => Promise<Block[]> }
 *   | { kind: 'button', label: string, look?: 'prominent' | 'plain' | 'danger', confirm?: string,
 *       run: () => Promise<Block[] | null> }
 *   | { kind: 'page', label: string, page: string }
 *   | { kind: 'link', label: string, href: string, look?: 'prominent' | 'plain',
 *       tapped?: () => void }} Block
 * A `link` opens an https page in a new tab; `tapped` is told (to count taps, never to block).
 *   A `page` block opens one of the module's own sheet pages. A `qr` block is a QR code the
 *   server encoded: square rows of "1" (dark) and "0" (light), 21 to 57 modules.
 */

/**
 * @typedef {object} FormField
 * @property {string} id
 * @property {string} label
 * @property {string} [placeholder]
 * @property {'text' | 'numeric' | 'tel'} [inputmode]
 * @property {number} [maxlength]
 * @property {boolean} [ltr]   digits and codes read left to right in Arabic too
 */

/** @typedef {{ label: string, icon?: string, page: string }} HeaderAction */

/**
 * A sheet page. `path` gives it a link of its own: /<café>/<path> opens the menu with it.
 * @typedef {object} SheetPage
 * @property {string} id
 * @property {string} [path]   lowercase letters, e.g. "carte"
 * @property {(lang: Lang) => string} title
 * @property {(c: { lang: Lang }) => Promise<Block[]>} view
 */

/**
 * What a `checkout.fields` contribution receives and returns. A `consent` field shows the
 * privacy notice's own text for that purpose (never the module's), unticked; the core sends
 * `consents[purpose] = true` only when ticked. `input` is sent to the module's server hook.
 * @typedef {{ type: 'dine_in' | 'takeaway', lang: Lang, table: string | null }} CheckoutContext
 * @typedef {{ kind: 'consent', purpose: 'loyalty' | 'marketing', note?: string }
 *   | { kind: 'info', text: string }} CheckoutField
 * @typedef {{ fields: CheckoutField[], input?: unknown }} CheckoutContribution
 */

/**
 * What a `postOrder.block` contribution receives: the stored order and its own server answer.
 * @typedef {{ order: StoredOrder, answer: unknown, lang: Lang }} PostOrderContext
 */

/**
 * What an `orderStatus.block` contribution receives: the customer's order as staff last set it.
 * The same for every customer: no amount, no lines, no rating, no identity (#26, US-44).
 * `orderKey` is this phone's own key for the order: a module's server route can check the
 * order's status with it (`api.orderStatus`); it is never shown.
 * @typedef {{ status: string, number: string, orderKey: string, cafe: LocalizedText, lang: Lang }} OrderStatusContext
 */

/** A link in the footer (https only). @typedef {{ label: string, href: string }} FooterLink */

/**
 * The module's own small store on this phone, under `dm:<café>:<module>:`.
 * @typedef {object} ModuleStorage
 * @property {(name: string) => string | null} get
 * @property {(name: string, value: string) => void} set
 * @property {(name: string) => void} remove
 */

/**
 * @typedef {object} CallResult
 * @property {boolean} ok
 * @property {number} status   0 when the network failed
 * @property {any} data
 */

/**
 * What an item point receives: the item's own data for this module (`items.ext.<module>`).
 * @typedef {{ ext: unknown, lang: Lang, item: { id: string } }} ItemContext
 * A label on an item: text always; an icon as SVG path data (24 × 24), optional.
 * @typedef {{ text: string, icon?: { paths: string[] } }} ItemBadge
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
 * @property {ModuleStorage} storage
 * @property {(route: string, body?: Record<string, unknown>) => Promise<CallResult>} call
 *   POST /api/m/<module>/<route> with the café added; never sends cookies
 * @property {{
 *   (point: 'list.action', fn: (c: ListActionContext) => ListAction | null): void,
 *   (point: 'header.action', fn: (c: { lang: Lang }) => HeaderAction | null): void,
 *   (point: 'sheet.page', page: SheetPage): void,
 *   (point: 'checkout.fields', fn: (c: CheckoutContext) => CheckoutContribution | null): void,
 *   (point: 'postOrder.block', fn: (c: PostOrderContext) => Block[] | null): void,
 *   (point: 'orderStatus.block', fn: (c: OrderStatusContext) => Block[] | null): void,
 *   (point: 'menu.itemBadge', fn: (c: ItemContext) => ItemBadge[] | null): void,
 *   (point: 'menu.itemDetail', fn: (c: ItemContext) => Block[] | null): void,
 *   (point: 'footer.link', fn: (c: { lang: Lang }) => FooterLink | null): void,
 * }} contribute
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
 * What the page gives the registry: the café, the phone's storage and the network.
 * @typedef {object} Host
 * @property {string} [cafe]
 * @property {Storage | null} [storage]
 * @property {typeof fetch} [fetch]
 */

const NAME = /^[a-z][a-z0-9_-]{0,30}$/;
const PATH = /^[a-z]{2,20}$/;

/**
 * Collects the contributions of the enabled modules.
 * @param {(message: string, err: unknown) => void} [report]  where module errors go
 * @param {Host} [host]
 */
export function createRegistry(report = (message, err) => console.error(message, err), host = {}) {
  /** @type {{ key: string, fn: (c: ListActionContext) => ListAction | null }[]} */
  const listActions = [];
  /** @type {{ key: string, fn: (c: { lang: Lang }) => HeaderAction | null }[]} */
  const headerActions = [];
  /** @type {Map<string, SheetPage & { key: string }>} pages by "<module>:<id>" */
  const pages = new Map();
  /** @type {{ key: string, fn: (c: CheckoutContext) => CheckoutContribution | null }[]} */
  const checkoutFields = [];
  /** @type {{ key: string, fn: (c: PostOrderContext) => Block[] | null }[]} */
  const postOrder = [];
  /** @type {{ key: string, fn: (c: OrderStatusContext) => Block[] | null }[]} */
  const orderStatus = [];
  /** @type {{ key: string, fn: (c: { lang: Lang }) => FooterLink | null }[]} */
  const footerLinks = [];
  /** Item points (#29), called by item-extras.js with each item's own data. */
  const itemPoints = { 'menu.itemBadge': [], 'menu.itemDetail': [] };

  /** @param {string} key */
  function storageFor(key) {
    const prefix = `dm:${host.cafe ?? ''}:${key}:`;
    /** @type {ModuleStorage} */
    const store = {
      get(name) {
        try {
          return host.storage?.getItem(prefix + name) ?? null;
        } catch {
          return null;
        }
      },
      set(name, value) {
        try {
          host.storage?.setItem(prefix + name, String(value));
        } catch {
          /* storage blocked: kept for this visit only */
        }
      },
      remove(name) {
        try {
          host.storage?.removeItem(prefix + name);
        } catch {
          /* nothing to do */
        }
      },
    };
    return Object.freeze(store);
  }

  /** @param {string} key */
  function callerFor(key) {
    /** @type {ModuleApi['call']} */
    return async (route, body = {}) => {
      if (!NAME.test(route)) return { ok: false, status: 0, data: {} };
      const doFetch = host.fetch ?? globalThis.fetch;
      try {
        const response = await doFetch(`/api/m/${key}/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({ ...body, cafe: host.cafe }),
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data };
      } catch {
        return { ok: false, status: 0, data: {} };
      }
    };
  }

  return {
    /** @type {Record<'menu.itemBadge' | 'menu.itemDetail', { key: string, fn: Function }[]>} */
    itemPoints,
    /**
     * Runs a module's `register` with its API. A module that throws adds nothing.
     * @param {BootModule} mod
     * @param {RegisterFn} register
     */
    add(mod, register) {
      const texts = mod.texts ?? {};
      const key = mod.key;
      /** @type {(() => void)[]} */
      const mine = [];
      /** @type {ModuleApi} */
      const api = {
        key,
        settings: Object.freeze({ ...(mod.settings ?? {}) }),
        texts: (lang) => translator(texts[lang] ?? {}, texts.fr ?? {}),
        pick,
        price: formatPrice,
        storage: storageFor(key),
        call: callerFor(key),
        contribute(/** @type {ClientPoint} */ point, /** @type {any} */ fn) {
          if (point === 'sheet.page') {
            const page = /** @type {SheetPage} */ (fn);
            if (!NAME.test(String(page?.id)) || typeof page.view !== 'function')
              throw new Error('sheet.page needs an id and a view');
            if (page.path !== undefined && !PATH.test(page.path))
              throw new Error('sheet.page path must be 2-20 lowercase letters');
            mine.push(() => pages.set(`${key}:${page.id}`, { ...page, key }));
            return;
          }
          if (typeof fn !== 'function') throw new Error(`${point} needs a function`);
          const lists = {
            'list.action': listActions,
            'header.action': headerActions,
            'checkout.fields': checkoutFields,
            'postOrder.block': postOrder,
            'orderStatus.block': orderStatus,
            'footer.link': footerLinks,
            ...itemPoints,
          };
          const list = /** @type {any} */ (lists)[point];
          if (!list) throw new Error(`unknown extension point: ${point}`);
          mine.push(() => list.push({ key, fn }));
        },
      };
      try {
        register(api);
        for (const apply of mine) apply();
      } catch (err) {
        report(`module ${key} failed to register`, err);
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

    /**
     * Header buttons; each opens one of its module's own pages.
     * @param {{ lang: Lang }} context
     * @param {readonly string[]} icons  the icons in the release sprite
     * @returns {(HeaderAction & { key: string })[]}
     */
    headerActions(context, icons) {
      /** @type {(HeaderAction & { key: string })[]} */
      const out = [];
      for (const { key, fn } of headerActions) {
        try {
          const a = fn(context);
          if (!a || typeof a.label !== 'string' || !a.label.trim()) continue;
          if (!pages.has(`${key}:${a.page}`)) continue;
          out.push({
            label: a.label,
            page: `${key}:${a.page}`,
            ...(a.icon && icons.includes(a.icon) ? { icon: a.icon } : {}),
            key,
          });
        } catch (err) {
          report(`module ${key}: header.action failed`, err);
        }
      }
      return out;
    },

    /**
     * A page by its full id ("<module>:<id>") or by its own link path ("carte").
     * @param {string} idOrPath
     */
    page(idOrPath) {
      if (pages.has(idOrPath)) return pages.get(idOrPath) ?? null;
      for (const page of pages.values()) if (page.path === idOrPath) return page;
      return null;
    },

    /**
     * Checkout additions, in module order. A consent field is kept only for a purpose the
     * privacy notice has a text for.
     * @param {CheckoutContext} context
     * @param {readonly string[]} purposes  purposes with a text in the notice's optIn
     * @returns {{ key: string, fields: CheckoutField[], input?: unknown }[]}
     */
    checkoutFields(context, purposes) {
      const out = [];
      for (const { key, fn } of checkoutFields) {
        try {
          const c = fn(context);
          if (!c || !Array.isArray(c.fields)) continue;
          const fields = c.fields.filter(
            (f) =>
              (f?.kind === 'consent' && purposes.includes(f.purpose)) ||
              (f?.kind === 'info' && typeof f.text === 'string' && f.text.trim() !== ''),
          );
          out.push({ key, fields, ...(c.input !== undefined ? { input: c.input } : {}) });
        } catch (err) {
          report(`module ${key}: checkout.fields failed`, err);
        }
      }
      return out;
    },

    /**
     * Blocks under the order number, each from the module's own server answer.
     * @param {StoredOrder} order
     * @param {Lang} lang
     * @returns {{ key: string, blocks: Block[] }[]}
     */
    postOrderBlocks(order, lang) {
      const out = [];
      for (const { key, fn } of postOrder) {
        try {
          const blocks = fn({ order, answer: order.modules?.[key] ?? null, lang });
          if (Array.isArray(blocks) && blocks.length) out.push({ key, blocks });
        } catch (err) {
          report(`module ${key}: postOrder.block failed`, err);
        }
      }
      return out;
    },

    /**
     * Blocks for the order's current status, in module order.
     * @param {OrderStatusContext} context
     * @returns {{ key: string, blocks: Block[] }[]}
     */
    orderStatusBlocks(context) {
      const out = [];
      for (const { key, fn } of orderStatus) {
        try {
          const blocks = fn(context);
          if (Array.isArray(blocks) && blocks.length) out.push({ key, blocks });
        } catch (err) {
          report(`module ${key}: orderStatus.block failed`, err);
        }
      }
      return out;
    },

    /** Whether a module adds anything to "Ma commande" (asks no module, runs nothing). */
    hasOrderStatusBlocks() {
      return orderStatus.length > 0;
    },

    /**
     * Footer links: https only, with a text label.
     * @param {{ lang: Lang }} context
     * @returns {(FooterLink & { key: string })[]}
     */
    footerLinks(context) {
      const out = [];
      for (const { key, fn } of footerLinks) {
        try {
          const link = fn(context);
          if (
            link &&
            typeof link.label === 'string' &&
            link.label.trim() &&
            typeof link.href === 'string' &&
            SAFE_URL.test(link.href)
          )
            out.push({ label: link.label, href: link.href, key });
        } catch (err) {
          report(`module ${key}: footer.link failed`, err);
        }
      }
      return out;
    },

    report,
  };
}

/** An https address with no spaces: the only kind of link a module may give. */
export const SAFE_URL = /^https:\/\/[^\s]+$/;

/** @typedef {ReturnType<typeof createRegistry>} Registry */

/**
 * Only https links with a text label are drawn.
 * @param {ListAction} action
 */
function isSafeAction(action) {
  return (
    (action.kind === 'link' ||
      (action.kind === 'checkout' && typeof action.complete === 'function')) &&
    typeof action.label === 'string' &&
    action.label.trim() !== '' &&
    typeof action.href === 'string' &&
    /^https:\/\/[^\s]+$/.test(action.href)
  );
}
