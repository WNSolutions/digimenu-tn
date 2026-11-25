// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTracked, saveTracked, nextCheck, AUTO_AT, KEEP_MS, FINAL } from './order-store.js';

/** A Storage-like map. */
function memory() {
  const m = new Map();
  return /** @type {Storage} */ (
    /** @type {unknown} */ ({
      getItem: (/** @type {string} */ k) => m.get(k) ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => m.set(k, String(v)),
      removeItem: (/** @type {string} */ k) => m.delete(k),
    })
  );
}

test('the last order is kept on this phone for 3 hours, per café', () => {
  const s = memory();
  const at = Date.parse('2026-11-25T12:00:00Z');
  saveTracked(s, 'demo', { key: 'k'.repeat(20), number: 'A12', at, status: 'accepted' });
  assert.deepEqual(loadTracked(s, 'demo', at + 60_000), {
    key: 'k'.repeat(20),
    number: 'A12',
    at,
    status: 'accepted',
  });
  assert.equal(loadTracked(s, 'other', at), null, 'another café does not see it');
  assert.equal(loadTracked(s, 'demo', at + KEEP_MS + 1), null, 'too old');
  assert.equal(loadTracked(s, 'demo', at - 1), null, 'a clock that went back');
  saveTracked(s, 'demo', null);
  assert.equal(loadTracked(s, 'demo', at), null);
  assert.equal(loadTracked(null, 'demo', at), null, 'no storage');
});

test('a damaged or strange entry is ignored or read safely', () => {
  const s = memory();
  s.setItem('dm:demo:order', '{not json');
  assert.equal(loadTracked(s, 'demo', 0), null);
  s.setItem('dm:demo:order', JSON.stringify({ key: 'k', number: 12, at: 0 }));
  assert.equal(loadTracked(s, 'demo', 0), null);
  s.setItem('dm:demo:order', JSON.stringify({ key: 'k', number: 'A1', at: 0, status: '<b>' }));
  assert.equal(loadTracked(s, 'demo', 0)?.status, 'received');
});

test('at most 3 automatic checks per order (A4), never more after a reload', () => {
  const min = 60_000;
  const t = { key: 'k'.repeat(20), number: 'A1', at: 0, status: 'received' };
  assert.deepEqual(AUTO_AT, [4, 12, 25]);
  assert.equal(nextCheck(t, 0), 4 * min);
  assert.equal(nextCheck(t, 5 * min), 0, 'due: the page was hidden or closed at 4 minutes');
  assert.equal(nextCheck({ ...t, checked: 4 * min }, 5 * min), 7 * min, 'next at 12 minutes');
  assert.equal(nextCheck({ ...t, checked: 13 * min }, 20 * min), 5 * min, 'next at 25 minutes');
  assert.equal(nextCheck({ ...t, checked: 25 * min }, 26 * min), null, 'then tap to refresh');
  assert.equal(
    nextCheck({ ...t, checked: 30 * min }, 31 * min),
    null,
    'a tap after the last point adds no automatic check',
  );
  assert.deepEqual(FINAL, ['served', 'rejected', 'cancelled'], '"unconfirmed" can still change');
});

test('when it was last checked is kept with the order', () => {
  const s = memory();
  const t = { key: 'k'.repeat(20), number: 'A1', at: 1000, status: 'accepted', checked: 5000 };
  saveTracked(s, 'demo', t);
  assert.deepEqual(loadTracked(s, 'demo', 6000), t);
  saveTracked(s, 'demo', { ...t, checked: 10 });
  assert.equal(loadTracked(s, 'demo', 6000)?.checked, undefined, 'a check before the order');
});
