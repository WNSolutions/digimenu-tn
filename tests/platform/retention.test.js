// @ts-check
/**
 * The retention rule (D-067, ADR-0010): customer records with no order for 24 months are
 * deleted every night; recent customers are untouched; orders stay as anonymous lines.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { handleCreateOrder } from '../../platform/shell/src/orders-api.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { runRetention, cutoff } from '../../platform/shell/src/retention.js';
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

async function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  const env = /** @type {any} */ ({ DB, FIELD_KEY: rnd(), LOOKUP_KEY: rnd() });
  const v = await DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  let n = 0;
  /** @param {string} phone @param {string} at  a Wednesday morning, when the demo café is open */
  const order = async (phone, at, extra = {}) => {
    const res = await handleCreateOrder(
      new Request('https://x/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          cafe: 'demo',
          clientKey: `retention-test-${String(++n).padStart(6, '0')}`,
          type: 'takeaway',
          channel: 'whatsapp_handoff',
          lines: [{ variantId: v?.id, qty: 1, note: 'pour Sami' }],
          note: 'Sami, au comptoir',
          customer: { firstName: 'Sami', phone },
          consents: { orderUpdates: true, loyalty: true },
          noticeVersion: 1,
          lang: 'fr',
          ...extra,
        }),
      }),
      env,
      new Date(at),
    );
    assert.equal(res.status, 201);
    return /** @type {any} */ (await res.json());
  };
  return { DB, env, order };
}

test('the cut-off is the same day 24 months earlier (end of month when the day is missing)', () => {
  assert.equal(cutoff(new Date('2026-11-25T03:43:00Z')).toISOString(), '2024-11-25T03:43:00.000Z');
  assert.equal(cutoff(new Date('2026-03-31T00:00:00Z')).toISOString(), '2024-03-31T00:00:00.000Z');
  assert.equal(cutoff(new Date('2027-02-28T00:00:00Z')).toISOString(), '2025-02-28T00:00:00.000Z');
  assert.equal(
    cutoff(new Date('2026-02-28T12:00:00Z'), 1).toISOString(),
    '2026-01-28T12:00:00.000Z',
  );
  assert.equal(
    cutoff(new Date('2026-03-31T12:00:00Z'), 1).toISOString(),
    '2026-02-28T12:00:00.000Z',
  );
});

test('records with no order for 24 months are deleted; recent ones stay; orders stay anonymous', async () => {
  const s = await setup();
  // Old customer: last order 18 Nov 2026. Recent customer: ordered 26 Nov 2026 as well.
  const old = await s.order('20 123 456', '2026-11-18T10:30:00Z');
  await s.order('55 987 321', '2026-11-18T10:35:00Z');
  await s.order('55 987 321', '2026-11-25T10:30:00Z');

  // Two years later, on 20 Nov 2028: the first customer is 24 months and 2 days old.
  const result = await runRetention(s.env, { now: new Date('2028-11-20T02:43:00Z') });
  assert.deepEqual(result, { deleted: 1, failed: 0, before: '2026-11-20T02:43:00Z' });

  const left = (await s.DB.prepare('SELECT phone_last3 FROM customers').all()).results;
  assert.deepEqual(
    left.map((r) => r.phone_last3),
    ['321'],
  );
  const order = await s.DB.prepare(
    'SELECT customer_id, contact_ct, note, lines, total FROM orders WHERE id = ?1',
  )
    .bind(old.id)
    .first();
  assert.equal(order?.customer_id, null);
  assert.equal(order?.contact_ct, null);
  assert.equal(order?.note, '');
  assert.doesNotMatch(String(order?.lines), /Sami/);
  assert.ok(Number(order?.total) > 0, 'the sale still counts');
  const counts = await s.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM suppressions) AS suppressed,
            (SELECT COUNT(*) FROM loyalty_cards) AS cards,
            (SELECT COUNT(DISTINCT customer_id) FROM consents) AS consentHolders`,
  ).first();
  assert.deepEqual(
    { ...counts },
    { suppressed: 0, cards: 1, consentHolders: 1 },
    'no do-not-contact entry; only the recent customer keeps a card and choices',
  );
  const audit = await s.DB.prepare(
    "SELECT action, actor, record_count, target FROM audit_log WHERE category = 'customers'",
  ).first();
  assert.deepEqual(
    { ...audit },
    {
      action: 'retention',
      actor: 'system',
      record_count: 1,
      target: null,
    },
  );

  // The next night finds nothing more to do and writes nothing.
  const again = await runRetention(s.env, { now: new Date('2028-11-21T02:43:00Z') });
  assert.equal(again.deleted, 0);
  assert.equal(
    (await s.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE category = 'customers'").first())
      ?.n,
    1,
  );
});

test('a run takes at most one batch, oldest first; the Worker cron calls it', async () => {
  const s = await setup();
  await s.order('20 111 111', '2026-11-18T10:30:00Z');
  await s.order('20 222 222', '2026-11-18T10:40:00Z');
  await s.order('20 333 333', '2026-11-18T10:50:00Z');
  const first = await runRetention(s.env, { now: new Date('2029-01-01T02:43:00Z'), batch: 2 });
  assert.equal(first.deleted, 2);
  assert.deepEqual(
    (await s.DB.prepare('SELECT phone_last3 FROM customers').all()).results.map(
      (r) => r.phone_last3,
    ),
    ['333'],
    'the oldest go first',
  );
  /** @type {Promise<unknown>[]} */
  const pending = [];
  await worker.scheduled(
    { scheduledTime: Date.parse('2029-01-02T02:43:00Z'), cron: '43 2 * * *' },
    s.env,
    { waitUntil: (p) => void pending.push(p) },
  );
  await Promise.all(pending);
  assert.equal((await s.DB.prepare('SELECT COUNT(*) AS n FROM customers').first())?.n, 0);
});
