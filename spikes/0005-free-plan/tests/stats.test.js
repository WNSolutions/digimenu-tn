import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bestIterations,
  cpuTimeOf,
  groupEvents,
  parseJsonStream,
  percentile,
  routeLabel,
  summarize,
} from '../tools/stats.js';

test('percentile uses the nearest rank', () => {
  const values = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
  assert.equal(percentile(values, 50), 5);
  assert.equal(percentile(values, 90), 9);
  assert.equal(percentile(values, 99), 10);
  assert.equal(percentile([], 50), null);
  assert.deepEqual(summarize([2]), { count: 1, p50: 2, p90: 2, p99: 2, max: 2 });
});

test('parseJsonStream reads pretty-printed objects back to back, skipping other text', () => {
  const text = `banner line\n{\n  "a": 1,\n  "s": "brace } inside"\n}\n{"b": {"c": 2}}\nnot json {oops}`;
  assert.deepEqual(parseJsonStream(text), [{ a: 1, s: 'brace } inside' }, { b: { c: 2 } }]);
});

test('routeLabel names each kind of request', () => {
  const at = (/** @type {string} */ p) => routeLabel(new URL(p, 'https://x.workers.dev'));
  assert.equal(at('/api/spike/hash?iter=30000'), 'hash:30000');
  assert.equal(at('/api/spike/aes?n=1000'), 'aes:1000');
  assert.equal(at('/ssr/demo/t/5'), 'ssr-menu-150');
  assert.equal(at('/api/demo/menu'), 'menu-json-d1');
  assert.equal(at('/api/demo/hub/push'), 'hub');
  assert.equal(at('/demo/t/5'), 'table-page');
  assert.equal(at('/api/spike/db'), 'd1-write-read');
  assert.equal(at('/favicon.ico'), 'other');
});

test('cpuTimeOf accepts the field names the platform uses', () => {
  assert.equal(cpuTimeOf({ cpuTime: 3 }), 3);
  assert.equal(cpuTimeOf({ CPUTimeMs: 4 }), 4);
  assert.equal(cpuTimeOf({}), null);
});

/**
 * @param {number} iterations
 * @param {number} cpuTime
 * @param {string} [outcome]
 */
const hashEvent = (iterations, cpuTime, outcome = 'ok') => ({
  outcome,
  cpuTime,
  event: { request: { url: `https://x.workers.dev/api/spike/hash?iter=${iterations}` } },
});

test('bestIterations walks up and stops at the first count that misses the budget', () => {
  const events = [
    ...Array.from({ length: 10 }, () => hashEvent(20000, 3)),
    ...Array.from({ length: 10 }, () => hashEvent(30000, 5)),
    ...Array.from({ length: 10 }, () => hashEvent(40000, 8)),
    // A lucky higher count must not be picked after a miss.
    ...Array.from({ length: 10 }, () => hashEvent(50000, 6)),
  ];
  assert.equal(bestIterations(groupEvents(events), 7), 30000);
});

test('a failed request (e.g. exceededCpu) disqualifies its iteration count', () => {
  const events = [hashEvent(20000, 3), hashEvent(30000, 5), hashEvent(30000, 5, 'exceededCpu')];
  assert.equal(bestIterations(groupEvents(events), 7), 20000);
});
