#!/usr/bin/env node
// @ts-check
/**
 * Builds one release and the static site the Worker serves:
 *
 *   dist/public/
 *   ├── index.html, boot.js        the static boot page (same file for every café and table)
 *   ├── _headers                   security headers and caching for the asset layer
 *   └── r/<version>/
 *       ├── manifest.json          what /api/boot reads: entry, CSS, modules and their texts
 *       ├── app.<hash>.js          the customer core (≤ 20 KB gzipped, checked here)
 *       ├── app.<hash>.css
 *       └── m/<module>.<hash>.js   one file per module with customer code
 *
 *   node tools/release/build.js --version 0.1.0 [--out dist/public] [--keep <dir>]
 *
 * `--keep` copies earlier releases' `r/<version>/` folders into the output, so a window of up
 * to 3 releases can be deployed together. The tool never deploys.
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

Builds the release <version> and the static boot page into --out.
`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const TARGET = ['es2022', 'chrome100', 'safari15.4', 'firefox110'];
const BUDGET_CORE_GZ = 20 * 1024;
export const PLATFORM_API = 1;

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
    '',
  ].join('\n');
}

/**
 * @param {{ version: string, out: string, keep?: string }} options
 */
export async function buildRelease({ version, out, keep }) {
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

  const js = await bundleModule(path.join(root, 'core/app/main.js'));
  const css = await bundleCss();
  const entry = `app.${hash(js)}.js`;
  const cssFile = `app.${hash(css)}.css`;
  writeFileSync(path.join(base, entry), js);
  writeFileSync(path.join(base, cssFile), css);

  /** @type {Record<string, { entry: string, texts: Record<string, Record<string, string>> }>} */
  const modules = {};
  const modulesDir = path.join(root, 'modules');
  for (const key of readdirSync(modulesDir).sort()) {
    const client = path.join(modulesDir, key, 'client.js');
    if (!existsSync(client)) continue;
    const code = await bundleModule(client);
    const file = `m/${key}.${hash(code)}.js`;
    writeFileSync(path.join(base, file), code);
    modules[key] = {
      entry: `/r/${version}/${file}`,
      texts: Object.fromEntries(
        ['fr', 'ar', 'en'].map((lang) => [
          lang,
          JSON.parse(readFileSync(path.join(modulesDir, key, 'i18n', `${lang}.json`), 'utf8')),
        ]),
      ),
    };
  }

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
  return { manifest, coreGz: gz(js), cssGz: gz(css) };
}

async function run() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      out: { type: 'string', default: 'dist/public' },
      keep: { type: 'string' },
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
  });
  process.stdout.write(
    `Release ${values.version} → ${values.out}\n` +
      `Core ${(result.coreGz / 1024).toFixed(1)} KB gzipped (budget 20.0 KB) · CSS ${(result.cssGz / 1024).toFixed(1)} KB · modules: ${Object.keys(result.manifest.modules).join(', ') || 'none'}\n`,
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
