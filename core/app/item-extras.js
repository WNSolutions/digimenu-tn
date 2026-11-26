// @ts-check
/**
 * Item extras (#29): what modules add to an item, from the item's own data (`item.ext.<module>`,
 * filled in the staff app's menu editor):
 *   menu.itemBadge   small labels under the item's name in the menu (at most 6), and all of
 *                    them in the item sheet;
 *   menu.itemDetail  blocks in the item sheet (e.g. "Tags are provided by the café").
 *
 * Its own file, loaded only when a module contributes to these points: outside the core's size
 * budget. It imports nothing; the core passes what it needs (kit), so no code is shared between
 * files.
 *
 * A badge is `{ text, icon?: { paths } }`. The text is set as text; the icon is drawn from SVG
 * path data only (24 × 24, stroked like the core's icons), so nothing is ever parsed as HTML.
 * An icon is never the only carrier of meaning: the text is always there.
 */

const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]{1,400}$/;
const SVG = 'http://www.w3.org/2000/svg';
const IN_LIST = 6;

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('../menu/snapshot.js').Item} Item */
/** @typedef {{ text: string, icon?: { paths: string[] } }} Badge */

/**
 * @typedef {object} Kit
 * @property {typeof import('./dom.js').h} h
 * @property {typeof import('./blocks.js').renderBlocks} renderBlocks
 */

/**
 * An icon from path data, or null when the data is not plain path data.
 * @param {unknown} paths
 * @returns {SVGSVGElement | null}
 */
export function badgeIcon(paths) {
  if (
    !Array.isArray(paths) ||
    !paths.length ||
    paths.length > 12 ||
    !paths.every((p) => typeof p === 'string' && PATH.test(p))
  )
    return null;
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    class: 'dm-badge-icon',
    'aria-hidden': 'true',
    focusable: 'false',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }))
    svg.setAttribute(k, v);
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/**
 * What each module gives for this item at a point. A module that throws gives nothing.
 * @param {Ctx} ctx
 * @param {'menu.itemBadge' | 'menu.itemDetail'} point
 * @param {Item} item
 * @returns {{ key: string, list: any[] }[]}
 */
function collect(ctx, point, item) {
  const out = [];
  for (const { key, fn } of ctx.ext.itemPoints[point]) {
    const ext = item.ext?.[key];
    if (ext === undefined) continue;
    try {
      const list = fn({ ext, lang: ctx.lang, item: { id: item.id } });
      if (Array.isArray(list) && list.length) out.push({ key, list });
    } catch (err) {
      ctx.ext.report(`module ${key}: ${point} failed`, err);
    }
  }
  return out;
}

/**
 * An item's labels, or null.
 * @param {Ctx} ctx
 * @param {Item} item
 * @param {Kit} kit
 * @param {number} max
 */
export function badges(ctx, item, kit, max) {
  /** @type {Badge[]} */
  const list = collect(ctx, 'menu.itemBadge', item)
    .flatMap((c) => c.list)
    .filter((b) => b && typeof b.text === 'string' && b.text.trim())
    .slice(0, max);
  if (!list.length) return null;
  return kit.h(
    'ul',
    { class: 'dm-badges', role: 'list' },
    list.map((b) =>
      kit.h(
        'li',
        { class: 'dm-badge' },
        badgeIcon(b.icon?.paths),
        kit.h('span', null, b.text.trim().slice(0, 40)),
      ),
    ),
  );
}

/**
 * Adds the labels to the menu on screen, and gives the item sheet its extras.
 * @param {HTMLElement} root   the menu
 * @param {Ctx} ctx
 * @param {Kit} kit
 */
export function decorate(root, ctx, kit) {
  /** @type {Map<string, Item>} */
  const items = new Map();
  for (const c of ctx.boot.menu.categories)
    for (const g of c.groups) for (const it of g.items) if (it.ext) items.set(it.id, it);
  for (const li of root.querySelectorAll('li[data-item]')) {
    const item = items.get(/** @type {HTMLElement} */ (li).dataset.item ?? '');
    const row = item && badges(ctx, item, kit, IN_LIST);
    if (row) li.querySelector('.dm-item-text')?.append(row);
  }
  ctx.itemExtras = (item) => {
    if (!item.ext) return null;
    const all = badges(ctx, item, kit, 50);
    const blocks = collect(ctx, 'menu.itemDetail', item).flatMap((c) =>
      kit.renderBlocks(ctx, c.list, { key: c.key, replace: () => {} }),
    );
    return all || blocks.length
      ? kit.h('div', { class: 'dm-itemsheet-extras' }, all, blocks)
      : null;
  };
}
