// @ts-check
/**
 * Visits and impact numbers (issue #27): who sees them, test visits and go-live, the impact
 * export (Admin only, live cafés from go-live), and the files built from it. Counts only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { summarise, splitDim, range } from '../../platform/shell/src/visits-api.js';
import { byWeek, impactCsv, weekStart } from '../../platform/admin/visits.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

async function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  for (const [username, role, code] of [
    ['ahmed', 'admin', 'AAAAAAAA34'],
    ['amel', 'manager', 'BBBBBBBB34'],
    ['sami', 'staff', 'CCCCCCCC34'],
    ['mona', 'maintainer', 'DDDDDDDD34'],
  ]) {
    DB.exec(
      accountSql({
        username,
        name: username,
        role,
        cafe: role === 'admin' ? undefined : 'demo',
        code,
      }),
    );
  }
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
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
  const add = (
    /** @type {string} */ day,
    /** @type {number} */ hour,
    /** @type {string} */ dim,
    /** @type {number} */ n,
  ) =>
    DB.prepare(
      "INSERT INTO analytics_counters (cafe_id, day, hour, metric, dim, value) VALUES ('cafe-demo', ?1, ?2, 'visit', ?3, ?4)",
    )
      .bind(day, hour, dim, n)
      .run();
  await add('2026-11-20', 12, 't5|fr', 4);
  await add('2026-11-20', 13, '-|ar', 2);
  await add('2026-11-23', 20, 't7|en', 3);
  await add('2026-11-24', 20, 't5|fr', 5);
  await add('2026-11-24', 21, '-|-', 1);
  // Other metrics never mix in.
  await DB.prepare(
    "INSERT INTO analytics_counters (cafe_id, day, hour, metric, dim, value) VALUES ('cafe-demo', '2026-11-24', 20, 'review_tap', '', 9)",
  ).run();
  return { DB, env, person };
}

test('counts add up by day, table, language and hour; weeks start on Monday', () => {
  assert.deepEqual(splitDim('t12|fr'), { table: '12', lang: 'fr' });
  assert.deepEqual(splitDim('-|-'), { table: null, lang: 'other' });
  const s = summarise([
    { day: '2026-11-24', hour: 20, dim: 't5|fr', value: 5 },
    { day: '2026-11-23', hour: 9, dim: '-|ar', value: 2 },
    { day: '2026-11-24', hour: 20, dim: 't10|en', value: 5 },
  ]);
  assert.deepEqual(s.totals, {
    visits: 12,
    withTable: 10,
    noTable: 2,
    fr: 5,
    ar: 2,
    en: 5,
    other: 0,
  });
  assert.deepEqual(
    s.days.map((d) => [d.day, d.visits]),
    [
      ['2026-11-23', 2],
      ['2026-11-24', 10],
    ],
  );
  assert.deepEqual(s.tables, [
    { table: '5', visits: 5 },
    { table: '10', visits: 5 },
  ]);
  assert.equal(s.hours[20], 10);
  assert.equal(weekStart('2026-11-25'), '2026-11-23');
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.deepEqual(
    byWeek([
      { day: '2026-11-22', visits: 1 },
      { day: '2026-11-23', visits: 2 },
      { day: '2026-11-29', visits: 3 },
    ]),
    [
      { week: '2026-11-16', visits: 1 },
      { week: '2026-11-23', visits: 5 },
    ],
  );
  const now = new Date('2026-11-25T10:00:00Z');
  assert.deepEqual(range(new URL('https://x/?'), now), { from: '2026-10-29', to: '2026-11-25' });
  assert.equal(range(new URL('https://x/?from=2026-11-25&to=2026-11-01'), now), null);
  assert.equal(
    range(new URL('https://x/?from=2025-01-01&to=2026-11-25'), now),
    null,
    'at most 400 days',
  );
  assert.equal(range(new URL('https://x/?from=2026-11-01&to=nope'), now), null);
});

test('Manager, Maintainer and Admin see the visits; Staff do not; a demo café shows test visits', async () => {
  const s = await setup();
  const q = '/admin/api/visits?cafe=demo&from=2026-11-01&to=2026-11-30';
  const amel = await s.person('amel', 'BBBBBBBB34');
  const mona = await s.person('mona', 'DDDDDDDD34');
  const ahmed = await s.person('ahmed', 'AAAAAAAA34');
  for (const [who, call] of /** @type {const} */ ([
    ['amel', amel],
    ['mona', mona],
    ['ahmed', ahmed],
  ])) {
    const res = await call(q);
    assert.equal(res.status, 200, who);
    assert.equal(res.data.totals.visits, 15);
    assert.equal(res.data.test, true, 'a demo café is never real');
  }
  const sami = await s.person('sami', 'CCCCCCCC34');
  assert.equal((await sami(q)).status, 403);
  const v = (await amel(q)).data;
  assert.deepEqual(v.tables, [
    { table: '5', visits: 9 },
    { table: '7', visits: 3 },
  ]);
  assert.deepEqual([v.totals.withTable, v.totals.noTable], [12, 3]);
  assert.deepEqual([v.totals.fr, v.totals.ar, v.totals.en, v.totals.other], [9, 2, 3, 1]);
  // Counts only: nothing in the answer could name a person.
  assert.deepEqual(Object.keys(v).sort(), [
    'cafe',
    'days',
    'events',
    'from',
    'goLive',
    'hours',
    'tables',
    'test',
    'to',
    'totals',
  ]);
  assert.equal(
    (await amel('/admin/api/visits?cafe=demo&from=2020-01-01&to=2026-11-30')).status,
    400,
  );
  assert.equal((await amel('/admin/api/visits/export?from=2026-11-01&to=2026-11-30')).status, 403);
});

test('a live café counts from its go-live day, and only live cafés reach the impact export', async () => {
  const s = await setup();
  const ahmed = await s.person('ahmed', 'AAAAAAAA34');
  const none = await ahmed('/admin/api/visits/export?from=2026-11-01&to=2026-11-30');
  assert.equal(none.status, 200);
  assert.deepEqual(none.data.cafes, [], 'a demo café is never in the impact numbers');

  await s.DB.prepare(
    "UPDATE cafes SET status = 'live', go_live_on = '2026-11-23' WHERE slug = 'demo'",
  ).run();
  clearCaches();
  const v = (await ahmed('/admin/api/visits?cafe=demo&from=2026-11-01&to=2026-11-30')).data;
  assert.equal(v.test, false);
  assert.equal(v.goLive, '2026-11-23');
  assert.equal(v.totals.visits, 9, 'the visits of 20 Nov were tests before go-live');

  const out = await ahmed('/admin/api/visits/export?from=2026-11-01&to=2026-11-30');
  assert.equal(out.status, 200);
  assert.equal(out.data.cafes.length, 1);
  assert.equal(out.data.cafes[0].slug, 'demo');
  assert.deepEqual(
    out.data.cafes[0].days.map((/** @type {any} */ d) => [d.day, d.visits]),
    [
      ['2026-11-23', 3],
      ['2026-11-24', 6],
    ],
  );
  const files = impactCsv(out.data);
  assert.equal(files.perCafe.length, 1);
  const lines = files.all.trim().split('\r\n');
  assert.equal(lines[0], 'cafe,day,visits,with_table,without_table,fr,ar,en,other');
  assert.deepEqual(lines.slice(1), [
    'demo,2026-11-23,3,3,0,0,0,3,0',
    'demo,2026-11-24,6,5,1,5,0,0,1',
    'demo,2026-11-01..2026-11-30,9,8,1,5,0,3,1',
  ]);
  assert.equal(files.perCafe[0].csv, files.all, 'one café: the same file');
});
