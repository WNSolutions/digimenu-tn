// @ts-check
/**
 * Visit counting inside the boot call (no beacon, no cookie, no IP or device id). One counter
 * row per café, local day, hour and dimension "t<table>|<lang>" or "-|<lang>".
 */
import { localDayHour } from './clock.js';

/**
 * @param {import('./d1.d.js').D1Database} db
 * @param {{ cafeId: string, table: string | null, lang: string, now: Date, timeZone?: string }} v
 */
export function countVisit(db, v) {
  const { day, hour } = localDayHour(v.now, v.timeZone);
  const lang = ['fr', 'ar', 'en'].includes(v.lang) ? v.lang : '-';
  const dim = `${v.table ? `t${v.table}` : '-'}|${lang}`;
  return db
    .prepare(
      `INSERT INTO analytics_counters (cafe_id, day, hour, metric, dim, value)
       VALUES (?1, ?2, ?3, 'visit', ?4, 1)
       ON CONFLICT (cafe_id, day, hour, metric, dim) DO UPDATE SET value = value + 1`,
    )
    .bind(v.cafeId, day, hour, dim)
    .run();
}
