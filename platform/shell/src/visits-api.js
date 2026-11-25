// @ts-check
/**
 * Visits and impact numbers (issue #27, US-30, US-31, C-10). Counts only: the boot call adds
 * one to a counter per café, local day, hour and "table|language" (visits.js); nothing here can
 * identify a customer (no names, phones, IP addresses or cookies exist to read).
 *
 *   GET /admin/api/visits?cafe=<slug>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *       Manager (own café), Maintainer (assigned cafés), Admin: per day, per table, per
 *       language and per hour.
 *   GET /admin/api/visits/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *       Admin only: real visits of every live café, one row per café and day, for the grant's
 *       impact report (the staff app turns it into one CSV per café and one for all).
 *
 * Real visits are those of a live café from its go-live day. Visits of a demo or onboarding
 * café are test visits: shown on its own dashboard, marked as such, never exported.
 * Counters are kept (nothing deletes them), so a year is always there.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn } from './auth.js';
import { resolveCafe } from './cafes.js';
import { localDayHour } from './clock.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const VIEW = ['manager', 'maintainer', 'admin'];

/** @typedef {import('./auth.js').AuthEnv} VisitsEnv */

/**
 * The date range asked for, checked; by default the last 28 days (Tunis time).
 * @param {URL} url
 * @param {Date} now
 */
export function range(url, now) {
  const today = localDayHour(now).day;
  const back = new Date(`${today}T12:00:00Z`);
  back.setUTCDate(back.getUTCDate() - 27);
  const from = url.searchParams.get('from') ?? back.toISOString().slice(0, 10);
  const to = url.searchParams.get('to') ?? today;
  if (!DAY.test(from) || !DAY.test(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (!Number.isFinite(days) || days > MAX_DAYS) return null;
  return { from, to };
}

/** "t12|fr" → { table: "12", lang: "fr" }; "-|-" → { table: null, lang: "other" }. @param {string} dim */
export function splitDim(dim) {
  const [t = '-', l = '-'] = dim.split('|');
  return {
    table: t.startsWith('t') ? t.slice(1) : null,
    lang: ['fr', 'ar', 'en'].includes(l) ? l : 'other',
  };
}

/**
 * Adds counter rows into per-day, per-table, per-language and per-hour totals.
 * @param {{ day: string, hour: number, dim: string, value: number }[]} rows
 */
export function summarise(rows) {
  /** @type {Map<string, { day: string, visits: number, withTable: number, noTable: number, fr: number, ar: number, en: number, other: number }>} */
  const days = new Map();
  /** @type {Map<string, number>} */
  const tables = new Map();
  const hours = Array.from({ length: 24 }, () => 0);
  const totals = { visits: 0, withTable: 0, noTable: 0, fr: 0, ar: 0, en: 0, other: 0 };
  for (const r of rows) {
    const n = Number(r.value);
    const { table, lang } = splitDim(String(r.dim));
    const d = days.get(r.day) ?? {
      day: r.day,
      visits: 0,
      withTable: 0,
      noTable: 0,
      fr: 0,
      ar: 0,
      en: 0,
      other: 0,
    };
    for (const t of [d, totals]) {
      t.visits += n;
      t[table ? 'withTable' : 'noTable'] += n;
      t[/** @type {'fr' | 'ar' | 'en' | 'other'} */ (lang)] += n;
    }
    days.set(r.day, d);
    if (table) tables.set(table, (tables.get(table) ?? 0) + n);
    if (r.hour >= 0 && r.hour < 24) hours[r.hour] += n;
  }
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    tables: [...tables.entries()]
      .map(([table, visits]) => ({ table, visits }))
      .sort(
        (a, b) => b.visits - a.visits || a.table.localeCompare(b.table, 'fr', { numeric: true }),
      ),
    hours,
    totals,
  };
}

/**
 * @param {Request} request
 * @param {VisitsEnv} env
 * @param {string} route   "visits" or "visits/export"
 * @param {Date} [now]
 */
export async function handleVisits(request, env, route, now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'method_not_allowed');
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const url = new URL(request.url);
  const span = range(url, now);
  if (!span) return problem(400, 'bad_range');

  if (route === 'visits/export') {
    if (!account.roles.some((r) => r.role === 'admin')) return problem(403, 'forbidden');
    const rows = (
      await env.DB.prepare(
        `SELECT c.slug, a.day, a.dim, SUM(a.value) AS value
           FROM analytics_counters a JOIN cafes c ON c.id = a.cafe_id
          WHERE a.metric = 'visit' AND a.day BETWEEN ?1 AND ?2
            AND c.status = 'live' AND (c.go_live_on IS NULL OR a.day >= c.go_live_on)
          GROUP BY c.slug, a.day, a.dim
          ORDER BY c.slug, a.day`,
      )
        .bind(span.from, span.to)
        .all()
    ).results;
    /** @type {Map<string, { day: string, hour: number, dim: string, value: number }[]>} */
    const byCafe = new Map();
    for (const r of rows) {
      const list = byCafe.get(String(r.slug)) ?? [];
      list.push({ day: String(r.day), hour: -1, dim: String(r.dim), value: Number(r.value) });
      byCafe.set(String(r.slug), list);
    }
    const cafes = [];
    for (const [slug, list] of byCafe) {
      const cafe = await resolveCafe(env.DB, slug, now.getTime());
      const s = summarise(list);
      cafes.push({ slug, name: cafe?.config.names ?? null, days: s.days, totals: s.totals });
    }
    return json(200, { ...span, cafes });
  }

  if (route !== 'visits') return problem(404, 'not_found');
  const cafe = await resolveCafe(env.DB, url.searchParams.get('cafe') ?? '', now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !VIEW.includes(role)) return problem(403, 'forbidden');
  const row = await env.DB.prepare('SELECT status, go_live_on FROM cafes WHERE id = ?1')
    .bind(cafe.id)
    .first();
  const live = row?.status === 'live';
  const goLive = live && row?.go_live_on ? String(row.go_live_on) : null;
  const rows = (
    await env.DB.prepare(
      `SELECT day, hour, dim, value FROM analytics_counters
        WHERE cafe_id = ?1 AND metric = 'visit' AND day BETWEEN ?2 AND ?3
          ${goLive ? 'AND day >= ?4' : ''}`,
    )
      .bind(...(goLive ? [cafe.id, span.from, span.to, goLive] : [cafe.id, span.from, span.to]))
      .all()
  ).results.map((r) => ({
    day: String(r.day),
    hour: Number(r.hour),
    dim: String(r.dim),
    value: Number(r.value),
  }));
  return json(200, {
    ...span,
    cafe: { slug: cafe.slug, name: cafe.config.names ?? null },
    // Before go-live every visit is a test (the team, the owner, the youth trying it).
    test: !live,
    goLive,
    ...summarise(rows),
  });
}
