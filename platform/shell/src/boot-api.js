// @ts-check
/**
 * GET /api/boot?cafe=<slug>&t=<table>&k=<code>&lang=<lang>&nv=1
 * One call per page view: café, table, pinned release, enabled modules and the menu. The visit
 * is counted here when nv=1 (first visit in this tab), after the answer is sent.
 */
import { json, problem } from './http.js';
import { resolveCafe, menuSnapshot, findTable } from './cafes.js';
import { releaseManifest } from './releases.js';
import { bootBody, tableStatus, enabledModules } from './boot-body.js';
import { countVisit } from './visits.js';

/**
 * @param {Request} request
 * @param {import('./d1.d.js').Env} env
 * @param {import('./d1.d.js').ExecutionContext} ctx
 * @param {Date} [now]
 */
export async function handleBoot(request, env, ctx, now = new Date()) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('cafe') ?? '';
  const label = (url.searchParams.get('t') ?? '').trim().slice(0, 16) || null;
  const code = (url.searchParams.get('k') ?? '').trim().slice(0, 16) || null;
  const lang = url.searchParams.get('lang') ?? '';

  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const [menu, row, manifest] = await Promise.all([
    menuSnapshot(env.DB, cafe.id, cafe.menuRev),
    label ? findTable(env.DB, cafe.id, label) : Promise.resolve(null),
    releaseManifest(env.ASSETS, cafe.pinnedRelease, url.origin),
  ]);
  if (!menu || !manifest) return problem(503, 'not_published');

  const table = tableStatus(row, code);
  if (url.searchParams.get('nv') === '1') {
    ctx.waitUntil(
      countVisit(env.DB, {
        cafeId: cafe.id,
        table: table?.label ?? null,
        lang,
        now,
        timeZone: cafe.config.timeZone,
      }).catch(() => {}),
    );
  }
  return json(
    200,
    bootBody({
      config: cafe.config,
      table,
      menu,
      release: { version: manifest.version, entry: manifest.entry, css: manifest.css },
      modules: enabledModules(cafe.config, manifest.modules),
    }),
  );
}
