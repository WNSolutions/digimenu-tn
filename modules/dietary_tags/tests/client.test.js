// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import register, { tagsOf, DIETS, ALLERGENS } from '../client.js';

/** @typedef {import('../../../core/app/extensions.js').ModuleApi} Api */
/** @typedef {import('../../../core/i18n.js').Lang} Lang */

// The core side (item-extras.js: drawing, path data only, failing modules) is tested in
// core/app/item-extras.test.js; the menu editor's checks in tests/platform/item-ext.test.js.

/** @type {Record<string, Record<string, string>>} */
const texts = Object.fromEntries(
  ['fr', 'ar', 'en'].map((lang) => [
    lang,
    JSON.parse(readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), 'utf8')),
  ]),
);
const schema = JSON.parse(readFileSync(new URL('../item.schema.json', import.meta.url), 'utf8'));

/** @param {string} lang */
const t =
  (lang) =>
  (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (texts[lang][key] ?? texts.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? `{${k}}`),
    );

function setup() {
  /** @type {Record<string, any[]>} */
  const got = {};
  register(
    /** @type {Api} */ ({
      key: 'dietary_tags',
      settings: {},
      texts: (lang) => t(lang),
      contribute: (point, /** @type {any} */ fn) => void (got[point] ??= []).push(fn),
    }),
  );
  /** @param {unknown} ext @param {Lang} [lang] */
  const badges = (ext, lang = 'fr') => got['menu.itemBadge'][0]({ ext, lang, item: { id: 'i1' } });
  /** @param {unknown} ext @param {Lang} [lang] */
  const detail = (ext, lang = 'fr') => got['menu.itemDetail'][0]({ ext, lang, item: { id: 'i1' } });
  return { got, badges, detail };
}

test('one label per diet with its icon, one label for all the allergens it contains', () => {
  const { badges } = setup();
  const list = badges({ tags: ['milk', 'vegetarian', 'eggs', 'spicy'] });
  assert.deepEqual(
    list.map((/** @type {any} */ b) => b.text),
    ['Végétarien', 'Épicé', 'Contient : œufs, lait'],
    'fixed order: diets, then allergens in the declared order',
  );
  for (const b of list) {
    assert.ok(Array.isArray(b.icon.paths) && b.icon.paths.length, `${b.text} has an icon`);
    for (const d of b.icon.paths) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/);
  }
  assert.deepEqual(
    badges({ tags: ['gluten', 'nuts'] }, 'ar').map((/** @type {any} */ b) => b.text),
    ['يحتوي على: الغلوتين، المكسرات'],
  );
  assert.deepEqual(
    badges({ tags: ['vegan'] }, 'en').map((/** @type {any} */ b) => b.text),
    ['Vegan'],
  );
});

test('unknown tags, missing or broken data show nothing; the note comes with any tag', () => {
  const { badges, detail } = setup();
  assert.deepEqual(badges({ tags: ['halal', 'organic'] }), []);
  assert.deepEqual(badges({}), []);
  assert.deepEqual(badges({ tags: 'milk' }), []);
  assert.deepEqual(badges(null), []);
  assert.equal(detail({ tags: [] }), null);
  assert.deepEqual(detail({ tags: ['sesame'] }), [
    {
      kind: 'text',
      tone: 'muted',
      text: 'Étiquettes fournies par le café : demandez au personnel en cas d’allergie.',
    },
  ]);
  assert.match(detail({ tags: ['spicy'] }, 'ar')[0].text, /اسأل العاملين/);
  assert.deepEqual(tagsOf({ tags: ['lupin', 'vegan', 'vegan'] }), {
    diets: ['vegan'],
    allergens: ['lupin'],
  });
});

test('texts, schema and code name the same tags in all three languages', () => {
  const keys = Object.keys(texts.fr).sort();
  assert.deepEqual(Object.keys(texts.ar).sort(), keys);
  assert.deepEqual(Object.keys(texts.en).sort(), keys);
  const all = [...DIETS, ...ALLERGENS];
  assert.deepEqual(schema.properties.tags.items.enum, all);
  for (const tag of all) {
    assert.ok(schema.properties.tags['x-enumLabels'][tag]?.fr, `${tag} has a staff name`);
    assert.ok(schema.properties.tags['x-enumLabels'][tag]?.ar, `${tag} has an Arabic staff name`);
  }
  for (const d of DIETS) assert.ok(texts.fr[`diet.${d}`]);
  for (const a of ALLERGENS) assert.ok(texts.fr[`allergen.${a}`]);
  assert.equal(ALLERGENS.length, 14, 'the 14 allergens to declare');
});
