// @ts-check
/**
 * POST /api/orders           store an order (dine-in or takeaway), with customer and consent
 * GET  /api/orders/status    ?cafe=&key=<client key>: number and status of the phone's order
 *
 * The phone sends ids and quantities only; every price is recomputed here from the published
 * menu snapshot (client totals are ignored). The order, the customer record and the consent
 * records are written in one transaction (ADR-0010). A retry with the same client key returns
 * the same order (exactly one order per tap).
 */
import { json, problem } from './http.js';
import { resolveCafe, menuSnapshot, findTable } from './cafes.js';
import { tableStatus } from './boot-body.js';
import { localDayHour, isoNow } from './clock.js';
import { ulid } from './ids.js';
import { loadKeys, seal, lookupHash } from './crypto.js';
import { normalizePhone } from '../../../core/phone.js';
import { indexSnapshot, isOrderable } from '../../../core/menu/snapshot.js';
import { lineTotal, sum } from '../../../core/money.js';
import { cleanNote, NOTE_MAX } from '../../../core/list.js';
import { openStatus } from '../../../core/hours.js';
import { runAfterStore } from './module-host.js';

const MAX_BODY = 16_384;
const MAX_LINES = 50;
const CLIENT_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const TABLE_LIMIT = { orders: 5, minutes: 10 };

/** @typedef {import('./d1.d.js').Env & { FIELD_KEY?: string, LOOKUP_KEY?: string, KEY_VERSION?: string }} OrdersEnv */

/**
 * @typedef {object} OrderRequest
 * @property {string} cafe
 * @property {string} clientKey
 * @property {'dine_in' | 'takeaway'} type
 * @property {string} channel
 * @property {string} [table]
 * @property {string} [code]
 * @property {{ variantId: string, qty: number, note?: string }[]} lines
 * @property {string} [note]
 * @property {string} [lang]
 * @property {{ firstName?: string, phone?: string }} [customer]
 * @property {{ orderUpdates?: boolean, marketing?: boolean, loyalty?: boolean }} [consents]
 * @property {number} [noticeVersion]
 * @property {Record<string, unknown>} [modules]   what enabled modules' checkout fields sent
 */

/** The channels a café configured for an order type (one module or two, D-063). */
function channelsFor(/** @type {any} */ config, /** @type {string} */ type) {
  const channel = config.ordering?.types?.[type]?.channel;
  const list = Array.isArray(channel) ? channel : channel ? [channel] : [];
  return list.filter((key) => config.modules?.[key]?.enabled);
}

/**
 * Prices the lines against the published menu.
 * @param {import('../../../core/menu/snapshot.js').Snapshot} menu
 * @param {OrderRequest['lines']} lines
 * @param {number} maxQty
 */
export function priceLines(menu, lines, maxQty) {
  const index = indexSnapshot(menu);
  /** @type {string[]} */
  const unavailable = [];
  const priced = [];
  for (const line of lines) {
    const entry = index.get(String(line?.variantId ?? ''));
    const qty = line?.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) return { error: 'bad_quantity' };
    if (!entry || !isOrderable(entry)) {
      unavailable.push(String(line?.variantId ?? ''));
      continue;
    }
    const note = cleanNote(String(line.note ?? ''));
    priced.push({
      itemId: entry.item.id,
      variantId: entry.variant.id,
      name: entry.item.name,
      ...(entry.variant.name ? { variantName: entry.variant.name } : {}),
      qty,
      unitPrice: entry.variant.price,
      total: lineTotal(entry.variant.price, qty),
      ...(note ? { note } : {}),
    });
  }
  if (unavailable.length) return { error: 'unavailable', items: unavailable };
  return { lines: priced, total: sum(priced.map((l) => l.total)) };
}

/**
 * @param {Request} request
 * @param {OrdersEnv} env
 * @param {Date} [now]
 */
export async function handleCreateOrder(request, env, now = new Date()) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return problem(413, 'too_large');
  /** @type {OrderRequest} */
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return problem(413, 'too_large');
    body = JSON.parse(text);
  } catch {
    return problem(400, 'bad_request');
  }
  if (!body || typeof body !== 'object' || !CLIENT_KEY.test(String(body.clientKey ?? ''))) {
    return problem(400, 'bad_request');
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_LINES) {
    return problem(400, 'bad_request');
  }

  const cafe = await resolveCafe(env.DB, String(body.cafe ?? ''), now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  if (cafe.status === 'paused') return problem(409, 'paused');
  const config = /** @type {any} */ (cafe.config);

  // Idempotency first: a retry of a stored order gets the same answer, whatever changed since.
  const existing = await findByClientKey(env, cafe.id, body.clientKey);
  if (existing) return json(200, await withModules(env, cafe, existing, body, false, now));

  const type = body.type;
  if (type !== 'dine_in' && type !== 'takeaway') return problem(400, 'bad_request');
  const channels = channelsFor(config, type);
  if (!channels.includes(String(body.channel))) return problem(409, 'ordering_off');

  const hours = openStatus(config.hours, now, config.timeZone);
  if (hours && !hours.open) return problem(409, 'closed');

  /** @type {string | null} */
  let tableLabel = null;
  if (type === 'dine_in') {
    const label = String(body.table ?? '')
      .trim()
      .slice(0, 16);
    const row = label ? await findTable(env.DB, cafe.id, label) : null;
    const table = tableStatus(row, body.code ? String(body.code) : null);
    if (!table?.valid) return problem(422, 'table_code');
    tableLabel = table.label;
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE cafe_id = ?1 AND table_label = ?2 AND created_at > ?3`,
    )
      .bind(cafe.id, tableLabel, isoNow(new Date(now.getTime() - TABLE_LIMIT.minutes * 60_000)))
      .first();
    if (Number(recent?.n ?? 0) >= TABLE_LIMIT.orders) return problem(429, 'too_many_orders');
  }

  const menu = await menuSnapshot(env.DB, cafe.id, cafe.menuRev);
  if (!menu) return problem(503, 'not_published');
  const priced = priceLines(menu, body.lines, config.ordering?.maxQtyPerLine ?? 20);
  if ('error' in priced) return json(422, priced);
  if (config.ordering?.maxOrderTotal && priced.total > config.ordering.maxOrderTotal) {
    return problem(422, 'total_too_large');
  }
  const note = cleanNote(String(body.note ?? ''));
  if (Array.from(String(body.note ?? '')).length > NOTE_MAX * 2) return problem(400, 'bad_request');

  // Customer details: required for takeaway, and for dine-in unless the café made them optional.
  const detailsRequired =
    type === 'takeaway' || (config.ordering?.dineInDetails ?? 'required') === 'required';
  const firstName = String(body.customer?.firstName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const phoneInput = String(body.customer?.phone ?? '').trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  const hasDetails = Boolean(firstName || phoneInput);
  if (
    (detailsRequired || hasDetails) &&
    (!firstName || Array.from(firstName).length > 40 || !phone)
  ) {
    return problem(422, 'customer_details');
  }

  const lang = ['fr', 'ar', 'en'].includes(String(body.lang)) ? String(body.lang) : 'fr';
  const at = isoNow(now);
  const { day } = localDayHour(now, config.timeZone);
  const orderId = ulid(now.getTime());
  /** @type {import('./d1.d.js').D1PreparedStatement[]} */
  const writes = [];
  /** @type {string | null} */
  let phoneIdx = null;
  /** @type {string | null} */
  let contactCt = null;

  if (phone) {
    const keys = await loadKeys(env);
    if (!keys) return problem(503, 'customer_data_unavailable');
    const notice = await env.DB.prepare(
      'SELECT version_no FROM privacy_notice_versions ORDER BY version_no DESC LIMIT 1',
    ).first();
    if (!notice) return problem(503, 'no_privacy_notice');
    if (Number(body.noticeVersion) !== Number(notice.version_no))
      return problem(409, 'notice_changed');
    phoneIdx = await lookupHash(keys, phone);
    const pii = await seal(keys, { firstName, phone });
    contactCt = await seal(keys, { firstName, phone });
    writes.push(
      env.DB.prepare(
        `INSERT INTO customers (id, phone_idx, pii_ct, phone_last3, key_version, first_order_at, last_order_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT (phone_idx) DO UPDATE SET pii_ct = excluded.pii_ct, key_version = excluded.key_version, last_order_at = excluded.last_order_at`,
      ).bind(ulid(now.getTime()), phoneIdx, pii, phone.slice(-3), keys.version, at),
    );
  }

  const status = body.channel === 'whatsapp_handoff' ? 'handoff' : 'received';
  const counter = await env.DB.prepare(
    `INSERT INTO order_counters (cafe_id, day, n) VALUES (?1, ?2, 1)
     ON CONFLICT (cafe_id, day) DO UPDATE SET n = n + 1 RETURNING n`,
  )
    .bind(cafe.id, day)
    .first();
  const number = `A${Number(counter?.n ?? 0)}`;

  writes.push(
    env.DB.prepare(
      `INSERT INTO orders (id, cafe_id, client_key, day, number, type, channel, status, table_label, lines, note, total,
                           customer_id, contact_ct, lang, release, menu_rev, is_test, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
               (SELECT id FROM customers WHERE phone_idx = ?13), ?14, ?15, ?16, ?17, ?18, ?19)`,
    ).bind(
      orderId,
      cafe.id,
      body.clientKey,
      day,
      number,
      type,
      String(body.channel),
      status,
      tableLabel,
      JSON.stringify(priced.lines),
      note,
      priced.total,
      phoneIdx,
      contactCt,
      lang,
      cafe.pinnedRelease,
      cafe.menuRev,
      cafe.status === 'demo',
      at,
    ),
  );

  if (phoneIdx) {
    const notice = Number(body.noticeVersion);
    for (const [purpose, granted] of /** @type {const} */ ([
      ['order_updates', Boolean(body.consents?.orderUpdates)],
      ['marketing', Boolean(body.consents?.marketing)],
      // Joining loyalty is recorded only when ticked; leaving is done from the card (ADR-0013).
      ...(body.consents?.loyalty === true && config.modules?.loyalty?.enabled
        ? [['loyalty', true]]
        : []),
    ])) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO consents (id, customer_id, cafe_id, order_id, purpose, granted, notice_version, language, source, at)
           VALUES (?1, (SELECT id FROM customers WHERE phone_idx = ?2), ?3, ?4, ?5, ?6, ?7, ?8, 'checkout', ?9)`,
        ).bind(ulid(now.getTime()), phoneIdx, cafe.id, orderId, purpose, granted, notice, lang, at),
      );
    }
  }

  try {
    await env.DB.batch(writes);
  } catch (err) {
    // Two taps raced: the other one stored the order.
    const raced = await findByClientKey(env, cafe.id, body.clientKey);
    if (raced) return json(200, await withModules(env, cafe, raced, body, false, now));
    throw err;
  }
  const customer = phoneIdx
    ? await env.DB.prepare('SELECT id FROM customers WHERE phone_idx = ?1').bind(phoneIdx).first()
    : null;
  const stored = {
    id: orderId,
    number,
    status,
    type,
    total: priced.total,
    lines: priced.lines,
    note,
    table: tableLabel,
    customerId: customer ? String(customer.id) : null,
  };
  return json(201, await withModules(env, cafe, stored, body, true, now));
}

/**
 * The answer to the phone, with what enabled modules add (order.afterStore, fail-open).
 * The customer id stays on the server.
 * @param {OrdersEnv} env
 * @param {any} cafe
 * @param {NonNullable<Awaited<ReturnType<typeof findByClientKey>>>} order
 * @param {OrderRequest} body
 * @param {boolean} isNew
 * @param {Date} now
 */
async function withModules(env, cafe, order, body, isNew, now) {
  const { customerId, type, ...answer } = order;
  const modules = await runAfterStore(
    env,
    cafe,
    {
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        type,
        total: order.total,
        customerId,
        isNew,
      },
      consents: { ...(body.consents ?? {}) },
      inputs: body.modules && typeof body.modules === 'object' ? body.modules : {},
    },
    now,
  );
  return Object.keys(modules).length ? { ...answer, modules } : answer;
}

/**
 * @param {OrdersEnv} env
 * @param {string} cafeId
 * @param {string} clientKey
 */
async function findByClientKey(env, cafeId, clientKey) {
  const row = await env.DB.prepare(
    `SELECT id, number, status, type, total, lines, note, table_label, customer_id FROM orders WHERE cafe_id = ?1 AND client_key = ?2`,
  )
    .bind(cafeId, clientKey)
    .first();
  if (!row) return null;
  return {
    id: String(row.id),
    number: String(row.number),
    status: String(row.status),
    type: String(row.type),
    total: Number(row.total),
    lines: JSON.parse(String(row.lines)),
    note: String(row.note),
    table: row.table_label === null ? null : String(row.table_label),
    customerId: row.customer_id === null ? null : String(row.customer_id),
  };
}

/**
 * @param {Request} request
 * @param {OrdersEnv} env
 * @param {Date} [now]
 */
export async function handleOrderStatus(request, env, now = new Date()) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  if (!CLIENT_KEY.test(key)) return problem(400, 'bad_request');
  const cafe = await resolveCafe(env.DB, url.searchParams.get('cafe') ?? '', now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const order = await findByClientKey(env, cafe.id, key);
  if (!order) return problem(404, 'unknown_order');
  return json(200, { number: order.number, status: order.status });
}
