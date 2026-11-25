// @ts-check
/**
 * Builds the `/api/boot` answer for the fictional demo café from its files in `cafes/demo/`
 * (info.json, menu.csv, tables.csv). The dev server and the standalone demo use it until the
 * Worker's real `/api/boot` (Sprint 1, second pull request) reads the same data from D1.
 *
 * It re-reads the files on every call, so an edit to `menu.csv` shows on the next page load.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { importMenuCsv, parseCsv, formatReport } from '../import/menu-csv.js';
import { buildSnapshot } from '../../core/menu/snapshot.js';
import { accentTokens, themeTokens } from '../../core/ui/accent.js';
import { bootBody, tableStatus } from '../../platform/shell/src/boot-body.js';

/** @typedef {import('../../core/app/context.js').Boot} Boot */
/** @typedef {import('../../core/i18n.js').Lang} Lang */
/** @typedef {import('../../core/i18n.js').LocalizedText} LocalizedText */

const DEFAULT_DIR = fileURLToPath(new URL('../../cafes/demo/', import.meta.url));
const MODULES_DIR = fileURLToPath(new URL('../../modules/', import.meta.url));

/**
 * The parts of `info.json` this builder reads (the full shape is `cafe-config.schema.json`).
 * @typedef {object} CafeInfo
 * @property {string} slug
 * @property {LocalizedText} names
 * @property {{ enabled: Lang[], default: Lang }} languages
 * @property {{ unavailable?: 'grey' | 'hide' }} [menu]
 * @property {{ address?: LocalizedText }} [info]
 * @property {import('../../core/hours.js').Hours} [hours]
 * @property {string} [timeZone]
 * @property {{ primaryColor: string, buttonColor?: string }} branding
 * @property {{ maxQtyPerLine?: number }} [ordering]
 * @property {Record<string, { enabled: boolean, settings?: Record<string, unknown> }>} [modules]
 */

/**
 * Reads the demo café once.
 * @param {string} [dir]  folder holding info.json, menu.csv and tables.csv
 */
export function loadDemo(dir = DEFAULT_DIR) {
  /** @type {CafeInfo} */
  const info = JSON.parse(readFileSync(new URL('info.json', `file://${dir}/`), 'utf8'));
  const menuCsv = readFileSync(new URL('menu.csv', `file://${dir}/`), 'utf8');
  const tablesCsv = readFileSync(new URL('tables.csv', `file://${dir}/`), 'utf8');

  const imported = importMenuCsv(menuCsv, { languages: info.languages.enabled });
  const { snapshot, problems } = buildSnapshot(imported.source, 1);
  const accent = accentTokens(info.branding);
  const theme = themeTokens(/** @type {any} */ (info.branding));

  /** @type {Map<string, string>} label → check code */
  const tables = new Map();
  const rows = parseCsv(tablesCsv);
  rows.shift();
  for (const [label, code] of rows) {
    if (label?.trim()) tables.set(label.trim(), (code ?? '').trim().toUpperCase());
  }

  /** Enabled modules that have customer code, with their texts (MOD-03: only these load). */
  const modules = Object.entries(info.modules ?? {})
    .filter(([key, m]) => m.enabled && existsSync(path.join(MODULES_DIR, key, 'client.js')))
    .map(([key, m]) => ({
      key,
      settings: m.settings ?? {},
      texts: Object.fromEntries(
        ['fr', 'ar', 'en'].map((lang) => [
          lang,
          JSON.parse(readFileSync(path.join(MODULES_DIR, key, 'i18n', `${lang}.json`), 'utf8')),
        ]),
      ),
    }));

  return {
    info,
    modules,
    snapshot,
    tables,
    accent,
    /** Problems a maintainer must see; the build stops on these. */
    errors: [
      ...problems,
      ...accent.errors,
      ...theme.errors,
      ...imported.skipped.map((p) => `menu.csv row ${p.row}: ${p.message}`),
    ],
    report: formatReport(imported),
    warnings: [...accent.warnings, ...theme.warnings],
  };
}

/**
 * The boot answer for one table link.
 * @param {ReturnType<typeof loadDemo>} demo
 * @param {{ table?: string | null, code?: string | null }} link
 * @param {{ version: string, entry: string, css: string, modules?: string }} release
 *   `modules`: where module files are served (`/r/dev/m/`); left out when they are bundled
 * @returns {Boot & { release: { version: string, entry: string, css: string } }}
 */
export function demoBoot(demo, link, release) {
  const label = link.table ?? null;
  const expected = label ? demo.tables.get(label) : undefined;
  const row = label && expected !== undefined ? { label, check_code: expected, active: 1 } : null;
  return bootBody({
    config: demo.info,
    table: tableStatus(row, link.code ?? null),
    menu: demo.snapshot,
    release: { version: release.version, entry: release.entry, css: release.css },
    modules: demo.modules.map((m) => ({
      ...m,
      ...(release.modules ? { entry: `${release.modules}${m.key}/client.js` } : {}),
    })),
  });
}
