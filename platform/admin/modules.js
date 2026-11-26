// @ts-check
/**
 * "Modules" in the staff app (issue #21, US-29, MOD-16): which features a café has, and the
 * switches (platform/shell/src/modules-api.js decides who may do what).
 *
 * - Maintainer: switches a module off at once (kill switch); "on" at a live café is a request
 *   Admin approves; at a café being set up, on at once.
 * - Admin: switches on and off, approves or refuses requests, and sees on start what others
 *   changed in any café (`noticeBar`).
 * - Manager: sees the switches and the history; asks Admin.
 *
 * Switching off asks a second tap on the same button (no browser dialog).
 *
 * On top, the café's version and the way back to the previous one (release.js, #24).
 */
import { releaseCard } from './release.js';

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const MODULES_TEXT = {
  fr: {
    tab: 'Modules',
    intro:
      'Les fonctions de ce café. Désactiver retire tout de suite l’écran, les champs et les demandes du module ; ses données sont gardées.',
    managerNote: 'Pour activer ou désactiver un module, demandez à l’administrateur.',
    on: 'Activé',
    off: 'Désactivé',
    missing: 'Activé, mais il manque : {what}. Il reste éteint jusqu’à ce que ce soit rempli.',
    notInRelease: 'Pas dans la version de ce café ({r}).',
    paid: 'Payant (payé par le café)',
    experimental: 'Nouveau',
    turnOn: 'Activer',
    turnOff: 'Désactiver',
    confirmOff: 'Confirmer : désactiver',
    askOn: 'Demander l’activation',
    requested: 'Activation demandée par {n}, {d}. En attente de l’administrateur.',
    approve: 'Approuver',
    reject: 'Refuser',
    doneOn: '{m} est activé. Les clients le voient d’ici une minute.',
    doneOff: '{m} est désactivé. Les clients ne le voient plus d’ici une minute.',
    alsoOff: 'Aussi désactivé, car il en a besoin : {m}.',
    doneRequest: 'Demande envoyée. L’administrateur la verra en ouvrant l’application.',
    doneApprove: 'Approuvé : {m} est activé.',
    doneReject: 'Demande refusée.',
    missingDependency: 'Il faut d’abord activer : {m}.',
    conflict: 'Ne peut pas être activé avec : {m}.',
    notInReleaseErr:
      'Ce module n’est pas dans la version de ce café ({r}). Mettez d’abord la version à jour.',
    paidOnly: 'Module payant : seul l’administrateur l’active, avec l’accord écrit du café.',
    already: 'Une demande attend déjà l’administrateur.',
    forbidden: 'Votre rôle ne permet pas ce changement.',
    error: 'Une erreur est survenue. Réessayez.',
    history: 'Historique',
    noHistory: 'Aucun changement pour le moment.',
    hOn: '{m} activé',
    hOff: '{m} désactivé',
    hAlso: ' (et {m})',
    hRequest: 'activation de {m} demandée',
    hBy: '{n}, {d}',
    dApproved: 'approuvée par {n}',
    dRejected: 'refusée par {n}',
    dReplaced: 'remplacée',
    someone: 'quelqu’un',
    noticeTitle: 'Changements de modules à voir',
    noticePending: '{c} : {n} demande d’activer {m}.',
    noticeOff: '{c} : {n} a désactivé {m}, {d}.',
    noticeOn: '{c} : {n} a activé {m}, {d}.',
    noticeSeen: 'Vu',
    noticeOpen: 'Ouvrir',
  },
  ar: {
    tab: 'الوحدات',
    intro:
      'وظائف هذا المقهى. الإيقاف يزيل فورًا شاشة الوحدة وحقولها وطلباتها؛ وتبقى بياناتها محفوظة.',
    managerNote: 'لتشغيل وحدة أو إيقافها، اطلب ذلك من الإدارة.',
    on: 'مفعّلة',
    off: 'متوقفة',
    missing: 'مفعّلة، لكن ينقصها: {what}. تبقى متوقفة حتى يُملأ ذلك.',
    notInRelease: 'ليست في نسخة هذا المقهى ({r}).',
    paid: 'بمقابل (يدفعه المقهى)',
    experimental: 'جديدة',
    turnOn: 'تشغيل',
    turnOff: 'إيقاف',
    confirmOff: 'تأكيد: إيقاف',
    askOn: 'طلب التشغيل',
    requested: 'طلب {n} التشغيل، {d}. في انتظار الإدارة.',
    approve: 'موافقة',
    reject: 'رفض',
    doneOn: 'تم تشغيل {m}. يراها الحرفاء خلال دقيقة.',
    doneOff: 'تم إيقاف {m}. لن يراها الحرفاء خلال دقيقة.',
    alsoOff: 'أوقفت أيضًا لأنها تحتاجها: {m}.',
    doneRequest: 'أُرسل الطلب. ستراه الإدارة عند فتح التطبيق.',
    doneApprove: 'تمت الموافقة: {m} مفعّلة.',
    doneReject: 'رُفض الطلب.',
    missingDependency: 'يجب أولًا تشغيل: {m}.',
    conflict: 'لا يمكن تشغيلها مع: {m}.',
    notInReleaseErr: 'هذه الوحدة ليست في نسخة هذا المقهى ({r}). حدّث النسخة أولًا.',
    paidOnly: 'وحدة بمقابل: تشغّلها الإدارة فقط، بموافقة كتابية من المقهى.',
    already: 'هناك طلب ينتظر الإدارة بالفعل.',
    forbidden: 'دورك لا يسمح بهذا التغيير.',
    error: 'حدث خطأ. أعد المحاولة.',
    history: 'السجل',
    noHistory: 'لا تغييرات حتى الآن.',
    hOn: 'تشغيل {m}',
    hOff: 'إيقاف {m}',
    hAlso: ' (و{m})',
    hRequest: 'طلب تشغيل {m}',
    hBy: '{n}، {d}',
    dApproved: 'وافق عليه {n}',
    dRejected: 'رفضه {n}',
    dReplaced: 'استُبدل',
    someone: 'شخص ما',
    noticeTitle: 'تغييرات وحدات للاطلاع',
    noticePending: '{c}: {n} يطلب تشغيل {m}.',
    noticeOff: '{c}: أوقف {n} {m}، {d}.',
    noticeOn: '{c}: شغّل {n} {m}، {d}.',
    noticeSeen: 'اطلعت',
    noticeOpen: 'فتح',
  },
};

/**
 * @typedef {object} ModulesDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe
 * @property {() => void} signedOut
 */

/** @param {'fr' | 'ar'} lang */
const texts =
  (lang) =>
  (/** @type {string} */ key, /** @type {Record<string, string>} */ vars = {}) =>
    (MODULES_TEXT[lang][key] ?? MODULES_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );

/**
 * "25/11 18:47" in both languages (Western digits, as for prices), isolated left to right
 * (U+2066 … U+2069) so it stays in order inside an Arabic sentence.
 * @param {string} iso
 */
function when(iso) {
  return `\u2066${new Date(iso).toLocaleString('fr-TN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  })}\u2069`;
}

/** @param {any} text @param {'fr' | 'ar'} lang */
const pick = (text, lang) => (text ? text[lang] || text.fr || '' : '');

/**
 * Names of modules for a message, in the staff's language.
 * @param {string[]} keys
 * @param {Record<string, any>} byKey
 * @param {'fr' | 'ar'} lang
 */
const names = (keys, byKey, lang) =>
  keys.map((k) => pick(byKey[k]?.title, lang) || k).join(lang === 'ar' ? '، ' : ', ');

/**
 * @param {HTMLElement} body
 * @param {ModulesDeps} d
 */
export function modulesView(body, d) {
  const { h, lang } = d;
  const t = texts(lang);
  const message = h('p', { class: 'a-muted', role: 'status', hidden: true });
  const list = h('div', { class: 'a-stack' });
  const history = h('section', { class: 'a-card a-stack' });
  /** @param {string} text @param {'ok' | 'error'} [tone] */
  const say = (text, tone = 'error') => {
    message.className = tone === 'ok' ? 'a-ok' : 'a-error';
    message.textContent = text;
    message.hidden = !text;
  };
  /** @type {Record<string, any>} */
  let byKey = {};
  const release = releaseCard({ ...d, names: (keys) => names(keys, byKey, lang) });

  /** @param {{ status: number, data: any }} res */
  function failed(res) {
    if (res.status === 401) return d.signedOut();
    const e = res.data?.error;
    if (e === 'missing_dependency')
      return say(
        t('missingDependency', { m: names(res.data.missing ?? res.data.anyOf ?? [], byKey, lang) }),
      );
    if (e === 'conflict') return say(t('conflict', { m: names(res.data.with ?? [], byKey, lang) }));
    if (e === 'not_in_release') return say(t('notInReleaseErr', { r: res.data.release ?? '' }));
    if (e === 'paid_admin_only') return say(t('paidOnly'));
    if (e === 'already_requested') return say(t('already'));
    if (res.status === 403) return say(t('forbidden'));
    say(t('error'));
  }

  /** @param {string} path @param {any} payload @param {(data: any) => void} done */
  async function send(path, payload, done) {
    const res = await d.api(path, { ...payload, cafe: d.cafe });
    if (res.status === 200 || res.status === 202) {
      done(res.data);
      await load(false);
    } else failed(res);
  }

  /**
   * @param {any} m   one module as the server describes it
   * @param {any} v   the whole answer: what this role can do, the café's release
   */
  function card(m, v) {
    const can = v.can;
    const title = pick(m.title, lang);
    const state = m.enabled
      ? m.missing.length
        ? h(
            'p',
            { class: 'a-error' },
            t('missing', {
              what: m.missing.map((/** @type {string} */ s) => `settings.${s}`).join(', '),
            }),
          )
        : h('span', { class: 'a-badge a-badge--on' }, t('on'))
      : h('span', { class: 'a-badge' }, t('off'));
    const actions = h('div', { class: 'a-row' });
    if (m.enabled && can.off) {
      let armed = false;
      const button = /** @type {HTMLButtonElement} */ (
        h(
          'button',
          {
            type: 'button',
            class: 'a-btn a-btn--danger',
            onclick: () => {
              if (!armed) {
                armed = true;
                button.textContent = t('confirmOff');
                return;
              }
              button.disabled = true;
              send('/modules/switch', { key: m.key, on: false }, (data) =>
                say(
                  t('doneOff', { m: title }) +
                    (data.also?.length
                      ? ` ${t('alsoOff', { m: names(data.also, byKey, lang) })}`
                      : ''),
                  'ok',
                ),
              ).finally(() => (button.disabled = false));
            },
          },
          t('turnOff'),
        )
      );
      actions.append(button);
    }
    if (
      !m.enabled &&
      !m.request &&
      can.on !== 'no' &&
      m.inRelease &&
      !(m.paid && v.role !== 'admin')
    ) {
      const ask = can.on === 'request';
      const button = /** @type {HTMLButtonElement} */ (
        h(
          'button',
          {
            type: 'button',
            class: 'a-btn a-btn--main',
            onclick: () => {
              button.disabled = true;
              send('/modules/switch', { key: m.key, on: true }, (data) =>
                say(data.pending ? t('doneRequest') : t('doneOn', { m: title }), 'ok'),
              ).finally(() => (button.disabled = false));
            },
          },
          ask ? t('askOn') : t('turnOn'),
        )
      );
      actions.append(button);
    }
    const request = m.request
      ? h(
          'div',
          { class: 'a-stack a-request' },
          h('p', null, t('requested', { n: m.request.by ?? t('someone'), d: when(m.request.at) })),
          can.decide
            ? h(
                'div',
                { class: 'a-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'a-btn a-btn--main',
                    onclick: () =>
                      send('/modules/decide', { version: m.request.version, approve: true }, () =>
                        say(t('doneApprove', { m: title }), 'ok'),
                      ),
                  },
                  t('approve'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'a-btn',
                    onclick: () =>
                      send('/modules/decide', { version: m.request.version, approve: false }, () =>
                        say(t('doneReject'), 'ok'),
                      ),
                  },
                  t('reject'),
                ),
              )
            : null,
        )
      : null;
    return h(
      'section',
      { class: 'a-card a-stack', 'data-module': m.key },
      h(
        'div',
        { class: 'a-row a-spread' },
        h('h2', { class: 'a-title' }, title),
        h(
          'div',
          { class: 'a-row' },
          m.stability === 'experimental'
            ? h('span', { class: 'a-badge' }, t('experimental'))
            : null,
          m.paid ? h('span', { class: 'a-badge' }, t('paid')) : null,
          state,
        ),
      ),
      m.summary ? h('p', { class: 'a-muted' }, pick(m.summary, lang)) : null,
      m.inRelease ? null : h('p', { class: 'a-muted' }, t('notInRelease', { r: v.cafe.release })),
      request,
      actions.childElementCount ? actions : null,
    );
  }

  /** @param {any[]} rows */
  function drawHistory(rows) {
    history.replaceChildren(
      h('h2', { class: 'a-title' }, t('history')),
      ...(rows.length
        ? rows.map((r) => {
            const m = names([r.key], byKey, lang);
            const what =
              r.status === 'draft' || r.decision
                ? t('hRequest', { m })
                : (r.on ? t('hOn', { m }) : t('hOff', { m })) +
                  (r.also?.length ? t('hAlso', { m: names(r.also, byKey, lang) }) : '');
            const decided =
              r.decision === 'approved'
                ? t('dApproved', { n: r.decider ?? t('someone') })
                : r.decision === 'rejected'
                  ? t('dRejected', { n: r.decider ?? t('someone') })
                  : r.decision === 'replaced'
                    ? t('dReplaced')
                    : '';
            return h(
              'p',
              { class: 'a-hist' },
              h('strong', null, what),
              ' · ',
              t('hBy', { n: r.by ?? t('someone'), d: when(r.at) }),
              decided ? ` · ${decided}` : '',
            );
          })
        : [h('p', { class: 'a-muted' }, t('noHistory'))]),
    );
  }

  /** @param {boolean} [clear]  clear the last message */
  async function load(clear = true) {
    const res = await d.api(`/modules?cafe=${encodeURIComponent(d.cafe)}`);
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      list.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    if (clear) say('');
    const v = res.data;
    byKey = Object.fromEntries(v.modules.map((/** @type {any} */ m) => [m.key, m]));
    list.replaceChildren(...v.modules.map((/** @type {any} */ m) => card(m, v)));
    drawHistory(v.history);
    manager.hidden = v.role !== 'manager';
    // After the modules: switching one off can make another release possible.
    await release.load();
  }

  const manager = h('p', { class: 'a-card a-paused', hidden: true }, t('managerNote'));
  body.replaceChildren(
    release.el,
    h('p', { class: 'a-muted' }, t('intro')),
    manager,
    message,
    list,
    history,
  );
  load();
}

/**
 * For Admin, on start: what others changed in any café's modules, and requests to decide.
 * Seen changes are remembered on this device only (a convenience); requests stay until decided.
 * @param {{ h: ModulesDeps['h'], lang: 'fr' | 'ar', api: ModulesDeps['api'],
 *   open: (cafe: string) => void, seen: () => void }} d
 * @returns {Promise<HTMLElement | null>}
 */
export async function noticeBar(d) {
  const { h, lang } = d;
  const t = texts(lang);
  const res = await d.api('/modules/notices');
  if (res.status !== 200) return null;
  let seen = '';
  try {
    seen = localStorage.getItem('dm:admin:modules-seen') ?? '';
  } catch {
    /* no storage: shown each time */
  }
  const items = (res.data.changes ?? []).filter(
    (/** @type {any} */ c) => c.pending || (!c.decision && c.at > seen),
  );
  if (!items.length) return null;
  const newest = items.reduce(
    (/** @type {string} */ a, /** @type {any} */ c) => (c.at > a ? c.at : a),
    '',
  );
  const bar = h(
    'section',
    { class: 'a-card a-stack a-notice', role: 'status' },
    h('h2', { class: 'a-title' }, t('noticeTitle')),
    ...items.map((/** @type {any} */ c) =>
      h(
        'div',
        { class: 'a-row a-spread' },
        h(
          'p',
          null,
          t(c.pending ? 'noticePending' : c.on ? 'noticeOn' : 'noticeOff', {
            c: pick(c.name, lang) || c.cafe,
            n: c.by ?? t('someone'),
            m: pick(c.title, lang) || c.key,
            d: when(c.at),
          }),
        ),
        h(
          'button',
          { type: 'button', class: 'a-btn a-btn--link', onclick: () => d.open(c.cafe) },
          t('noticeOpen'),
        ),
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'a-btn',
        onclick: () => {
          try {
            localStorage.setItem('dm:admin:modules-seen', newest);
          } catch {
            /* nothing to remember */
          }
          bar.parentElement?.remove();
          d.seen();
        },
      },
      t('noticeSeen'),
    ),
  );
  return bar;
}
