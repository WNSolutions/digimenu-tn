// @ts-check
/**
 * The Manager's sales dashboard and Admin's sales export (issue #28, US-39, C-12): what counts
 * as sold, the periods, day by day, 12 months, top items, busy hours in café time, the
 * dashboard and the export agreeing to the millime, no customer data, who may see it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuth } from '../../platform/shell/src/auth.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import {
  handleSales,
  clearSalesCache,
  aggregate,
  addMonths,
  monthEnd,
} from '../../platform/shell/src/sales-api.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';
import { salesCsv, tnd } from '../../platform/admin/sales.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
// Wednesday 2 December 2026, 11:00 in Tunis.
const NOW = new Date('2026-12-02T10:00:00Z');
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
/** @type {Record<string, string>} */
const CODES = {
  ahmed: 'AAAAAAAA34',
  amel: 'CCCCCCCC34',
  sami: 'DDDDDDDD34',
  mona: 'EEEEEEEE34',
};

let n = 0;
/**
 * One order, as the order API stores it.
 * @param {{ day: string, at?: string, status?: string, type?: string, test?: boolean,
 *   lines: [string, number, number][] }} o   lines: item id, quantity, unit price (millimes)
 */
function order(o) {
  n += 1;
  const lines = o.lines.map(([item, qty, price]) => ({
    itemId: item,
    variantId: `${item}-v`,
    name: { fr: `Article ${item}`, ar: `صنف ${item}` },
    qty,
    unitPrice: price,
    total: qty * price,
  }));
  const total = lines.reduce((s, l) => s + l.total, 0);
  const at = o.at ?? `${o.day}T09:30:00Z`;
  return `INSERT INTO orders (id, cafe_id, client_key, day, number, type, channel, status, table_label, lines, note, total, contact_ct, lang, release, menu_rev, is_test, created_at)
    VALUES ('o${n}', 'cafe-demo', 'k${n}', '${o.day}', 'A${n}', '${o.type ?? 'dine_in'}', 'staff_screen', '${o.status ?? 'served'}', '5', '${JSON.stringify(lines).replaceAll("'", "''")}', '', ${total}, 'SECRET-CONTACT-${n}', 'fr', '0.1.0', 1, ${o.test ? 1 : 0}, '${at}');`;
}

async function setup({ live = true, goLive = '2026-10-15' } = {}) {
  clearCaches();
  clearSalesCache();
  const DB = createD1().migrate();
  DB.exec(
    seedSql({
      dir: path.join(root, 'cafes/demo'),
      release: '0.1.0',
      status: live ? 'live' : 'onboarding',
    }),
  );
  DB.exec(`UPDATE cafes SET go_live_on = '${goLive}' WHERE id = 'cafe-demo';`);
  for (const [username, name, role, cafe] of /** @type {[string, string, string, string?][]} */ ([
    ['ahmed', 'Ahmed', 'admin'],
    ['amel', 'Amel', 'manager', 'demo'],
    ['sami', 'Sami', 'staff', 'demo'],
    ['mona', 'Mona', 'maintainer', 'demo'],
  ]))
    DB.exec(accountSql({ username, name, role, cafe, code: CODES[username], now: NOW }));
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });
  /** @param {string} user */
  async function person(user) {
    // Signed in on the day the tests look from.
    const res = await handleAuth(
      new Request(`${ORIGIN}/admin/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({
          username: user,
          code: CODES[user],
          salt: rnd().slice(0, 24),
          iterations: 310_000,
          key: rnd(),
        }),
      }),
      env,
      'setup',
      NOW,
    );
    assert.equal(res.status, 200, `${user} signs in`);
    const cookie = String(res.headers.get('set-cookie')).split(';')[0];
    /** @param {string} p */
    return async (p) => {
      const r = await handleSales(
        new Request(ORIGIN + p, { headers: { cookie } }),
        env,
        p.startsWith('/admin/api/sales/export') ? 'sales/export' : 'sales',
        NOW,
      );
      const text = await r.text();
      return { status: r.status, text, data: /** @type {any} */ (JSON.parse(text)) };
    };
  }
  return { DB, person };
}

/** The orders of the tests: what counts, what does not. */
const ORDERS = [
  // Today (2 Dec): two dine-in, one takeaway; one refused and one waiting do not count.
  order({ day: '2026-12-02', at: '2026-12-02T08:15:00Z', lines: [['coffee', 2, 2500]] }),
  order({
    day: '2026-12-02',
    at: '2026-12-02T08:45:00Z',
    status: 'accepted',
    lines: [
      ['coffee', 1, 2500],
      ['cake', 1, 6000],
    ],
  }),
  order({
    day: '2026-12-02',
    at: '2026-12-02T09:05:00Z',
    type: 'takeaway',
    status: 'ready',
    lines: [['juice', 3, 4000]],
  }),
  order({ day: '2026-12-02', status: 'rejected', lines: [['cake', 5, 6000]] }),
  order({ day: '2026-12-02', status: 'received', lines: [['cake', 5, 6000]] }),
  order({ day: '2026-12-02', status: 'handoff', lines: [['cake', 5, 6000]] }),
  // Yesterday (1 Dec, Tuesday), late evening in Tunis (23:30 local = 22:30 UTC).
  order({ day: '2026-12-01', at: '2026-12-01T22:30:00Z', lines: [['coffee', 1, 2500]] }),
  order({ day: '2026-12-01', status: 'cancelled', lines: [['coffee', 9, 2500]] }),
  order({ day: '2026-12-01', status: 'unconfirmed', lines: [['coffee', 9, 2500]] }),
  // Last month (November).
  order({ day: '2026-11-10', lines: [['cake', 2, 6000]] }),
  order({ day: '2026-11-30', type: 'takeaway', lines: [['juice', 1, 4000]] }),
  // A test order at the live café, and orders before go-live (15 Oct): never counted.
  order({ day: '2026-11-20', test: true, lines: [['cake', 7, 6000]] }),
  order({ day: '2026-10-14', lines: [['cake', 8, 6000]] }),
  // October after go-live.
  order({ day: '2026-10-20', lines: [['coffee', 4, 2500]] }),
];

test('what counts as sold, per period, with the dine-in and takeaway split and the basket', async () => {
  const s = await setup();
  for (const o of ORDERS) s.DB.exec(o);
  const amel = await s.person('amel');
  const res = await amel('/admin/api/sales?cafe=demo');
  assert.equal(res.status, 200);
  const v = res.data;
  assert.equal(v.today, '2026-12-02');
  assert.equal(v.test, false);
  assert.deepEqual(v.periods.today, {
    orders: 3,
    sales: 5000 + 8500 + 12000,
    basket: Math.round(25500 / 3),
    dineIn: { orders: 2, sales: 13500 },
    takeaway: { orders: 1, sales: 12000 },
  });
  assert.equal(v.periods.yesterday.orders, 1);
  assert.equal(v.periods.yesterday.sales, 2500);
  assert.equal(v.periods.thisMonth.orders, 4);
  assert.equal(v.periods.thisMonth.sales, 28000);
  assert.deepEqual(
    [v.periods.lastMonth.orders, v.periods.lastMonth.sales, v.periods.lastMonth.takeaway.orders],
    [2, 16000, 1],
    'the test order and the orders before go-live are left out',
  );
  assert.equal(v.periods.lastMonth.basket, 8000);
});

test('the chosen month: day by day, top 10 items, busy hours in Tunis time and days of the week', async () => {
  const s = await setup();
  for (const o of ORDERS) s.DB.exec(o);
  const amel = await s.person('amel');
  const v = (await amel('/admin/api/sales?cafe=demo')).data;
  assert.equal(v.month, '2026-12');
  assert.deepEqual(
    v.chosen.days.map((/** @type {any} */ d) => [d.day, d.orders, d.sales]),
    [
      ['2026-12-01', 1, 2500],
      ['2026-12-02', 3, 25500],
    ],
  );
  assert.deepEqual(
    v.chosen.byQty.map((/** @type {any} */ i) => [i.id, i.qty, i.sales]),
    [
      ['coffee', 4, 10000],
      ['juice', 3, 12000],
      ['cake', 1, 6000],
    ],
  );
  assert.deepEqual(
    v.chosen.bySales.map((/** @type {any} */ i) => i.id),
    ['juice', 'coffee', 'cake'],
  );
  assert.equal(v.chosen.byQty[0].name.fr, 'Article coffee');
  // 08:15, 08:45, 09:05 UTC are 9:15, 9:45, 10:05 in Tunis; 22:30 UTC on 1 Dec is 23:30.
  assert.equal(v.chosen.hours[9], 2);
  assert.equal(v.chosen.hours[10], 1);
  assert.equal(v.chosen.hours[23], 1);
  assert.equal(
    v.chosen.hours.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b),
    4,
  );
  // Monday first: Tuesday 1 Dec, Wednesday 2 Dec.
  assert.deepEqual(v.chosen.weekdays, [0, 1, 3, 0, 0, 0, 0]);

  const nov = (await amel('/admin/api/sales?cafe=demo&month=2026-11')).data;
  assert.equal(nov.chosen.totals.sales, 16000);
  assert.equal(nov.chosen.days.length, 2);

  // Twelve months, oldest first, empty months at zero.
  assert.deepEqual(
    v.months.map((/** @type {any} */ m) => m.month),
    Array.from({ length: 12 }, (_, i) => addMonths('2026-01', i)),
  );
  assert.deepEqual(
    v.months.slice(-3).map((/** @type {any} */ m) => [m.month, m.orders, m.sales]),
    [
      ['2026-10', 1, 10000],
      ['2026-11', 2, 16000],
      ['2026-12', 4, 28000],
    ],
  );
  assert.equal((await amel('/admin/api/sales?cafe=demo&month=2025-12')).status, 400);
  assert.equal((await amel('/admin/api/sales?cafe=demo&month=2027-01')).status, 400);
  assert.equal((await amel('/admin/api/sales?cafe=demo&month=12-2026')).status, 400);
});

test("the dashboard and Admin's export agree to the millime; no customer data anywhere", async () => {
  const s = await setup();
  for (const o of ORDERS) s.DB.exec(o);
  const ahmed = await s.person('ahmed');
  const amel = await s.person('amel');
  const dash = await amel('/admin/api/sales?cafe=demo&month=2026-11');
  const exp = await ahmed('/admin/api/sales/export?from=2026-10-01&to=2026-12-31');
  assert.equal(exp.status, 200);
  const cafe = exp.data.cafes.find((/** @type {any} */ c) => c.slug === 'demo');
  /** @param {string} month */
  const fromExport = (month) =>
    aggregate(
      cafe.days
        .filter((/** @type {any} */ d) => d.day.startsWith(month))
        .flatMap((/** @type {any} */ d) => [
          { day: d.day, type: 'dine_in', ...d.dineIn },
          { day: d.day, type: 'takeaway', ...d.takeaway },
        ]),
    ).totals;
  assert.deepEqual(fromExport('2026-11'), dash.data.chosen.totals);
  assert.deepEqual(fromExport('2026-11'), dash.data.periods.lastMonth);
  assert.deepEqual(fromExport('2026-12'), dash.data.periods.thisMonth);
  assert.equal(cafe.totals.sales, 10000 + 16000 + 28000);
  for (const text of [dash.text, exp.text]) {
    assert.doesNotMatch(text, /SECRET-CONTACT|customer|phone|firstName/);
  }
  assert.equal(monthEnd('2026-02'), '2026-02-28');
});

test('who sees sales: Manager and Admin; not Staff or Maintainer; the export is Admin only', async () => {
  const s = await setup();
  for (const o of ORDERS) s.DB.exec(o);
  const [amel, ahmed, sami, mona] = await Promise.all(
    ['amel', 'ahmed', 'sami', 'mona'].map((u) => s.person(u)),
  );
  assert.equal((await amel('/admin/api/sales?cafe=demo')).status, 200);
  assert.equal((await ahmed('/admin/api/sales?cafe=demo')).status, 200);
  assert.equal((await sami('/admin/api/sales?cafe=demo')).status, 403);
  assert.equal((await mona('/admin/api/sales?cafe=demo')).status, 403);
  assert.equal((await amel('/admin/api/sales/export?from=2026-11-01&to=2026-11-30')).status, 403);
  assert.equal((await ahmed('/admin/api/sales/export?from=2026-11-30&to=2026-11-01')).status, 400);
  assert.equal((await ahmed('/admin/api/sales/export?from=2024-01-01&to=2026-11-01')).status, 400);
});

test('a café not live yet: every order is a test, shown as such and never exported', async () => {
  const s = await setup({ live: false });
  for (const o of ORDERS) s.DB.exec(o);
  const amel = await s.person('amel');
  const v = (await amel('/admin/api/sales?cafe=demo&month=2026-11')).data;
  assert.equal(v.test, true);
  assert.equal(v.goLive, null);
  // November: 2 real-looking orders and the test order all shown as tests.
  assert.equal(v.chosen.totals.orders, 3);
  const ahmed = await s.person('ahmed');
  const exp = (await ahmed('/admin/api/sales/export?from=2026-10-01&to=2026-12-31')).data;
  assert.deepEqual(exp.cafes, []);
});

test('the sales files: dinars with 3 decimals, a line per day and the total per café', () => {
  assert.deepEqual(
    [tnd(25500), tnd(500), tnd(0), tnd(1250000)],
    ['25.500', '0.500', '0.000', '1250.000'],
  );
  const day = {
    day: '2026-11-10',
    orders: 2,
    sales: 16000,
    basket: 8000,
    dineIn: { orders: 1, sales: 12000 },
    takeaway: { orders: 1, sales: 4000 },
  };
  const files = salesCsv({
    from: '2026-11-01',
    to: '2026-11-30',
    cafes: [{ slug: 'demo', days: [day], totals: day }],
  });
  assert.equal(
    files.all,
    'cafe,day,orders,sales_tnd,dine_in_orders,dine_in_tnd,takeaway_orders,takeaway_tnd\r\n' +
      'demo,2026-11-10,2,16.000,1,12.000,1,4.000\r\n' +
      'demo,2026-11-01..2026-11-30,2,16.000,1,12.000,1,4.000\r\n',
  );
  assert.equal(files.perCafe[0].slug, 'demo');
});
