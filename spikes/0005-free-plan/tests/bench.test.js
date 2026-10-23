import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryptRecords, hashPassword, MAX_ITERATIONS, toBase64 } from '../src/bench.js';

const salt = new Uint8Array(16).fill(1);

test('hashPassword follows the ADR-0006 format', async () => {
  const hash = await hashPassword('motdepasse', { iterations: 1000, salt, pepper: 'p' });
  const parts = hash.split('$');
  assert.equal(parts.length, 5);
  assert.equal(parts[0], 'pbkdf2-sha256');
  assert.equal(parts[1], '1000');
  assert.equal(parts[2], toBase64(salt));
  assert.equal(parts[3].length, 43); // 32 bytes of HMAC-SHA256, base64 without padding
  assert.equal(parts[4], 'p1');
});

test('the same input gives the same hash; another pepper gives another hash', async () => {
  const options = { iterations: 1000, salt, pepper: 'pepper-a' };
  const a = await hashPassword('motdepasse', options);
  const b = await hashPassword('motdepasse', options);
  const c = await hashPassword('motdepasse', { ...options, pepper: 'pepper-b' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('iteration counts outside 1..100,000 are refused before any work', async () => {
  for (const iterations of [0, MAX_ITERATIONS + 1, 1.5]) {
    await assert.rejects(hashPassword('x', { iterations, salt, pepper: 'p' }), RangeError);
  }
});

test('encryptRecords adds a 12-byte IV and a 16-byte tag to each record', async () => {
  const none = await encryptRecords(0, new Uint8Array(32));
  assert.deepEqual(none, { records: 0, bytes: 0 });
  const two = await encryptRecords(2, new Uint8Array(32));
  assert.equal(two.records, 2);
  assert.ok(two.bytes > 2 * (12 + 16));
});
