// @ts-check
/**
 * Releases per café and the rollback (issue #24, MOD-07, MOD-08, MOD-09, D-021): adding a
 * release to the window changes no café; a pin is data with history; the pre-flight; Admin
 * moves a café either way, a Maintainer only back to the release it ran before; Manager sees,
 * Staff do not; the window tool.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests, compareVersions } from '../../platform/shell/src/releases.js';
import { preflight, mayPin } from '../../platform/shell/src/releases-api.js';
import {
  registerSql,
  siteReleases,
  strandedQuery,
  treeDigest,
} from '../../tools/release/window.js';
import { dataSchema } from '../../tools/release/build.js';
import { stateQuery, stateRow, planPin } from '../../tools/release/pin.js';
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
};
const SCHEMA = dataSchema();

/**
 * A release's manifest as the build writes it.
 * @param {string} version
 * @param {{ drop?: string[], settings?: Record<string, number>, dataSchema?: number,
 *   config?: number[], legacy?: boolean }} [o]
 */
function manifest(version, o = {}) {
  const modules = Object.fromEntries(
    ['dietary_tags', 'google_review', 'loyalty', 'whatsapp_handoff']
      .filter((k) => !o.drop?.includes(k))
      .map((k) => [
        k,
        {
          entry: `/r/${version}/m/${k}.js`,
          ...(o.legacy ? {} : { version: '0.1.0', settingsVersion: o.settings?.[k] ?? 1 }),
          texts: {},
        },
      ]),
  );
  return {
    version,
    platformApi: 1,
    entry: `/r/${version}/app.js`,
    css: `/r/${version}/app.css`,
    ...(o.legacy
      ? {}
      : {
          dataSchema: o.dataSchema ?? SCHEMA,
          reads: { config: o.config ?? [0], snapshot: [1] },
        }),
    modules,
  };
}

/** Releases on the test site; each test adds what it needs to the `releases` table. */
const SITE = {
  '0.15.0': manifest('0.15.0', { legacy: true }),
  '0.16.0': manifest('0.16.0'),
  '0.17.0': manifest('0.17.0'),
  '0.18.0': manifest('0.18.0', { drop: ['loyalty'] }),
  '0.19.0': manifest('0.19.0', { dataSchema: 999 }),
  '0.20.0': manifest('0.20.0', { config: [1], settings: { loyalty: 2 } }),
};

/** @param {{ release?: string }} [o] */
async function setup(o = {}) {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(
    seedSql({ dir: path.join(root, 'cafes/demo'), release: o.release ?? '0.16.0', status: 'live' }),
  );
  DB.exec(
    registerSql(
      [
        { version: '0.16.0', platformApi: 1, dataSchema: SCHEMA },
        { version: '0.15.0', platformApi: 1, dataSchema: 1 },
      ],
      { statuses: { '0.16.0': 'stable', '0.15.0': 'previous' } },
    ),
  );
  for (const [username, name, role, cafe] of /** @type {[string, string, string, string?][]} */ ([
    ['ahmed', 'Ahmed', 'admin'],
    ['amel', 'Amel', 'manager', 'demo'],
    ['sami', 'Sami', 'staff', 'demo'],
    ['mona', 'Mona', 'maintainer', 'demo'],
  ]))
    DB.exec(accountSql({ username, name, role, cafe, code: CODES[username] }));
  const env = /** @type {any} */ ({
    DB,
    ASSETS: {
      fetch: async (/** @type {Request} */ r) => {
        const m = /^\/r\/([^/]+)\/manifest\.json$/.exec(new URL(r.url).pathname);
        const body = m ? SITE[/** @type {keyof typeof SITE} */ (m[1])] : null;
        // Like Cloudflare's asset layer in single-page-application mode: a missing file is
        // answered with the boot page, status 200.
        return body
          ? Response.json(body)
          : new Response('<!doctype html><title>DigiMenu</title>', {
              headers: { 'content-type': 'text/html' },
            });
      },
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
    const text = await res.text();
    return { status: res.status, text, data: /** @type {any} */ (text ? JSON.parse(text) : null) };
  };
  /** @param {string} user */
  async function person(user) {
    const res = await worker.fetch(
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
    assert.equal(res.status, 200, `${user} signs in`);
    const cookie = String(res.headers.get('set-cookie')).split(';')[0];
    return (/** @type {string} */ p, /** @type {any} */ body = undefined) => call(p, body, cookie);
  }
  /** @param {string} version @param {string} [status] */
  const addRelease = (version, status = 'candidate') =>
    DB.exec(
      `INSERT INTO releases (version, status, platform_api, data_schema_min, data_schema_max, added_at) VALUES ('${version}', '${status}', 1, 1, 1, '2026-11-26T00:00:00Z') ON CONFLICT (version) DO UPDATE SET status = excluded.status;`,
    );
  const boot = () => call('/api/boot?cafe=demo&t=5&k=7QF3K9');
  const pins = async () =>
    (
      await DB.prepare(
        "SELECT release, previous_release, pinned_by, reason, config_version FROM release_pins WHERE cafe_id = 'cafe-demo' ORDER BY pinned_at, rowid",
      ).all()
    ).results.map((r) => ({ ...r }));
  const audits = async () =>
    (
      await DB.prepare(
        "SELECT action, target, actor_role FROM audit_log WHERE category = 'release' ORDER BY at, id",
      ).all()
    ).results.map((r) => ({ ...r }));
  return { DB, call, person, addRelease, boot, pins, audits };
}

test('adding a release to the window changes no café: the boot answer is byte-identical', async () => {
  const s = await setup();
  const before = await s.boot();
  assert.equal(before.status, 200);
  assert.equal(before.data.release.version, '0.16.0');
  const ahmed = await s.person('ahmed');
  const listBefore = await ahmed('/admin/api/cafes');

  // The deploy registers a new release next to the old one.
  s.DB.exec(
    registerSql(
      [
        { version: '0.17.0', platformApi: 1, dataSchema: SCHEMA },
        { version: '0.16.0', platformApi: 1, dataSchema: SCHEMA },
      ],
      { statuses: { '0.17.0': 'candidate', '0.16.0': 'stable' } },
    ),
  );
  clearCaches();
  clearManifests();
  const after = await s.boot();
  assert.equal(after.text, before.text, 'same bytes');
  assert.deepEqual((await ahmed('/admin/api/cafes')).data, listBefore.data);
  assert.equal(listBefore.data.cafes[0].release, '0.16.0', 'the café list shows the release');
  const rows = (
    await s.DB.prepare('SELECT version, status FROM releases ORDER BY version').all()
  ).results.map((r) => `${r.version}:${r.status}`);
  assert.deepEqual(rows, ['0.15.0:retired', '0.16.0:stable', '0.17.0:candidate']);
  assert.equal((await s.pins()).length, 1, 'no pin was written');
});

test('Admin moves a café forward: customers get the new release; history and audit kept, menu and configuration untouched', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  const ahmed = await s.person('ahmed');
  const cfg = await s.DB.prepare(
    "SELECT active_config_version AS v, menu_rev AS m FROM cafes WHERE id = 'cafe-demo'",
  ).first();

  const seen = await ahmed('/admin/api/releases?cafe=demo');
  assert.equal(seen.status, 200);
  assert.equal(seen.data.current.version, '0.16.0');
  const next = seen.data.window.find((/** @type {any} */ r) => r.version === '0.17.0');
  assert.deepEqual(
    { allowed: next.allowed, problems: next.problems, older: next.older },
    { allowed: 'forward', problems: [], older: false },
  );

  const moved = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'Pilot café first (D-029)',
  });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data, { release: '0.17.0', from: '0.16.0', direction: 'forward' });
  assert.equal((await s.boot()).data.release.version, '0.17.0', 'next page load');
  const history = await s.pins();
  assert.equal(history.length, 2);
  assert.equal(history[1].release, '0.17.0');
  assert.equal(history[1].previous_release, '0.16.0');
  assert.equal(history[1].reason, 'Pilot café first (D-029)');
  assert.equal(history[1].config_version, cfg?.v);
  const admin = await s.DB.prepare("SELECT id FROM users WHERE username = 'ahmed'").first();
  assert.equal(history[1].pinned_by, admin?.id);
  assert.deepEqual(await s.audits(), [
    { action: 'pin', target: 'demo 0.16.0 -> 0.17.0', actor_role: 'admin' },
  ]);
  const cfgAfter = await s.DB.prepare(
    "SELECT active_config_version AS v, menu_rev AS m FROM cafes WHERE id = 'cafe-demo'",
  ).first();
  assert.deepEqual({ ...cfgAfter }, { ...cfg }, 'same configuration version and menu revision');

  const again = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'twice',
  });
  assert.deepEqual(again.data, { release: '0.17.0', unchanged: true });

  const view = (await ahmed('/admin/api/releases?cafe=demo')).data;
  assert.equal(view.previous, '0.16.0');
  assert.equal(view.history[0].by, 'Ahmed');
  assert.equal(view.history[0].reason, 'Pilot café first (D-029)');
  assert.equal(view.history[1].seed, true);
});

test('a Maintainer puts the café back on the release it ran before, and can do nothing else', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  const ahmed = await s.person('ahmed');
  const mona = await s.person('mona');

  // Nothing to go back to yet (first seed): no move allowed.
  let view = (await mona('/admin/api/releases?cafe=demo')).data;
  assert.equal(view.previous, null);
  assert.deepEqual(
    view.window.map((/** @type {any} */ r) => [r.version, r.allowed]),
    [
      ['0.17.0', null],
      ['0.16.0', null],
      ['0.15.0', null],
    ],
  );
  const early = await mona('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.15.0',
    reason: 'test',
  });
  assert.equal(early.status, 403);
  assert.equal(early.data.error, 'back_to_previous_only');

  await ahmed('/admin/api/releases/pin', { cafe: 'demo', version: '0.17.0', reason: 'pilot' });
  view = (await mona('/admin/api/releases?cafe=demo')).data;
  assert.equal(view.previous, '0.16.0');
  assert.deepEqual(view.can, { forward: false, back: true });
  assert.deepEqual(
    view.window.map((/** @type {any} */ r) => [r.version, r.allowed]),
    [
      ['0.17.0', null],
      ['0.16.0', 'back'],
      ['0.15.0', null],
    ],
  );
  // Older than the previous one: Admin only.
  const older = await mona('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.15.0',
    reason: 'test',
  });
  assert.equal(older.status, 403);

  const back = await mona('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.16.0',
    reason: 'Commandes bloquées à 12:10',
  });
  assert.equal(back.status, 200);
  assert.equal(back.data.direction, 'back');
  assert.equal((await s.boot()).data.release.version, '0.16.0');

  // Back again to 0.17.0 would be forward: not for a Maintainer, even though it is "previous".
  view = (await mona('/admin/api/releases?cafe=demo')).data;
  assert.equal(view.previous, '0.17.0');
  assert.equal(view.window.find((/** @type {any} */ r) => r.version === '0.17.0').allowed, null);
  const forward = await mona('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'fixed?',
  });
  assert.equal(forward.status, 403);
  assert.equal(forward.data.error, 'back_to_previous_only');
  assert.deepEqual(await s.audits(), [
    { action: 'pin', target: 'demo 0.16.0 -> 0.17.0', actor_role: 'admin' },
    { action: 'rollback', target: 'demo 0.17.0 -> 0.16.0', actor_role: 'maintainer' },
  ]);
});

test('a Manager sees the release but moves nothing; Staff do not see it', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  const amel = await s.person('amel');
  const sami = await s.person('sami');
  const view = await amel('/admin/api/releases?cafe=demo');
  assert.equal(view.status, 200);
  assert.deepEqual(view.data.can, { forward: false, back: false });
  assert.ok(view.data.window.every((/** @type {any} */ r) => r.allowed === null));
  const move = await amel('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'please',
  });
  assert.equal(move.status, 403);
  assert.equal((await sami('/admin/api/releases?cafe=demo')).status, 403);
  assert.equal((await s.call('/admin/api/releases?cafe=demo')).status, 401);
  assert.equal((await s.pins()).length, 1);
});

test('the pre-flight refuses a release the café cannot run on, and says why', async () => {
  const s = await setup();
  for (const v of ['0.18.0', '0.19.0', '0.20.0']) s.addRelease(v);
  const ahmed = await s.person('ahmed');
  const view = (await ahmed('/admin/api/releases?cafe=demo')).data;
  /** @param {string} v */
  const problems = (v) =>
    view.window
      .find((/** @type {any} */ r) => r.version === v)
      .problems.map((/** @type {any} */ p) => p.code);
  assert.deepEqual(problems('0.18.0'), ['module_missing']);
  assert.deepEqual(problems('0.19.0'), ['data_schema']);
  assert.deepEqual(problems('0.20.0'), ['config_format', 'settings_format']);
  assert.deepEqual(problems('0.15.0'), [], 'a release built before #24 is read as such');

  const refused = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.18.0',
    reason: 'test',
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.data.error, 'preflight');
  assert.deepEqual(refused.data.problems, [{ code: 'module_missing', modules: ['loyalty'] }]);
  assert.equal((await s.boot()).data.release.version, '0.16.0');

  // Not in the window, retired, or no reason: refused before anything is checked.
  // A release registered but missing from the site: listed nowhere, never a crash.
  s.addRelease('0.99.0');
  const listed = await ahmed('/admin/api/releases?cafe=demo');
  assert.equal(listed.status, 200);
  assert.ok(!listed.data.window.some((/** @type {any} */ r) => r.version === '0.99.0'));
  // A café pinned to it anyway: "not published", not a crash.
  s.DB.exec("UPDATE cafes SET pinned_release = '0.99.0' WHERE id = 'cafe-demo'");
  clearCaches();
  const lost = await s.boot();
  assert.deepEqual([lost.status, lost.data.error], [503, 'not_published']);
  s.DB.exec("UPDATE cafes SET pinned_release = '0.16.0' WHERE id = 'cafe-demo'");
  clearCaches();
  const unknown = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '9.9.9',
    reason: 'test',
  });
  assert.equal(unknown.data.error, 'not_in_window');
  s.addRelease('0.17.0', 'retired');
  const retired = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'test',
  });
  assert.equal(retired.data.error, 'not_in_window');
  const noReason = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.15.0',
    reason: ' ',
  });
  assert.equal(noReason.data.error, 'reason_needed');
  assert.equal((await s.pins()).length, 1);
});

test('a move that meets another one changes nothing: pin and history together, or neither', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  const ahmed = await s.person('ahmed');
  const batch = s.DB.batch;
  s.DB.batch = async (/** @type {any[]} */ statements) => {
    // Someone else moved the café between the checks and the write.
    s.DB.exec("UPDATE cafes SET pinned_release = '0.15.0' WHERE id = 'cafe-demo'");
    return batch(statements);
  };
  const res = await ahmed('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.17.0',
    reason: 'race',
  });
  s.DB.batch = batch;
  assert.equal(res.status, 409);
  assert.equal(res.data.error, 'changed_meanwhile');
  assert.equal((await s.pins()).length, 1);
  assert.deepEqual(await s.audits(), []);
});

test('re-seeding a café on another release keeps the move, so it can be rolled back (preview)', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  s.DB.exec(
    seedSql({
      dir: path.join(root, 'cafes/demo'),
      release: '0.17.0',
      replace: true,
      status: 'live',
    }),
  );
  clearCaches();
  const history = await s.pins();
  assert.deepEqual(
    history.map((r) => [r.release, r.previous_release, r.pinned_by]),
    [
      ['0.16.0', null, 'seed'],
      ['0.17.0', '0.16.0', 'seed'],
    ],
  );
  const mona = await s.person('mona');
  const back = await mona('/admin/api/releases/pin', {
    cafe: 'demo',
    version: '0.16.0',
    reason: 'rehearsal',
  });
  assert.equal(back.status, 200);
  // Same release again: no new history row.
  s.DB.exec(
    seedSql({
      dir: path.join(root, 'cafes/demo'),
      release: '0.16.0',
      replace: true,
      status: 'live',
    }),
  );
  assert.equal((await s.pins()).length, 3);
});

test('pre-flight and permissions, one rule at a time', () => {
  const base = {
    current: manifest('0.16.0'),
    config: { modules: { loyalty: { enabled: true }, photos: { enabled: false } } },
    configSchema: 0,
    snapshotSchema: 1,
    dataSchema: SCHEMA,
  };
  assert.deepEqual(preflight({ ...base, target: manifest('0.17.0') }), []);
  assert.deepEqual(preflight({ ...base, target: null }), [{ code: 'not_in_site' }]);
  assert.deepEqual(
    preflight({ ...base, snapshotSchema: 2, target: manifest('0.17.0') }).map((p) => p.code),
    ['snapshot_format'],
  );
  // A module switched off is not needed in the target release.
  assert.deepEqual(
    preflight({
      ...base,
      config: { modules: { loyalty: { enabled: false } } },
      target: manifest('0.18.0', { drop: ['loyalty'] }),
    }),
    [],
  );
  assert.equal(mayPin('admin', '0.15.0', '0.17.0', '0.16.0'), 'back');
  assert.equal(mayPin('admin', '0.18.0', '0.17.0', null), 'forward');
  assert.equal(mayPin('maintainer', '0.16.0', '0.17.0', '0.16.0'), 'back');
  assert.equal(mayPin('maintainer', '0.15.0', '0.17.0', '0.16.0'), null);
  assert.equal(mayPin('maintainer', '0.18.0', '0.17.0', '0.18.0'), null);
  assert.equal(mayPin('manager', '0.16.0', '0.17.0', '0.16.0'), null);
  assert.equal(mayPin('admin', '0.17.0', '0.17.0', null), null);
});

test('versions sort as semantic versions', () => {
  const sorted = [
    '0.17.0',
    '0.16.0-preview.1',
    '0.16.0',
    '0.16.0-preview.10',
    '0.16.0-preview.2',
    '0.9.9',
    '1.0.0-rc.1',
  ].sort(compareVersions);
  assert.deepEqual(sorted, [
    '0.9.9',
    '0.16.0-preview.1',
    '0.16.0-preview.2',
    '0.16.0-preview.10',
    '0.16.0',
    '0.17.0',
    '1.0.0-rc.1',
  ]);
  assert.throws(() => compareVersions('latest', '0.1.0'));
});

test('the window tool: releases on a site, at most 3, stranded cafés, a digest per release', async () => {
  const site = mkdtempSync(path.join(tmpdir(), 'dm-site-'));
  for (const v of ['0.16.0', '0.17.0']) {
    mkdirSync(path.join(site, 'r', v, 'm'), { recursive: true });
    writeFileSync(path.join(site, 'r', v, 'manifest.json'), JSON.stringify(manifest(v)));
    writeFileSync(path.join(site, 'r', v, 'app.js'), `console.log('${v}')`);
  }
  const releases = siteReleases(site);
  assert.deepEqual(
    releases.map((r) => [r.version, r.dataSchema]),
    [
      ['0.17.0', SCHEMA],
      ['0.16.0', SCHEMA],
    ],
  );
  const sqlText = registerSql(releases, { now: '2026-11-26T00:00:00Z' });
  assert.match(sqlText, /'0\.17\.0', 'stable'/);
  assert.match(sqlText, /'0\.16\.0', 'previous'/);
  assert.throws(
    () => registerSql([...releases, ...releases.map((r) => ({ ...r, version: `${r.version}-x` }))]),
    /at most 3/,
  );
  assert.throws(
    () => registerSql(releases, { statuses: { '0.18.0': 'stable' } }),
    /not on the site/,
  );
  assert.throws(() => registerSql(releases, { statuses: { '0.17.0': 'beta' } }), /not one of/);

  // A café on a release that the site would no longer carry is listed, except the demo café.
  const s = await setup({ release: '0.15.0' });
  const query = strandedQuery(releases.map((r) => r.version));
  assert.deepEqual(
    (await s.DB.prepare(query).all()).results.map((r) => ({ ...r })),
    [{ slug: 'demo', pinned_release: '0.15.0' }],
  );
  const skip = strandedQuery(
    releases.map((r) => r.version),
    ['demo'],
  );
  assert.deepEqual((await s.DB.prepare(skip).all()).results, []);

  const one = treeDigest(path.join(site, 'r', '0.17.0'));
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.equal(treeDigest(path.join(site, 'r', '0.17.0')), one, 'same files, same digest');
  writeFileSync(path.join(site, 'r', '0.17.0', 'app.js'), "console.log('changed')");
  assert.notEqual(treeDigest(path.join(site, 'r', '0.17.0')), one);
});

test('the fallback without the staff app: same rules, same pre-flight, same history', async () => {
  const s = await setup();
  s.addRelease('0.17.0');
  s.addRelease('0.18.0');
  const read = async () => stateRow(await s.DB.prepare(stateQuery('demo')).all());
  const manifestOf = async (/** @type {string} */ v) => /** @type {any} */ (SITE)[v] ?? null;
  const plan = (/** @type {any} */ o) =>
    read().then((row) =>
      planPin({
        row,
        reason: 'Staff app down',
        by: 'github:ahmed1bouabid',
        manifest: manifestOf,
        ...o,
      }),
    );

  // A Maintainer's account may only go back: nothing to go back to yet.
  assert.deepEqual(await plan({ release: '0.17.0', backOnly: true }), {
    error: 'back_to_previous_only',
  });
  /** @param {string} release */
  const refused = async (release) => {
    const p = await plan({ release, backOnly: false });
    return 'error' in p ? p.error : null;
  };
  assert.equal(await refused('0.18.0'), 'preflight');
  assert.equal(await refused('9.9.9'), 'not_in_window');
  assert.equal(await refused('0.16.0'), 'unchanged');

  const forward = await plan({ release: '0.17.0', backOnly: false });
  assert.ok('sql' in forward);
  s.DB.exec(forward.sql);
  clearCaches();
  assert.equal((await s.boot()).data.release.version, '0.17.0');
  const back = await plan({ release: '0.16.0', backOnly: true, by: 'github:youth-account' });
  assert.ok('sql' in back);
  assert.equal(back.direction, 'back');
  s.DB.exec(back.sql);
  // Run twice by mistake: the second run changes nothing.
  s.DB.exec(back.sql);
  clearCaches();
  assert.equal((await s.boot()).data.release.version, '0.16.0');
  assert.deepEqual(
    (await s.pins()).map((r) => [r.release, r.previous_release, r.pinned_by]),
    [
      ['0.16.0', null, 'seed'],
      ['0.17.0', '0.16.0', 'github:ahmed1bouabid'],
      ['0.16.0', '0.17.0', 'github:youth-account'],
    ],
  );
  assert.deepEqual(await s.audits(), [
    { action: 'pin', target: 'demo 0.16.0 -> 0.17.0', actor_role: 'admin' },
    { action: 'rollback', target: 'demo 0.17.0 -> 0.16.0', actor_role: 'maintainer' },
  ]);
  const ahmed = await s.person('ahmed');
  const view = (await ahmed('/admin/api/releases?cafe=demo')).data;
  assert.equal(view.history[0].by, 'youth-account (GitHub)');
  assert.throws(() => stateQuery("demo'; DROP TABLE cafes; --"), /not a café slug/);
});
