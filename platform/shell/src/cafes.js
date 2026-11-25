// @ts-check
/**
 * Café resolver: slug → café row, pinned release, menu revision and active configuration,
 * cached 30 s per Worker instance. Every query names the café (café scope, data-model rules).
 */

/** @typedef {import('./d1.d.js').D1Database} D1Database */
/** @typedef {import('./boot-body.js').CafeConfig} CafeConfig */

/**
 * @typedef {object} ResolvedCafe
 * @property {string} id
 * @property {string} slug
 * @property {string} status
 * @property {string} pinnedRelease
 * @property {number} menuRev
 * @property {CafeConfig} config
 * @property {string | null} [orderingPausedAt]   staff paused new orders at that time (#29)
 */

const TTL_MS = 30_000;
/** @type {Map<string, { at: number, value: ResolvedCafe | null }>} */
const cafeCache = new Map();
/** @type {Map<string, unknown>} snapshots never change once published: cached by café and rev */
const snapshotCache = new Map();

export const SLUG = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/**
 * @param {D1Database} db
 * @param {string} slug
 * @param {number} now
 * @returns {Promise<ResolvedCafe | null>}
 */
export async function resolveCafe(db, slug, now) {
  if (!SLUG.test(slug)) return null;
  const hit = cafeCache.get(slug);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const row = await db
    .prepare(
      `SELECT c.id, c.slug, c.status, c.pinned_release, c.menu_rev, c.ordering_paused_at, v.body
         FROM cafes c
         JOIN config_versions v ON v.cafe_id = c.id AND v.version_no = c.active_config_version
        WHERE c.slug = ?1 AND c.status != 'closed'`,
    )
    .bind(slug)
    .first();
  /** @type {ResolvedCafe | null} */
  const value = row
    ? {
        id: String(row.id),
        slug: String(row.slug),
        status: String(row.status),
        pinnedRelease: String(row.pinned_release),
        menuRev: Number(row.menu_rev),
        config: JSON.parse(String(row.body)),
        orderingPausedAt: row.ordering_paused_at ? String(row.ordering_paused_at) : null,
      }
    : null;
  cafeCache.set(slug, { at: now, value });
  return value;
}

/**
 * The published menu snapshot for a revision.
 * @param {D1Database} db
 * @param {string} cafeId
 * @param {number} rev
 */
export async function menuSnapshot(db, cafeId, rev) {
  const key = `${cafeId}:${rev}`;
  if (snapshotCache.has(key)) return snapshotCache.get(key);
  const row = await db
    .prepare('SELECT body FROM menu_snapshots WHERE cafe_id = ?1 AND rev = ?2')
    .bind(cafeId, rev)
    .first();
  const body = row ? JSON.parse(String(row.body)) : null;
  if (body) snapshotCache.set(key, body);
  return body;
}

/**
 * @param {D1Database} db
 * @param {string} cafeId
 * @param {string} label
 * @returns {Promise<{ label: string, check_code: string, active: number } | null>}
 */
export function findTable(db, cafeId, label) {
  return db
    .prepare('SELECT label, check_code, active FROM tables WHERE cafe_id = ?1 AND label = ?2')
    .bind(cafeId, label)
    .first();
}

/** For tests: forget cached cafés and snapshots. */
/** Forget one café, after a change that must show at once in this Worker. @param {string} slug */
export function forgetCafe(slug) {
  cafeCache.delete(slug);
}

export function clearCaches() {
  cafeCache.clear();
  snapshotCache.clear();
}
