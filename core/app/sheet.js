// @ts-check
/**
 * Sheet: the one modal container of the customer page (docs/design/components.md §1.2).
 *
 * Built on `<dialog>` + `showModal()`: focus stays inside, Escape closes, the page behind is
 * inert. Opens from the bottom over a scrim; Close is on the leading side; the grabber is a
 * button (expand / collapse) and can be dragged down to close. Opening pushes a history entry,
 * so the phone's Back gesture closes the sheet first. One sheet at a time.
 */
import { h, icon, reducedMotion } from './dom.js';

/**
 * @typedef {object} SheetOptions
 * @property {string} title
 * @property {Node} content
 * @property {Node} [actions]           pinned bottom actions
 * @property {'auto' | 'large' | 'full'} [size]   'full' = full-screen modal (show to waiter)
 * @property {string} closeLabel
 * @property {[string, string]} [grabberLabels]   [expand, collapse]
 * @property {Node} [headerExtra]       trailing control in the top bar
 * @property {boolean} [hideTitle]      title for screen readers only
 * @property {string} [lang]
 * @property {'ltr' | 'rtl'} [dir]
 * @property {() => void} [onClose]
 *
 * @typedef {{ dialog: HTMLDialogElement, body: HTMLElement, close: () => void }} Sheet
 */

/** @type {(Sheet & { close: (fromHistory?: boolean) => void, pushed: () => boolean }) | null} */
let current = null;
let counter = 0;

/**
 * @param {SheetOptions} opts
 * @returns {Sheet}
 */
export function openSheet(opts) {
  // Replacing an open sheet (list → show to waiter) reuses its history entry, so one Back
  // returns to the menu and the old sheet's history.back() cannot close the new one.
  const reuseHistory = current?.pushed() ?? false;
  if (current) current.close(true);
  const id = `dm-sheet-${++counter}`;
  const returnFocus = /** @type {HTMLElement | null} */ (document.activeElement);
  const size = opts.size ?? 'auto';

  const titleEl = h(
    'h2',
    { id: `${id}-t`, class: opts.hideTitle ? 'dm-sr' : 'dm-sheet-title' },
    opts.title,
  );
  const closeBtn = h(
    'button',
    {
      type: 'button',
      class: 'dm-iconbtn',
      'aria-label': opts.closeLabel,
      onclick: () => sheet.close(),
    },
    icon('x'),
  );
  const bar = h(
    'div',
    { class: 'dm-sheet-bar' },
    closeBtn,
    titleEl,
    opts.headerExtra ?? h('span', { class: 'dm-iconbtn-spacer' }),
  );
  /** @type {HTMLButtonElement | null} */
  let grabber = null;
  if (size !== 'full' && opts.grabberLabels) {
    const [expand, collapse] = opts.grabberLabels;
    grabber = h('button', {
      type: 'button',
      class: 'dm-grabber',
      'aria-label': expand,
      onclick: () => {
        const large = dialog.classList.toggle('is-large');
        grabber?.setAttribute('aria-label', large ? collapse : expand);
      },
    });
  }
  const body = h('div', { class: 'dm-sheet-body' }, opts.content);
  const dialog = h(
    'dialog',
    {
      class: `dm-sheet dm-sheet--${size}`,
      'aria-labelledby': `${id}-t`,
      lang: opts.lang,
      dir: opts.dir,
    },
    h(
      'div',
      { class: 'dm-sheet-panel' },
      grabber,
      bar,
      body,
      opts.actions ? h('div', { class: 'dm-sheet-actions' }, opts.actions) : null,
    ),
  );
  if (size === 'large') dialog.classList.add('is-large');

  let closed = false;
  let pushed = false;
  const onPop = () => sheet.close(true);

  /** @type {Sheet & { close: (fromHistory?: boolean) => void, pushed: () => boolean }} */
  const sheet = {
    dialog,
    body,
    pushed: () => pushed && !closed,
    close(fromHistory = false) {
      if (closed) return;
      closed = true;
      if (current === sheet) current = null;
      window.removeEventListener('popstate', onPop);
      dialog.classList.remove('is-open');
      const finish = () => {
        if (dialog.open) dialog.close();
        dialog.remove();
        if (returnFocus && document.contains(returnFocus))
          returnFocus.focus({ preventScroll: true });
      };
      if (reducedMotion()) finish();
      else setTimeout(finish, 280);
      if (pushed && !fromHistory && history.state?.dmSheet === id) history.back();
      opts.onClose?.();
    },
  };

  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    sheet.close();
  });
  // A tap on the scrim (the dialog's own box, outside the panel) closes the sheet.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) sheet.close();
  });
  enableDrag(dialog, () => sheet.close());

  document.body.appendChild(dialog);
  dialog.showModal();
  requestAnimationFrame(() => dialog.classList.add('is-open'));
  try {
    if (reuseHistory) history.replaceState({ dmSheet: id }, '');
    else history.pushState({ dmSheet: id }, '');
    pushed = true;
    window.addEventListener('popstate', onPop);
  } catch {
    /* history unavailable (sandboxed preview): Back simply leaves the page */
  }
  current = sheet;
  return sheet;
}

/**
 * Drag the grabber or the top bar down to close (past 30 % of the height, or a quick flick).
 * @param {HTMLDialogElement} dialog
 * @param {() => void} close
 */
function enableDrag(dialog, close) {
  const panel = /** @type {HTMLElement} */ (dialog.firstElementChild);
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let dragging = false;
  panel.addEventListener('pointerdown', (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    if (!target.closest('.dm-grabber, .dm-sheet-bar') || target.closest('button:not(.dm-grabber)'))
      return;
    dragging = true;
    startY = ev.clientY;
    startT = ev.timeStamp;
    dy = 0;
    panel.setPointerCapture(ev.pointerId);
    panel.classList.add('is-dragging');
  });
  panel.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    dy = Math.max(0, ev.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const end = (/** @type {PointerEvent} */ ev) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('is-dragging');
    const fast = dy > 40 && dy / Math.max(1, ev.timeStamp - startT) > 0.6;
    panel.style.transform = '';
    if (dy > panel.offsetHeight * 0.3 || fast) close();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
}
