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
 *   /r/dev/m/<module>/<file>.js  customer code of an enabled module (modules/<module>/)
 *   /r/dev/<path>                files of core/ as they are (no bundling in dev)
 *
 * Local only: it listens on 127.0.0.1 unless --host is given.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadDemo } from '../demo/boot.js';
import { createD1 } from './d1.js';
import { seedSql, noticeSql } from '../seed/seed.js';
import worker from '../../platform/shell/src/index.js';
import { handleCreateOrder } from '../../platform/shell/src/orders-api.js';

/** @type {Date | null} */
let devNow = null;
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';

const HELP = `Usage: node tools/dev/server.js [--port 8787] [--host 127.0.0.1] [--now 2026-11-25T11:30:00+01:00]

Serves the customer page of the demo café on your computer.
Open http://localhost:8787/demo/t/5?k=7QF3K9 (table 5), or /demo for the menu without a table.
`;

const root = fileURLToPath(new URL('../../', import.meta.url));
const CORE = path.join(root, 'core');
const PUBLIC = path.join(root, 'platform/shell/public');
const MODULES = path.join(root, 'modules');
const RELEASE = {
  version: 'dev',
  entry: '/r/dev/app/main.js',
  css: '/r/dev/app.css',
  modules: '/r/dev/m/',
};

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
 * @param {string} [body]
 * @returns {Promise<{ status: number, type?: string, body?: string | Buffer, location?: string }>}
 */
export async function handle(method, url, body) {
  const p = url.pathname;
  if (p.startsWith('/api/')) return api(method, url, body);
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };

  if (p === '/') return { status: 302, location: '/demo/t/5?k=7QF3K9' };
  if (p === '/boot.js') return file(path.join(PUBLIC, 'boot.js'));
  if (p === '/r/dev/app.css') {
    const css = await Promise.all([
      readFile(path.join(CORE, 'ui/tokens.css'), 'utf8'),
      readFile(path.join(CORE, 'ui/menu.css'), 'utf8'),
    ]);
    return { status: 200, type: TYPES['.css'], body: css.join('\n') };
  }
  if (p.startsWith('/r/dev/m/')) {
    const target = path.normalize(
      path.join(MODULES, decodeURIComponent(p.slice('/r/dev/m/'.length))),
    );
    const inside =
      target.startsWith(MODULES + path.sep) &&
      path.relative(MODULES, target).split(path.sep).length === 2;
    if (!inside || !target.endsWith('.js')) return { status: 404 };
    return file(target);
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

/**
 * The real Worker (platform/shell) on an in-memory D1 with the demo café, re-seeded on every
 * boot so an edit to cafes/demo/menu.csv shows on the next reload. Orders stay until restart.
 * The keys are random for each run: nothing typed here is kept.
 */
/** @type {{ DB: ReturnType<typeof createD1>, env: Record<string, unknown> } | null} */
let local = null;
function localWorker() {
  if (!local) {
    const DB = createD1().migrate();
    DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
    const key = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    local = {
      DB,
      env: { DB, ASSETS: devAssets, ENVIRONMENT: 'dev', FIELD_KEY: key(), LOOKUP_KEY: key() },
    };
  }
  return local;
}

/** The asset layer as the Worker sees it: only the dev release manifest is needed. */
const devAssets = {
  /** @param {Request} request */
  async fetch(request) {
    if (new URL(request.url).pathname !== '/r/dev/manifest.json')
      return new Response('', { status: 404 });
    const modules = Object.fromEntries(
      loadDemo().modules.map((m) => [
        m.key,
        { entry: `/r/dev/m/${m.key}/client.js`, texts: m.texts },
      ]),
    );
    return Response.json({
      version: 'dev',
      platformApi: 1,
      entry: RELEASE.entry,
      css: RELEASE.css,
      modules,
    });
  },
};

/**
 * @param {string} method
 * @param {URL} url
 * @param {string} [body]
 */
async function api(method, url, body) {
  const { DB, env } = localWorker();
  if (url.pathname === '/api/boot') {
    DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: 'dev', replace: true }));
    clearCaches();
    clearManifests();
  }
  const request = new Request(url, {
    method,
    ...(body && method !== 'GET' && method !== 'HEAD' ? { body } : {}),
  });
  // --now (dev only): pretend it is another time, to try ordering at night.
  if (devNow && url.pathname === '/api/orders' && method === 'POST') {
    const response = await handleCreateOrder(request, /** @type {any} */ (env), devNow);
    return {
      status: response.status,
      type: response.headers.get('content-type') ?? undefined,
      body: await response.text(),
    };
  }
  const response = await worker.fetch(
    new Request(url, {
      method,
      ...(body && method !== 'GET' && method !== 'HEAD' ? { body } : {}),
    }),
    /** @type {any} */ (env),
    { waitUntil: () => {} },
  );
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? undefined,
    body: await response.text(),
  };
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

function run() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8787' },
      host: { type: 'string', default: '127.0.0.1' },
      now: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.now) devNow = new Date(values.now);
  const demo = loadDemo();
  if (demo.errors.length) {
    process.stderr.write(`The demo café has problems:\n  ${demo.errors.join('\n  ')}\n`);
    process.exitCode = 1;
    return;
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      /** @type {Buffer[]} */
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const out = await handle(req.method ?? 'GET', url, Buffer.concat(chunks).toString('utf8'));
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
