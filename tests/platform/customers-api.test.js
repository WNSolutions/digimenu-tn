// @ts-check
/**
 * Customer records, Admin only (ADR-0010, issue #23): list and search, view, export, consent
 * withdrawal, deletion on request, and the access log, through the real Worker.
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
// A Wednesday morning in the past: the demo café is open, and later actions come after it.
const OPEN = new Date('2026-11-18T10:30:00Z');

async function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  DB.exec(accountSql({ username: 'ahmed', name: 'Ahmed', role: 'admin', code: 'AAAAAAAA34' }));
  DB.exec(
    accountSql({
      username: 'amel',
      name: 'Amel',
      role: 'manager',
      cafe: 'demo',
      code: 'BBBBBBBB34',
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

  /** A signed-in person with their own cookie. @param {string} user @param {string} code */
  async function person(user, code) {
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
      return { status: res.status, headers: res.headers, data: await res.json() };
    };
    const salt = rnd().slice(0, 24);
    const key = pbkdf2Sync(
      'correct horse battery',
      Buffer.from(salt, 'base64'),
      ITER,
      32,
      'sha256',
    );
    const done = await call('/admin/api/auth/setup', {
      username: user,
      code,
      salt,
      iterations: ITER,
      key: key.toString('base64'),
    });
    assert.equal(done.status, 200);
    return call;
  }

  const v = await DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  let n = 0;
  /** @param {any} extra @param {number} minutes  after OPEN */
  const order = async (extra, minutes = 0) => {
    const res = await handleCreateOrder(
      new Request('https://x/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          cafe: 'demo',
          clientKey: `customers-test-${String(++n).padStart(6, '0')}`,
          type: 'takeaway',
          channel: 'whatsapp_handoff',
          lines: [{ variantId: v?.id, qty: 2, note: 'pour Amél, sans sucre' }],
          note: 'appeler Amél au 20 123 456',
          noticeVersion: 1,
          lang: 'fr',
          consents: { orderUpdates: true },
          ...extra,
        }),
      }),
      env,
      new Date(OPEN.getTime() + minutes * 60_000),
    );
    assert.equal(res.status, 201);
    return /** @type {any} */ (await res.json());
  };
  // Two customers. Amél joins loyalty and takes offers, then orders again without ticking
  // offers: the latest choice wins, so she no longer gets offers. Karim takes offers.
  const first = await order({
    customer: { firstName: 'Amél', phone: '20 123 456' },
    consents: { orderUpdates: true, marketing: true, loyalty: true },
  });
  await order({ customer: { firstName: 'Amél', phone: '+216 20123456' } }, 5);
  await order(
    {
      customer: { firstName: 'Karim', phone: '55 987 321' },
      consents: { orderUpdates: true, marketing: true },
    },
    10,
  );
  const admin = await person('ahmed', 'AAAAAAAA34');
  const manager = await person('amel', 'BBBBBBBB34');
  return { DB, env, admin, manager, first };
}

/** Every audit line as text, to check no phone number or name ever lands there. */
async function auditText(/** @type {any} */ DB) {
  // Random identifiers (row ids, account and customer ids) are left out: a random id can hold
  // "321" by chance, which is not a leak. Everything else in each line is checked.
  const ID = /^([a-z]{1,3}-)?[0-9a-f-]{20,}$|^[0-9A-HJKMNP-TV-Z]{26}$/i;
  const rows = (await DB.prepare('SELECT * FROM audit_log').all()).results;
  return JSON.stringify(
    rows.map((/** @type {Record<string, unknown>} */ r) =>
      Object.fromEntries(
        Object.entries(r).filter(([, v]) => !(typeof v === 'string' && ID.test(v))),
      ),
    ),
  );
}

test('only Admin has customer records; other roles get nothing and the attempt is logged', async () => {
  const s = await setup();
  const refused = await s.manager('/admin/api/customers');
  assert.equal(refused.status, 404);
  assert.equal((await s.manager('/admin/api/customers/export')).status, 404);
  const logged = await s.DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_log WHERE category = 'customers' AND action = 'refused'",
  ).first();
  assert.equal(logged?.n, 2);

  const cafes = await s.manager('/admin/api/cafes');
  assert.deepEqual(
    cafes.data.cafes.map((/** @type {any} */ c) => [c.slug, c.role]),
    [['demo', 'manager']],
  );
  assert.equal(cafes.data.admin, false);
  assert.equal((await s.admin('/admin/api/cafes')).data.admin, true);
});

test('Admin lists and searches by phone, last three digits or name; the list masks phones', async () => {
  const s = await setup();
  const all = await s.admin('/admin/api/customers');
  assert.equal(all.status, 200);
  assert.equal(all.data.customers.length, 2, 'one record per phone number');
  const amel = all.data.customers.find((/** @type {any} */ c) => c.firstName === 'Amél');
  assert.equal(amel.phone, '•• ••• 456');
  assert.equal(amel.orders, 2);
  assert.deepEqual(amel.cafes, ['demo']);
  assert.deepEqual(amel.optIns, { marketing: [], loyalty: ['demo'] });
  assert.doesNotMatch(JSON.stringify(all.data), /20123456|987321/);

  const byPhone = await s.admin('/admin/api/customers?q=' + encodeURIComponent('+216 20 123 456'));
  assert.deepEqual(
    byPhone.data.customers.map((/** @type {any} */ c) => c.firstName),
    ['Amél'],
  );
  const byEnd = await s.admin('/admin/api/customers?q=321');
  assert.deepEqual(
    byEnd.data.customers.map((/** @type {any} */ c) => c.firstName),
    ['Karim'],
  );
  const byName = await s.admin('/admin/api/customers?q=AMEL');
  assert.deepEqual(
    byName.data.customers.map((/** @type {any} */ c) => c.firstName),
    ['Amél'],
    'accents and case do not matter',
  );
  assert.equal((await s.admin('/admin/api/customers?q=12ab')).status, 422);
  const optedIn = await s.admin('/admin/api/customers?optin=marketing');
  assert.deepEqual(
    optedIn.data.customers.map((/** @type {any} */ c) => c.firstName),
    ['Karim'],
  );
  const members = await s.admin('/admin/api/customers?optin=loyalty');
  assert.deepEqual(
    members.data.customers.map((/** @type {any} */ c) => c.firstName),
    ['Amél'],
  );
  assert.equal((await s.admin('/admin/api/customers?cafe=demo')).data.customers.length, 2);
  assert.equal((await s.admin('/admin/api/customers?cafe=nope')).status, 404);
  assert.equal((await s.admin('/admin/api/customers?from=2026-12-01')).data.customers.length, 0);

  const text = await auditText(s.DB);
  assert.doesNotMatch(text, /20123456|20 123 456|321|Am[ée]l|AMEL/, 'no search text in the log');
  const actions = (
    await s.DB.prepare(
      "SELECT action, record_count FROM audit_log WHERE category = 'customers' ORDER BY rowid",
    ).all()
  ).results.map((r) => ({ ...r }));
  assert.deepEqual(actions[0], { action: 'list', record_count: 2 });
  assert.ok(actions.some((a) => a.action === 'search' && a.record_count === 1));
});

test('Admin views and exports one person: record, orders, consent history and loyalty card', async () => {
  const s = await setup();
  const id = (await s.admin('/admin/api/customers?q=456')).data.customers[0].id;
  const view = await s.admin(`/admin/api/customers/${id}`);
  assert.equal(view.data.customer.phone, '+21620123456');
  assert.equal(view.data.orders.length, 2);
  assert.equal(
    view.data.consents.filter((/** @type {any} */ c) => c.purpose === 'loyalty').length,
    1,
  );
  assert.equal(view.data.modules.loyalty.cards.length, 1);

  const file = await s.admin(`/admin/api/customers/${id}/export`);
  assert.match(String(file.headers.get('content-disposition')), /attachment; filename="customer-/);
  assert.equal(file.data.format, 'digimenu-customer-1');
  assert.equal(file.data.orders[0].lines[0].qty, 2);
  assert.equal(file.data.modules.loyalty.cards[0].cafe, 'demo');

  const pages = await s.admin('/admin/api/customers/export');
  assert.equal(pages.data.customers.length, 2);
  assert.equal(pages.data.next, null);
  const counts = (
    await s.DB.prepare(
      "SELECT action, target, record_count FROM audit_log WHERE category = 'customers' AND action IN ('view', 'export', 'bulk_export') ORDER BY rowid",
    ).all()
  ).results.map((r) => ({ ...r }));
  assert.deepEqual(counts, [
    { action: 'view', target: id, record_count: 0 },
    { action: 'export', target: id, record_count: 1 },
    { action: 'bulk_export', target: null, record_count: 2 },
  ]);
  assert.equal((await s.admin('/admin/api/customers/01ARZ3NDEKTSV4RRFFQ69G5FAV')).status, 404);
});

test('Admin records a withdrawal the person asked for', async () => {
  const s = await setup();
  const id = (await s.admin('/admin/api/customers?q=321')).data.customers[0].id;
  const after = await s.admin(`/admin/api/customers/${id}/consent`, {
    cafe: 'demo',
    purpose: 'marketing',
  });
  assert.equal(after.status, 200);
  assert.deepEqual(after.data.customer.optIns.marketing, []);
  assert.equal((await s.admin('/admin/api/customers?optin=marketing')).data.customers.length, 0);
  const last = after.data.consents.at(-1);
  assert.deepEqual([last.purpose, last.granted, last.source], ['marketing', false, 'admin']);
  assert.equal(
    (await s.admin(`/admin/api/customers/${id}/consent`, { cafe: 'demo', purpose: 'loyalty' }))
      .status,
    400,
    'loyalty is left from the card, or by deleting the record',
  );
});

test('deletion: twice confirmed, anonymous orders stay, everything personal goes, number suppressed', async () => {
  const s = await setup();
  const id = (await s.admin('/admin/api/customers?q=456')).data.customers[0].id;
  assert.equal(
    (await s.admin(`/admin/api/customers/${id}/delete`, { confirm: '000' })).data.error,
    'confirm_mismatch',
  );
  const done = await s.admin(`/admin/api/customers/${id}/delete`, { confirm: '456' });
  assert.deepEqual(done.data, { deleted: true, ordersAnonymised: 2, moduleRows: 1 });

  assert.equal((await s.admin(`/admin/api/customers/${id}`)).status, 404);
  assert.equal((await s.admin('/admin/api/customers?q=456')).data.customers.length, 0);
  const orders = (
    await s.DB.prepare(
      'SELECT customer_id, contact_ct, note, lines, total FROM orders WHERE id IN (SELECT id FROM orders WHERE total > 0) AND customer_id IS NULL',
    ).all()
  ).results;
  assert.equal(orders.length, 2, 'the orders stay for counts and sales');
  for (const o of orders) {
    assert.equal(o.contact_ct, null);
    assert.equal(o.note, '');
    assert.doesNotMatch(String(o.lines), /Amél|sucre/);
    assert.ok(Number(o.total) > 0);
  }
  const left = await s.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM consents WHERE customer_id = ?1) AS consents,
            (SELECT COUNT(*) FROM loyalty_cards) AS cards,
            (SELECT COUNT(*) FROM loyalty_ledger) AS ledger,
            (SELECT COUNT(*) FROM suppressions) AS suppressed`,
  )
    .bind(id)
    .first();
  assert.deepEqual({ ...left }, { consents: 0, cards: 0, ledger: 0, suppressed: 1 });
  const deletion = await s.DB.prepare(
    "SELECT target, record_count FROM audit_log WHERE category = 'customers' AND action = 'delete'",
  ).first();
  assert.deepEqual({ ...deletion }, { target: id, record_count: 2 });
  assert.doesNotMatch(await auditText(s.DB), /20123456|20 123 456|Amél/);
  // Karim is untouched.
  assert.equal((await s.admin('/admin/api/customers')).data.customers.length, 1);
});
