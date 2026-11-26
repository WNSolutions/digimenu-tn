// @ts-check
/**
 * "Vue d'ensemble" in the staff app, for Admin only (issue #28, US-48): every café on one
 * screen, what needs attention first. Counts the server already made
 * (platform/shell/src/overview-api.js); refreshed every 2 minutes while it is on screen.
 *
 * Alerts come first, in words, each with what to do. Then each café: status, release, open or
 * closed, modules on, last menu change, last visit, last order, and "Ouvrir ce café". The screen
 * says plainly what it does not watch yet (the site from outside, the free plan's quotas).
 */

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const OVERVIEW_TEXT = {
  fr: {
    tab: 'Vue d’ensemble',
    updated: 'Mis à jour à {t}.',
    refresh: 'Actualiser',
    nothing: 'Rien à signaler.',
    notWatched:
      'Pas encore surveillé ici : le site vu de l’extérieur et les quotas du plan gratuit Cloudflare (choix en attente, question Q33).',
    platform: 'Toute la plateforme',
    live: 'En ligne',
    onboarding: 'Mise en place',
    demo: 'Démo',
    paused: 'En pause',
    release: 'Version {v}',
    openNow: 'Ouvert maintenant',
    closedNow: 'Fermé maintenant',
    modules: '{n} modules : {list}',
    lastMenu: 'Dernière modification de la carte : {d}',
    lastVisit: 'Dernière visite : {d} vers {h} h',
    lastVisitNever: 'Dernière visite : jamais',
    lastOrder: 'Dernière commande : {d}',
    test: '(essai)',
    never: 'jamais',
    open: 'Ouvrir ce café',
    orders_waiting:
      '{n} commande(s) attendent depuis plus de 10 minutes sur l’écran du personnel (la plus ancienne à {t}). Appelez le café.',
    no_staff_device:
      'Le café est ouvert, mais aucun appareil du personnel n’est connecté depuis {t}. Les commandes envoyées ne sonnent nulle part : appelez le café.',
    no_staff_device_never:
      'Le café est ouvert, mais aucun appareil du personnel ne s’est encore connecté. Appelez le café.',
    failed_sign_ins:
      'Mots de passe erronés à répétition : {names}. {k} compte(s) bloqué(s) quelques minutes. Si ce n’est pas eux, réinitialisez le compte (Équipe).',
    customer_exports:
      '{n} export(s) de données clients ces 7 derniers jours ({r} fiche(s)), le dernier le {t}. Vérifiez dans le journal qu’ils étaient prévus.',
    error: 'Une erreur est survenue. Réessayez.',
  },
  ar: {
    tab: 'نظرة عامة',
    updated: 'حُدّث على الساعة {t}.',
    refresh: 'تحديث',
    nothing: 'لا شيء يُذكر.',
    notWatched:
      'غير مراقَب هنا بعد: الموقع من الخارج وحصص خطة Cloudflare المجانية (اختيار في الانتظار، السؤال Q33).',
    platform: 'كل المنصة',
    live: 'على الخط',
    onboarding: 'قيد الإعداد',
    demo: 'تجريبي',
    paused: 'متوقف',
    release: 'النسخة {v}',
    openNow: 'مفتوح الآن',
    closedNow: 'مغلق الآن',
    modules: '{n} وحدات: {list}',
    lastMenu: 'آخر تعديل للقائمة: {d}',
    lastVisit: 'آخر زيارة: {d} حوالي الساعة {h}',
    lastVisitNever: 'آخر زيارة: أبدًا',
    lastOrder: 'آخر طلب: {d}',
    test: '(تجربة)',
    never: 'أبدًا',
    open: 'فتح هذا المقهى',
    orders_waiting:
      '{n} طلب ينتظر منذ أكثر من 10 دقائق على شاشة العاملين (الأقدم على الساعة {t}). اتصل بالمقهى.',
    no_staff_device:
      'المقهى مفتوح لكن لا جهاز للعاملين متصل منذ {t}. الطلبات المرسلة لا ترنّ في أي مكان: اتصل بالمقهى.',
    no_staff_device_never: 'المقهى مفتوح لكن لم يتصل أي جهاز للعاملين بعد. اتصل بالمقهى.',
    failed_sign_ins:
      'كلمات سر خاطئة متكررة: {names}. {k} حساب مقفل لبضع دقائق. إن لم يكونوا هم، أعد ضبط الحساب (الفريق).',
    customer_exports:
      '{n} تصدير لبيانات الحرفاء في آخر 7 أيام ({r} ملف)، آخرها في {t}. تحقق في السجل أنها كانت مبرمجة.',
    error: 'حدث خطأ. أعد المحاولة.',
  },
};

/**
 * @typedef {object} OverviewDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {(slug: string) => void} openCafe
 * @property {() => void} signedOut
 */

const REFRESH_MS = 120_000;

/**
 * @param {HTMLElement} body
 * @param {OverviewDeps} d
 */
export function overviewView(body, d) {
  const { h, lang } = d;
  const t = (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (OVERVIEW_TEXT[lang][key] ?? OVERVIEW_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  const pick = (/** @type {any} */ text) =>
    text && typeof text === 'object' ? text[lang] || text.fr || Object.values(text)[0] || '' : '';
  /** Dates, times, versions and names kept in their own direction in an Arabic line. */
  const ltr = (/** @type {string} */ s) => `⁦${s}⁩`;
  const free = (/** @type {string} */ s) => `⁨${s}⁩`;
  const fmt = (/** @type {Date} */ x, /** @type {Intl.DateTimeFormatOptions} */ o) =>
    ltr(
      x.toLocaleString('fr-TN', {
        timeZone: 'Africa/Tunis',
        hourCycle: 'h23',
        numberingSystem: 'latn',
        ...o,
      }),
    );
  const clock = (/** @type {string} */ iso) =>
    fmt(new Date(iso), { hour: '2-digit', minute: '2-digit' });
  const when = (/** @type {string} */ iso) =>
    fmt(new Date(iso), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dayOnly = (/** @type {string} */ day) =>
    fmt(new Date(`${day}T12:00:00Z`), { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

  const comma = lang === 'ar' ? '، ' : ', ';
  const content = h('div', { class: 'a-stack' });
  let timer = 0;

  /** @param {any} a */
  function alertText(a) {
    if (a.code === 'orders_waiting') return t(a.code, { n: a.count, t: clock(a.since) });
    if (a.code === 'no_staff_device')
      return a.lastSeen ? t(a.code, { t: when(a.lastSeen) }) : t('no_staff_device_never');
    if (a.code === 'failed_sign_ins')
      return t(a.code, { names: a.people.map(free).join(comma), k: a.locked });
    if (a.code === 'customer_exports')
      return t(a.code, { n: a.count, r: a.records, t: when(a.last) });
    return a.code;
  }

  /** @param {any[]} alerts */
  const alertList = (alerts) =>
    h(
      'ul',
      { class: 'a-stack a-alerts' },
      ...alerts.map((a) =>
        h('li', { class: 'a-card a-paused', 'data-alert': a.code }, alertText(a)),
      ),
    );

  /** @param {any} c */
  function cafeCard(c) {
    const status = t(c.status) || c.status;
    const facts = /** @type {string[]} */ (
      [
        c.open === null ? null : t(c.open ? 'openNow' : 'closedNow'),
        t('modules', {
          n: c.modules.length,
          list: c.modules.map((/** @type {any} */ m) => pick(m.title) || m.key).join(comma),
        }),
        t('lastMenu', { d: c.lastMenuChange ? when(c.lastMenuChange) : t('never') }),
        c.lastVisit
          ? t('lastVisit', { d: dayOnly(c.lastVisit.day), h: ltr(String(c.lastVisit.hour)) })
          : t('lastVisitNever'),
        t('lastOrder', {
          d: c.lastOrder
            ? `${when(c.lastOrder.at)}${c.lastOrder.test ? ` ${t('test')}` : ''}`
            : t('never'),
        }),
      ].filter(Boolean)
    );
    return h(
      'section',
      { class: 'a-card a-stack', 'data-cafe': c.slug },
      h(
        'div',
        { class: 'a-row a-spread' },
        h('h2', { class: 'a-title' }, pick(c.name) || c.slug),
        h('span', { class: `a-badge${c.status === 'live' ? ' a-badge--on' : ''}` }, status),
      ),
      h('p', { class: 'a-muted' }, t('release', { v: ltr(c.release) })),
      c.alerts.length ? alertList(c.alerts) : null,
      h('ul', { class: 'a-stack a-facts' }, ...facts.map((f) => h('li', null, f))),
      h(
        'div',
        { class: 'a-row' },
        h(
          'button',
          { type: 'button', class: 'a-btn', onclick: () => d.openCafe(c.slug) },
          t('open'),
        ),
      ),
    );
  }

  async function load() {
    window.clearTimeout(timer);
    if (!body.isConnected) return;
    const res = await d.api('/overview');
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      content.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    const v = res.data;
    const urgent = v.cafes.filter((/** @type {any} */ c) => c.alerts.length);
    content.replaceChildren(
      .../** @type {HTMLElement[]} */ (
        [
          h(
            'div',
            { class: 'a-row a-spread' },
            h('p', { class: 'a-muted' }, t('updated', { t: clock(v.at) })),
            h(
              'button',
              { type: 'button', class: 'a-btn a-btn--link', onclick: load },
              t('refresh'),
            ),
          ),
          v.alerts.length
            ? h(
                'section',
                { class: 'a-card a-stack' },
                h('h2', { class: 'a-title' }, t('platform')),
                alertList(v.alerts),
              )
            : null,
          !v.alerts.length && !urgent.length ? h('p', { class: 'a-ok' }, t('nothing')) : null,
          v.external.watched ? null : h('p', { class: 'a-muted' }, t('notWatched')),
          // Cafés with alerts first, then the others in their usual order.
          ...[...urgent, ...v.cafes.filter((/** @type {any} */ c) => !c.alerts.length)].map(
            cafeCard,
          ),
        ].filter(Boolean)
      ),
    );
    timer = window.setTimeout(load, REFRESH_MS);
  }

  body.replaceChildren(content);
  load();
}
