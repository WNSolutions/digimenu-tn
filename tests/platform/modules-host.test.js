// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGETS, render } from '../../tools/modules/registry.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  runAfterStore,
  runStatusChanged,
  serverModules,
  handleStaffModuleRoute,
} from '../../platform/shell/src/module-host.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('the generated module lists match the modules folder', () => {
  for (const target of TARGETS) {
    assert.equal(
      readFileSync(path.join(root, target.out), 'utf8'),
      render(target),
      `${target.out} is out of date: run node tools/modules/registry.js`,
    );
  }
  execFileSync(process.execPath, [path.join(root, 'tools/modules/registry.js'), '--check']);
});

const cafe = (/** @type {any} */ modules) => ({
  id: 'cafe-x',
  slug: 'x',
  status: 'live',
  config: { modules },
});
const event = {
  order: {
    id: 'o',
    number: 'A1',
    status: 'received',
    type: 'dine_in',
    total: 1,
    customerId: null,
    isNew: true,
  },
  consents: {},
  inputs: { good: { a: 1 } },
};

test('server hooks run only for switched-on modules, and a failing one never stops the order', async () => {
  const env = /** @type {any} */ ({ DB: createD1().migrate() });
  /** @type {string[]} */
  const seen = [];
  const registry = {
    good: {
      afterStore: async (/** @type {any} */ api, /** @type {any} */ e) => {
        seen.push(`good:${api.key}:${JSON.stringify(e.input)}:${api.settings.n}`);
        return { ok: true };
      },
      statusChanged: async () => {
        seen.push('good:status');
      },
    },
    broken: {
      afterStore: async () => {
        throw new Error('boom');
      },
      statusChanged: async () => {
        throw new Error('boom');
      },
    },
    off: { afterStore: async () => ({ never: true }) },
  };
  const c = cafe({
    good: { enabled: true, settings: { n: 2 } },
    broken: { enabled: true },
    off: { enabled: false },
  });
  assert.deepEqual(
    serverModules(c.config, registry).map(([k]) => k),
    ['good', 'broken'],
  );
  const errors = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await runAfterStore(env, c, event, new Date(), registry), {
      good: { ok: true },
    });
    await runStatusChanged(
      env,
      c,
      {
        order: { id: 'o', total: 1, customerId: null },
        from: 'received',
        to: 'accepted',
        actor: { userId: 'u', role: 'staff' },
      },
      new Date(),
      registry,
    );
  } finally {
    console.error = errors;
  }
  assert.deepEqual(seen, ['good:good:{"a":1}:2', 'good:status']);
});

test('a staff route needs its module on, a known route and an allowed role', async () => {
  const env = /** @type {any} */ ({ DB: createD1().migrate() });
  const registry = {
    m: {
      staff: {
        roles: { look: ['staff', 'manager'] },
        routes: {
          look: async () => ({ status: 200, body: { ok: true } }),
          secret: async () => ({ status: 200, body: { secret: true } }),
        },
      },
    },
  };
  const on = cafe({ m: { enabled: true } });
  const staff = { userId: 'u', role: 'staff' };
  const go = (/** @type {any} */ c, /** @type {string} */ p, actor = staff) =>
    handleStaffModuleRoute(env, c, p, {}, actor, new Date(), registry).then((r) => r.status);
  assert.equal(await go(on, 'm/look'), 200);
  assert.equal(await go(on, 'm/secret'), 403, 'a route without roles is for managers only');
  assert.equal(await go(on, 'm/secret', { userId: 'u', role: 'manager' }), 200);
  assert.equal(await go(on, 'm/nope'), 404);
  assert.equal(await go(on, 'm/look/extra'), 404);
  assert.equal(await go(on, 'm/__proto__'), 404);
  assert.equal(await go(cafe({ m: { enabled: false } }), 'm/look'), 404);
});
