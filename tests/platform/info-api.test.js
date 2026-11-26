// @ts-check
/**
 * Café information editor (issue #20, US-28, C-06, C-07, C-08, ADR-0012): checks, versions,
 * restore, who may edit, and what customers then see.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import {
  editInfo,
  restoreInfo,
  normalisePhone,
  settingOk,
} from '../../platform/shell/src/info-api.js';
import { seedSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { accentTokens } from '../../core/ui/accent.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const demo = JSON.parse(readFileSync(path.join(root, 'cafes/demo/info.json'), 'utf8'));
/** One-time codes for the first sign-in (test values). @type {Record<string, string>} */
const CODES = { amel: 'CCCCCCCC34', sami: 'DDDDDDDD34', rami: 'FFFFFFFF34' };

test('phone numbers as people type them become international numbers', () => {
  assert.equal(normalisePhone('+216 54 313 334'), '+21654313334');
  assert.equal(normalisePhone('00216 54.313.334'), '+21654313334');
  const ok = editInfo(demo, { info: { phone: '+216 54 313 334' } });
  assert.equal(ok.next.info.phone, '+21654313334');
  assert.deepEqual(ok.fields, ['info.phone']);
  assert.deepEqual(editInfo(demo, { info: { phone: '54313334' } }).problems, [
    { field: 'info.phone', code: 'bad_phone' },
  ]);
  const cleared = editInfo(
    { ...demo, info: { ...demo.info, phone: '+21654313334' } },
    { info: { phone: '' } },
  );
  assert.equal(cleared.next.info.phone, undefined);
});

test('address, map and social links: French required, https only, at most 6 links', () => {
  const langs = { ...demo, languages: { enabled: ['fr', 'en'], default: 'fr' } };
  const r = editInfo(langs, {
    info: {
      address: { fr: ' Rue de la Plage, Monastir ', ar: 'لا تُنشر', en: 'Beach Street' },
      mapUrl: 'https://maps.app.goo.gl/abc',
      social: [
        'https://www.instagram.com/jobi.monastir/',
        '',
        'https://www.instagram.com/jobi.monastir/',
      ],
    },
  });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(
    r.next.info.address,
    { fr: 'Rue de la Plage, Monastir', en: 'Beach Street' },
    'only the café’s languages',
  );
  assert.deepEqual(
    r.next.info.social,
    ['https://www.instagram.com/jobi.monastir/'],
    'no blanks, no doubles',
  );
  const bad = editInfo(demo, {
    info: {
      address: { en: 'English only' },
      mapUrl: 'http://maps.example',
      social: Array.from({ length: 7 }, (_, i) => `https://example.org/${i}`),
    },
  });
  assert.deepEqual(
    bad.problems.map((p) => [p.field, p.code]),
    [
      ['info.address', 'bad_text'],
      ['info.mapUrl', 'bad_url'],
      ['info.social', 'bad_url'],
    ],
  );
});

test('opening hours per day: up to 3 spans, after midnight allowed, nothing else', () => {
  const r = editInfo(demo, { hours: { mon: [], sun: [['12:00', '00:00']] } });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.next.hours.mon, [], 'closed on Monday');
  assert.deepEqual(r.next.hours.sun, [['12:00', '00:00']]);
  const bad = editInfo(demo, {
    hours: {
      tue: [['25:00', '10:00']],
      wed: [['10:00', '10:00']],
      thu: [
        ['08:00', '09:00'],
        ['10:00', '11:00'],
        ['12:00', '13:00'],
        ['14:00', '15:00'],
      ],
    },
  });
  assert.deepEqual(
    bad.problems.map((p) => p.field),
    ['hours.tue', 'hours.wed', 'hours.thu'],
  );
});

test('a colour too light for buttons is refused with a deeper shade that passes (ADR-0012)', () => {
  const light = editInfo(demo, { branding: { primaryColor: '#FFD400' } });
  assert.equal(light.problems.length, 1);
  const [p] = light.problems;
  assert.equal(p.code, 'contrast');
  assert.equal(p.field, 'branding.primaryColor');
  assert.match(String(p.suggestion), /^#[0-9A-F]{6}$/i);
  assert.deepEqual(
    accentTokens({ primaryColor: String(p.suggestion) }).errors,
    [],
    'the suggestion passes',
  );

  // A light brand with its own deeper button colour is fine; clearing the button colour too.
  const both = editInfo(demo, { branding: { primaryColor: '#FFD400', buttonColor: '#7a5a00' } });
  assert.deepEqual(both.problems, []);
  assert.equal(both.next.branding.buttonColor, '#7A5A00');
  const cleared = editInfo(both.next, { branding: { buttonColor: '' } });
  assert.equal(cleared.next.branding.buttonColor, undefined);
  assert.equal(cleared.problems[0]?.code, 'contrast', 'without it the light brand fails again');
  assert.equal(
    editInfo(demo, { branding: { primaryColor: 'red' } }).problems[0].code,
    'bad_colour',
  );
});

test('module settings follow their schema; only what changed is recorded', () => {
  const r = editInfo(demo, {
    settings: {
      google_review: { reviewUrl: ' https://g.page/r/abc/review ' },
      loyalty: { reward: { fr: '1 café offert', ar: 'قهوة مجانية' }, minOrderTotal: 5000 },
      whatsapp_handoff: { messageLanguage: 'fr' },
    },
  });
  assert.deepEqual(r.problems, []);
  assert.equal(r.next.modules.google_review.settings.reviewUrl, 'https://g.page/r/abc/review');
  assert.deepEqual(r.next.modules.loyalty.settings.reward, {
    fr: '1 café offert',
    ar: 'قهوة مجانية',
  });
  assert.equal(
    r.next.modules.google_review.enabled,
    demo.modules.google_review.enabled,
    'switches untouched',
  );
  const bad = editInfo(demo, {
    settings: {
      google_review: { reviewUrl: 'https://example.org/rate-us' },
      loyalty: { stampsNeeded: 1, reward: { ar: 'بدون فرنسية' } },
      nothing: { a: 1 },
    },
  });
  assert.deepEqual(
    bad.problems.map((p) => p.field),
    [
      'settings.google_review.reviewUrl',
      'settings.loyalty.stampsNeeded',
      'settings.loyalty.reward',
      'settings.nothing',
    ],
  );
  assert.ok(settingOk({ enum: ['default', 'fr'] }, 'fr'));
  assert.ok(!settingOk({ type: 'integer', minimum: 0 }, 2.5));

  // Sending the same values again changes nothing.
  assert.deepEqual(editInfo(demo, { info: { address: demo.info.address } }).fields, []);
});

test('restoring brings back information, hours, colours and settings, never the switches', () => {
  const before = structuredClone(demo);
  const after = editInfo(demo, {
    info: { phone: '+21654313334' },
    hours: { mon: [] },
    settings: { google_review: { reviewUrl: 'https://g.page/r/new/review' } },
  }).next;
  after.modules.loyalty.enabled = false; // switched off since
  const back = restoreInfo(after, before);
  assert.equal(back.info.phone, before.info?.phone);
  assert.deepEqual(back.hours, before.hours);
  assert.deepEqual(back.modules.google_review.settings, before.modules.google_review.settings);
  assert.equal(back.modules.loyalty.enabled, false, 'a kill switch stays');
});

async function setup() {
  clearCaches();
  clearManifests();
  const DB = createD1().migrate();
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
  for (const [username, name, role, cafe] of /** @type {[string, string, string, string][]} */ ([
    ['amel', 'Amel', 'manager', 'demo'],
    ['sami', 'Sami', 'staff', 'demo'],
    ['rami', 'Rami', 'maintainer', 'demo'],
  ]))
    DB.exec(accountSql({ username, name, role, cafe, code: CODES[username] }));
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
    return { status: res.status, data: /** @type {any} */ (await res.json()), res };
  };
  /** @param {string} user */
  async function person(user) {
    const done = await call('/admin/api/auth/setup', {
      username: user,
      code: CODES[user],
      salt: rnd().slice(0, 24),
      iterations: 310_000,
      key: rnd(),
    });
    assert.equal(done.status, 200);
    const cookie = String(done.res.headers.get('set-cookie')).split(';')[0];
    return (/** @type {string} */ p, /** @type {any} */ body = undefined) => call(p, body, cookie);
  }
  return { DB, call, person };
}

test('a Manager edits the café from a phone; customers see it; every save is a version', async () => {
  const s = await setup();
  const amel = await s.person('amel');
  const sami = await s.person('sami');
  assert.equal((await sami('/admin/api/info?cafe=demo')).status, 403, 'Staff do not see it');

  const view = await amel('/admin/api/info?cafe=demo');
  assert.equal(view.status, 200);
  assert.equal(view.data.role, 'manager');
  assert.ok(view.data.modules.some((/** @type {any} */ m) => m.key === 'google_review'));

  const saved = await amel('/admin/api/info', {
    cafe: 'demo',
    info: {
      phone: '+216 54 313 334',
      mapUrl: 'https://maps.app.goo.gl/demo',
      social: ['https://www.instagram.com/demo'],
    },
    hours: { mon: [] },
  });
  assert.equal(saved.status, 200);
  const boot = await s.call('/api/boot?cafe=demo');
  assert.deepEqual(
    {
      phone: boot.data.cafe.info.phone,
      map: boot.data.cafe.info.mapUrl,
      social: boot.data.cafe.info.social,
    },
    {
      phone: '+21654313334',
      map: 'https://maps.app.goo.gl/demo',
      social: ['https://www.instagram.com/demo'],
    },
  );
  assert.deepEqual(boot.data.cafe.hours.mon, []);

  const refused = await amel('/admin/api/info', {
    cafe: 'demo',
    branding: { primaryColor: '#FFD400' },
  });
  assert.equal(refused.status, 422);
  assert.equal(refused.data.problems[0].code, 'contrast');
  assert.ok(refused.data.problems[0].suggestion);

  const again = await amel('/admin/api/info', { cafe: 'demo', info: { phone: '+21654313334' } });
  assert.equal(again.data.unchanged, true);

  const history = (await amel('/admin/api/info?cafe=demo')).data.history;
  assert.equal(history.length, 1);
  assert.equal(history[0].by, 'Amel');
  assert.deepEqual(history[0].fields.sort(), [
    'hours.mon',
    'info.mapUrl',
    'info.phone',
    'info.social',
  ]);

  // Undo: back to the version before the change.
  const undo = await amel('/admin/api/info/restore', {
    cafe: 'demo',
    version: history[0].version - 1,
  });
  assert.equal(undo.status, 200);
  const restored = await s.call('/api/boot?cafe=demo');
  assert.equal(restored.data.cafe.info?.phone, undefined);
  assert.deepEqual(restored.data.cafe.hours.mon, demo.hours.mon);
  const log = await s.DB.prepare(
    "SELECT action, actor_role FROM audit_log WHERE category = 'config'",
  ).all();
  assert.deepEqual(
    log.results.map((r) => [r.action, r.actor_role]),
    [
      ['info', 'manager'],
      ['restore', 'manager'],
    ],
  );
});

test('orders stop when the new hours say closed; the menu stays readable', async () => {
  const s = await setup();
  const rami = await s.person('rami');
  const closed = Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, []]),
  );
  assert.equal((await rami('/admin/api/info', { cafe: 'demo', hours: closed })).status, 200);
  const boot = await s.call('/api/boot?cafe=demo');
  assert.equal(boot.status, 200, 'the menu still opens');
  assert.ok(boot.data.menu.categories.length > 0);
  const order = await s.call('/api/orders', {
    cafe: 'demo',
    clientKey: 'closed-test-00000001',
    type: 'takeaway',
    channel: 'whatsapp_handoff',
    lines: [{ variantId: boot.data.menu.categories[0].groups[0].items[0].variants[0].id, qty: 1 }],
    noticeVersion: 1,
    lang: 'fr',
    customer: { firstName: 'Rim', phone: '22 333 444' },
    consents: { orderUpdates: true },
  });
  assert.equal(order.status, 409);
  assert.equal(order.data.error, 'closed');
});
