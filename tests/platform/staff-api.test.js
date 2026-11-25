// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { lockFor } from '../../platform/shell/src/auth.js';
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const ITER = 310_000;

function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  DB.exec(
    accountSql({ username: 'amel', name: 'Amel', role: 'staff', cafe: 'demo', code: 'ABCDEFGH34' }),
  );
  DB.exec(
    accountSql({
      username: 'karim',
      name: 'Karim',
      role: 'manager',
      cafe: 'demo',
      code: 'KKKKKKKK34',
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
  /** @type {string} */
  let cookie = '';
  /**
   * @param {string} p
   * @param {any} [body]
   * @param {{ origin?: string, cookie?: string }} [o]
   */
  const call = async (p, body, o = {}) => {
    const headers = /** @type {Record<string, string>} */ ({});
    if (body) {
      headers['content-type'] = 'application/json';
      headers.origin = o.origin ?? ORIGIN;
    }
    const c = o.cookie ?? cookie;
    if (c) headers.cookie = c;
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
    return { status: res.status, data: await res.json(), set };
  };
  /** The browser's part of the password check (ADR-0006). */
  const stretch = (/** @type {string} */ pw, /** @type {string} */ salt) =>
    pbkdf2Sync(pw, Buffer.from(salt, 'base64'), ITER, 32, 'sha256').toString('base64');
  /** @param {string} user @param {string} code @param {string} pw */
  const setPassword = async (user, code, pw) => {
    const salt = rnd().slice(0, 24);
    return call('/admin/api/auth/setup', {
      username: user,
      code,
      salt,
      iterations: ITER,
      key: stretch(pw, salt),
    });
  };
  /** @param {string} user @param {string} pw */
  const signIn = async (user, pw) => {
    const salt = await call('/admin/api/auth/salt', { username: user });
    return call('/admin/api/auth/sign-in', { username: user, key: stretch(pw, salt.data.salt) });
  };
  return { DB, env, call, setPassword, signIn, clearCookie: () => (cookie = '') };
}

test('first password with the one-time code, then sign-in with a host-only session cookie', async () => {
  const s = setup();
  const first = await s.setPassword('amel', 'ABCDEFGH34', 'correct horse battery');
  assert.equal(first.status, 200);
  assert.match(
    String(first.set),
    /^__Host-dm_sid=[A-Za-z0-9_-]{40,}; HttpOnly; Secure; SameSite=Strict; Path=\//,
  );
  assert.equal((await s.call('/admin/api/auth/me')).data.username, 'amel');
  assert.equal(
    (await s.setPassword('amel', 'ABCDEFGH34', 'another one 123')).status,
    401,
    'a code works once',
  );

  s.clearCookie();
  assert.equal((await s.call('/admin/api/auth/me')).status, 401);
  assert.equal((await s.signIn('amel', 'wrong password!')).status, 401);
  const ok = await s.signIn('amel', 'correct horse battery');
  assert.equal(ok.status, 200);
  const stored = await s.DB.prepare(
    "SELECT password_hash FROM users WHERE username = 'amel'",
  ).first();
  assert.match(String(stored?.password_hash), /^pbkdf2c-sha256\$310000\$[^$]+\$[^$]+\$p1$/);
  assert.doesNotMatch(String(stored?.password_hash), /correct horse/);
});

test('unknown accounts get a stable fake salt; failures slow down sign-in', async () => {
  const s = setup();
  const a = await s.call('/admin/api/auth/salt', { username: 'nobody' });
  const b = await s.call('/admin/api/auth/salt', { username: 'nobody' });
  assert.equal(a.data.salt, b.data.salt);
  assert.equal(lockFor(4), 0);
  assert.equal(lockFor(5), 10_000);
  assert.equal(lockFor(30), 15 * 60_000);
  await s.setPassword('amel', 'ABCDEFGH34', 'correct horse battery');
  s.clearCookie();
  for (let i = 0; i < 5; i++) await s.signIn('amel', 'nope nope nope');
  assert.equal(
    (await s.signIn('amel', 'correct horse battery')).status,
    429,
    'locked for a moment after 5 failures',
  );
});

test('cross-site posts and the customer host are refused', async () => {
  const s = setup();
  assert.equal(
    (await s.call('/admin/api/auth/salt', { username: 'amel' }, { origin: 'https://evil.example' }))
      .status,
    403,
  );
  s.env.ADMIN_ON_MAIN_HOST = '0';
  assert.equal((await s.call('/admin/api/auth/salt', { username: 'amel' })).status, 404);
});

test('staff confirm a WhatsApp order; customer contact shows only the first name for dine-in', async () => {
  const s = setup();
  const { handleCreateOrder } = await import('../../platform/shell/src/orders-api.js');
  const v = await s.DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  const order = await handleCreateOrder(
    new Request('https://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        cafe: 'demo',
        clientKey: 'staff-test-key-000000001',
        type: 'dine_in',
        channel: 'whatsapp_handoff',
        table: '5',
        code: '7QF3K9',
        lines: [{ variantId: v?.id, qty: 2 }],
        customer: { firstName: 'Sami', phone: '22333444' },
        consents: { orderUpdates: true },
        noticeVersion: 1,
        lang: 'fr',
      }),
    }),
    s.env,
    new Date('2026-11-25T10:30:00Z'),
  );
  assert.equal(order.status, 201);
  await s.setPassword('amel', 'ABCDEFGH34', 'correct horse battery');
  // Orders of "today" in Tunis: read them on the order's day.
  const { handleAdmin } = await import('../../platform/shell/src/admin-api.js');
  const cookie = String((await s.signIn('amel', 'correct horse battery')).set).split(';')[0];
  const list = await handleAdmin(
    new Request(`${ORIGIN}/admin/api/orders?cafe=demo`, { headers: { cookie } }),
    s.env,
    'orders',
    new Date('2026-11-25T11:00:00Z'),
  );
  const orders = (await list.json()).orders;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, 'handoff');
  assert.deepEqual(orders[0].contact, { firstName: 'Sami' }, 'no phone for dine-in');

  const post = (/** @type {any} */ body) =>
    handleAdmin(
      new Request(`${ORIGIN}/admin/api/orders/status`, {
        method: 'POST',
        headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      s.env,
      'orders/status',
      new Date('2026-11-25T11:00:00Z'),
    );
  assert.equal(
    (await post({ cafe: 'demo', id: orders[0].id, status: 'served' })).status,
    409,
    'must be confirmed first',
  );
  assert.equal((await post({ cafe: 'demo', id: orders[0].id, status: 'accepted' })).status, 200);
  const row = await s.DB.prepare('SELECT status, accepted_at FROM orders').first();
  assert.equal(row?.status, 'accepted');
  assert.ok(row?.accepted_at);
});

test('staff mark sold out; only managers change prices; each change publishes a new menu revision', async () => {
  const s = setup();
  const variant = await s.DB.prepare(
    "SELECT v.id, v.price FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  await s.setPassword('amel', 'ABCDEFGH34', 'correct horse battery');
  assert.equal(
    (await s.call('/admin/api/menu/variant', { cafe: 'demo', id: variant?.id, price: 1800 }))
      .status,
    403,
  );
  const soldOut = await s.call('/admin/api/menu/variant', {
    cafe: 'demo',
    id: variant?.id,
    available: false,
  });
  assert.equal(soldOut.status, 200);
  assert.equal(soldOut.data.rev, 2);

  s.clearCookie();
  await s.setPassword('karim', 'KKKKKKKK34', 'manager password 1');
  assert.equal(
    (await s.call('/admin/api/menu/variant', { cafe: 'demo', id: variant?.id, price: 1.5 })).status,
    422,
  );
  assert.equal(
    (await s.call('/admin/api/menu/variant', { cafe: 'demo', id: variant?.id, price: 1800 })).data
      .rev,
    3,
  );

  const boot = await (
    await worker.fetch(
      new Request(`${ORIGIN}/api/boot?cafe=demo`),
      {
        ...s.env,
        ASSETS: {
          fetch: async () =>
            Response.json({
              version: '0.1.0',
              platformApi: 1,
              entry: '/r/0.1.0/a.js',
              css: '/r/0.1.0/a.css',
              modules: {},
            }),
        },
      },
      { waitUntil() {} },
    )
  ).json();
  const all = boot.menu.categories.flatMap((/** @type {any} */ c) =>
    c.groups.flatMap((/** @type {any} */ g) =>
      g.items.flatMap((/** @type {any} */ i) => i.variants),
    ),
  );
  const express = all.find((/** @type {any} */ x) => x.id === variant?.id);
  assert.deepEqual([boot.menu.rev, express.price, express.available], [3, 1800, false]);
  const changes = (
    await s.DB.prepare(
      "SELECT field, after, actor_role FROM menu_changes WHERE source = 'editor' ORDER BY rev",
    ).all()
  ).results;
  assert.deepEqual(
    changes.map((c) => [c.field, c.after, c.actor_role]),
    [
      ['available', 'false', 'staff'],
      ['price', '1800', 'manager'],
    ],
  );
});

test('an account with no role in the café sees nothing', async () => {
  const s = setup();
  s.DB.exec(
    accountSql({
      username: 'other',
      name: 'Other',
      role: 'staff',
      cafe: 'elsewhere',
      code: 'OOOOOOOO34',
    }),
  );
  await s.setPassword('other', 'OOOOOOOO34', 'other password 1');
  assert.equal((await s.call('/admin/api/orders?cafe=demo')).status, 403);
  assert.equal((await s.call('/admin/api/menu?cafe=demo')).status, 403);
});
