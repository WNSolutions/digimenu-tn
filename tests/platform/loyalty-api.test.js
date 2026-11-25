// @ts-check
/**
 * loyalty (M-15) through the real Worker on an in-memory D1: joining at checkout, stamps on
 * staff confirmation only, the card page, counter stamps, rewards, a new phone, leaving.
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
const ITER = 310_000;
// Wednesday 25 Nov 2026, 11:30 in Tunis: the demo café is open.
const OPEN = new Date('2026-11-25T10:30:00Z');

/** @param {{ loyalty?: boolean }} [o] */
async function setup(o = {}) {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  if (o.loyalty === false) {
    DB.exec(
      `UPDATE config_versions SET body = json_set(body, '$.modules.loyalty.enabled', json('false'))`,
    );
  }
  DB.exec(
    accountSql({ username: 'amel', name: 'Amel', role: 'staff', cafe: 'demo', code: 'ABCDEFGH34' }),
  );
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });
  let cookie = '';
  /** @param {string} p @param {any} [body] */
  const call = async (p, body) => {
    /** @type {Record<string, string>} */
    const headers = {};
    if (body) {
      headers['content-type'] = 'application/json';
      headers.origin = ORIGIN;
    }
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
    return { status: res.status, data: await res.json() };
  };
  const salt = rnd().slice(0, 24);
  const setup = await call('/admin/api/auth/setup', {
    username: 'amel',
    code: 'ABCDEFGH34',
    salt,
    iterations: ITER,
    key: pbkdf2Sync(
      'correct horse battery',
      Buffer.from(salt, 'base64'),
      ITER,
      32,
      'sha256',
    ).toString('base64'),
  });
  assert.equal(setup.status, 200);
  const express = await DB.prepare(
    "SELECT v.id, v.price FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  let n = 0;
  /** @param {Record<string, unknown>} [extra] */
  const order = async (extra = {}) => {
    const res = await handleCreateOrder(
      new Request('https://x/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          cafe: 'demo',
          clientKey: `loyalty-test-${String(++n).padStart(6, '0')}-key`,
          type: 'dine_in',
          channel: 'whatsapp_handoff',
          table: '5',
          code: '7QF3K9',
          lines: [{ variantId: express?.id, qty: 1 }],
          customer: { firstName: 'Sami', phone: '22 333 444' },
          consents: { orderUpdates: true },
          noticeVersion: 1,
          lang: 'fr',
          ...extra,
        }),
      }),
      env,
      OPEN,
    );
    return { status: res.status, data: await res.json() };
  };
  /** @param {string} id @param {string} status */
  const setStatus = (id, status) => call('/admin/api/orders/status', { cafe: 'demo', id, status });
  /** @param {string} route @param {any} body */
  const staff = (route, body) => call(`/admin/api/m/loyalty/${route}`, { cafe: 'demo', ...body });
  /** @param {string} route @param {any} body */
  const customer = (route, body) => call(`/api/m/loyalty/${route}`, { cafe: 'demo', ...body });
  return { DB, env, call, order, setStatus, staff, customer, clearCookie: () => (cookie = '') };
}

test('joining at checkout makes a card; the token reaches this phone only, also on a retry', async () => {
  const s = await setup();
  const joined = await s.order({
    clientKey: 'loyalty-join-key-000001',
    consents: { orderUpdates: true, loyalty: true },
  });
  assert.equal(joined.status, 201);
  const card = joined.data.modules.loyalty;
  assert.equal(card.joined, true);
  assert.match(card.token, /^[A-Za-z0-9_-]{32}$/);
  assert.match(card.number, /^[A-Z0-9]{6}$/);
  assert.equal(card.stamps, 0);
  assert.equal(card.stampsNeeded, 10);
  assert.equal(joined.data.customerId, undefined, 'the customer id stays on the server');

  const retry = await s.order({
    clientKey: 'loyalty-join-key-000001',
    consents: { orderUpdates: true, loyalty: true },
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.modules.loyalty.token, card.token, 'a retried order gets its card');

  const stored = await s.DB.prepare('SELECT token_sha256, token_ct FROM loyalty_cards').first();
  assert.notEqual(stored?.token_sha256, card.token);
  assert.doesNotMatch(String(stored?.token_ct), new RegExp(card.token));
  const consent = await s.DB.prepare(
    "SELECT granted FROM consents WHERE purpose = 'loyalty'",
  ).all();
  assert.deepEqual(
    consent.results.map((r) => r.granted),
    [1],
  );

  // Someone typing the same number on another phone learns nothing about the card.
  const other = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  assert.deepEqual(other.data.modules.loyalty, { known: true });
  const quiet = await s.order();
  assert.equal(quiet.data.modules, undefined);
  // The phone holding the card sees its stamps.
  const mine = await s.order({ modules: { loyalty: { token: card.token } } });
  assert.equal(mine.data.modules.loyalty.member, true);
  assert.equal(mine.data.modules.loyalty.number, card.number);
});

test('a stamp only when staff confirm; a rejected order takes it back; one stamp per order', async () => {
  const s = await setup();
  const joined = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  const token = joined.data.modules.loyalty.token;
  const page = () => s.customer('card', { token });
  assert.equal((await page()).data.stamps, 0, 'storing the order adds nothing');

  assert.equal((await s.setStatus(joined.data.id, 'accepted')).status, 200);
  assert.equal((await page()).data.stamps, 1);
  await s.setStatus(joined.data.id, 'accepted');
  assert.equal((await page()).data.stamps, 1, 'a second tap adds nothing');

  const second = await s.order({ channel: 'whatsapp_handoff' });
  await s.setStatus(second.data.id, 'unconfirmed');
  assert.equal((await page()).data.stamps, 1, '"Pas reçue" gives no stamp');
  await s.setStatus(second.data.id, 'accepted');
  assert.equal((await page()).data.stamps, 2, 'received after all: the stamp comes');
  await s.setStatus(second.data.id, 'rejected');
  assert.equal((await page()).data.stamps, 1, 'rejected: the stamp goes back');

  assert.equal((await s.customer('card', { token: 'x'.repeat(32) })).status, 404);
  assert.equal((await s.customer('card', { token: 'short' })).status, 404);
});

test('staff find a card, stamp at the counter (once per 10 minutes, with undo) and use a reward', async () => {
  const s = await setup();
  const joined = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  const { number, token } = joined.data.modules.loyalty;

  const byNumber = await s.staff('find', { number: number.toLowerCase().replace(/(...)/, '$1 ') });
  assert.equal(byNumber.status, 200);
  assert.equal(byNumber.data.firstName, 'Sami');
  assert.equal(byNumber.data.phoneLast3, '444');
  assert.equal(byNumber.data.phone, undefined);
  assert.equal((await s.staff('find', { phone: '+216 22 333 444' })).data.number, number);
  assert.equal((await s.staff('find', { phone: '22333445' })).status, 404);
  assert.equal((await s.staff('find', { number: 'AAAAAA' })).status, 404);

  const stamped = await s.staff('stamp', { number });
  assert.equal(stamped.data.stamps, 1);
  assert.equal(stamped.data.canUndo, true);
  const again = await s.staff('stamp', { number });
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'too_soon');
  const undone = await s.staff('undo', { number });
  assert.equal(undone.data.stamps, 0);
  assert.equal((await s.staff('undo', { number })).status, 409);

  assert.equal((await s.staff('redeem', { number })).data.error, 'no_reward');
  // Ten stamps: one from each of ten accepted takeaway orders (no per-table limit).
  for (let i = 0; i < 10; i++) {
    const o = await s.order({ type: 'takeaway', table: undefined, code: undefined });
    assert.equal(o.status, 201);
    await s.setStatus(o.data.id, 'accepted');
  }
  const full = await s.staff('find', { number });
  assert.equal(full.data.stamps, 10);
  assert.equal(full.data.rewards, 1);
  assert.deepEqual(full.data.reward, {
    fr: 'Un café offert',
    ar: 'قهوة مجانية',
    en: 'A free coffee',
  });
  const used = await s.staff('redeem', { number });
  assert.equal(used.data.stamps, 0);
  assert.equal(used.data.rewards, 0);
  assert.equal((await s.customer('card', { token })).data.stamps, 0);

  const audit = await s.DB.prepare("SELECT action FROM audit_log WHERE category = 'loyalty'").all();
  assert.deepEqual(
    audit.results.map((r) => r.action).sort(),
    ['find', 'find', 'find_by_phone', 'redeem', 'stamp', 'undo'],
    'every card opened, stamp, undo and reward is logged',
  );

  s.clearCookie();
  assert.equal((await s.staff('find', { number })).status, 401, 'signed-out staff get nothing');
});

test('a new phone opens the card with a one-time code from staff; the old link stops', async () => {
  const s = await setup();
  const joined = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  const { number, token } = joined.data.modules.loyalty;
  const given = await s.staff('transfer', { number });
  assert.equal(given.status, 200);
  assert.match(given.data.code, /^[A-Z0-9]{10}$/);

  assert.equal((await s.customer('claim', { code: 'AAAAAAAAAA' })).status, 422);
  const claimed = await s.customer('claim', {
    code: given.data.code.toLowerCase().replace(/(.{5})/, '$1-'),
  });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.data.number, number);
  assert.notEqual(claimed.data.token, token);
  assert.equal((await s.customer('card', { token })).status, 404, 'the old phone loses it');
  assert.equal((await s.customer('card', { token: claimed.data.token })).status, 200);
  assert.equal(
    (await s.customer('claim', { code: given.data.code })).status,
    422,
    'a code works once',
  );
});

test('leaving clears the stamps and records the choice; joining again starts a new card page', async () => {
  const s = await setup();
  const joined = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  const { number, token } = joined.data.modules.loyalty;
  await s.setStatus(joined.data.id, 'accepted');
  assert.equal((await s.customer('leave', { token, lang: 'ar' })).data.left, true);
  assert.equal((await s.customer('card', { token })).status, 404);
  assert.equal((await s.staff('find', { number })).status, 404);
  const consents = await s.DB.prepare(
    "SELECT granted, language, source FROM consents WHERE purpose = 'loyalty' ORDER BY granted DESC",
  ).all();
  assert.deepEqual(
    consents.results.map((r) => [r.granted, r.source]),
    [
      [1, 'checkout'],
      [0, 'loyalty_card'],
    ],
  );
  const after = await s.order();
  await s.setStatus(after.data.id, 'accepted');

  const back = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  const card = back.data.modules.loyalty;
  assert.equal(card.joined, true);
  assert.equal(card.number, number);
  assert.notEqual(card.token, token);
  assert.equal(card.stamps, 0, 'stamps from before leaving and while out do not come back');
});

test('switched off: no card, no answer in the order, and the routes answer 404', async () => {
  const s = await setup({ loyalty: false });
  const o = await s.order({ consents: { orderUpdates: true, loyalty: true } });
  assert.equal(o.status, 201);
  assert.equal(o.data.modules, undefined);
  assert.equal((await s.DB.prepare('SELECT COUNT(*) AS n FROM loyalty_cards').first())?.n, 0);
  assert.equal(
    (await s.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE purpose = 'loyalty'").first())?.n,
    0,
    'no loyalty consent is recorded for a café without loyalty',
  );
  assert.equal((await s.customer('card', { token: 'x'.repeat(32) })).status, 404);
  assert.equal((await s.staff('find', { number: 'AAAAAA' })).status, 404);
  const cafe = await s.call('/admin/api/cafe?cafe=demo');
  assert.equal(cafe.data.modules.includes('loyalty'), false);
});
