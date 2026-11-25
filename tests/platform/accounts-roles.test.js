// @ts-check
/**
 * Accounts and roles (issue #18, ADR-0006, D-026), through the real Worker: every role against
 * every capability (including hand-crafted requests), new accounts and one-time codes, resets
 * and disabling, "Mes appareils", changing the own password, and the audit log.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { handleCreateOrder } from '../../platform/shell/src/orders-api.js';
import { handleAdmin } from '../../platform/shell/src/admin-api.js';
import { handleAuth } from '../../platform/shell/src/auth.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const ITER = 310_000;
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const OPEN = new Date('2026-11-18T10:30:00Z');

/** @param {string} password @param {string} salt @param {number} [iterations] */
const derive = (password, salt, iterations = ITER) =>
  pbkdf2Sync(password, Buffer.from(salt, 'base64'), iterations, 32, 'sha256').toString('base64');

async function setup() {
  clearCaches();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0' }));
  // A second café, to check that a role never reaches past its own café.
  const other = mkdtempSync(path.join(tmpdir(), 'dm-cafe-'));
  const info = JSON.parse(readFileSync(path.join(root, 'cafes/demo/info.json'), 'utf8'));
  writeFileSync(path.join(other, 'info.json'), JSON.stringify({ ...info, slug: 'other' }));
  writeFileSync(
    path.join(other, 'menu.csv'),
    'category_fr;item_fr;price;available\nAutre carte;Citronnade;3,000;oui\n',
  );
  writeFileSync(path.join(other, 'tables.csv'), 'label;code\n');
  DB.exec(seedSql({ dir: other, release: '0.1.0' }));
  for (const [username, role, cafe, code] of [
    ['ahmed', 'admin', undefined, 'AAAAAAAA34'],
    ['amel', 'manager', 'demo', 'BBBBBBBB34'],
    ['sami', 'staff', 'demo', 'CCCCCCCC34'],
    ['mona', 'maintainer', 'demo', 'DDDDDDDD34'],
    ['karim', 'manager', 'other', 'EEEEEEEE34'],
  ]) {
    DB.exec(
      accountSql({
        username: String(username),
        name: String(username),
        role: String(role),
        cafe,
        code: String(code),
      }),
    );
  }
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
  });

  /** A browser of its own (cookie, device). @param {string} [ua] */
  function browser(ua = IPHONE) {
    let cookie = '';
    /** @param {string} p @param {any} [body] @param {Record<string, string>} [extra] */
    const call = async (p, body, extra = {}) => {
      /** @type {Record<string, string>} */
      const headers = { 'user-agent': ua };
      if (body) {
        headers['content-type'] = 'application/json';
        headers.origin = ORIGIN;
      }
      if (cookie) headers.cookie = cookie;
      Object.assign(headers, extra);
      const res = await worker.fetch(
        new Request(ORIGIN + p, {
          method: body ? 'POST' : 'GET',
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }),
        env,
        { waitUntil() {} },
      );
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, data: /** @type {any} */ (await res.json()) };
    };
    return Object.assign(call, { cookie: () => cookie });
  }

  /** First password with a one-time code. @param {string} user @param {string} code */
  async function firstTime(user, code, password = 'correct horse battery', ua = IPHONE) {
    const b = browser(ua);
    const salt = rnd().slice(0, 24);
    const res = await b('/admin/api/auth/setup', {
      username: user,
      code,
      salt,
      iterations: ITER,
      key: derive(password, salt),
    });
    return { b, res };
  }

  /** Sign in with a password, as the staff app does. */
  async function signIn(
    /** @type {string} */ user,
    password = 'correct horse battery',
    ua = IPHONE,
  ) {
    const b = browser(ua);
    const s = await b('/admin/api/auth/salt', { username: user });
    const res = await b('/admin/api/auth/sign-in', {
      username: user,
      key: derive(password, s.data.salt, s.data.iterations),
    });
    return { b, res };
  }

  const people = /** @type {Record<string, ReturnType<typeof browser>>} */ ({});
  for (const [user, code] of [
    ['ahmed', 'AAAAAAAA34'],
    ['amel', 'BBBBBBBB34'],
    ['sami', 'CCCCCCCC34'],
    ['mona', 'DDDDDDDD34'],
    ['karim', 'EEEEEEEE34'],
  ]) {
    const { b, res } = await firstTime(user, code);
    assert.equal(res.status, 200, user);
    people[user] = b;
  }
  /** @param {string} username */
  const userId = async (username) =>
    String(
      (await DB.prepare('SELECT id FROM users WHERE username = ?1').bind(username).first())?.id,
    );
  return { DB, env, people, browser, firstTime, signIn, userId };
}

/** One order at the demo café; real (not a test order) unless asked. */
async function order(/** @type {any} */ env, n = 1, test = false) {
  const DB = env.DB;
  const v = await DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  const res = await handleCreateOrder(
    new Request('https://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        cafe: 'demo',
        clientKey: `roles-test-${String(n).padStart(6, '0')}`,
        type: 'takeaway',
        channel: 'whatsapp_handoff',
        lines: [{ variantId: v?.id, qty: 1 }],
        noticeVersion: 1,
        lang: 'fr',
        customer: { firstName: 'Rim', phone: '22 333 444' },
        consents: { orderUpdates: true },
      }),
    }),
    env,
    OPEN,
  );
  assert.equal(res.status, 201);
  const id = /** @type {any} */ (await res.json()).id;
  // Demo cafés make test orders; a real café's are real. Set it as the case needs.
  await DB.prepare('UPDATE orders SET is_test = ?1 WHERE id = ?2')
    .bind(test ? 1 : 0, id)
    .run();
  return id;
}

test('every role against every capability, as the roles table says (hand-crafted calls included)', async () => {
  const s = await setup();
  const real = await order(s.env, 1, false);
  const sami = await s.userId('sami');
  // Who may do what. "ok" means the server let the call through (any answer but 401/403/404
  // for a refused role); "no" means refused.
  /** @type {[string, (who: string) => Promise<number>, Record<string, 'ok' | 'no'>][]} */
  const matrix = [
    [
      'see the menu',
      async (who) => (await s.people[who]('/admin/api/menu?cafe=demo')).status,
      { ahmed: 'ok', amel: 'ok', sami: 'ok', mona: 'ok', karim: 'no' },
    ],
    [
      'see the orders screen',
      async (who) => (await s.people[who]('/admin/api/orders?cafe=demo')).status,
      { ahmed: 'ok', amel: 'ok', sami: 'ok', mona: 'ok', karim: 'no' },
    ],
    [
      'change a real order',
      async (who) =>
        (
          await s.people[who]('/admin/api/orders/status', {
            cafe: 'demo',
            id: real,
            status: 'nope',
          })
        ).status,
      { ahmed: 'ok', amel: 'ok', sami: 'ok', mona: 'no', karim: 'no' },
    ],
    [
      'see the team',
      async (who) => (await s.people[who]('/admin/api/team?cafe=demo')).status,
      { ahmed: 'ok', amel: 'ok', sami: 'no', mona: 'no', karim: 'no' },
    ],
    [
      'create a Staff account',
      async (who) =>
        (
          await s.people[who]('/admin/api/team/create', {
            cafe: 'demo',
            username: `new-${who}`,
            name: 'Nouveau',
            role: 'staff',
          })
        ).status,
      { ahmed: 'ok', amel: 'ok', sami: 'no', mona: 'no', karim: 'no' },
    ],
    [
      'create a Manager account',
      async (who) =>
        (
          await s.people[who]('/admin/api/team/create', {
            cafe: 'demo',
            username: `boss-${who}`,
            name: 'Chef',
            role: 'manager',
          })
        ).status,
      { ahmed: 'ok', amel: 'no', sami: 'no', mona: 'no', karim: 'no' },
    ],
    [
      'change a role',
      async (who) =>
        (
          await s.people[who]('/admin/api/team/role', {
            cafe: 'demo',
            userId: await s.userId('mona'),
            role: 'maintainer',
          })
        ).status,
      { ahmed: 'ok', amel: 'no', sami: 'no', mona: 'no', karim: 'no' },
    ],
    [
      'customer records',
      async (who) => (await s.people[who]('/admin/api/customers')).status,
      { ahmed: 'ok', amel: 'no', sami: 'no', mona: 'no', karim: 'no' },
    ],
    [
      'loyalty cards (customer phone numbers)',
      async (who) =>
        (await s.people[who]('/admin/api/m/loyalty/find', { cafe: 'demo', number: 'ZZZZZZ' }))
          .status,
      { ahmed: 'ok', amel: 'ok', sami: 'ok', mona: 'no', karim: 'no' },
    ],
    [
      'own devices',
      async (who) => (await s.people[who]('/admin/api/auth/sessions')).status,
      { ahmed: 'ok', amel: 'ok', sami: 'ok', mona: 'ok', karim: 'ok' },
    ],
    // Last: a reset signs the person out.
    [
      'give a new code to a Staff member',
      async (who) =>
        (await s.people[who]('/admin/api/team/reset', { cafe: 'demo', userId: sami })).status,
      { ahmed: 'ok', amel: 'ok', mona: 'no', karim: 'no' },
    ],
  ];
  for (const [what, call, expected] of matrix) {
    for (const [who, want] of Object.entries(expected)) {
      const status = await call(who);
      if (want === 'ok') {
        assert.ok(![401, 403].includes(status), `${who} may ${what} (got ${status})`);
      } else {
        assert.ok([403, 404].includes(status), `${who} may not ${what} (got ${status})`);
      }
    }
  }

  // Hand-crafted calls: no cookie, another site, no JSON, another café's slug.
  const anon = s.browser();
  assert.equal((await anon('/admin/api/team?cafe=demo')).status, 401);
  const cross = await s.people.amel(
    '/admin/api/team/create',
    { cafe: 'demo', username: 'evil', name: 'x' },
    { origin: 'https://evil.example' },
  );
  assert.equal(cross.status, 403);
  const plain = await s.people.amel(
    '/admin/api/team/create',
    { cafe: 'demo', username: 'evil2', name: 'x' },
    { 'content-type': 'text/plain' },
  );
  assert.equal(plain.status, 403);
  assert.equal(
    (
      await s.people.amel('/admin/api/team/create', {
        cafe: 'other',
        username: 'evil3',
        name: 'x',
        role: 'staff',
      })
    ).status,
    403,
    'a Manager of one café cannot add people to another',
  );
  assert.equal(
    (await s.people.karim('/admin/api/team/reset', { cafe: 'other', userId: sami })).status,
    404,
    'a person of another café is not found there',
  );
});

test('a Maintainer sees test orders only, never customers, and no loyalty panel', async () => {
  const s = await setup();
  const real = await order(s.env, 1, false);
  const test1 = await order(s.env, 2, true);
  // Staff panels: a Maintainer never gets the loyalty cards (they hold phone numbers).
  const panels = await s.people.mona('/admin/api/cafe?cafe=demo');
  assert.ok(!panels.data.modules.includes('loyalty'));
  assert.ok((await s.people.sami('/admin/api/cafe?cafe=demo')).data.modules.includes('loyalty'));
  // The orders below are on a past day: these calls run at that time (and end those sessions).
  /** @param {string} who @param {string} route @param {any} [body] */
  const asOf = async (who, route, body) =>
    handleAdmin(
      new Request(`${ORIGIN}/admin/api/${route}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          cookie: s.people[who].cookie(),
          ...(body ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      s.env,
      route.split('?')[0],
      OPEN,
    );
  const seen = /** @type {any} */ (await (await asOf('mona', 'orders?cafe=demo')).json()).orders;
  assert.deepEqual(
    seen.map((/** @type {any} */ o) => o.id),
    [test1],
  );
  assert.ok(
    seen.every((/** @type {any} */ o) => !o.contact),
    'no customer details',
  );
  const all = /** @type {any} */ (await (await asOf('sami', 'orders?cafe=demo')).json()).orders;
  assert.equal(all.length, 2);
  assert.equal(
    (await asOf('mona', 'orders/status', { cafe: 'demo', id: real, status: 'accepted' })).status,
    403,
  );
  assert.equal(
    (await asOf('mona', 'orders/status', { cafe: 'demo', id: test1, status: 'accepted' })).status,
    200,
  );
});

test('a Manager adds a Staff member: a one-time code, used once, and the audit says who did it', async () => {
  const s = await setup();
  const made = await s.people.amel('/admin/api/team/create', {
    cafe: 'demo',
    username: '  Nour.B  ',
    name: 'Nour',
    role: 'staff',
  });
  assert.equal(made.status, 201);
  assert.equal(made.data.username, 'nour.b');
  assert.match(made.data.code, /^[A-Z0-9]{10}$/);
  const team = await s.people.amel('/admin/api/team?cafe=demo');
  const nour = team.data.team.find((/** @type {any} */ m) => m.username === 'nour.b');
  assert.deepEqual(
    { role: nour.role, hasPassword: nour.hasPassword, disabled: nour.disabled },
    { role: 'staff', hasPassword: false, disabled: false },
  );
  assert.ok(nour.codeUntil);
  // Nobody reads a password, not even its hash or salt.
  assert.doesNotMatch(JSON.stringify(team.data), /pbkdf2|salt|password_hash|code_sha256/);

  const first = await s.firstTime('nour.b', made.data.code, 'nour password 2026');
  assert.equal(first.res.status, 200);
  const again = await s.firstTime('nour.b', made.data.code, 'someone else 2026');
  assert.equal(again.res.status, 401, 'the code works once');
  assert.equal((await s.signIn('nour.b', 'nour password 2026')).res.status, 200);

  // Usernames are unique across all cafés.
  const dup = await s.people.karim('/admin/api/team/create', {
    cafe: 'other',
    username: 'nour.b',
    name: 'Autre Nour',
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, 'username_taken');

  const log = (
    await s.DB.prepare(
      "SELECT action, actor_role, target FROM audit_log WHERE category = 'account' AND action = 'create:staff'",
    ).all()
  ).results.map((r) => ({ ...r }));
  assert.deepEqual(log, [
    { action: 'create:staff', actor_role: 'manager', target: await s.userId('nour.b') },
  ]);
});

test('a code expires: a new account must use it within 72 hours', async () => {
  const s = await setup();
  const made = await s.people.ahmed('/admin/api/team/create', {
    cafe: 'demo',
    username: 'late',
    name: 'Late',
    role: 'maintainer',
  });
  assert.equal(made.status, 201);
  const salt = rnd().slice(0, 24);
  const later = new Date(Date.now() + 73 * 3_600_000);
  const res = await handleAuth(
    new Request(`${ORIGIN}/admin/api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        username: 'late',
        code: made.data.code,
        salt,
        iterations: ITER,
        key: derive('late password 1', salt),
      }),
    }),
    s.env,
    'setup',
    later,
  );
  assert.equal(res.status, 401);
});

test('a reset erases the password, signs the person out everywhere, and needs the new code', async () => {
  const s = await setup();
  const phone = (await s.signIn('sami', 'correct horse battery', ANDROID)).b;
  assert.equal((await phone('/admin/api/auth/me')).status, 200);
  const sami = await s.userId('sami');
  const reset = await s.people.amel('/admin/api/team/reset', { cafe: 'demo', userId: sami });
  assert.equal(reset.status, 200);
  assert.equal((await phone('/admin/api/auth/me')).status, 401, 'signed out on every device');
  assert.equal((await s.people.sami('/admin/api/auth/me')).status, 401);
  assert.equal((await s.signIn('sami')).res.status, 401, 'the old password no longer works');
  const fresh = await s.firstTime('sami', reset.data.code, 'brand new password');
  assert.equal(fresh.res.status, 200);
  assert.equal((await s.signIn('sami', 'brand new password')).res.status, 200);

  // Limits: a Manager never resets another Manager or themself; Admin resets a Manager.
  const amel = await s.userId('amel');
  assert.equal(
    (await s.people.amel('/admin/api/team/reset', { cafe: 'demo', userId: amel })).status,
    403,
  );
  const byAdmin = await s.people.ahmed('/admin/api/team/reset', { cafe: 'demo', userId: amel });
  assert.equal(byAdmin.status, 200);
  const ahmed = await s.userId('ahmed');
  assert.equal(
    (await s.people.ahmed('/admin/api/team/reset', { cafe: 'demo', userId: ahmed })).status,
    404,
    'Admin has no café membership to reset here',
  );
  const actions = (
    await s.DB.prepare(
      "SELECT action, actor_role FROM audit_log WHERE category = 'account' AND action = 'reset' ORDER BY at, actor_role",
    ).all()
  ).results.map((r) => `${r.action}:${r.actor_role}`);
  assert.deepEqual(actions.sort(), ['reset:admin', 'reset:manager']);
});

test('disabling signs the person out and blocks sign-in until the account is enabled again', async () => {
  const s = await setup();
  const sami = await s.userId('sami');
  const off = await s.people.amel('/admin/api/team/disable', { cafe: 'demo', userId: sami });
  assert.equal(off.status, 200);
  assert.equal(off.data.team.find((/** @type {any} */ m) => m.id === sami).disabled, true);
  assert.equal((await s.people.sami('/admin/api/auth/me')).status, 401);
  assert.equal((await s.signIn('sami')).res.status, 401);
  const on = await s.people.amel('/admin/api/team/enable', { cafe: 'demo', userId: sami });
  assert.equal(on.status, 200);
  assert.equal((await s.signIn('sami')).res.status, 200);
  const roles = await s.people.ahmed('/admin/api/team/role', {
    cafe: 'demo',
    userId: sami,
    role: 'manager',
  });
  assert.equal(roles.status, 200);
  const log = (
    await s.DB.prepare(
      "SELECT action FROM audit_log WHERE category = 'account' AND target = ?1 ORDER BY id",
    )
      .bind(sami)
      .all()
  ).results.map((r) => r.action);
  assert.ok(
    ['disable', 'enable', 'role:staff>manager'].every((a) => log.includes(a)),
    log.join(),
  );
});

test('"Mes appareils": each device by name, sign out one or all the others', async () => {
  const s = await setup();
  const android = (await s.signIn('sami', 'correct horse battery', ANDROID)).b;
  const list = await s.people.sami('/admin/api/auth/sessions');
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.sessions.map((/** @type {any} */ x) => [x.device, x.current]).sort(), [
    ['Android · Chrome', false],
    ['iPhone · Safari', true],
  ]);
  // The reference never exposes the session token or its full hash.
  const other = list.data.sessions.find((/** @type {any} */ x) => !x.current);
  assert.equal(other.id.length, 12);
  const after = await s.people.sami('/admin/api/auth/sessions/revoke', { id: other.id });
  assert.equal(after.data.sessions.length, 1);
  assert.equal((await android('/admin/api/auth/me')).status, 401);
  assert.equal((await s.people.sami('/admin/api/auth/me')).status, 200, 'this device stays');

  // Someone else's device cannot be signed out with its reference.
  const amelDevices = await s.people.amel('/admin/api/auth/sessions');
  const amelRef = amelDevices.data.sessions[0].id;
  await s.people.sami('/admin/api/auth/sessions/revoke', { id: amelRef });
  assert.equal((await s.people.amel('/admin/api/auth/me')).status, 200);

  const second = (await s.signIn('sami', 'correct horse battery', ANDROID)).b;
  const third = (await s.signIn('sami', 'correct horse battery', IPHONE)).b;
  const all = await s.people.sami('/admin/api/auth/sessions/revoke', { all: true });
  assert.equal(all.data.sessions.length, 1);
  assert.equal((await second('/admin/api/auth/me')).status, 401);
  assert.equal((await third('/admin/api/auth/me')).status, 401);
});

test('changing the own password needs the current one, and signs out the other devices', async () => {
  const s = await setup();
  const other = (await s.signIn('mona', 'correct horse battery', ANDROID)).b;
  const salt = await s.people.mona('/admin/api/auth/salt', { username: 'mona' });
  const newSalt = rnd().slice(0, 24);
  const wrong = await s.people.mona('/admin/api/auth/change-password', {
    currentKey: derive('not my password', salt.data.salt, salt.data.iterations),
    salt: newSalt,
    iterations: ITER,
    key: derive('mona new password', newSalt),
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, 'wrong_credentials');
  const ok = await s.people.mona('/admin/api/auth/change-password', {
    currentKey: derive('correct horse battery', salt.data.salt, salt.data.iterations),
    salt: newSalt,
    iterations: ITER,
    key: derive('mona new password', newSalt),
  });
  assert.equal(ok.status, 200);
  assert.equal((await other('/admin/api/auth/me')).status, 401, 'other devices sign in again');
  assert.equal((await s.people.mona('/admin/api/auth/me')).status, 200, 'this device stays');
  assert.equal((await s.signIn('mona')).res.status, 401);
  assert.equal((await s.signIn('mona', 'mona new password')).res.status, 200);
  const logged = await s.DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'password_changed' AND target = ?1",
  )
    .bind(await s.userId('mona'))
    .first();
  assert.equal(logged?.n, 1);
});
