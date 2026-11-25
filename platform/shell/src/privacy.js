// @ts-check
/**
 * The current privacy notice (ADR-0010): every edit is a new version; consents point to the
 * version the customer saw. Cached 30 s per Worker instance.
 */

/** @type {{ at: number, value: import('./boot-body.js').PrivacyNotice | null } | null} */
let cache = null;

/**
 * @param {import('./d1.d.js').D1Database} db
 * @param {number} now
 */
export async function latestNotice(db, now) {
  if (cache && now - cache.at < 30_000) return cache.value;
  const row = await db
    .prepare(
      'SELECT version_no, short_text, full_text, opt_in_text FROM privacy_notice_versions ORDER BY version_no DESC LIMIT 1',
    )
    .first();
  const value = row
    ? {
        version: Number(row.version_no),
        short: JSON.parse(String(row.short_text)),
        full: JSON.parse(String(row.full_text)),
        optIn: JSON.parse(String(row.opt_in_text)),
      }
    : null;
  cache = { at: now, value };
  return value;
}

/** For tests. */
export function clearNotice() {
  cache = null;
}
