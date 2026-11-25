// @ts-check
/**
 * Server side of modules (docs/architecture/modules.md): the hooks and routes of the modules a
 * café switched on. A module's `server.js` gets everything it may use in `api` (scoped to one
 * café and one module) and imports nothing from the platform.
 *
 *   order.afterStore     after an order is stored, and again when the phone retries the same
 *                        order (so it must be idempotent). Its answer reaches the phone in
 *                        `order.modules.<key>`. Fail-open: a module that throws is logged and
 *                        the order stands.
 *   order.statusChanged  after staff change an order's status. Fail-open.
 *   routes               POST /api/m/<key>/<route>: customer calls, JSON, no cookies.
 *   staff.routes         POST /admin/api/m/<key>/<route>: signed-in staff, roles checked here.
 *
 * A switched-off module has no hooks and its routes answer 404 for that café (MOD-03). So does
 * a module switched on without a setting it needs (manifest `settings.needs`, module-needs.js).
 */
import { SERVER_MODULES } from './server-modules.js';
import { json, problem } from './http.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { sha256 } from './auth.js';
import { loadKeys, seal, open, lookupHash } from './crypto.js';
import { normalizePhone } from '../../../core/phone.js';
import { encodeQr } from '../../../core/qr.js';
import { localDayHour } from './clock.js';
import { missingNeeds } from './module-needs.js';

/** @typedef {{ id: string, slug: string, status: string, config: any }} Cafe */

/**
 * What a module's server code receives.
 * @typedef {object} ServerApi
 * @property {string} key
 * @property {Cafe} cafe
 * @property {any} settings      the café's settings for this module (frozen)
 * @property {import('./d1.d.js').D1Database} db   only the module's own tables and the
 *   customer fields its manifest declares (checked in review and by the contract test)
 * @property {Date} now
 * @property {() => string} id   a new sortable id
 * @property {(d?: Date) => string} iso   an ISO time without milliseconds
 * @property {(text: string) => Promise<string>} sha256
 * @property {{ seal: (v: unknown) => Promise<string>, open: (ct: string) => Promise<any>,
 *   lookup: (v: string) => Promise<string> } | null} crypto   customer-data keys; null if not set
 * @property {(input: string) => string | null} normalizePhone   "+216XXXXXXXX" or null
 * @property {(text: string) => string[]} qr   a QR code's rows ("1" dark, "0" light), error correction M
 * @property {(message: string, err?: unknown) => void} log
 * @property {(action: string, target: string, actor: { userId: string, role: string }) => Promise<void>} audit
 *   a line in the audit log (category = the module key)
 * @property {(event: string) => Promise<void>} count
 *   adds one to the café's counter "<module>.<event>" for this hour (counts only, no
 *   dimension that could point to a person). Only events the manifest lists in
 *   `analyticsEvents`; any other throws.
 * @property {(clientKey: string) => Promise<{ number: string, status: string, test: boolean } | null>} orderStatus
 *   number and status of this café's order sent with that client key (the phone's own key),
 *   and whether it is a test order; null if there is none. Never its lines, total or customer.
 */

/**
 * @typedef {object} StoredOrderEvent
 * @property {{ id: string, number: string, status: string, type: string, total: number,
 *   customerId: string | null, isNew: boolean }} order
 * @property {Record<string, unknown>} consents   what the customer chose at checkout
 * @property {unknown} input    what the module's checkout fields sent (`modules.<key>`)
 */

/**
 * @typedef {object} StatusEvent
 * @property {{ id: string, total: number, customerId: string | null }} order
 * @property {string} from
 * @property {string} to
 * @property {{ userId: string, role: string }} actor
 */

/** @typedef {{ status: number, body: unknown }} RouteAnswer */

/**
 * @typedef {object} ServerModule
 * @property {string[]} [needs]    from the manifest (settings.needs), added by the registry tool
 * @property {string[]} [events]   from the manifest (analyticsEvents), added by the registry tool
 * @property {(api: ServerApi, event: StoredOrderEvent) => Promise<unknown>} [afterStore]
 * @property {(api: ServerApi, event: StatusEvent) => Promise<void>} [statusChanged]
 * @property {Record<string, (api: ServerApi, body: any) => Promise<RouteAnswer>>} [routes]
 * @property {{ roles: Record<string, string[]>,
 *   routes: Record<string, (api: ServerApi, body: any, actor: { userId: string, role: string }) => Promise<RouteAnswer>> }} [staff]
 * @property {{ export: (api: ServerApi, c: { customerId: string }) => Promise<unknown>,
 *   erase: (api: ServerApi, c: { customerId: string }) => Promise<number> }} [customer]
 *   customer records (ADR-0010): what the module keeps about a customer, in an export, and
 *   erasing it on a deletion request. Runs for every module with server code, switched on or
 *   not, since data is kept when a module is switched off. `api.cafe` is empty here.
 */

/** @typedef {import('./d1.d.js').Env & { FIELD_KEY?: string, LOOKUP_KEY?: string }} HostEnv */

/**
 * The enabled modules of a café that have server code.
 * @param {any} config
 * @param {Record<string, ServerModule>} [registry]
 * @returns {[string, ServerModule][]}
 */
export function serverModules(config, registry = SERVER_MODULES) {
  return Object.entries(registry).filter(
    ([key, mod]) =>
      config?.modules?.[key]?.enabled === true &&
      missingNeeds(config.modules[key].settings, mod.needs).length === 0,
  );
}

const CLIENT_KEY = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * @param {HostEnv} env
 * @param {Cafe} cafe
 * @param {string} key
 * @param {Date} now
 * @param {readonly string[]} [events]   the module's analytics events (manifest)
 * @returns {Promise<ServerApi>}
 */
export async function serverApi(env, cafe, key, now, events = []) {
  const keys = await loadKeys(env);
  return {
    key,
    cafe: { id: cafe.id, slug: cafe.slug, status: cafe.status, config: cafe.config },
    settings: Object.freeze({ ...(cafe.config?.modules?.[key]?.settings ?? {}) }),
    db: env.DB,
    now,
    id: () => ulid(now.getTime()),
    iso: (d = now) => isoNow(d),
    sha256,
    crypto: keys
      ? {
          seal: (v) => seal(keys, v),
          open: (ct) => open(keys, ct),
          lookup: (v) => lookupHash(keys, v),
        }
      : null,
    normalizePhone,
    qr: (text) => encodeQr(text).rows,
    log: (message, err) =>
      console.error(`module ${key}: ${message}`, err instanceof Error ? err.message : (err ?? '')),
    audit: async (action, target, actor) => {
      await env.DB.prepare(
        `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
        .bind(
          ulid(now.getTime()),
          key,
          action,
          cafe.id || null,
          target,
          actor.userId,
          actor.role,
          isoNow(now),
        )
        .run();
    },
    count: async (event) => {
      if (!events.includes(event)) throw new Error(`analytics event not declared: ${event}`);
      if (!cafe.id) return;
      const { day, hour } = localDayHour(now, cafe.config?.timeZone);
      await env.DB.prepare(
        `INSERT INTO analytics_counters (cafe_id, day, hour, metric, dim, value)
         VALUES (?1, ?2, ?3, ?4, '', 1)
         ON CONFLICT (cafe_id, day, hour, metric, dim) DO UPDATE SET value = value + 1`,
      )
        .bind(cafe.id, day, hour, `${key}.${event}`)
        .run();
    },
    orderStatus: async (clientKey) => {
      if (!cafe.id || !CLIENT_KEY.test(String(clientKey))) return null;
      const row = await env.DB.prepare(
        'SELECT number, status, is_test FROM orders WHERE cafe_id = ?1 AND client_key = ?2',
      )
        .bind(cafe.id, String(clientKey))
        .first();
      return row
        ? { number: String(row.number), status: String(row.status), test: Boolean(row.is_test) }
        : null;
    },
  };
}

/** No café: the customer-record hooks work across cafés. */
const NO_CAFE = { id: '', slug: '', status: '', config: {} };

/**
 * What each module keeps about a customer, for an export (ADR-0010 §7).
 * @param {HostEnv} env
 * @param {string} customerId
 * @param {Date} now
 * @param {Record<string, ServerModule>} [registry]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runCustomerExport(env, customerId, now, registry = SERVER_MODULES) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, mod] of Object.entries(registry)) {
    if (!mod.customer) continue;
    out[key] = await mod.customer.export(await serverApi(env, NO_CAFE, key, now), { customerId });
  }
  return out;
}

/**
 * Erases what each module keeps about a customer. Fail-closed: an error stops the deletion,
 * so nothing is left half-deleted without the Admin knowing.
 * @param {HostEnv} env
 * @param {string} customerId
 * @param {Date} now
 * @param {Record<string, ServerModule>} [registry]
 * @returns {Promise<Record<string, number>>}  rows removed per module
 */
export async function runCustomerErase(env, customerId, now, registry = SERVER_MODULES) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, mod] of Object.entries(registry)) {
    if (!mod.customer) continue;
    out[key] = await mod.customer.erase(await serverApi(env, NO_CAFE, key, now), { customerId });
  }
  return out;
}

/**
 * Runs `afterStore` of every enabled module. Never throws.
 * @param {HostEnv} env
 * @param {Cafe} cafe
 * @param {Omit<StoredOrderEvent, 'input'> & { inputs: Record<string, unknown> }} event
 * @param {Date} now
 * @param {Record<string, ServerModule>} [registry]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runAfterStore(env, cafe, event, now, registry = SERVER_MODULES) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, mod] of serverModules(cafe.config, registry)) {
    if (!mod.afterStore) continue;
    try {
      const answer = await mod.afterStore(await serverApi(env, cafe, key, now, mod.events), {
        order: event.order,
        consents: event.consents,
        input: event.inputs?.[key] ?? null,
      });
      if (answer !== undefined && answer !== null) out[key] = answer;
    } catch (err) {
      console.error(`module ${key}: afterStore failed`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/**
 * Runs `statusChanged` of every enabled module. Never throws.
 * @param {HostEnv} env
 * @param {Cafe} cafe
 * @param {StatusEvent} event
 * @param {Date} now
 * @param {Record<string, ServerModule>} [registry]
 */
export async function runStatusChanged(env, cafe, event, now, registry = SERVER_MODULES) {
  for (const [key, mod] of serverModules(cafe.config, registry)) {
    if (!mod.statusChanged) continue;
    try {
      await mod.statusChanged(await serverApi(env, cafe, key, now, mod.events), event);
    } catch (err) {
      console.error(
        `module ${key}: statusChanged failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

const ROUTE = /^[a-z][a-z0-9-]{0,30}$/;

/**
 * POST /api/m/<key>/<route> { cafe, ... }
 * @param {Request} request
 * @param {HostEnv} env
 * @param {string} path   "<key>/<route>"
 * @param {(db: any, slug: string, now: number) => Promise<Cafe | null>} resolveCafe
 * @param {Date} [now]
 * @param {Record<string, ServerModule>} [registry]
 */
export async function handleModuleRoute(
  request,
  env,
  path,
  resolveCafe,
  now = new Date(),
  registry = SERVER_MODULES,
) {
  if (request.method !== 'POST') return problem(405, 'method_not_allowed');
  const [key, route, ...rest] = path.split('/');
  if (rest.length || !ROUTE.test(route ?? '')) return problem(404, 'not_found');
  const body = await readJson(request);
  if (!body) return problem(400, 'bad_request');
  const cafe = await resolveCafe(env.DB, String(body.cafe ?? ''), now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const mod = serverModules(cafe.config, registry).find(([k]) => k === key)?.[1];
  const handler = mod?.routes && Object.hasOwn(mod.routes, route) ? mod.routes[route] : null;
  if (!handler) return problem(404, 'not_found');
  const answer = await handler(await serverApi(env, cafe, key, now, mod?.events), body);
  return json(answer.status, answer.body);
}

/**
 * POST /admin/api/m/<key>/<route>, after sign-in, origin and café role checks (admin-api.js).
 * @param {HostEnv} env
 * @param {Cafe} cafe
 * @param {string} path
 * @param {any} body
 * @param {{ userId: string, role: string }} actor
 * @param {Date} now
 * @param {Record<string, ServerModule>} [registry]
 */
export async function handleStaffModuleRoute(
  env,
  cafe,
  path,
  body,
  actor,
  now,
  registry = SERVER_MODULES,
) {
  const [key, route, ...rest] = path.split('/');
  if (rest.length || !ROUTE.test(route ?? '')) return problem(404, 'not_found');
  const mod = serverModules(cafe.config, registry).find(([k]) => k === key)?.[1];
  const staff = mod?.staff;
  const handler = staff && Object.hasOwn(staff.routes, route) ? staff.routes[route] : null;
  if (!staff || !handler) return problem(404, 'not_found');
  const roles = staff.roles[route] ?? ['manager', 'admin'];
  if (!roles.includes(actor.role)) return problem(403, 'forbidden');
  const answer = await handler(
    await serverApi(env, cafe, key, now, mod?.events),
    body ?? {},
    actor,
  );
  return json(answer.status, answer.body);
}

/** @param {Request} request */
async function readJson(request) {
  try {
    const text = await request.text();
    if (text.length > 4096) return null;
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
