// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import register, { cardBlocks } from '../client.js';
import { looksLikePhone } from '../staff.js';

/** @typedef {import('../../../core/app/extensions.js').ModuleApi} Api */
/** @typedef {import('../../../core/i18n.js').Lang} Lang */

/** @type {Record<string, Record<string, string>>} */
const texts = Object.fromEntries(
  ['fr', 'ar', 'en'].map((lang) => [
    lang,
    JSON.parse(readFileSync(new URL(`../i18n/${lang}.json`, import.meta.url), 'utf8')),
  ]),
);
/** @param {string} lang */
const t =
  (lang) =>
  (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (texts[lang][key] ?? texts.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? `{${k}}`),
    );

/**
 * The module registered with a fake api, as the core would give it.
 * @param {(route: string, body: any) => { status: number, data: any }} [answer]
 */
function setup(answer = () => ({ status: 404, data: {} })) {
  /** @type {Map<string, string>} */
  const store = new Map();
  /** @type {{ route: string, body: any }[]} */
  const calls = [];
  /** @type {Record<string, any[]>} */
  const got = {};
  register(
    /** @type {Api} */ ({
      key: 'loyalty',
      settings: { stampsNeeded: 10, reward: { fr: 'Un café offert', ar: 'قهوة مجانية' } },
      texts: (lang) => t(lang),
      pick: (text, lang) => ({
        text: /** @type {any} */ (text)?.[lang] ?? /** @type {any} */ (text)?.fr ?? '',
        lang,
      }),
      price: (m) => `${m}`,
      storage: {
        get: (k) => store.get(k) ?? null,
        set: (k, v) => void store.set(k, v),
        remove: (k) => void store.delete(k),
      },
      call: async (route, body = {}) => {
        calls.push({ route, body });
        const a = answer(route, body);
        return { ok: a.status === 200, ...a };
      },
      contribute: (point, /** @type {any} */ fn) => void (got[point] ??= []).push(fn),
    }),
  );
  return { got, store, calls };
}

test('the three text files have the same keys', () => {
  assert.deepEqual(Object.keys(texts.ar).sort(), Object.keys(texts.fr).sort());
  assert.deepEqual(Object.keys(texts.en).sort(), Object.keys(texts.fr).sort());
});

test('it adds a top-bar button, the card page at /<café>/carte, checkout and post-order parts', () => {
  const s = setup();
  assert.deepEqual(Object.keys(s.got).sort(), [
    'checkout.fields',
    'header.action',
    'postOrder.block',
    'sheet.page',
  ]);
  assert.deepEqual(s.got['header.action'][0]({ lang: 'ar' }), {
    label: 'الوفاء',
    icon: 'gift',
    page: 'card',
  });
  const page = s.got['sheet.page'][0];
  assert.equal(page.id, 'card');
  assert.equal(page.path, 'carte');
  assert.equal(page.title('fr'), 'Ma carte de fidélité');
});

test('checkout asks to join until this phone holds a card, then sends the card instead', () => {
  const s = setup();
  const fields = s.got['checkout.fields'][0];
  const ask = fields({ type: 'dine_in', lang: 'fr', table: '5' });
  assert.equal(ask.fields[0].kind, 'consent');
  assert.equal(ask.fields[0].purpose, 'loyalty');
  assert.match(ask.fields[0].note, /^10 commandes = Un café offert\./);
  assert.equal(ask.input, undefined);

  const after = s.got['postOrder.block'][0];
  const token = 't'.repeat(32);
  const blocks = after({
    order: {},
    answer: { joined: true, token, number: 'K7PX3A' },
    lang: 'fr',
  });
  assert.equal(blocks[0].tone, 'success');
  assert.deepEqual(blocks[1], { kind: 'page', label: 'Voir ma carte', page: 'card' });
  assert.equal(s.store.get('card'), token, 'the token stays on this phone');

  const member = fields({ type: 'dine_in', lang: 'fr', table: '5' });
  assert.equal(member.fields[0].kind, 'info');
  assert.deepEqual(member.input, { token });
  assert.equal(after({ order: {}, answer: null, lang: 'fr' }), null);
  assert.equal(after({ order: {}, answer: { known: true }, lang: 'fr' })[0].tone, 'muted');
});

test('the card page: no card yet, the card with its stamps, a lost card, a new phone', async () => {
  const card = {
    number: 'K7PX3A',
    stamps: 3,
    stampsNeeded: 10,
    rewards: 0,
    toNext: 7,
    reward: { fr: 'Un café offert' },
  };
  let lost = false;
  const s = setup((route, body) => {
    if (route === 'card') return lost ? { status: 404, data: {} } : { status: 200, data: card };
    if (route === 'claim' && body.code === 'ACDEFHJKMN')
      return { status: 200, data: { ...card, token: 'n'.repeat(32) } };
    return { status: 422, data: { error: 'bad_code' } };
  });
  const page = s.got['sheet.page'][0];

  const none = await page.view({ lang: 'fr' });
  assert.equal(none[0].kind, 'title');
  assert.equal(s.calls.length, 0, 'no card on this phone: no network call');
  const form = none.find((/** @type {any} */ b) => b.kind === 'form');
  const wrong = await form.run({ code: 'AAAAAAAAAA' });
  assert.equal(wrong[0].tone, 'error');
  const opened = await form.run({ code: 'ACDEFHJKMN' });
  assert.equal(s.store.get('card'), 'n'.repeat(32));
  assert.equal(opened[3].value, 'K7PX3A');

  const blocks = await page.view({ lang: 'fr' });
  assert.deepEqual(s.calls.at(-1), { route: 'card', body: { token: 'n'.repeat(32) } });
  assert.deepEqual(blocks[1], { kind: 'stamps', filled: 3, total: 10, label: '3 tampons sur 10' });
  assert.deepEqual(blocks[3], { kind: 'code', label: 'Numéro de carte', value: 'K7PX3A' });
  assert.equal(blocks.at(-1).kind, 'button');

  lost = true;
  const gone = await page.view({ lang: 'fr' });
  assert.equal(gone[0].text, texts.fr.lost);
  assert.equal(s.store.get('card'), undefined);
});

test('a full card says the reward is ready', () => {
  const blocks = cardBlocks(
    { number: 'K7PX3A', stamps: 12, stampsNeeded: 10, rewards: 1, toNext: 8, reward: { fr: 'x' } },
    { t: t('fr'), reward: 'Un café offert' },
  );
  assert.deepEqual(blocks[1], {
    kind: 'stamps',
    filled: 10,
    total: 10,
    label: '10 tampons sur 10',
  });
  assert.equal(/** @type {any} */ (blocks[2]).tone, 'success');
});

test('the staff search tells a phone number from a card number', () => {
  assert.equal(looksLikePhone('22 333 444'), true);
  assert.equal(looksLikePhone('+216 22-333-444'), true);
  assert.equal(looksLikePhone('K7P X3A'), false);
  assert.equal(looksLikePhone('347967'), false);
});
