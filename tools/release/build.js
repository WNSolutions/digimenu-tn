#!/usr/bin/env node
// @ts-check
/**
 * Builds one release and the static site the Worker serves:
 *
 *   dist/public/
 *   ├── index.html, boot.js        the static boot page (same file for every café and table)
 *   ├── _headers                   security headers and caching for the asset layer
 *   ├── brand/                     DigiMenu's brand layer for its own screens (D-068):
 *   │   ├── brand.css, fonts/      styles, Jost and Cairo (SIL OFL, from @fontsource)
 *   │   └── *.svg, *.png           the logo files, from --brand (the deploy repo's brand/)
 *   ├── media/<café>/              café logos and covers: the demo café's, and --media (deploy repo)
 *   ├── fonts/                     display fonts café themes may choose (ADR-0014, SIL OFL)
 *   ├── admin/                     the staff app
 *   └── r/<version>/
 *       ├── manifest.json          what /api/boot reads: entry, CSS, modules and their texts
 *       ├── app.<hash>.js          the customer core (≤ 20 KB gzipped, checked here)
 *       ├── app.<hash>.css
 *       └── m/<module>.<hash>.js   one file per module with customer code
 *
 *   node tools/release/build.js --version 0.1.0 [--out dist/public] [--keep <dir>]
 *                               [--brand <dir>] [--media <dir>]
 *
 * `--keep` copies earlier releases' `r/<version>/` folders into the output, so a window of up
 * to 3 releases can be deployed together. `--brand` and `--media` take the private deploy
 * repo's `brand/` and `media/` folders: the DigiMenu logo files and real cafés' logos are not in
 * this public repository (D-022), and are not covered by its MIT licence. The tool never deploys.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const HELP = `Usage: node tools/release/build.js --version <x.y.z> [--out dist/public] [--keep <dir>]
       [--brand <dir>] [--media <dir>]

Builds the release <version> and the static boot page into --out.
  --brand <dir>   the DigiMenu logo files (*.svg, *.png), copied to /brand/
  --media <dir>   café logos, one folder per café slug, copied to /media/<slug>/
`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const TARGET = ['es2022', 'chrome100', 'safari15.4', 'firefox110'];
const BUDGET_CORE_GZ = 20 * 1024;
export const PLATFORM_API = 1;

/** The brand fonts the build copies to /brand/fonts/ (platform/brand/brand.css names them). */
export const BRAND_FONTS = [
  ...[300, 400, 500].map((w) => `node_modules/@fontsource/jost/files/jost-latin-${w}-normal.woff2`),
  ...[300, 400, 500].map(
    (w) => `node_modules/@fontsource/cairo/files/cairo-arabic-${w}-normal.woff2`,
  ),
];
/** Display fonts café themes may choose (ADR-0014), copied to /fonts/ (core/ui/menu.css). */
export const THEME_FONT_FILES = [
  'node_modules/@fontsource/mohave/files/mohave-latin-600-italic.woff2',
  'node_modules/@fontsource/mohave/files/mohave-latin-500-normal.woff2',
];
const FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.(svg|png|webp)$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * Copies the image files of one folder (no sub-folders, plain lowercase names only).
 * @param {string} from
 * @param {string} to
 * @returns {string[]} the files copied
 */
function copyImages(from, to) {
  if (!existsSync(from)) return [];
  const files = readdirSync(from).filter((f) => FILE_NAME.test(f));
  if (files.length) mkdirSync(to, { recursive: true });
  for (const f of files) cpSync(path.join(from, f), path.join(to, f));
  return files;
}

/**
 * The brand layer: styles, fonts with their licences, and the logo files when given.
 * @param {string} out
 * @param {string | undefined} brand
 */
async function buildBrand(out, brand) {
  const dir = path.join(out, 'brand');
  mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  const css = await build({
    entryPoints: [path.join(root, 'platform/brand/brand.css')],
    bundle: true,
    minify: true,
    target: TARGET,
    external: ['/brand/*'],
    write: false,
    logLevel: 'silent',
  });
  writeFileSync(path.join(dir, 'brand.css'), css.outputFiles[0].text);
  for (const font of BRAND_FONTS) {
    cpSync(path.join(root, font), path.join(dir, 'fonts', path.basename(font)));
  }
  for (const family of ['jost', 'cairo']) {
    cpSync(
      path.join(root, `node_modules/@fontsource/${family}/LICENSE`),
      path.join(dir, 'fonts', `OFL-${family}.txt`),
    );
  }
  return brand ? copyImages(brand, dir) : [];
}

/**
 * Café logos: the demo café's (public), then each café folder of --media.
 * @param {string} out
 * @param {string | undefined} media
 */
function buildMedia(out, media) {
  const copied = copyImages(path.join(root, 'cafes/demo/media'), path.join(out, 'media/demo'));
  if (!media) return copied.length;
  let count = copied.length;
  for (const slug of readdirSync(media)) {
    if (!SLUG.test(slug) || slug === 'demo') continue;
    count += copyImages(path.join(media, slug), path.join(out, 'media', slug)).length;
  }
  return count;
}

/** @param {string | Uint8Array} content */
const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);
/** @param {string} text */
const gz = (text) => gzipSync(Buffer.from(text), { level: 9 }).length;

/** @param {string} entry */
async function bundleModule(entry) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    minify: true,
    target: TARGET,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

/**
 * The customer core, and the parts it loads only when needed (`import('./x.js')`, e.g.
 * "Ma commande") as files of their own next to it. Such a part imports nothing the core also
 * uses (it is handed the core's functions), so the core never loads a second file at start:
 * the build stops if esbuild had to split shared code into a file the core imports.
 * @param {string} entry
 * @returns {Promise<{ js: string, parts: { file: string, text: string }[] }>}
 */
export async function bundleCore(entry) {
  const out = await build({
    entryPoints: { app: entry },
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: TARGET,
    legalComments: 'none',
    outdir: '/core',
    chunkNames: 'part.[name].[hash]',
    write: false,
    logLevel: 'silent',
  });
  const main = out.outputFiles.find((f) => f.path === '/core/app.js');
  if (!main) throw new Error('the core bundle is missing');
  if (/(^|[;}\n])import\s*[{*"]|\bfrom\s*"\.\//.test(main.text))
    throw new Error('the core imports another file at start: a lazy part shares code with it');
  return {
    js: main.text,
    parts: out.outputFiles
      .filter((f) => f !== main)
      .map((f) => ({ file: path.basename(f.path), text: f.text })),
  };
}

/** The jsQR version bundled into /admin/scan.js, for its licence line. */
function jsqrVersion() {
  return JSON.parse(readFileSync(path.join(root, 'node_modules/jsqr/package.json'), 'utf8'))
    .version;
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
    external: ['/fonts/*'],
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

/**
 * Security headers for the asset layer. The boot page's one inline <style> is allowed by its
 * hash; everything else comes from the same origin.
 * @param {string} indexHtml
 */
export function headersFile(indexHtml) {
  const styles = [...indexHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
  );
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' ${styles.join(' ')}`.trim(),
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '/r/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/boot.js',
    '  Cache-Control: public, max-age=300',
    '/brand/*',
    '  Cache-Control: public, max-age=86400',
    '/media/*',
    '  Cache-Control: public, max-age=3600',
    '/fonts/*',
    '  Cache-Control: public, max-age=2592000',
    '/admin/*',
    '  Cache-Control: no-cache',
    // The staff app may use the camera, for scanning loyalty cards; customer pages may not.
    '  ! Permissions-Policy',
    '  Permissions-Policy: camera=(self), microphone=(), geolocation=()',
    '',
  ].join('\n');
}

/**
 * @param {{ version: string, out: string, keep?: string, brand?: string, media?: string }} options
 */
export async function buildRelease({ version, out, keep, brand, media }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`"${version}" is not a version number like 0.1.0`);
  }
  rmSync(out, { recursive: true, force: true });
  const base = path.join(out, 'r', version);
  mkdirSync(path.join(base, 'm'), { recursive: true });

  const indexHtml = readFileSync(path.join(root, 'platform/shell/public/index.html'), 'utf8');
  writeFileSync(path.join(out, 'index.html'), indexHtml);
  cpSync(path.join(root, 'platform/shell/public/boot.js'), path.join(out, 'boot.js'));
  writeFileSync(path.join(out, '_headers'), headersFile(indexHtml));

  const { js, parts } = await bundleCore(path.join(root, 'core/app/main.js'));
  const css = await bundleCss();
  const entry = `app.${hash(js)}.js`;
  const cssFile = `app.${hash(css)}.css`;
  writeFileSync(path.join(base, entry), js);
  writeFileSync(path.join(base, cssFile), css);
  // Parts loaded only when needed (their names carry their own hash).
  for (const part of parts) writeFileSync(path.join(base, part.file), part.text);

  /** @type {Record<string, { entry: string, texts: Record<string, Record<string, string>>, needs?: string[] }>} */
  const modules = {};
  const modulesDir = path.join(root, 'modules');
  for (const key of readdirSync(modulesDir).sort()) {
    const client = path.join(modulesDir, key, 'client.js');
    if (!existsSync(client)) continue;
    const code = await bundleModule(client);
    const file = `m/${key}.${hash(code)}.js`;
    writeFileSync(path.join(base, file), code);
    const manifest = JSON.parse(readFileSync(path.join(modulesDir, key, 'module.json'), 'utf8'));
    const needs = manifest.settings?.needs ?? [];
    modules[key] = {
      entry: `/r/${version}/${file}`,
      // Settings without which the boot leaves the module out (module-needs.js).
      ...(needs.length ? { needs } : {}),
      texts: Object.fromEntries(
        ['fr', 'ar', 'en'].map((lang) => [
          lang,
          JSON.parse(readFileSync(path.join(modulesDir, key, 'i18n', `${lang}.json`), 'utf8')),
        ]),
      ),
    };
  }

  // The staff app (platform/admin): same tokens, its own page, script and styles.
  mkdirSync(path.join(out, 'admin'), { recursive: true });
  cpSync(path.join(root, 'platform/admin/index.html'), path.join(out, 'admin/index.html'));
  writeFileSync(
    path.join(out, 'admin/admin.js'),
    await bundleModule(path.join(root, 'platform/admin/admin.js')),
  );
  // The QR reader for phones without one built in, loaded only when staff scan (jsQR).
  writeFileSync(
    path.join(out, 'admin/scan.js'),
    `/*! jsQR ${jsqrVersion()} | Apache License 2.0 | https://github.com/cozmo/jsQR */\n` +
      (await bundleModule(path.join(root, 'platform/admin/scan.js'))),
  );
  const adminCss = await build({
    stdin: {
      contents:
        '@import "../../core/ui/tokens.css";\n@import "../brand/brand.css";\n@import "./admin.css";\n',
      resolveDir: path.join(root, 'platform/admin'),
      loader: 'css',
    },
    bundle: true,
    minify: true,
    target: TARGET,
    external: ['/brand/*'],
    write: false,
    logLevel: 'silent',
  });
  writeFileSync(path.join(out, 'admin/admin.css'), adminCss.outputFiles[0].text);
  const brandFiles = await buildBrand(out, brand);
  mkdirSync(path.join(out, 'fonts'), { recursive: true });
  for (const font of THEME_FONT_FILES) {
    cpSync(path.join(root, font), path.join(out, 'fonts', path.basename(font)));
  }
  cpSync(
    path.join(root, 'node_modules/@fontsource/mohave/LICENSE'),
    path.join(out, 'fonts/OFL-mohave.txt'),
  );
  const logos = buildMedia(out, media);

  const manifest = {
    version,
    platformApi: PLATFORM_API,
    entry: `/r/${version}/${entry}`,
    css: `/r/${version}/${cssFile}`,
    modules,
  };
  writeFileSync(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  if (keep) {
    for (const old of readdirSync(path.join(keep, 'r'))) {
      if (old !== version)
        cpSync(path.join(keep, 'r', old), path.join(out, 'r', old), { recursive: true });
    }
  }
  return {
    manifest,
    coreGz: gz(js),
    cssGz: gz(css),
    parts: parts.map((p) => ({ file: p.file, gz: gz(p.text) })),
    brandFiles,
    logos,
  };
}

async function run() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      out: { type: 'string', default: 'dist/public' },
      keep: { type: 'string' },
      brand: { type: 'string' },
      media: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || !values.version) {
    process.stdout.write(HELP);
    if (!values.help) process.exitCode = 1;
    return;
  }
  const result = await buildRelease({
    version: values.version,
    out: path.resolve(values.out),
    keep: values.keep,
    brand: values.brand ? path.resolve(values.brand) : undefined,
    media: values.media ? path.resolve(values.media) : undefined,
  });
  process.stdout.write(
    `Release ${values.version} → ${values.out}\n` +
      `Core ${(result.coreGz / 1024).toFixed(1)} KB gzipped (budget 20.0 KB) · CSS ${(result.cssGz / 1024).toFixed(1)} KB · modules: ${Object.keys(result.manifest.modules).join(', ') || 'none'}\n` +
      result.parts
        .map((p) => `Loaded when needed: ${p.file} ${(p.gz / 1024).toFixed(1)} KB gzipped\n`)
        .join('') +
      `Brand: ${result.brandFiles.length ? result.brandFiles.join(', ') : 'no logo files (plain wordmark)'} · café logos: ${result.logos}\n`,
  );
  if (result.coreGz > BUDGET_CORE_GZ) {
    process.stderr.write('The customer core is over budget.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((err) => {
    process.stderr.write(`${err?.stack ?? err}\n`);
    process.exitCode = 1;
  });
}
