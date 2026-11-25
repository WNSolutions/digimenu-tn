// @ts-check
/**
 * Staff and manager API under /admin/api/ (admin host only in production).
 *
 *   GET  /admin/api/orders?cafe=<slug>[&since=<iso>]   today's orders for the staff screen
 *   POST /admin/api/orders/status                      { cafe, id, status, reason? }
 *   GET  /admin/api/menu?cafe=<slug>                   the menu tree for the editor
 *   POST /admin/api/menu/variant                       { cafe, id, price?, available? }
 *   POST /admin/api/menu/item                          { cafe, id, available }
 *   GET  /admin/api/cafe?cafe=<slug>                   name, role and the staff panels switched on
 *   POST /admin/api/m/<module>/<route>                 a module's staff call (module-host.js)
 *
 * Roles are checked on every call (ADR-0006): staff may change order status and sold-out;
 * prices need a manager or Admin. Every query names the café (café scope).
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin } from './auth.js';
import { resolveCafe, clearCaches } from './cafes.js';
import { localDayHour, isoNow } from './clock.js';
import { loadKeys, open } from './crypto.js';
import { menuSource, publishChange } from './menu-publish.js';
import { ulid } from './ids.js';
import { runStatusChanged, handleStaffModuleRoute, serverModules } from './module-host.js';

// Maintainers work on menus and test orders of their assigned cafés, never on real orders or
// customer details (roles table, data-model.md).
const STAFF = ['staff', 'manager', 'admin', 'maintainer'];
const PRICES = ['manager', 'admin', 'maintainer'];

/** Order status changes staff may make. */
export const TRANSITIONS = /** @type {Record<string, string[]>} */ ({
  received: ['accepted', 'rejected'],
  handoff: ['accepted', 'unconfirmed'],
  accepted: ['ready', 'served', 'rejected'],
  ready: ['served'],
  unconfirmed: ['accepted'],
});

/**
 * GET /admin/api/cafes: the cafés this account works in (every café for Admin), so the staff
 * app can offer a choice. Closed cafés are left out.
 * @param {Request} request
 * @param {import('./auth.js').AuthEnv} env
 * @param {Date} [now]
 */
export async function handleCafeList(request, env, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const admin = account.roles.some((r) => r.role === 'admin');
  const rows = (
    await env.DB.prepare(
      `SELECT c.id, c.slug, c.status, v.body FROM cafes c
         JOIN config_versions v ON v.cafe_id = c.id AND v.version_no = c.active_config_version
        WHERE c.status != 'closed' ORDER BY c.slug`,
    ).all()
  ).results;
  const cafes = rows
    .filter((r) => admin || account.roles.some((m) => m.cafeId === r.id))
    .map((r) => ({
      slug: String(r.slug),
      status: String(r.status),
      name: JSON.parse(String(r.body)).names ?? null,
      role: roleIn(account, String(r.id)),
    }));
  return json(200, { cafes, admin });
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const text = await request.text();
    return text.length > 4096 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {import('./auth.js').AuthEnv & { FIELD_KEY?: string, LOOKUP_KEY?: string }} env
 * @param {string} route
 * @param {Date} [now]
 */
export async function handleAdmin(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const url = new URL(request.url);
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  const input = write ? await readBody(request) : null;
  const slug = String(write ? (input?.cafe ?? '') : (url.searchParams.get('cafe') ?? ''));
  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !STAFF.includes(role)) return problem(403, 'forbidden');

  if (route === 'orders' && !write) {
    const { day } = localDayHour(now, cafe.config.timeZone);
    const since = url.searchParams.get('since');
    const rows = (
      await env.DB.prepare(
        `SELECT id, number, type, channel, status, table_label, lines, note, total, contact_ct, lang, created_at, accepted_at, closed_at, reject_reason
           FROM orders WHERE cafe_id = ?1 AND day = ?2 ${role === 'maintainer' ? 'AND is_test = 1' : ''} ${since ? 'AND (created_at > ?3 OR accepted_at > ?3 OR closed_at > ?3)' : ''}
          ORDER BY created_at DESC LIMIT 200`,
      )
        .bind(...(since ? [cafe.id, day, since] : [cafe.id, day]))
        .all()
    ).results;
    const keys = await loadKeys(env);
    const orders = [];
    for (const r of rows) {
      /** @type {{ firstName?: string, phone?: string } | null} */
      let contact = null;
      if (r.contact_ct && keys && role !== 'maintainer') {
        const c = await open(keys, String(r.contact_ct));
        // Staff see the first name; the phone only on open takeaway orders (ADR-0010).
        const open_ = !['served', 'rejected', 'unconfirmed', 'cancelled'].includes(
          String(r.status),
        );
        contact = {
          firstName: c.firstName,
          ...(r.type === 'takeaway' && open_ ? { phone: c.phone } : {}),
        };
      }
      orders.push({
        id: r.id,
        number: r.number,
        type: r.type,
        channel: r.channel,
        status: r.status,
        table: r.table_label,
        lines: JSON.parse(String(r.lines)),
        note: r.note,
        total: r.total,
        lang: r.lang,
        contact,
        createdAt: r.created_at,
        rejectReason: r.reject_reason,
      });
    }
    return json(200, { orders, serverTime: isoNow(now), role });
  }

  if (route === 'orders/status' && write) {
    const id = String(input?.id ?? '');
    const next = String(input?.status ?? '');
    const row = await env.DB.prepare(
      'SELECT status, total, customer_id, is_test FROM orders WHERE id = ?1 AND cafe_id = ?2',
    )
      .bind(id, cafe.id)
      .first();
    if (!row) return problem(404, 'unknown_order');
    if (!(TRANSITIONS[String(row.status)] ?? []).includes(next))
      return problem(409, 'bad_transition');
    const at = isoNow(now);
    const reason = next === 'rejected' ? String(input?.reason ?? '').slice(0, 120) : null;
    const done = await env.DB.prepare(
      `UPDATE orders SET status = ?1,
              accepted_at = CASE WHEN ?1 = 'accepted' THEN ?2 ELSE accepted_at END,
              closed_at = CASE WHEN ?1 IN ('served', 'rejected', 'unconfirmed') THEN ?2 ELSE closed_at END,
              reject_reason = COALESCE(?3, reject_reason)
        WHERE id = ?4 AND cafe_id = ?5 AND status = ?6`,
    )
      .bind(next, at, reason, id, cafe.id, String(row.status))
      .run();
    // Only the tap that changed the status runs the modules' hooks (a double tap adds nothing).
    if (Number(done?.meta?.changes ?? 1) === 1) {
      await runStatusChanged(
        env,
        cafe,
        {
          order: {
            id,
            total: Number(row.total),
            customerId: row.customer_id === null ? null : String(row.customer_id),
          },
          from: String(row.status),
          to: next,
          actor: { userId: account.id, role },
        },
        now,
      );
    }
    return json(200, { id, status: next });
  }

  if (route === 'cafe' && !write) {
    return json(200, {
      slug: cafe.slug,
      name: cafe.config.names ?? null,
      role,
      modules: serverModules(cafe.config).map(([key]) => key),
    });
  }

  if (route.startsWith('m/') && write) {
    return handleStaffModuleRoute(
      env,
      cafe,
      route.slice(2),
      input,
      { userId: account.id, role },
      now,
    );
  }

  if (route === 'menu' && !write) {
    return json(200, { menu: await menuSource(env.DB, cafe.id), rev: cafe.menuRev, role });
  }

  if ((route === 'menu/variant' || route === 'menu/item') && write) {
    const id = String(input?.id ?? '');
    const table = route === 'menu/variant' ? 'variants' : 'items';
    const columns = table === 'variants' ? 'price, available' : 'available';
    const current = await env.DB.prepare(
      `SELECT ${columns} FROM ${table} WHERE id = ?1 AND cafe_id = ?2`,
    )
      .bind(id, cafe.id)
      .first();
    if (!current) return problem(404, 'unknown_item');
    /** @type {import('./d1.d.js').D1PreparedStatement[]} */
    const writes = [];
    const changes = [];
    if (input && 'price' in input) {
      if (route !== 'menu/variant') return problem(400, 'bad_request');
      if (!PRICES.includes(role)) return problem(403, 'forbidden');
      const price = input.price;
      if (!Number.isSafeInteger(price) || price < 0 || price > 9_999_999)
        return problem(422, 'bad_price');
      writes.push(
        env.DB.prepare('UPDATE variants SET price = ?1 WHERE id = ?2 AND cafe_id = ?3').bind(
          price,
          id,
          cafe.id,
        ),
      );
      changes.push({ entity: 'variant', id, field: 'price', before: current.price, after: price });
    }
    if (input && 'available' in input) {
      const available = Boolean(input.available);
      writes.push(
        env.DB.prepare(`UPDATE ${table} SET available = ?1 WHERE id = ?2 AND cafe_id = ?3`).bind(
          available ? 1 : 0,
          id,
          cafe.id,
        ),
      );
      changes.push({
        entity: table === 'variants' ? 'variant' : 'item',
        id,
        field: 'available',
        before: Boolean(current.available),
        after: available,
      });
    }
    if (!writes.length) return problem(400, 'bad_request');
    const rev = await publishChange(env.DB, {
      cafeId: cafe.id,
      release: cafe.pinnedRelease,
      writes,
      changes,
      actorRole: role,
      now,
    });
    await env.DB.prepare(
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at) VALUES (?1, 'menu', ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        ulid(now.getTime()),
        changes.map((c) => c.field).join(','),
        cafe.id,
        id,
        account.id,
        role,
        isoNow(now),
      )
      .run();
    clearCaches();
    return json(200, { rev });
  }
  return problem(404, 'not_found');
}
