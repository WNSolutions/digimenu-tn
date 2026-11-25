// @ts-check
/**
 * Pause orders (issue #29, US-17): staff stop new orders in a rush; customers see "show your
 * list to the waiter" and the server refuses new orders until staff resume.
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
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const OPEN = new Date('2026-11-18T10:30:00Z');

async function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  DB.exec(
    accountSql({ username: 'sami', name: 'Sami', role: 'staff', cafe: 'demo', code: 'CCCCCCCC34' }),
  );
  DB.exec(
    accountSql({
      username: 'mona',
      name: 'Mona',
      role: 'maintainer',
      cafe: 'demo',
      code: 'DDDDDDDD34',
    }),
  );
  const env = /** @type {any} */ ({
    DB,
    ASSETS: {
      fetch: async (/** @type {Request} */ r) =>
        new URL(r.url).pathname.endsWith('manifest.json')
          ? Response.json({
              version: '0.1.0',
              platformApi: 1,
              entry: '/r/0.1.0/app.js',
              css: '/r/0.1.0/app.css',
              modules: {},
            })
          : new Response('', { status: 404 }),
    },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });
  /** @param {string} user @param {string} code */
  async function person(user, code) {
    let cookie = '';
    /** @param {string} p @param {any} [body] */
    const call = async (p, body) => {
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
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, data: /** @type {any} */ (await res.json()) };
    };
    const salt = rnd().slice(0, 24);
    const key = pbkdf2Sync(
      'correct horse battery',
      Buffer.from(salt, 'base64'),
      310_000,
      32,
      'sha256',
    );
    const done = await call('/admin/api/auth/setup', {
      username: user,
      code,
      salt,
      iterations: 310_000,
      key: key.toString('base64'),
    });
    assert.equal(done.status, 200);
    return call;
  }
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
  const boot = async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/boot?cafe=demo`), env, {
      waitUntil() {},
    });
    return /** @type {any} */ (await res.json());
  };
  return { DB, env, person, order, boot };
}

test('staff pause new orders: customers are sent to the waiter, retries still answer, resume reopens', async () => {
  const s = await setup();
  const sami = await s.person('sami', 'CCCCCCCC34');
  const before = await s.order('pause-test-000001');
  assert.equal(before.status, 201);
  assert.equal((await s.boot()).ordering.paused, undefined);

  const paused = await sami('/admin/api/ordering/pause', { cafe: 'demo', paused: true });
  assert.equal(paused.status, 200);
  assert.ok(paused.data.paused);
  assert.equal((await s.boot()).ordering.paused, true, 'the menu shows it at once in this Worker');
  const refused = await s.order('pause-test-000002');
  assert.equal(refused.status, 409);
  assert.equal(/** @type {any} */ (await refused.json()).error, 'ordering_paused');
  const retry = await s.order('pause-test-000001');
  assert.equal(retry.status, 200, 'an order sent before the pause still gets its answer');
  const screen = await sami('/admin/api/orders?cafe=demo');
  assert.equal(screen.data.paused, paused.data.paused, 'the staff screen shows since when');

  const resumed = await sami('/admin/api/ordering/pause', { cafe: 'demo', paused: false });
  assert.equal(resumed.data.paused, null);
  assert.equal((await s.boot()).ordering.paused, undefined);
  assert.equal((await s.order('pause-test-000003')).status, 201);

  const log = (
    await s.DB.prepare(
      "SELECT action, actor_role FROM audit_log WHERE category = 'ordering' ORDER BY id",
    ).all()
  ).results.map((r) => `${r.action}:${r.actor_role}`);
  assert.deepEqual(log, ['pause:staff', 'resume:staff']);
});

test('a Maintainer cannot pause a café; nobody without a session can', async () => {
  const s = await setup();
  const mona = await s.person('mona', 'DDDDDDDD34');
  assert.equal(
    (await mona('/admin/api/ordering/pause', { cafe: 'demo', paused: true })).status,
    403,
  );
  const anon = await worker.fetch(
    new Request(`${ORIGIN}/admin/api/ordering/pause`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ cafe: 'demo', paused: true }),
    }),
    s.env,
    { waitUntil() {} },
  );
  assert.equal(anon.status, 401);
  assert.equal((await s.boot()).ordering.paused, undefined);
});
