// @ts-check
/**
 * Module switches and the kill switch (issue #21, US-29, MOD-05, MOD-06, MOD-16): who may
 * switch, Admin's approval at a live café, dependencies, a version per change, other cafés
 * unchanged.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import { checkSwitch, applySwitch } from '../../platform/shell/src/modules-api.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
/** One-time codes for the first sign-in (test values). @type {Record<string, string>} */
const CODES = {
  ahmed: 'AAAAAAAA34',
  amel: 'CCCCCCCC34',
  sami: 'DDDDDDDD34',
  mona: 'EEEEEEEE34',
  rami: 'FFFFFFFF34',
};

/** The release has the three modules' customer code. */
const MANIFEST = {
  version: '0.1.0',
  platformApi: 1,
  entry: '/r/0.1.0/app.js',
  css: '/r/0.1.0/app.css',
  modules: Object.fromEntries(
    ['google_review', 'loyalty', 'whatsapp_handoff'].map((k) => [
      k,
      { entry: `/r/0.1.0/m/${k}.js`, texts: {} },
    ]),
  ),
};

async function setup() {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
  // A second café, being set up, to check that one café's switches never reach another.
  const other = mkdtempSync(path.join(tmpdir(), 'dm-cafe-'));
  const info = JSON.parse(readFileSync(path.join(root, 'cafes/demo/info.json'), 'utf8'));
  writeFileSync(path.join(other, 'info.json'), JSON.stringify({ ...info, slug: 'other' }));
  writeFileSync(
    path.join(other, 'menu.csv'),
    'category_fr;item_fr;price;available\nAutre carte;Citronnade;3,000;oui\n',
  );
  writeFileSync(path.join(other, 'tables.csv'), 'label;code\n');
  DB.exec(seedSql({ dir: other, release: '0.1.0', status: 'onboarding' }));
  for (const [username, name, role, cafe] of /** @type {[string, string, string, string?][]} */ ([
    ['ahmed', 'Ahmed', 'admin'],
    ['amel', 'Amel', 'manager', 'demo'],
    ['sami', 'Sami', 'staff', 'demo'],
    ['mona', 'Mona', 'maintainer', 'demo'],
    ['rami', 'Rami', 'maintainer', 'other'],
  ]))
    DB.exec(accountSql({ username, name, role, cafe, code: CODES[username] }));
  const env = /** @type {any} */ ({
    DB,
    ASSETS: {
      fetch: async (/** @type {Request} */ r) =>
        new URL(r.url).pathname === '/r/0.1.0/manifest.json'
          ? Response.json(MANIFEST)
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
    return { status: res.status, data: /** @type {any} */ (await res.json()), res };
  };
  /** Signs a person in once (first sign-in with their one-time code). @param {string} user */
  async function person(user) {
    // The server keeps a keyed hash of what the browser derived; any 32 bytes stand in for it.
    const done = await call('/admin/api/auth/setup', {
      username: user,
      code: CODES[user],
      salt: rnd().slice(0, 24),
      iterations: 310_000,
      key: rnd(),
    });
    assert.equal(done.status, 200, `${user} signs in`);
    const cookie = String(done.res.headers.get('set-cookie')).split(';')[0];
    return (/** @type {string} */ p, /** @type {any} */ body = undefined) => call(p, body, cookie);
  }
  /** The modules the customer page loads, from the boot call. @param {string} cafe */
  const booted = async (cafe) =>
    (await call(`/api/boot?cafe=${cafe}`)).data.modules.map((/** @type {any} */ m) => m.key);
  return { DB, call, person, booted };
}

test('a Maintainer switches a module off at once; Admin is told; data and other cafés stay', async () => {
  const s = await setup();
  const mona = await s.person('mona');
  const otherBefore = await s.call('/api/boot?cafe=other');
  assert.ok((await s.booted('demo')).includes('loyalty'));

  const view = await mona('/admin/api/modules?cafe=demo');
  assert.equal(view.status, 200);
  assert.deepEqual(view.data.can, { off: true, on: 'request', decide: false });
  const loyalty = view.data.modules.find((/** @type {any} */ m) => m.key === 'loyalty');
  assert.equal(loyalty.enabled, true);
  assert.equal(loyalty.inRelease, true);

  const off = await mona('/admin/api/modules/switch', { cafe: 'demo', key: 'loyalty', on: false });
  assert.equal(off.status, 200);
  assert.ok(!(await s.booted('demo')).includes('loyalty'), 'gone from the menu at once');

  // A new configuration version: who, when, what changed.
  const v = await s.DB.prepare(
    `SELECT v.version_no, v.status, v.change, u.username FROM config_versions v
       JOIN users u ON u.id = v.created_by WHERE v.cafe_id = 'cafe-demo' AND v.version_no = ?1`,
  )
    .bind(off.data.version)
    .first();
  assert.equal(v?.status, 'active');
  assert.equal(v?.username, 'mona');
  assert.deepEqual(JSON.parse(String(v?.change)), { key: 'loyalty', on: false });
  const versions = await s.DB.prepare(
    "SELECT COUNT(*) AS n FROM config_versions WHERE cafe_id = 'cafe-demo' AND status = 'active'",
  ).first();
  assert.equal(versions?.n, 1, 'one active version');

  // The other café is exactly as it was.
  assert.deepEqual((await s.call('/api/boot?cafe=other')).data, otherBefore.data);

  // Admin sees it on start.
  const ahmed = await s.person('ahmed');
  const notices = await ahmed('/admin/api/modules/notices');
  assert.equal(notices.status, 200);
  assert.equal(notices.data.changes.length, 1);
  assert.equal(notices.data.changes[0].by, 'Mona');
  assert.equal(notices.data.changes[0].on, false);
  assert.equal(notices.data.changes[0].title.fr, 'Carte de fidélité');
  assert.equal((await mona('/admin/api/modules/notices')).status, 403);

  const log = await s.DB.prepare(
    "SELECT action, target, actor_role FROM audit_log WHERE category = 'modules'",
  ).all();
  assert.deepEqual(
    log.results.map((r) => ({ ...r })),
    [{ action: 'off', target: 'demo/loyalty', actor_role: 'maintainer' }],
  );
});

test('at a live café a Maintainer’s "on" waits for Admin, who approves or refuses', async () => {
  const s = await setup();
  const mona = await s.person('mona');
  const ahmed = await s.person('ahmed');
  await ahmed('/admin/api/modules/switch', { cafe: 'demo', key: 'loyalty', on: false });

  const asked = await mona('/admin/api/modules/switch', { cafe: 'demo', key: 'loyalty', on: true });
  assert.equal(asked.status, 202);
  assert.equal(asked.data.pending, true);
  assert.ok(!(await s.booted('demo')).includes('loyalty'), 'not live before Admin approves');
  const again = await mona('/admin/api/modules/switch', { cafe: 'demo', key: 'loyalty', on: true });
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'already_requested');
  assert.equal(
    (
      await mona('/admin/api/modules/decide', {
        cafe: 'demo',
        version: asked.data.version,
        approve: true,
      })
    ).status,
    403,
    'a Maintainer cannot approve their own request',
  );

  const pending = (await ahmed('/admin/api/modules/notices')).data.changes.filter(
    (/** @type {any} */ c) => c.pending,
  );
  assert.equal(pending.length, 1);
  const view = await ahmed('/admin/api/modules?cafe=demo');
  const card = view.data.modules.find((/** @type {any} */ m) => m.key === 'loyalty');
  assert.equal(card.request.by, 'Mona');

  const ok = await ahmed('/admin/api/modules/decide', {
    cafe: 'demo',
    version: asked.data.version,
    approve: true,
  });
  assert.equal(ok.status, 200);
  assert.ok((await s.booted('demo')).includes('loyalty'));
  const history = (await ahmed('/admin/api/modules?cafe=demo')).data.history;
  assert.deepEqual(
    history.slice(0, 3).map((/** @type {any} */ h) => [h.key, h.on, h.status, h.decision]),
    [
      ['loyalty', true, 'active', null],
      ['loyalty', true, 'superseded', 'approved'],
      ['loyalty', false, 'superseded', null],
    ],
  );
  assert.equal(history[1].decider, 'Ahmed');

  // Refused: nothing changes for customers.
  await ahmed('/admin/api/modules/switch', { cafe: 'demo', key: 'google_review', on: false });
  const second = await mona('/admin/api/modules/switch', {
    cafe: 'demo',
    key: 'google_review',
    on: true,
  });
  const no = await ahmed('/admin/api/modules/decide', {
    cafe: 'demo',
    version: second.data.version,
    approve: false,
  });
  assert.equal(no.status, 200);
  assert.ok(!(await s.booted('demo')).includes('google_review'));
  assert.equal(
    (
      await ahmed('/admin/api/modules/decide', {
        cafe: 'demo',
        version: second.data.version,
        approve: true,
      })
    ).status,
    404,
    'a decided request cannot be decided again',
  );
});

test('who may switch: Managers ask Admin, Staff see nothing, a café being set up is direct', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const sami = await s.person('sami');
  const rami = await s.person('rami');

  const seen = await amel('/admin/api/modules?cafe=demo');
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.data.can, { off: false, on: 'no', decide: false });
  const tried = await amel('/admin/api/modules/switch', {
    cafe: 'demo',
    key: 'loyalty',
    on: false,
  });
  assert.equal(tried.status, 403);
  assert.equal(tried.data.error, 'ask_admin');
  assert.equal((await sami('/admin/api/modules?cafe=demo')).status, 403);
  assert.equal(
    (await rami('/admin/api/modules/switch', { cafe: 'demo', key: 'loyalty', on: false })).status,
    403,
    'a Maintainer of another café',
  );

  // At a café being set up, the Maintainer switches on directly.
  await rami('/admin/api/modules/switch', { cafe: 'other', key: 'loyalty', on: false });
  const on = await rami('/admin/api/modules/switch', { cafe: 'other', key: 'loyalty', on: true });
  assert.equal(on.status, 200);
  assert.ok((await s.booted('other')).includes('loyalty'));

  // Bad input and unknown modules.
  assert.equal(
    (await rami('/admin/api/modules/switch', { cafe: 'other', key: 'loyalty' })).status,
    400,
  );
  const unknown = await rami('/admin/api/modules/switch', {
    cafe: 'other',
    key: 'photos',
    on: true,
  });
  assert.equal(unknown.status, 409);
  assert.equal(unknown.data.error, 'unknown_module');
});

test('switching on checks the release, dependencies and conflicts; off takes dependents along', () => {
  const entry = (
    /** @type {Partial<import('../../platform/shell/src/modules-api.js').CatalogEntry>} */ m,
  ) =>
    /** @type {import('../../platform/shell/src/modules-api.js').CatalogEntry} */ ({
      id: 'M-99',
      title: { fr: 'x' },
      summary: null,
      version: '0.1.0',
      stability: 'experimental',
      requires: [],
      requiresAnyOf: [],
      conflicts: [],
      needs: [],
      paid: false,
      client: true,
      customerRecords: 'none',
      settings: {},
      ...m,
    });
  const catalog = {
    order_types: entry({}),
    preorder: entry({ requires: ['order_types'] }),
    feedback: entry({ requiresAnyOf: ['send_order', 'whatsapp_handoff'] }),
    send_order: entry({}),
    whatsapp_handoff: entry({}),
    old_review: entry({ conflicts: ['google_review'] }),
    google_review: entry({}),
  };
  const config = { modules: { google_review: { enabled: true }, preorder: { enabled: false } } };
  const o = { catalog, inRelease: () => true };
  assert.deepEqual(checkSwitch(config, 'preorder', true, o), {
    error: 'missing_dependency',
    detail: { missing: ['order_types'] },
  });
  assert.deepEqual(checkSwitch(config, 'feedback', true, o), {
    error: 'missing_dependency',
    detail: { anyOf: ['send_order', 'whatsapp_handoff'] },
  });
  assert.deepEqual(checkSwitch(config, 'old_review', true, o), {
    error: 'conflict',
    detail: { with: ['google_review'] },
  });
  assert.deepEqual(checkSwitch(config, 'order_types', true, { catalog, inRelease: () => false }), {
    error: 'not_in_release',
  });
  assert.deepEqual(checkSwitch(config, 'nothing', true, o), { error: 'unknown_module' });

  const on = {
    modules: { order_types: { enabled: true }, preorder: { enabled: true, settings: { h: 2 } } },
  };
  const off = checkSwitch(on, 'order_types', false, o);
  assert.deepEqual(off, { also: ['preorder'] });
  const next = applySwitch(on, { key: 'order_types', on: false, also: ['preorder'] });
  assert.deepEqual(next.modules, {
    order_types: { enabled: false },
    preorder: { enabled: false, settings: { h: 2 } },
  });
  assert.equal(on.modules.preorder.enabled, true, 'the old configuration is not changed');
});
