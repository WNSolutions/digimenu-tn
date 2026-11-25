// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rule, cleanCode, code, ALPHABET } from '../server.js';

// The full flow (checkout, staff, card page) runs through the Worker in
// tests/platform/loyalty-api.test.js.

test('the rule has safe defaults; codes use letters that cannot be mixed up', () => {
  assert.deepEqual(rule({}), {
    stampsNeeded: 10,
    reward: { fr: 'Une récompense', ar: 'مكافأة', en: 'A reward' },
    minOrderTotal: 0,
  });
  assert.equal(rule({ stampsNeeded: 1 }).stampsNeeded, 10);
  assert.equal(rule({ stampsNeeded: 6, minOrderTotal: 5000 }).minOrderTotal, 5000);
  assert.equal(cleanCode(' k7p-x3a '), 'K7PX3A');
  assert.match(code(6), new RegExp(`^[${ALPHABET}]{6}$`));
  assert.doesNotMatch(ALPHABET, /[0O1IL5S8B2Z]/);
});
