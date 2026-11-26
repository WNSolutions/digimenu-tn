// @ts-check
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import { seedSql } from '../../tools/seed/seed.js';
import { buildRelease } from '../../tools/release/build.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://digimenu.example';
/** @type {string} */
let site;

before(async () => {
  site = mkdtempSync(path.join(tmpdir(), 'dm-site-'));
  await buildRelease({ version: '0.1.0', out: site });
});

/** The asset layer, serving the built site from disk. */
const assets = {
  /** @param {Request} request */
  async fetch(request) {
    const p = new URL(request.url).pathname;
    const file = path.join(site, p === '/' ? 'index.html' : p);
    if (!existsSync(file) || !file.startsWith(site)) {
      return new Response(readFileSync(path.join(site, 'index.html')), {
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response(readFileSync(file));
  },
};

function setup() {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(
    seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', now: '2026-11-25T10:00:00Z' }),
  );
  /** @type {Promise<unknown>[]} */
  const waits = [];
  const env = /** @type {any} */ ({ DB, ASSETS: assets, ENVIRONMENT: 'test' });
  const ctx = { waitUntil: (/** @type {Promise<unknown>} */ p) => void waits.push(p) };
  /** @param {string} p @param {RequestInit} [init] */
  const call = (p, init) => worker.fetch(new Request(ORIGIN + p, init), env, ctx);
  return { DB, call, waits };
}

test('boot answers with the café, a valid table, the pinned release and the menu', async () => {
  const { call } = setup();
  const res = await call('/api/boot?cafe=demo&t=5&k=7qf3k9');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('set-cookie'), null, 'customer hosts set no cookies');
  const boot = await res.json();
  assert.equal(boot.v, 1);
  assert.equal(boot.cafe.slug, 'demo');
  assert.deepEqual(boot.table, { label: '5', valid: true, code: '7QF3K9' });
  assert.equal(boot.release.version, '0.1.0');
  assert.match(boot.release.entry, /^\/r\/0\.1\.0\/app\.[0-9a-f]{10}\.js$/);
  assert.equal(boot.menu.rev, 1);
  assert.ok(boot.menu.categories.length >= 6);
  assert.equal(boot.cafe.accent['--dm-cafe-accent'], '#1F6F5C');
  assert.equal(
    boot.cafe.logo,
    '/media/demo/logo.svg',
    'the logo is a static file, not a Worker call',
  );
  const wa = boot.modules.find((/** @type {any} */ m) => m.key === 'whatsapp_handoff');
  assert.match(wa.entry, /^\/r\/0\.1\.0\/m\/whatsapp_handoff\.[0-9a-f]{10}\.js$/);
  assert.equal(wa.texts.fr['action.label'], 'Commander par WhatsApp');
});

test('wrong code, unknown table and no table still open the menu', async () => {
  const { call } = setup();
  assert.deepEqual((await (await call('/api/boot?cafe=demo&t=5&k=AAAAAA')).json()).table, {
    label: '5',
    valid: false,
  });
  assert.equal((await (await call('/api/boot?cafe=demo&t=99&k=AAAAAA')).json()).table, null);
  assert.equal((await (await call('/api/boot?cafe=demo')).json()).table, null);
});

test('unknown café, bad slug and wrong method get a clear error', async () => {
  const { call } = setup();
  assert.equal((await call('/api/boot?cafe=nope')).status, 404);
  assert.equal((await call('/api/boot?cafe=../x')).status, 404);
  assert.equal((await call('/api/boot?cafe=demo', { method: 'POST' })).status, 405);
  assert.equal((await call('/api/unknown')).status, 404);
  assert.deepEqual(await (await call('/api/health')).json(), { ok: true, environment: 'test' });
});

test('a first visit in the tab is counted once, by table and language, with no personal data', async () => {
  const { call, DB, waits } = setup();
  await call('/api/boot?cafe=demo&t=5&k=7QF3K9&lang=ar&nv=1');
  await call('/api/boot?cafe=demo&t=5&k=7QF3K9&lang=ar&nv=1');
  await call('/api/boot?cafe=demo&t=5&k=7QF3K9&lang=ar');
  await call('/api/boot?cafe=demo&lang=xx&nv=1');
  await Promise.all(waits);
  const rows = (
    await DB.prepare(
      "SELECT dim, value FROM analytics_counters WHERE metric = 'visit' ORDER BY dim",
    ).all()
  ).results;
  assert.deepEqual(
    rows.map((r) => [r.dim, r.value]),
    [
      ['-|-', 1],
      ['t5|ar', 2],
    ],
  );
});

test('pages that are not /api go to the static assets', async () => {
  const { call } = setup();
  const page = await call('/demo/t/5?k=7QF3K9');
  assert.match(await page.text(), /<script type="module" src="\/boot.js">/);
});

test('the release build writes hashed files, a manifest and a CSP that allows only its own style', () => {
  const manifest = JSON.parse(readFileSync(path.join(site, 'r/0.1.0/manifest.json'), 'utf8'));
  assert.ok(existsSync(path.join(site, manifest.entry)));
  assert.ok(existsSync(path.join(site, manifest.css)));
  // What a module cannot work without travels with it, so the boot can leave it out.
  assert.deepEqual(manifest.modules.google_review.needs, ['reviewUrl']);
  assert.equal(manifest.modules.loyalty.needs, undefined);
  const headers = readFileSync(path.join(site, '_headers'), 'utf8');
  assert.match(headers, /script-src 'self';/);
  assert.match(headers, /style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(headers, /\/r\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  // The CSP blocks style attributes: release code must not write any.
  const core = readFileSync(path.join(site, manifest.entry), 'utf8');
  assert.doesNotMatch(core, /style=/);
  // "Ma commande" and the Info sheet are files of their own, loaded only when needed; the
  // core imports nothing at start.
  const parts = readdirSync(path.join(site, 'r/0.1.0'))
    .filter((f) => f.startsWith('part.'))
    .sort();
  assert.equal(parts.length, 2);
  assert.match(parts[0], /^part\.info-sheet\.[A-Z0-9]+\.js$/);
  assert.match(parts[1], /^part\.order-track\.[A-Z0-9]+\.js$/);
  for (const part of parts) {
    assert.ok(core.includes(`import("./${part}")`));
    assert.doesNotMatch(readFileSync(path.join(site, 'r/0.1.0', part), 'utf8'), /style=|^import/);
  }
  assert.doesNotMatch(core, /(^|[;}])import\s*[{*"]/);
  // Customer pages may not use the camera; the staff app may (scanning loyalty cards).
  assert.match(headers, /\/\*\n(.*\n)*? {2}Permissions-Policy: camera=\(\)/);
  assert.match(
    headers,
    /\/admin\/\*\n(.*\n)*? {2}! Permissions-Policy\n {2}Permissions-Policy: camera=\(self\)/,
  );
  const scan = readFileSync(path.join(site, 'admin/scan.js'), 'utf8');
  assert.match(scan, /^\/\*! jsQR \d+\.\d+\.\d+ \| Apache License 2\.0/);
  assert.doesNotMatch(readFileSync(path.join(site, 'admin/admin.js'), 'utf8'), /jsQR/);
});

test('seeding again with --replace refreshes the menu and keeps the café row and its counters', async () => {
  const { call, DB, waits } = setup();
  await call('/api/boot?cafe=demo&t=5&k=7QF3K9&lang=fr&nv=1');
  await Promise.all(waits);
  DB.exec(
    seedSql({
      dir: path.join(root, 'cafes/demo'),
      release: '0.1.0',
      replace: true,
      now: '2026-11-26T10:00:00Z',
    }),
  );
  clearCaches();
  const boot = await (await call('/api/boot?cafe=demo&t=5&k=7QF3K9')).json();
  assert.equal(boot.menu.rev, 1);
  const counted = await DB.prepare(
    "SELECT SUM(value) AS n FROM analytics_counters WHERE cafe_id = 'cafe-demo'",
  ).first();
  assert.equal(counted?.n, 1);
});
