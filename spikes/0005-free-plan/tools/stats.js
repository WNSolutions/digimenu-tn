/**
 * Pure helpers for the spike's measurements: percentiles, reading `wrangler tail --format json`
 * output, and naming each request so results can be grouped. No I/O here, so it is unit-tested.
 */

/**
 * Nearest-rank percentile (p in 0..100) of a list of numbers. Returns null for an empty list.
 * @param {number[]} values
 * @param {number} p
 * @returns {number | null}
 */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/**
 * @param {number[]} values
 * @returns {{ count: number, p50: number | null, p90: number | null, p99: number | null, max: number | null }}
 */
export function summarize(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : null,
  };
}

/**
 * Splits a stream of concatenated JSON objects (wrangler prints each tail event as a
 * pretty-printed object) into parsed objects. Anything outside an object is skipped.
 * @param {string} text
 * @returns {any[]}
 */
export function parseJsonStream(text) {
  /** @type {any[]} */
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          objects.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Not valid JSON (for example a log line with braces): skip it.
        }
      }
    }
  }
  return objects;
}

/**
 * The URL of the request behind a tail event, or null (Durable Object alarms, WebSocket
 * messages and other events have none).
 * @param {any} event
 * @returns {URL | null}
 */
export function eventUrl(event) {
  const raw = event?.event?.request?.url;
  if (typeof raw !== 'string') return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * CPU time of a tail event in milliseconds, whichever field name the platform uses.
 * @param {any} event
 * @returns {number | null}
 */
export function cpuTimeOf(event) {
  for (const key of ['cpuTime', 'cpuTimeMs', 'CPUTimeMs']) {
    const value = event?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * A short label for what a request measured, used to group results.
 * @param {URL} url
 * @returns {string}
 */
export function routeLabel(url) {
  const path = url.pathname;
  if (path === '/api/spike/hash') return `hash:${url.searchParams.get('iter')}`;
  if (path === '/api/spike/aes') return `aes:${url.searchParams.get('n')}`;
  if (path === '/api/spike/ping') return 'ping';
  if (path === '/api/spike/db') return 'd1-write-read';
  if (/^\/ssr\/[^/]+\/t\/[^/]+\/?$/.test(path)) return 'ssr-menu-150';
  if (/^\/api\/[^/]+\/menu$/.test(path)) return 'menu-json-d1';
  if (/^\/api\/[^/]+\/hub(\/.*)?$/.test(path)) return 'hub';
  if (/^\/[^/]+\/t\/[^/]+\/?$/.test(path)) return 'table-page';
  return 'other';
}

/**
 * Groups tail events by route label: CPU times and outcome counts.
 * @param {any[]} events
 * @returns {Record<string, { cpu: number[], outcomes: Record<string, number> }>}
 */
export function groupEvents(events) {
  /** @type {Record<string, { cpu: number[], outcomes: Record<string, number> }>} */
  const groups = {};
  for (const event of events) {
    const url = eventUrl(event);
    const label = url ? routeLabel(url) : 'no-request';
    const group = (groups[label] ??= { cpu: [], outcomes: {} });
    const cpu = cpuTimeOf(event);
    if (cpu !== null) group.cpu.push(cpu);
    const outcome = String(event?.outcome ?? 'unknown');
    group.outcomes[outcome] = (group.outcomes[outcome] ?? 0) + 1;
  }
  return groups;
}

/**
 * The highest iteration count that fits the budget: walking up from the lowest measured count,
 * every count up to and including it has p99 CPU time ≤ budget and no failed request.
 * Stopping at the first miss keeps one lucky high count from being picked. Null if none fits.
 * @param {Record<string, { cpu: number[], outcomes: Record<string, number> }>} groups
 * @param {number} budgetMs
 * @returns {number | null}
 */
export function bestIterations(groups, budgetMs) {
  const measured = Object.entries(groups)
    .filter(([label, group]) => label.startsWith('hash:') && group.cpu.length > 0)
    .map(([label, group]) => ({ iterations: Number(label.slice(5)), group }))
    .sort((a, b) => a.iterations - b.iterations);
  let best = null;
  for (const { iterations, group } of measured) {
    const failed = Object.keys(group.outcomes).some((outcome) => outcome !== 'ok');
    const p99 = percentile(group.cpu, 99);
    if (failed || p99 === null || p99 > budgetMs) break;
    best = iterations;
  }
  return best;
}
