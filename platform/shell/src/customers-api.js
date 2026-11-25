// @ts-check
/**
 * Customer records, Admin only (ADR-0010 §5 and §7, issue #23).
 *
 *   GET  /admin/api/customers?q=&cafe=&optin=&from=&to=&cursor=   list and search
 *   GET  /admin/api/customers/<id>                                 one record, phone in full
 *   GET  /admin/api/customers/<id>/export                          the person's file (JSON)
 *   GET  /admin/api/customers/export?cafe=&cursor=                 bulk export, one page at a time
 *   POST /admin/api/customers/<id>/consent  { cafe, purpose }      record a withdrawal
 *   POST /admin/api/customers/<id>/delete   { confirm: <last 3 digits> }
 *
 * One record per phone number across all cafés. Every list, search, view, export, deletion and
 * consent change, and every refused attempt, writes a line to the append-only audit log, never
 * with a phone number or a name. Files are built in the Admin's browser; nothing is kept here.
 */
import { json, problem } from './http.js';
import { currentAccount, sameOrigin } from './auth.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { loadKeys, open, lookupHash } from './crypto.js';
import { normalizePhone } from '../../../core/phone.js';
import { runCustomerExport, runCustomerErase } from './module-host.js';

const PAGE = 50;
const EXPORT_PAGE = 200;
const NAME_SCAN = 2000;
const PURPOSES = ['order_updates', 'marketing', 'loyalty'];
const ID = /^[0-9A-Z]{26}$/;

/** @typedef {import('./module-host.js').HostEnv & import('./auth.js').AuthEnv} CustomersEnv */

/**
 * @param {CustomersEnv} env
 * @param {{ action: string, target?: string | null, actor: string, role: string, count?: number }} a
 * @param {Date} now
 */
function audit(env, a, now) {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, record_count, at)
     VALUES (?1, 'customers', ?2, NULL, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      ulid(now.getTime()),
      a.action,
      a.target ?? null,
      a.actor,
      a.role,
      a.count ?? 0,
      isoNow(now),
    )
    .run();
}

/** Lower case, no accents: "Amél" finds "amel". @param {string} s */
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/**
 * @param {Request} request
 * @param {CustomersEnv} env
 * @param {string} route   what follows /admin/api/
 * @param {Date} [now]
 */
export async function handleCustomers(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const write = request.method === 'POST';
  const admin = account.roles.some((r) => r.role === 'admin');
  if (!admin) {
    // For any other role the area does not exist; the attempt is still logged.
    await audit(
      env,
      { action: 'refused', actor: account.id, role: account.roles[0]?.role ?? 'none' },
      now,
    );
    return problem(404, 'not_found');
  }
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  const keys = await loadKeys(env);
  if (!keys) return problem(503, 'customer_data_unavailable');
  const actor = { actor: account.id, role: 'admin' };
  const url = new URL(request.url);
  const parts = route.split('/');

  if (parts.length === 1 && !write) return list(env, keys, url, actor, now);
  if (parts.length === 2 && parts[1] === 'export' && !write)
    return bulkExport(env, keys, url, actor, now);

  const id = parts[1] ?? '';
  if (!ID.test(id)) return problem(404, 'not_found');
  const row = await env.DB.prepare(
    'SELECT id, phone_idx, pii_ct, phone_last3, first_order_at, last_order_at FROM customers WHERE id = ?1',
  )
    .bind(id)
    .first();
  if (!row) return problem(404, 'unknown_customer');
  const pii = await open(keys, String(row.pii_ct));

  if (parts.length === 2 && !write) {
    await audit(env, { ...actor, action: 'view', target: id }, now);
    return json(200, await record(env, row, pii, now, { orders: 100 }));
  }
  if (parts.length === 3 && parts[2] === 'export' && !write) {
    const file = await record(env, row, pii, now, { orders: 10_000, lines: true });
    await audit(env, { ...actor, action: 'export', target: id, count: 1 }, now);
    return json(
      200,
      { format: 'digimenu-customer-1', exportedAt: isoNow(now), ...file },
      {
        'content-disposition': `attachment; filename="customer-${id}.json"`,
      },
    );
  }
  if (parts.length === 3 && parts[2] === 'consent' && write) {
    const input = await readBody(request);
    const cafe = await env.DB.prepare('SELECT id FROM cafes WHERE slug = ?1')
      .bind(String(input?.cafe ?? ''))
      .first();
    // Offers only: loyalty is left from the card (its stamps go with it) or by deletion.
    const purpose = String(input?.purpose ?? '');
    if (!cafe || purpose !== 'marketing') return problem(400, 'bad_request');
    const notice = await env.DB.prepare(
      'SELECT version_no FROM privacy_notice_versions ORDER BY version_no DESC LIMIT 1',
    ).first();
    if (!notice) return problem(503, 'no_privacy_notice');
    // Admin records a withdrawal the person asked for; only the person can give consent.
    await env.DB.prepare(
      `INSERT INTO consents (id, customer_id, cafe_id, purpose, granted, notice_version, language, source, at)
       VALUES (?1, ?2, ?3, ?4, 0, ?5, 'fr', 'admin', ?6)`,
    )
      .bind(ulid(now.getTime()), id, cafe.id, purpose, notice.version_no, isoNow(now))
      .run();
    await audit(env, { ...actor, action: 'consent_withdrawn', target: id }, now);
    return json(200, await record(env, row, pii, now, { orders: 100 }));
  }
  if (parts.length === 3 && parts[2] === 'delete' && write) {
    const input = await readBody(request);
    // Second confirmation: the Admin types the last three digits of the number.
    if (String(input?.confirm ?? '') !== String(row.phone_last3))
      return problem(422, 'confirm_mismatch');
    return erase(env, row, actor, now);
  }
  return problem(404, 'not_found');
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
 * @param {CustomersEnv} env
 * @param {NonNullable<Awaited<ReturnType<typeof loadKeys>>>} keys
 * @param {URL} url
 * @param {{ actor: string, role: string }} actor
 * @param {Date} now
 */
async function list(env, keys, url, actor, now) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const cafeSlug = url.searchParams.get('cafe') ?? '';
  const optin = url.searchParams.get('optin') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const cursor = url.searchParams.get('cursor') ?? '';
  /** @type {string[]} */
  const where = [];
  /** @type {unknown[]} */
  const values = [];
  const add = (/** @type {string} */ sql, /** @type {unknown} */ value) => {
    values.push(value);
    where.push(sql.replaceAll('?', `?${values.length}`));
  };
  if (cafeSlug) {
    const cafe = await env.DB.prepare('SELECT id FROM cafes WHERE slug = ?1')
      .bind(cafeSlug)
      .first();
    if (!cafe) return problem(404, 'unknown_cafe');
    add('EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.cafe_id = ?)', cafe.id);
  }
  if (optin) {
    if (!PURPOSES.includes(optin)) return problem(400, 'bad_request');
    add(
      `EXISTS (SELECT 1 FROM consents k WHERE k.customer_id = c.id AND k.purpose = ? AND k.granted = 1
         AND NOT EXISTS (SELECT 1 FROM consents w WHERE w.customer_id = k.customer_id AND w.cafe_id = k.cafe_id
                          AND w.purpose = k.purpose AND w.granted = 0 AND w.at >= k.at))`,
      optin,
    );
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) add('c.last_order_at >= ?', `${from}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) add('c.last_order_at <= ?', `${to}T23:59:59Z`);
  // A full number finds its record; three digits match the end of the number; else a name.
  const digits = q.replace(/\D/g, '');
  const phone = digits.length >= 6 ? normalizePhone(q) : null;
  if (digits.length >= 6 && !phone) return problem(422, 'bad_phone');
  if (phone) add('c.phone_idx = ?', await lookupHash(keys, phone));
  const last3 = /^\d{3}$/.test(q) ? q : null;
  if (last3) add('c.phone_last3 = ?', last3);
  if (!phone && !last3 && digits) return problem(422, 'bad_phone');
  const [cursorAt, cursorId] = cursor.split('|');
  if (cursorAt && cursorId) {
    values.push(cursorAt, cursorId);
    where.push(
      `(c.last_order_at < ?${values.length - 1} OR (c.last_order_at = ?${values.length - 1} AND c.id < ?${values.length}))`,
    );
  }
  const name = q && !phone && !last3 ? fold(q) : '';
  const scan = name ? NAME_SCAN : PAGE + 1;
  const rows = (
    await env.DB.prepare(
      `SELECT c.id, c.pii_ct, c.phone_last3, c.first_order_at, c.last_order_at FROM customers c
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY c.last_order_at DESC, c.id DESC LIMIT ${scan}`,
    )
      .bind(...values)
      .all()
  ).results;

  /** @type {any[]} */
  const items = [];
  /** @type {string | null} */
  let next = null;
  /** @type {any} */
  let examined = null;
  for (const r of rows) {
    if (items.length === PAGE) {
      next = `${items.at(-1).lastOrderAt}|${items.at(-1).id}`;
      break;
    }
    examined = r;
    const pii = await open(keys, String(r.pii_ct));
    if (name && !fold(String(pii.firstName ?? '')).includes(name)) continue;
    items.push(await summary(env, r, String(pii.firstName ?? '')));
  }
  // A name search read a whole batch without filling the page: carry on from there.
  if (!next && name && rows.length === scan && examined)
    next = `${examined.last_order_at}|${examined.id}`;
  await audit(env, { ...actor, action: q ? 'search' : 'list', count: items.length }, now);
  return json(200, { customers: items, next });
}

/**
 * One line of the list: masked phone only.
 * @param {CustomersEnv} env
 * @param {any} r
 * @param {string} firstName
 */
async function summary(env, r, firstName) {
  const cafes = (
    await env.DB.prepare(
      `SELECT c.slug, COUNT(*) AS n FROM orders o JOIN cafes c ON c.id = o.cafe_id
        WHERE o.customer_id = ?1 GROUP BY c.slug ORDER BY c.slug`,
    )
      .bind(r.id)
      .all()
  ).results;
  return {
    id: String(r.id),
    firstName,
    phone: `•• ••• ${r.phone_last3}`,
    cafes: cafes.map((c) => String(c.slug)),
    orders: cafes.reduce((n, c) => n + Number(c.n), 0),
    firstOrderAt: String(r.first_order_at),
    lastOrderAt: String(r.last_order_at),
    optIns: await optIns(env, String(r.id)),
  };
}

/**
 * The purposes the person currently agrees to, per café (latest choice wins).
 * @param {CustomersEnv} env
 * @param {string} customerId
 */
async function optIns(env, customerId) {
  const rows = (
    await env.DB.prepare(
      `SELECT c.slug, k.purpose, k.granted FROM consents k JOIN cafes c ON c.id = k.cafe_id
        WHERE k.customer_id = ?1 ORDER BY k.at, k.id`,
    )
      .bind(customerId)
      .all()
  ).results;
  /** @type {Record<string, Record<string, boolean>>} */
  const latest = {};
  for (const r of rows) (latest[String(r.purpose)] ??= {})[String(r.slug)] = Boolean(r.granted);
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [purpose, cafes] of Object.entries(latest)) {
    if (purpose === 'order_updates') continue;
    out[purpose] = Object.keys(cafes).filter((slug) => cafes[slug]);
  }
  return out;
}

/**
 * Everything kept about one person: the record, orders, consent history, module data.
 * @param {CustomersEnv} env
 * @param {any} row
 * @param {{ firstName?: string, phone?: string }} pii
 * @param {Date} now
 * @param {{ orders: number, lines?: boolean }} o
 */
async function record(env, row, pii, now, o) {
  const orders = (
    await env.DB.prepare(
      `SELECT o.id, c.slug AS cafe, o.number, o.type, o.status, o.table_label, o.total, o.lines, o.note, o.created_at
         FROM orders o JOIN cafes c ON c.id = o.cafe_id WHERE o.customer_id = ?1
        ORDER BY o.created_at DESC LIMIT ${o.orders}`,
    )
      .bind(row.id)
      .all()
  ).results.map((r) => ({
    id: r.id,
    cafe: r.cafe,
    number: r.number,
    type: r.type,
    status: r.status,
    table: r.table_label,
    total: r.total,
    at: r.created_at,
    ...(o.lines ? { lines: JSON.parse(String(r.lines)), note: r.note } : {}),
  }));
  const consents = (
    await env.DB.prepare(
      `SELECT c.slug AS cafe, k.purpose, k.granted, k.notice_version, k.language, k.source, k.at, k.order_id
         FROM consents k JOIN cafes c ON c.id = k.cafe_id WHERE k.customer_id = ?1 ORDER BY k.at, k.id`,
    )
      .bind(row.id)
      .all()
  ).results.map((r) => ({
    cafe: r.cafe,
    purpose: r.purpose,
    granted: Boolean(r.granted),
    noticeVersion: r.notice_version,
    language: r.language,
    source: r.source,
    at: r.at,
    orderId: r.order_id,
  }));
  return {
    customer: {
      id: String(row.id),
      firstName: String(pii.firstName ?? ''),
      phone: String(pii.phone ?? ''),
      firstOrderAt: row.first_order_at,
      lastOrderAt: row.last_order_at,
      optIns: await optIns(env, String(row.id)),
    },
    orders,
    consents,
    modules: await runCustomerExport(env, String(row.id), now),
  };
}

/**
 * Bulk export, one page at a time; the Admin's browser joins the pages into a file.
 * @param {CustomersEnv} env
 * @param {NonNullable<Awaited<ReturnType<typeof loadKeys>>>} keys
 * @param {URL} url
 * @param {{ actor: string, role: string }} actor
 * @param {Date} now
 */
async function bulkExport(env, keys, url, actor, now) {
  const cafeSlug = url.searchParams.get('cafe') ?? '';
  const cursor = url.searchParams.get('cursor') ?? '';
  /** @type {unknown[]} */
  const values = [];
  const where = [];
  if (cafeSlug) {
    const cafe = await env.DB.prepare('SELECT id FROM cafes WHERE slug = ?1')
      .bind(cafeSlug)
      .first();
    if (!cafe) return problem(404, 'unknown_cafe');
    values.push(cafe.id);
    where.push('EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.cafe_id = ?1)');
  }
  if (ID.test(cursor)) {
    values.push(cursor);
    where.push(`c.id > ?${values.length}`);
  }
  const rows = (
    await env.DB.prepare(
      `SELECT c.id, c.pii_ct, c.first_order_at, c.last_order_at FROM customers c
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id LIMIT ${EXPORT_PAGE}`,
    )
      .bind(...values)
      .all()
  ).results;
  const customers = [];
  for (const r of rows) {
    const pii = await open(keys, String(r.pii_ct));
    customers.push({
      id: String(r.id),
      firstName: String(pii.firstName ?? ''),
      phone: String(pii.phone ?? ''),
      firstOrderAt: r.first_order_at,
      lastOrderAt: r.last_order_at,
      optIns: await optIns(env, String(r.id)),
    });
  }
  await audit(env, { ...actor, action: 'bulk_export', count: customers.length }, now);
  return json(200, {
    customers,
    next: rows.length === EXPORT_PAGE ? String(rows.at(-1)?.id) : null,
  });
}

/**
 * Deletion on request (ADR-0010 §7): modules erase first (fail-closed), then in one batch the
 * number goes on the suppression list (keyed hash only), every order loses its contact and
 * notes but keeps its lines and total for counts, consents and the record are removed.
 * Logged without the phone number; it cannot be undone.
 * @param {CustomersEnv} env
 * @param {any} row
 * @param {{ actor: string, role: string }} actor
 * @param {Date} now
 */
async function erase(env, row, actor, now) {
  const id = String(row.id);
  let modules;
  try {
    modules = await runCustomerErase(env, id, now);
  } catch (err) {
    console.error(
      'customer deletion stopped: a module could not erase',
      err instanceof Error ? err.message : '',
    );
    await audit(env, { ...actor, action: 'delete_failed', target: id }, now);
    return problem(500, 'delete_failed');
  }
  const orders = (
    await env.DB.prepare('SELECT id, lines FROM orders WHERE customer_id = ?1').bind(id).all()
  ).results;
  const writes = [
    env.DB.prepare(
      'INSERT INTO suppressions (phone_idx, since) VALUES (?1, ?2) ON CONFLICT DO NOTHING',
    ).bind(row.phone_idx, isoNow(now)),
    ...orders.map((o) =>
      env.DB.prepare(
        `UPDATE orders SET customer_id = NULL, contact_ct = NULL, note = '', lines = ?1 WHERE id = ?2`,
      ).bind(
        JSON.stringify(
          JSON.parse(String(o.lines)).map((/** @type {any} */ l) => {
            const rest = { ...l };
            delete rest.note;
            return rest;
          }),
        ),
        o.id,
      ),
    ),
    env.DB.prepare('DELETE FROM consents WHERE customer_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM customers WHERE id = ?1').bind(id),
  ];
  await env.DB.batch(writes);
  const moduleRows = Object.values(modules).reduce((n, x) => n + x, 0);
  await audit(env, { ...actor, action: 'delete', target: id, count: orders.length }, now);
  return json(200, { deleted: true, ordersAnonymised: orders.length, moduleRows });
}
