// @ts-check
/**
 * The café hub (issue #16, US-45, ADR-0007, architecture overview): one Durable Object per café
 * that keeps the staff devices connected over hibernating WebSockets and pushes them a short
 * message when something happens (a new order, a status change, a pause). Devices then fetch
 * the orders as usual. Pushes cost no request; a sleeping hub costs nothing (spike 0005: two
 * sockets kept through hibernation on the free plan).
 *
 *   GET  /connect     (WebSocket)  a signed-in staff device; the Worker checked who it is
 *   POST /notify      { type, ... }  sent to every device of the café
 *   GET  /presence    { devices, lastSeen }  how many devices are connected, and since when none
 *
 * Messages carry no personal data: an order's id and number, a status, a staff first name.
 * "ping" is answered "pong" without waking the hub (auto-response), so devices can keep their
 * connection alive cheaply.
 *
 * Worker side: `notifyHub` (never fails an order), `liveRoute` (signs the device in to the hub).
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn } from './auth.js';
import { resolveCafe } from './cafes.js';

/**
 * @typedef {object} HubState   what the runtime gives a Durable Object (the parts used here)
 * @property {(ws: WebSocket, tags?: string[]) => void} acceptWebSocket
 * @property {() => WebSocket[]} getWebSockets
 * @property {(pair: unknown) => void} [setWebSocketAutoResponse]
 * @property {{ get: (k: string) => Promise<any>, put: (k: string, v: any) => Promise<void> }} storage
 */

export class CafeHub {
  /** @param {HubState} ctx @param {unknown} env */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    const Pair = /** @type {any} */ (globalThis).WebSocketRequestResponsePair;
    if (typeof Pair === 'function' && ctx.setWebSocketAutoResponse)
      ctx.setWebSocketAutoResponse(new Pair('ping', 'pong'));
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/connect') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
        return new Response('expected a WebSocket', { status: 426 });
      const WSPair = /** @type {any} */ (globalThis).WebSocketPair;
      const [client, server] = Object.values(new WSPair());
      this.ctx.acceptWebSocket(server);
      await this.seen();
      // `webSocket` is the Workers runtime's own Response option.
      return new Response(null, /** @type {ResponseInit} */ ({ status: 101, webSocket: client }));
    }
    if (url.pathname === '/notify' && request.method === 'POST') {
      const text = (await request.text()).slice(0, 1000);
      let sent = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(text);
          sent += 1;
        } catch {
          /* a socket closing: it reconnects and fetches */
        }
      }
      return json(200, { sent });
    }
    if (url.pathname === '/presence') {
      const devices = this.ctx.getWebSockets().length;
      if (devices) await this.seen();
      return json(200, { devices, lastSeen: (await this.ctx.storage.get('lastSeen')) ?? null });
    }
    return new Response('not found', { status: 404 });
  }

  /** A device was connected until now. */
  async seen() {
    await this.ctx.storage.put('lastSeen', new Date().toISOString());
  }

  /** @param {WebSocket} ws @param {string | ArrayBuffer} message */
  async webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  /** @param {WebSocket} ws @param {number} code @param {string} reason */
  async webSocketClose(ws, code, reason) {
    await this.seen();
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  async webSocketError() {
    await this.seen();
  }
}

/**
 * @typedef {{ CAFE_HUB?: { idFromName: (n: string) => unknown,
 *   get: (id: unknown) => { fetch: (input: string | Request, init?: RequestInit) => Promise<Response> } } }} HubEnv
 */

/**
 * The hub of a café, or null where there is none (local dev server, tests).
 * @param {object} env   the Worker's env, with or without CAFE_HUB
 * @param {string} cafeId
 */
export function hubOf(env, cafeId) {
  const ns = /** @type {HubEnv} */ (env).CAFE_HUB;
  return ns ? ns.get(ns.idFromName(cafeId)) : null;
}

/**
 * Tells the café's staff devices that something changed. Never throws: an order is stored
 * whether or not a device hears about it (devices also check every minute).
 * @param {object} env
 * @param {string} cafeId
 * @param {{ type: 'order' | 'status' | 'pause', [k: string]: unknown }} event
 */
export async function notifyHub(env, cafeId, event) {
  const hub = hubOf(env, cafeId);
  if (!hub) return;
  try {
    await hub.fetch('https://hub/notify', { method: 'POST', body: JSON.stringify(event) });
  } catch (err) {
    console.error('café hub not reached', err);
  }
}

const LIVE = ['staff', 'manager', 'admin', 'maintainer'];

/**
 *   GET /admin/api/live?cafe=<slug>            (WebSocket) a staff device joins its café's hub
 *   GET /admin/api/live/presence?cafe=<slug>   Manager, Admin: devices connected now, last seen
 * @param {Request} request
 * @param {import('./auth.js').AuthEnv} env
 * @param {string} route
 * @param {Date} [now]
 */
export async function liveRoute(request, env, route, now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'method_not_allowed');
  const url = new URL(request.url);
  // A WebSocket from another site must not ride on a staff cookie.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return problem(403, 'forbidden');
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const cafe = await resolveCafe(env.DB, url.searchParams.get('cafe') ?? '', now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !LIVE.includes(role)) return problem(403, 'forbidden');
  const hub = hubOf(env, cafe.id);
  if (!hub) return problem(501, 'no_hub');
  if (route === 'live/presence') {
    if (!['manager', 'admin'].includes(role)) return problem(403, 'forbidden');
    return hub.fetch('https://hub/presence');
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return problem(426, 'websocket_expected');
  return hub.fetch(new Request('https://hub/connect', request));
}
