// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import register, { reviewUrl } from '../client.js';

/** @typedef {import('../../../core/app/extensions.js').ModuleApi} Api */
/** @typedef {import('../../../core/app/extensions.js').OrderStatusContext} OrderContext */
/** @typedef {import('../../../core/i18n.js').Lang} Lang */

// The core side (registry, https-only links, failing modules) is tested in
// core/app/extensions.test.js; counting on the server in tests/platform/google-review.test.js.

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

const URL_OK = 'https://g.page/r/CdEmOfJoBi/review';

/**
 * The module registered with a fake api, as the core would give it.
 * @param {Record<string, unknown>} settings
 */
function setup(settings) {
  /** @type {Map<string, string>} */
  const store = new Map();
  /** @type {{ route: string, body: any }[]} */
  const calls = [];
  /** @type {Record<string, any[]>} */
  const got = {};
  register(
    /** @type {Api} */ ({
      key: 'google_review',
      settings,
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
        return { ok: true, status: 200, data: {} };
      },
      contribute: (point, /** @type {any} */ fn) => void (got[point] ??= []).push(fn),
    }),
  );
  /** @param {string} status @param {Lang} [lang] @returns {any[] | null} */
  const blocks = (status, lang = 'fr') =>
    got['orderStatus.block'][0](
      /** @type {OrderContext} */ ({
        status,
        number: 'A12',
        orderKey: 'order-key-0000000001',
        cafe: { fr: 'Café Démo Jasmin', ar: 'مقهى ياسمين' },
        lang,
      }),
    );
  return { got, store, calls, blocks };
}

test('only a Google review link turns the module on', () => {
  assert.equal(reviewUrl({}), null);
  assert.equal(reviewUrl({ reviewUrl: ' ' }), null);
  assert.equal(reviewUrl({ reviewUrl: 'http://g.page/r/x/review' }), null, 'https only');
  assert.equal(reviewUrl({ reviewUrl: 'https://example.org/rate-us' }), null, 'no page between');
  assert.equal(reviewUrl({ reviewUrl: 'https://g.page.evil.example/r/x' }), null);
  assert.equal(reviewUrl({ reviewUrl: `https://g.page/r/${'x'.repeat(300)}` }), null);
  assert.equal(reviewUrl({ reviewUrl: `${URL_OK} ` }), URL_OK);
  for (const ok of [
    'https://search.google.com/local/writereview?placeid=ChIJ123',
    'https://www.google.com/maps/place/Jobi',
    'https://maps.app.goo.gl/AbC123',
    'https://www.google.tn/maps/place/x',
  ])
    assert.equal(reviewUrl({ reviewUrl: ok }), ok);

  // The same rule as the settings schema.
  const schema = JSON.parse(
    readFileSync(new URL('../settings.schema.json', import.meta.url), 'utf8'),
  );
  const pattern = new RegExp(schema.properties.reviewUrl.pattern);
  assert.ok(pattern.test(URL_OK));
  assert.ok(!pattern.test('https://example.org/rate-us'));

  assert.deepEqual(setup({ reviewUrl: 'https://example.org/rate-us' }).got, {}, 'adds nothing');
  assert.deepEqual(setup({}).got, {});
});

test('the footer link is always there, in the customer language', () => {
  const { got } = setup({ reviewUrl: URL_OK });
  const [link] = got['footer.link'];
  assert.deepEqual(link({ lang: 'fr' }), { label: 'Laisser un avis Google', href: URL_OK });
  assert.equal(link({ lang: 'en' }).label, 'Review us on Google');
  assert.equal(link({ lang: 'ar' }).label, 'اترك تقييمًا على Google');
});

test('once served, everyone gets the same invitation; it is counted once per order', () => {
  const { blocks, calls } = setup({ reviewUrl: URL_OK });
  for (const status of ['received', 'handoff', 'accepted', 'ready', 'rejected', 'unconfirmed'])
    assert.equal(blocks(status), null, status);
  assert.equal(calls.length, 0, 'nothing counted before Served');

  const served = /** @type {any[]} */ (blocks('served'));
  assert.deepEqual(
    served.map((b) => b.kind),
    ['title', 'text', 'link'],
  );
  assert.equal(served[0].text, 'Vous avez aimé votre passage ?');
  assert.equal(
    served[1].text,
    'Donnez votre avis sur Café Démo Jasmin sur Google. Ça aide beaucoup le café.',
  );
  assert.equal(served[2].href, URL_OK);
  assert.equal(served[2].look, 'prominent');

  blocks('served', 'ar');
  assert.deepEqual(
    calls,
    [{ route: 'count', body: { event: 'shown', key: 'order-key-0000000001' } }],
    'opened twice, counted once',
  );
  served[2].tapped();
  assert.deepEqual(calls.at(-1), {
    route: 'count',
    body: { event: 'tap', key: 'order-key-0000000001' },
  });
});

test('the invitation depends on nothing but Served: no amount, rating or reward reaches it', () => {
  const plain = setup({ reviewUrl: URL_OK }).blocks('served');
  const other = setup({ reviewUrl: URL_OK });
  const rich = other.got['orderStatus.block'][0]({
    status: 'served',
    number: 'Z99',
    orderKey: 'order-key-0000000002',
    cafe: { fr: 'Café Démo Jasmin' },
    lang: 'fr',
    total: 99000,
    rating: 1,
    points: 10,
  });
  assert.equal(JSON.stringify(rich), JSON.stringify(plain));
});

test('texts have the same keys in French, Arabic and English', () => {
  const keys = (/** @type {string} */ l) => Object.keys(texts[l]).sort();
  assert.deepEqual(keys('ar'), keys('fr'));
  assert.deepEqual(keys('en'), keys('fr'));
  const staff = (/** @type {string} */ l) =>
    Object.keys(
      JSON.parse(readFileSync(new URL(`../i18n/staff.${l}.json`, import.meta.url), 'utf8')),
    ).sort();
  assert.deepEqual(staff('ar'), staff('fr'));
});
