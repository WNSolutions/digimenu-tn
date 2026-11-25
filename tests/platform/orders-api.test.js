// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { loadKeys, open } from '../../platform/shell/src/crypto.js';
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const key = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
// Wednesday 25 Nov 2026, 11:30 in Tunis: the demo café is open (07:00–23:00).
const OPEN = new Date('2026-11-25T10:30:00Z');

/** @param {{ keys?: boolean, notice?: boolean }} [o] */
function setup(o = {}) {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  if (o.notice !== false)
    DB.exec(
      noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json'), '2026-11-25T09:00:00Z'),
    );
  DB.exec(
    seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', now: '2026-11-25T09:00:00Z' }),
  );
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ...(o.keys !== false ? { FIELD_KEY: key(), LOOKUP_KEY: key(), KEY_VERSION: '1' } : {}),
  });
  return { DB, env };
}

/** Variant ids from the demo menu by name. */
async function variants(/** @type {any} */ DB) {
  const rows = (
    await DB.prepare(
      `SELECT v.id, json_extract(i.name, '$.fr') AS item, json_extract(v.name, '$.fr') AS variant, v.price, v.available, i.available AS item_available
       FROM variants v JOIN items i ON i.id = v.item_id`,
    ).all()
  ).results;
  /** @param {string} item @param {string} [variant] */
  return (item, variant) => {
    const row = rows.find(
      (/** @type {any} */ r) => r.item === item && (variant ? r.variant === variant : true),
    );
    assert.ok(row, `no ${item} ${variant ?? ''} in the demo menu`);
    return /** @type {any} */ (row);
  };
}

let n = 0;
const clientKey = () => `test-key-${String(++n).padStart(8, '0')}-abcdef`;

/** @param {any} env @param {any} body @param {Date} [now] */
async function order(env, body, now = OPEN) {
  const { handleCreateOrder } = await import('../../platform/shell/src/orders-api.js');
  const request = new Request('https://x/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return handleCreateOrder(request, env, now);
}

const base = (/** @type {any} */ v) => ({
  cafe: 'demo',
  clientKey: clientKey(),
  type: 'dine_in',
  channel: 'whatsapp_handoff',
  table: '5',
  code: '7QF3K9',
  lang: 'ar',
  lines: [
    { variantId: v('Express').id, qty: 2, note: '  bien chaud ' },
    { variantId: v('Café crème', 'Grand').id, qty: 1 },
  ],
  note: 'à servir ensemble',
  customer: { firstName: ' Amel ', phone: '20 123 456' },
  consents: { orderUpdates: true, marketing: false, loyalty: true },
  noticeVersion: 1,
});

test('an order is priced on the server, numbered, and stored with customer and consents', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  const body = /** @type {any} */ (base(v));
  body.lines[0].price = 1; // ignored: prices come from the published menu
  const res = await order(env, body);
  assert.equal(res.status, 201);
  const out = await res.json();
  assert.equal(out.number, 'A1');
  assert.equal(out.status, 'handoff');
  assert.equal(out.total, v('Express').price * 2 + v('Café crème', 'Grand').price);
  assert.equal(out.lines[0].note, 'bien chaud');
  assert.equal(out.table, '5');

  const stored = await DB.prepare('SELECT * FROM orders').first();
  assert.equal(stored?.channel, 'whatsapp_handoff');
  assert.equal(stored?.is_test, 1, 'demo café orders are test orders');
  assert.doesNotMatch(String(stored?.contact_ct), /Amel|20123456/, 'contact is encrypted');
  const customer = await DB.prepare('SELECT * FROM customers').first();
  assert.equal(customer?.phone_last3, '456');
  assert.doesNotMatch(JSON.stringify(customer), /Amel|20123456/);
  const keys = await loadKeys(env);
  assert.deepEqual(await open(/** @type {any} */ (keys), String(customer?.pii_ct)), {
    firstName: 'Amel',
    phone: '+21620123456',
  });
  const consents = (
    await DB.prepare(
      'SELECT purpose, granted, notice_version, language FROM consents ORDER BY purpose',
    ).all()
  ).results;
  assert.deepEqual(
    consents.map((c) => [c.purpose, c.granted, c.notice_version, c.language]),
    [
      ['loyalty', 1, 1, 'ar'],
      ['marketing', 0, 1, 'ar'],
      ['order_updates', 1, 1, 'ar'],
    ],
  );
});

test('a retry with the same client key returns the same order; the next order gets the next number', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  const body = base(v);
  const first = await (await order(env, body)).json();
  const again = await order(env, body);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).number, first.number);
  const second = await (await order(env, base(v))).json();
  assert.equal(second.number, 'A2');
  assert.equal(
    (await DB.prepare('SELECT COUNT(*) AS n FROM customers').first())?.n,
    1,
    'one record per phone',
  );
});

test('sold-out items, a wrong table code and bad quantities are refused with a reason', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  const soldOut = base(v);
  soldOut.lines.push({ variantId: v('Cappuccino').id, qty: 1 });
  const res = await order(env, soldOut);
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'unavailable', items: [v('Cappuccino').id] });

  assert.equal(
    (await (await order(env, { ...base(v), code: 'AAAAAA' })).json()).error,
    'table_code',
  );
  assert.equal(
    (
      await (
        await order(env, { ...base(v), lines: [{ variantId: v('Express').id, qty: 21 }] })
      ).json()
    ).error,
    'bad_quantity',
  );
  assert.equal(
    (
      await (
        await order(env, { ...base(v), lines: [{ variantId: v('Express').id, qty: 1.5 }] })
      ).json()
    ).error,
    'bad_quantity',
  );
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM orders').first())?.n, 0);
});

test('customer details are required for dine-in by default, and checked', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  assert.equal(
    (await (await order(env, { ...base(v), customer: undefined })).json()).error,
    'customer_details',
  );
  assert.equal(
    (await (await order(env, { ...base(v), customer: { firstName: 'Amel', phone: '123' } })).json())
      .error,
    'customer_details',
  );
  assert.equal(
    (await order(env, { ...base(v), customer: { firstName: 'Sami', phone: '+33612345678' } }))
      .status,
    201,
  );
});

test('no customer data without the keys or the notice; a changed notice is reported', async () => {
  const v = await variants(setup().DB);
  assert.equal(
    (await (await order(setup({ keys: false }).env, base(v))).json()).error,
    'customer_data_unavailable',
  );
  assert.equal(
    (await (await order(setup({ notice: false }).env, base(v))).json()).error,
    'no_privacy_notice',
  );
  assert.equal(
    (await (await order(setup().env, { ...base(v), noticeVersion: 0 })).json()).error,
    'notice_changed',
  );
});

test('closed café, unknown channel and too many orders from one table are refused', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  const night = new Date('2026-11-25T02:30:00Z');
  assert.equal((await (await order(env, base(v), night)).json()).error, 'closed');
  assert.equal(
    (await (await order(env, { ...base(v), channel: 'telegram' })).json()).error,
    'ordering_off',
  );
  for (let i = 0; i < 5; i++) assert.equal((await order(env, base(v))).status, 201);
  assert.equal((await order(env, base(v))).status, 429);
});

test('the phone checks its order status with its client key only', async () => {
  const { DB, env } = setup();
  const v = await variants(DB);
  const body = base(v);
  await order(env, body);
  const ctx = { waitUntil() {} };
  const res = await worker.fetch(
    new Request(`https://x/api/orders/status?cafe=demo&key=${body.clientKey}`),
    env,
    ctx,
  );
  assert.deepEqual(await res.json(), { number: 'A1', status: 'handoff' });
  const other = await worker.fetch(
    new Request(`https://x/api/orders/status?cafe=demo&key=${clientKey()}`),
    env,
    ctx,
  );
  assert.equal(other.status, 404);
});
