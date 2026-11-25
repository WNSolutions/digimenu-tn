// @ts-check
/**
 * Opening hours (US-06): "Ouvert · ferme à 23:00" or "Fermé · ouvre à 08:00".
 *
 * Hours come from the café configuration: `{ mon: [["07:00", "23:00"]], ..., sat: [["08:00",
 * "00:30"]] }`. An end time at or before the start means "after midnight" (the interval ends the
 * next day). Times are the café's local time (Tunisia by default, UTC+1, no daylight saving).
 * A closed café still shows its menu; only ordering stops (handled by the caller).
 */

export const DAYS = /** @type {const} */ (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
/** @typedef {typeof DAYS[number]} Day */
/** @typedef {Partial<Record<Day, [string, string][]>>} Hours */

const WEEK = 7 * 1440;

/** @param {string} hhmm */
function toMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new RangeError(`not a time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Day of week (0 = Monday) and minutes since midnight in a time zone.
 * @param {Date} now
 * @param {string} timeZone
 */
export function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  /** @param {string} type */
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * @typedef {{ open: true, closesAt: string }
 *   | { open: false, opensAt: string, opensDay: Day, sameDay: boolean }
 *   | { open: false, opensAt: null }} OpenStatus
 */

/**
 * Whether the café is open now, and the next change.
 * @param {Hours | undefined} hours
 * @param {Date} now
 * @param {string} [timeZone]
 * @returns {OpenStatus | null}  null when the café has no hours (nothing is shown)
 */
export function openStatus(hours, now, timeZone = 'Africa/Tunis') {
  if (!hours) return null;
  /** @type {{ start: number, end: number, endText: string, startText: string }[]} */
  const spans = [];
  DAYS.forEach((day, d) => {
    for (const [from, to] of hours[day] ?? []) {
      const start = d * 1440 + toMinutes(from);
      let end = d * 1440 + toMinutes(to);
      if (end <= start) end += 1440;
      for (const shift of [-WEEK, 0, WEEK]) {
        spans.push({ start: start + shift, end: end + shift, endText: to, startText: from });
      }
    }
  });
  if (spans.length === 0) return { open: false, opensAt: null };
  const clock = localClock(now, timeZone);
  const t = clock.day * 1440 + clock.minutes;
  const current = spans.find((s) => s.start <= t && t < s.end);
  if (current) return { open: true, closesAt: current.endText };
  const next = spans.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
  if (!next) return { open: false, opensAt: null };
  const nextDay = DAYS[((Math.floor(next.start / 1440) % 7) + 7) % 7];
  return {
    open: false,
    opensAt: next.startText,
    opensDay: nextDay,
    sameDay: Math.floor(next.start / 1440) === clock.day || next.start - t < 12 * 60,
  };
}

/**
 * A time of day, "14:32", in the café's time zone (24-hour clock, Western digits).
 * @param {number} ms
 * @param {string} [timeZone]
 */
export function formatClock(ms, timeZone = 'Africa/Tunis') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}
