// @ts-check
/**
 * "Version de ce café" in the staff app's Modules tab (issue #24, MOD-08, MOD-09): which
 * release the café runs, since when, and the moves (platform/shell/src/releases-api.js decides
 * who may do what).
 *
 * - Maintainer: "Revenir à la version précédente", the 15-minute rollback, with one line saying
 *   why. Nothing else.
 * - Admin: also moves the café to any release of the window that passes the pre-flight.
 * - Manager: sees the version and the history.
 *
 * A move asks for the reason first, then a second tap on the same button (no browser dialog).
 * What the pre-flight refuses is said in plain words, with no button.
 */

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const RELEASE_TEXT = {
  fr: {
    title: 'Version de ce café',
    runs: 'Ce café utilise la version {v}.',
    since: 'Depuis le {d}.',
    notOnSite: 'Cette version n’est plus sur le site : prévenez l’administrateur tout de suite.',
    managerNote:
      'En cas de problème après une mise à jour, l’équipe WNS remet la version précédente en quelques minutes.',
    others: 'Autres versions disponibles',
    candidate: 'Nouvelle',
    stable: 'Stable',
    previous: 'Précédente',
    goBack: 'Revenir à la version précédente ({v})',
    backTo: 'Revenir à {v}',
    forwardTo: 'Passer à {v}',
    confirmForward: 'Confirmer : passer à {v}',
    confirmBack: 'Confirmer : revenir à {v}',
    reason: 'Pourquoi ? Une ligne, pour la note d’incident',
    reasonNeeded: 'Écrivez d’abord pourquoi, en une ligne.',
    done: 'Fait : le café utilise maintenant la version {v}. Les clients l’ont en rechargeant la page (moins d’une minute).',
    cannot: 'Pas possible :',
    notInSite: 'cette version n’est pas sur le site.',
    dataSchema: 'elle demande une mise à jour de la base de données qui n’est pas encore faite.',
    configFormat: 'elle ne lit pas le format de configuration de ce café.',
    snapshotFormat: 'elle ne lit pas le format du menu publié.',
    moduleMissing:
      'elle n’a pas ces modules, activés ici : {m}. Désactivez-les d’abord, ou choisissez une autre version.',
    settingsFormat: 'les réglages de ces modules ont un autre format : {m}.',
    backOnly: 'Vous pouvez seulement revenir à la version précédente.',
    notInWindow: 'Cette version n’est plus disponible.',
    changed: 'La version a changé entre-temps : voici l’état actuel.',
    forbidden: 'Votre rôle ne permet pas ce changement.',
    error: 'Une erreur est survenue. Réessayez.',
    history: 'Historique des versions',
    hMove: '{from} → {to}',
    hFirst: 'Mise en place sur {to}',
    hBy: '{n}, {d}',
    hSeed: 'mise en place automatique',
    someone: 'quelqu’un',
  },
  ar: {
    title: 'نسخة هذا المقهى',
    runs: 'يستعمل هذا المقهى النسخة {v}.',
    since: 'منذ {d}.',
    notOnSite: 'هذه النسخة لم تعد على الموقع: أعلم الإدارة فورًا.',
    managerNote: 'إذا ظهر مشكل بعد تحديث، يعيد فريق WNS النسخة السابقة في دقائق.',
    others: 'نسخ أخرى متاحة',
    candidate: 'جديدة',
    stable: 'مستقرة',
    previous: 'سابقة',
    goBack: 'العودة إلى النسخة السابقة ({v})',
    backTo: 'العودة إلى {v}',
    forwardTo: 'الانتقال إلى {v}',
    confirmForward: 'تأكيد: الانتقال إلى {v}',
    confirmBack: 'تأكيد: العودة إلى {v}',
    reason: 'لماذا؟ سطر واحد لملاحظة الحادث',
    reasonNeeded: 'اكتب أولًا السبب في سطر واحد.',
    done: 'تم: يستعمل المقهى الآن النسخة {v}. يحصل عليها الحرفاء عند إعادة تحميل الصفحة (أقل من دقيقة).',
    cannot: 'غير ممكن:',
    notInSite: 'هذه النسخة ليست على الموقع.',
    dataSchema: 'تحتاج تحديثًا لقاعدة البيانات لم يتم بعد.',
    configFormat: 'لا تقرأ صيغة إعدادات هذا المقهى.',
    snapshotFormat: 'لا تقرأ صيغة القائمة المنشورة.',
    moduleMissing: 'لا تحتوي هذه الوحدات المفعّلة هنا: {m}. أوقفها أولًا، أو اختر نسخة أخرى.',
    settingsFormat: 'إعدادات هذه الوحدات بصيغة أخرى: {m}.',
    backOnly: 'يمكنك فقط العودة إلى النسخة السابقة.',
    notInWindow: 'هذه النسخة لم تعد متاحة.',
    changed: 'تغيّرت النسخة في الأثناء: هذه هي الحالة الآن.',
    forbidden: 'دورك لا يسمح بهذا التغيير.',
    error: 'حدث خطأ. أعد المحاولة.',
    history: 'سجل النسخ',
    hMove: '{from} ← {to}',
    hFirst: 'إعداد على {to}',
    hBy: '{n}، {d}',
    hSeed: 'إعداد آلي',
    someone: 'شخص ما',
  },
};

/**
 * @typedef {object} ReleaseDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe
 * @property {() => void} signedOut
 * @property {(keys: string[]) => string} names   modules' names, in the staff's language
 */

/** @param {'fr' | 'ar'} lang */
const texts =
  (lang) =>
  (/** @type {string} */ key, /** @type {Record<string, string>} */ vars = {}) =>
    (RELEASE_TEXT[lang][key] ?? RELEASE_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );

/** A version number kept left to right inside an Arabic sentence (U+2066 … U+2069). */
const ltr = (/** @type {string} */ v) => `⁦${v}⁩`;

/** Text typed by someone, in whatever direction it was written. */
const free = (/** @type {string} */ text) => `\u2068${text}\u2069`;

/** "26/11 14:05", Western digits, isolated. @param {string} iso */
const when = (iso) =>
  ltr(
    new Date(iso).toLocaleString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      numberingSystem: 'latn',
    }),
  );

const PROBLEM = {
  not_in_site: 'notInSite',
  data_schema: 'dataSchema',
  config_format: 'configFormat',
  snapshot_format: 'snapshotFormat',
  module_missing: 'moduleMissing',
  settings_format: 'settingsFormat',
};

/**
 * The card. `load()` (re)draws it; the Modules tab calls it after its own load, since switching
 * a module off can make a release possible.
 * @param {ReleaseDeps} d
 * @returns {{ el: HTMLElement, load: () => Promise<void> }}
 */
export function releaseCard(d) {
  const { h, lang } = d;
  const t = texts(lang);
  const el = h('section', { class: 'a-card a-stack', 'aria-labelledby': 'rl-title' });
  const message = h('p', { role: 'status', hidden: true });
  /** @param {string} text @param {'ok' | 'error'} [tone] */
  const say = (text, tone = 'error') => {
    message.className = tone === 'ok' ? 'a-ok' : 'a-error';
    message.textContent = text;
    message.hidden = !text;
  };

  /** @param {any[]} problems */
  const explain = (problems) =>
    problems
      .map((p) =>
        t(PROBLEM[/** @type {keyof typeof PROBLEM} */ (p.code)] ?? 'error', {
          m: d.names(p.modules ?? []),
        }),
      )
      .join(' ');

  /**
   * A move: the reason first, then a second tap.
   * @param {string} version
   * @param {string} label
   * @param {'back' | 'forward'} direction
   * @param {boolean} main   the rollback: the one button that matters in an incident
   */
  function move(version, label, direction, main) {
    const id = `rl-reason-${version.replace(/\W/g, '-')}`;
    const reason = /** @type {HTMLInputElement} */ (
      h('input', { class: 'a-input', id, maxlength: 200, autocomplete: 'off' })
    );
    const field = h(
      'div',
      { class: 'a-stack', hidden: true },
      h('label', { class: 'a-label', for: id }, t('reason')),
      reason,
    );
    let armed = false;
    const button = /** @type {HTMLButtonElement} */ (
      h(
        'button',
        {
          type: 'button',
          class: main ? 'a-btn a-btn--danger' : 'a-btn',
          'data-move': version,
          onclick: async () => {
            if (field.hidden) {
              field.hidden = false;
              reason.focus();
              return;
            }
            if (reason.value.trim().length < 3) {
              say(t('reasonNeeded'));
              reason.focus();
              return;
            }
            if (!armed) {
              armed = true;
              button.textContent = t(direction === 'back' ? 'confirmBack' : 'confirmForward', {
                v: ltr(version),
              });
              return;
            }
            button.disabled = true;
            const res = await d.api('/releases/pin', {
              cafe: d.cafe,
              version,
              reason: reason.value.trim(),
            });
            button.disabled = false;
            if (res.status === 200) {
              await load();
              say(t('done', { v: ltr(res.data.release) }), 'ok');
              return;
            }
            if (res.status === 401) return d.signedOut();
            const e = res.data?.error;
            if (e === 'changed_meanwhile') {
              await load();
              return say(t('changed'));
            }
            if (e === 'preflight') return say(`${t('cannot')} ${explain(res.data.problems)}`);
            if (e === 'back_to_previous_only') return say(t('backOnly'));
            if (e === 'reason_needed') return say(t('reasonNeeded'));
            if (e === 'not_in_window') return say(t('notInWindow'));
            if (res.status === 403) return say(t('forbidden'));
            say(t('error'));
          },
        },
        label,
      )
    );
    return h('div', { class: 'a-stack' }, field, h('div', { class: 'a-row' }, button));
  }

  /** @param {any} r  one move */
  const historyLine = (r) =>
    h(
      'p',
      { class: 'a-hist' },
      h(
        'strong',
        null,
        r.previous
          ? t('hMove', { from: ltr(r.previous), to: ltr(r.release) })
          : t('hFirst', { to: ltr(r.release) }),
      ),
      ' · ',
      // The first setting up says only when; a person's move says who and why. Names and
      // reasons keep their own direction inside an Arabic line (U+2068 … U+2069).
      r.seed && !r.previous
        ? when(r.at)
        : t('hBy', { n: r.seed ? t('hSeed') : free(r.by ?? t('someone')), d: when(r.at) }),
      r.seed ? '' : ` · « ${free(r.reason)} »`,
    );

  /** @param {(Node | string | null)[]} parts */
  const fill = (...parts) =>
    el.replaceChildren(.../** @type {(Node | string)[]} */ (parts.filter((p) => p !== null)));

  async function load() {
    const res = await d.api(`/releases?cafe=${encodeURIComponent(d.cafe)}`);
    if (res.status === 401) return d.signedOut();
    if (res.status === 403) {
      el.hidden = true;
      return;
    }
    if (res.status !== 200) {
      el.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    say('');
    const v = res.data;
    const back = v.window.find((/** @type {any} */ r) => r.previous && r.allowed === 'back');
    // Admin sees every other release; a Maintainer only the way back.
    const others = v.can.forward ? v.window.filter((/** @type {any} */ r) => !r.current) : [];
    el.hidden = false;
    fill(
      h('h2', { class: 'a-title', id: 'rl-title' }, t('title')),
      h(
        'p',
        null,
        t('runs', { v: ltr(v.current.version) }),
        v.current.since ? ` ${t('since', { d: when(v.current.since) })}` : '',
      ),
      v.current.onSite ? null : h('p', { class: 'a-error' }, t('notOnSite')),
      v.role === 'manager' ? h('p', { class: 'a-muted' }, t('managerNote')) : null,
      message,
      back && back.problems.length === 0 && !v.can.forward
        ? move(back.version, t('goBack', { v: ltr(back.version) }), 'back', true)
        : null,
      others.length
        ? h(
            'div',
            { class: 'a-stack' },
            h('h3', { class: 'a-subtitle' }, t('others')),
            ...others.map((/** @type {any} */ r) =>
              h(
                'div',
                { class: 'a-stack a-request', 'data-release': r.version },
                h(
                  'div',
                  { class: 'a-row a-spread' },
                  h('strong', null, ltr(r.version)),
                  h(
                    'span',
                    { class: 'a-badge' },
                    r.previous ? t('previous') : t(r.status) || r.status,
                  ),
                ),
                r.problems.length
                  ? h('p', { class: 'a-muted' }, `${t('cannot')} ${explain(r.problems)}`)
                  : r.allowed
                    ? move(
                        r.version,
                        r.previous && r.allowed === 'back'
                          ? t('goBack', { v: ltr(r.version) })
                          : t(r.allowed === 'back' ? 'backTo' : 'forwardTo', {
                              v: ltr(r.version),
                            }),
                        r.allowed,
                        r.previous && r.allowed === 'back',
                      )
                    : null,
              ),
            ),
          )
        : null,
      back && back.problems.length && !v.can.forward
        ? h('p', { class: 'a-muted' }, `${t('cannot')} ${explain(back.problems)}`)
        : null,
      v.history.length
        ? h(
            'details',
            null,
            h('summary', null, t('history')),
            h('div', { class: 'a-stack' }, ...v.history.map(historyLine)),
          )
        : null,
    );
  }

  return { el, load };
}
