// @ts-check
/**
 * Admin's overview of every café (issue #28, US-48): what runs where, signs of life, and what
 * needs attention now. One screen instead of opening each café.
 *
 *   GET /admin/api/overview      Admin only
 *
 * Per café (not closed): status, release, modules switched on, last menu change, last visit
 * (hour), last order, open now or not; and its alerts:
 *   - orders_waiting     orders sent to the staff screen not accepted after 10 minutes (today);
 *   - no_staff_device    open now, takes orders on the staff screen, and no staff device has
 *                        been connected for 10 minutes (the café hub's presence);
 *   - failed_sign_ins    an account of the café locked, or with 5 wrong passwords in a row.
 * For the whole platform:
 *   - customer_exports   customer records exported in the last 7 days (who and how many are in
 *                        the audit log);
 *   - failed_sign_ins    the same, for Admin accounts.
 *
 * Not watched here: whether the site answers from outside, and the free plan's quotas. A Worker
 * cannot see itself from outside, and Cloudflare's usage needs an API token with analytics
 * rights; both wait for Ahmed's choice (HQ open question Q33). The answer says so
 * (`external.watched: false`), so the screen never implies they are fine.
 *
 * Reads counts, dates and first names of staff accounts only: no customer, no order content.
 */
import { json, problem } from './http.js';
import { currentAccount } from './auth.js';
import { resolveCafe } from './cafes.js';
import { hubOf } from './cafe-hub.js';
import { isoNow, localDayHour } from './clock.js';
import { openStatus } from '../../../core/hours.js';
import { MODULE_CATALOG } from './module-catalog.js';

const WAIT_MS = 10 * 60_000;
const DEVICE_GAP_MS = 10 * 60_000;
const EXPORT_DAYS = 7;
const FAILED = 5;

/** @typedef {import('./auth.js').AuthEnv} OverviewEnv */
/** @typedef {{ code: string, [k: string]: unknown }} Alert */

/**
 * Whether the café takes orders on the staff screen (a "send_order" channel).
 * @param {any} config
 */
export function usesStaffScreen(config) {
  return Object.values(config?.ordering?.types ?? {}).some((t) =>
    [t?.channel].flat().includes('send_order'),
  );
}

/**
 * The café hub's presence, or null where there is no hub or it does not answer.
 * @param {object} env
 * @param {string} cafeId
 * @returns {Promise<{ devices: number, lastSeen: string | null } | null>}
 */
async function presence(env, cafeId) {
  const hub = hubOf(env, cafeId);
  if (!hub) return null;
  try {
    const res = await hub.fetch('https://hub/presence');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {OverviewEnv} env
 * @param {Date} [now]
 */
export async function handleOverview(request, env, now = new Date()) {
  if (request.method !== 'GET') return problem(405, 'method_not_allowed');
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  if (!account.roles.some((r) => r.role === 'admin')) return problem(403, 'forbidden');

  const rows = (
    await env.DB.prepare(
      `SELECT c.id, c.slug, c.status, c.pinned_release, c.go_live_on,
              (SELECT MAX(at) FROM menu_changes m
                WHERE m.cafe_id = c.id AND m.source IN ('editor', 'undo', 'import')) AS last_menu,
              (SELECT MAX(day || ' ' || printf('%02d', hour)) FROM analytics_counters a
                WHERE a.cafe_id = c.id AND a.metric = 'visit') AS last_visit,
              (SELECT created_at || '|' || is_test FROM orders o
                WHERE o.cafe_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_order
         FROM cafes c WHERE c.status != 'closed' ORDER BY c.slug`,
    ).all()
  ).results;

  const waitingBefore = isoNow(new Date(now.getTime() - WAIT_MS));
  const waiting = (
    await env.DB.prepare(
      `SELECT cafe_id, COUNT(*) AS n, MIN(created_at) AS oldest FROM orders
        WHERE status = 'received' AND created_at <= ?1 AND created_at >= ?2
        GROUP BY cafe_id`,
    )
      .bind(waitingBefore, isoNow(new Date(now.getTime() - 24 * 3_600_000)))
      .all()
  ).results;

  const locked = (
    await env.DB.prepare(
      `SELECT m.cafe_id, u.display_name, u.failed_count, u.locked_until FROM users u
         JOIN memberships m ON m.user_id = u.id
        WHERE u.disabled_at IS NULL AND (u.failed_count >= ?1 OR u.locked_until > ?2)
        ORDER BY u.display_name`,
    )
      .bind(FAILED, isoNow(now))
      .all()
  ).results;
  /** @param {string} cafeId */
  const failedAt = (cafeId) => {
    const people = locked.filter((r) => r.cafe_id === cafeId);
    return people.length
      ? [
          {
            code: 'failed_sign_ins',
            people: [...new Set(people.map((r) => String(r.display_name)))],
            locked: people.filter((r) => r.locked_until && String(r.locked_until) > isoNow(now))
              .length,
          },
        ]
      : [];
  };

  const cafes = [];
  for (const r of rows) {
    const cafe = await resolveCafe(env.DB, String(r.slug), now.getTime());
    if (!cafe) continue;
    const config = cafe.config;
    const timeZone = config.timeZone ?? 'Africa/Tunis';
    const open = openStatus(config.hours, now, timeZone);
    /** @type {Alert[]} */
    const alerts = [];
    const w = waiting.find((x) => x.cafe_id === r.id);
    if (w) alerts.push({ code: 'orders_waiting', count: Number(w.n), since: String(w.oldest) });
    if (r.status === 'live' && open?.open && usesStaffScreen(config)) {
      const p = await presence(env, String(r.id));
      if (
        p &&
        p.devices === 0 &&
        (!p.lastSeen || now.getTime() - Date.parse(p.lastSeen) >= DEVICE_GAP_MS)
      )
        alerts.push({ code: 'no_staff_device', lastSeen: p.lastSeen });
    }
    alerts.push(...failedAt(String(r.id)));
    const [lastOrderAt, lastOrderTest] = r.last_order ? String(r.last_order).split('|') : [];
    const [visitDay, visitHour] = r.last_visit ? String(r.last_visit).split(' ') : [];
    cafes.push({
      slug: String(r.slug),
      name: config.names ?? null,
      status: String(r.status),
      goLive: r.go_live_on === null ? null : String(r.go_live_on),
      release: String(r.pinned_release),
      modules: Object.entries(config.modules ?? {})
        .filter(([, m]) => /** @type {any} */ (m)?.enabled === true)
        .map(([k]) => k)
        // Modules of the catalog only: the other keys are core settings (languages, order types).
        .filter((k) => Object.hasOwn(MODULE_CATALOG, k))
        .sort()
        .map((key) => ({ key, title: MODULE_CATALOG[key].title })),
      open: open ? open.open : null,
      lastMenuChange: r.last_menu === null ? null : String(r.last_menu),
      lastVisit: visitDay ? { day: visitDay, hour: Number(visitHour) } : null,
      lastOrder: lastOrderAt ? { at: lastOrderAt, test: lastOrderTest === '1' } : null,
      alerts,
    });
  }

  /** @type {Alert[]} */
  const alerts = [];
  const exports = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MAX(at) AS last, SUM(record_count) AS records FROM audit_log
      WHERE category = 'customers' AND action IN ('export', 'bulk_export') AND at >= ?1`,
  )
    .bind(isoNow(new Date(now.getTime() - EXPORT_DAYS * 86_400_000)))
    .first();
  if (Number(exports?.n ?? 0) > 0)
    alerts.push({
      code: 'customer_exports',
      count: Number(exports?.n),
      records: Number(exports?.records ?? 0),
      last: String(exports?.last),
    });
  alerts.push(...failedAt(''));

  return json(200, {
    at: isoNow(now),
    today: localDayHour(now, 'Africa/Tunis').day,
    cafes,
    alerts,
    external: { watched: false },
  });
}
