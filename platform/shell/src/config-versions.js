// @ts-check
/**
 * Café configuration versions (ADR-0008 §8): every change, by a module switch (#21) or the
 * café information editor (#20), is a new version saying who, when and what changed
 * (`change`, JSON). The previous active version is kept ("superseded"), so nothing is lost
 * and the last valid one stays live. This Worker uses the new version at once; the others
 * within 30 s (cafes.js).
 */
import { forgetCafe } from './cafes.js';
import { isoNow } from './clock.js';

/**
 * @param {{ DB: import('./d1.d.js').D1Database }} env
 * @param {string} cafeId
 */
export async function activeVersion(env, cafeId) {
  const row = await env.DB.prepare(
    `SELECT v.version_no, v.schema_version, v.body FROM cafes c
       JOIN config_versions v ON v.cafe_id = c.id AND v.version_no = c.active_config_version
      WHERE c.id = ?1`,
  )
    .bind(cafeId)
    .first();
  if (!row) throw new Error('no active configuration');
  return {
    version: Number(row.version_no),
    schemaVersion: Number(row.schema_version),
    config: JSON.parse(String(row.body)),
  };
}

/**
 * Writes a new configuration version; an active one replaces the current one.
 * @param {{ DB: import('./d1.d.js').D1Database }} env
 * @param {{ id: string, slug: string }} cafe
 * @param {{ config: any, schemaVersion: number, change: Record<string, unknown>, by: string, status: 'active' | 'draft', now: Date }} v
 * @returns {Promise<number>} the new version number
 */
export async function writeVersion(env, cafe, v) {
  const top = await env.DB.prepare(
    'SELECT MAX(version_no) AS n FROM config_versions WHERE cafe_id = ?1',
  )
    .bind(cafe.id)
    .first();
  const next = Number(top?.n ?? 0) + 1;
  const insert = env.DB.prepare(
    `INSERT INTO config_versions (cafe_id, version_no, schema_version, body, status, created_by, created_at, change)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(
    cafe.id,
    next,
    v.schemaVersion,
    JSON.stringify(v.config),
    v.status,
    v.by,
    isoNow(v.now),
    JSON.stringify(v.change),
  );
  if (v.status === 'draft') await insert.run();
  else {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE config_versions SET status = 'superseded' WHERE cafe_id = ?1 AND status = 'active'",
      ).bind(cafe.id),
      insert,
      env.DB.prepare('UPDATE cafes SET active_config_version = ?2 WHERE id = ?1').bind(
        cafe.id,
        next,
      ),
    ]);
    forgetCafe(cafe.slug);
  }
  return next;
}
