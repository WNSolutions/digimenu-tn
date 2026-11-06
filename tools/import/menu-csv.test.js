// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { importMenuCsv, parseCsv, stableId, formatReport } from './menu-csv.js';

const HEADER = 'category_fr;group_fr;item_fr;item_en;variant_fr;price;available';

test('parseCsv reads ; or , separators, quotes, and a UTF-8 BOM', () => {
  assert.deepEqual(parseCsv('\ufeffa;b\n"x;y";"say ""hi"""\n'), [
    ['a', 'b'],
    ['x;y', 'say "hi"'],
  ]);
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('ids are stable: the same names give the same ids on every import', () => {
  assert.equal(stableId('i-', 'express'), stableId('i-', 'express'));
  assert.notEqual(stableId('i-', 'express'), stableId('i-', 'cappuccino'));
});

test('imports items with sizes and reports missing translations', () => {
  const csv = [
    HEADER,
    'Cafés;;Express;Espresso;;1,5;oui',
    'Cafés;Au lait;Café crème;;Petit;2;oui',
    'Cafés;Au lait;Café crème;;Grand;2,8;non',
  ].join('\n');
  const result = importMenuCsv(csv, { languages: ['fr', 'en'] });
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.counts, { categories: 1, items: 2, variants: 3 });
  const [express, creme] = result.source.categories[0].groups.flatMap((g) => g.items);
  assert.equal(express.variants[0].price, 1500);
  assert.deepEqual(
    creme.variants.map((v) => [v.name?.fr, v.price, v.available]),
    [
      ['Petit', 2000, true],
      ['Grand', 2800, false],
    ],
  );
  assert.ok(result.missing.some((m) => m.where === 'item "Café crème"' && m.lang === 'en'));
});

test('bad rows are skipped with a plain-language reason and their row number', () => {
  const csv = [
    HEADER,
    'Cafés;;Express;;;4,5dt;oui', // glued unit
    'Cafés;;;;;2;oui', // no name
    'Cafés;;Thé;;;4,5000;oui', // 4 decimals
    ';;Jus;;;3;oui', // no category
    'Cafés;;Capucin;;;2200;oui', // ambiguous
    'Cafés;;Café turc;;;2,5;peut-être', // bad available
    'Cafés;;Express2;;;1,5;oui',
    'Cafés;;Express2;;;1,6;oui', // same item twice without a size
  ].join('\n');
  const { skipped, counts } = importMenuCsv(csv);
  assert.deepEqual(
    skipped.map((p) => p.row),
    [2, 3, 4, 5, 6, 7, 9],
  );
  assert.match(skipped[0].message, /not a price/);
  assert.match(skipped[1].message, /French name is empty/);
  assert.match(skipped[2].message, /more than 3 decimals/);
  assert.match(skipped[3].message, /No category/);
  assert.match(skipped[4].message, /could mean 2,200\u00a0DT or 2\u202f200,000\u00a0DT/);
  assert.match(skipped[5].message, /oui or non/);
  assert.match(skipped[6].message, /appears twice/);
  assert.equal(counts.items, 1);
});

test('a file without the template columns is refused as a whole', () => {
  const { skipped, counts } = importMenuCsv('nom;prix\nExpress;1,5');
  assert.equal(counts.items, 0);
  assert.ok(skipped.length >= 2);
  assert.match(formatReport(importMenuCsv('nom;prix\nExpress;1,5')), /Start from the template/);
});

test('the demo café menu imports cleanly', () => {
  const csv = readFileSync(new URL('../../cafes/demo/menu.csv', import.meta.url), 'utf8');
  const result = importMenuCsv(csv);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.counts.categories, 6);
  assert.ok(result.missing.length > 0, 'the demo keeps a few missing translations on purpose');
});
