// @ts-check
/**
 * "Visites" in the staff app (issue #27, US-30, US-31): how the café's menu is used, per day
 * and per week, by table, language and hour, from counts only (platform/shell/src/visits-api.js).
 * Admin also exports the impact numbers of every live café for any dates: one CSV for all
 * cafés and one per café, built here in the browser.
 *
 * One series in one colour (the staff app's accent), thin bars with a value on the busiest one,
 * and the same numbers as a table: nothing depends on colour or on hovering.
 */

import { bars as drawBars, columns as drawColumns, csvCell } from './charts.js';

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const VISITS_TEXT = {
  fr: {
    tab: 'Visites',
    intro:
      'Combien de personnes ouvrent la carte. Des comptes seulement : aucun client n’est identifiable.',
    d7: '7 jours',
    d28: '28 jours',
    d365: '12 mois',
    test: 'Le café n’est pas encore en ligne : ces visites sont des essais (équipe, démonstrations). Elles ne comptent pas dans les chiffres d’impact.',
    since: 'Visites comptées depuis la mise en ligne, le {d}.',
    visits: 'Visites',
    table: 'Depuis une table',
    langs: 'Langues',
    perDay: 'Par jour',
    perWeek: 'Par semaine',
    week: 'Semaine du {d}',
    tables: 'Par table',
    noTable: 'Sans table (lien du café, Instagram…)',
    hours: 'Heures d’affluence',
    numbers: 'Voir les chiffres',
    day: 'Jour',
    none: 'Pas encore de visite sur cette période.',
    other: 'autre',
    exportTitle: 'Chiffres d’impact (Admin)',
    exportIntro:
      'Visites réelles des cafés en ligne, à partir de leur mise en ligne. Un fichier pour tous les cafés et un par café, comptes seulement.',
    from: 'Du',
    to: 'Au',
    exportBtn: 'Préparer les fichiers',
    allCafes: 'Tous les cafés',
    ready: '{n} café(s) dans les fichiers.',
    noLive: 'Aucun café en ligne sur cette période.',
    error: 'Une erreur est survenue. Réessayez.',
    badRange: 'Choisissez des dates valides (au plus 400 jours).',
    visitsOf: '{d} : {n} visite(s)',
  },
  ar: {
    tab: 'الزيارات',
    intro: 'كم شخصًا يفتح القائمة. أعداد فقط: لا يمكن التعرّف على أي حريف.',
    d7: '7 أيام',
    d28: '28 يومًا',
    d365: '12 شهرًا',
    test: 'المقهى ليس على الخط بعد: هذه زيارات تجريبية (الفريق، العروض). لا تُحتسب في أرقام الأثر.',
    since: 'الزيارات محسوبة منذ الانطلاق في {d}.',
    visits: 'الزيارات',
    table: 'من طاولة',
    langs: 'اللغات',
    perDay: 'حسب اليوم',
    perWeek: 'حسب الأسبوع',
    week: 'أسبوع {d}',
    tables: 'حسب الطاولة',
    noTable: 'بدون طاولة (رابط المقهى، إنستغرام…)',
    hours: 'ساعات الذروة',
    numbers: 'عرض الأرقام',
    day: 'اليوم',
    none: 'لا زيارات في هذه الفترة بعد.',
    other: 'أخرى',
    exportTitle: 'أرقام الأثر (الإدارة)',
    exportIntro:
      'الزيارات الحقيقية للمقاهي التي على الخط، منذ انطلاقها. ملف لكل المقاهي وملف لكل مقهى، أعداد فقط.',
    from: 'من',
    to: 'إلى',
    exportBtn: 'تحضير الملفات',
    allCafes: 'كل المقاهي',
    ready: '{n} مقهى في الملفات.',
    noLive: 'لا مقهى على الخط في هذه الفترة.',
    error: 'حدث خطأ. أعد المحاولة.',
    badRange: 'اختر تواريخ صالحة (400 يوم على الأكثر).',
    visitsOf: '{d}: {n} زيارة',
  },
};

/**
 * @typedef {object} VisitsDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe
 * @property {boolean} admin
 * @property {() => void} signedOut
 * @property {ModuleCard[]} [cards]   the switched-on modules' cards (`admin.dashboardCard`)
 */

/**
 * @typedef {object} ModuleCard
 * @property {string} key
 * @property {(counts: Record<string, number>) => import('./staff-api.js').DashboardCard | null} card
 */

/** The elements that exist, for replaceChildren. @param {(HTMLElement | null)[]} list */
const present = (list) => /** @type {HTMLElement[]} */ (list.filter(Boolean));

/** @param {Date} d */
const isoDay = (d) => d.toISOString().slice(0, 10);

/** Monday of the ISO week of a day "YYYY-MM-DD". @param {string} day */
export function weekStart(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return isoDay(d);
}

/**
 * Days added up into weeks (Monday to Sunday).
 * @param {{ day: string, visits: number }[]} days
 */
export function byWeek(days) {
  /** @type {Map<string, number>} */
  const weeks = new Map();
  for (const d of days) weeks.set(weekStart(d.day), (weeks.get(weekStart(d.day)) ?? 0) + d.visits);
  return [...weeks.entries()]
    .map(([week, visits]) => ({ week, visits }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * The impact files: one for all cafés, one per café. Counts only.
 * @param {{ from: string, to: string, cafes: { slug: string, days: any[], totals: any }[] }} data
 */
export function impactCsv(data) {
  const head = ['cafe', 'day', 'visits', 'with_table', 'without_table', 'fr', 'ar', 'en', 'other'];
  /** @param {string} slug @param {any} r */
  const line = (slug, r) =>
    [slug, r.day, r.visits, r.withTable, r.noTable, r.fr, r.ar, r.en, r.other]
      .map(csvCell)
      .join(',');
  /** @param {{ slug: string, days: any[], totals: any }[]} cafes */
  const file = (cafes) =>
    [
      head.join(','),
      ...cafes.flatMap((c) => c.days.map((r) => line(c.slug, r))),
      ...cafes.map((c) => line(c.slug, { ...c.totals, day: `${data.from}..${data.to}` })),
    ].join('\r\n') + '\r\n';
  return {
    all: file(data.cafes),
    perCafe: data.cafes.map((c) => ({ slug: c.slug, csv: file([c]) })),
  };
}

/**
 * @param {HTMLElement} body
 * @param {VisitsDeps} d
 */
export function visitsView(body, d) {
  const { h, lang } = d;
  const t = (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (VISITS_TEXT[lang][key] ?? VISITS_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  const dayName = (/** @type {string} */ day, /** @type {Intl.DateTimeFormatOptions} */ opts) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN', {
      timeZone: 'UTC',
      numberingSystem: 'latn',
      ...opts,
    });
  const pct = (/** @type {number} */ n, /** @type {number} */ of) =>
    of ? `${Math.round((n / of) * 100)}\u00a0%` : '—';
  let span = 28;
  const content = h('div', { class: 'a-stack' });

  const bars = (/** @type {{ label: string, value: number }[]} */ rows) => drawBars(h, rows);
  const columns = (
    /** @type {{ label: string, short: string, value: number }[]} */ rows,
    /** @type {string} */ name,
  ) => drawColumns(h, rows, name);

  /**
   * The modules' cards, from their own counters for the period. A card that fails is left out.
   * @param {Record<string, Record<string, number>>} events
   * @returns {HTMLElement[]}
   */
  function moduleCards(events) {
    const out = [];
    for (const { key, card } of d.cards ?? []) {
      try {
        const c = card(events[key] ?? {});
        if (!c) continue;
        out.push(
          h(
            'section',
            { class: 'a-card a-stack' },
            h('h2', { class: 'a-title' }, c.title),
            h(
              'div',
              { class: 'a-tiles' },
              ...c.tiles
                .slice(0, 4)
                .map((x) =>
                  h(
                    'div',
                    { class: 'a-tile' },
                    h('span', { class: 'a-tile-label' }, x.label),
                    h('strong', { class: 'a-tile-value' }, x.value),
                  ),
                ),
            ),
            c.note ? h('p', { class: 'a-muted' }, c.note) : null,
          ),
        );
      } catch (err) {
        console.error(`module ${key}: card failed`, err);
      }
    }
    return out;
  }

  async function load() {
    const to = new Date();
    const from = new Date(to.getTime() - (span - 1) * 86_400_000);
    const res = await d.api(
      `/visits?cafe=${encodeURIComponent(d.cafe)}&from=${isoDay(from)}&to=${isoDay(to)}`,
    );
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      content.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    const v = res.data;
    // Every day of the period, zero where nobody came.
    const all = [];
    for (
      let day = new Date(`${v.from}T12:00:00Z`);
      isoDay(day) <= v.to;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const key = isoDay(day);
      all.push(
        v.days.find((/** @type {any} */ x) => x.day === key) ?? {
          day: key,
          visits: 0,
          withTable: 0,
          noTable: 0,
        },
      );
    }
    const total = v.totals.visits;
    const notes = [
      v.test ? h('p', { class: 'a-card a-paused' }, t('test')) : null,
      v.goLive
        ? h(
            'p',
            { class: 'a-muted' },
            t('since', {
              d: dayName(v.goLive, { day: '2-digit', month: '2-digit', year: 'numeric' }),
            }),
          )
        : null,
    ];
    if (!total) {
      content.replaceChildren(
        ...present(notes),
        h('p', { class: 'a-muted' }, t('none')),
        ...moduleCards(v.events ?? {}),
      );
      return;
    }
    const tiles = h(
      'div',
      { class: 'a-tiles' },
      h(
        'div',
        { class: 'a-tile' },
        h('span', { class: 'a-tile-label' }, t('visits')),
        h('strong', { class: 'a-tile-value' }, String(total)),
      ),
      h(
        'div',
        { class: 'a-tile' },
        h('span', { class: 'a-tile-label' }, t('table')),
        h('strong', { class: 'a-tile-value' }, pct(v.totals.withTable, total)),
      ),
      h(
        'div',
        { class: 'a-tile' },
        h('span', { class: 'a-tile-label' }, t('langs')),
        h(
          'span',
          { class: 'a-tile-small' },
          ...[
            ['FR', v.totals.fr],
            ['AR', v.totals.ar],
            ['EN', v.totals.en],
            ...(v.totals.other ? [[t('other'), v.totals.other]] : []),
          ].map(([name, n]) => h('span', { class: 'a-nowrap' }, `${name} ${pct(n, total)}`)),
        ),
      ),
    );
    const daily =
      span <= 28
        ? h(
            'section',
            { class: 'a-card a-stack' },
            h('h2', { class: 'a-title' }, t('perDay')),
            columns(
              all.map((x) => ({
                label: t('visitsOf', {
                  d: dayName(x.day, { weekday: 'short', day: '2-digit', month: '2-digit' }),
                  n: x.visits,
                }),
                short:
                  span <= 7
                    ? dayName(x.day, { weekday: 'short' })
                    : weekStart(x.day) === x.day
                      ? dayName(x.day, { day: 'numeric', month: 'numeric' })
                      : '',
                value: x.visits,
              })),
              t('perDay'),
            ),
          )
        : null;
    const weekly = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('perWeek')),
      bars(
        byWeek(all).map((w) => ({
          label: t('week', { d: dayName(w.week, { day: '2-digit', month: '2-digit' }) }),
          value: w.visits,
        })),
      ),
    );
    const tables = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('tables')),
      bars([
        ...v.tables.map((/** @type {any} */ x) => ({ label: x.table, value: x.visits })),
        { label: t('noTable'), value: v.totals.noTable },
      ]),
    );
    const hours = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('hours')),
      columns(
        v.hours.map((/** @type {number} */ n, /** @type {number} */ hr) => ({
          label: `${String(hr).padStart(2, '0')}:00 · ${n}`,
          short: hr % 3 === 0 ? String(hr) : '',
          value: n,
        })),
        t('hours'),
      ),
    );
    const table = h(
      'details',
      { class: 'a-card' },
      h('summary', null, t('numbers')),
      h(
        'table',
        { class: 'a-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...[t('day'), t('visits'), t('table'), 'FR', 'AR', 'EN'].map((x) =>
              h('th', { scope: 'col' }, x),
            ),
          ),
        ),
        h(
          'tbody',
          null,
          ...all.map((x) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, dayName(x.day, { day: '2-digit', month: '2-digit' })),
              ...[x.visits, x.withTable, x.fr ?? 0, x.ar ?? 0, x.en ?? 0].map((n) =>
                h('td', null, String(n)),
              ),
            ),
          ),
        ),
      ),
    );
    content.replaceChildren(
      ...present([
        ...notes,
        tiles,
        ...moduleCards(v.events ?? {}),
        daily,
        weekly,
        tables,
        hours,
        table,
      ]),
    );
  }

  const choose = h(
    'div',
    { class: 'a-segment', role: 'group', 'aria-label': t('tab') },
    ...[
      [7, t('d7')],
      [28, t('d28')],
      [365, t('d365')],
    ].map(([n, label]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(span === n),
          onclick: (/** @type {Event} */ e) => {
            span = Number(n);
            for (const b of choose.querySelectorAll('button'))
              b.setAttribute('aria-pressed', String(b === e.currentTarget));
            load();
          },
        },
        String(label),
      ),
    ),
  );

  body.replaceChildren(
    h('h1', { class: 'a-title' }, t('tab')),
    h('p', { class: 'a-muted' }, t('intro')),
    choose,
    content,
    ...(d.admin ? [exportCard()] : []),
  );
  load();

  /** Admin: the impact files for the grant report. */
  function exportCard() {
    const today = new Date();
    const start = new Date(today.getTime() - 29 * 86_400_000);
    const from = h('input', {
      class: 'a-input',
      type: 'date',
      id: 'vx-from',
      value: isoDay(start),
    });
    const to = h('input', { class: 'a-input', type: 'date', id: 'vx-to', value: isoDay(today) });
    const out = h('div', { class: 'a-stack', role: 'status' });
    const form = h(
      'form',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('exportTitle')),
      h('p', { class: 'a-muted' }, t('exportIntro')),
      h(
        'div',
        { class: 'a-row' },
        h('label', { class: 'a-label', for: 'vx-from' }, t('from'), from),
        h('label', { class: 'a-label', for: 'vx-to' }, t('to'), to),
      ),
      h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('exportBtn')),
      out,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = /** @type {HTMLInputElement} */ (from).value;
      const tt = /** @type {HTMLInputElement} */ (to).value;
      const res = await d.api(
        `/visits/export?from=${encodeURIComponent(f)}&to=${encodeURIComponent(tt)}`,
      );
      if (res.status === 401) return d.signedOut();
      if (res.status !== 200) {
        out.replaceChildren(
          h('p', { class: 'a-error' }, res.status === 400 ? t('badRange') : t('error')),
        );
        return;
      }
      if (!res.data.cafes.length) {
        out.replaceChildren(h('p', { class: 'a-muted' }, t('noLive')));
        return;
      }
      const files = impactCsv(res.data);
      /** @param {string} csv @param {string} name @param {string} label */
      const link = (csv, name, label) =>
        h(
          'a',
          {
            class: 'a-btn',
            href: URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv' })),
            download: name,
          },
          label,
        );
      out.replaceChildren(
        h('p', { class: 'a-ok' }, t('ready', { n: res.data.cafes.length })),
        link(files.all, `digimenu-visites-${f}-${tt}.csv`, `${t('allCafes')} (CSV)`),
        ...files.perCafe.map((c) =>
          link(c.csv, `digimenu-visites-${c.slug}-${f}-${tt}.csv`, `${c.slug} (CSV)`),
        ),
      );
    });
    return form;
  }
}
