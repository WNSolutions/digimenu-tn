// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptyList,
  addToList,
  setQty,
  setListNote,
  lineKey,
  countOf,
  countOfItem,
  checkList,
  loadList,
  saveList,
  listStorageKey,
  NOTE_MAX,
  DEFAULT_MAX_AGE_MS,
} from './list.js';
import { buildSnapshot, indexSnapshot } from './menu/snapshot.js';

const express = { itemId: 'i-1', variantId: 'v-1', price: 1500 };
const petit = { itemId: 'i-2', variantId: 'v-2', price: 2000 };

/** @param {{ price?: number, available?: boolean, drop?: boolean }} [change] */
function menu(change = {}) {
  const variants = [
    { id: 'v-1', price: change.price ?? 1500, available: change.available ?? true },
  ];
  const items = [{ id: 'i-1', name: { fr: 'Express' }, variants }];
  if (!change.drop)
    items.push({
      id: 'i-2',
      name: { fr: 'Café crème' },
      variants: [{ id: 'v-2', price: 2000, available: true }],
    });
  return indexSnapshot(
    buildSnapshot(
      { categories: [{ id: 'c', title: { fr: 'Cafés' }, groups: [{ id: 'g', items }] }] },
      1,
    ).snapshot,
  );
}

/** A tiny in-memory Storage. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (/** @type {string} */ k) => map.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void map.set(k, v),
    removeItem: (/** @type {string} */ k) => void map.delete(k),
  };
}

test('adding the same variant with the same note adds to one line; another note makes a new line', () => {
  let list = addToList(emptyList(), express);
  list = addToList(list, express, 2);
  list = addToList(list, express, 1, 'sans sucre');
  assert.equal(list.lines.length, 2);
  assert.equal(list.lines[0].qty, 3);
  assert.equal(countOf(list, 'v-1'), 4);
  assert.equal(countOfItem(list, 'i-1'), 4);
});

test('quantities stay between 0 and the maximum; 0 removes the line', () => {
  let list = addToList(emptyList(), express, 30, '', 20);
  assert.equal(list.lines[0].qty, 20);
  const key = lineKey(list.lines[0]);
  list = setQty(list, key, 25, 20);
  assert.equal(list.lines[0].qty, 20);
  list = setQty(list, key, 0);
  assert.equal(list.lines.length, 0);
});

test('notes are trimmed and cut at 200 characters (counted as characters, not bytes)', () => {
  const long = 'ش'.repeat(250);
  const list = setListNote(emptyList(), `  ${long}  `);
  assert.equal(Array.from(list.note).length, NOTE_MAX);
  assert.equal(addToList(emptyList(), express, 1, '  bien chaud ').lines[0].note, 'bien chaud');
});

test('checkList totals in millimes and flags changed, sold-out and removed lines (US-09)', () => {
  let list = addToList(emptyList(), express, 2);
  list = addToList(list, petit, 1);
  assert.deepEqual(
    { count: checkList(list, menu()).count, total: checkList(list, menu()).total },
    { count: 3, total: 5000 },
  );

  const changed = checkList(list, menu({ price: 1800 }));
  assert.equal(changed.lines[0].status, 'price_changed');
  assert.equal(changed.total, 5600);
  assert.equal(changed.flagged, 1);

  const soldOut = checkList(list, menu({ available: false }));
  assert.equal(soldOut.lines[0].status, 'unavailable');
  assert.equal(soldOut.total, 2000);
  assert.equal(soldOut.count, 1);

  const gone = checkList(list, menu({ drop: true }));
  assert.equal(gone.lines[1].status, 'gone');
  assert.equal(gone.total, 3000);
});

test('the list is saved per café and expires after 6 hours', () => {
  const storage = memoryStorage();
  const list = addToList(emptyList(), express, 2);
  saveList(storage, 'demo', list, 1000);
  assert.ok(storage.map.has(listStorageKey('demo')));
  assert.deepEqual(loadList(storage, 'demo', 2000), list);
  assert.deepEqual(loadList(storage, 'other', 2000), emptyList());
  assert.deepEqual(loadList(storage, 'demo', 1000 + DEFAULT_MAX_AGE_MS + 1), emptyList());
  assert.equal(storage.map.has('dm:demo:list'), false, 'an expired list is removed');
});

test('an unreadable or unknown saved list gives an empty list, never an error', () => {
  const storage = memoryStorage();
  storage.setItem('dm:demo:list', '{not json');
  assert.deepEqual(loadList(storage, 'demo', 0), emptyList());
  storage.setItem('dm:demo:list', JSON.stringify({ v: 99, lines: [], savedAt: 0 }));
  assert.deepEqual(loadList(storage, 'demo', 0), emptyList());
  storage.setItem(
    'dm:demo:list',
    JSON.stringify({
      v: 1,
      savedAt: 0,
      note: '',
      lines: [
        { itemId: 'i-1', variantId: 'v-1', qty: 1.5, price: 1500 },
        { ...express, qty: 1, note: '' },
      ],
    }),
  );
  assert.equal(loadList(storage, 'demo', 0).lines.length, 1, 'bad lines are dropped');
  assert.deepEqual(loadList(null, 'demo', 0), emptyList());
});

test('saving an empty list removes it; storage errors are ignored', () => {
  const storage = memoryStorage();
  saveList(storage, 'demo', addToList(emptyList(), express), 0);
  saveList(storage, 'demo', emptyList(), 0);
  assert.equal(storage.map.size, 0);
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => saveList(broken, 'demo', addToList(emptyList(), express), 0));
});
