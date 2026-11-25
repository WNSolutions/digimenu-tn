// @ts-check
/**
 * Builds the `/api/boot` answer (format 1, core/app/context.js `Boot`) from a café's active
 * configuration. Pure: the Worker and the local dev server both use it, so they cannot drift.
 */
import { accentTokens } from '../../../core/ui/accent.js';

/** @typedef {import('../../../core/app/context.js').Boot} Boot */
/** @typedef {import('../../../core/app/extensions.js').BootModule} BootModule */

/**
 * The parts of the café configuration (core/schemas/cafe-config.schema.json) the boot reads.
 * @typedef {object} CafeConfig
 * @property {string} slug
 * @property {import('../../../core/i18n.js').LocalizedText} names
 * @property {{ enabled: import('../../../core/i18n.js').Lang[], default: import('../../../core/i18n.js').Lang }} languages
 * @property {{ unavailable?: 'grey' | 'hide' }} [menu]
 * @property {{ address?: import('../../../core/i18n.js').LocalizedText }} [info]
 * @property {import('../../../core/hours.js').Hours} [hours]
 * @property {string} [timeZone]
 * @property {{ primaryColor: string, buttonColor?: string, logo?: string }} branding
 * @property {{ maxQtyPerLine?: number, listMaxAgeHours?: number }} [ordering]
 * @property {Record<string, { enabled: boolean, settings?: Record<string, unknown> }>} [modules]
 * @property {string} [status]
 */

/**
 * The privacy notice shown at checkout (ADR-0010), in the boot answer so checkout needs no
 * extra call. Texts are LocalizedText; `version` is sent back with the order.
 * @typedef {{ version: number, short: Record<string, string>, full: Record<string, string>,
 *   optIn: Record<string, Record<string, string>> }} PrivacyNotice
 */

/**
 * Order types the café accepts, each with its channels (enabled modules only), and whether
 * dine-in needs a name and phone.
 * @param {CafeConfig & { ordering?: any }} config
 */
export function orderingInfo(config) {
  /** @type {Record<string, string[]>} */
  const types = {};
  for (const [type, value] of Object.entries(config.ordering?.types ?? {})) {
    const channel = /** @type {any} */ (value).channel;
    const list = (Array.isArray(channel) ? channel : [channel]).filter(
      (key) => key && config.modules?.[key]?.enabled,
    );
    if (list.length) types[type] = list;
  }
  return { types, dineInDetails: config.ordering?.dineInDetails ?? 'required' };
}

/**
 * Which table the link names, and whether its check code is right. An unknown or retired table
 * still opens the menu, as "no table" (ADR-0004).
 * @param {{ label: string, check_code: string, active: number | boolean } | null} row
 * @param {string | null} code
 * @returns {{ label: string, valid: boolean, code?: string } | null}
 *   `code` comes back only when it is right, so the page can send it with the order.
 */
export function tableStatus(row, code) {
  if (!row || !row.active) return null;
  const valid = Boolean(code) && String(code).toUpperCase() === row.check_code;
  return { label: row.label, valid, ...(valid ? { code: row.check_code } : {}) };
}

/**
 * Only enabled modules whose customer code is in the release (MOD-03: off means zero bytes).
 * @param {CafeConfig} config
 * @param {Record<string, { entry?: string, texts?: BootModule['texts'] }>} available
 * @returns {BootModule[]}
 */
export function enabledModules(config, available) {
  return Object.entries(config.modules ?? {})
    .filter(([key, m]) => m.enabled && available[key])
    .map(([key, m]) => ({
      key,
      ...(available[key].entry ? { entry: available[key].entry } : {}),
      settings: m.settings ?? {},
      texts: available[key].texts ?? {},
    }));
}

/** A plain file name at the top of the café's media folder: the release build publishes those
 * files only (tools/release/build.js), so anything else would be a broken image. */
const LOGO_FILE = /^[a-z0-9][a-z0-9._-]*\.(svg|png|webp)$/;

/**
 * Where the café's logo is served: the deployment's media folder is published with the static
 * site (`/media/<café>/<file>`), so a logo never costs a Worker request.
 * @param {CafeConfig} config
 * @returns {string | null}
 */
export function logoUrl(config) {
  const file = config.branding?.logo;
  return file && LOGO_FILE.test(file) ? `/media/${config.slug}/${file}` : null;
}

/**
 * @param {object} input
 * @param {CafeConfig} input.config
 * @param {{ label: string, valid: boolean } | null} input.table
 * @param {import('../../../core/menu/snapshot.js').Snapshot} input.menu
 * @param {{ version: string, entry: string, css: string }} input.release
 * @param {BootModule[]} input.modules
 * @param {PrivacyNotice | null} [input.privacy]
 * @returns {Boot & { release: { version: string, entry: string, css: string } }}
 */
export function bootBody({ config, table, menu, release, modules, privacy = null }) {
  const logo = logoUrl(config);
  return {
    v: 1,
    release,
    cafe: {
      slug: config.slug,
      name: config.names,
      ...(logo ? { logo } : {}),
      languages: config.languages,
      ...(config.hours ? { hours: config.hours } : {}),
      timeZone: config.timeZone ?? 'Africa/Tunis',
      ...(config.info?.address ? { info: { address: config.info.address } } : {}),
      unavailable: config.menu?.unavailable ?? 'grey',
      maxQtyPerLine: config.ordering?.maxQtyPerLine ?? 20,
      ...(config.ordering?.listMaxAgeHours
        ? { listMaxAgeHours: config.ordering.listMaxAgeHours }
        : {}),
      accent: accentTokens(config.branding).tokens,
    },
    table,
    menu,
    modules,
    ordering: orderingInfo(config),
    privacy,
  };
}
