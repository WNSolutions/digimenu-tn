// @ts-check
/**
 * The retention rule (D-067, ADR-0010): a customer record with no order for 24 months is
 * deleted. Runs every night from the Worker's cron trigger (wrangler.template.jsonc).
 *
 * Each run erases at most `batch` records, oldest first, so a run stays well inside the
 * Worker's limits; the next night takes the rest. A record a module cannot erase is skipped
 * and logged (fail-closed for that record); the others go on. One audit line per run with the
 * count, never a number or a name.
 */
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { eraseCustomer } from './customer-erase.js';

export const RETENTION_MONTHS = 24;

/**
 * The cut-off: the same day and time, `months` earlier (end of month when that day is missing,
 * e.g. 31 March → 28 or 29 February).
 * @param {Date} now
 * @param {number} months
 */
export function cutoff(now, months = RETENTION_MONTHS) {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * @param {import('./module-host.js').HostEnv} env
 * @param {{ now?: Date, months?: number, batch?: number }} [o]
 * @returns {Promise<{ deleted: number, failed: number, before: string }>}
 */
export async function runRetention(env, o = {}) {
  const now = o.now ?? new Date();
  const before = isoNow(cutoff(now, o.months ?? RETENTION_MONTHS));
  const rows = (
    await env.DB.prepare(
      `SELECT id, phone_idx FROM customers WHERE last_order_at < ?1 ORDER BY last_order_at, id LIMIT ?2`,
    )
      .bind(before, o.batch ?? 200)
      .all()
  ).results;
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await eraseCustomer(env, /** @type {any} */ (row), { suppress: false, now });
      deleted++;
    } catch (err) {
      failed++;
      console.error(
        'retention: a record could not be erased',
        err instanceof Error ? err.message : '',
      );
    }
  }
  if (rows.length) {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, record_count, at)
       VALUES (?1, 'customers', ?2, NULL, NULL, 'system', 'system', ?3, ?4)`,
    )
      .bind(ulid(now.getTime()), failed ? 'retention_partial' : 'retention', deleted, isoNow(now))
      .run();
  }
  return { deleted, failed, before };
}
