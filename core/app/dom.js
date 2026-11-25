// @ts-check
/**
 * Tiny DOM helpers for the customer page. No framework (ADR-0002).
 *
 * Safety: text is always set with `textContent` or text nodes, never as HTML, so a café name or
 * a customer note can never inject markup (strict Content-Security-Policy, ARCHITECTURE §7).
 */

/** @typedef {string | number | Node | null | undefined | false} Child */
/** @typedef {Record<string, string | number | boolean | null | undefined | ((ev: any) => void)>} Attrs */

/**
 * Creates an element. Attributes starting with "on" become event listeners; `class` sets the
 * class list; `true` sets an empty attribute; `false`, null and undefined are skipped.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Attrs | null} [attrs]
 * @param {...(Child | Child[])} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

/**
 * @param {Node} parent
 * @param {(Child | Child[])[]} children
 */
export function append(parent, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/**
 * An icon from the sprite (core/ui/icons.js). Decorative: hidden from screen readers.
 * @param {string} name
 * @param {string} [cls]
 */
export function icon(name, cls = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `dm-icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/**
 * Text that keeps its own direction inside a sentence in another script (prices, numbers,
 * table labels, Latin names in Arabic): `<bdi>`.
 * @param {string} text
 * @param {string} [cls]
 */
export function bdi(text, cls) {
  return h('bdi', cls ? { class: cls } : null, text);
}

/**
 * Text in a given language, marked with lang/dir when it differs from the page (a French
 * description on an Arabic page, US-05).
 * @param {keyof HTMLElementTagNameMap} tag
 * @param {{ text: string, lang: 'fr' | 'ar' | 'en' }} picked
 * @param {'fr' | 'ar' | 'en'} pageLang
 * @param {string} [cls]
 */
export function langText(tag, picked, pageLang, cls) {
  const attrs = /** @type {Attrs} */ ({ class: cls });
  if (picked.lang !== pageLang) {
    attrs.lang = picked.lang;
    attrs.dir = picked.lang === 'ar' ? 'rtl' : 'ltr';
  }
  return h(tag, attrs, picked.text);
}

/** Whether the person asked for less motion. */
export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
