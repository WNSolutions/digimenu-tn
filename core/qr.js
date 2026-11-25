// @ts-check
/**
 * QR codes (ISO/IEC 18004), byte mode, error correction M, versions 1 to 10: up to 213 bytes,
 * enough for a table link or a signed loyalty card. A pure function with no dependencies, used
 * by the server (the loyalty card), the tools (printed table cards) and the tests.
 *
 * It is NOT part of the customer page bundle (budget): the page draws a matrix it is given.
 * Written from the standard, following the structure of Project Nayuki's QR Code generator
 * (MIT): https://www.nayuki.io/page/qr-code-generator-library
 */

const MAX_VERSION = 10;
/** Error correction M: codewords per block and number of blocks, by version (index 0 unused). */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Format bits for error correction M. */
const ECC_FORMAT = 0;

/**
 * Encodes text (UTF-8) as a QR code.
 * @param {string} text
 * @returns {{ version: number, size: number, rows: string[] }}  rows of "1" (dark) and "0"
 */
export function encodeQr(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= MAX_VERSION; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error(`text too long for a QR code (${bytes.length} bytes)`);

  // Data bits: mode 0100 (bytes), count, the bytes, terminator, padding.
  /** @type {number[]} */
  const bits = [];
  const push = (/** @type {number} */ value, /** @type {number} */ length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  /** @type {number[]} */
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  const codewords = withErrorCorrection(data, version);
  const size = version * 4 + 17;
  const qr = new Grid(size);
  qr.drawFunctionPatterns(version);
  qr.drawCodewords(codewords);

  // Pick the mask with the lowest penalty (any mask is valid; this one reads best).
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    qr.applyMask(mask);
    qr.drawFormatBits(mask);
    const score = qr.penalty();
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
    qr.applyMask(mask); // XOR again undoes it
  }
  qr.applyMask(best);
  qr.drawFormatBits(best);
  return {
    version,
    size,
    rows: qr.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')),
  };
}

/** @param {number} version */
function rawCodewords(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

/** @param {number} version */
function dataCodewords(version) {
  return rawCodewords(version) - ECC_PER_BLOCK[version] * BLOCKS[version];
}

/**
 * Splits the data into blocks, adds Reed-Solomon codewords and interleaves them.
 * @param {number[]} data
 * @param {number} version
 */
function withErrorCorrection(data, version) {
  const blocks = BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const raw = rawCodewords(version);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLen);
  /** @type {number[][]} */
  const parts = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0);
    parts.push(dat.concat(ecc));
  }
  /** @type {number[]} */
  const out = [];
  for (let i = 0; i < parts[0].length; i++) {
    parts.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= shortBlocks) out.push(block[i]);
    });
  }
  return out;
}

/** Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1. */
function gfMul(/** @type {number} */ x, /** @type {number} */ y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** @param {number} degree */
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** @param {number[]} data @param {number[]} divisor */
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ /** @type {number} */ (result.shift());
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

/** The module grid, with the function patterns kept apart from the data. */
class Grid {
  /** @param {number} size */
  constructor(size) {
    this.size = size;
    /** @type {boolean[][]} */
    this.modules = Array.from({ length: size }, () => new Array(size).fill(false));
    /** @type {boolean[][]} */
    this.isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  }

  /** @param {number} x @param {number} y @param {boolean} dark */
  set(x, y, dark) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  /** @param {number} version */
  drawFunctionPatterns(version) {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [x, y] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size)
            this.set(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
    const align = alignmentPositions(version);
    const last = align.length - 1;
    align.forEach((ay, i) =>
      align.forEach((ax, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            this.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.drawFormatBits(0); // reserves the area; drawn again once the mask is chosen
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  /** @param {number} mask */
  drawFormatBits(mask) {
    const data = (ECC_FORMAT << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (/** @type {number} */ i) => ((bits >>> i) & 1) !== 0;
    const size = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  /** @param {number[]} codewords */
  drawCodewords(codewords) {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  /** XORs the data modules with a mask pattern (applying it twice undoes it). @param {number} mask */
  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** The standard's four penalty rules. */
  penalty() {
    const size = this.size;
    const m = this.modules;
    let score = 0;
    const lines = [...m.map((row) => row), ...m.map((_, x) => m.map((row) => row[x]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      const s = line.map((d) => (d ? '1' : '0')).join('');
      for (const pattern of ['10111010000', '00001011101']) {
        for (let at = s.indexOf(pattern); at !== -1; at = s.indexOf(pattern, at + 1)) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (
          x < size - 1 &&
          y < size - 1 &&
          m[y][x] === m[y][x + 1] &&
          m[y][x] === m[y + 1][x] &&
          m[y][x] === m[y + 1][x + 1]
        )
          score += 3;
      }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

/** @param {number} version */
function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = version * 4 + 10; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}
