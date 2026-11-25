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
 * A switched-off module has no hooks and its routes answer 404 for that café (MOD-03).
 */
import { SERVER_MODULES } from './server-modules.js';
import { json, problem } from './http.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { sha256 } from './auth.js';
import { loadKeys, seal, open, lookupHash } from './crypto.js';
import { normalizePhone } from '../../../core/phone.js';

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
 * @property {(message: string, err?: unknown) => void} log
 * @property {(action: string, target: string, actor: { userId: string, role: string }) => Promise<void>} audit
 *   a line in the audit log (category = the module key)
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
 * @property {(api: ServerApi, event: StoredOrderEvent) => Promise<unknown>} [afterStore]
 * @property {(api: ServerApi, event: StatusEvent) => Promise<void>} [statusChanged]
 * @property {Record<string, (api: ServerApi, body: any) => Promise<RouteAnswer>>} [routes]
 * @property {{ roles: Record<string, string[]>,
 *   routes: Record<string, (api: ServerApi, body: any, actor: { userId: string, role: string }) => Promise<RouteAnswer>> }} [staff]
 */

/** @typedef {import('./d1.d.js').Env & { FIELD_KEY?: string, LOOKUP_KEY?: string }} HostEnv */

/**
 * The enabled modules of a café that have server code.
 * @param {any} config
 * @param {Record<string, ServerModule>} [registry]
 * @returns {[string, ServerModule][]}
 */
export function serverModules(config, registry = SERVER_MODULES) {
  return Object.entries(registry).filter(([key]) => config?.modules?.[key]?.enabled === true);
}

/**
 * @param {HostEnv} env
 * @param {Cafe} cafe
 * @param {string} key
 * @param {Date} now
 * @returns {Promise<ServerApi>}
 */
export async function serverApi(env, cafe, key, now) {
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
          cafe.id,
          target,
          actor.userId,
          actor.role,
          isoNow(now),
        )
        .run();
    },
  };
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
      const answer = await mod.afterStore(await serverApi(env, cafe, key, now), {
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
      await mod.statusChanged(await serverApi(env, cafe, key, now), event);
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
  const answer = await handler(await serverApi(env, cafe, key, now), body);
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
  const answer = await handler(await serverApi(env, cafe, key, now), body ?? {}, actor);
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
