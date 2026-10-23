/**
 * The two CPU-heavy operations the spike measures. Plain Web Crypto, so the same code runs in
 * the Worker (where we measure CPU time) and in Node (where the unit tests check the output).
 *
 * The CPU time itself cannot be measured from inside a Worker: Workers timers only move on
 * I/O. It is read from the Worker's tail events instead (tools/measure.mjs).
 */

const encoder = new TextEncoder();

/** Web Crypto in Workers refuses PBKDF2 above this count, so the spike never asks for more. */
export const MAX_ITERATIONS = 100_000;

/**
 * Standard base64 without padding.
 * @param {ArrayBuffer | Uint8Array} data
 */
export function toBase64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, '');
}

/**
 * Hashes a password the way ADR-0006 specifies:
 *   pbkdf2-sha256$<iterations>$<salt>$<HMAC-SHA256(pepper, PBKDF2(password, salt, iterations))>$p<pepper version>
 *
 * @param {string} password
 * @param {{ iterations: number, salt: Uint8Array, pepper: string, pepperVersion?: number }} options
 * @returns {Promise<string>}
 */
export async function hashPassword(password, options) {
  const { iterations, salt, pepper, pepperVersion = 1 } = options;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new RangeError(`iterations must be an integer from 1 to ${MAX_ITERATIONS}`);
  }
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const stretched = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    passwordKey,
    256,
  );
  const pepperKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', pepperKey, stretched);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(mac)}$p${pepperVersion}`;
}

/**
 * Encrypts `count` fictional customer records with AES-256-GCM, one fresh IV each, the way
 * encrypted customer fields will be stored (ADR-0010). Returns how many bytes it produced.
 *
 * @param {number} count
 * @param {Uint8Array} rawKey   32 bytes; a fixed test key in the spike, never a real one
 * @returns {Promise<{ records: number, bytes: number }>}
 */
export async function encryptRecords(count, rawKey) {
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  let bytes = 0;
  for (let i = 0; i < count; i += 1) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const record = encoder.encode(
      JSON.stringify({
        name: `Client test ${i}`,
        phone: `+216 20 000 ${String(i).padStart(3, '0')}`,
      }),
    );
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, record);
    bytes += iv.byteLength + sealed.byteLength;
  }
  return { records: count, bytes };
}
