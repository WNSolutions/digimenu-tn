// @ts-check
/**
 * The café's accent colour (docs/design/foundations.md §2.3, ADR-0012).
 *
 * From `branding.primaryColor` (and the optional `branding.buttonColor`) this computes the six
 * CSS values that `core/ui/tokens.css` reads:
 *
 * | token                          | rule                                                            |
 * | ------------------------------ | --------------------------------------------------------------- |
 * | --dm-cafe-accent               | button fill, darkened in 2.5 % steps until 3:1 on the page      |
 * |                                | and its label reaches 4.5:1                                     |
 * | --dm-cafe-on-accent            | white or ink #1A1A1A, whichever contrasts more (≥ 4.5:1)        |
 * | --dm-cafe-accent-text          | brand colour darkened until 4.5:1 on page, grouped page and     |
 * |                                | surface, and 3:1 on fill (the + glyphs)                         |
 * | the three `-dark` variants     | the same rules on the dark surfaces, lightening toward white    |
 *
 * The configuration validator stores the result with the published configuration; the core
 * applies it with `style.setProperty` (allowed by our Content-Security-Policy).
 */

const LIGHT = { page: '#ffffff', grouped: '#f2f2f2', surface: '#ffffff', fill: '#ebebeb' };
const DARK = { page: '#121212', grouped: '#121212', surface: '#1f1f1f', fill: '#2c2c2c' };
const WHITE = '#ffffff';
const INK = '#1a1a1a';
const STEP = 0.025;

/**
 * @param {string} hex  "#RRGGBB"
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new RangeError(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {[number, number, number]} rgb */
function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * WCAG relative luminance.
 * @param {string} hex
 */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two colours (1 to 21).
 * @param {string} a
 * @param {string} b
 */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Mixes a colour toward black (k > 0, darken) or white (lighten) by a share k of the way.
 * @param {string} hex
 * @param {number} k        0..1
 * @param {'black' | 'white'} toward
 */
function shade(hex, k, toward) {
  const rgb = hexToRgb(hex);
  return rgbToHex(
    /** @type {[number, number, number]} */ (
      rgb.map((c) => (toward === 'black' ? c * (1 - k) : c + (255 - c) * k))
    ),
  );
}

/**
 * Steps a colour until `ok(colour)` is true. Returns the colour and how far it moved.
 * @param {string} hex
 * @param {'black' | 'white'} toward
 * @param {(c: string) => boolean} ok
 */
function stepUntil(hex, toward, ok) {
  for (let i = 0; i <= 40; i++) {
    const k = i * STEP;
    const c = i === 0 ? hex.toUpperCase() : shade(hex, k, toward);
    if (ok(c)) return { colour: c, moved: k };
  }
  return { colour: toward === 'black' ? '#000000' : '#FFFFFF', moved: 1 };
}

/** @param {string} fill */
function bestLabel(fill) {
  return contrast(fill, WHITE) >= contrast(fill, INK) ? '#FFFFFF' : INK.toUpperCase();
}

/**
 * @typedef {object} AccentResult
 * @property {Record<string, string>} tokens   CSS custom properties to set on :root
 * @property {string[]} errors                 configuration must be refused
 * @property {string[]} warnings               shown to the maintainer
 */

/**
 * Computes the café's accent tokens and the validator's errors and warnings.
 * @param {{ primaryColor: string, buttonColor?: string }} branding
 * @returns {AccentResult}
 */
export function accentTokens(branding) {
  const brand = branding.primaryColor;
  const button = branding.buttonColor ?? brand;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  // Light: fill (button) and text (links, + glyphs).
  const lightFill = stepUntil(button, 'black', (c) => {
    const label = bestLabel(c);
    return contrast(c, LIGHT.page) >= 3 && contrast(c, label) >= 4.5;
  });
  const lightText = stepUntil(brand, 'black', (c) => {
    return (
      contrast(c, LIGHT.page) >= 4.5 &&
      contrast(c, LIGHT.grouped) >= 4.5 &&
      contrast(c, LIGHT.surface) >= 4.5 &&
      contrast(c, LIGHT.fill) >= 3
    );
  });
  // Dark: lighten toward white.
  const darkFill = stepUntil(button, 'white', (c) => {
    const label = bestLabel(c);
    return contrast(c, DARK.page) >= 3 && contrast(c, label) >= 4.5;
  });
  const darkText = stepUntil(brand, 'white', (c) => {
    return (
      contrast(c, DARK.page) >= 4.5 &&
      contrast(c, DARK.grouped) >= 4.5 &&
      contrast(c, DARK.surface) >= 4.5 &&
      contrast(c, DARK.fill) >= 3
    );
  });

  if (lightFill.moved > 0.25) {
    errors.push(
      `This colour is too light for buttons on a white page (it had to be darkened by ${Math.round(lightFill.moved * 100)} %). Choose a deeper shade, for example ${lightFill.colour}, or a separate button colour.`,
    );
  }
  if (darkFill.moved >= 0.4) {
    warnings.push(
      `The button colour had to be lightened by ${Math.round(darkFill.moved * 100)} % for dark mode.`,
    );
  }
  const chroma = oklchChroma(button);
  if (chroma < 0.04)
    warnings.push('This colour is almost grey: the main button will not stand out from text.');

  return {
    tokens: {
      '--dm-cafe-accent': lightFill.colour,
      '--dm-cafe-on-accent': bestLabel(lightFill.colour),
      '--dm-cafe-accent-text': lightText.colour,
      '--dm-cafe-accent-dark': darkFill.colour,
      '--dm-cafe-on-accent-dark': bestLabel(darkFill.colour),
      '--dm-cafe-accent-text-dark': darkText.colour,
    },
    errors,
    warnings,
  };
}

/**
 * OKLCH chroma of a colour (for the "almost grey" warning).
 * @param {string} hex
 */
export function oklchChroma(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
}
