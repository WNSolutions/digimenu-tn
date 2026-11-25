// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jsQRModule from 'jsqr';
import { encodeQr } from './qr.js';

/** @type {(data: Uint8ClampedArray, width: number, height: number) => { data: string } | null} */
const jsQR = /** @type {any} */ (jsQRModule).default ?? jsQRModule;

/** Reads a QR code back the way a phone camera would (jsQR), from a clean picture of it. */
function decode(/** @type {string[]} */ rows, scale = 4) {
  const quiet = 4;
  const n = rows.length + quiet * 2;
  const px = n * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '1') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * px + (x + quiet) * scale + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  });
  return jsQR(rgba, px, px)?.data ?? null;
}

test('every size from version 1 to 10 reads back exactly', () => {
  const seen = new Set();
  for (const length of [1, 10, 14, 15, 26, 27, 42, 43, 62, 63, 84, 106, 122, 152, 180, 213]) {
    const text = Array.from({ length }, (_, i) => 'DigiMenu-0123456789/?k='[i % 23]).join('');
    const qr = encodeQr(text);
    seen.add(qr.version);
    assert.equal(qr.size, qr.version * 4 + 17);
    assert.equal(qr.rows.length, qr.size);
    assert.ok(qr.rows.every((r) => r.length === qr.size && /^[01]+$/.test(r)));
    assert.equal(decode(qr.rows), text, `version ${qr.version}, ${length} bytes`);
  }
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
});

test('table links, signed card codes and non-ASCII text read back', () => {
  for (const text of [
    'https://digimenu.wnsolutions.tn/cafe-des-delices/t/12?k=7QF3K9',
    'DMC1.K7PX3A.LX2Q9.aB3_dE5-fG7hJ9kL',
    'Café Démo Jasmin — مقهى ياسمين',
  ]) {
    assert.equal(decode(encodeQr(text).rows), text);
  }
});

test('too long for version 10 is refused', () => {
  assert.throws(() => encodeQr('x'.repeat(214)), /too long/);
});
