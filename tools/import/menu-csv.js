// @ts-check
/**
 * Menu import from the spreadsheet template (US-33, MOD-12).
 *
 * One row per price: a single-price item has one row; an item with sizes has one row per size.
 * Columns (any order; the first line names them; separator `;` as Excel saves it in French, or `,`):
 *
 *   category_fr category_ar category_en  group_fr group_ar group_en   (group: optional sub-group)
 *   item_fr item_ar item_en              description_fr description_ar description_en
 *   variant_fr variant_ar variant_en     (only when an item has several prices)
 *   price                                4,500 · 4.5 · 12 (never "4500": ambiguous, D-045)
 *   available                            oui / non / yes / no / 1 / 0 (empty = yes)
 *
 * Bad rows are skipped and reported in plain language; the rest of the menu still imports, and
 * the last valid menu stays live (the caller publishes only a menu with at least one item).
 * Prices are converted to whole millimes here, once.
 */
import { parsePrice, formatPrice } from '../../core/money.js';
import { missingTranslations } from '../../core/i18n.js';

/** @typedef {import('../../core/i18n.js').LocalizedText} LocalizedText */
/** @typedef {import('../../core/menu/snapshot.js').MenuSource} MenuSource */

/**
 * Splits CSV text into rows of cells (RFC 4180 quotes; `;` or `,` separator, detected from the
 * first line). A UTF-8 byte-order mark is ignored.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = text.replace(/^\ufeff/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Short, stable id from a text (FNV-1a, base 36), so a re-import of the same menu keeps its ids.
 * @param {string} prefix
 * @param {string} key
 */
export function stableId(prefix, key) {
  let h = 0x811c9dc5;
  for (const ch of key) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${prefix}${h.toString(36)}`;
}

/** @param {string} value */
function yesNo(value) {
  const v = value.trim().toLowerCase();
  if (v === '' || ['oui', 'yes', '1', 'o', 'y', 'نعم'].includes(v)) return true;
  if (['non', 'no', '0', 'n', 'لا', 'épuisé', 'epuise', 'sold out'].includes(v)) return false;
  return null;
}

/**
 * @param {Record<string, string>} r
 * @param {string} base  e.g. "item"
 * @returns {LocalizedText | undefined}
 */
function text(r, base) {
  const fr = (r[`${base}_fr`] ?? '').trim();
  const ar = (r[`${base}_ar`] ?? '').trim();
  const en = (r[`${base}_en`] ?? '').trim();
  if (!fr && !ar && !en) return undefined;
  return { fr, ...(ar ? { ar } : {}), ...(en ? { en } : {}) };
}

/**
 * @typedef {{ row: number, message: string }} Problem
 * @typedef {{ source: MenuSource, skipped: Problem[], warnings: Problem[],
 *   missing: { where: string, lang: 'fr' | 'ar' | 'en' }[],
 *   counts: { categories: number, items: number, variants: number } }} ImportResult
 */

/**
 * Turns the spreadsheet into a menu tree.
 * @param {string} csvText
 * @param {{ languages?: ('fr' | 'ar' | 'en')[] }} [options]
 * @returns {ImportResult}
 */
export function importMenuCsv(csvText, options = {}) {
  const langs = options.languages ?? ['fr', 'ar', 'en'];
  const rows = parseCsv(csvText);
  /** @type {Problem[]} */
  const skipped = [];
  /** @type {Problem[]} */
  const warnings = [];
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  for (const needed of ['category_fr', 'item_fr', 'price']) {
    if (!header.includes(needed)) {
      skipped.push({
        row: 1,
        message: `The first line has no "${needed}" column. Start from the template.`,
      });
    }
  }
  if (skipped.length > 0) {
    return {
      source: { categories: [] },
      skipped,
      warnings,
      missing: [],
      counts: { categories: 0, items: 0, variants: 0 },
    };
  }

  /** @type {MenuSource} */
  const source = { categories: [] };
  /** @type {Map<string, import('../../core/menu/snapshot.js').SourceCategory>} */
  const cats = new Map();
  /** @type {Map<string, import('../../core/menu/snapshot.js').SourceGroup>} */
  const groups = new Map();
  /** @type {Map<string, import('../../core/menu/snapshot.js').SourceItem & { _named: boolean }>} */
  const items = new Map();
  /** @type {{ where: string, text: LocalizedText | undefined }[]} */
  const texts = [];

  rows.forEach((cells, i) => {
    const rowNo = i + 2; // spreadsheet row number (the header is row 1)
    /** @type {Record<string, string>} */
    const r = {};
    header.forEach((h, j) => (r[h] = (cells[j] ?? '').trim()));

    const category = text(r, 'category');
    const name = text(r, 'item');
    if (!category?.fr)
      return skipped.push({
        row: rowNo,
        message: 'No category (column category_fr). Every item needs one.',
      });
    if (!name?.fr)
      return skipped.push({ row: rowNo, message: 'The French name is empty (column item_fr).' });

    const price = parsePrice(r.price ?? '');
    if (!price.ok) {
      const shown = `"${r.price ?? ''}"`;
      const message = {
        empty: `"${name.fr}": the price is empty.`,
        invalid: `"${name.fr}": ${shown} is not a price. Write it like 4,500 or 4.5 (no letters glued to it).`,
        too_many_decimals: `"${name.fr}": ${shown} has more than 3 decimals. Millimes have 3 digits: 4,500.`,
        too_large: `"${name.fr}": ${shown} is too high for one item.`,
        negative: `"${name.fr}": a price cannot be negative.`,
        ambiguous:
          price.reason === 'ambiguous'
            ? `"${name.fr}": ${shown} could mean ${formatPrice(price.choices[0])} or ${formatPrice(price.choices[1])}. Write it with a comma, for example ${formatPrice(price.choices[0]).replace(/\s?DT$/, '')}.`
            : '',
      }[price.reason];
      return skipped.push({ row: rowNo, message });
    }
    const available = yesNo(r.available ?? '');
    if (available === null) {
      return skipped.push({
        row: rowNo,
        message: `"${name.fr}": write oui or non in the "available" column (found "${r.available}").`,
      });
    }

    const catId = stableId('c-', category.fr.toLowerCase());
    let cat = cats.get(catId);
    if (!cat) {
      cat = { id: catId, title: category, groups: [] };
      cats.set(catId, cat);
      source.categories.push(cat);
      texts.push({ where: `category "${category.fr}"`, text: category });
    }
    const groupText = text(r, 'group');
    const groupId = stableId('g-', `${catId}|${(groupText?.fr ?? '').toLowerCase()}`);
    let group = groups.get(groupId);
    if (!group) {
      group = { id: groupId, ...(groupText ? { title: groupText } : {}), items: [] };
      groups.set(groupId, group);
      cat.groups.push(group);
      if (groupText) texts.push({ where: `group "${groupText.fr}"`, text: groupText });
    }
    const itemId = stableId('i-', `${groupId}|${name.fr.toLowerCase()}`);
    const variantText = text(r, 'variant');
    let item = items.get(itemId);
    if (!item) {
      const description = text(r, 'description');
      item = {
        id: itemId,
        name,
        ...(description ? { description } : {}),
        variants: [],
        _named: Boolean(variantText),
      };
      items.set(itemId, item);
      group.items.push(item);
      texts.push({ where: `item "${name.fr}"`, text: name });
      if (description) texts.push({ where: `description of "${name.fr}"`, text: description });
    } else if (!variantText || !item._named) {
      return skipped.push({
        row: rowNo,
        message: `"${name.fr}" appears twice. If it has several sizes, give each row a name in variant_fr (for example Petit, Grand).`,
      });
    }
    const variantId = stableId('v-', `${itemId}|${(variantText?.fr ?? '').toLowerCase()}`);
    if (item.variants.some((v) => v.id === variantId)) {
      return skipped.push({
        row: rowNo,
        message: `"${name.fr} · ${variantText?.fr}" appears twice.`,
      });
    }
    item.variants.push({
      id: variantId,
      ...(variantText ? { name: variantText } : {}),
      price: price.millimes,
      available,
    });
    if (variantText)
      texts.push({ where: `size "${variantText.fr}" of "${name.fr}"`, text: variantText });
  });

  for (const item of items.values()) delete (/** @type {any} */ (item)._named);
  let variants = 0;
  for (const item of items.values()) variants += item.variants.length;
  return {
    source,
    skipped,
    warnings,
    missing: missingTranslations(texts, langs),
    counts: { categories: cats.size, items: items.size, variants },
  };
}

/**
 * The report a maintainer reads after an import.
 * @param {ImportResult} result
 */
export function formatReport(result) {
  const lines = [
    `Imported ${result.counts.items} items (${result.counts.variants} prices) in ${result.counts.categories} categories.`,
  ];
  if (result.skipped.length) {
    lines.push(
      '',
      `Skipped ${result.skipped.length} row(s); fix them in the spreadsheet and import again:`,
    );
    for (const p of result.skipped) lines.push(`  row ${p.row}: ${p.message}`);
  }
  if (result.missing.length) {
    lines.push('', `Missing translations (the French text is shown instead):`);
    for (const m of result.missing) lines.push(`  ${m.lang.toUpperCase()}: ${m.where}`);
  }
  return lines.join('\n');
}
