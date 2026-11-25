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
 * @property {{ primaryColor: string, buttonColor?: string }} branding
 * @property {{ maxQtyPerLine?: number, listMaxAgeHours?: number }} [ordering]
 * @property {Record<string, { enabled: boolean, settings?: Record<string, unknown> }>} [modules]
 */

/**
 * Which table the link names, and whether its check code is right. An unknown or retired table
 * still opens the menu, as "no table" (ADR-0004).
 * @param {{ label: string, check_code: string, active: number | boolean } | null} row
 * @param {string | null} code
 * @returns {{ label: string, valid: boolean } | null}
 */
export function tableStatus(row, code) {
  if (!row || !row.active) return null;
  return {
    label: row.label,
    valid: Boolean(code) && String(code).toUpperCase() === row.check_code,
  };
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

/**
 * @param {object} input
 * @param {CafeConfig} input.config
 * @param {{ label: string, valid: boolean } | null} input.table
 * @param {import('../../../core/menu/snapshot.js').Snapshot} input.menu
 * @param {{ version: string, entry: string, css: string }} input.release
 * @param {BootModule[]} input.modules
 * @returns {Boot & { release: { version: string, entry: string, css: string } }}
 */
export function bootBody({ config, table, menu, release, modules }) {
  return {
    v: 1,
    release,
    cafe: {
      slug: config.slug,
      name: config.names,
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
  };
}
