// @ts-check
/**
 * Modules' data per item (#29): the menu editor offers the fields of the café's switched-on
 * modules, the server checks them against the module's item schema, the customer's menu carries
 * them, and a version brings them back as they were.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import { itemExt } from '../../platform/shell/src/menu-api.js';
import { cleanExt } from '../../core/menu/snapshot.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
/** @type {Record<string, string>} */
const CODES = { amel: 'CCCCCCCC34', sami: 'DDDDDDDD34' };

async function setup() {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
  for (const [username, name, role] of [
    ['amel', 'Amel', 'manager'],
    ['sami', 'Sami', 'staff'],
  ])
    DB.exec(accountSql({ username, name, role, cafe: 'demo', code: CODES[username] }));
  const env = /** @type {any} */ ({
    DB,
    ASSETS: {
      fetch: async (/** @type {Request} */ r) =>
        new URL(r.url).pathname === '/r/0.1.0/manifest.json'
          ? Response.json({
              version: '0.1.0',
              platformApi: 1,
              entry: '/r/0.1.0/app.js',
              css: '/r/0.1.0/app.css',
              modules: {},
            })
          : new Response('', { status: 404 }),
    },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });
  /** @param {string} p @param {any} [body] @param {string} [cookie] */
  const call = async (p, body, cookie = '') => {
    /** @type {Record<string, string>} */
    const headers = body ? { 'content-type': 'application/json', origin: ORIGIN } : {};
    if (cookie) headers.cookie = cookie;
    const res = await worker.fetch(
      new Request(ORIGIN + p, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      { waitUntil() {} },
    );
    return { status: res.status, data: /** @type {any} */ (await res.json()) };
  };
  /** @param {string} user */
  async function person(user) {
    const done = await worker.fetch(
      new Request(`${ORIGIN}/admin/api/auth/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({
          username: user,
          code: CODES[user],
          salt: rnd().slice(0, 24),
          iterations: 310_000,
          key: rnd(),
        }),
      }),
      env,
      { waitUntil() {} },
    );
    assert.equal(done.status, 200);
    const cookie = String(done.headers.get('set-cookie')).split(';')[0];
    return (/** @type {string} */ p, /** @type {any} */ body = undefined) => call(p, body, cookie);
  }
  /** The customer's item, as the boot answer gives it. @param {string} id */
  const item = async (id) => {
    clearCaches();
    const menu = (await call('/api/boot?cafe=demo')).data.menu;
    for (const c of menu.categories)
      for (const g of c.groups) for (const it of g.items) if (it.id === id) return it;
    return null;
  };
  return { DB, call, person, item };
}

test('only data that matches a module’s item schema is kept; empty lists and null remove it', () => {
  assert.deepEqual(itemExt({}, { dietary_tags: { tags: ['vegan', 'milk'] } }), {
    dietary_tags: { tags: ['vegan', 'milk'] },
  });
  const had = { dietary_tags: { tags: ['vegan'] }, other: { x: 1 } };
  assert.deepEqual(itemExt(had, { dietary_tags: { tags: [] } }), { other: { x: 1 } });
  assert.deepEqual(itemExt(had, { dietary_tags: null }), { other: { x: 1 } });
  /** @param {any} edit */
  const refusal = (edit) => {
    try {
      itemExt({}, edit);
      return null;
    } catch (err) {
      return /** @type {any} */ (err).message;
    }
  };
  assert.equal(refusal({ dietary_tags: { tags: ['halal'] } }), 'bad_item_data');
  assert.equal(refusal({ dietary_tags: { tags: ['vegan', 'vegan'] } }), 'bad_item_data');
  assert.equal(refusal({ dietary_tags: { tags: 'vegan' } }), 'bad_item_data');
  assert.equal(refusal({ dietary_tags: { tags: ['vegan'], note: 'x' } }), 'bad_item_data');
  assert.equal(refusal({ loyalty: { tags: ['vegan'] } }), 'unknown_module', 'no item fields');
  assert.equal(refusal({ nope: {} }), 'unknown_module');
  assert.equal(refusal(['x']), 'bad_request');
  // The customer's menu keeps module objects only.
  assert.deepEqual(cleanExt({ dietary_tags: { tags: ['vegan'] }, Bad: {}, x: 1, list: [] }), {
    dietary_tags: { tags: ['vegan'] },
  });
  assert.equal(cleanExt({}), undefined);
});

test('the Manager ticks tags in the menu editor; customers get them; a version brings them back', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const tree = await amel('/admin/api/menu?cafe=demo');
  assert.equal(tree.status, 200);
  assert.deepEqual(Object.keys(tree.data.itemFields), ['dietary_tags'], 'switched on at the demo');
  assert.equal(tree.data.itemFields.dietary_tags.title.fr, 'Allergènes et régimes');
  assert.ok(tree.data.itemFields.dietary_tags.fields.tags.items.enum.includes('sesame'));
  const first = tree.data.menu.categories[0].groups[0].items[0];
  assert.equal((await s.item(first.id)).ext, undefined);

  const saved = await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: first.id,
    ext: { dietary_tags: { tags: ['vegetarian', 'milk'] } },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await s.item(first.id)).ext, {
    dietary_tags: { tags: ['vegetarian', 'milk'] },
  });
  const after = (await amel('/admin/api/menu?cafe=demo')).data.menu.categories[0].groups[0]
    .items[0];
  assert.deepEqual(after.ext, { dietary_tags: { tags: ['vegetarian', 'milk'] } });

  const refused = await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: first.id,
    ext: { dietary_tags: { tags: ['halal'] } },
  });
  assert.deepEqual([refused.status, refused.data.error], [422, 'bad_item_data']);

  // Same tags again: nothing to publish.
  const same = await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: first.id,
    ext: { dietary_tags: { tags: ['vegetarian', 'milk'] } },
  });
  assert.equal(same.data.unchanged, true);

  const versions = (await amel('/admin/api/menu/versions?cafe=demo')).data;
  const change = versions.versions[0].changes[0];
  assert.deepEqual([change.entity, change.field], ['item', 'ext']);
  assert.deepEqual(change.after, { dietary_tags: { tags: ['vegetarian', 'milk'] } });

  // Remove them, then bring the earlier version back: the tags come back with it.
  await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: first.id,
    ext: { dietary_tags: null },
  });
  assert.equal((await s.item(first.id)).ext, undefined);
  const restored = await amel('/admin/api/menu/restore', { cafe: 'demo', rev: saved.data.rev });
  assert.equal(restored.status, 200);
  assert.deepEqual((await s.item(first.id)).ext, {
    dietary_tags: { tags: ['vegetarian', 'milk'] },
  });

  // Staff only mark items sold out.
  const sami = await s.person('sami');
  const staff = await sami('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: first.id,
    ext: { dietary_tags: { tags: ['vegan'] } },
  });
  assert.equal(staff.status, 403);
});

test('a module switched off offers no fields, and its data stays stored for later', async () => {
  const s = await setup();
  s.DB.exec(
    `UPDATE config_versions SET body = json_set(body, '$.modules.dietary_tags.enabled', json('false')) WHERE cafe_id = 'cafe-demo';`,
  );
  clearCaches();
  const amel = await s.person('amel');
  assert.deepEqual((await amel('/admin/api/menu?cafe=demo')).data.itemFields, {});
});
