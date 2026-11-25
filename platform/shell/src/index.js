// @ts-check
/**
 * The Worker `digimenu`: platform shell. Static files (boot page, release files) are served by
 * the asset layer without running this code; only `/api/*` reaches it (run_worker_first).
 */
import { json, problem } from './http.js';
import { handleBoot } from './boot-api.js';

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
      if (url.pathname === '/api/health') {
        return json(200, { ok: true, environment: env.ENVIRONMENT ?? 'unknown' });
      }
      if (url.pathname.startsWith('/api/')) return problem(404, 'not_found');
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('request failed', url.pathname, err instanceof Error ? err.message : err);
      return problem(500, 'server_error');
    }
  },
};
