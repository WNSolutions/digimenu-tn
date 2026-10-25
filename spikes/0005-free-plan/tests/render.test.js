import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, formatPrice, renderMenu, renderPage } from '../public/render.js';

/**
 * @param {number} count
 * @returns {import('../public/render.js').MenuItem[]}
 */
function fakeMenu(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    category: i < count / 2 ? 'cafes' : 'desserts',
    nameFr: `Plat ${i + 1}`,
    nameAr: `طبق ${i + 1}`,
    nameEn: `Dish ${i + 1}`,
    descFr: 'Description',
    descAr: 'وصف',
    descEn: 'Description',
    priceMillimes: 1500 + i,
  }));
}

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('1')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
  );
});

test('formatPrice shows millimes as dinars with three digits, "DT" in every language', () => {
  assert.equal(formatPrice(4500), '4,500 DT');
  assert.equal(formatPrice(250), '0,250 DT');
  assert.equal(formatPrice(12000), '12,000 DT');
  assert.throws(() => formatPrice(4.5), RangeError);
  assert.throws(() => formatPrice(-1), RangeError);
});

test('renderMenu renders every item once, grouped by category', () => {
  const html = renderMenu(fakeMenu(150), { cafeName: 'Café Démo', table: '5', lang: 'fr' });
  assert.equal(html.match(/class="menu-item"/g)?.length, 150);
  assert.equal(html.match(/class="menu-section"/g)?.length, 2);
  assert.match(html, /Table 5/);
});

test('renderMenu never lets item text become markup', () => {
  const [item] = fakeMenu(1);
  const html = renderMenu([{ ...item, nameFr: '<script>alert(1)</script>' }], {
    cafeName: 'X',
    table: '1',
    lang: 'fr',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('Arabic is right-to-left and falls back to French text when a translation is empty', () => {
  const [item] = fakeMenu(1);
  const html = renderMenu([{ ...item, nameAr: '' }], { cafeName: 'X', table: '1', lang: 'ar' });
  assert.match(html, /dir="rtl"/);
  assert.match(html, /Plat 1/);
});

test('renderPage is a complete document with the right language', () => {
  const html = renderPage(fakeMenu(3), { cafeName: 'X', table: '1', lang: 'en' });
  assert.ok(html.startsWith('<!doctype html><html lang="en" dir="ltr">'));
  assert.ok(html.endsWith('</body></html>'));
});
