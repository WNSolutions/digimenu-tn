#!/usr/bin/env node
// @ts-check
/**
 * QR table cards (US-32, issue #13): one print page per table, in the brand's table-tent design
 * (D-060: 100 × 145 mm with 3 mm bleed, emerald with a champagne frame, the table's QR code in
 * emerald on an ivory panel, "TABLE 07", the scan line in English, French and Arabic, and the
 * short address).
 *
 *   node tools/qr/cards.js                          demo cards for the demo café (HTML)
 *   node tools/qr/cards.js --pdf cards.pdf          the same as a PDF (needs Playwright)
 *   node tools/qr/cards.js --cafe <dir> --print --log printed-links.csv   cards to print
 *
 * Demo cards are marked "DEMO". Cards to print are refused until the link's domain answers as
 * the production server, and never made for the demo café; each printed link is appended to
 * the log (the private deploy repository keeps it, and CI re-opens every link). The same table
 * always gets the same link: it comes from the café's tables.csv (label and check code).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encodeQr } from '../../core/qr.js';
import { parseCsv } from '../import/menu-csv.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

export const DEFAULT_BASE = 'https://digimenu.wnsolutions.tn';
const COLOURS = { emerald: '#004532', ivory: '#FBF7EE', champagne: '#C9A45C' };

const HELP = `Usage: node tools/qr/cards.js [options]

Makes QR table cards (100 × 145 mm, 3 mm bleed), one page per table.

  --cafe <folder>     café folder with info.json and tables.csv (default: cafes/demo)
  --base <url>        start of the links (default: ${DEFAULT_BASE})
  --tables <list>     only these tables, e.g. 1,2,5
  --mark <file.svg>   the DigiMenu mark to print above the café's name (brand kit file)
  --out <file.html>   where to write the cards (default: dist/cards/<café>.html)
  --pdf <file.pdf>    also write a PDF (uses Playwright)
  --print             cards to print: checks the domain is live, refuses the demo café,
                      and needs --log
  --log <file.csv>    printed-links log to append to (with --print)
`;

/**
 * The permanent table link (ADR-0004).
 * @param {string} base
 * @param {string} slug
 * @param {string} label
 * @param {string} code
 */
export function cardLink(base, slug, label, code) {
  return `${base.replace(/\/+$/, '')}/${slug}/t/${encodeURIComponent(label)}?k=${encodeURIComponent(code)}`;
}

/** "7" → "07"; other labels as written, in capitals. @param {string} label */
export function tableText(label) {
  return /^\d$/.test(label) ? `0${label}` : label.toUpperCase();
}

/**
 * The café's tables from tables.csv ("label;code").
 * @param {string} dir
 * @returns {{ label: string, code: string }[]}
 */
export function readTables(dir) {
  const rows = parseCsv(readFileSync(path.join(dir, 'tables.csv'), 'utf8'));
  rows.shift();
  return rows
    .filter(([label]) => label?.trim())
    .map(([label, code]) => ({ label: label.trim(), code: (code ?? '').trim().toUpperCase() }));
}

/** @param {unknown} s */
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/**
 * A QR code as an SVG drawing, emerald modules, no background (the ivory panel is behind it).
 * @param {string[]} rows
 */
export function qrSvg(rows) {
  let d = '';
  rows.forEach((row, y) => {
    for (const m of row.matchAll(/1+/g)) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
  });
  const n = rows.length;
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path fill="${COLOURS.emerald}" d="${d}"/></svg>`;
}

/** The embedded fonts (SIL Open Font License), so the cards look the same everywhere. */
function fontFaces() {
  /** @param {string} pkg @param {string} file @param {string} family @param {number} weight @param {string} range */
  const face = (pkg, file, family, weight, range) => {
    const data = readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`)).toString(
      'base64',
    );
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}`;
  };
  const latin =
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const latinExt =
    'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  const arabic =
    'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
  return [
    face('jost', 'jost-latin-400-normal.woff2', 'Jost', 400, latin),
    face('jost', 'jost-latin-ext-400-normal.woff2', 'Jost', 400, latinExt),
    face('jost', 'jost-latin-500-normal.woff2', 'Jost', 500, latin),
    face('jost', 'jost-latin-ext-500-normal.woff2', 'Jost', 500, latinExt),
    face('cairo', 'cairo-arabic-400-normal.woff2', 'Cairo', 400, arabic),
  ].join('\n');
}

/**
 * The cards as one HTML document, one page per table.
 * @param {object} o
 * @param {{ slug: string, name: string }} o.cafe
 * @param {{ label: string, link: string }[]} o.cards
 * @param {string} o.base
 * @param {boolean} o.demo
 * @param {string} [o.mark]   SVG of the DigiMenu mark (brand kit), or nothing for the wordmark only
 */
export function cardsHtml({ cafe, cards, base, demo, mark }) {
  const host = new URL(base).host;
  const nameSize = Math.min(7.2, 150 / Math.max(1, [...cafe.name].length));
  const markImg = mark
    ? `<img class="mark" alt="" src="data:image/svg+xml;base64,${Buffer.from(mark).toString('base64')}">`
    : '';
  const pages = cards.map(
    (c) => `<section class="card">
  <div class="frame"></div>
  ${demo ? '<span class="demo">DEMO</span>' : ''}
  <header class="brand">${markImg}<span class="word">DIGIMENU</span></header>
  <h1 class="name" style="font-size:${nameSize.toFixed(2)}mm">${esc(cafe.name)}</h1>
  <div class="panel">
    ${qrSvg(encodeQr(c.link).rows)}
    <p class="table">TABLE ${esc(tableText(c.label))}</p>
  </div>
  <p class="scan">Scan for the menu · Scannez pour le menu</p>
  <p class="scan ar" lang="ar" dir="rtl">امسح للقائمة</p>
  <p class="short">${esc(host)}/${esc(cafe.slug)}</p>
</section>`,
  );
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${demo ? 'DEMO · ' : ''}${esc(cafe.name)} · table cards</title>
<style>
${fontFaces()}
@page { size: 106mm 151mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #888; }
body { font-family: 'Jost', 'Helvetica Neue', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.card { position: relative; width: 106mm; height: 151mm; margin: 0 auto; overflow: hidden; background: ${COLOURS.emerald}; color: ${COLOURS.ivory}; text-align: center; page-break-after: always; break-after: page; }
.card:last-child { page-break-after: auto; break-after: auto; }
@media screen { .card { margin: 8mm auto; box-shadow: 0 2mm 6mm rgb(0 0 0 / 30%); } }
.frame { position: absolute; inset: 6.75mm; border: 0.18mm solid ${COLOURS.champagne}; border-radius: 0.6mm; }
.demo { position: absolute; top: 10mm; inset-inline-start: 10.5mm; padding: 0.6mm 2mm; border: 0.25mm solid ${COLOURS.champagne}; border-radius: 4mm; color: ${COLOURS.champagne}; font-weight: 500; font-size: 2.6mm; letter-spacing: 0.3em; }
.brand { position: absolute; top: 13mm; inset-inline: 0; display: flex; align-items: center; justify-content: center; gap: 4mm; height: 9mm; }
.mark { height: 9mm; width: auto; }
.word { font-weight: 500; font-size: 5mm; letter-spacing: 0.42em; margin-inline-end: -0.42em; }
.name { position: absolute; top: 26mm; inset-inline: 10mm; margin: 0; font-weight: 400; line-height: 1.15; }
.panel { position: absolute; top: 36.5mm; left: 20.5mm; width: 65mm; height: 74mm; border-radius: 1.8mm; background: ${COLOURS.ivory}; }
.qr { position: absolute; top: 7mm; left: 7.5mm; width: 50mm; height: 50mm; }
.table { position: absolute; bottom: 4mm; inset-inline: 0; margin: 0; color: ${COLOURS.emerald}; font-weight: 500; font-size: 5mm; letter-spacing: 0.22em; margin-inline-end: -0.22em; }
.scan { position: absolute; inset-inline: 8mm; margin: 0; font-size: 3.9mm; }
.scan:not(.ar) { top: 116mm; }
.scan.ar { top: 123mm; font-family: 'Cairo', sans-serif; font-size: 4.4mm; }
.short { position: absolute; top: 132.5mm; inset-inline: 8mm; margin: 0; color: ${COLOURS.champagne}; font-weight: 500; font-size: 3.7mm; letter-spacing: 0.02em; }
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>
`;
}

/**
 * Is the link's domain answering as the production server? (A table link printed before the
 * domain works would be a dead card on the table.)
 * @param {string} base
 * @param {typeof fetch} [doFetch]
 */
export async function domainIsLive(base, doFetch = fetch) {
  try {
    const res = await doFetch(`${base.replace(/\/+$/, '')}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = /** @type {any} */ (await res.json());
    return res.ok && body?.ok === true && body?.environment === 'production';
  } catch {
    return false;
  }
}

/**
 * Makes the cards. Returns what was written, or throws with a message for the maintainer.
 * @param {{ cafe?: string, base?: string, tables?: string, mark?: string, out?: string,
 *   print?: boolean, log?: string, now?: Date }} o
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function makeCards(o, deps = {}) {
  const dir = path.resolve(o.cafe ?? path.join(root, 'cafes/demo'));
  const info = JSON.parse(readFileSync(path.join(dir, 'info.json'), 'utf8'));
  const base = o.base ?? DEFAULT_BASE;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/.test(base))
    throw new Error(`--base must be an https address without a path, e.g. ${DEFAULT_BASE}`);
  if (o.print) {
    if (info.status === 'demo') throw new Error('The demo café gets demo cards only.');
    if (!o.log) throw new Error('--print needs --log <printed-links.csv>.');
    if (!(await domainIsLive(base, deps.fetch))) {
      throw new Error(
        `${base} does not answer as the production server yet: cards to print are refused until the domain is live.`,
      );
    }
  }
  const wanted = o.tables ? new Set(o.tables.split(',').map((t) => t.trim())) : null;
  const all = readTables(dir);
  const unknown = wanted ? [...wanted].filter((w) => !all.some((t) => t.label === w)) : [];
  if (unknown.length) throw new Error(`No such table in tables.csv: ${unknown.join(', ')}.`);
  const tables = all.filter((t) => !wanted || wanted.has(t.label));
  if (!tables.length) throw new Error('No tables to print (check tables.csv and --tables).');
  const missing = tables.filter((t) => !/^[A-Z0-9]{4,16}$/.test(t.code));
  if (missing.length)
    throw new Error(`Tables without a check code: ${missing.map((t) => t.label).join(', ')}.`);

  const cards = tables.map((t) => ({
    label: t.label,
    link: cardLink(base, info.slug, t.label, t.code),
  }));
  const html = cardsHtml({
    cafe: { slug: info.slug, name: info.names?.fr ?? info.slug },
    cards,
    base,
    demo: !o.print,
    mark: o.mark ? readFileSync(o.mark, 'utf8') : undefined,
  });
  const out = path.resolve(o.out ?? path.join(root, 'dist/cards', `${info.slug}.html`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html);

  if (o.print && o.log) {
    const at = (o.now ?? new Date()).toISOString();
    if (!existsSync(o.log)) writeFileSync(o.log, 'printed_at,cafe,table,link\n');
    appendFileSync(
      o.log,
      cards.map((c) => [at, info.slug, c.label, c.link].map(csvCell).join(',') + '\n').join(''),
    );
  }
  return { out, cards };
}

/** @param {string} v */
function csvCell(v) {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/**
 * Prints the HTML to a PDF with Playwright's Chromium (no extra PDF library).
 * @param {string} htmlFile
 * @param {string} pdfFile
 */
export async function toPdf(htmlFile, pdfFile) {
  /** @type {any} */
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    throw new Error('--pdf needs Playwright. Or open the HTML file and print it to PDF.');
  }
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${path.resolve(htmlFile)}`);
    await page.pdf({ path: pdfFile, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}

async function run() {
  const { values } = parseArgs({
    options: {
      cafe: { type: 'string' },
      base: { type: 'string' },
      tables: { type: 'string' },
      mark: { type: 'string' },
      out: { type: 'string' },
      pdf: { type: 'string' },
      print: { type: 'boolean', default: false },
      log: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  try {
    const { out, cards } = await makeCards(values);
    process.stdout.write(
      `${values.print ? 'Cards to print' : 'DEMO cards'}: ${cards.length} → ${out}\n`,
    );
    if (values.pdf) {
      await toPdf(out, values.pdf);
      process.stdout.write(`PDF → ${values.pdf}\n`);
    }
    if (values.print) process.stdout.write(`Printed links appended to ${values.log}\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) run();
