// @ts-check
/**
 * "Ma commande": the phone follows its last order (issue #26, US-44). A chip under the café's
 * header shows the order's number and status; tapping it opens a sheet with the status,
 * "Actualiser", and the modules' blocks for it (`orderStatus.block`, e.g. the Google review
 * invitation once served, the same for every customer). Status comes from
 * `GET /api/orders/status` (no cookie).
 *
 * At most 3 automatic checks per order (order-store.js, A4); a check due while the page is
 * hidden waits until it is seen again. After that, the customer refreshes: opening
 * "Ma commande" checks, and so does "Actualiser". Nothing is checked once the order is served,
 * refused or cancelled.
 *
 * Loaded only when the phone has an order to follow, as its own file (the core stays within
 * its 20 KB budget). It imports nothing from the core: the page hands it the core's own
 * functions (`kit`), so the release build never splits shared code into an extra file.
 */
import fr from '../i18n/order/fr.json' with { type: 'json' };
import ar from '../i18n/order/ar.json' with { type: 'json' };
import en from '../i18n/order/en.json' with { type: 'json' };

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./order-store.js').Tracked} Tracked */

/** The texts of "Ma commande", per language (same keys in each, French fallback). */
export const ORDER_TEXT = /** @type {Record<string, Record<string, string>>} */ ({ fr, ar, en });

/**
 * What the page hands over: the core's own functions, so nothing is loaded twice.
 * @typedef {object} OrderKit
 * @property {typeof import('./dom.js').h} h
 * @property {typeof import('./dom.js').bdi} bdi
 * @property {typeof import('./sheet.js').openSheet} openSheet
 * @property {typeof import('./blocks.js').renderBlocks} renderBlocks
 * @property {typeof import('../hours.js').formatClock} formatClock
 * @property {typeof import('../i18n.js').translator} translator
 * @property {Pick<typeof import('./order-store.js'), 'saveTracked' | 'nextCheck' | 'FINAL' | 'KNOWN' | 'KEEP_MS'>} store
 */

/** A check asked by a tap right after another one waits this long. */
const TAP_GAP_MS = 5_000;

/**
 * Follows an order: shows the chip in `slot`, asks for its status as above.
 * @param {Ctx} ctx
 * @param {HTMLElement} slot   where the chip goes (under the café's header)
 * @param {Tracked} tracked
 * @param {OrderKit} kit
 * @param {{ storage?: Storage | null, fetch?: typeof fetch, now?: () => number }} [io]
 */
export function followOrder(ctx, slot, tracked, kit, io = {}) {
  const { h, bdi, openSheet, renderBlocks, formatClock } = kit;
  const { saveTracked, nextCheck, FINAL, KNOWN, KEEP_MS } = kit.store;
  /** The order texts in the page's language; the core's own for the sheet's buttons. */
  const t = kit.translator(ORDER_TEXT[ctx.lang] ?? fr, fr);
  const storage = io.storage === undefined ? (ctx.storage ?? null) : io.storage;
  const doFetch = io.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const clock = io.now ?? (() => Date.now());
  const cafe = ctx.boot.cafe.slug;
  let current = tracked;
  /** @type {(() => void)[]} */
  const listeners = [];
  let timer = 0;
  let expiry = 0;
  let stopped = false;
  let asking = false;
  let lastTap = 0;
  /** An automatic check came due while the page was hidden: done when it is seen again. */
  let pending = false;

  const chip = () =>
    h(
      'button',
      {
        type: 'button',
        class: `dm-orderchip dm-orderchip--${current.status}`,
        'aria-haspopup': 'dialog',
        onclick: () => {
          open();
          if (!FINAL.includes(current.status)) ask(true);
        },
      },
      h('span', null, t('order.chip', { number: current.number })),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h('strong', null, t(`order.s.${current.status}`)),
    );
  const draw = () => slot.replaceChildren(chip());
  const changed = () => {
    for (const fn of [...listeners]) fn();
  };

  function forget() {
    stop();
    clearTimeout(expiry);
    saveTracked(storage, cafe, null);
    slot.replaceChildren();
  }

  /**
   * Asks the server once.
   * @param {boolean} [tapped]  the customer asked ("Ma commande", "Actualiser")
   */
  async function ask(tapped = false) {
    if (stopped || asking) return;
    const now = clock();
    if (now - current.at > KEEP_MS) return forget();
    if (tapped) {
      if (now - lastTap < TAP_GAP_MS) return;
      lastTap = now;
    }
    asking = true;
    try {
      const res = await doFetch(
        `/api/orders/status?cafe=${encodeURIComponent(cafe)}&key=${encodeURIComponent(current.key)}`,
        { credentials: 'omit' },
      );
      if (res.status === 404) return forget();
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!data) return;
      const before = current.status;
      current = {
        ...current,
        checked: clock(),
        ...(typeof data.status === 'string' && KNOWN.includes(data.status)
          ? { status: data.status }
          : {}),
      };
      saveTracked(storage, cafe, current);
      if (current.status !== before) {
        draw();
        ctx.announce(
          t('order.now', {
            number: current.number,
            status: t(`order.s.${current.status}`),
          }),
        );
        // Served: "Ma commande" opens once by itself when a module has something to say then
        // (e.g. the Google review invitation), unless another sheet is open.
        if (
          current.status === 'served' &&
          ctx.ext.hasOrderStatusBlocks() &&
          !listeners.length &&
          !document.hidden &&
          !document.querySelector('dialog[open]')
        )
          open();
      }
      if (FINAL.includes(current.status)) stop();
      changed();
    } catch {
      /* offline: the customer can tap "Actualiser" */
    } finally {
      asking = false;
    }
  }

  /** Sets the timer for the next automatic check, if one is left. */
  function plan() {
    clearTimeout(timer);
    if (stopped) return;
    const wait = nextCheck(current, clock());
    if (wait === null) return;
    timer = window.setTimeout(async () => {
      if (document.hidden) {
        pending = true;
        return;
      }
      await ask();
      plan();
    }, wait);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  }
  async function onVisible() {
    if (document.hidden || !pending) return;
    pending = false;
    await ask();
    plan();
  }

  /** The order's sheet: number, status, "Actualiser", and the modules' blocks for that status. */
  function open() {
    const body = h('div', { class: 'dm-order' });
    const fill = () => {
      const blocks = ctx.ext
        .orderStatusBlocks({
          status: current.status,
          number: current.number,
          orderKey: current.key,
          cafe: ctx.boot.cafe.name,
          lang: ctx.lang,
        })
        .map(({ key, blocks }) => {
          const holder = h('div', { class: 'dm-postorder' });
          /** @param {import('./extensions.js').Block[]} b */
          const paint = (b) =>
            holder.replaceChildren(...renderBlocks(ctx, b, { key, replace: paint }));
          paint(blocks);
          return holder;
        });
      // While staff can still change it: "Actualiser" and when it was last checked.
      const refresh = FINAL.includes(current.status)
        ? []
        : [
            h(
              'div',
              { class: 'dm-order-refresh' },
              h(
                'button',
                {
                  type: 'button',
                  class: 'dm-plain dm-plain--center',
                  onclick: (/** @type {Event} */ e) => {
                    const b = /** @type {HTMLButtonElement} */ (e.currentTarget);
                    b.disabled = true;
                    ask(true).finally(() => (b.disabled = false));
                  },
                },
                t('order.refresh'),
              ),
              current.checked
                ? h(
                    'p',
                    { class: 'dm-order-checked' },
                    t('order.checked', {
                      time: formatClock(current.checked, ctx.boot.cafe.timeZone),
                    }),
                  )
                : null,
            ),
          ];
      body.replaceChildren(
        h(
          'div',
          { class: 'dm-done' },
          bdi(current.number, 'dm-ticket-number'),
          h('p', { class: 'dm-done-title' }, t(`order.s.${current.status}`)),
          h('p', { class: 'dm-actions-note' }, t(`order.help.${current.status}`)),
        ),
        ...blocks,
        ...refresh,
      );
    };
    fill();
    listeners.push(fill);
    openSheet({
      title: t('order.title'),
      content: body,
      closeLabel: ctx.t('sheet.close'),
      grabberLabels: [ctx.t('sheet.expand'), ctx.t('sheet.collapse')],
      lang: ctx.lang,
      dir: ctx.dir,
      onClose: () => {
        const i = listeners.indexOf(fill);
        if (i >= 0) listeners.splice(i, 1);
      },
    });
  }

  draw();
  // Forgotten 3 hours after it was sent, even on a page left open.
  expiry = window.setTimeout(forget, Math.max(0, current.at + KEEP_MS - clock()));
  if (FINAL.includes(current.status)) stopped = true;
  else {
    document.addEventListener('visibilitychange', onVisible);
    plan();
  }
  return {
    open,
    /** Stops following (the page redraws, or another order replaces this one). */
    stop: () => {
      stop();
      clearTimeout(expiry);
    },
    /** For tests and the page: what is followed now. */
    current: () => current,
  };
}
