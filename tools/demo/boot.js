// @ts-check
/**
 * Builds the `/api/boot` answer for the fictional demo café from its files in `cafes/demo/`
 * (info.json, menu.csv, tables.csv). The dev server and the standalone demo use it until the
 * Worker's real `/api/boot` (Sprint 1, second pull request) reads the same data from D1.
 *
 * It re-reads the files on every call, so an edit to `menu.csv` shows on the next page load.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importMenuCsv, parseCsv, formatReport } from '../import/menu-csv.js';
import { buildSnapshot } from '../../core/menu/snapshot.js';
import { accentTokens } from '../../core/ui/accent.js';

/** @typedef {import('../../core/app/context.js').Boot} Boot */
/** @typedef {import('../../core/i18n.js').Lang} Lang */
/** @typedef {import('../../core/i18n.js').LocalizedText} LocalizedText */

const DEFAULT_DIR = fileURLToPath(new URL('../../cafes/demo/', import.meta.url));

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

  /** @type {Map<string, string>} label → check code */
  const tables = new Map();
  const rows = parseCsv(tablesCsv);
  rows.shift();
  for (const [label, code] of rows) {
    if (label?.trim()) tables.set(label.trim(), (code ?? '').trim().toUpperCase());
  }

  return {
    info,
    snapshot,
    tables,
    accent,
    /** Problems a maintainer must see; the build stops on these. */
    errors: [
      ...problems,
      ...accent.errors,
      ...imported.skipped.map((p) => `menu.csv row ${p.row}: ${p.message}`),
    ],
    report: formatReport(imported),
    warnings: accent.warnings,
  };
}

/**
 * The boot answer for one table link.
 * @param {ReturnType<typeof loadDemo>} demo
 * @param {{ table?: string | null, code?: string | null }} link
 * @param {{ version: string, entry: string, css: string }} release
 * @returns {Boot & { release: { version: string, entry: string, css: string } }}
 */
export function demoBoot(demo, link, release) {
  const { info } = demo;
  const label = link.table ?? null;
  const expected = label ? demo.tables.get(label) : undefined;
  return {
    v: 1,
    release,
    cafe: {
      slug: info.slug,
      name: info.names,
      languages: info.languages,
      ...(info.hours ? { hours: info.hours } : {}),
      timeZone: info.timeZone ?? 'Africa/Tunis',
      ...(info.info?.address ? { info: { address: info.info.address } } : {}),
      unavailable: info.menu?.unavailable ?? 'grey',
      maxQtyPerLine: info.ordering?.maxQtyPerLine ?? 20,
      accent: demo.accent.tokens,
    },
    // An unknown table still opens the menu, as "no table" (ADR-0004 §3).
    table:
      label && expected !== undefined
        ? { label, valid: Boolean(link.code) && link.code?.toUpperCase() === expected }
        : null,
    menu: demo.snapshot,
  };
}
