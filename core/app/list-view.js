// @ts-check
/**
 * The list sheet (components §8) and the show-to-waiter screen (§11, §1.3 "the ticket").
 * The list's main button comes from the café's order channel (a module contributing
 * `list.action`, e.g. "Commander par WhatsApp"). Without one, or when the café is closed, the
 * main button is "Montrer au serveur": it sends nothing and asks for no personal data (US-10).
 */
import { h, icon, bdi, langText } from './dom.js';
import { openSheet } from './sheet.js';
import { setQty, setListNote, checkList, NOTE_MAX, DEFAULT_MAX_QTY, emptyList } from '../list.js';
import { indexSnapshot } from '../menu/snapshot.js';
import { langParts } from './context.js';
import { formatClock, openStatus } from '../hours.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('../list.js').CheckedLine} CheckedLine */

/**
 * @param {Ctx} ctx
 */
export function openListSheet(ctx) {
  const { t } = ctx;
  const maxQty = ctx.boot.cafe.maxQtyPerLine || DEFAULT_MAX_QTY;
  /** @type {Map<string, { line: import('../list.js').Line, name: string }>} */
  const removed = new Map();
  const content = h('div', { class: 'dm-listsheet' });
  const actions = h('div', { class: 'dm-actions-stack' });
  const sheet = openSheet({
    title: t('list.title'),
    content,
    actions,
    closeLabel: t('sheet.close'),
    grabberLabels: [t('sheet.expand'), t('sheet.collapse')],
    size: ctx.list.lines.length > 3 ? 'large' : 'auto',
    lang: ctx.lang,
    dir: ctx.dir,
  });
  let confirming = false;
  /** Key of the action the customer has tapped (its "after" line is shown). */
  let tapped = '';
  // Modules finish loading in the background; draw again once they are there.
  ctx.ready.then(() => sheet.dialog.open && render());

  function render() {
    const checked = checkList(ctx.list, ctx.index);
    if (checked.lines.length === 0 && removed.size === 0) {
      content.replaceChildren(
        h(
          'div',
          { class: 'dm-empty' },
          h('p', null, t('list.empty')),
          h(
            'button',
            { type: 'button', class: 'dm-plain', onclick: () => sheet.close() },
            t('list.backToMenu'),
          ),
        ),
      );
      actions.replaceChildren();
      return;
    }
    const where = ctx.boot.table?.valid
      ? h(
          'p',
          { class: 'dm-where' },
          icon('utensils', 'dm-icon--text'),
          t('list.table', { table: '\u2068' + ctx.boot.table.label + '\u2069' }),
        )
      : h('p', { class: 'dm-where' }, t('list.noTable'));

    /** @type {Node[]} */
    const rows = checked.lines.map((c) => lineRow(c));
    for (const [key, r] of removed) {
      rows.push(
        h(
          'li',
          { class: 'dm-line dm-line--removed' },
          h('span', null, t('list.removed', { name: r.name })),
          h(
            'button',
            {
              type: 'button',
              class: 'dm-plain',
              onclick: () => {
                removed.delete(key);
                ctx.setList({ ...ctx.list, lines: [...ctx.list.lines, r.line] });
                render();
              },
            },
            t('list.undo'),
          ),
        ),
      );
    }

    const noteCounter = h('span', { class: 'dm-counter', hidden: true });
    const listNote = h('textarea', {
      class: 'dm-textarea',
      id: 'list-note',
      rows: 2,
      maxlength: NOTE_MAX,
      placeholder: t('list.notePlaceholder'),
      onchange: () => ctx.setList(setListNote(ctx.list, listNote.value)),
      oninput: () => {
        const n = Array.from(listNote.value).length;
        noteCounter.hidden = n < 150;
        noteCounter.textContent = t('note.count', { count: n, max: NOTE_MAX });
      },
    });
    listNote.value = ctx.list.note;

    content.replaceChildren(
      where,
      h('ul', { class: 'dm-lines', role: 'list' }, rows),
      h(
        'div',
        { class: 'dm-field' },
        h('label', { class: 'dm-field-label', for: 'list-note' }, t('list.note')),
        listNote,
        noteCounter,
      ),
      h(
        'p',
        { class: 'dm-total', 'aria-live': 'polite' },
        h('span', null, t('list.total')),
        bdi(ctx.price(checked.total)),
      ),
      confirming
        ? h(
            'div',
            { class: 'dm-confirm', role: 'alertdialog', 'aria-label': t('list.clearConfirm') },
            h('p', null, t('list.clearConfirm')),
            h(
              'button',
              {
                type: 'button',
                class: 'dm-destructive',
                onclick: () => {
                  confirming = false;
                  removed.clear();
                  ctx.setList(emptyList());
                  ctx.announce(t('list.cleared'));
                  render();
                },
              },
              icon('trash-2'),
              t('list.clear'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'dm-plain',
                onclick: () => ((confirming = false), render()),
              },
              t('list.cancel'),
            ),
          )
        : h(
            'button',
            {
              type: 'button',
              class: 'dm-plain dm-plain--danger',
              onclick: () => ((confirming = true), render()),
            },
            icon('trash-2'),
            t('list.clear'),
          ),
    );
    actions.replaceChildren(...orderActions(checked));
  }

  /**
   * The main button: the café's order channel when it has one and is open, otherwise
   * "Montrer au serveur" (which stays as a second choice under the channel).
   * @param {ReturnType<typeof checkList>} checked
   * @returns {Node[]}
   */
  function orderActions(checked) {
    const showWaiter = (/** @type {boolean} */ main) =>
      h(
        'button',
        {
          type: 'button',
          class: main ? 'dm-prominent' : 'dm-plain dm-plain--center',
          disabled: checked.count === 0,
          onclick: () => openWaiter(ctx),
        },
        t('list.showWaiter'),
      );
    const channel = ctx.ext.listActions({
      checked,
      note: ctx.list.note,
      cafe: ctx.boot.cafe,
      table: ctx.boot.table,
      lang: ctx.lang,
      now: ctx.now(),
    })[0];
    if (!channel || checked.count === 0) {
      return [h('p', { class: 'dm-actions-note' }, t('list.showOnly')), showWaiter(true)];
    }
    const hours = openStatus(ctx.boot.cafe.hours, ctx.now(), ctx.boot.cafe.timeZone);
    if (hours && !hours.open) {
      const closed = hours.opensAt
        ? t('list.orderClosed', { time: hours.opensAt })
        : t('list.orderClosedNoTime');
      return [h('p', { class: 'dm-actions-note' }, closed), showWaiter(true)];
    }
    return [
      h(
        'p',
        { class: 'dm-actions-note', 'aria-live': 'polite' },
        tapped === channel.key && channel.after ? channel.after : (channel.note ?? ''),
      ),
      h(
        'a',
        {
          class: 'dm-prominent',
          href: channel.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          onclick: () => {
            tapped = channel.key;
            if (channel.after) ctx.announce(channel.after);
            setTimeout(render, 0);
          },
        },
        channel.icon ? icon(channel.icon) : null,
        channel.label,
      ),
      showWaiter(false),
    ];
  }

  /** @param {CheckedLine} c */
  function lineRow(c) {
    const entry = c.entry;
    const nameText = entry ? ctx.pick(entry.item.name).text : c.line.variantId;
    const variantText = entry?.variant.name ? ctx.pick(entry.variant.name).text : '';
    const label = [nameText, variantText].filter(Boolean).join(' · ');
    const bad = c.status === 'unavailable' || c.status === 'gone';
    const minus = h(
      'button',
      {
        type: 'button',
        class: 'dm-stepper-btn',
        'aria-label': t('qty.minusOf', { name: label }),
        onclick: () => change(c.line.qty - 1),
      },
      icon(c.line.qty === 1 ? 'trash-2' : 'minus'),
    );
    const plus = h(
      'button',
      {
        type: 'button',
        class: 'dm-stepper-btn',
        'aria-label': t('qty.plusOf', { name: label }),
        disabled: bad || c.line.qty >= maxQty,
        onclick: () => change(c.line.qty + 1),
      },
      icon('plus'),
    );
    /** @param {number} q */
    function change(q) {
      if (q <= 0) removed.set(c.key, { line: c.line, name: label });
      ctx.setList(setQty(ctx.list, c.key, q, maxQty));
      render();
    }
    return h(
      'li',
      { class: `dm-line${bad ? ' is-flagged' : ''}` },
      h(
        'div',
        { class: 'dm-line-text' },
        h('span', { class: 'dm-line-name' }, label),
        h('span', { class: 'dm-line-unit' }, bdi(ctx.price(c.unitPrice))),
        c.line.note ? h('span', { class: 'dm-line-note' }, c.line.note) : null,
        bad
          ? h(
              'span',
              { class: 'dm-flag' },
              icon('triangle-alert', 'dm-icon--text'),
              t('list.unavailable'),
            )
          : c.status === 'price_changed'
            ? h(
                'span',
                { class: 'dm-flag' },
                icon('triangle-alert', 'dm-icon--text'),
                t('list.priceChanged', { price: '' }),
                bdi(ctx.price(c.unitPrice)),
              )
            : null,
      ),
      bad
        ? h(
            'button',
            { type: 'button', class: 'dm-plain', onclick: () => change(0) },
            t('list.remove'),
          )
        : h(
            'div',
            { class: 'dm-stepper dm-stepper--sm', role: 'group', 'aria-label': label },
            minus,
            h('output', { class: 'dm-stepper-value' }, String(c.line.qty)),
            plus,
          ),
      h('span', { class: 'dm-line-total' }, bad ? null : bdi(ctx.price(c.total))),
    );
  }

  render();
}

/**
 * Full-screen summary for the waiter (US-10). Its language can be switched for the waiter
 * without changing the page's language.
 * @param {Ctx} ctx
 */
export function openWaiter(ctx) {
  const index = indexSnapshot(ctx.boot.menu);
  const langs = ctx.boot.cafe.languages.enabled;
  const ticketWrap = h('div', { class: 'dm-waiter' });
  /** @type {HTMLButtonElement[]} */
  const segs = [];
  const seg = h(
    'div',
    { class: 'dm-segmented', role: 'radiogroup', 'aria-label': ctx.t('waiter.language') },
    langs.map((l) => {
      const label = { fr: 'FR', ar: 'عربي', en: 'EN' }[l];
      const b = h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(l === ctx.lang),
          lang: l,
          onclick: () => show(l),
        },
        label,
      );
      segs.push(b);
      return b;
    }),
  );
  openSheet({
    title: ctx.t('waiter.title'),
    hideTitle: true,
    content: ticketWrap,
    size: 'full',
    closeLabel: ctx.t('sheet.close'),
    headerExtra: langs.length > 1 ? seg : undefined,
    lang: ctx.lang,
    dir: ctx.dir,
  });

  /** @param {import('../i18n.js').Lang} lang */
  function show(lang) {
    const p = langParts(lang);
    segs.forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('lang') === lang)));
    const checked = checkList(ctx.list, index);
    const lines = checked.lines.filter((c) => c.status === 'ok' || c.status === 'price_changed');
    const table = ctx.boot.table?.valid ? ctx.boot.table.label : null;
    ticketWrap.replaceChildren(
      h(
        'section',
        { class: 'dm-ticket', lang, dir: p.dir, 'aria-labelledby': 'ticket-h' },
        h(
          'p',
          { class: 'dm-ticket-meta' },
          langText('span', p.pick(ctx.boot.cafe.name), lang),
          bdi(formatClock(ctx.now().getTime(), ctx.boot.cafe.timeZone)),
        ),
        table
          ? h(
              'h2',
              { id: 'ticket-h', class: 'dm-ticket-head' },
              h('span', { class: 'dm-ticket-label' }, p.t('waiter.table')),
              bdi(table, 'dm-ticket-number'),
            )
          : h(
              'h2',
              { id: 'ticket-h', class: 'dm-ticket-head' },
              h(
                'span',
                { class: 'dm-ticket-number dm-ticket-number--text' },
                p.t('waiter.noTable'),
              ),
            ),
        h('div', { class: 'dm-tear', 'aria-hidden': 'true' }),
        h(
          'ul',
          { class: 'dm-ticket-lines', role: 'list' },
          lines.map((c) => {
            const e = /** @type {import('../menu/snapshot.js').Entry} */ (c.entry);
            const label = [
              p.pick(e.item.name).text,
              e.variant.name ? p.pick(e.variant.name).text : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return h(
              'li',
              null,
              h(
                'div',
                { class: 'dm-ticket-line' },
                h('span', null, h('b', null, `${c.line.qty} ×`), ' ', label),
                bdi(p.price(c.total)),
              ),
              c.line.note
                ? h('p', { class: 'dm-ticket-note' }, p.t('waiter.note', { note: c.line.note }))
                : null,
            );
          }),
        ),
        ctx.list.note
          ? h(
              'p',
              { class: 'dm-ticket-note dm-ticket-note--order' },
              p.t('waiter.note', { note: ctx.list.note }),
            )
          : null,
        h(
          'p',
          { class: 'dm-ticket-total' },
          h('span', null, p.t('waiter.total')),
          bdi(p.price(checked.total)),
        ),
      ),
    );
  }
  show(ctx.lang);
}
