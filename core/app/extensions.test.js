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
    api.contribute(/** @type {any} */ ('header.action'), () => null);
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
