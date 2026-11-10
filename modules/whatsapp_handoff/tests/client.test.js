// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import register, { buildMessage, whatsappLink, makeRef } from '../client.js';

/** @typedef {import('../../../core/app/extensions.js').ListActionContext} Ctx */
/** @typedef {import('../../../core/app/extensions.js').ModuleApi} Api */

/** @param {string} lang @returns {Record<string, string>} */
const texts = (lang) =>
  JSON.parse(readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), 'utf8'));

/** @param {string} lang */
const t =
  (lang) =>
  (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (texts(lang)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

/** @type {Api['pick']} */
const pick = (text, lang) => ({ text: text?.[lang] || text?.fr || '', lang });
/** @param {number} m */
const price = (m) => `${Math.floor(m / 1000)},${String(m % 1000).padStart(3, '0')} DT`;

/** A list checked against the menu, as the core gives it (plain data). */
function context(/** @type {Partial<Ctx>} */ over = {}) {
  const entry = (/** @type {string} */ item, /** @type {string} */ variant = '') => ({
    item: { name: { fr: item, ar: `${item} (ar)` } },
    variant: { name: variant ? { fr: variant } : undefined },
  });
  return /** @type {Ctx} */ ({
    checked: {
      count: 3,
      total: 5800,
      flagged: 1,
      lines: [
        {
          key: 'a',
          status: 'ok',
          total: 3000,
          line: { qty: 2, note: 'bien chaud' },
          entry: entry('Express'),
        },
        {
          key: 'b',
          status: 'price_changed',
          total: 2800,
          line: { qty: 1, note: '' },
          entry: entry('Café crème', 'Grand'),
        },
        {
          key: 'c',
          status: 'unavailable',
          total: 0,
          line: { qty: 1, note: '' },
          entry: entry('Cappuccino'),
        },
      ],
    },
    note: 'à servir ensemble',
    cafe: {
      slug: 'demo',
      name: { fr: 'Café Démo Jasmin' },
      languages: { enabled: ['fr', 'ar', 'en'], default: 'fr' },
    },
    table: { label: '5', valid: true },
    lang: 'fr',
    now: new Date(0),
    ...over,
  });
}

test('the message lists table, lines with notes, order note and total; sold-out lines are left out', () => {
  const text = buildMessage(context(), { lang: 'fr', ref: 'K7PX', t: t('fr'), pick, price });
  assert.equal(
    text,
    [
      'Nouvelle commande · Café Démo Jasmin',
      'Sur place · Table 5',
      'Réf. K7PX',
      '',
      '2 × Express — 3,000 DT',
      '   Note\u00a0: bien chaud',
      '1 × Café crème · Grand — 2,800 DT',
      '',
      'Note pour la commande\u00a0: à servir ensemble',
      'Total\u00a0: 5,800 DT',
      '',
      'Envoyé depuis la carte DigiMenu',
    ].join('\n'),
  );
});

test('no valid table: the waiter is told; a customer in another language is named', () => {
  const text = buildMessage(context({ table: { label: '5', valid: false }, lang: 'ar' }), {
    lang: 'fr',
    ref: 'K7PX',
    t: t('fr'),
    pick,
    price,
  });
  assert.match(text, /Sans numéro de table/);
  assert.match(text, /Langue du client\u00a0: arabe/);
  assert.doesNotMatch(text, /Table 5/);
});

test('the link goes to the café number, or lets WhatsApp ask (demo café only)', () => {
  assert.equal(whatsappLink('+216 20 000 000', 'a b'), 'https://wa.me/21620000000?text=a%20b');
  assert.equal(
    whatsappLink(undefined, 'Total : 5,800 DT\n'),
    'https://wa.me/?text=Total%20%3A%205%2C800%20DT%0A',
  );
});

test('references are 4 easy-to-read characters', () => {
  assert.match(makeRef(), /^[ACDEFHJKMNPRTVWXY34679]{4}$/);
  assert.equal(
    makeRef(() => new Uint8Array([0, 1, 2, 3])),
    'ACDE',
  );
});

test('register contributes the main button in the customer language, message in the café language', () => {
  /** @type {((c: Ctx) => any)[]} */
  const fns = [];
  register(
    /** @type {Api} */ ({
      key: 'whatsapp_handoff',
      settings: { number: '+21620000000' },
      texts: (lang) => t(lang),
      pick,
      price,
      contribute: (_point, fn) => void fns.push(fn),
    }),
  );
  assert.equal(fns.length, 1);
  const action = fns[0](context({ lang: 'ar' }));
  assert.equal(action.label, 'اطلب عبر واتساب');
  assert.equal(action.icon, 'message-circle');
  assert.ok(action.href.startsWith('https://wa.me/21620000000?text='));
  const text = decodeURIComponent(action.href.split('?text=')[1]);
  assert.match(text, /^Nouvelle commande · Café Démo Jasmin/);
  // Same list, same reference; an empty list has no button.
  assert.equal(fns[0](context({ lang: 'ar' })).href, action.href);
  assert.equal(fns[0](context({ checked: { count: 0, total: 0, flagged: 0, lines: [] } })), null);
});

test('the three text files have the same keys', () => {
  const fr = Object.keys(texts('fr')).sort();
  assert.deepEqual(Object.keys(texts('ar')).sort(), fr);
  assert.deepEqual(Object.keys(texts('en')).sort(), fr);
});
