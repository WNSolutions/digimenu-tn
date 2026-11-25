// @ts-check
/**
 * Publishing a menu change: read the café's menu tree, build a new snapshot (core builder, the
 * same one the seed tool uses), and make it the café's current revision. Customers get it on
 * their next page load (café cache: 30 s).
 */
import { buildSnapshot, SNAPSHOT_SCHEMA } from '../../../core/menu/snapshot.js';
import { isoNow } from './clock.js';

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
 * Applies the given writes and publishes the next revision in one transaction.
 * @param {import('./d1.d.js').D1Database} db
 * @param {{ cafeId: string, release: string, writes: import('./d1.d.js').D1PreparedStatement[],
 *   changes: { entity: string, id: string, field: string, before: unknown, after: unknown }[],
 *   actorRole: string, now: Date }} o
 */
export async function publishChange(db, o) {
  const cafe = await db.prepare('SELECT menu_rev FROM cafes WHERE id = ?1').bind(o.cafeId).first();
  const rev = Number(cafe?.menu_rev ?? 0) + 1;
  await db.batch(o.writes);
  const { snapshot, problems } = buildSnapshot(
    /** @type {any} */ (await menuSource(db, o.cafeId)),
    rev,
  );
  if (problems.length) throw new Error(`menu problems: ${problems.join('; ')}`);
  const body = JSON.stringify(snapshot);
  const sha = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const at = isoNow(o.now);
  await db.batch([
    db
      .prepare(
        `INSERT INTO menu_snapshots (cafe_id, rev, schema_version, built_by_release, sha256, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(o.cafeId, rev, SNAPSHOT_SCHEMA, o.release, sha, body, at),
    ...o.changes.map((c, i) =>
      db
        .prepare(
          `INSERT INTO menu_changes (id, cafe_id, rev, entity, entity_id, field, before, after, actor_role, source, at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'editor', ?10)`,
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
          at,
        ),
    ),
    db.prepare('UPDATE cafes SET menu_rev = ?1 WHERE id = ?2').bind(rev, o.cafeId),
  ]);
  return rev;
}
