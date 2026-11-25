// @ts-check
/**
 * The Worker `digimenu`: platform shell. Static files (boot page, release files) are served by
 * the asset layer without running this code; only `/api/*` reaches it (run_worker_first).
 */
import { json, problem } from './http.js';
import { handleBoot } from './boot-api.js';
import { handleCreateOrder, handleOrderStatus } from './orders-api.js';
import { handleAuth } from './auth.js';
import { handleAdmin } from './admin-api.js';
import { handleModuleRoute } from './module-host.js';
import { resolveCafe } from './cafes.js';

export default {
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
        return await handleAdmin(request, env, route);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('request failed', url.pathname, err instanceof Error ? err.message : err);
      return problem(500, 'server_error');
    }
  },
};
