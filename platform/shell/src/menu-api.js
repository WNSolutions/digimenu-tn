// @ts-check
/**
 * Menu editor and restore (issue #20 part 2, US-27, C-08).
 *
 *   POST /admin/api/menu/edit      { cafe, op, ... }   one change, one revision
 *   GET  /admin/api/menu/versions?cafe=<slug>          the recent revisions, who and what
 *   POST /admin/api/menu/restore   { cafe, rev }       the menu as it was at a revision
 *
 * Who: a Manager of the café, a Maintainer (setting a café up) and Admin. Staff only mark
 * items and variants sold out or available (admin-api.js, `menu/item`, `menu/variant`).
 *
 * Operations (texts are { fr, ar?, en? }; only the café's languages are kept; French needed):
 *   category.add { title }                 at the end, with one untitled sub-group
 *   category.update { id, title?, subtitle?, visible? }
 *   category.move { id, dir: -1 | 1 }      category.delete { id }   (only when it has no items)
 *   group.add { categoryId, title? }       group.update { id, title?, description? }
 *   group.move { id, dir }                 group.delete { id }      (empty, and not the last one)
 *   item.add { groupId, name, description?, price, variant? }   with its first variant
 *   item.update { id, name?, description?, groupId?, ext? }     groupId moves it (at the end);
 *                                          ext: { <module>: data | null }, checked against the
 *                                          module's item schema (#29); null removes it
 *   item.move { id, dir }                  item.delete { id }       (with its variants)
 *   variant.add { itemId, name?, price }   variant.update { id, name?, price? }
 *   variant.move { id, dir }               variant.delete { id }    (never the last one)
 *
 * Every change is a revision with a line per field (what, before, after, account, role); the
 * whole tree of each of the last 50 revisions is kept (menu-publish.js), so restoring one is a
 * new revision too. Customers see a change within 30 s (café cache).
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin } from './auth.js';
import { resolveCafe, clearCaches } from './cafes.js';
import { publishChange } from './menu-publish.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { settingOk } from './info-api.js';
import { MODULE_CATALOG } from './module-catalog.js';

const EDIT = ['manager', 'maintainer', 'admin'];
const LANGS = ['fr', 'ar', 'en'];
const MAX_NAME = 120;
const MAX_TEXT = 300;
const MAX_PRICE = 9_999_999;

/** @typedef {import('./d1.d.js').D1Database} D1Database */
/** @typedef {import('./d1.d.js').D1PreparedStatement} Statement */
/** @typedef {{ entity: string, id: string, field: string, before: unknown, after: unknown }} Change */

/** An edit that cannot be made, with the reason staff read. */
class Refused extends Error {
  /** @param {number} status @param {string} code */
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/**
 * A text in the café's languages: French required, others optional, blanks dropped.
 * @param {unknown} value
 * @param {string[]} langs
 * @param {number} max
 * @param {boolean} [optional]  null when nothing is given
 * @returns {Record<string, string> | null}
 */
export function cleanText(value, langs, max, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Refused(422, 'bad_text');
  /** @type {Record<string, string>} */
  const out = {};
  for (const l of LANGS) {
    const v = /** @type {Record<string, unknown>} */ (value)[l];
    const text = typeof v === 'string' ? v.trim() : '';
    if (text && langs.includes(l)) out[l] = text;
  }
  if (!Object.keys(out).length && optional) return null;
  if (!out.fr || Object.values(out).some((t) => t.length > max)) throw new Refused(422, 'bad_text');
  return out;
}

/** @param {unknown} price */
function cleanPrice(price) {
  if (
    !Number.isSafeInteger(price) ||
    /** @type {number} */ (price) < 0 ||
    /** @type {number} */ (price) > MAX_PRICE
  )
    throw new Refused(422, 'bad_price');
  return /** @type {number} */ (price);
}

/** @param {string} prefix @param {Date} now */
const newId = (prefix, now) => `${prefix}${ulid(now.getTime()).toLowerCase()}`;

const TABLES = /** @type {const} */ ({
  category: { table: 'categories', parent: null },
  group: { table: 'sub_groups', parent: 'category_id' },
  item: { table: 'items', parent: 'sub_group_id' },
  variant: { table: 'variants', parent: 'item_id' },
});

/**
 * One row of the café, or a 404.
 * @param {D1Database} db
 * @param {keyof typeof TABLES} kind
 * @param {unknown} id
 * @param {string} cafeId
 */
async function row(db, kind, id, cafeId) {
  const r = await db
    .prepare(`SELECT * FROM ${TABLES[kind].table} WHERE id = ?1 AND cafe_id = ?2`)
    .bind(String(id ?? ''), cafeId)
    .first();
  if (!r) throw new Refused(404, `unknown_${kind}`);
  return r;
}

/**
 * Swaps a row with its neighbour above or below (in its parent).
 * @param {D1Database} db
 * @param {keyof typeof TABLES} kind
 * @param {Record<string, unknown>} r
 * @param {unknown} dir
 * @param {string} cafeId
 * @returns {Promise<{ writes: Statement[], changes: Change[] }>}
 */
async function move(db, kind, r, dir, cafeId) {
  if (dir !== -1 && dir !== 1) throw new Refused(400, 'bad_request');
  const { table, parent } = TABLES[kind];
  const siblings = (
    await db
      .prepare(
        `SELECT id, sort FROM ${table} WHERE cafe_id = ?1 ${parent ? `AND ${parent} = ?2` : ''} ORDER BY sort, id`,
      )
      .bind(...(parent ? [cafeId, r[parent]] : [cafeId]))
      .all()
  ).results;
  const i = siblings.findIndex((s) => s.id === r.id);
  const j = i + /** @type {number} */ (dir);
  if (i < 0 || j < 0 || j >= siblings.length) return { writes: [], changes: [] };
  // Renumber the whole list in order, so equal or missing sorts never stick.
  const order = siblings.map((s) => String(s.id));
  [order[i], order[j]] = [order[j], order[i]];
  return {
    writes: order.map((id, k) =>
      db
        .prepare(`UPDATE ${table} SET sort = ?1 WHERE id = ?2 AND cafe_id = ?3`)
        .bind(k + 1, id, cafeId),
    ),
    changes: [{ entity: kind, id: String(r.id), field: 'sort', before: i + 1, after: j + 1 }],
  };
}

/**
 * The next sort number at the end of a parent's list.
 * @param {D1Database} db
 * @param {keyof typeof TABLES} kind
 * @param {string | null} parentId
 * @param {string} cafeId
 */
async function last(db, kind, parentId, cafeId) {
  const { table, parent } = TABLES[kind];
  const r = await db
    .prepare(
      `SELECT MAX(sort) AS s FROM ${table} WHERE cafe_id = ?1 ${parent ? `AND ${parent} = ?2` : ''}`,
    )
    .bind(...(parent ? [cafeId, parentId] : [cafeId]))
    .first();
  return Number(r?.s ?? 0) + 1;
}

/**
 * An item's module data after an edit (#29). Each module's part must match its item schema;
 * empty lists are dropped, and a module left with nothing is removed.
 * @param {Record<string, unknown>} current
 * @param {unknown} edit   { <module>: data | null }
 * @param {Record<string, import('./modules-api.js').CatalogEntry>} [catalog]
 */
export function itemExt(current, edit, catalog = MODULE_CATALOG) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit))
    throw new Refused(400, 'bad_request');
  const next = { ...current };
  for (const [key, value] of Object.entries(edit)) {
    const fields = Object.hasOwn(catalog, key) ? catalog[key].itemFields : null;
    if (!fields || !Object.keys(fields).length) throw new Refused(422, 'unknown_module');
    if (value !== null && !settingOk({ type: 'object', properties: fields }, value))
      throw new Refused(422, 'bad_item_data');
    const kept = Object.entries(value ?? {}).filter(([, v]) => !(Array.isArray(v) && !v.length));
    if (kept.length) next[key] = Object.fromEntries(kept);
    else delete next[key];
  }
  return next;
}

/** @param {unknown} v */
const parse = (v) => (v === null || v === undefined ? null : JSON.parse(String(v)));
/** @param {unknown} v */
const text = (v) => (v === null ? null : JSON.stringify(v));

/**
 * Turns one operation into database writes and change lines (nothing is written here).
 * @param {D1Database} db
 * @param {{ id: string, languages: string[] }} cafe
 * @param {any} input
 * @param {Date} now
 * @returns {Promise<{ writes: Statement[], changes: Change[], created?: string }>}
 */
export async function plan(db, cafe, input, now) {
  const langs = cafe.languages;
  const c = cafe.id;
  /** @type {Statement[]} */
  const writes = [];
  /** @type {Change[]} */
  const changes = [];
  const op = String(input?.op ?? '');
  const [kind, verb] = /** @type {[keyof typeof TABLES, string]} */ (op.split('.'));
  if (!Object.hasOwn(TABLES, kind)) throw new Refused(400, 'bad_request');

  /**
   * Sets a field, recording before and after.
   * @param {Record<string, unknown>} r @param {string} column @param {unknown} value @param {string} [field]
   */
  const set = (r, column, value, field = column) => {
    const before =
      column === 'visible'
        ? Boolean(r.visible)
        : column === 'price'
          ? Number(r.price)
          : parse(r[column]);
    const stored =
      column === 'visible' ? (value ? 1 : 0) : column === 'price' ? value : text(value);
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    writes.push(
      db
        .prepare(`UPDATE ${TABLES[kind].table} SET ${column} = ?1 WHERE id = ?2 AND cafe_id = ?3`)
        .bind(stored, r.id, c),
    );
    changes.push({ entity: kind, id: String(r.id), field, before, after: value });
  };

  if (verb === 'move') {
    const r = await row(db, kind, input.id, c);
    return move(db, kind, r, input.dir, c);
  }

  if (kind === 'category') {
    if (verb === 'add') {
      const title = cleanText(input.title, langs, MAX_NAME);
      const id = newId('c-', now);
      const sort = await last(db, 'category', null, c);
      writes.push(
        db
          .prepare(
            'INSERT INTO categories (id, cafe_id, sort, title, subtitle, visible) VALUES (?1, ?2, ?3, ?4, NULL, 1)',
          )
          .bind(id, c, sort, text(title)),
        db
          .prepare(
            'INSERT INTO sub_groups (id, cafe_id, category_id, sort, title, description) VALUES (?1, ?2, ?3, 1, NULL, NULL)',
          )
          .bind(newId('g-', now), c, id),
      );
      changes.push({ entity: 'category', id, field: 'added', before: null, after: title });
      return { writes, changes, created: id };
    }
    const r = await row(db, 'category', input.id, c);
    if (verb === 'update') {
      if ('title' in input) set(r, 'title', cleanText(input.title, langs, MAX_NAME));
      if ('subtitle' in input) set(r, 'subtitle', cleanText(input.subtitle, langs, MAX_TEXT, true));
      if ('visible' in input) set(r, 'visible', Boolean(input.visible));
      return { writes, changes };
    }
    if (verb === 'delete') {
      const items = await db
        .prepare('SELECT COUNT(*) AS n FROM items WHERE category_id = ?1 AND cafe_id = ?2')
        .bind(r.id, c)
        .first();
      if (Number(items?.n) > 0) throw new Refused(409, 'not_empty');
      writes.push(
        db.prepare('DELETE FROM sub_groups WHERE category_id = ?1 AND cafe_id = ?2').bind(r.id, c),
        db.prepare('DELETE FROM categories WHERE id = ?1 AND cafe_id = ?2').bind(r.id, c),
      );
      changes.push({
        entity: 'category',
        id: String(r.id),
        field: 'deleted',
        before: parse(r.title),
        after: null,
      });
      return { writes, changes };
    }
  }

  if (kind === 'group') {
    if (verb === 'add') {
      const cat = await row(db, 'category', input.categoryId, c);
      const title = cleanText(input.title, langs, MAX_NAME, true);
      const id = newId('g-', now);
      writes.push(
        db
          .prepare(
            'INSERT INTO sub_groups (id, cafe_id, category_id, sort, title, description) VALUES (?1, ?2, ?3, ?4, ?5, NULL)',
          )
          .bind(id, c, cat.id, await last(db, 'group', String(cat.id), c), text(title)),
      );
      changes.push({ entity: 'group', id, field: 'added', before: null, after: title });
      return { writes, changes, created: id };
    }
    const r = await row(db, 'group', input.id, c);
    if (verb === 'update') {
      if ('title' in input) set(r, 'title', cleanText(input.title, langs, MAX_NAME, true));
      if ('description' in input)
        set(r, 'description', cleanText(input.description, langs, MAX_TEXT, true));
      return { writes, changes };
    }
    if (verb === 'delete') {
      const items = await db
        .prepare('SELECT COUNT(*) AS n FROM items WHERE sub_group_id = ?1 AND cafe_id = ?2')
        .bind(r.id, c)
        .first();
      if (Number(items?.n) > 0) throw new Refused(409, 'not_empty');
      const groups = await db
        .prepare('SELECT COUNT(*) AS n FROM sub_groups WHERE category_id = ?1 AND cafe_id = ?2')
        .bind(r.category_id, c)
        .first();
      if (Number(groups?.n) <= 1) throw new Refused(409, 'last_group');
      writes.push(
        db.prepare('DELETE FROM sub_groups WHERE id = ?1 AND cafe_id = ?2').bind(r.id, c),
      );
      changes.push({
        entity: 'group',
        id: String(r.id),
        field: 'deleted',
        before: parse(r.title),
        after: null,
      });
      return { writes, changes };
    }
  }

  if (kind === 'item') {
    if (verb === 'add') {
      const group = await row(db, 'group', input.groupId, c);
      const name = cleanText(input.name, langs, MAX_NAME);
      const description = cleanText(input.description, langs, MAX_TEXT, true);
      const variant = cleanText(input.variant, langs, MAX_NAME, true);
      const price = cleanPrice(input.price);
      const id = newId('i-', now);
      writes.push(
        db
          .prepare(
            'INSERT INTO items (id, cafe_id, category_id, sub_group_id, sort, name, description, available) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)',
          )
          .bind(
            id,
            c,
            group.category_id,
            group.id,
            await last(db, 'item', String(group.id), c),
            text(name),
            text(description),
          ),
        db
          .prepare(
            'INSERT INTO variants (id, cafe_id, item_id, sort, name, price, available) VALUES (?1, ?2, ?3, 1, ?4, ?5, 1)',
          )
          .bind(newId('v-', now), c, id, text(variant), price),
      );
      changes.push({ entity: 'item', id, field: 'added', before: null, after: { name, price } });
      return { writes, changes, created: id };
    }
    const r = await row(db, 'item', input.id, c);
    if (verb === 'update') {
      if ('name' in input) set(r, 'name', cleanText(input.name, langs, MAX_NAME));
      if ('description' in input)
        set(r, 'description', cleanText(input.description, langs, MAX_TEXT, true));
      if ('ext' in input) set(r, 'ext', itemExt(parse(r.ext) ?? {}, input.ext));
      if ('groupId' in input && input.groupId !== r.sub_group_id) {
        const group = await row(db, 'group', input.groupId, c);
        writes.push(
          db
            .prepare(
              'UPDATE items SET sub_group_id = ?1, category_id = ?2, sort = ?3 WHERE id = ?4 AND cafe_id = ?5',
            )
            .bind(
              group.id,
              group.category_id,
              await last(db, 'item', String(group.id), c),
              r.id,
              c,
            ),
        );
        changes.push({
          entity: 'item',
          id: String(r.id),
          field: 'group',
          before: r.sub_group_id,
          after: group.id,
        });
      }
      return { writes, changes };
    }
    if (verb === 'delete') {
      writes.push(
        db.prepare('DELETE FROM variants WHERE item_id = ?1 AND cafe_id = ?2').bind(r.id, c),
        db.prepare('DELETE FROM items WHERE id = ?1 AND cafe_id = ?2').bind(r.id, c),
      );
      changes.push({
        entity: 'item',
        id: String(r.id),
        field: 'deleted',
        before: parse(r.name),
        after: null,
      });
      return { writes, changes };
    }
  }

  if (kind === 'variant') {
    if (verb === 'add') {
      const item = await row(db, 'item', input.itemId, c);
      const name = cleanText(input.name, langs, MAX_NAME, true);
      const price = cleanPrice(input.price);
      const id = newId('v-', now);
      writes.push(
        db
          .prepare(
            'INSERT INTO variants (id, cafe_id, item_id, sort, name, price, available) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)',
          )
          .bind(id, c, item.id, await last(db, 'variant', String(item.id), c), text(name), price),
      );
      changes.push({ entity: 'variant', id, field: 'added', before: null, after: { name, price } });
      return { writes, changes, created: id };
    }
    const r = await row(db, 'variant', input.id, c);
    if (verb === 'update') {
      if ('name' in input) set(r, 'name', cleanText(input.name, langs, MAX_NAME, true));
      if ('price' in input) set(r, 'price', cleanPrice(input.price));
      return { writes, changes };
    }
    if (verb === 'delete') {
      const n = await db
        .prepare('SELECT COUNT(*) AS n FROM variants WHERE item_id = ?1 AND cafe_id = ?2')
        .bind(r.item_id, c)
        .first();
      if (Number(n?.n) <= 1) throw new Refused(409, 'last_variant');
      writes.push(db.prepare('DELETE FROM variants WHERE id = ?1 AND cafe_id = ?2').bind(r.id, c));
      changes.push({
        entity: 'variant',
        id: String(r.id),
        field: 'deleted',
        before: { name: parse(r.name), price: r.price },
        after: null,
      });
      return { writes, changes };
    }
  }
  throw new Refused(400, 'bad_request');
}

/**
 * Writes that make the café's menu tables exactly a stored tree.
 * @param {D1Database} db
 * @param {string} cafeId
 * @param {any} tree   menuSource() output
 * @returns {Statement[]}
 */
export function treeWrites(db, cafeId, tree) {
  /** @type {Statement[]} */
  const w = ['variants', 'items', 'sub_groups', 'categories'].map((t) =>
    db.prepare(`DELETE FROM ${t} WHERE cafe_id = ?1`).bind(cafeId),
  );
  for (const cat of tree.categories ?? []) {
    w.push(
      db
        .prepare(
          'INSERT INTO categories (id, cafe_id, sort, title, subtitle, visible) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
        )
        .bind(
          cat.id,
          cafeId,
          cat.sort,
          text(cat.title ?? null),
          text(cat.subtitle ?? null),
          cat.visible ? 1 : 0,
        ),
    );
    for (const g of cat.groups ?? []) {
      w.push(
        db
          .prepare(
            'INSERT INTO sub_groups (id, cafe_id, category_id, sort, title, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
          )
          .bind(g.id, cafeId, cat.id, g.sort, text(g.title ?? null), text(g.description ?? null)),
      );
      for (const it of g.items ?? []) {
        w.push(
          db
            .prepare(
              'INSERT INTO items (id, cafe_id, category_id, sub_group_id, sort, name, description, available, ext) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
            )
            .bind(
              it.id,
              cafeId,
              cat.id,
              g.id,
              it.sort,
              text(it.name),
              text(it.description ?? null),
              it.available ? 1 : 0,
              // Modules' data for the item (#29) comes back with it.
              JSON.stringify(it.ext ?? {}),
            ),
        );
        for (const v of it.variants ?? [])
          w.push(
            db
              .prepare(
                'INSERT INTO variants (id, cafe_id, item_id, sort, name, price, available) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
              )
              .bind(
                v.id,
                cafeId,
                it.id,
                v.sort,
                text(v.name ?? null),
                v.price,
                v.available ? 1 : 0,
              ),
          );
      }
    }
  }
  return w;
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const t = await request.text();
    return t.length > 8192 ? null : JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {import('./auth.js').AuthEnv} env
 * @param {string} route   "menu/edit", "menu/versions" or "menu/restore"
 * @param {Date} [now]
 */
export async function handleMenu(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  if (write !== (route !== 'menu/versions')) return problem(405, 'method_not_allowed');
  const input = write ? await readBody(request) : null;
  if (write && (!input || typeof input !== 'object')) return problem(400, 'bad_request');
  const url = new URL(request.url);
  const slug = String(write ? (input.cafe ?? '') : (url.searchParams.get('cafe') ?? ''));
  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !EDIT.includes(role)) return problem(403, 'forbidden');

  if (route === 'menu/versions') {
    const rows = (
      await env.DB.prepare(
        `SELECT m.rev, m.entity, m.field, m.before, m.after, m.actor_role, m.source, m.at, u.display_name
           FROM menu_changes m LEFT JOIN users u ON u.id = m.actor
          WHERE m.cafe_id = ?1 AND m.rev > ?2 AND m.source IN ('editor', 'undo')
          ORDER BY m.rev DESC, m.id`,
      )
        .bind(cafe.id, Math.max(0, cafe.menuRev - 30))
        .all()
    ).results;
    const kept = new Set(
      (
        await env.DB.prepare('SELECT rev FROM menu_sources WHERE cafe_id = ?1').bind(cafe.id).all()
      ).results.map((r) => Number(r.rev)),
    );
    /** @type {Map<number, any>} */
    const byRev = new Map();
    for (const r of rows) {
      const rev = Number(r.rev);
      const v = byRev.get(rev) ?? {
        rev,
        at: String(r.at),
        by: r.display_name === null ? null : String(r.display_name),
        role: String(r.actor_role),
        source: String(r.source),
        changes: [],
        restorable: kept.has(rev),
      };
      v.changes.push({
        entity: String(r.entity),
        field: String(r.field),
        before: parse(r.before),
        after: parse(r.after),
      });
      byRev.set(rev, v);
    }
    return json(200, {
      rev: cafe.menuRev,
      // The revision before the oldest listed change, if its tree is kept ("undo").
      previous: kept.has(cafe.menuRev - 1) ? cafe.menuRev - 1 : null,
      versions: [...byRev.values()],
    });
  }

  try {
    /** @type {{ writes: Statement[], changes: Change[], created?: string }} */
    let edit;
    /** @type {'editor' | 'undo'} */
    let source = 'editor';
    if (route === 'menu/edit') {
      edit = await plan(
        env.DB,
        { id: cafe.id, languages: cafe.config.languages?.enabled ?? ['fr'] },
        input,
        now,
      );
    } else if (route === 'menu/restore') {
      const rev = Number(input.rev);
      if (!Number.isInteger(rev) || rev < 1 || rev >= cafe.menuRev)
        return problem(400, 'bad_request');
      const kept = await env.DB.prepare(
        'SELECT source FROM menu_sources WHERE cafe_id = ?1 AND rev = ?2',
      )
        .bind(cafe.id, rev)
        .first();
      if (!kept) return problem(404, 'unknown_version');
      edit = {
        writes: treeWrites(env.DB, cafe.id, JSON.parse(String(kept.source))),
        changes: [
          { entity: 'menu', id: cafe.id, field: 'restored', before: cafe.menuRev, after: rev },
        ],
      };
      source = 'undo';
    } else return problem(404, 'not_found');
    if (!edit.writes.length) return json(200, { rev: cafe.menuRev, unchanged: true });
    const rev = await publishChange(env.DB, {
      cafeId: cafe.id,
      release: cafe.pinnedRelease,
      writes: edit.writes,
      changes: edit.changes,
      actorRole: role,
      actor: account.id,
      source,
      now,
    });
    await env.DB.prepare(
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at) VALUES (?1, 'menu', ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        ulid(now.getTime()),
        route === 'menu/restore' ? 'restore' : String(input.op),
        cafe.id,
        (edit.changes[0]?.id ?? cafe.slug).slice(0, 120),
        account.id,
        role,
        isoNow(now),
      )
      .run();
    clearCaches();
    return json(200, { rev, ...(edit.created ? { id: edit.created } : {}) });
  } catch (err) {
    if (err instanceof Refused) return problem(err.status, err.code);
    throw err;
  }
}
