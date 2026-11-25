// @ts-check
/**
 * Top-bar controls: the language pop-up menu (components §3) and the café info sheet.
 */
import { h, icon, langText } from './dom.js';
import { openSheet } from './sheet.js';
import { TEXTS } from './context.js';
import { DAYS } from '../hours.js';

/** @typedef {import('./context.js').Ctx} Ctx */

/**
 * A custom menu (not a native <select>, which cannot mark each option's language and
 * direction). Lists only the café's languages, each in its own language and script.
 * @param {HTMLButtonElement} button
 * @param {Ctx} ctx
 */
export function openLanguageMenu(button, ctx) {
  const existing = document.querySelector('.dm-menu');
  if (existing) {
    existing.remove();
    button.setAttribute('aria-expanded', 'false');
    return;
  }
  const items = ctx.boot.cafe.languages.enabled.map((lang) =>
    h(
      'button',
      {
        type: 'button',
        role: 'menuitemradio',
        'aria-checked': String(lang === ctx.lang),
        lang,
        dir: lang === 'ar' ? 'rtl' : 'ltr',
        class: 'dm-menu-item',
        onclick: () => {
          close();
          if (lang !== ctx.lang) ctx.setLang(lang);
        },
      },
      h('span', null, TEXTS[lang]['lang.self']),
      lang === ctx.lang ? icon('check') : null,
    ),
  );
  const menu = h(
    'div',
    {
      class: 'dm-menu',
      role: 'menu',
      'aria-label': ctx.t('lang.button', { language: ctx.t('lang.self') }),
    },
    items,
  );
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  if (ctx.dir === 'rtl') menu.style.left = `${Math.max(8, rect.left)}px`;
  else menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  document.body.appendChild(menu);
  button.setAttribute('aria-expanded', 'true');
  /** @type {HTMLElement} */ (
    items.find((b) => b.getAttribute('aria-checked') === 'true') ?? items[0]
  )?.focus();

  /** @param {Event} ev */
  const outside = (ev) => {
    if (!menu.contains(/** @type {Node} */ (ev.target)) && ev.target !== button) close();
  };
  /** @param {KeyboardEvent} ev */
  const keys = (ev) => {
    if (ev.key === 'Escape') {
      close();
      button.focus();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const i = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
      const next = items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus();
    }
  };
  function close() {
    menu.remove();
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
  });
}

/**
 * Café info: address and opening hours.
 * @param {Ctx} ctx
 */
export function openInfoSheet(ctx) {
  const { t } = ctx;
  const cafe = ctx.boot.cafe;
  const hours = cafe.hours;
  const content = h(
    'div',
    { class: 'dm-info' },
    cafe.info?.address
      ? h(
          'section',
          null,
          h('h3', { class: 'dm-info-h' }, icon('map-pin', 'dm-icon--text'), t('info.address')),
          langText('p', ctx.pick(cafe.info.address), ctx.lang),
        )
      : null,
    hours
      ? h(
          'section',
          null,
          h('h3', { class: 'dm-info-h' }, icon('clock', 'dm-icon--text'), t('info.hours')),
          h(
            'dl',
            { class: 'dm-hours' },
            DAYS.flatMap((d) => [
              h('dt', null, t(`day.${d}`)),
              h(
                'dd',
                null,
                (hours[d] ?? []).length
                  ? (hours[d] ?? []).map(([a, b]) => h('bdi', null, `${a} – ${b}`))
                  : t('info.closed'),
              ),
            ]),
          ),
        )
      : null,
    h('p', { class: 'dm-footer' }, t('footer.by')),
  );
  openSheet({
    title: ctx.pick(cafe.name).text,
    content,
    closeLabel: t('sheet.close'),
    grabberLabels: [t('sheet.expand'), t('sheet.collapse')],
    lang: ctx.lang,
    dir: ctx.dir,
  });
}
