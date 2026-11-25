#!/usr/bin/env node
// @ts-check
/**
 * Local dev server for the customer page, with the fictional demo café.
 *
 *   npm run dev            then open http://localhost:8787/demo/t/5?k=7QF3K9
 *
 * It serves what the Worker will serve, without Cloudflare:
 *   /<café>, /<café>/t/<table>   the static boot page (platform/shell/public/index.html)
 *   /boot.js                     its script
 *   /api/boot                    built from cafes/demo/ on every request (edit menu.csv, reload)
 *   /r/dev/app.css               core/ui/tokens.css + core/ui/menu.css
 *   /r/dev/<path>                files of core/ as they are (no bundling in dev)
 *
 * Local only: it listens on 127.0.0.1 unless --host is given.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadDemo, demoBoot } from '../demo/boot.js';

const HELP = `Usage: node tools/dev/server.js [--port 8787] [--host 127.0.0.1]

Serves the customer page of the demo café on your computer.
Open http://localhost:8787/demo/t/5?k=7QF3K9 (table 5), or /demo for the menu without a table.
`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const CORE = path.join(root, 'core');
const PUBLIC = path.join(root, 'platform/shell/public');
const RELEASE = { version: 'dev', entry: '/r/dev/app/main.js', css: '/r/dev/app.css' };

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * Handles one request. Exported for tests.
 * @param {string} method
 * @param {URL} url
 * @returns {Promise<{ status: number, type?: string, body?: string | Buffer, location?: string }>}
 */
export async function handle(method, url) {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };
  const p = url.pathname;

  if (p === '/') return { status: 302, location: '/demo/t/5?k=7QF3K9' };
  if (p === '/boot.js') return file(path.join(PUBLIC, 'boot.js'));
  if (p === '/api/boot') {
    const demo = loadDemo();
    if (url.searchParams.get('cafe') !== demo.info.slug)
      return json(404, { error: 'unknown_cafe' });
    const boot = demoBoot(
      demo,
      { table: url.searchParams.get('t'), code: url.searchParams.get('k') },
      RELEASE,
    );
    return json(200, boot);
  }
  if (p === '/r/dev/app.css') {
    const css = await Promise.all([
      readFile(path.join(CORE, 'ui/tokens.css'), 'utf8'),
      readFile(path.join(CORE, 'ui/menu.css'), 'utf8'),
    ]);
    return { status: 200, type: TYPES['.css'], body: css.join('\n') };
  }
  if (p.startsWith('/r/dev/')) {
    const target = path.normalize(path.join(CORE, decodeURIComponent(p.slice('/r/dev/'.length))));
    if (!target.startsWith(CORE + path.sep) || target.endsWith('.test.js')) return { status: 404 };
    return file(target);
  }
  if (/^\/[a-z0-9][a-z0-9-]{0,30}[a-z0-9](\/t\/[^/]+)?\/?$/.test(p)) {
    return file(path.join(PUBLIC, 'index.html'));
  }
  return { status: 404, type: TYPES['.html'], body: 'Not found' };
}

/** @param {string} target */
async function file(target) {
  try {
    const body = await readFile(target);
    return { status: 200, type: TYPES[path.extname(target)] ?? 'application/octet-stream', body };
  } catch {
    return { status: 404 };
  }
}

/** @param {number} status @param {unknown} value */
function json(status, value) {
  return { status, type: TYPES['.json'], body: JSON.stringify(value) };
}

function run() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8787' },
      host: { type: 'string', default: '127.0.0.1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const demo = loadDemo();
  if (demo.errors.length) {
    process.stderr.write(`The demo café has problems:\n  ${demo.errors.join('\n  ')}\n`);
    process.exitCode = 1;
    return;
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const out = await handle(req.method ?? 'GET', url);
      res.statusCode = out.status;
      if (out.type) res.setHeader('content-type', out.type);
      if (out.location) res.setHeader('location', out.location);
      res.setHeader('cache-control', 'no-store');
      res.end(req.method === 'HEAD' ? undefined : out.body);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  server.listen(Number(values.port), values.host, () => {
    process.stdout.write(`Demo café: http://localhost:${values.port}/demo/t/5?k=7QF3K9\n`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) run();
