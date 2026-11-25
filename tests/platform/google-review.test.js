// @ts-check
/**
 * Google review invitation (issue #26, US-44, M-14): counts only, checked against the phone's
 * own served order; a module that lacks a needed setting stays off everywhere.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { handleCreateOrder } from '../../platform/shell/src/orders-api.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { enabledModules } from '../../platform/shell/src/boot-body.js';
import { serverModules, serverApi } from '../../platform/shell/src/module-host.js';
import { missingNeeds, needsWarnings } from '../../platform/shell/src/module-needs.js';
import { loadDemo, moduleNeeds } from '../../tools/demo/boot.js';
import { seedSql, noticeSql, seedWarnings } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const OPEN = new Date('2026-11-18T10:30:00Z');

async function setup({ status = 'live' } = {}) {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status }));
  DB.exec(
    accountSql({
      username: 'nadia',
      name: 'Nadia',
      role: 'manager',
      cafe: 'demo',
      code: 'EEEEEEEE34',
    }),
  );
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });
  /** @param {string} p @param {any} [body] @param {string} [cookie] */
  const call = async (p, body, cookie = '') => {
    /** @type {Record<string, string>} */
    const headers = body ? { 'content-type': 'application/json', origin: ORIGIN } : {};
    if (cookie) headers.cookie = cookie;
    const res = await worker.fetch(
      new Request(ORIGIN + p, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      { waitUntil() {} },
    );
    return { status: res.status, data: /** @type {any} */ (await res.json()), res };
  };
  const v = await DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  /** @param {string} clientKey */
  const order = async (clientKey) =>
    handleCreateOrder(
      new Request('https://x/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          cafe: 'demo',
          clientKey,
          type: 'takeaway',
          channel: 'whatsapp_handoff',
          lines: [{ variantId: v?.id, qty: 1 }],
          noticeVersion: 1,
          lang: 'fr',
          customer: { firstName: 'Rim', phone: '22 333 444' },
          consents: { orderUpdates: true },
        }),
      }),
      env,
      OPEN,
    );
  /** @param {string} key @param {string} status */
  const setStatus = (key, status) =>
    DB.prepare('UPDATE orders SET status = ?1 WHERE client_key = ?2').bind(status, key).run();
  /** @param {any} body */
  const count = (body) => call('/api/m/google_review/count', { cafe: 'demo', ...body });
  async function manager() {
    const salt = rnd().slice(0, 24);
    const key = pbkdf2Sync(
      'correct horse battery',
      Buffer.from(salt, 'base64'),
      310_000,
      32,
      'sha256',
    );
    const done = await call('/admin/api/auth/setup', {
      username: 'nadia',
      code: 'EEEEEEEE34',
      salt,
      iterations: 310_000,
      key: key.toString('base64'),
    });
    assert.equal(done.status, 200);
    const cookie = String(done.res.headers.get('set-cookie')).split(';')[0];
    return (/** @type {string} */ p) => call(p, undefined, cookie);
  }
  return { DB, env, order, setStatus, count, manager };
}

test('invitations shown and taps are counted only for the phone’s own served order', async () => {
  const s = await setup();
  const key = 'review-test-0000001';
  assert.equal((await s.order(key)).status, 201);

  assert.equal((await s.count({ event: 'shown', key })).status, 409, 'not served yet');
  assert.equal((await s.count({ event: 'shown', key: 'nobody-has-this-key' })).status, 404);
  assert.equal((await s.count({ event: 'shown', key: 'short' })).status, 404);
  assert.equal((await s.count({ event: 'rating', key })).status, 400, 'only shown and tap');

  await s.setStatus(key, 'served');
  const shown = await s.count({ event: 'shown', key });
  assert.equal(shown.status, 200);
  assert.equal(shown.data.counted, true);
  assert.equal((await s.count({ event: 'tap', key })).status, 200);
  assert.equal((await s.count({ event: 'tap', key })).status, 200);

  const rows = (
    await s.DB.prepare(
      "SELECT metric, dim, value FROM analytics_counters WHERE metric LIKE 'google_review.%' ORDER BY metric",
    ).all()
  ).results.map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { metric: 'google_review.shown', dim: '', value: 1 },
    { metric: 'google_review.tap', dim: '', value: 2 },
  ]);

  // The manager sees them on "Visites", for the same period as the visits.
  const nadia = await s.manager();
  const day = (/** @type {number} */ back) =>
    new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
  const visits = await nadia(`/admin/api/visits?cafe=demo&from=${day(2)}&to=${day(-1)}`);
  assert.equal(visits.status, 200);
  assert.deepEqual(visits.data.events, { google_review: { shown: 1, tap: 2 } });
});

test('test orders are never counted (the demo café, the team trying a live café)', async () => {
  const s = await setup({ status: 'demo' });
  const key = 'review-test-0000002';
  assert.equal((await s.order(key)).status, 201);
  await s.setStatus(key, 'served');
  const res = await s.count({ event: 'tap', key });
  assert.equal(res.status, 200);
  assert.equal(res.data.counted, false);
  const n = await s.DB.prepare(
    "SELECT COUNT(*) AS n FROM analytics_counters WHERE metric LIKE 'google_review.%'",
  ).first();
  assert.equal(n?.n, 0);
});

test('without a review link the module stays off: no file at boot, no route, a warning', async () => {
  const config = loadDemo().info;
  const off = structuredClone(config);
  off.modules = { ...off.modules, google_review: { enabled: true } };
  const needs = moduleNeeds();
  assert.deepEqual(needs.google_review, ['reviewUrl']);
  assert.deepEqual(missingNeeds(off.modules.google_review.settings, needs.google_review), [
    'reviewUrl',
  ]);
  assert.deepEqual(needsWarnings(off, needs), [
    'google_review is switched on but has no settings.reviewUrl: it stays off until it is filled in.',
  ]);
  assert.deepEqual(needsWarnings(config, needs), [], 'the demo café has its link');

  const available = { google_review: { entry: '/r/x/m/google_review.js', needs: ['reviewUrl'] } };
  assert.deepEqual(
    enabledModules(off, available).map((m) => m.key),
    [],
  );
  assert.deepEqual(
    enabledModules(config, available).map((m) => m.key),
    ['google_review'],
  );
  assert.ok(!serverModules(off).some(([k]) => k === 'google_review'));
  assert.ok(serverModules(config).some(([k]) => k === 'google_review'));

  // The seed tool tells the maintainer, without stopping.
  assert.deepEqual(seedWarnings(path.join(root, 'cafes/demo')), []);

  // And its route answers 404 for that café.
  const s = await setup();
  await s.DB.prepare('UPDATE config_versions SET body = ?1 WHERE cafe_id = ?2')
    .bind(JSON.stringify(off), 'cafe-demo')
    .run();
  clearCaches();
  const key = 'review-test-0000003';
  assert.equal((await s.order(key)).status, 201);
  await s.setStatus(key, 'served');
  assert.equal((await s.count({ event: 'tap', key })).status, 404);
});

test('a module can count only the events its manifest lists', async () => {
  const s = await setup();
  const cafe = { id: 'cafe-demo', slug: 'demo', status: 'live', config: {} };
  const api = await serverApi(s.env, cafe, 'google_review', OPEN, ['shown']);
  await api.count('shown');
  await assert.rejects(api.count('tap'), /not declared/);
  assert.equal(await api.orderStatus('not a key'), null);
});
