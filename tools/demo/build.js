#!/usr/bin/env node
// @ts-check
/**
 * Builds the demo café as ONE standalone HTML file (no server, no network): the customer page
 * of table 5 with the menu inside. Used to show DigiMenu on a phone during café visits and in
 * workshops. It also measures the customer bundle against the performance budget.
 *
 *   npm run demo                      → dist/demo/index.html
 *   npm run demo -- --table T1        another table of cafes/demo/tables.csv
 *
 * The real path (static boot page + /api/boot + /r/<version>/) is what `npm run dev` serves.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { loadDemo, demoBoot } from './boot.js';

const HELP = `Usage: node tools/demo/build.js [--table 5] [--out dist/demo]

Builds dist/demo/index.html: the demo café's customer page in one file.
Prints the size of the customer code against the budget (core ≤ 20 KB gzipped).
`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const BUDGET_CORE_GZ = 20 * 1024;
const TARGET = ['es2022', 'chrome100', 'safari15.4', 'firefox110'];

/** @param {string} format @returns {Promise<string>} */
async function bundleJs(format) {
  const out = await build({
    entryPoints: [path.join(root, 'core/app/main.js')],
    bundle: true,
    format: /** @type {'esm' | 'iife'} */ (format),
    globalName: format === 'iife' ? 'DigiMenu' : undefined,
    minify: true,
    target: TARGET,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

async function bundleCss() {
  const out = await build({
    stdin: {
      contents: '@import "./tokens.css";\n@import "./menu.css";\n',
      resolveDir: path.join(root, 'core/ui'),
      loader: 'css',
    },
    bundle: true,
    minify: true,
    target: TARGET,
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

/** @param {string} text */
const gz = (text) => gzipSync(Buffer.from(text), { level: 9 }).length;
/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * JSON that is safe inside a <script> element.
 * @param {unknown} value
 */
function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

async function run() {
  const { values } = parseArgs({
    options: {
      table: { type: 'string', default: '5' },
      out: { type: 'string', default: 'dist/demo' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const demo = loadDemo();
  if (demo.errors.length) {
    process.stderr.write(
      `The demo café has problems; fix them first:\n  ${demo.errors.join('\n  ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const code = demo.tables.get(values.table);
  if (code === undefined) {
    process.stderr.write(`Table "${values.table}" is not in cafes/demo/tables.csv.\n`);
    process.exitCode = 1;
    return;
  }
  const boot = demoBoot(
    demo,
    { table: values.table, code },
    { version: 'demo', entry: '', css: '' },
  );
  const [esm, iife, css] = await Promise.all([bundleJs('esm'), bundleJs('iife'), bundleCss()]);
  const name = demo.info.names.fr;

  const html = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<meta name="description" content="DigiMenu demo: the customer menu of a fictional café, table ${values.table}.">
<title>${name.replace(/[<&]/g, '')}</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="dm-boot">${scriptJson(boot)}</script>
<script>${iife}
DigiMenu.start(JSON.parse(document.getElementById('dm-boot').textContent));</script>
</body>
</html>
`;
  const outDir = path.resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'index.html'), html);

  const coreGz = gz(esm);
  const lines = [
    `Wrote ${path.relative(process.cwd(), path.join(outDir, 'index.html'))} (table ${values.table}).`,
    `Customer code: ${kb(coreGz)} gzipped (budget ${kb(BUDGET_CORE_GZ)}) · CSS ${kb(gz(css))} · menu ${kb(gz(JSON.stringify(boot.menu)))}.`,
    `Whole page: ${kb(gz(html))} gzipped.`,
    '',
    demo.report,
  ];
  process.stdout.write(lines.join('\n') + '\n');
  if (coreGz > BUDGET_CORE_GZ) {
    process.stderr.write(
      'The customer code is over budget (docs/architecture: performance budget).\n',
    );
    process.exitCode = 1;
  }
}

run().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exitCode = 1;
});
