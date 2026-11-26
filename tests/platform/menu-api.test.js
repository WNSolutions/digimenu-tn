// @ts-check
/**
 * Menu editor and restore (issue #20 part 2, US-27, C-08): a Manager runs the whole menu from
 * a phone, Staff only mark sold out, every change says who, and any recent revision comes back.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import { cleanText } from '../../platform/shell/src/menu-api.js';
import { KEEP_SOURCES } from '../../platform/shell/src/menu-publish.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
/** One-time codes for the first sign-in (test values). @type {Record<string, string>} */
const CODES = { amel: 'CCCCCCCC34', sami: 'DDDDDDDD34' };

async function setup() {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
  DB.exec(
    accountSql({ username: 'amel', name: 'Amel', role: 'manager', cafe: 'demo', code: CODES.amel }),
  );
  DB.exec(
    accountSql({ username: 'sami', name: 'Sami', role: 'staff', cafe: 'demo', code: CODES.sami }),
  );
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
  /** The customer's menu now. */
  const menu = async () => (await call('/api/boot?cafe=demo')).data.menu;
  return { DB, call, person, menu };
}

test('texts keep the café’s languages, need French and stay short', () => {
  assert.deepEqual(cleanText({ fr: ' Thé ', ar: 'شاي', en: 'Tea', de: 'Tee' }, ['fr', 'ar'], 120), {
    fr: 'Thé',
    ar: 'شاي',
  });
  assert.throws(() => cleanText({ ar: 'شاي' }, ['fr', 'ar'], 120), /bad_text/);
  assert.throws(() => cleanText({ fr: 'x'.repeat(121) }, ['fr'], 120), /bad_text/);
  assert.equal(cleanText('', ['fr'], 120, true), null);
});

test('a Manager builds a category, items and variants from the phone; customers see them', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const edit = (/** @type {any} */ op) => amel('/admin/api/menu/edit', { cafe: 'demo', ...op });

  const cat = await edit({ op: 'category.add', title: { fr: 'Crêpes', ar: 'كريب', en: 'Crêpes' } });
  assert.equal(cat.status, 200);
  const menu = (await amel('/admin/api/menu?cafe=demo')).data.menu;
  const group = menu.categories.find((/** @type {any} */ c) => c.id === cat.data.id).groups[0];
  const item = await edit({
    op: 'item.add',
    groupId: group.id,
    name: { fr: 'Crêpe chocolat', ar: 'كريب شوكولاتة' },
    description: { fr: 'Nutella maison' },
    price: 6500,
    variant: { fr: 'Simple' },
  });
  assert.equal(item.status, 200);
  const big = await edit({
    op: 'variant.add',
    itemId: item.data.id,
    name: { fr: 'Double' },
    price: 9000,
  });
  assert.equal(big.status, 200);

  const seen = (await s.menu()).categories.find((/** @type {any} */ c) => c.id === cat.data.id);
  assert.equal(seen.title.fr, 'Crêpes');
  const crepe = seen.groups[0].items[0];
  assert.deepEqual(crepe.name, { fr: 'Crêpe chocolat', ar: 'كريب شوكولاتة' });
  assert.deepEqual(
    crepe.variants.map((/** @type {any} */ v) => [v.name.fr, v.price]),
    [
      ['Simple', 6500],
      ['Double', 9000],
    ],
  );

  // Edit, move, refuse what would break the menu.
  assert.equal((await edit({ op: 'variant.update', id: big.data.id, price: 9500 })).status, 200);
  assert.equal((await edit({ op: 'variant.move', id: big.data.id, dir: -1 })).status, 200);
  const moved = (await s.menu()).categories.find((/** @type {any} */ c) => c.id === cat.data.id);
  assert.deepEqual(
    moved.groups[0].items[0].variants.map((/** @type {any} */ v) => [v.name.fr, v.price]),
    [
      ['Double', 9500],
      ['Simple', 6500],
    ],
  );
  const lastVariant = await edit({ op: 'variant.delete', id: big.data.id });
  assert.equal(lastVariant.status, 200);
  const simple = moved.groups[0].items[0].variants[1];
  assert.equal((await edit({ op: 'variant.delete', id: simple.id })).data.error, 'last_variant');
  assert.equal((await edit({ op: 'category.delete', id: cat.data.id })).data.error, 'not_empty');
  assert.equal((await edit({ op: 'group.delete', id: group.id })).data.error, 'not_empty');
  assert.equal(
    (await edit({ op: 'item.add', groupId: group.id, name: { fr: 'X' }, price: -1 })).data.error,
    'bad_price',
  );
  assert.equal(
    (await edit({ op: 'item.add', groupId: group.id, name: { ar: 'بدون' }, price: 1000 })).data
      .error,
    'bad_text',
  );
  assert.equal((await edit({ op: 'item.update', id: 'i-nope', name: { fr: 'X' } })).status, 404);
  assert.equal((await edit({ op: 'drop.tables' })).status, 400);

  // Hide a category: gone for customers, kept for staff.
  assert.equal(
    (await edit({ op: 'category.update', id: cat.data.id, visible: false })).status,
    200,
  );
  assert.ok(!(await s.menu()).categories.some((/** @type {any} */ c) => c.id === cat.data.id));
  const staffView = (await amel('/admin/api/menu?cafe=demo')).data.menu;
  assert.ok(
    staffView.categories.some(
      (/** @type {any} */ c) => c.id === cat.data.id && c.visible === false,
    ),
  );

  // Delete the item, then the empty category.
  assert.equal((await edit({ op: 'item.delete', id: item.data.id })).status, 200);
  assert.equal((await edit({ op: 'category.delete', id: cat.data.id })).status, 200);
  const after = (await amel('/admin/api/menu?cafe=demo')).data.menu;
  assert.ok(!after.categories.some((/** @type {any} */ c) => c.id === cat.data.id));
});

test('every change says what, when, who and in which role; Staff cannot edit', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const sami = await s.person('sami');
  const first = (await amel('/admin/api/menu?cafe=demo')).data.menu.categories[0];
  assert.equal(
    (
      await sami('/admin/api/menu/edit', {
        cafe: 'demo',
        op: 'category.update',
        id: first.id,
        title: { fr: 'Non' },
      })
    ).status,
    403,
  );
  assert.equal((await sami('/admin/api/menu/versions?cafe=demo')).status, 403);

  await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'category.update',
    id: first.id,
    title: { fr: 'Cafés du matin' },
  });
  const v = (await amel('/admin/api/menu/versions?cafe=demo')).data;
  assert.equal(v.versions.length, 1);
  assert.equal(v.versions[0].by, 'Amel');
  assert.equal(v.versions[0].role, 'manager');
  assert.deepEqual(v.versions[0].changes, [
    { entity: 'category', field: 'title', before: first.title, after: { fr: 'Cafés du matin' } },
  ]);
  assert.equal(v.previous, v.rev - 1, 'the menu before the first edit is kept for undo');
});

test('restoring a revision brings the menu back as it was, sold-out and hidden entries included', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const before = await s.menu();
  const startRev = (await amel('/admin/api/menu/versions?cafe=demo')).data.rev;
  const staff = (await amel('/admin/api/menu?cafe=demo')).data.menu;
  const cat = staff.categories[0];
  const item = cat.groups[0].items[0];

  await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'item.update',
    id: item.id,
    name: { fr: 'Erreur de frappe' },
  });
  await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'variant.update',
    id: item.variants[0].id,
    price: 1,
  });
  await amel('/admin/api/menu/edit', {
    cafe: 'demo',
    op: 'category.update',
    id: cat.id,
    visible: false,
  });
  assert.notDeepEqual((await s.menu()).categories, before.categories);

  const back = await amel('/admin/api/menu/restore', { cafe: 'demo', rev: startRev });
  assert.equal(back.status, 200);
  assert.deepEqual((await s.menu()).categories, before.categories, 'exactly as before');
  const v = (await amel('/admin/api/menu/versions?cafe=demo')).data;
  assert.equal(v.versions[0].source, 'undo');
  assert.deepEqual(v.versions[0].changes[0].after, startRev);

  // And the restore itself can be undone.
  const undo = await amel('/admin/api/menu/restore', { cafe: 'demo', rev: v.rev - 1 });
  assert.equal(undo.status, 200);
  assert.ok(
    !(await s.menu()).categories.some((/** @type {any} */ c) => c.id === cat.id),
    'hidden again',
  );
  assert.equal((await amel('/admin/api/menu/restore', { cafe: 'demo', rev: 999 })).status, 400);
});

test('only the last 50 trees are kept per café', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const v = (await amel('/admin/api/menu?cafe=demo')).data.menu.categories[0].groups[0].items[0]
    .variants[0];
  for (let i = 0; i < KEEP_SOURCES + 3; i++)
    await amel('/admin/api/menu/edit', {
      cafe: 'demo',
      op: 'variant.update',
      id: v.id,
      price: 1000 + i,
    });
  const n = await s.DB.prepare(
    "SELECT COUNT(*) AS n, MIN(rev) AS lo FROM menu_sources WHERE cafe_id = 'cafe-demo'",
  ).first();
  assert.equal(n?.n, KEEP_SOURCES);
});
