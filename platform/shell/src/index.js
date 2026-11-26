// @ts-check
/**
 * The Worker `digimenu`: platform shell. Static files (boot page, release files) are served by
 * the asset layer without running this code; only `/api/*` reaches it (run_worker_first).
 */
import { json, problem } from './http.js';
import { handleBoot } from './boot-api.js';
import { handleCreateOrder, handleOrderStatus } from './orders-api.js';
import { handleAuth } from './auth.js';
import { handleAdmin, handleCafeList } from './admin-api.js';
import { handleCustomers } from './customers-api.js';
import { handleTeam } from './team-api.js';
import { handleVisits } from './visits-api.js';
import { handleModules } from './modules-api.js';
import { handleInfo } from './info-api.js';
import { handleMenu } from './menu-api.js';
import { liveRoute } from './cafe-hub.js';
import { handleReleases } from './releases-api.js';

// The café hub is a Durable Object class: the runtime finds it among the Worker's exports.
export { CafeHub } from './cafe-hub.js';
import { handleModuleRoute } from './module-host.js';
import { resolveCafe } from './cafes.js';
import { runRetention } from './retention.js';

export default {
  /**
   * Nightly jobs (cron trigger in wrangler.template.jsonc): the retention rule (D-067).
   * @param {{ scheduledTime: number, cron: string }} event
   * @param {import('./d1.d.js').Env} env
   * @param {import('./d1.d.js').ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runRetention(env, { now: new Date(event.scheduledTime) }).then((r) => {
        if (r.deleted || r.failed)
          console.log(`retention: ${r.deleted} deleted, ${r.failed} failed`);
      }),
    );
  },

  /**
   * @param {Request} request
   * @param {import('./d1.d.js').Env} env
   * @param {import('./d1.d.js').ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/boot') {
        if (request.method !== 'GET') return problem(405, 'method_not_allowed');
        return await handleBoot(request, env, ctx);
      }
      if (url.pathname === '/api/orders') {
        if (request.method !== 'POST') return problem(405, 'method_not_allowed');
        return await handleCreateOrder(request, env);
      }
      if (url.pathname === '/api/orders/status') {
        if (request.method !== 'GET') return problem(405, 'method_not_allowed');
        return await handleOrderStatus(request, env);
      }
      if (url.pathname === '/api/health') {
        return json(200, { ok: true, environment: env.ENVIRONMENT ?? 'unknown' });
      }
      // Customer calls of the modules a café switched on (module-host.js).
      if (url.pathname.startsWith('/api/m/')) {
        return await handleModuleRoute(
          request,
          env,
          url.pathname.slice('/api/m/'.length),
          resolveCafe,
        );
      }
      if (url.pathname.startsWith('/api/')) return problem(404, 'not_found');
      // Staff app API: only on the admin host (ADR-0004), or on the one preview host when
      // ADMIN_ON_MAIN_HOST is "1" (workers.dev has a single host).
      if (url.pathname.startsWith('/admin/api/')) {
        const adminHost = env.ADMIN_HOST
          ? url.hostname === env.ADMIN_HOST
          : env.ADMIN_ON_MAIN_HOST === '1';
        if (!adminHost) return problem(404, 'not_found');
        const route = url.pathname.slice('/admin/api/'.length);
        if (route.startsWith('auth/'))
          return await handleAuth(request, env, route.slice('auth/'.length));
        if (route === 'cafes' && request.method === 'GET')
          return await handleCafeList(request, env);
        if (route === 'customers' || route.startsWith('customers/'))
          return await handleCustomers(request, env, route);
        if (route === 'team' || route.startsWith('team/'))
          return await handleTeam(request, env, route);
        if (route === 'visits' || route === 'visits/export')
          return await handleVisits(request, env, route);
        if (route === 'modules' || route.startsWith('modules/'))
          return await handleModules(request, env, route);
        if (route === 'info' || route === 'info/restore')
          return await handleInfo(request, env, route);
        if (route === 'menu/edit' || route === 'menu/versions' || route === 'menu/restore')
          return await handleMenu(request, env, route);
        if (route === 'live' || route === 'live/presence')
          return await liveRoute(request, env, route);
        if (route === 'releases' || route === 'releases/pin')
          return await handleReleases(request, env, route);
        return await handleAdmin(request, env, route);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('request failed', url.pathname, err instanceof Error ? err.message : err);
      return problem(500, 'server_error');
    }
  },
};
