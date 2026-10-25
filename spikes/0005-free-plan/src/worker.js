/**
 * Spike Worker for issue #5: does the chosen design fit Cloudflare's free plan?
 *
 * Routes (the café is always the fictional demo café, D-022):
 *   /<café>/t/<table>          static table page (public/index.html), served WITHOUT running
 *                              this Worker: see `assets` in wrangler.template.jsonc
 *   /ssr/<café>/t/<table>      the same menu rendered here at the edge (CPU measurement)
 *   /api/<café>/menu           menu as JSON, read from D1
 *   /api/<café>/hub            WebSocket to the café hub (Durable Object)
 *   /api/<café>/hub/push       POST: push a text to every connected device
 *   /api/<café>/hub/stats      how many sockets, how many times the hub woke up
 *   /api/spike/ping            does nothing (baseline CPU)
 *   /api/spike/db              POST: one write + one read in D1
 *   /api/spike/hash?iter=N     one password hash at N iterations (ADR-0006)
 *   /api/spike/aes?n=N         N AES-GCM record encryptions (ADR-0010)
 */
import { encryptRecords, hashPassword, MAX_ITERATIONS } from './bench.js';
import { renderPage } from '../public/render.js';

export { CafeHub } from './hub.js';

/**
 * @typedef {object} Env
 * @property {D1Database} DB
 * @property {DurableObjectNamespace} CAFE_HUB
 * @property {Fetcher} ASSETS
 * @property {string} SPIKE_PEPPER   a test value written in the config, NOT a secret
 */

const CAFE = '[a-z0-9-]{1,40}';
const TABLE = '[A-Za-z0-9-]{1,10}';
const TABLE_PAGE = new RegExp(`^/(${CAFE})/t/(${TABLE})/?$`);
const SSR_PAGE = new RegExp(`^/ssr/(${CAFE})/t/(${TABLE})/?$`);
const CAFE_API = new RegExp(`^/api/(${CAFE})/(menu|hub|hub/push|hub/stats)$`);

/** Fixed AES key for the spike only: it encrypts made-up records, never real data. */
const SPIKE_AES_KEY = new Uint8Array(32).fill(7);

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * @param {unknown} body
 * @param {number} [status]
 */
function json(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Reads a whole-number query parameter within limits.
 * @param {URL} url
 * @param {string} name
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function intParam(url, name, min, max) {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * Loads one café and its menu, sorted for rendering.
 * @param {Env} env
 * @param {string} slug
 */
async function loadMenu(env, slug) {
  const [cafeRows, itemRows] = await env.DB.batch([
    env.DB.prepare('SELECT slug, name FROM spike_cafes WHERE slug = ?').bind(slug),
    env.DB.prepare(
      `SELECT id, category, name_fr AS nameFr, name_ar AS nameAr, name_en AS nameEn,
              desc_fr AS descFr, desc_ar AS descAr, desc_en AS descEn,
              price_millimes AS priceMillimes
         FROM spike_menu_items WHERE cafe = ? ORDER BY category_position, position`,
    ).bind(slug),
  ]);
  const cafe = /** @type {{ slug: string, name: string } | undefined} */ (cafeRows.results[0]);
  if (!cafe) return null;
  return {
    cafe,
    items: /** @type {import('../public/render.js').MenuItem[]} */ (itemRows.results),
  };
}

/**
 * @param {string} value
 * @returns {import('../public/render.js').Lang}
 */
function asLang(value) {
  return value === 'ar' || value === 'en' ? value : 'fr';
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/spike/ping') return json({ ok: true });

    if (path === '/api/spike/db' && request.method === 'POST') {
      const [, countRows] = await env.DB.batch([
        env.DB.prepare('INSERT INTO spike_hits (at) VALUES (?)').bind(Date.now()),
        env.DB.prepare('SELECT COUNT(*) AS n FROM spike_hits'),
      ]);
      return json({ written: 1, total: Number(/** @type {any} */ (countRows.results[0]).n) });
    }

    if (path === '/api/spike/hash') {
      const iterations = intParam(url, 'iter', 1, MAX_ITERATIONS);
      if (iterations === null) return json({ error: `iter must be 1..${MAX_ITERATIONS}` }, 400);
      const hash = await hashPassword('correct horse battery staple', {
        iterations,
        salt: crypto.getRandomValues(new Uint8Array(16)),
        pepper: env.SPIKE_PEPPER,
      });
      return json({ iterations, format: hash.split('$')[0], length: hash.length });
    }

    if (path === '/api/spike/aes') {
      const count = intParam(url, 'n', 0, 2000);
      if (count === null) return json({ error: 'n must be 0..2000' }, 400);
      return json(await encryptRecords(count, SPIKE_AES_KEY));
    }

    const api = CAFE_API.exec(path);
    if (api) {
      const [, slug, action] = api;
      if (action === 'menu') {
        const menu = await loadMenu(env, slug);
        return menu ? json(menu) : json({ error: 'unknown café' }, 404);
      }
      // Everything under /hub goes to this café's own Durable Object.
      const hub = env.CAFE_HUB.get(env.CAFE_HUB.idFromName(slug));
      return hub.fetch(request);
    }

    const ssr = SSR_PAGE.exec(path);
    if (ssr) {
      const [, slug, table] = ssr;
      const menu = await loadMenu(env, slug);
      if (!menu) return new Response('Unknown café', { status: 404 });
      const html = renderPage(menu.items, {
        cafeName: menu.cafe.name,
        table,
        lang: asLang(url.searchParams.get('lang') ?? 'fr'),
      });
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE },
      });
    }

    // A browser opening a table link never reaches this line: navigation requests get
    // index.html from the asset layer directly. Other clients (no Sec-Fetch-Mode header) land
    // here, and get the same file.
    if (TABLE_PAGE.test(path)) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    return new Response('Not found', { status: 404 });
  },
};
