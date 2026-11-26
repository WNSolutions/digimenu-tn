// @ts-check
/**
 * The café's "Info" sheet (C-06, C-07, issue #20): the address with a link to the map, the
 * opening hours per day, the business phone to call with one tap, and the café's social
 * links. Everything comes from the café's own information (staff app, "Infos du café").
 *
 * Loaded only when the customer opens it, as its own file next to the core (the core stays
 * within its 20 KB budget). It imports nothing from the core but its texts: the page hands it
 * the core's functions (`kit`), so the release build never splits shared code into a file the
 * core loads at start.
 */
import fr from '../i18n/info/fr.json' with { type: 'json' };
import ar from '../i18n/info/ar.json' with { type: 'json' };
import en from '../i18n/info/en.json' with { type: 'json' };

/** @typedef {import('./context.js').Ctx} Ctx */

/** The texts of the sheet, per language (same keys in each, French fallback). */
export const INFO_TEXT = /** @type {Record<string, Record<string, string>>} */ ({ fr, ar, en });

/**
 * Two icons only this sheet uses, added to the page's sprite the first time it opens.
 * Lucide 1.61.0 (ISC License, Copyright (c) Lucide Icons and Contributors), unchanged.
 */
const SYMBOLS =
  '<symbol id="i-phone" viewBox="0 0 24 24"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></symbol>' +
  '<symbol id="i-at-sign" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></symbol>';

/**
 * What the page hands over: the core's own functions, so nothing is loaded twice.
 * @typedef {object} InfoKit
 * @property {typeof import('./dom.js').h} h
 * @property {typeof import('./dom.js').icon} icon
 * @property {typeof import('./dom.js').langText} langText
 * @property {typeof import('./sheet.js').openSheet} openSheet
 * @property {typeof import('../hours.js').DAYS} DAYS
 */

/** How a social link is named: the network for the usual ones, else the site. @param {string} url */
export function socialName(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^(www|m)\./, '');
  } catch {
    return url;
  }
  /** @type {Record<string, string>} */
  const known = {
    'instagram.com': 'Instagram',
    'facebook.com': 'Facebook',
    'fb.com': 'Facebook',
    'tiktok.com': 'TikTok',
    'x.com': 'X',
    'twitter.com': 'X',
    'youtube.com': 'YouTube',
    'linkedin.com': 'LinkedIn',
    'snapchat.com': 'Snapchat',
  };
  return known[host] ?? host;
}

/**
 * A phone number as people read it: "+216 54 313 334" for Tunisia, else as stored.
 * @param {string} phone   international format, "+21654313334"
 */
export function phoneText(phone) {
  const m = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(phone);
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/**
 * @param {Ctx} ctx
 * @param {InfoKit} kit
 */
export function openInfoSheet(ctx, kit) {
  const { h, icon, langText, openSheet, DAYS } = kit;
  const own = INFO_TEXT[ctx.lang] ?? fr;
  /** @param {string} key */
  const t = (key) => own[key] ?? INFO_TEXT.fr[key] ?? ctx.t(key);
  const sprite = document.querySelector('#dm-sprite svg');
  if (sprite && !sprite.querySelector('#i-phone')) sprite.insertAdjacentHTML('beforeend', SYMBOLS);

  const cafe = ctx.boot.cafe;
  const info = cafe.info ?? {};
  const hours = cafe.hours;
  /** @param {string} name @param {string} title */
  const heading = (name, title) =>
    h('h3', { class: 'dm-info-h' }, icon(name, 'dm-icon--text'), title);
  /** A link that leaves the menu: a new tab, nothing about the visit passed along. */
  const out = (/** @type {string} */ href, /** @type {any} */ label, cls = 'dm-info-link') =>
    h('a', { class: cls, href, target: '_blank', rel: 'noopener noreferrer' }, label);

  const content = h(
    'div',
    { class: 'dm-info' },
    info.address || info.mapUrl
      ? h(
          'section',
          null,
          heading('map-pin', t('info.address')),
          info.address ? langText('p', ctx.pick(info.address), ctx.lang) : null,
          info.mapUrl ? out(info.mapUrl, t('info.map')) : null,
        )
      : null,
    hours
      ? h(
          'section',
          null,
          heading('clock', t('info.hours')),
          h(
            'dl',
            { class: 'dm-hours' },
            DAYS.flatMap((d) => [
              h('dt', null, ctx.t(`day.${d}`)),
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
    info.phone
      ? h(
          'section',
          null,
          heading('phone', t('info.phone')),
          h(
            'a',
            {
              class: 'dm-info-link',
              href: `tel:${info.phone}`,
              'aria-label': `${t('info.call')} ${phoneText(info.phone)}`,
            },
            h('bdi', { dir: 'ltr' }, phoneText(info.phone)),
          ),
        )
      : null,
    info.social?.length
      ? h(
          'section',
          null,
          heading('at-sign', t('info.follow')),
          h(
            'ul',
            { class: 'dm-info-social' },
            ...info.social.map((url) => h('li', null, out(url, socialName(url)))),
          ),
        )
      : null,
    h('p', { class: 'dm-footer' }, ctx.t('footer.by')),
  );
  openSheet({
    title: ctx.pick(cafe.name).text,
    content,
    closeLabel: ctx.t('sheet.close'),
    grabberLabels: [ctx.t('sheet.expand'), ctx.t('sheet.collapse')],
    lang: ctx.lang,
    dir: ctx.dir,
  });
}
