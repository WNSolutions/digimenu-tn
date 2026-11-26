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
 * @property {string} [suggestion]             when the colour is refused: a deeper shade that
 *   passes, for the editor to offer (#20)
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
    ...(errors.length ? { suggestion: lightFill.colour } : {}),
  };
}

/**
 * Mixes colour `a` toward colour `b` by a share k (0 = a, 1 = b).
 * @param {string} a
 * @param {string} b
 * @param {number} k
 */
export function mix(a, b, k) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(/** @type {[number, number, number]} */ (x.map((c, i) => c + (y[i] - c) * k)));
}

/** The display fonts a café theme may choose (SIL OFL, served from /fonts/, Latin only). */
export const THEME_FONTS = /** @type {const} */ (['mohave']);

/**
 * A café's own theme (ADR-0014, D-070): the café's page colour, text colour, a second colour for
 * thin rules, a display font for titles and a cover photo. It replaces the neutral page in both
 * light and dark mode, like the café's printed menu does. Every colour the page uses is derived
 * here and checked against WCAG 2.1 AA, so a café cannot publish an unreadable menu.
 *
 * Returns `--dm-cafe-*` tokens; `core/ui/tokens.css` maps them onto the page under
 * `:root[data-dm-theme]`.
 * @param {{ primaryColor: string, buttonColor?: string,
 *   theme?: { background: string, surface?: string, text?: string, line?: string } }} branding
 * @returns {AccentResult & { dark: boolean }}
 */
export function themeTokens(branding) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const theme = branding.theme;
  if (!theme) return { tokens: {}, errors, warnings, dark: false };
  const bg = theme.background.toUpperCase();
  const dark = luminance(bg) < 0.18;
  const text = (theme.text ?? (dark ? '#FFFFFF' : INK)).toUpperCase();
  const toward = /** @type {'black' | 'white'} */ (dark ? 'white' : 'black');
  if (contrast(text, bg) < 4.5) {
    errors.push(
      `The text colour ${text} is not readable on the page colour ${bg} (${contrast(text, bg).toFixed(1)}:1, at least 4.5:1 is needed).`,
    );
  } else if (contrast(text, bg) < 7) {
    warnings.push(
      `Text on the page reads at ${contrast(text, bg).toFixed(1)}:1; 7:1 or more is easier in a dim room.`,
    );
  }
  const surface = (theme.surface ?? mix(bg, text, 0.06)).toUpperCase();
  if (contrast(text, surface) < 4.5) {
    errors.push(`The text colour is not readable on the card colour ${surface}.`);
  }
  const fill = mix(bg, text, 0.12);
  const sep = mix(bg, text, 0.2);
  const border = stepUntil(mix(bg, text, 0.4), toward, (c) => contrast(c, bg) >= 3).colour;
  // Secondary text: as close to the page as it can be while staying at 4.5:1 on every surface.
  let ink2 = text;
  for (let k = 0.45; k >= 0; k -= 0.05) {
    const c = mix(text, bg, k);
    if (contrast(c, bg) >= 4.6 && contrast(c, surface) >= 4.6 && contrast(c, fill) >= 4.5) {
      ink2 = c;
      break;
    }
  }
  const brand = branding.primaryColor;
  const button = branding.buttonColor ?? brand;
  const accentFill = stepUntil(button, toward, (c) => {
    const label = bestLabel(c);
    return contrast(c, bg) >= 3 && contrast(c, surface) >= 3 && contrast(c, label) >= 4.5;
  });
  const accentText = stepUntil(brand, toward, (c) => {
    return contrast(c, bg) >= 4.5 && contrast(c, surface) >= 4.5 && contrast(c, fill) >= 3;
  });
  if (accentFill.moved > 0.25) {
    errors.push(
      `The button colour does not stand out on the page colour ${bg} (it had to move ${Math.round(accentFill.moved * 100)} %). Choose a button colour that contrasts with the page, for example ${accentFill.colour}.`,
    );
  }
  const line = theme.line ? theme.line.toUpperCase() : sep;
  if (theme.line && contrast(line, bg) < 1.5) {
    warnings.push('The rule colour is almost the page colour: the thin lines will not show.');
  }
  const status = dark
    ? { success: '#5CCF7B', danger: '#FF7A6B', warning: '#FFB84D', on: '#121212', focus: '#7DB0FF' }
    : {
        success: '#1D7A36',
        danger: '#C42B1C',
        warning: '#8A5000',
        on: '#FFFFFF',
        focus: '#1A5FD0',
      };
  for (const [name, colour] of Object.entries({
    success: status.success,
    danger: status.danger,
    warning: status.warning,
  })) {
    if (contrast(colour, surface) < 3) {
      warnings.push(
        `The ${name} colour reads poorly on the card colour (${contrast(colour, surface).toFixed(1)}:1).`,
      );
    }
  }
  return {
    dark,
    tokens: {
      '--dm-cafe-bg': bg,
      '--dm-cafe-surface': surface,
      '--dm-cafe-fill': fill,
      '--dm-cafe-sep': sep,
      '--dm-cafe-border': border,
      '--dm-cafe-ink': text,
      '--dm-cafe-ink-2': ink2,
      '--dm-cafe-line': line,
      '--dm-cafe-t-accent': accentFill.colour,
      '--dm-cafe-t-on-accent': bestLabel(accentFill.colour),
      '--dm-cafe-t-accent-text': accentText.colour,
      '--dm-cafe-success': status.success,
      '--dm-cafe-danger': status.danger,
      '--dm-cafe-warning': status.warning,
      '--dm-cafe-on-status': status.on,
      '--dm-cafe-focus': status.focus,
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
