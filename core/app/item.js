// @ts-check
/**
 * Item sheet: read everything about an item, choose a variant and a quantity, add a note, and
 * add it with the single prominent button (components §6).
 */
import { h, icon, bdi, langText } from './dom.js';
import { openSheet } from './sheet.js';
import { addToList, countOf, NOTE_MAX, DEFAULT_MAX_QTY } from '../list.js';
import { lineTotal } from '../money.js';

/** @typedef {import('./context.js').Ctx} Ctx */

/**
 * @param {import('../menu/snapshot.js').Item} item
 * @param {Ctx} ctx
 */
export function openItemSheet(item, ctx) {
  const { t } = ctx;
  const maxQty = ctx.boot.cafe.maxQtyPerLine || DEFAULT_MAX_QTY;
  const hideSoldOut = ctx.boot.cafe.unavailable === 'hide';
  const name = ctx.pick(item.name);
  const variants = item.variants.filter((v) => !hideSoldOut || v.available);
  const orderable = (/** @type {import('../menu/snapshot.js').Variant} */ v) =>
    item.available && v.available;
  let chosen = variants.find(orderable) ?? variants[0];
  let qty = 1;

  const live = h('span', { class: 'dm-sr', 'aria-live': 'polite' });

  // Variants: a radio group, the first available one selected (components §6).
  /** @type {HTMLElement | null} */
  let variantGroup = null;
  if (variants.length > 1) {
    const groupName = `v-${item.id}`;
    variantGroup = h(
      'fieldset',
      { class: 'dm-choice' },
      h('legend', { class: 'dm-choice-legend' }, t('item.choice')),
      variants.map((v) => {
        const ok = orderable(v);
        const input = h('input', {
          type: 'radio',
          name: groupName,
          value: v.id,
          checked: v === chosen,
          disabled: !ok,
          onchange: () => {
            chosen = v;
            update();
          },
        });
        return h(
          'label',
          { class: `dm-choice-row${ok ? '' : ' is-soldout'}` },
          input,
          v.name
            ? langText('span', ctx.pick(v.name), ctx.lang, 'dm-choice-name')
            : h('span', { class: 'dm-choice-name' }, name.text),
          ok
            ? bdi(ctx.price(v.price), 'dm-price')
            : h('span', { class: 'dm-soldout' }, t('item.soldOut')),
          h('span', { class: 'dm-choice-check' }, icon('check')),
        );
      }),
    );
  }

  // Quantity stepper.
  const qtyValue = h('output', { class: 'dm-stepper-value', 'aria-live': 'polite' }, '1');
  const minus = h(
    'button',
    {
      type: 'button',
      class: 'dm-stepper-btn',
      'aria-label': t('qty.minus'),
      onclick: () => setQty(qty - 1),
    },
    icon('minus'),
  );
  const plus = h(
    'button',
    {
      type: 'button',
      class: 'dm-stepper-btn',
      'aria-label': t('qty.plus'),
      onclick: () => setQty(qty + 1),
    },
    icon('plus'),
  );
  const maxNote = h('p', { class: 'dm-hint', hidden: true }, t('item.max', { max: maxQty }));
  const stepper = h(
    'div',
    { class: 'dm-field-row' },
    h('span', { class: 'dm-field-label', id: `q-${item.id}` }, t('item.quantity')),
    h(
      'div',
      { class: 'dm-stepper', role: 'group', 'aria-labelledby': `q-${item.id}` },
      minus,
      qtyValue,
      plus,
    ),
  );

  // Note for this line (D-045, D-046).
  const counter = h('span', { class: 'dm-counter', hidden: true });
  const note = h('textarea', {
    class: 'dm-textarea',
    id: `n-${item.id}`,
    rows: 2,
    maxlength: NOTE_MAX,
    placeholder: t('item.notePlaceholder'),
    oninput: () => {
      const n = Array.from(note.value).length;
      counter.hidden = n < 150;
      counter.textContent = t('note.count', { count: n, max: NOTE_MAX });
    },
  });
  const noteField = h(
    'div',
    { class: 'dm-field' },
    h('label', { class: 'dm-field-label', for: `n-${item.id}` }, t('item.note')),
    note,
    counter,
  );

  const addBtn = h('button', { type: 'button', class: 'dm-prominent', onclick: add });
  const soldChip = h('span', { class: 'dm-soldout dm-soldout--lg' }, t('item.soldOut'));

  const anyOrderable = variants.some(orderable);
  const content = h(
    'div',
    { class: 'dm-itemsheet' },
    item.description
      ? langText('p', ctx.pick(item.description), ctx.lang, 'dm-itemsheet-desc')
      : null,
    variantGroup,
    anyOrderable ? [stepper, maxNote, noteField] : null,
    live,
  );

  const sheet = openSheet({
    title: name.text,
    content,
    actions: anyOrderable ? addBtn : soldChip,
    closeLabel: t('sheet.close'),
    grabberLabels: [t('sheet.expand'), t('sheet.collapse')],
    lang: ctx.lang,
    dir: ctx.dir,
  });

  /** @param {number} next */
  function setQty(next) {
    qty = Math.max(1, Math.min(maxQty, next));
    update();
  }

  function update() {
    qtyValue.textContent = String(qty);
    minus.disabled = qty <= 1;
    plus.disabled = qty >= maxQty;
    maxNote.hidden = qty < maxQty;
    if (chosen)
      addBtn.replaceChildren(
        t('item.addTotal', { price: '' }).replace(/\s*$/, ' '),
        bdi(ctx.price(lineTotal(chosen.price, qty))),
      );
  }

  function add() {
    if (!chosen || !orderable(chosen)) return;
    const label = [name.text, chosen.name ? ctx.pick(chosen.name).text : '']
      .filter(Boolean)
      .join(' · ');
    ctx.setList(
      addToList(
        ctx.list,
        { itemId: item.id, variantId: chosen.id, price: chosen.price },
        qty,
        note.value,
        maxQty,
      ),
    );
    sheet.close();
    ctx.announce(t('item.added', { name: label, count: countOf(ctx.list, chosen.id) }));
  }

  update();
}
