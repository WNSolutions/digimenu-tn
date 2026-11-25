// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry } from './extensions.js';

/** @returns {import('./extensions.js').ListActionContext} */
const context = () =>
  /** @type {any} */ ({
    checked: { count: 1, total: 1500, flagged: 0, lines: [] },
    note: '',
    cafe: { slug: 'demo', name: { fr: 'Café' }, languages: { enabled: ['fr'], default: 'fr' } },
    table: null,
    lang: 'fr',
    now: new Date(0),
  });

test('a module adds a list action with its own texts and settings', () => {
  const registry = createRegistry();
  registry.add(
    { key: 'demo_channel', settings: { n: 1 }, texts: { fr: { go: 'Envoyer {n}' } } },
    (api) => {
      api.contribute('list.action', () => ({
        kind: 'link',
        href: 'https://example.org/x',
        label: api.texts('ar')('go', { n: /** @type {number} */ (api.settings.n) }),
      }));
    },
  );
  assert.deepEqual(registry.listActions(context()), [
    { kind: 'link', href: 'https://example.org/x', label: 'Envoyer 1', key: 'demo_channel' },
  ]);
});

test('a module that throws, or returns an unsafe link, adds nothing and the page carries on', () => {
  /** @type {string[]} */
  const errors = [];
  const registry = createRegistry((message) => errors.push(message));
  registry.add({ key: 'broken' }, () => {
    throw new Error('boom');
  });
  registry.add({ key: 'unknown_point' }, (api) => {
    api.contribute(/** @type {any} */ ('menu.filter'), () => null);
  });
  registry.add({ key: 'js_link' }, (api) =>
    api.contribute('list.action', () => ({
      kind: 'link',
      href: 'javascript:alert(1)',
      label: 'x',
    })),
  );
  registry.add({ key: 'throws_later' }, (api) =>
    api.contribute('list.action', () => {
      throw new Error('later');
    }),
  );
  registry.add({ key: 'nothing_now' }, (api) => api.contribute('list.action', () => null));
  assert.deepEqual(registry.listActions(context()), []);
  assert.deepEqual(errors, [
    'module broken failed to register',
    'module unknown_point failed to register',
    'module throws_later: list.action failed',
  ]);
});

test('settings given to a module cannot be changed by it', () => {
  const registry = createRegistry(() => {});
  let changed = true;
  registry.add({ key: 'sneaky', settings: { a: 1 } }, (api) => {
    try {
      /** @type {any} */ (api.settings).a = 2;
    } catch {
      changed = false;
    }
  });
  assert.equal(changed, false);
});

test('a header action must open one of its own pages; a page can have its own link', () => {
  const registry = createRegistry(() => {});
  const view = async () => /** @type {import('./extensions.js').Block[]} */ ([]);
  registry.add({ key: 'a' }, (api) => {
    api.contribute('sheet.page', { id: 'card', path: 'carte', title: () => 'Carte', view });
    api.contribute('header.action', () => ({ label: 'A', icon: 'gift', page: 'card' }));
    api.contribute('header.action', () => ({ label: 'Not mine', page: 'other' }));
  });
  registry.add({ key: 'b' }, (api) => {
    api.contribute('header.action', () => ({ label: 'B', icon: 'not-in-sprite', page: 'card' }));
  });
  assert.deepEqual(registry.headerActions({ lang: 'fr' }, ['gift']), [
    { label: 'A', page: 'a:card', icon: 'gift', key: 'a' },
  ]);
  assert.equal(registry.page('carte')?.key, 'a');
  assert.equal(registry.page('a:card')?.id, 'card');
  assert.equal(registry.page('nothing'), null);
});

test('a page path is lowercase letters only; a bad page leaves the module out', () => {
  /** @type {string[]} */
  const errors = [];
  const registry = createRegistry((m) => errors.push(m));
  registry.add({ key: 'bad' }, (api) => {
    api.contribute('header.action', () => ({ label: 'X', page: 'p' }));
    api.contribute('sheet.page', {
      id: 'p',
      path: '../admin',
      title: () => '',
      view: async () => [],
    });
  });
  assert.deepEqual(errors, ['module bad failed to register']);
  assert.deepEqual(registry.headerActions({ lang: 'fr' }, []), [], 'nothing half-registered');
});

test('checkout fields: consents only for purposes the notice has a text for', () => {
  const registry = createRegistry(() => {});
  registry.add({ key: 'm' }, (api) => {
    api.contribute('checkout.fields', () => ({
      fields: [
        { kind: 'consent', purpose: 'loyalty' },
        { kind: 'info', text: 'Une ligne' },
        { kind: 'info', text: '  ' },
        /** @type {any} */ ({ kind: 'html', text: '<b>x</b>' }),
      ],
      input: { a: 1 },
    }));
  });
  const ctx = /** @type {const} */ ({ type: 'takeaway', lang: 'fr', table: null });
  assert.deepEqual(registry.checkoutFields(ctx, ['loyalty']), [
    {
      key: 'm',
      fields: [
        { kind: 'consent', purpose: 'loyalty' },
        { kind: 'info', text: 'Une ligne' },
      ],
      input: { a: 1 },
    },
  ]);
  assert.deepEqual(registry.checkoutFields(ctx, [])[0].fields, [
    { kind: 'info', text: 'Une ligne' },
  ]);
});

test("post-order blocks get the module's own server answer; storage and calls are scoped", async () => {
  /** @type {Map<string, string>} */
  const map = new Map();
  const storage = /** @type {any} */ ({
    getItem: (/** @type {string} */ k) => map.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => map.set(k, v),
    removeItem: (/** @type {string} */ k) => map.delete(k),
  });
  /** @type {any[]} */
  const sent = [];
  const fetch = /** @type {any} */ (
    async (/** @type {string} */ url, /** @type {any} */ init) => {
      sent.push([url, init.credentials, JSON.parse(init.body)]);
      return new Response('{"ok":1}', { status: 200 });
    }
  );
  const registry = createRegistry(() => {}, { cafe: 'demo', storage, fetch });
  /** @type {import('./extensions.js').ModuleApi | null} */
  let saved = null;
  registry.add({ key: 'm' }, (api) => {
    saved = api;
    api.contribute('postOrder.block', ({ answer }) =>
      answer ? [{ kind: 'text', text: String(/** @type {any} */ (answer).n) }] : null,
    );
  });
  const order = /** @type {any} */ ({ id: 'o', modules: { m: { n: 7 }, other: { n: 1 } } });
  assert.deepEqual(registry.postOrderBlocks(order, 'fr'), [
    { key: 'm', blocks: [{ kind: 'text', text: '7' }] },
  ]);
  const api = /** @type {import('./extensions.js').ModuleApi} */ (/** @type {unknown} */ (saved));
  api.storage.set('x', 'y');
  assert.equal(map.get('dm:demo:m:x'), 'y');
  assert.equal(api.storage.get('x'), 'y');
  const res = await api.call('card', { token: 't', cafe: 'evil' });
  assert.deepEqual(res, { ok: true, status: 200, data: { ok: 1 } });
  assert.deepEqual(sent, [['/api/m/m/card', 'omit', { token: 't', cafe: 'demo' }]]);
  assert.deepEqual(await api.call('../x'), { ok: false, status: 0, data: {} });
});

test('"Ma commande" blocks and footer links: https only, a failing module is skipped', () => {
  /** @type {string[]} */
  const errors = [];
  const registry = createRegistry((message) => errors.push(message));
  assert.equal(registry.hasOrderStatusBlocks(), false);
  registry.add({ key: 'review' }, (api) => {
    api.contribute('orderStatus.block', (c) =>
      c.status === 'served' ? [{ kind: 'text', text: `Merci ${c.number}` }] : null,
    );
    api.contribute('footer.link', () => ({ label: 'Avis', href: 'https://g.page/r/x/review' }));
  });
  registry.add({ key: 'bad' }, (api) => {
    api.contribute('orderStatus.block', () => {
      throw new Error('boom');
    });
    api.contribute('footer.link', () => ({ label: 'x', href: 'javascript:alert(1)' }));
  });
  registry.add({ key: 'empty_label' }, (api) =>
    api.contribute('footer.link', () => ({ label: ' ', href: 'https://example.org' })),
  );
  assert.equal(registry.hasOrderStatusBlocks(), true);
  /** @param {string} status */
  const ctx = (status) => ({
    status,
    number: 'A12',
    orderKey: 'k'.repeat(20),
    cafe: { fr: 'Café' },
    lang: /** @type {const} */ ('fr'),
  });
  assert.deepEqual(registry.orderStatusBlocks(ctx('accepted')), []);
  assert.deepEqual(registry.orderStatusBlocks(ctx('served')), [
    { key: 'review', blocks: [{ kind: 'text', text: 'Merci A12' }] },
  ]);
  assert.deepEqual(registry.footerLinks({ lang: 'fr' }), [
    { label: 'Avis', href: 'https://g.page/r/x/review', key: 'review' },
  ]);
  assert.ok(errors.includes('module bad: orderStatus.block failed'));
});
