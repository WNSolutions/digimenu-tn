// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSnapshot, indexSnapshot, isOrderable, SNAPSHOT_SCHEMA } from './snapshot.js';

/** @returns {import('./snapshot.js').MenuSource} */
const source = () => ({
  categories: [
    {
      id: 'c-2',
      sort: 2,
      title: { fr: 'Thés' },
      groups: [
        {
          id: 'g-2',
          items: [{ id: 'i-3', name: { fr: 'Thé vert' }, variants: [{ id: 'v-4', price: 2000 }] }],
        },
      ],
    },
    {
      id: 'c-1',
      sort: 1,
      title: { fr: 'Cafés', ar: 'قهوة' },
      groups: [
        {
          id: 'g-1',
          items: [
            {
              id: 'i-1',
              name: { fr: 'Café crème' },
              variants: [
                { id: 'v-1', name: { fr: 'Petit' }, price: 2000 },
                { id: 'v-2', name: { fr: 'Grand' }, price: 2800, available: false },
              ],
            },
            {
              id: 'i-2',
              name: { fr: 'Cappuccino' },
              available: false,
              variants: [{ id: 'v-3', price: 3500 }],
            },
          ],
        },
      ],
    },
    { id: 'c-3', title: { fr: 'Caché' }, visible: false, groups: [] },
  ],
});

test('builds categories in order and leaves hidden ones out', () => {
  const { snapshot, problems } = buildSnapshot(source(), 7);
  assert.deepEqual(problems, []);
  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA);
  assert.equal(snapshot.rev, 7);
  assert.deepEqual(
    snapshot.categories.map((c) => c.id),
    ['c-1', 'c-2'],
  );
});

test('the index finds every variant with its item and category', () => {
  const index = indexSnapshot(buildSnapshot(source(), 1).snapshot);
  assert.equal(index.size, 4);
  const entry = index.get('v-1');
  assert.equal(entry?.item.id, 'i-1');
  assert.equal(entry?.category.id, 'c-1');
  assert.equal(isOrderable(/** @type {any} */ (index.get('v-1'))), true);
  assert.equal(isOrderable(/** @type {any} */ (index.get('v-2'))), false, 'sold-out variant');
  assert.equal(isOrderable(/** @type {any} */ (index.get('v-3'))), false, 'sold-out item');
});

test('invalid entries are reported and left out; the rest is still built', () => {
  const s = source();
  s.categories[1].groups[0].items.push(
    { id: 'i-9', name: { fr: '' }, variants: [{ id: 'v-9', price: 100 }] },
    { id: 'i-10', name: { fr: 'Prix faux' }, variants: [{ id: 'v-10', price: 1.5 }] },
    { id: 'i-1', name: { fr: 'Doublon' }, variants: [{ id: 'v-11', price: 100 }] },
  );
  const { snapshot, problems } = buildSnapshot(s, 1);
  assert.equal(problems.length, 4, problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('French name is missing')));
  assert.ok(problems.some((p) => p.includes('used twice')));
  assert.ok(problems.some((p) => p.includes('no valid price')));
  const names = snapshot.categories[0].groups[0].items.map((i) => i.name.fr);
  assert.deepEqual(names, ['Café crème', 'Cappuccino', 'Doublon']);
});
