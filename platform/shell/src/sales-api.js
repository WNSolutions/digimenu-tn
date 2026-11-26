// @ts-check
/**
 * What DigiMenu sold (issue #28, US-39, C-12): the Manager's sales dashboard and Admin's export.
 *
 *   GET /admin/api/sales?cafe=<slug>&month=YYYY-MM     Manager (own café), Admin
 *       today, yesterday, this month and last month (orders, sales, average basket, dine-in and
 *       takeaway); the chosen month day by day, its top 10 items by quantity and by sales, its
 *       busy hours (café time) and days of the week; monthly totals for 12 months.
 *   GET /admin/api/sales/export?from=YYYY-MM-DD&to=YYYY-MM-DD     Admin
 *       every live café, one row per day: orders, sales, dine-in and takeaway. The staff app
 *       turns it into CSV files. Same counting as the dashboard, so the totals match to the
 *       millime (tested).
 *
 * **What counts as sold:** an order staff accepted (accepted, ready or served). Orders still
 * waiting, refused, not confirmed or cancelled are not sales. At a live café, from its go-live
 * day, test orders left out; before go-live every order is a test, shown as such and never
 * exported. Only orders made through DigiMenu: not the café's whole till.
 *
 * Nothing here reads a customer: no name, phone or contact ever leaves the orders table.
 * Amounts are whole millimes. One answer per café and month is kept 60 s per Worker instance.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn } from './auth.js';
import { resolveCafe } from './cafes.js';
import { localDayHour } from './clock.js';

const VIEW = ['manager', 'admin'];
const SOLD = "('accepted', 'ready', 'served')";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_EXPORT_DAYS = 400;
const TTL_MS = 60_000;
const TOP = 10;

/** @typedef {import('./auth.js').AuthEnv} SalesEnv */
/** @typedef {{ orders: number, sales: number }} Count */
/**
 * @typedef {object} Totals
 * @property {number} orders
 * @property {number} sales      millimes
 * @property {number} basket     millimes, sales / orders rounded (0 without orders)
 * @property {Count} dineIn
 * @property {Count} takeaway
 */

/** @type {Map<string, { at: number, body: unknown }>} */
const cache = new Map();

/** For tests. */
export function clearSalesCache() {
  cache.clear();
}

/** "2026-11-26" plus n days. @param {string} day @param {number} n */
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11" plus n months. @param {string} month @param {number} n */
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Last day of a month "YYYY-MM". @param {string} month */
export const monthEnd = (month) => addDays(`${addMonths(month, 1)}-01`, -1);

/** @returns {Totals} */
const empty = () => ({
  orders: 0,
  sales: 0,
  basket: 0,
  dineIn: { orders: 0, sales: 0 },
  takeaway: { orders: 0, sales: 0 },
});

/**
 * Rows of (day, type, orders, sales) added up per day and in all. The dashboard and the export
 * both count with this, so their totals are the same.
 * @param {{ day: string, type: string, orders: number, sales: number }[]} rows
 * @returns {{ days: (Totals & { day: string })[], totals: Totals }}
 */
export function aggregate(rows) {
  /** @type {Map<string, Totals & { day: string }>} */
  const days = new Map();
  const totals = empty();
  for (const r of rows) {
    const d = days.get(r.day) ?? { day: r.day, ...empty() };
    for (const t of [d, totals]) {
      t.orders += r.orders;
      t.sales += r.sales;
      const part = r.type === 'takeaway' ? t.takeaway : t.dineIn;
      part.orders += r.orders;
      part.sales += r.sales;
    }
    days.set(r.day, d);
  }
  for (const t of [...days.values(), totals])
    t.basket = t.orders ? Math.round(t.sales / t.orders) : 0;
  return { days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)), totals };
}

/**
 * The chosen month's orders, line by line: the top items, busy hours and days of the week.
 * @param {{ day: string, created_at: string, lines: string }[]} orders
 * @param {string} timeZone
 */
export function monthDetail(orders, timeZone) {
  /** @type {Map<string, { id: string, name: unknown, qty: number, sales: number }>} */
  const items = new Map();
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  for (const o of orders) {
    hours[localDayHour(new Date(o.created_at), timeZone).hour] += 1;
    weekdays[(new Date(`${o.day}T12:00:00Z`).getUTCDay() + 6) % 7] += 1;
    /** @type {any[]} */
    let lines = [];
    try {
      lines = JSON.parse(o.lines);
    } catch {
      /* a damaged line list: the order still counts in the totals */
    }
    for (const l of lines) {
      const id = String(l.itemId ?? l.variantId ?? '');
      if (!id) continue;
      const it = items.get(id) ?? { id, name: l.name ?? null, qty: 0, sales: 0 };
      it.qty += Number(l.qty) || 0;
      it.sales += Number(l.total) || 0;
      it.name = l.name ?? it.name;
      items.set(id, it);
    }
  }
  const all = [...items.values()];
  return {
    byQty: [...all].sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, TOP),
    bySales: [...all].sort((a, b) => b.sales - a.sales || b.qty - a.qty).slice(0, TOP),
    hours,
    weekdays,
  };
}

/** @param {any[]} rows */
const counted = (rows) =>
  rows.map((r) => ({
    day: String(r.day),
    type: String(r.type),
    orders: Number(r.orders),
    sales: Number(r.sales ?? 0),
  }));

/**
 * @param {Request} request
 * @param {SalesEnv} env
 * @param {string} route   "sales" or "sales/export"
 * @param {Date} [now]
 */
export async function handleSales(request, env, route, now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'method_not_allowed');
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const url = new URL(request.url);

  if (route === 'sales/export') {
    if (!account.roles.some((r) => r.role === 'admin')) return problem(403, 'forbidden');
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!DAY.test(from) || !DAY.test(to) || from > to) return problem(400, 'bad_range');
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(span) || span + 1 > MAX_EXPORT_DAYS) return problem(400, 'bad_range');
    const rows = (
      await env.DB.prepare(
        `SELECT c.slug, o.day, o.type, COUNT(*) AS orders, SUM(o.total) AS sales
           FROM orders o JOIN cafes c ON c.id = o.cafe_id
          WHERE o.day BETWEEN ?1 AND ?2 AND o.status IN ${SOLD} AND o.is_test = 0
            AND c.status = 'live' AND (c.go_live_on IS NULL OR o.day >= c.go_live_on)
          GROUP BY c.slug, o.day, o.type
          ORDER BY c.slug, o.day`,
      )
        .bind(from, to)
        .all()
    ).results;
    /** @type {Map<string, any[]>} */
    const byCafe = new Map();
    for (const r of rows) {
      const list = byCafe.get(String(r.slug)) ?? [];
      list.push(r);
      byCafe.set(String(r.slug), list);
    }
    const cafes = [];
    for (const [slug, list] of byCafe) {
      const cafe = await resolveCafe(env.DB, slug, now.getTime());
      cafes.push({ slug, name: cafe?.config.names ?? null, ...aggregate(counted(list)) });
    }
    return json(200, { from, to, cafes });
  }

  if (route !== 'sales') return problem(404, 'not_found');
  const cafe = await resolveCafe(env.DB, url.searchParams.get('cafe') ?? '', now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !VIEW.includes(role)) return problem(403, 'forbidden');

  const timeZone = cafe.config.timeZone ?? 'Africa/Tunis';
  const today = localDayHour(now, timeZone).day;
  const thisMonth = today.slice(0, 7);
  const first = addMonths(thisMonth, -11);
  const month = url.searchParams.get('month') ?? thisMonth;
  if (!MONTH.test(month) || month > thisMonth || month < first) return problem(400, 'bad_month');

  const key = `${cafe.id}:${month}:${today}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < TTL_MS) return json(200, hit.body);

  const row = await env.DB.prepare('SELECT status, go_live_on FROM cafes WHERE id = ?1')
    .bind(cafe.id)
    .first();
  const live = row?.status === 'live';
  const goLive = live && row?.go_live_on ? String(row.go_live_on) : null;
  // At a live café: real orders from go-live. Before: every order, all of them tests.
  const real = live ? `AND is_test = 0 ${goLive ? 'AND day >= ?4' : ''}` : '';
  /** @param {string} from @param {string} to */
  const bind = (from, to) => (live && goLive ? [cafe.id, from, to, goLive] : [cafe.id, from, to]);

  const lastMonth = addMonths(thisMonth, -1);
  const recent = aggregate(
    counted(
      (
        await env.DB.prepare(
          `SELECT day, type, COUNT(*) AS orders, SUM(total) AS sales FROM orders
            WHERE cafe_id = ?1 AND day BETWEEN ?2 AND ?3 AND status IN ${SOLD} ${real}
            GROUP BY day, type`,
        )
          .bind(...bind(`${lastMonth}-01`, today))
          .all()
      ).results,
    ),
  );
  /** @param {(day: string) => boolean} keep */
  const within = (keep) =>
    aggregate(
      recent.days
        .flatMap((d) => [
          { day: d.day, type: 'dine_in', ...d.dineIn },
          { day: d.day, type: 'takeaway', ...d.takeaway },
        ])
        .filter((r) => keep(r.day) && r.orders),
    ).totals;
  const yesterday = addDays(today, -1);

  const monthRows = (
    await env.DB.prepare(
      `SELECT day, type, total, lines, created_at FROM orders
        WHERE cafe_id = ?1 AND day BETWEEN ?2 AND ?3 AND status IN ${SOLD} ${real}`,
    )
      .bind(...bind(`${month}-01`, monthEnd(month)))
      .all()
  ).results.map((r) => ({
    day: String(r.day),
    type: String(r.type),
    total: Number(r.total),
    lines: String(r.lines),
    created_at: String(r.created_at),
  }));
  const chosen = aggregate(
    monthRows.map((r) => ({ day: r.day, type: r.type, orders: 1, sales: r.total })),
  );

  const months = (
    await env.DB.prepare(
      `SELECT substr(day, 1, 7) AS month, COUNT(*) AS orders, SUM(total) AS sales FROM orders
        WHERE cafe_id = ?1 AND day BETWEEN ?2 AND ?3 AND status IN ${SOLD} ${real}
        GROUP BY month ORDER BY month`,
    )
      .bind(...bind(`${first}-01`, today))
      .all()
  ).results;

  const body = {
    cafe: { slug: cafe.slug, name: cafe.config.names ?? null },
    test: !live,
    goLive,
    today,
    periods: {
      today: within((d) => d === today),
      yesterday: within((d) => d === yesterday),
      thisMonth: within((d) => d.startsWith(thisMonth)),
      lastMonth: within((d) => d.startsWith(lastMonth)),
    },
    month,
    months: Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(first, i);
      const r = months.find((x) => x.month === m);
      return { month: m, orders: Number(r?.orders ?? 0), sales: Number(r?.sales ?? 0) };
    }),
    chosen: { totals: chosen.totals, days: chosen.days, ...monthDetail(monthRows, timeZone) },
  };
  cache.set(key, { at: now.getTime(), body });
  return json(200, body);
}
