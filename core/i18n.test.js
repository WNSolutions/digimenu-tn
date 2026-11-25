// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  translator,
  pick,
  chooseLanguage,
  fill,
  dirOf,
  isLang,
  missingTranslations,
  LANGS,
} from './i18n.js';

/** @param {string} lang @returns {Record<string, string>} */
const load = (lang) =>
  JSON.parse(readFileSync(new URL(`./i18n/${lang}.json`, import.meta.url), 'utf8'));
const texts = Object.fromEntries(LANGS.map((l) => [l, load(l)]));

test('French, Arabic and English have exactly the same text keys', () => {
  const fr = Object.keys(texts.fr).sort();
  for (const lang of ['ar', 'en']) {
    assert.deepEqual(Object.keys(texts[lang]).sort(), fr, `${lang}.json keys differ from fr.json`);
  }
});

test('every translation uses the same {placeholders} as French, and none is empty', () => {
  /** @param {string} s */
  const slots = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const [key, frText] of Object.entries(texts.fr)) {
    for (const lang of LANGS) {
      const value = texts[lang][key];
      assert.ok(typeof value === 'string' && value.trim() !== '', `${lang}: "${key}" is empty`);
      assert.equal(
        slots(value),
        slots(frText),
        `${lang}: "${key}" placeholders differ from French`,
      );
    }
  }
});

test('translator fills placeholders and falls back to French, then to the key', () => {
  const t = translator({ hello: 'Salut {name}' }, { hello: 'Bonjour {name}', bye: 'Au revoir' });
  assert.equal(t('hello', { name: 'Amel' }), 'Salut Amel');
  assert.equal(t('bye'), 'Au revoir');
  assert.equal(t('nope'), 'nope');
  assert.equal(fill('{a} et {b}', { a: 1 }), '1 et {b}');
});

test('pick returns the language actually used, with the French fallback', () => {
  const name = { fr: 'Bambalouni', ar: 'بمبالوني' };
  assert.deepEqual(pick(name, 'ar'), { text: 'بمبالوني', lang: 'ar' });
  assert.deepEqual(pick(name, 'en'), { text: 'Bambalouni', lang: 'fr' });
  assert.deepEqual(pick({ fr: 'Thé', en: '  ' }, 'en'), { text: 'Thé', lang: 'fr' });
  assert.deepEqual(pick(undefined, 'ar'), { text: '', lang: 'ar' });
});

test('chooseLanguage: saved choice, then the phone, then the café default', () => {
  const cafe = /** @type {const} */ ({ enabled: ['fr', 'ar'], default: 'fr' });
  assert.equal(chooseLanguage({ ...cafe, enabled: [...cafe.enabled] }, 'ar', ['en-US']), 'ar');
  assert.equal(
    chooseLanguage({ ...cafe, enabled: [...cafe.enabled] }, 'en', ['ar-TN', 'fr']),
    'ar',
  );
  assert.equal(
    chooseLanguage({ ...cafe, enabled: [...cafe.enabled] }, null, ['de-DE', 'en']),
    'fr',
  );
  assert.equal(chooseLanguage({ enabled: ['ar', 'en'], default: 'en' }, null, []), 'en');
});

test('direction and language checks', () => {
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('fr'), 'ltr');
  assert.equal(isLang('en'), true);
  assert.equal(isLang('de'), false);
});

test('missingTranslations lists each enabled language without text', () => {
  const missing = missingTranslations(
    [
      { where: 'item "Bsissa"', text: { fr: 'Bsissa', ar: 'بسيسة' } },
      { where: 'item "Thé"', text: { fr: 'Thé', ar: 'شاي', en: 'Tea' } },
      { where: 'none', text: undefined },
    ],
    ['fr', 'ar', 'en'],
  );
  assert.deepEqual(missing, [{ where: 'item "Bsissa"', lang: 'en' }]);
});
