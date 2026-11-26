// @ts-check
/**
 * The staff app's two small charts (Visites #27, Ventes #28): one series in one colour (the
 * accent), thin marks, the value written at the end of each bar and on the tallest column, each
 * column's full label as its tooltip, and the same numbers as a table on the screen that uses
 * them. Nothing depends on colour or on hovering.
 *
 * Sizes go through the style object: the staff app's security policy blocks style="…".
 */

/**
 * @typedef {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} H
 */

/** @param {HTMLElement} el @param {'inlineSize' | 'blockSize'} prop @param {number} share */
function sized(el, prop, share) {
  el.style[prop] = `${Math.round(share * 1000) / 10}%`;
  return el;
}

/**
 * Horizontal bars, the value (or its text) at the end of each.
 * @param {H} h
 * @param {{ label: string, value: number, text?: string }[]} rows
 */
export function bars(h, rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h(
    'ul',
    { class: 'a-bars' },
    ...rows.map((r) =>
      h(
        'li',
        { class: 'a-bar-row' },
        h('span', { class: 'a-bar-label' }, r.label),
        h(
          'span',
          { class: 'a-bar-track', 'aria-hidden': 'true' },
          sized(h('span', { class: 'a-bar-fill' }), 'inlineSize', r.value / max),
        ),
        h('span', { class: 'a-bar-value' }, r.text ?? String(r.value)),
      ),
    ),
  );
}

/**
 * Vertical columns (days, hours), the tallest one labelled with its value (or its text).
 * @param {H} h
 * @param {{ label: string, short: string, value: number, text?: string }[]} rows
 * @param {string} name   what the chart shows, for screen readers
 */
export function columns(h, rows, name) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const top = rows.findIndex((r) => r.value === max && max > 0);
  return h(
    'div',
    { class: 'a-cols', role: 'img', 'aria-label': name },
    ...rows.map((r, i) =>
      h(
        'div',
        { class: 'a-col', title: r.label },
        h('span', { class: 'a-col-value' }, i === top ? (r.text ?? String(r.value)) : ''),
        sized(h('span', { class: 'a-col-fill' }), 'blockSize', r.value / max),
        h('span', { class: 'a-col-label' }, r.short),
      ),
    ),
  );
}

/** One CSV cell, safe for spreadsheets (no formula). @param {unknown} v */
export function csvCell(v) {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
