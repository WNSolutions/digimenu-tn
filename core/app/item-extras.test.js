// @ts-check
/**
 * Item extras (#29): labels drawn from modules' contributions, icons from path data only, a
 * failing module leaves the others drawn. A tiny stand-in for the browser's document is
 * enough: the file builds elements and nothing else.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { badgeIcon, badges, decorate } from './item-extras.js';

/** A minimal element: tag, attributes, children, text. */
class El {
  /** @param {string} tag */
  constructor(tag) {
    this.tag = tag;
    /** @type {Record<string, string>} */
    this.attrs = {};
    /** @type {any[]} */
    this.children = [];
    this.dataset = {};
  }
  /** @param {string} k @param {string} v */
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  /** @param {...any} c */
  append(...c) {
    this.children.push(...c);
  }
  get text() {
    return this.children.map((c) => (typeof c === 'string' ? c : c.text)).join('');
  }
}
/** @type {any} */ (globalThis).document = {
  createElementNS: (/** @type {string} */ _ns, /** @type {string} */ tag) => new El(tag),
};

/** The core's h(), reduced: attributes and children (arrays flattened, nulls dropped). */
const h = /** @type {any} */ (
  (/** @type {string} */ tag, /** @type {any} */ attrs, /** @type {any[]} */ ...children) => {
    const el = new El(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, String(v));
    el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined));
    return el;
  }
);
const kit = {
  h,
  renderBlocks: /** @type {any} */ (
    (/** @type {any} */ _ctx, /** @type {any[]} */ blocks) =>
      blocks.map((b) => h('p', null, b.text))
  ),
};

/** @param {Record<string, { key: string, fn: Function }[]>} points @param {string[]} reports */
function ctx(points, reports = []) {
  return /** @type {any} */ ({
    lang: 'fr',
    ext: {
      itemPoints: { 'menu.itemBadge': [], 'menu.itemDetail': [], ...points },
      report: (/** @type {string} */ m) => reports.push(m),
    },
    boot: { menu: { categories: [] } },
  });
}

test('an icon is drawn from path data only; anything else is no icon', () => {
  const svg = /** @type {any} */ (badgeIcon(['M12 9v4', 'M12 17h.01']));
  assert.equal(svg.tag, 'svg');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.deepEqual(
    svg.children.map((/** @type {any} */ p) => p.attrs.d),
    ['M12 9v4', 'M12 17h.01'],
  );
  for (const bad of [
    ['<script>alert(1)</script>'],
    ['M0 0" onload="x'],
    ['url(#x)'],
    'M0 0',
    [],
    Array(13).fill('M0 0'),
    [42],
  ])
    assert.equal(badgeIcon(bad), null, JSON.stringify(bad));
});

test('labels: text always, at most the limit, from each module with data for the item; a failing module is reported and skipped', () => {
  const reports = /** @type {string[]} */ ([]);
  const c = ctx(
    {
      'menu.itemBadge': [
        {
          key: 'broken',
          fn: () => {
            throw new Error('boom');
          },
        },
        {
          key: 'dietary_tags',
          fn: (/** @type {any} */ { ext }) =>
            ext.tags.map((/** @type {string} */ x) => ({ text: x, icon: { paths: ['M0 0h1'] } })),
        },
        { key: 'other', fn: () => [{ text: '   ' }, { text: 'Nouveau' }] },
      ],
    },
    reports,
  );
  const item = /** @type {any} */ ({
    id: 'i1',
    ext: { broken: {}, dietary_tags: { tags: ['Vegan', 'Épicé'] }, other: {} },
  });
  const ul = /** @type {any} */ (badges(c, item, kit, 2));
  assert.equal(ul.tag, 'ul');
  assert.deepEqual(
    ul.children.map((/** @type {any} */ li) => li.text),
    ['Vegan', 'Épicé'],
  );
  assert.equal(ul.children[0].children[0].tag, 'svg');
  assert.deepEqual(reports, ['module broken: menu.itemBadge failed']);
  const all = /** @type {any} */ (badges(c, item, kit, 50));
  assert.deepEqual(
    all.children.map((/** @type {any} */ li) => li.text),
    ['Vegan', 'Épicé', 'Nouveau'],
    'blank text is never drawn',
  );
  // A module with no data for this item is not even asked.
  assert.equal(
    /** @type {any} */ (badges(c, /** @type {any} */ ({ id: 'i2', ext: { other: {} } }), kit, 6))
      .children.length,
    1,
  );
  assert.equal(badges(c, /** @type {any} */ ({ id: 'i3' }), kit, 6), null);
});

test("decorate: labels under the items' names, and the sheet's extras with the modules' blocks", () => {
  const c = ctx({
    'menu.itemBadge': [{ key: 'dietary_tags', fn: () => [{ text: 'Vegan' }] }],
    'menu.itemDetail': [
      { key: 'dietary_tags', fn: () => [{ kind: 'text', text: 'Demandez au personnel.' }] },
    ],
  });
  const tagged = { id: 'i1', ext: { dietary_tags: { tags: ['vegan'] } } };
  c.boot.menu.categories = [{ groups: [{ items: [tagged, { id: 'i2' }] }] }];
  const text1 = new El('div');
  const text2 = new El('div');
  const li = (/** @type {string} */ id, /** @type {El} */ text) =>
    Object.assign(new El('li'), { dataset: { item: id }, querySelector: () => text });
  const root = /** @type {any} */ ({ querySelectorAll: () => [li('i1', text1), li('i2', text2)] });
  decorate(root, c, kit);
  assert.equal(text1.children.length, 1);
  assert.equal(text1.text, 'Vegan');
  assert.equal(text2.children.length, 0, 'no data, no label');
  const extras = /** @type {any} */ (c.itemExtras(tagged));
  assert.equal(extras.text, 'VeganDemandez au personnel.');
  assert.equal(c.itemExtras({ id: 'i2' }), null);
});
