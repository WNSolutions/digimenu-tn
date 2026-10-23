#!/usr/bin/env node
/**
 * Runs every spike test against a deployed (or local) spike Worker and writes what it saw.
 *
 *   node tools/measure.mjs --base https://digimenu-spike.<subdomain>.workers.dev --out results.json
 *   node tools/measure.mjs --base http://localhost:8787 --quick      (local check, fewer requests)
 *
 * It checks behaviour (status codes, counts, hub delivery, hibernation). CPU time is not visible
 * from outside: run `wrangler tail --format json` during this script and pass both files to
 * tools/analyze.mjs. The full run sends about 700 requests, well under the free plan's 100,000
 * per day. It needs no credentials.
 */
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    out: { type: 'string', default: 'results.json' },
    quick: { type: 'boolean', default: false },
    cafe: { type: 'string', default: 'demo' },
  },
});
if (!args.base) {
  console.error('Usage: node tools/measure.mjs --base <url> [--out results.json] [--quick]');
  process.exit(2);
}
const BASE = args.base.replace(/\/$/, '');
const CAFE = args.cafe;
const QUICK = args.quick;
const ITERATIONS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 80_000, 100_000];
const HASH_REQUESTS = QUICK ? 5 : 60;
const HIBERNATION_WAIT_MS = QUICK ? 15_000 : 40_000;

/** @type {Record<string, unknown>} */
const results = { base: BASE, startedAt: new Date().toISOString(), quick: QUICK };

/**
 * Runs `count` calls of `task` with at most `limit` at a time.
 * @template T
 * @param {number} count
 * @param {number} limit
 * @param {(index: number) => Promise<T>} task
 * @returns {Promise<T[]>}
 */
async function pool(count, limit, task) {
  /** @type {T[]} */
  const out = new Array(count);
  let next = 0;
  async function worker() {
    while (next < count) {
      const index = next;
      next += 1;
      out[index] = await task(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker));
  return out;
}

/**
 * Counts status codes of a batch of requests.
 * @param {Response[]} responses
 */
function statusCounts(responses) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/** 1. Static table page: a browser-like navigation request must get index.html. */
async function staticPage() {
  const responses = await pool(5, 2, () =>
    fetch(`${BASE}/${CAFE}/t/5`, {
      headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', accept: 'text/html' },
    }),
  );
  const bodies = await Promise.all(responses.map((r) => r.text()));
  return {
    statuses: statusCounts(responses),
    servedBootPage: bodies.every((b) => b.includes('data-boot="digimenu-spike"')),
  };
}

/** 2. D1: read the 150-line menu, and write + read one row. */
async function database() {
  const menus = await pool(QUICK ? 3 : 20, 4, async () => {
    const r = await fetch(`${BASE}/api/${CAFE}/menu`);
    const body = r.ok ? await r.json() : null;
    return { status: r.status, items: body?.items?.length ?? 0 };
  });
  const writes = await pool(QUICK ? 3 : 20, 4, async () => {
    const r = await fetch(`${BASE}/api/spike/db`, { method: 'POST' });
    return { status: r.status, body: r.ok ? await r.json() : null };
  });
  const totals = writes.map((w) => w.body?.total ?? 0);
  return {
    menuStatuses: [...new Set(menus.map((m) => m.status))],
    menuItems: [...new Set(menus.map((m) => m.items))],
    writeStatuses: [...new Set(writes.map((w) => w.status))],
    rowsAfter: Math.max(...totals),
  };
}

/** 3. Server-side render of the 150-line menu. */
async function serverRender() {
  const responses = await pool(QUICK ? 5 : 100, 4, () => fetch(`${BASE}/ssr/${CAFE}/t/5`));
  const first = await responses[0].text();
  await Promise.all(responses.slice(1).map((r) => r.arrayBuffer()));
  return {
    statuses: statusCounts(responses),
    itemsInPage: (first.match(/class="menu-item"/g) ?? []).length,
    bytes: first.length,
  };
}

/** 4. Password hashing at each iteration count, plus a no-op baseline. */
async function hashing() {
  await pool(QUICK ? 3 : 30, 4, () => fetch(`${BASE}/api/spike/ping`).then((r) => r.text()));
  /** @type {Record<string, Record<string, number>>} */
  const byIterations = {};
  for (const iterations of ITERATIONS) {
    const responses = await pool(HASH_REQUESTS, 4, async () => {
      const r = await fetch(`${BASE}/api/spike/hash?iter=${iterations}`);
      await r.arrayBuffer();
      return r;
    });
    byIterations[iterations] = statusCounts(responses);
  }
  return byIterations;
}

/** 5. AES-GCM: 0 records (baseline) and 1,000 records per request. */
async function encryption() {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const n of [0, 1000]) {
    const responses = await pool(QUICK ? 3 : 30, 4, async () => {
      const r = await fetch(`${BASE}/api/spike/aes?n=${n}`);
      await r.arrayBuffer();
      return r;
    });
    out[n] = statusCounts(responses);
  }
  return out;
}

/**
 * Opens one WebSocket to the café hub and records every pushed text.
 * @returns {Promise<{ socket: WebSocket, received: string[] }>}
 */
function openHubSocket() {
  const url = `${BASE.replace(/^http/, 'ws')}/api/${CAFE}/hub`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    /** @type {string[]} */
    const received = [];
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'push') received.push(data.text);
      } catch {
        // "pong" and other non-JSON frames
      }
    });
    socket.addEventListener('open', () => resolve({ socket, received }));
    socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)));
  });
}

/**
 * @param {string} text
 * @returns {Promise<{ delivered: number, wakes: number }>}
 */
async function push(text) {
  const r = await fetch(`${BASE}/api/${CAFE}/hub/push`, { method: 'POST', body: text });
  return r.json();
}

async function hubStats() {
  const r = await fetch(`${BASE}/api/${CAFE}/hub/stats`);
  return /** @type {Promise<{ wakes: number, sockets: number }>} */ (r.json());
}

/**
 * 6. Café hub: two "staff devices" get a push; then the hub sits idle long enough to
 * hibernate, and a second push must still reach both over the same sockets.
 */
async function hub() {
  const a = await openHubSocket();
  const b = await openHubSocket();
  await sleep(1000);
  const first = await push('message-1');
  await sleep(2000);
  const before = await hubStats();
  const firstReached = [a, b].filter((s) => s.received.includes('message-1')).length;

  let waited = 0;
  let second = { delivered: 0, wakes: before.wakes };
  // Idle (no requests, no messages) so the object can be unloaded, then push again.
  for (const wait of [HIBERNATION_WAIT_MS, HIBERNATION_WAIT_MS]) {
    await sleep(wait);
    waited += wait;
    second = await push(`message-2-after-${waited}ms`);
    if (second.wakes > before.wakes) break;
  }
  await sleep(2000);
  const secondReached = [a, b].filter((s) =>
    s.received.some((t) => t.startsWith('message-2')),
  ).length;
  const stillOpen = [a, b].filter((s) => s.socket.readyState === WebSocket.OPEN).length;
  a.socket.close(1000, 'done');
  b.socket.close(1000, 'done');
  return {
    firstDelivered: first.delivered,
    firstReached,
    wakesBeforeIdle: before.wakes,
    wakesAfterIdle: second.wakes,
    idleMs: waited,
    hibernated: second.wakes > before.wakes,
    secondDelivered: second.delivered,
    secondReached,
    socketsStillOpen: stillOpen,
  };
}

const steps = /** @type {const} */ ([
  ['staticPage', staticPage],
  ['database', database],
  ['serverRender', serverRender],
  ['hashing', hashing],
  ['encryption', encryption],
  ['hub', hub],
]);

let failed = false;
for (const [name, step] of steps) {
  const started = Date.now();
  try {
    results[name] = await step();
    console.log(`✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    failed = true;
    results[name] = { error: String(error) };
    console.log(`✗ ${name}: ${error}`);
  }
}
results.finishedAt = new Date().toISOString();
writeFileSync(args.out, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Results written to ${args.out}`);
process.exit(failed ? 1 : 0);
