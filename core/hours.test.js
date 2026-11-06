// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openStatus, localClock, formatClock } from './hours.js';

/** @type {import('./hours.js').Hours} */
const HOURS = {
  mon: [['07:00', '23:00']],
  tue: [['07:00', '23:00']],
  wed: [
    ['07:00', '12:00'],
    ['15:00', '23:00'],
  ],
  thu: [['07:00', '23:00']],
  fri: [['07:00', '23:30']],
  sat: [['08:00', '00:30']],
};

// Tunisia is UTC+1 all year: 10:00 UTC is 11:00 in Tunis. 2026-11-02 is a Monday.
const at = (/** @type {string} */ iso) => new Date(iso);

test('local clock in Tunis', () => {
  assert.deepEqual(localClock(at('2026-11-02T10:00:00Z'), 'Africa/Tunis'), {
    day: 0,
    minutes: 660,
  });
  assert.equal(formatClock(at('2026-11-06T00:21:00Z').getTime()), '01:21');
});

test('open: says when it closes', () => {
  assert.deepEqual(openStatus(HOURS, at('2026-11-02T10:00:00Z')), {
    open: true,
    closesAt: '23:00',
  });
});

test('closed before opening: opens later the same day', () => {
  assert.deepEqual(openStatus(HOURS, at('2026-11-02T05:00:00Z')), {
    open: false,
    opensAt: '07:00',
    opensDay: 'mon',
    sameDay: true,
  });
});

test('lunch break between two intervals', () => {
  // Wednesday 13:00 in Tunis.
  const s = openStatus(HOURS, at('2026-11-04T12:00:00Z'));
  assert.deepEqual(s, { open: false, opensAt: '15:00', opensDay: 'wed', sameDay: true });
});

test('an interval ending after midnight stays open into the next day', () => {
  // Sunday 00:15 in Tunis belongs to Saturday's 08:00–00:30.
  assert.deepEqual(openStatus(HOURS, at('2026-11-07T23:15:00Z')), {
    open: true,
    closesAt: '00:30',
  });
});

test('closed for a whole day: the next opening is on another day', () => {
  // Sunday 12:00 in Tunis (no Sunday hours) → Monday 07:00.
  const s = openStatus(HOURS, at('2026-11-08T11:00:00Z'));
  assert.equal(s?.open, false);
  assert.equal(s && !s.open && s.opensAt, '07:00');
  assert.equal(s && !s.open && s.opensAt !== null && s.opensDay, 'mon');
});

test('no hours configured: nothing is shown; empty hours: closed with no next opening', () => {
  assert.equal(openStatus(undefined, at('2026-11-02T10:00:00Z')), null);
  assert.deepEqual(openStatus({}, at('2026-11-02T10:00:00Z')), { open: false, opensAt: null });
});
