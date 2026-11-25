// @ts-check
/**
 * Café-local day and hour for counters ("2026-11-25", 14). Tunisia is UTC+1 all year, but the
 * time zone comes from the café configuration so another city can deploy the toolkit.
 * @param {Date} now
 * @param {string} [timeZone]
 */
export function localDayHour(now, timeZone = 'Africa/Tunis') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  /** @param {string} type */
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** @param {Date} now */
export const isoNow = (now) => now.toISOString().replace(/\.\d{3}Z$/, 'Z');
