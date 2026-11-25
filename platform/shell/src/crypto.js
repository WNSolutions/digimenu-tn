// @ts-check
/**
 * Field encryption and keyed lookup for customer data (ADR-0010).
 *
 * - AES-256-GCM with a random 96-bit IV per value; stored as "v<keyVersion>.<iv>.<ciphertext>"
 *   in base64url, so a later key can be introduced without rewriting old rows at once.
 * - Phones are found by HMAC-SHA256 with a separate lookup key, never by their clear value.
 *
 * Keys are Worker secrets (FIELD_KEY, LOOKUP_KEY: 32 random bytes, base64), escrowed offline by
 * the project lead. Without them the Worker refuses to store customer data (fails closed).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array} bytes */
const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
/** @param {string} text */
const fromB64 = (text) => {
  const s = text.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

/**
 * @typedef {object} Keys
 * @property {CryptoKey} field
 * @property {CryptoKey} lookup
 * @property {number} version
 */

/**
 * Imports the keys from the Worker's secrets, or null when they are not set.
 * @param {{ FIELD_KEY?: string, LOOKUP_KEY?: string, KEY_VERSION?: string }} env
 * @returns {Promise<Keys | null>}
 */
export async function loadKeys(env) {
  if (!env.FIELD_KEY || !env.LOOKUP_KEY) return null;
  const field = fromB64(env.FIELD_KEY);
  const lookup = fromB64(env.LOOKUP_KEY);
  if (field.length !== 32 || lookup.length !== 32)
    throw new Error('FIELD_KEY and LOOKUP_KEY must be 32 bytes');
  return {
    field: await crypto.subtle.importKey('raw', field, 'AES-GCM', false, ['encrypt', 'decrypt']),
    lookup: await crypto.subtle.importKey('raw', lookup, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]),
    version: Number(env.KEY_VERSION ?? 1),
  };
}

/** @param {Keys} keys @param {unknown} value */
export async function seal(keys, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      keys.field,
      enc.encode(JSON.stringify(value)),
    ),
  );
  return `v${keys.version}.${b64url(iv)}.${b64url(ct)}`;
}

/** @param {Keys} keys @param {string} sealed */
export async function open(keys, sealed) {
  const [, iv, ct] = sealed.split('.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    keys.field,
    fromB64(ct),
  );
  return JSON.parse(dec.decode(plain));
}

/** @param {Keys} keys @param {string} value */
export async function lookupHash(keys, value) {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', keys.lookup, enc.encode(value))));
}
