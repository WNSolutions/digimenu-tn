// @ts-check
/**
 * Admin's overview (issue #28, US-48): per café, what runs and its last signs of life; the
 * alerts that need attention now; Admin only; no customer data.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuth } from '../../platform/shell/src/auth.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { handleOverview, usesStaffScreen } from '../../platform/shell/src/overview-api.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
// Wednesday 2 December 2026, 11:00 in Tunis: the demo café is open (07:00-23:00).
const NOW = new Date('2026-12-02T10:00:00Z');
const ago = (/** @type {number} */ min) =>
  new Date(NOW.getTime() - min * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
/** @type {Record<string, string>} */
const CODES = { ahmed: 'AAAAAAAA34', amel: 'CCCCCCCC34', sami: 'DDDDDDDD34', mona: 'EEEEEEEE34' };

let n = 0;
/** @param {{ status?: string, at: string, test?: boolean }} o */
function order(o) {
  n += 1;
  return `INSERT INTO orders (id, cafe_id, client_key, day, number, type, channel, status, lines, note, total, contact_ct, lang, release, menu_rev, is_test, created_at)
    VALUES ('o${n}', 'cafe-demo', 'k${n}', '${o.at.slice(0, 10)}', 'A${n}', 'dine_in', 'staff_screen', '${o.status ?? 'received'}', '[]', '', 2500, 'SECRET-CONTACT-${n}', 'fr', '0.1.0', 1, ${o.test ? 1 : 0}, '${o.at}');`;
}

/** @param {{ devices: number, lastSeen: string | null } | null} [hub] */
async function setup(hub = { devices: 1, lastSeen: ago(0) }) {
  clearCaches();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
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
    ...(hub === null
      ? {}
      : {
          CAFE_HUB: {
            idFromName: (/** @type {string} */ name) => name,
            get: () => ({ fetch: async () => Response.json(hub) }),
          },
        }),
  });
  /** @param {string} user */
  async function person(user) {
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
    return async () => {
      const r = await handleOverview(
        new Request(`${ORIGIN}/admin/api/overview`, { headers: { cookie } }),
        env,
        NOW,
      );
      const text = await r.text();
      return { status: r.status, text, data: /** @type {any} */ (JSON.parse(text)) };
    };
  }
  return { DB, env, person };
}

test('each café: release, modules on, last menu change, last visit and last order', async () => {
  const s = await setup();
  s.DB
    .exec(`INSERT INTO menu_changes (id, cafe_id, rev, entity, entity_id, field, before, after, actor_role, source, at)
    VALUES ('mc1', 'cafe-demo', 2, 'item', 'espresso', 'price', '2500', '2800', 'manager', 'editor', '${ago(300)}'),
           ('mc2', 'cafe-demo', 3, 'item', 'espresso', 'price', '2800', '2500', 'admin', 'seed', '${ago(10)}');
    INSERT INTO analytics_counters (cafe_id, day, hour, metric, dim, value)
    VALUES ('cafe-demo', '2026-12-01', 21, 'visit', '', 4), ('cafe-demo', '2026-12-02', 9, 'visit', '', 2),
           ('cafe-demo', '2026-12-02', 10, 'order.sent', '', 1);`);
  s.DB.exec(order({ status: 'served', at: ago(120) }));
  s.DB.exec(order({ status: 'served', at: ago(30), test: true }));
  const ahmed = await s.person('ahmed');
  const res = await ahmed();
  assert.equal(res.status, 200);
  const demo = res.data.cafes.find((/** @type {any} */ c) => c.slug === 'demo');
  assert.equal(demo.status, 'live');
  assert.equal(demo.release, '0.1.0');
  const keys = demo.modules.map((/** @type {any} */ m) => m.key);
  assert.deepEqual(keys, ['dietary_tags', 'google_review', 'loyalty', 'whatsapp_handoff']);
  assert.equal(
    demo.modules.find((/** @type {any} */ m) => m.key === 'google_review').title.fr,
    'Avis Google',
  );
  assert.equal(demo.open, true);
  assert.equal(demo.lastMenuChange, ago(300), 'a seed is not a menu change');
  assert.deepEqual(demo.lastVisit, { day: '2026-12-02', hour: 9 });
  assert.deepEqual(demo.lastOrder, { at: ago(30), test: true });
  assert.deepEqual(demo.alerts, []);
  assert.deepEqual(res.data.alerts, []);
  assert.deepEqual(res.data.external, { watched: false });
  assert.doesNotMatch(res.text, /SECRET-CONTACT|phone|lines/);
});

test('orders waiting more than 10 minutes on the staff screen raise an alert', async () => {
  const s = await setup();
  s.DB.exec(order({ at: ago(14) }));
  s.DB.exec(order({ at: ago(25) }));
  s.DB.exec(order({ at: ago(5) }));
  s.DB.exec(order({ status: 'accepted', at: ago(40) }));
  s.DB.exec(order({ at: ago(60 * 30) }));
  const demo = (await (await s.person('ahmed'))()).data.cafes[0];
  assert.deepEqual(demo.alerts, [{ code: 'orders_waiting', count: 2, since: ago(25) }]);
});

test('no staff device connected for 10 minutes while the café is open', async () => {
  for (const [hub, expected] of /** @type {[any, any[]][]} */ ([
    [{ devices: 0, lastSeen: ago(20) }, [{ code: 'no_staff_device', lastSeen: ago(20) }]],
    [{ devices: 0, lastSeen: null }, [{ code: 'no_staff_device', lastSeen: null }]],
    [{ devices: 0, lastSeen: ago(4) }, []],
    [{ devices: 2, lastSeen: ago(0) }, []],
    [null, []],
  ])) {
    const s = await setup(hub);
    const demo = (await (await s.person('ahmed'))()).data.cafes[0];
    assert.deepEqual(demo.alerts, expected, JSON.stringify(hub));
  }
  // Closed at night, or not taking orders on the staff screen: no alert.
  const s = await setup({ devices: 0, lastSeen: null });
  s.DB.exec(
    `UPDATE config_versions SET body = json_set(body, '$.hours', json('{"wed": [["12:00", "15:00"]]}')) WHERE cafe_id = 'cafe-demo';`,
  );
  clearCaches();
  assert.deepEqual((await (await s.person('ahmed'))()).data.cafes[0].alerts, []);
  assert.equal(
    usesStaffScreen({ ordering: { types: { dine_in: { channel: 'whatsapp_handoff' } } } }),
    false,
  );
  assert.equal(
    usesStaffScreen({
      ordering: { types: { dine_in: { channel: ['whatsapp_handoff', 'send_order'] } } },
    }),
    true,
  );
});

test('repeated failed sign-ins and customer exports in the last 7 days', async () => {
  const s = await setup();
  const ahmed = await s.person('ahmed');
  s.DB.exec(`UPDATE users SET failed_count = 6, locked_until = '${ago(-5)}' WHERE username = 'sami';
    UPDATE users SET failed_count = 2 WHERE username = 'mona';
    UPDATE users SET failed_count = 7 WHERE username = 'ahmed';
    INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, record_count, at)
    VALUES ('a1', 'customers', 'export', NULL, 'c1', 'u', 'admin', 1, '${ago(3 * 1440)}'),
           ('a2', 'customers', 'bulk_export', NULL, NULL, 'u', 'admin', 40, '${ago(2 * 1440)}'),
           ('a3', 'customers', 'bulk_export', NULL, NULL, 'u', 'admin', 50, '${ago(10 * 1440)}'),
           ('a4', 'customers', 'view', NULL, 'c1', 'u', 'admin', 0, '${ago(60)}');`);
  const v = (await ahmed()).data;
  assert.deepEqual(v.cafes[0].alerts, [{ code: 'failed_sign_ins', people: ['Sami'], locked: 1 }]);
  assert.deepEqual(v.alerts, [
    { code: 'customer_exports', count: 2, records: 41, last: ago(2 * 1440) },
    { code: 'failed_sign_ins', people: ['Ahmed'], locked: 0 },
  ]);
});

test('Admin only', async () => {
  const s = await setup();
  for (const user of ['amel', 'sami', 'mona'])
    assert.equal((await (await s.person(user))()).status, 403, user);
  const anonymous = await handleOverview(new Request(`${ORIGIN}/admin/api/overview`), s.env, NOW);
  assert.equal(anonymous.status, 401);
});
