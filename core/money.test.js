// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice, lineTotal, sum, parsePrice, assertMillimes, MAX_PRICE } from './money.js';

const THIN = '\u202f';
const NBSP = '\u00a0';

test('formatPrice: comma before 3 millime digits, narrow space for thousands, no-break space before DT', () => {
  assert.equal(formatPrice(4500), `4,500${NBSP}DT`);
  assert.equal(formatPrice(500), `0,500${NBSP}DT`);
  assert.equal(formatPrice(0), `0,000${NBSP}DT`);
  assert.equal(formatPrice(1_250_000), `1${THIN}250,000${NBSP}DT`);
  assert.equal(formatPrice(-500), `-0,500${NBSP}DT`);
});

test('formatPrice refuses anything that is not whole millimes', () => {
  assert.throws(() => formatPrice(4.5), TypeError);
  assert.throws(() => formatPrice(Number.NaN), TypeError);
  assert.throws(() => assertMillimes(2 ** 53), TypeError);
});

test('totals add whole millimes with no rounding drift', () => {
  assert.equal(lineTotal(1350, 3), 4050);
  assert.equal(sum([1500, 2200, 2500]), 6200);
  assert.equal(sum([]), 0);
  // 0.1 + 0.2 style drift cannot happen: 10 × 0,100 DT is exactly 1,000 DT.
  assert.equal(sum(Array.from({ length: 10 }, () => 100)), 1000);
  assert.throws(() => lineTotal(1500, 1.5), TypeError);
  assert.throws(() => lineTotal(1500, -1), TypeError);
});

test('parsePrice reads the ways people write prices', () => {
  for (const [text, millimes] of /** @type {[string, number][]} */ ([
    ['4,5', 4500],
    ['4.5', 4500],
    ['4,500', 4500],
    ['4.500', 4500],
    ['12', 12000],
    ['0,5', 500],
    ['4,500 DT', 4500],
    ['4,500 dt', 4500],
    [` 2,8${NBSP}`, 2800],
    ['99', 99000],
  ])) {
    assert.deepEqual(parsePrice(text), { ok: true, millimes }, text);
  }
});

test('parsePrice refuses unclear or wrong prices with a reason', () => {
  assert.deepEqual(parsePrice(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parsePrice('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(parsePrice('4,5dt'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parsePrice('quatre'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parsePrice('4,5,0'), { ok: false, reason: 'invalid' });
  assert.deepEqual(parsePrice('4,5000'), { ok: false, reason: 'too_many_decimals' });
  assert.deepEqual(parsePrice('-2'), { ok: false, reason: 'negative' });
  assert.deepEqual(parsePrice('99999,5'), { ok: false, reason: 'too_large' });
});

test('a whole number of 100 or more is ambiguous (D-045) and offers both readings', () => {
  assert.deepEqual(parsePrice('4500'), {
    ok: false,
    reason: 'ambiguous',
    choices: [4500, 4_500_000],
  });
  assert.deepEqual(parsePrice('100'), { ok: false, reason: 'ambiguous', choices: [100, 100_000] });
  // Too large as dinars: only the millimes reading is possible.
  assert.deepEqual(parsePrice('45000'), { ok: true, millimes: 45000 });
  assert.equal(MAX_PRICE, 9_999_999);
});
