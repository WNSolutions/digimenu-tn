// @ts-check
/**
 * What a module's `staff.js` receives in the staff app (docs/architecture/modules.md,
 * `staff.panel`). The staff app bundles the panels of every module that has one
 * (staff-modules.js, generated); a panel shows only for a café that switched its module on.
 */

/**
 * @typedef {object} StaffApi
 * @property {string} key
 * @property {'fr' | 'ar'} lang
 * @property {(key: string, vars?: Record<string, string | number>) => string} t
 *   the module's staff texts (i18n/staff.<lang>.json), French fallback
 * @property {(tag: string, attrs?: Record<string, any> | null,
 *   ...children: (Node | string | null | undefined | false)[]) => HTMLElement} h
 *   builds elements; text is set as text, never as HTML
 * @property {(route: string, body?: Record<string, unknown>) => Promise<{ status: number, data: any }>} call
 *   POST /admin/api/m/<module>/<route> for the café on screen
 * @property {string} role   the signed-in person's role in this café
 * @property {(millimes: number) => string} price
 * @property {() => Promise<string | null>} scan
 *   opens the camera and returns the text of the first QR code read (null if cancelled)
 */

/**
 * @typedef {object} StaffPanel
 * @property {string} label   the tab's name
 * @property {(root: HTMLElement) => void} render   draws the panel into `root`
 */

/**
 * @typedef {object} StaffModule
 * @property {(api: StaffApi) => StaffPanel | null} [panel]
 * @property {{ fr: Record<string, string>, ar: Record<string, string> }} texts
 */

/**
 * A small translator for a module's staff texts.
 * @param {Record<string, string>} own
 * @param {Record<string, string>} fallback
 */
export function staffTexts(own, fallback) {
  return (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (own[key] ?? fallback[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
