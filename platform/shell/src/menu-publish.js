// @ts-check
/**
 * Publishing a menu change: read the café's menu tree, build a new snapshot (core builder, the
 * same one the seed tool uses), and make it the café's current revision. Customers get it on
 * their next page load (café cache: 30 s).
 *
 * Each revision also keeps the whole tree as staff edit it (`menu_sources`: hidden categories
 * and sold-out entries included), so a recent revision can be restored (#20); the last
 * KEEP_SOURCES per café are kept. Every change line says who made it (`actor`).
 */
import { buildSnapshot, SNAPSHOT_SCHEMA } from '../../../core/menu/snapshot.js';
import { isoNow } from './clock.js';

export const KEEP_SOURCES = 50;

/** @param {string | null | undefined} text */
const parse = (text) => (text ? JSON.parse(String(text)) : undefined);

/**
 * The menu tree of one café as the snapshot builder's source.
 * @param {import('./d1.d.js').D1Database} db
 * @param {string} cafeId
 */
export async function menuSource(db, cafeId) {
  const [cats, groups, items, variants] = await Promise.all(
    ['categories', 'sub_groups', 'items', 'variants'].map(
      async (t) =>
        (await db.prepare(`SELECT * FROM ${t} WHERE cafe_id = ?1 ORDER BY sort`).bind(cafeId).all())
          .results,
    ),
  );
  return {
    categories: cats.map((c) => ({
      id: String(c.id),
      sort: Number(c.sort),
      title: parse(/** @type {string} */ (c.title)),
      subtitle: parse(/** @type {string} */ (c.subtitle)),
      visible: Boolean(c.visible),
      groups: groups
        .filter((g) => g.category_id === c.id)
        .map((g) => ({
          id: String(g.id),
          sort: Number(g.sort),
          title: parse(/** @type {string} */ (g.title)),
          description: parse(/** @type {string} */ (g.description)),
          items: items
            .filter((it) => it.sub_group_id === g.id)
            .map((it) => ({
              id: String(it.id),
              sort: Number(it.sort),
              name: parse(/** @type {string} */ (it.name)),
              description: parse(/** @type {string} */ (it.description)),
              available: Boolean(it.available),
              variants: variants
                .filter((v) => v.item_id === it.id)
                .map((v) => ({
                  id: String(v.id),
                  sort: Number(v.sort),
                  name: parse(/** @type {string} */ (v.name)),
                  price: Number(v.price),
                  available: Boolean(v.available),
                })),
            })),
        })),
    })),
  };
}

/**
 * Applies the given writes and publishes the next revision.
 * @param {import('./d1.d.js').D1Database} db
 * @param {{ cafeId: string, release: string, writes: import('./d1.d.js').D1PreparedStatement[],
 *   changes: { entity: string, id: string, field: string, before: unknown, after: unknown }[],
 *   actorRole: string, actor?: string, source?: 'editor' | 'undo', now: Date }} o
 */
export async function publishChange(db, o) {
  const cafe = await db.prepare('SELECT menu_rev FROM cafes WHERE id = ?1').bind(o.cafeId).first();
  const current = Number(cafe?.menu_rev ?? 0);
  const rev = current + 1;
  const at = isoNow(o.now);
  // The first edit after a seed or an import: keep the tree as it was, so it can be restored.
  const kept = await db
    .prepare('SELECT 1 AS k FROM menu_sources WHERE cafe_id = ?1 AND rev = ?2')
    .bind(o.cafeId, current)
    .first();
  if (!kept && current > 0)
    await db
      .prepare(
        'INSERT INTO menu_sources (cafe_id, rev, source, created_at) VALUES (?1, ?2, ?3, ?4)',
      )
      .bind(o.cafeId, current, JSON.stringify(await menuSource(db, o.cafeId)), at)
      .run();
  await db.batch(o.writes);
  const tree = await menuSource(db, o.cafeId);
  const { snapshot, problems } = buildSnapshot(/** @type {any} */ (tree), rev);
  if (problems.length) throw new Error(`menu problems: ${problems.join('; ')}`);
  const body = JSON.stringify(snapshot);
  const sha = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  await db.batch([
    db
      .prepare(
        `INSERT INTO menu_snapshots (cafe_id, rev, schema_version, built_by_release, sha256, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(o.cafeId, rev, SNAPSHOT_SCHEMA, o.release, sha, body, at),
    ...o.changes.map((c, i) =>
      db
        .prepare(
          `INSERT INTO menu_changes (id, cafe_id, rev, entity, entity_id, field, before, after, actor_role, source, at, actor)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        )
        .bind(
          `chg-${o.cafeId}-${rev}-${i}`,
          o.cafeId,
          rev,
          c.entity,
          c.id,
          c.field,
          JSON.stringify(c.before),
          JSON.stringify(c.after),
          o.actorRole,
          o.source ?? 'editor',
          at,
          o.actor ?? null,
        ),
    ),
    db
      .prepare(
        'INSERT INTO menu_sources (cafe_id, rev, source, created_at) VALUES (?1, ?2, ?3, ?4)',
      )
      .bind(o.cafeId, rev, JSON.stringify(tree), at),
    db
      .prepare('DELETE FROM menu_sources WHERE cafe_id = ?1 AND rev <= ?2')
      .bind(o.cafeId, rev - KEEP_SOURCES),
    db.prepare('UPDATE cafes SET menu_rev = ?1 WHERE id = ?2').bind(rev, o.cafeId),
  ]);
  return rev;
}
