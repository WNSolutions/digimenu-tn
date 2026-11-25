// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dashboard } from '../staff.js';

/** @typedef {import('../../../platform/admin/staff-api.js').StaffApi} StaffApi */

const fr = JSON.parse(readFileSync(new URL('../i18n/staff.fr.json', import.meta.url), 'utf8'));
const api = /** @type {StaffApi} */ ({ t: (/** @type {string} */ k) => fr[k] ?? k });

test('the "Visites" card: invitations seen, taps, and their share', () => {
  assert.deepEqual(dashboard(api, { shown: 40, tap: 9 }).tiles, [
    { label: 'Invitations vues', value: '40' },
    { label: 'Clics vers Google', value: '9' },
    { label: 'Part des clics', value: '23 %' },
  ]);
  assert.equal(dashboard(api, {}).tiles[2].value, '–', 'nothing yet');
  assert.equal(dashboard(api, { shown: 1, tap: 3 }).tiles[2].value, '100 %', 'never above 100');
  assert.equal(dashboard(api, {}).title, 'Avis Google');
});
