// @ts-check
/**
 * Each café's release, and moving it (issue #24, MOD-07, MOD-08, MOD-09, D-021,
 * docs/architecture/releases.md).
 *
 *   GET  /admin/api/releases?cafe=<slug>                    Manager (to see), Maintainer, Admin
 *   POST /admin/api/releases/pin  { cafe, version, reason }  see "Who may move a café"
 *
 * The pin is data (`cafes.pinned_release`); every move is a row in `release_pins` (from, to,
 * who, why, the configuration version at that moment) and a line in the audit log. Moving a café
 * changes no menu, configuration, order or customer record. Customers get the other release on
 * their next page load: this Worker at once, the others within 30 s (cafes.js).
 *
 * Who may move a café (releases.md, "Who can do what"):
 * - **Admin** (Ahmed): to any release of the window, forward or back.
 * - **Maintainer** (trained youth): only **back to the release the café ran before**, when it is
 *   older and still in the window: the 15-minute rollback.
 * - Manager sees the card; Staff do not. Nobody publishes a release from here: a release
 *   reaches the window only through the deploy, which Ahmed approves (D-021).
 *
 * Pre-flight, before every move (`preflight`): the target release is on the site with this
 * platform; the database has the migrations it was built against; it reads the café's
 * configuration and menu snapshot formats; it has the customer code of every module the café
 * has switched on, in the same settings format. Configuration formats are the same in every
 * release so far (0), so no configuration migration exists yet: a release that needs one is
 * refused ("config_format") until a MAJOR release brings its migration.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin } from './auth.js';
import { resolveCafe, forgetCafe } from './cafes.js';
import { releaseManifest, compareVersions, isVersion, LEGACY } from './releases.js';
import { MODULE_CATALOG } from './module-catalog.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';

/** @typedef {import('./releases.js').ReleaseManifest} ReleaseManifest */
/** @typedef {import('./auth.js').AuthEnv & { ASSETS: { fetch: (r: Request) => Promise<Response> } }} ReleasesEnv */
/** @typedef {{ code: string, [k: string]: unknown }} Problem */

const SEE = ['manager', 'maintainer', 'admin'];
const HISTORY = 20;

/**
 * Whether a café can run on a release. Roles are checked by the caller.
 * @param {{ target: ReleaseManifest | null, current: ReleaseManifest | null, config: any,
 *   configSchema: number, snapshotSchema: number | null, dataSchema: number,
 *   catalog?: Record<string, { client: boolean }> }} o
 * @returns {Problem[]} empty when the café can move
 */
export function preflight(o) {
  const t = o.target;
  if (!t) return [{ code: 'not_in_site' }];
  /** @type {Problem[]} */
  const problems = [];
  const needs = t.dataSchema ?? LEGACY.dataSchema;
  if (o.dataSchema < needs) problems.push({ code: 'data_schema', needs, has: o.dataSchema });
  const reads = t.reads ?? LEGACY.reads;
  if (!reads.config.includes(o.configSchema))
    problems.push({ code: 'config_format', has: o.configSchema, reads: reads.config });
  if (o.snapshotSchema !== null && !reads.snapshot.includes(o.snapshotSchema))
    problems.push({ code: 'snapshot_format', has: o.snapshotSchema, reads: reads.snapshot });
  const catalog = o.catalog ?? MODULE_CATALOG;
  const on = Object.entries(o.config?.modules ?? {})
    .filter(([, m]) => m?.enabled === true)
    .map(([k]) => k)
    .filter((k) => Object.hasOwn(catalog, k) && catalog[k].client)
    .sort();
  const missing = on.filter((k) => !t.modules?.[k]);
  if (missing.length) problems.push({ code: 'module_missing', modules: missing });
  const changed = on.filter((k) => {
    const a = o.current?.modules?.[k]?.settingsVersion;
    const b = t.modules?.[k]?.settingsVersion;
    return a !== undefined && b !== undefined && a !== b;
  });
  if (changed.length) problems.push({ code: 'settings_format', modules: changed });
  return problems;
}

/**
 * Whether this role may move the café from `current` to `target`.
 * @param {string} role
 * @param {string} target
 * @param {string} current
 * @param {string | null} previous   the release the café ran before its last move
 * @returns {'forward' | 'back' | null}   null: not allowed
 */
export function mayPin(role, target, current, previous) {
  if (target === current) return null;
  // The local dev server's release is called "dev": only Admin moves away from it.
  if (!isVersion(current)) return role === 'admin' ? 'forward' : null;
  const direction = compareVersions(target, current) < 0 ? 'back' : 'forward';
  if (role === 'admin') return direction;
  if (role === 'maintainer' && direction === 'back' && target === previous) return 'back';
  return null;
}

/**
 * The café as it is in the database now (not the 30-second cache: a move must start from the
 * real pin).
 * @param {ReleasesEnv} env
 * @param {string} cafeId
 */
async function cafeState(env, cafeId) {
  const row = await env.DB.prepare(
    `SELECT c.pinned_release, c.active_config_version, v.schema_version AS config_schema, v.body,
            s.schema_version AS snapshot_schema,
            (SELECT data_schema_version FROM schema_meta WHERE id = 1) AS data_schema
       FROM cafes c
       JOIN config_versions v ON v.cafe_id = c.id AND v.version_no = c.active_config_version
       LEFT JOIN menu_snapshots s ON s.cafe_id = c.id AND s.rev = c.menu_rev
      WHERE c.id = ?1`,
  )
    .bind(cafeId)
    .first();
  if (!row) throw new Error('café without an active configuration');
  return {
    pinned: String(row.pinned_release),
    configVersion: Number(row.active_config_version),
    configSchema: Number(row.config_schema),
    config: JSON.parse(String(row.body)),
    snapshotSchema: row.snapshot_schema === null ? null : Number(row.snapshot_schema),
    dataSchema: Number(row.data_schema ?? 1),
  };
}

/**
 * The café's moves, newest first.
 * @param {ReleasesEnv} env
 * @param {string} cafeId
 */
async function pinHistory(env, cafeId) {
  return (
    await env.DB.prepare(
      `SELECT p.release, p.previous_release, p.pinned_by, p.reason, p.pinned_at, u.display_name
         FROM release_pins p LEFT JOIN users u ON u.id = p.pinned_by
        WHERE p.cafe_id = ?1
        ORDER BY p.pinned_at DESC, p.rowid DESC LIMIT ?2`,
    )
      .bind(cafeId, HISTORY)
      .all()
  ).results.map((r) => ({
    release: String(r.release),
    previous: r.previous_release === null ? null : String(r.previous_release),
    by:
      r.display_name !== null
        ? String(r.display_name)
        : // The deploy repo's "Pin café" workflow, when the staff app was unavailable.
          String(r.pinned_by).startsWith('github:')
          ? `${String(r.pinned_by).slice('github:'.length)} (GitHub)`
          : null,
    // Set up by the seed tool (onboarding, or the demo café on every deploy).
    seed: r.display_name === null && r.pinned_by === 'seed',
    reason: String(r.reason),
    at: String(r.pinned_at),
  }));
}

/**
 * The releases of the window that are on this site, newest first.
 * @param {ReleasesEnv} env
 * @param {string} origin
 */
async function windowOf(env, origin) {
  const rows = (
    await env.DB.prepare(
      "SELECT version, status, added_at FROM releases WHERE status != 'retired'",
    ).all()
  ).results;
  const found = await Promise.all(
    rows.map(async (r) => ({
      version: String(r.version),
      status: String(r.status),
      manifest: isVersion(String(r.version))
        ? await releaseManifest(env.ASSETS, String(r.version), origin)
        : null,
    })),
  );
  return found.filter((r) => r.manifest).sort((a, b) => compareVersions(b.version, a.version));
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const text = await request.text();
    return text.length > 1024 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {ReleasesEnv} env
 * @param {string} route   "releases" or "releases/pin"
 * @param {Date} [now]
 */
export async function handleReleases(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  if (write !== (route === 'releases/pin') || (!write && request.method !== 'GET'))
    return problem(405, 'method_not_allowed');

  const input = write ? await readBody(request) : null;
  if (write && (!input || typeof input !== 'object')) return problem(400, 'bad_request');
  const url = new URL(request.url);
  const slug = String(write ? (input.cafe ?? '') : (url.searchParams.get('cafe') ?? ''));
  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !SEE.includes(role)) return problem(403, 'forbidden');

  const state = await cafeState(env, cafe.id);
  const history = await pinHistory(env, cafe.id);
  const last = history[0];
  const site = await windowOf(env, url.origin);
  const inWindow = (/** @type {string} */ v) => site.some((r) => r.version === v);
  // The release the café ran before its last move, while it is still in the window.
  const previous =
    last && last.release === state.pinned && last.previous && inWindow(last.previous)
      ? last.previous
      : null;
  const current = await releaseManifest(env.ASSETS, state.pinned, url.origin);
  const check = (/** @type {ReleaseManifest | null} */ target) =>
    preflight({
      target,
      current,
      config: state.config,
      configSchema: state.configSchema,
      snapshotSchema: state.snapshotSchema,
      dataSchema: state.dataSchema,
    });

  if (!write) {
    return json(200, {
      cafe: { slug: cafe.slug, status: cafe.status },
      role,
      current: {
        version: state.pinned,
        onSite: Boolean(current),
        since: last && last.release === state.pinned ? last.at : null,
      },
      previous,
      can: { forward: role === 'admin', back: role === 'admin' || role === 'maintainer' },
      window: site.map((r) => {
        const isCurrent = r.version === state.pinned;
        return {
          version: r.version,
          status: r.status,
          current: isCurrent,
          older:
            !isCurrent && isVersion(state.pinned) && compareVersions(r.version, state.pinned) < 0,
          previous: r.version === previous,
          allowed: isCurrent ? null : mayPin(role, r.version, state.pinned, previous),
          problems: isCurrent ? [] : check(r.manifest),
        };
      }),
      history,
    });
  }

  const version = String(input.version ?? '');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!isVersion(version)) return problem(400, 'bad_request');
  if (reason.length < 3 || reason.length > 200) return problem(400, 'reason_needed');
  if (version === state.pinned) return json(200, { release: version, unchanged: true });
  const target = site.find((r) => r.version === version);
  if (!target) return problem(409, 'not_in_window');
  const direction = mayPin(role, version, state.pinned, previous);
  if (!direction)
    return problem(403, role === 'maintainer' ? 'back_to_previous_only' : 'forbidden');
  const problems = check(target.manifest);
  if (problems.length) return json(409, { error: 'preflight', release: version, problems });

  // One batch. The history row is written only if the café is still on the release this move
  // started from, and the pin moves under the same condition: both or neither.
  const id = ulid(now.getTime());
  const at = isoNow(now);
  const done = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO release_pins (id, cafe_id, release, previous_release, pinned_by, reason, config_version, pinned_at)
       SELECT ?1, id, ?3, pinned_release, ?4, ?5, active_config_version, ?6
         FROM cafes WHERE id = ?2 AND pinned_release = ?7`,
    ).bind(id, cafe.id, version, account.id, reason, at, state.pinned),
    env.DB.prepare(
      'UPDATE cafes SET pinned_release = ?2 WHERE id = ?1 AND pinned_release = ?3',
    ).bind(cafe.id, version, state.pinned),
    env.DB.prepare(
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at)
       SELECT ?1, 'release', ?2, ?3, ?4, ?5, ?6, ?7
        WHERE EXISTS (SELECT 1 FROM release_pins WHERE id = ?8)`,
    ).bind(
      ulid(now.getTime()),
      direction === 'back' ? 'rollback' : 'pin',
      cafe.id,
      `${cafe.slug} ${state.pinned} -> ${version}`,
      account.id,
      role,
      at,
      id,
    ),
  ]);
  if (Number(done[1]?.meta?.changes ?? 0) !== 1) return problem(409, 'changed_meanwhile');
  forgetCafe(cafe.slug);
  return json(200, { release: version, from: state.pinned, direction });
}
