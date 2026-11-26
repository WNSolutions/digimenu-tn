// @ts-check
/**
 * Staff screen live line (issue #16, US-45): the café hub pushes to every staff device, the
 * Worker signs devices in to it, orders and status changes reach it without personal data,
 * and every device shows who took an order.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../platform/shell/src/index.js';
import { CafeHub } from '../../platform/shell/src/cafe-hub.js';
import { clearCaches } from '../../platform/shell/src/cafes.js';
import { clearManifests } from '../../platform/shell/src/releases.js';
import { handleCreateOrder } from '../../platform/shell/src/orders-api.js';
import { clearNotice } from '../../platform/shell/src/privacy.js';
import { seedSql, noticeSql } from '../../tools/seed/seed.js';
import { accountSql } from '../../tools/accounts/account.js';
import { connectLive } from '../../platform/admin/live.js';
import { localDayHour } from '../../platform/shell/src/clock.js';
import { createD1 } from '../support/d1.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://preview.example';
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const OPEN = new Date('2026-11-18T10:30:00Z');
/** @type {Record<string, string>} */
const CODES = { amel: 'CCCCCCCC34', sami: 'DDDDDDDD34', nour: 'EEEEEEEE34' };

/** A socket as the runtime hands it to the hub, recording what it is sent. */
function fakeSocket() {
  /** @type {string[]} */
  const sent = [];
  return { sent, send: (/** @type {string} */ t) => void sent.push(t), close() {} };
}

test('the hub pushes every message to every connected device, and knows who is there', async () => {
  /** @type {any[]} */
  const sockets = [];
  /** @type {Map<string, any>} */
  const store = new Map();
  const ctx = {
    acceptWebSocket: (/** @type {any} */ ws) => void sockets.push(ws),
    getWebSockets: () => sockets,
    storage: {
      get: async (/** @type {string} */ k) => store.get(k),
      put: async (/** @type {string} */ k, /** @type {any} */ v) => void store.set(k, v),
    },
  };
  const g = /** @type {any} */ (globalThis);
  const saved = { pair: g.WebSocketPair, Response: g.Response };
  g.WebSocketPair = function () {
    return { 0: { client: true }, 1: fakeSocket() };
  };
  // The runtime's Response takes status 101 and a socket; Node's does not.
  g.Response = class extends saved.Response {
    /** @param {any} body @param {any} init */
    constructor(body, init) {
      super(body, init?.status === 101 ? { status: 200 } : init);
    }
  };
  try {
    const hub = new CafeHub(/** @type {any} */ (ctx), {});
    const upgrade = { headers: { upgrade: 'websocket' } };
    for (let i = 0; i < 3; i++) await hub.fetch(new Request('https://hub/connect', upgrade));
    assert.equal(sockets.length, 3);
    const none = await hub.fetch(new Request('https://hub/connect'));
    assert.equal(none.status, 426, 'only WebSockets connect');

    const res = await hub.fetch(
      new Request('https://hub/notify', {
        method: 'POST',
        body: JSON.stringify({ type: 'order', id: 'o1', number: 'A12' }),
      }),
    );
    assert.deepEqual(await res.json(), { sent: 3 });
    for (const s of sockets)
      assert.deepEqual(s.sent, ['{"type":"order","id":"o1","number":"A12"}']);

    const presence = await (await hub.fetch(new Request('https://hub/presence'))).json();
    assert.equal(presence.devices, 3);
    assert.match(presence.lastSeen, /^\d{4}-\d{2}-\d{2}T/);

    // "ping" keeps a line alive.
    const s = fakeSocket();
    await hub.webSocketMessage(/** @type {any} */ (s), 'ping');
    assert.deepEqual(s.sent, ['pong']);
  } finally {
    g.WebSocketPair = saved.pair;
    g.Response = saved.Response;
  }
});

async function setup() {
  clearCaches();
  clearManifests();
  clearNotice();
  const DB = createD1().migrate();
  DB.exec(noticeSql(path.join(root, 'tools/seed/demo-privacy-notice.json')));
  DB.exec(seedSql({ dir: path.join(root, 'cafes/demo'), release: '0.1.0', status: 'live' }));
  for (const [username, name, role] of [
    ['amel', 'Amel', 'manager'],
    ['sami', 'Sami', 'staff'],
    ['nour', 'Nour', 'staff'],
  ])
    DB.exec(accountSql({ username, name, role, cafe: 'demo', code: CODES[username] }));
  /** @type {{ cafe: unknown, url: string, body: string, upgrade: string | null }[]} */
  const hubCalls = [];
  const env = /** @type {any} */ ({
    DB,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) },
    ADMIN_ON_MAIN_HOST: '1',
    AUTH_PEPPER: rnd(),
    FIELD_KEY: rnd(),
    LOOKUP_KEY: rnd(),
    CAFE_HUB: {
      idFromName: (/** @type {string} */ n) => n,
      get: (/** @type {unknown} */ id) => ({
        fetch: async (/** @type {string | Request} */ input, /** @type {RequestInit} */ init) => {
          const r = input instanceof Request ? input : new Request(input, init);
          hubCalls.push({
            cafe: id,
            url: r.url,
            body: r.method === 'POST' ? await r.text() : '',
            upgrade: r.headers.get('upgrade'),
          });
          return Response.json(
            new URL(r.url).pathname === '/presence' ? { devices: 2, lastSeen: null } : { ok: true },
          );
        },
      }),
    },
  });
  /** @param {string} p @param {any} [body] @param {Record<string, string>} [extra] */
  const call = async (p, body, extra = {}) => {
    /** @type {Record<string, string>} */
    const headers = {
      ...(body ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
      ...extra,
    };
    const res = await worker.fetch(
      new Request(ORIGIN + p, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
      { waitUntil() {} },
    );
    return { status: res.status, data: /** @type {any} */ (await res.json().catch(() => null)) };
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
    return (
      /** @type {string} */ p,
      /** @type {any} */ body = undefined,
      /** @type {Record<string, string>} */ extra = {},
    ) => call(p, body, { cookie, ...extra });
  }
  return { DB, env, call, person, hubCalls };
}

test('a staff device joins its café’s hub; strangers and other sites do not', async () => {
  const s = await setup();
  const sami = await s.person('sami');
  const ws = { upgrade: 'websocket', connection: 'Upgrade' };
  assert.equal((await s.call('/admin/api/live?cafe=demo', undefined, ws)).status, 401);
  assert.equal(
    (await sami('/admin/api/live?cafe=demo', undefined, { ...ws, origin: 'https://evil.example' }))
      .status,
    403,
  );
  assert.equal((await sami('/admin/api/live?cafe=demo')).status, 426, 'a WebSocket is expected');
  assert.equal((await sami('/admin/api/live?cafe=demo', undefined, ws)).status, 200);
  const joined = s.hubCalls.at(-1);
  assert.equal(joined?.url, 'https://hub/connect');
  assert.equal(joined?.upgrade, 'websocket');
  assert.equal(joined?.cafe, 'cafe-demo', 'one hub per café');

  assert.equal((await sami('/admin/api/live/presence?cafe=demo')).status, 403, 'Staff do not');
  const amel = await s.person('amel');
  assert.deepEqual((await amel('/admin/api/live/presence?cafe=demo')).data, {
    devices: 2,
    lastSeen: null,
  });

  delete s.env.CAFE_HUB;
  assert.equal(
    (await sami('/admin/api/live?cafe=demo', undefined, ws)).status,
    501,
    'no hub: devices poll',
  );
});

test('new orders and status changes reach the hub without personal data; every device sees who took it', async () => {
  const s = await setup();
  const v = await s.DB.prepare(
    "SELECT v.id FROM variants v JOIN items i ON i.id = v.item_id WHERE json_extract(i.name, '$.fr') = 'Express'",
  ).first();
  const res = await handleCreateOrder(
    new Request('https://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        cafe: 'demo',
        clientKey: 'live-test-000000001',
        type: 'takeaway',
        channel: 'whatsapp_handoff',
        lines: [{ variantId: v?.id, qty: 1 }],
        noticeVersion: 1,
        lang: 'fr',
        customer: { firstName: 'Rim', phone: '22 333 444' },
        consents: { orderUpdates: true },
      }),
    }),
    s.env,
    OPEN,
  );
  assert.equal(res.status, 201);
  const order = /** @type {any} */ (await res.json());
  const pushed = s.hubCalls.find((c) => c.url === 'https://hub/notify');
  assert.ok(pushed);
  const event = JSON.parse(pushed.body);
  assert.deepEqual(Object.keys(event).sort(), ['id', 'number', 'type']);
  assert.equal(event.type, 'order');
  assert.doesNotMatch(pushed.body, /Rim|22 333 444|22333444/);

  const sami = await s.person('sami');
  const nour = await s.person('nour');
  const id = order.order?.id ?? order.id;
  const took = await sami('/admin/api/orders/status', { cafe: 'demo', id, status: 'accepted' });
  assert.equal(took.status, 200);
  const status = JSON.parse(String(s.hubCalls.at(-1)?.body));
  assert.deepEqual(status, { type: 'status', id, status: 'accepted', by: 'Sami' });

  // On Nour's device: "Acceptée par Sami" (the order list is today's: move the test order there).
  await s.DB.prepare('UPDATE orders SET day = ?1 WHERE id = ?2')
    .bind(localDayHour(new Date()).day, id)
    .run();
  const seen = (await nour(`/admin/api/orders?cafe=demo`)).data.orders.find(
    (/** @type {any} */ o) => o.id === id,
  );
  assert.equal(seen.status, 'accepted');
  assert.equal(seen.handledBy, 'Sami');

  // A second tap on another device changes nothing and tells no one.
  const before = s.hubCalls.length;
  assert.equal(
    (await nour('/admin/api/orders/status', { cafe: 'demo', id, status: 'accepted' })).status,
    409,
  );
  assert.equal(s.hubCalls.length, before);

  // Pausing reaches the hub too.
  await sami('/admin/api/ordering/pause', { cafe: 'demo', paused: true });
  assert.deepEqual(JSON.parse(String(s.hubCalls.at(-1)?.body)), { type: 'pause', paused: true });

  // Without a hub nothing breaks.
  delete s.env.CAFE_HUB;
  assert.equal(
    (await sami('/admin/api/ordering/pause', { cafe: 'demo', paused: false })).status,
    200,
  );
});

test('the device line comes back by itself, a little later each time, and hands over events', async () => {
  const g = /** @type {any} */ (globalThis);
  const saved = { window: g.window, location: g.location };
  /** @type {{ fn: () => void, ms: number }[]} */
  const timers = [];
  g.window = {
    setTimeout: (/** @type {any} */ fn, /** @type {number} */ ms) => timers.push({ fn, ms }),
    setInterval: () => 1,
  };
  g.location = { protocol: 'https:', host: 'staff.example' };
  try {
    /** @type {any[]} */
    const sockets = [];
    /** @type {any[]} */
    const events = [];
    /** @type {boolean[]} */
    const states = [];
    const live = connectLive('demo', {
      onEvent: (e) => events.push(e),
      onState: (on) => states.push(on),
      socket: (url) => {
        const s = /** @type {any} */ ({ url, send() {}, close() {} });
        sockets.push(s);
        return s;
      },
    });
    assert.equal(sockets[0].url, 'wss://staff.example/admin/api/live?cafe=demo');
    sockets[0].onopen();
    assert.equal(live.connected(), true);
    sockets[0].onmessage({ data: '{"type":"order","id":"o1","number":"A1"}' });
    sockets[0].onmessage({ data: 'pong' });
    assert.deepEqual(events, [{ type: 'order', id: 'o1', number: 'A1' }]);

    // Dropped twice without coming back: 1 s, then 2 s.
    sockets[0].onclose();
    assert.equal(live.connected(), false);
    assert.equal(timers.at(-1)?.ms, 1000);
    timers.at(-1)?.fn();
    sockets[1].onclose();
    assert.equal(timers.at(-1)?.ms, 2000);
    assert.deepEqual(states, [true, false]);

    // Woken (back from sleep): at once.
    live.wake();
    assert.equal(sockets.length, 3);
    live.close();
  } finally {
    g.window = saved.window;
    g.location = saved.location;
  }
});
