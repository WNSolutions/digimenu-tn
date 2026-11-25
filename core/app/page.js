// @ts-check
/**
 * The menu page: top bar, café header, sticky category bar, categories and items, the
 * floating "My list" capsule (docs/design/screens.md §1-2, components §2-8).
 */
import { h, icon, bdi, langText, reducedMotion } from './dom.js';
import { openStatus, formatClock } from '../hours.js';
import { countOf, countOfItem, addToList, DEFAULT_MAX_QTY } from '../list.js';
import { isOrderable } from '../menu/snapshot.js';
import { openItemSheet } from './item.js';
import { openListSheet } from './list-view.js';
import { openLanguageMenu, openInfoSheet } from './chrome.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('../menu/snapshot.js').Item} Item */
/** @typedef {import('../menu/snapshot.js').Variant} Variant */

/**
 * Renders the whole page into `root`. Returns a function that refreshes the parts that depend
 * on the list (capsule, "in your list" captions, + buttons at the maximum).
 * @param {HTMLElement} root
 * @param {Ctx} ctx
 */
export function renderPage(root, ctx) {
  const { boot, t } = ctx;
  const cafe = boot.cafe;
  const name = ctx.pick(cafe.name);
  const hideSoldOut = cafe.unavailable === 'hide';
  const maxQty = cafe.maxQtyPerLine || DEFAULT_MAX_QTY;

  // ---- Top bar (functional layer): inline title, language, info -----------------------------
  const langBtn =
    cafe.languages.enabled.length > 1
      ? h(
          'button',
          {
            type: 'button',
            class: 'dm-langbtn',
            'aria-haspopup': 'menu',
            'aria-expanded': 'false',
            'aria-label': t('lang.button', { language: t('lang.self') }),
            onclick: (/** @type {MouseEvent} */ ev) =>
              openLanguageMenu(/** @type {HTMLButtonElement} */ (ev.currentTarget), ctx),
          },
          icon('languages'),
          h('span', null, ctx.lang.toUpperCase()),
          icon('chevron-down', 'dm-icon--sm'),
        )
      : null;
  const infoBtn = h(
    'button',
    {
      type: 'button',
      class: 'dm-iconbtn',
      'aria-label': t('header.info'),
      onclick: () => openInfoSheet(ctx),
    },
    icon('info'),
  );
  const inlineTitle = langText('span', name, ctx.lang, 'dm-inline-title');
  inlineTitle.setAttribute('aria-hidden', 'true');
  const topbar = h(
    'div',
    { class: 'dm-topbar' },
    inlineTitle,
    h('div', { class: 'dm-topbar-actions' }, langBtn, infoBtn),
  );

  // ---- Café header (content layer) ------------------------------------------------------------
  const status = openStatus(cafe.hours, ctx.now(), cafe.timeZone);
  /** @type {(Node | string)[]} */
  const statusParts = [];
  if (status) {
    let text = t('header.closedNow');
    if (status.open) text = t('header.open', { time: status.closesAt });
    else if (status.opensAt) {
      text = status.sameDay
        ? t('header.closed', { time: status.opensAt })
        : t('header.closedDay', {
            day:
              ctx.lang === 'fr'
                ? t(`day.${status.opensDay}`).toLowerCase()
                : t(`day.${status.opensDay}`),
            time: status.opensAt,
          });
    }
    statusParts.push(
      h('span', { class: 'dm-status' }, icon('clock', 'dm-icon--text'), h('span', null, text)),
    );
  }
  if (boot.table?.valid) {
    statusParts.push(
      h(
        'button',
        {
          type: 'button',
          class: 'dm-tablechip',
          onclick: () => ctx.announce(t('header.tableHelp')),
          title: t('header.tableHelp'),
        },
        icon('utensils', 'dm-icon--text'),
        t('header.table', { table: '\u2068' + boot.table.label + '\u2069' }),
      ),
    );
  }
  const header = h(
    'header',
    { class: 'dm-header' },
    cafe.logo
      ? h('img', { class: 'dm-logo', src: cafe.logo, alt: '', width: 48, height: 48 })
      : null,
    langText('h1', name, ctx.lang, 'dm-title'),
    statusParts.length ? h('p', { class: 'dm-statusline' }, statusParts) : null,
  );

  // ---- Menu -----------------------------------------------------------------------------------
  /** @type {HTMLAnchorElement[]} */
  const chips = [];
  /** @type {HTMLElement[]} */
  const sections = [];
  for (const category of boot.menu.categories) {
    const items = category.groups.flatMap((g) => g.items);
    const visible = hideSoldOut
      ? items.filter((it) => it.available && it.variants.some((v) => v.available))
      : items;
    if (visible.length === 0) continue;
    const title = ctx.pick(category.title);
    const anchor = `cat-${category.id}`;
    const chip = h(
      'a',
      { href: `#${anchor}`, class: 'dm-chip', 'data-cat': category.id },
      langText('span', title, ctx.lang),
    );
    chip.addEventListener('click', (ev) => {
      ev.preventDefault();
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      select(category.id);
    });
    chips.push(chip);

    /** @type {Node[]} */
    const groupEls = [];
    for (const group of category.groups) {
      const groupItems = group.items.filter(
        (it) => !hideSoldOut || (it.available && it.variants.some((v) => v.available)),
      );
      if (groupItems.length === 0) continue;
      groupEls.push(
        h(
          'div',
          { class: 'dm-group' },
          group.title ? langText('h3', ctx.pick(group.title), ctx.lang, 'dm-group-title') : null,
          group.description
            ? langText('p', ctx.pick(group.description), ctx.lang, 'dm-group-desc')
            : null,
          h(
            'ul',
            { class: 'dm-items', role: 'list' },
            groupItems.map((item) => itemRow(item, ctx, hideSoldOut, maxQty)),
          ),
        ),
      );
    }
    const section = h(
      'section',
      { class: 'dm-category', 'aria-labelledby': anchor, 'data-cat': category.id },
      langText('h2', title, ctx.lang, 'dm-category-title'),
      category.subtitle
        ? langText('p', ctx.pick(category.subtitle), ctx.lang, 'dm-category-sub')
        : null,
      groupEls,
    );
    /** @type {HTMLElement} */ (section.firstElementChild).id = anchor;
    sections.push(section);
  }
  const nav = h(
    'nav',
    { class: 'dm-catbar', 'aria-label': t('menu.categories') },
    h('div', { class: 'dm-catbar-scroll' }, chips),
  );

  const banner = boot.offline
    ? h(
        'p',
        { class: 'dm-banner', role: 'status' },
        icon('wifi-off', 'dm-icon--text'),
        h(
          'span',
          null,
          t('offline.saved', { time: formatClock(boot.offline.savedAt, cafe.timeZone) }),
        ),
      )
    : null;

  const capsule = h('button', {
    type: 'button',
    class: 'dm-capsule',
    hidden: true,
    onclick: () => openListSheet(ctx),
  });
  const main = h(
    'main',
    { id: 'menu', class: 'dm-main' },
    banner,
    sections,
    h('p', { class: 'dm-footer' }, t('footer.by')),
  );

  root.replaceChildren(
    h('a', { class: 'dm-skip', href: '#menu' }, t('menu.skip')),
    h('div', { class: 'dm-top' }, topbar),
    header,
    nav,
    main,
    h('div', { class: 'dm-capsule-wrap' }, capsule),
  );

  // ---- Behaviour: inline title, scroll spy ----------------------------------------------------
  const topEl = /** @type {HTMLElement} */ (root.querySelector('.dm-top'));
  const titleEl = /** @type {HTMLElement} */ (header.querySelector('.dm-title'));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => topEl.classList.toggle('is-scrolled', !e.isIntersecting), {
      rootMargin: '-52px 0px 0px 0px',
    }).observe(titleEl);
  }
  /** @param {string} id */
  function select(id) {
    for (const chip of chips) {
      const on = chip.dataset.cat === id;
      chip.classList.toggle('is-current', on);
      if (on) {
        chip.setAttribute('aria-current', 'true');
        const bar = /** @type {HTMLElement} */ (chip.parentElement);
        const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
        bar.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } else chip.removeAttribute('aria-current');
    }
  }
  let ticking = false;
  const spy = () => {
    ticking = false;
    const line = nav.getBoundingClientRect().bottom + 8;
    let currentId = sections[0]?.dataset.cat;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) currentId = s.dataset.cat;
    if (
      currentId &&
      !chips.find((c) => c.dataset.cat === currentId)?.classList.contains('is-current')
    )
      select(currentId);
  };
  window.onscroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(spy);
    }
  };
  spy();

  // ---- List-dependent parts ---------------------------------------------------------------------
  function refreshList() {
    const checked = ctx.check();
    if (checked.count > 0) {
      capsule.hidden = false;
      capsule.setAttribute(
        'aria-label',
        t('list.capsuleLabel', { count: checked.count, price: ctx.price(checked.total) }),
      );
      capsule.replaceChildren(
        icon('receipt-text'),
        h('span', { class: 'dm-capsule-label' }, t('list.capsule', { count: checked.count })),
        bdi(ctx.price(checked.total), 'dm-capsule-total'),
      );
    } else capsule.hidden = true;
    for (const el of root.querySelectorAll('[data-in-list]')) {
      const node = /** @type {HTMLElement} */ (el);
      const n = node.dataset.variant
        ? countOf(ctx.list, node.dataset.variant)
        : countOfItem(ctx.list, node.dataset.item ?? '');
      node.hidden = n === 0;
      node.textContent = n ? t('item.inList', { count: n }) : '';
    }
    for (const el of root.querySelectorAll('button[data-add]')) {
      const btn = /** @type {HTMLButtonElement} */ (el);
      const line = ctx.list.lines.find((l) => l.variantId === btn.dataset.add && l.note === '');
      const atMax = (line?.qty ?? 0) >= maxQty;
      btn.disabled = atMax;
      const cap = btn.parentElement?.querySelector('[data-max]');
      if (cap) /** @type {HTMLElement} */ (cap).hidden = !atMax;
    }
  }
  refreshList();
  return refreshList;
}

/**
 * One item: name, description, and either one price with + or one row per variant.
 * @param {Item} item
 * @param {Ctx} ctx
 * @param {boolean} hideSoldOut
 * @param {number} maxQty
 */
function itemRow(item, ctx, hideSoldOut, maxQty) {
  const name = ctx.pick(item.name);
  const variants = item.variants.filter((v) => !hideSoldOut || v.available);
  const single = item.variants.length === 1;
  const itemSoldOut = !item.available || item.variants.every((v) => !v.available);
  const open = h(
    'button',
    { type: 'button', class: 'dm-item-open', onclick: () => openItemSheet(item, ctx) },
    name.text,
  );
  if (name.lang !== ctx.lang) open.setAttribute('lang', name.lang);
  const head = h(
    'div',
    { class: 'dm-item-text' },
    h('h3', { class: 'dm-item-name' }, open),
    item.description ? langText('p', ctx.pick(item.description), ctx.lang, 'dm-item-desc') : null,
  );
  if (single) {
    const v = item.variants[0];
    return h(
      'li',
      { class: `dm-item${itemSoldOut ? ' is-soldout' : ''}` },
      head,
      h(
        'div',
        { class: 'dm-item-end' },
        bdi(ctx.price(v.price), 'dm-price'),
        endControl(item, v, ctx, maxQty),
        h('span', { class: 'dm-inlist', 'data-in-list': '', 'data-variant': v.id, hidden: true }),
      ),
    );
  }
  return h(
    'li',
    { class: `dm-item dm-item--variants${itemSoldOut ? ' is-soldout' : ''}` },
    head,
    h(
      'ul',
      { class: 'dm-variants', role: 'list' },
      variants.map((v) => {
        const vSold = !item.available || !v.available;
        return h(
          'li',
          { class: `dm-variant${vSold ? ' is-soldout' : ''}` },
          v.name ? langText('span', ctx.pick(v.name), ctx.lang, 'dm-variant-name') : null,
          h(
            'div',
            { class: 'dm-item-end' },
            bdi(ctx.price(v.price), 'dm-price'),
            endControl(item, v, ctx, maxQty),
            h('span', {
              class: 'dm-inlist',
              'data-in-list': '',
              'data-variant': v.id,
              hidden: true,
            }),
          ),
        );
      }),
    ),
  );
}

/**
 * The + button, or the sold-out chip.
 * @param {Item} item
 * @param {Variant} v
 * @param {Ctx} ctx
 * @param {number} maxQty
 */
function endControl(item, v, ctx, maxQty) {
  const { t } = ctx;
  if (!isOrderable({ item, variant: v, category: /** @type {any} */ (null) })) {
    return h('span', { class: 'dm-soldout' }, t('item.soldOut'));
  }
  const label = [ctx.pick(item.name).text, v.name ? ctx.pick(v.name).text : '']
    .filter(Boolean)
    .join(' · ');
  return h(
    'span',
    { class: 'dm-add-wrap' },
    h(
      'button',
      {
        type: 'button',
        class: 'dm-add',
        'data-add': v.id,
        'aria-label': t('item.add', { name: label, price: ctx.price(v.price) }),
        onclick: () => {
          ctx.setList(
            addToList(
              ctx.list,
              { itemId: item.id, variantId: v.id, price: v.price },
              1,
              '',
              maxQty,
            ),
          );
          ctx.announce(t('item.added', { name: label, count: countOf(ctx.list, v.id) }));
        },
      },
      icon('plus'),
    ),
    h('span', { class: 'dm-max', 'data-max': '', hidden: true }, t('item.max', { max: maxQty })),
  );
}
