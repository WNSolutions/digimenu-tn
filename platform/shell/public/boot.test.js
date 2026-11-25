// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLink, bootUrl, bootLanguage, savedBoot, simplePrice } from './boot.js';
import { formatPrice } from '../../../core/money.js';

test('reads the printed link /<café>/t/<table>?k=<code> (ADR-0004)', () => {
  assert.deepEqual(parseLink('/demo/t/5', '?k=7QF3K9'), {
    cafe: 'demo',
    table: '5',
    code: '7QF3K9',
  });
  assert.deepEqual(parseLink('/demo/t/T1/', ''), { cafe: 'demo', table: 'T1', code: null });
  assert.deepEqual(parseLink('/demo', ''), { cafe: 'demo', table: null, code: null });
  assert.deepEqual(parseLink('/demo/t/%E2%81%A85', ''), {
    cafe: 'demo',
    table: '\u20685',
    code: null,
  });
  assert.deepEqual(parseLink('/demo/t/%E0%A4%A', ''), { cafe: 'demo', table: null, code: null });
});

test('anything that is not a café slug is refused', () => {
  for (const path of ['/', '/Demo', '/-demo', '/d', '/a_b/t/1', `/${'a'.repeat(33)}`]) {
    assert.equal(parseLink(path, ''), null, path);
  }
});

test('one boot call carries café, table, code, language and the new-visit flag', () => {
  const link = { cafe: 'demo', table: '5', code: '7QF3K9' };
  assert.equal(
    bootUrl(link, { lang: 'ar', newVisit: true }),
    '/api/boot?cafe=demo&t=5&k=7QF3K9&lang=ar&nv=1',
  );
  assert.equal(bootUrl({ cafe: 'demo', table: null, code: null }), '/api/boot?cafe=demo');
});

test('the boot page speaks the saved or phone language before the café is known', () => {
  assert.equal(bootLanguage('ar', ['en-US']), 'ar');
  assert.equal(bootLanguage(null, ['de-DE', 'en-GB']), 'en');
  assert.equal(bootLanguage('xx', []), 'fr');
});

test('the saved copy is used offline, without the table unless it is the same printed link', () => {
  const link = { cafe: 'demo', table: '5', code: '7QF3K9' };
  const boot = {
    cafe: { slug: 'demo' },
    table: { label: '5', valid: true },
    menu: { categories: [] },
  };
  const raw = JSON.stringify({ savedAt: 1000, link, boot });
  assert.deepEqual(savedBoot(raw, link, 2000), { ...boot, offline: { savedAt: 1000 } });
  assert.equal(savedBoot(raw, { ...link, table: '7', code: 'X' }, 2000)?.table, null);
  assert.equal(savedBoot(raw, { ...link, cafe: 'other' }, 2000), null);
  assert.equal(savedBoot(raw, link, 1000 + 8 * 24 * 3_600_000), null, 'too old');
  assert.equal(savedBoot('{oops', link, 2000), null);
  assert.equal(savedBoot(null, link, 2000), null);
});

test('the minimal renderer formats prices like the release does', () => {
  for (const m of [0, 500, 4500, 12_000, 1_250_000]) assert.equal(simplePrice(m), formatPrice(m));
});
