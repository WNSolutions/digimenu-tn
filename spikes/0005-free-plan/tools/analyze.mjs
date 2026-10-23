#!/usr/bin/env node
/**
 * Turns one spike run into a short report with a go / no-go per question.
 *
 *   node tools/analyze.mjs --results results.json --tail tail.json --out summary.md
 *
 * `results.json` comes from tools/measure.mjs; `tail.json` is what
 * `wrangler tail digimenu-spike --format json` printed while measure.mjs ran.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { bestIterations, groupEvents, parseJsonStream, percentile, summarize } from './stats.js';

const { values: args } = parseArgs({
  options: {
    results: { type: 'string', default: 'results.json' },
    tail: { type: 'string', default: 'tail.json' },
    out: { type: 'string', default: 'summary.md' },
  },
});

/** Free-plan CPU limit per request, and the budget ADR-0006 sets for password hashing. */
const CPU_LIMIT_MS = 10;
const HASH_BUDGET_MS = 7;
const AES_BUDGET_US = 50;

const results = JSON.parse(readFileSync(args.results, 'utf8'));
let tailText = '';
try {
  tailText = readFileSync(args.tail, 'utf8');
} catch {
  // No tail file: behaviour checks only.
}
const events = parseJsonStream(tailText);
const groups = groupEvents(events);
const haveCpu = Object.values(groups).some((g) => g.cpu.length > 0);

/** @param {boolean | null} ok */
const mark = (ok) => (ok === null ? '⚪ unknown' : ok ? '✅ go' : '❌ no-go');

/** @type {{ question: string, verdict: boolean | null, evidence: string }[]} */
const verdicts = [];

// 1. Static table page without the Worker.
const tableEvents = groups['table-page'];
const tableInvocations = tableEvents
  ? Object.values(tableEvents.outcomes).reduce((a, b) => a + b, 0)
  : 0;
const bootServed = Boolean(results.staticPage?.servedBootPage);
/** @type {boolean | null} */
let staticVerdict = false;
if (bootServed) staticVerdict = events.length > 0 ? tableInvocations === 0 : null;
verdicts.push({
  question: 'Table page `/<café>/t/<table>` is one static file, served without running the Worker',
  verdict: staticVerdict,
  evidence: `boot page served: ${bootServed}; Worker runs seen for it: ${events.length > 0 ? tableInvocations : 'no tail'}`,
});

// 2. D1 read and write.
const db = results.database ?? {};
verdicts.push({
  question: 'The Worker reads and writes the D1 database',
  verdict:
    JSON.stringify(db.menuStatuses) === '[200]' &&
    JSON.stringify(db.menuItems) === '[150]' &&
    JSON.stringify(db.writeStatuses) === '[200]',
  evidence: `menu statuses ${JSON.stringify(db.menuStatuses)}, items ${JSON.stringify(db.menuItems)}, write statuses ${JSON.stringify(db.writeStatuses)}, rows after ${db.rowsAfter}`,
});

// 3. Café hub over hibernating WebSockets.
const hub = results.hub ?? {};
const delivered = hub.firstReached === 2 && hub.secondReached === 2;
verdicts.push({
  question: 'The café hub pushes to two browsers over a hibernating WebSocket (free plan)',
  verdict: delivered && hub.hibernated ? true : delivered ? null : false,
  evidence: `push 1 reached ${hub.firstReached}/2; after ${hub.idleMs} ms idle the hub woke ${hub.wakesBeforeIdle} → ${hub.wakesAfterIdle} (hibernated: ${hub.hibernated}); push 2 reached ${hub.secondReached}/2; sockets still open ${hub.socketsStillOpen}/2`,
});

// 4. CPU time of the 150-line server render.
const ssr = summarize(groups['ssr-menu-150']?.cpu ?? []);
verdicts.push({
  question: `Rendering a 150-line menu at the edge stays under the ${CPU_LIMIT_MS} ms CPU limit`,
  verdict: haveCpu && ssr.p99 !== null ? ssr.p99 < CPU_LIMIT_MS : null,
  evidence: haveCpu
    ? `CPU p50 ${ssr.p50} ms, p99 ${ssr.p99} ms, max ${ssr.max} ms over ${ssr.count} requests`
    : 'CPU time not in the tail output: read it in the dashboard (Workers Logs)',
});

// 5. Password hashing iterations.
const best = haveCpu ? bestIterations(groups, HASH_BUDGET_MS) : null;
verdicts.push({
  question: `PBKDF2-SHA256 + pepper: highest iteration count with p99 CPU ≤ ${HASH_BUDGET_MS} ms (expected 30,000–40,000)`,
  verdict: haveCpu ? best !== null && best >= 30_000 : null,
  evidence: haveCpu
    ? best === null
      ? 'no measured count fits'
      : `${best.toLocaleString('en')} iterations`
    : 'CPU time not in the tail output',
});

// 6. AES-GCM per record.
const aes0 = percentile(groups['aes:0']?.cpu ?? [], 50);
const aes1000 = percentile(groups['aes:1000']?.cpu ?? [], 50);
// (ms for 1,000 records − ms for none) / 1,000 records = µs per record.
const perRecordUs = aes0 !== null && aes1000 !== null ? aes1000 - aes0 : null;
verdicts.push({
  question: `AES-GCM field encryption costs ≤ ${AES_BUDGET_US} µs per record`,
  verdict: perRecordUs === null ? null : perRecordUs <= AES_BUDGET_US,
  evidence:
    perRecordUs === null
      ? 'CPU time not in the tail output'
      : `≈ ${perRecordUs} µs per record (median ${aes1000} ms for 1,000 vs ${aes0} ms for 0)`,
});

/** @type {string[]} */
const lines = [
  `# Spike #5 run: ${results.startedAt}`,
  '',
  `Target: ${results.base}${results.quick ? ' (quick run)' : ''} · tail events: ${events.length}`,
  '',
  '| Question | Result | Evidence |',
  '| --- | --- | --- |',
  ...verdicts.map((v) => `| ${v.question} | ${mark(v.verdict)} | ${v.evidence} |`),
  '',
  '## CPU time per route (ms, from tail events)',
  '',
  '| Route | Requests | p50 | p90 | p99 | max | Outcomes |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
];
const order = (/** @type {string} */ label) =>
  label.startsWith('hash:')
    ? 100 + Number(label.slice(5)) / 1000
    : label.startsWith('aes:')
      ? 300
      : 0;
for (const label of Object.keys(groups).sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
  const s = summarize(groups[label].cpu);
  const outcomes = Object.entries(groups[label].outcomes)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  lines.push(
    `| ${label} | ${s.count} | ${s.p50 ?? '–'} | ${s.p90 ?? '–'} | ${s.p99 ?? '–'} | ${s.max ?? '–'} | ${outcomes} |`,
  );
}
lines.push('', '## Request status codes seen by the test client', '', '```json');
lines.push(
  JSON.stringify(
    {
      hashing: results.hashing,
      encryption: results.encryption,
      serverRender: results.serverRender,
    },
    null,
    2,
  ),
);
lines.push('```', '');

writeFileSync(args.out, lines.join('\n'));
writeFileSync(
  args.out.replace(/\.md$/, '.json'),
  `${JSON.stringify({ verdicts, best, ssr, perRecordUs, groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { ...summarize(g.cpu), outcomes: g.outcomes }])) }, null, 2)}\n`,
);
console.log(lines.join('\n'));
