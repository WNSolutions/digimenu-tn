// @ts-check
/**
 * "Ventes" in the staff app (issue #28, US-39, C-12): what DigiMenu sold, for the Manager and
 * Admin (platform/shell/src/sales-api.js counts). Admin also exports every live café's sales
 * for any dates: one CSV for all cafés and one per café, built here in the browser; the totals
 * are the dashboard's, to the millime.
 *
 * The page says plainly that these are DigiMenu orders only, not the café's whole till, and
 * shows no customer. Charts follow the Visites tab (charts.js): one colour, values written,
 * the same numbers as a table.
 */
import { bars, columns, csvCell } from './charts.js';

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const SALES_TEXT = {
  fr: {
    tab: 'Ventes',
    scope:
      'Commandes passées par DigiMenu seulement : ce n’est pas toute votre caisse. Une commande compte quand le personnel l’a acceptée.',
    test: 'Le café n’est pas encore en ligne : ces commandes sont des essais. Elles ne comptent pas dans les chiffres envoyés au programme.',
    since: 'Commandes comptées depuis la mise en ligne, le {d}.',
    today: 'Aujourd’hui',
    yesterday: 'Hier',
    thisMonth: 'Ce mois',
    lastMonth: 'Mois dernier',
    orders: 'Commandes',
    sales: 'Ventes',
    basket: 'Panier moyen',
    split: 'Type de commande',
    dineIn: 'Sur place',
    takeaway: 'À emporter',
    splitLine: '{k} : {n} · {s}',
    monthValue: '{s} · {n} commandes',
    month: 'Mois',
    perDay: 'Jour par jour',
    bestDay: 'Meilleur jour : {d}, {s} ({n} commandes).',
    salesOf: '{d} : {n} commande(s), {s}',
    top: 'Les plus vendus',
    byQty: 'En quantité',
    bySales: 'En montant',
    hours: 'Heures d’affluence',
    hourOf: '{h} h : {n} commande(s)',
    weekdays: 'Jours de la semaine',
    months: '12 derniers mois',
    numbers: 'Voir les chiffres',
    day: 'Jour',
    none: 'Pas encore de vente sur cette période.',
    exportTitle: 'Ventes de tous les cafés (Admin)',
    exportIntro:
      'Commandes acceptées des cafés en ligne, à partir de leur mise en ligne, par jour. Un fichier pour tous les cafés et un par café. Aucun client.',
    from: 'Du',
    to: 'Au',
    exportBtn: 'Préparer les fichiers',
    allCafes: 'Tous les cafés',
    ready: '{n} café(s) dans les fichiers.',
    noLive: 'Aucune vente de café en ligne sur cette période.',
    badRange: 'Choisissez des dates valides (au plus 400 jours).',
    error: 'Une erreur est survenue. Réessayez.',
  },
  ar: {
    tab: 'المبيعات',
    scope:
      'الطلبات التي تمّت عبر DigiMenu فقط: ليست كل مداخيل الصندوق. يُحتسب الطلب عندما يقبله العاملون.',
    test: 'المقهى ليس على الخط بعد: هذه طلبات تجريبية. لا تُحتسب في الأرقام المرسلة إلى البرنامج.',
    since: 'الطلبات محسوبة منذ الانطلاق في {d}.',
    today: 'اليوم',
    yesterday: 'أمس',
    thisMonth: 'هذا الشهر',
    lastMonth: 'الشهر الماضي',
    orders: 'الطلبات',
    sales: 'المبيعات',
    basket: 'متوسط الطلب',
    split: 'نوع الطلب',
    dineIn: 'في المقهى',
    takeaway: 'للأخذ',
    splitLine: '{k}: {n} · {s}',
    monthValue: '{s} · {n} طلب',
    month: 'الشهر',
    perDay: 'يومًا بيوم',
    bestDay: 'أفضل يوم: {d}، {s} ({n} طلب).',
    salesOf: '{d}: {n} طلب، {s}',
    top: 'الأكثر مبيعًا',
    byQty: 'بالكمية',
    bySales: 'بالمبلغ',
    hours: 'ساعات الذروة',
    hourOf: 'الساعة {h}: {n} طلب',
    weekdays: 'أيام الأسبوع',
    months: 'آخر 12 شهرًا',
    numbers: 'عرض الأرقام',
    day: 'اليوم',
    none: 'لا مبيعات بعد في هذه الفترة.',
    exportTitle: 'مبيعات كل المقاهي (الإدارة)',
    exportIntro:
      'الطلبات المقبولة للمقاهي على الخط، منذ انطلاقها، يومًا بيوم. ملف لكل المقاهي وملف لكل مقهى. دون أي حريف.',
    from: 'من',
    to: 'إلى',
    exportBtn: 'تحضير الملفات',
    allCafes: 'كل المقاهي',
    ready: '{n} مقهى في الملفات.',
    noLive: 'لا مبيعات لمقهى على الخط في هذه الفترة.',
    badRange: 'اختر تواريخ صحيحة (400 يوم على الأكثر).',
    error: 'حدث خطأ. أعد المحاولة.',
  },
};

/**
 * @typedef {object} SalesDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe
 * @property {boolean} admin
 * @property {(millimes: number) => string} price
 * @property {() => void} signedOut
 */

/** Millimes as dinars with 3 decimals and a dot, for spreadsheets: 25500 → "25.500". @param {number} m */
export const tnd = (m) =>
  `${m < 0 ? '-' : ''}${Math.floor(Math.abs(m) / 1000)}.${String(Math.abs(m) % 1000).padStart(3, '0')}`;

/**
 * The sales files: one for all cafés, one per café, a line per day and a total per café.
 * Amounts in dinars with 3 decimals, exactly the dashboard's millimes.
 * @param {{ from: string, to: string, cafes: { slug: string, days: any[], totals: any }[] }} data
 */
export function salesCsv(data) {
  const head = [
    'cafe',
    'day',
    'orders',
    'sales_tnd',
    'dine_in_orders',
    'dine_in_tnd',
    'takeaway_orders',
    'takeaway_tnd',
  ];
  /** @param {string} slug @param {string} day @param {any} r */
  const line = (slug, day, r) =>
    [
      slug,
      day,
      r.orders,
      tnd(r.sales),
      r.dineIn.orders,
      tnd(r.dineIn.sales),
      r.takeaway.orders,
      tnd(r.takeaway.sales),
    ]
      .map(csvCell)
      .join(',');
  /** @param {{ slug: string, days: any[], totals: any }[]} cafes */
  const file = (cafes) =>
    [
      head.join(','),
      ...cafes.flatMap((c) => c.days.map((r) => line(c.slug, r.day, r))),
      ...cafes.map((c) => line(c.slug, `${data.from}..${data.to}`, c.totals)),
    ].join('\r\n') + '\r\n';
  return {
    all: file(data.cafes),
    perCafe: data.cafes.map((c) => ({ slug: c.slug, csv: file([c]) })),
  };
}

/**
 * @param {HTMLElement} body
 * @param {SalesDeps} d
 */
export function salesView(body, d) {
  const { h, lang } = d;
  const t = (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (SALES_TEXT[lang][key] ?? SALES_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  const pick = (/** @type {any} */ text) =>
    text && typeof text === 'object' ? text[lang] || text.fr || Object.values(text)[0] || '' : '';
  const dayName = (/** @type {string} */ day, /** @type {Intl.DateTimeFormatOptions} */ opts) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN', {
      timeZone: 'UTC',
      numberingSystem: 'latn',
      ...opts,
    });
  const monthName = (/** @type {string} */ month) =>
    dayName(`${month}-15`, { month: 'long', year: 'numeric' });
  /** Prices and dates kept left to right inside an Arabic line (U+2066 … U+2069). */
  const ltr = (/** @type {string} */ text) => `\u2066${text}\u2069`;
  const money = (/** @type {number} */ m) => ltr(d.price(m));
  const present = (/** @type {(HTMLElement | null)[]} */ list) =>
    /** @type {HTMLElement[]} */ (list.filter(Boolean));

  /** @type {'today' | 'yesterday' | 'thisMonth' | 'lastMonth'} */
  let period = 'today';
  /** @type {string | null} */
  let month = null;
  /** @type {any} */
  let data = null;
  const content = h('div', { class: 'a-stack' });

  const tile = (/** @type {string} */ label, /** @type {string} */ value) =>
    h(
      'div',
      { class: 'a-tile' },
      h('span', { class: 'a-tile-label' }, label),
      h('strong', { class: 'a-tile-value a-tile-value--fit' }, value),
    );

  function periodCard() {
    const p = data.periods[period];
    const choose = h(
      'div',
      { class: 'a-segment a-segment--grid', role: 'group', 'aria-label': t('sales') },
      ...['today', 'yesterday', 'thisMonth', 'lastMonth'].map((key) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(period === key),
            onclick: () => {
              period = /** @type {typeof period} */ (key);
              draw();
            },
          },
          t(key),
        ),
      ),
    );
    return h(
      'section',
      { class: 'a-card a-stack' },
      choose,
      h(
        'div',
        { class: 'a-tiles' },
        tile(t('orders'), String(p.orders)),
        tile(t('sales'), money(p.sales)),
        tile(t('basket'), p.orders ? money(p.basket) : '—'),
        h(
          'div',
          { class: 'a-tile a-tile--wide' },
          h('span', { class: 'a-tile-label' }, t('split')),
          h(
            'span',
            { class: 'a-tile-small a-tile-lines' },
            ...[
              ['dineIn', p.dineIn],
              ['takeaway', p.takeaway],
            ].map(([k, x]) =>
              h('span', null, t('splitLine', { k: t(k), n: x.orders, s: money(x.sales) })),
            ),
          ),
        ),
      ),
    );
  }

  function monthCards() {
    const c = data.chosen;
    const picker = /** @type {HTMLSelectElement} */ (
      h(
        'select',
        {
          class: 'a-input',
          id: 'sl-month',
          onchange: (/** @type {Event} */ e) => {
            month = /** @type {HTMLSelectElement} */ (e.target).value;
            load();
          },
        },
        ...[...data.months]
          .reverse()
          .map((/** @type {any} */ m) =>
            h('option', { value: m.month, selected: m.month === data.month }, monthName(m.month)),
          ),
      )
    );
    const head = h(
      'div',
      { class: 'a-row a-spread' },
      h('label', { class: 'a-label', for: 'sl-month' }, t('month')),
      picker,
    );
    if (!c.totals.orders)
      return [
        h('section', { class: 'a-card a-stack' }, head, h('p', { class: 'a-muted' }, t('none'))),
      ];
    // Every day of the month up to today, zero where nothing was sold.
    const last = data.month === data.today.slice(0, 7) ? data.today : endOf(data.month);
    const days = [];
    for (let day = `${data.month}-01`; day <= last; day = next(day)) {
      const x = c.days.find((/** @type {any} */ r) => r.day === day);
      days.push({ day, orders: x?.orders ?? 0, sales: x?.sales ?? 0 });
    }
    const daily = h(
      'section',
      { class: 'a-card a-stack' },
      head,
      h(
        'div',
        { class: 'a-tiles' },
        tile(t('orders'), String(c.totals.orders)),
        tile(t('sales'), money(c.totals.sales)),
        tile(t('basket'), money(c.totals.basket)),
      ),
      h('h2', { class: 'a-title' }, t('perDay')),
      columns(
        h,
        days.map((x) => ({
          label: t('salesOf', {
            d: dayName(x.day, { weekday: 'short', day: '2-digit', month: '2-digit' }),
            n: x.orders,
            s: d.price(x.sales),
          }),
          short: Number(x.day.slice(8)) % 7 === 1 ? String(Number(x.day.slice(8))) : '',
          value: x.sales,
          // Amounts are too wide to write on a column: the best day is said below.
          text: '',
        })),
        t('perDay'),
      ),
      bestDay(days),
      h(
        'details',
        null,
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
              ...[t('day'), t('orders'), t('sales')].map((x) => h('th', { scope: 'col' }, x)),
            ),
          ),
          h(
            'tbody',
            null,
            ...days
              .filter((x) => x.orders)
              .map((x) =>
                h(
                  'tr',
                  null,
                  h('th', { scope: 'row' }, dayName(x.day, { day: '2-digit', month: '2-digit' })),
                  h('td', null, String(x.orders)),
                  h('td', null, money(x.sales)),
                ),
              ),
          ),
        ),
      ),
    );
    const top = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('top')),
      h('h3', { class: 'a-subtitle' }, t('byQty')),
      bars(
        h,
        c.byQty.map((/** @type {any} */ i) => ({ label: pick(i.name) || i.id, value: i.qty })),
      ),
      h('h3', { class: 'a-subtitle' }, t('bySales')),
      bars(
        h,
        c.bySales.map((/** @type {any} */ i) => ({
          label: pick(i.name) || i.id,
          value: i.sales,
          text: money(i.sales),
        })),
      ),
    );
    // Monday first: 2 to 8 November 2026 ran from Monday to Sunday.
    const weekdayNames = Array.from({ length: 7 }, (_, i) =>
      dayName(`2026-11-0${2 + i}`, { weekday: 'long' }),
    );
    const busy = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('hours')),
      columns(
        h,
        c.hours.map((/** @type {number} */ n, /** @type {number} */ hr) => ({
          label: t('hourOf', { h: String(hr).padStart(2, '0'), n }),
          short: hr % 3 === 0 ? String(hr) : '',
          value: n,
        })),
        t('hours'),
      ),
      h('h3', { class: 'a-subtitle' }, t('weekdays')),
      bars(
        h,
        c.weekdays.map((/** @type {number} */ n, /** @type {number} */ i) => ({
          label: weekdayNames[i],
          value: n,
        })),
      ),
    );
    return [daily, top, busy];
  }

  /** The month's best day, in words. @param {{ day: string, orders: number, sales: number }[]} days */
  function bestDay(days) {
    const best = days.reduce((a, b) => (b.sales > a.sales ? b : a), days[0]);
    return best?.sales
      ? h(
          'p',
          { class: 'a-muted' },
          t('bestDay', {
            d: `${dayName(best.day, { weekday: 'long' })} ${ltr(dayName(best.day, { day: '2-digit', month: '2-digit' }))}`,
            s: money(best.sales),
            n: best.orders,
          }),
        )
      : null;
  }

  function monthsCard() {
    return h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('months')),
      bars(
        h,
        data.months.map((/** @type {any} */ m) => ({
          label: monthName(m.month),
          value: m.sales,
          text: m.orders ? t('monthValue', { s: money(m.sales), n: m.orders }) : '—',
        })),
      ),
    );
  }

  function draw() {
    if (!data) return;
    content.replaceChildren(
      ...present([
        h('p', { class: 'a-card a-paused' }, t('scope')),
        data.test ? h('p', { class: 'a-muted' }, t('test')) : null,
        data.goLive
          ? h(
              'p',
              { class: 'a-muted' },
              t('since', {
                d: ltr(dayName(data.goLive, { day: '2-digit', month: '2-digit', year: 'numeric' })),
              }),
            )
          : null,
        periodCard(),
        ...monthCards(),
        monthsCard(),
        d.admin ? exportCard() : null,
      ]),
    );
  }

  async function load() {
    const res = await d.api(
      `/sales?cafe=${encodeURIComponent(d.cafe)}${month ? `&month=${month}` : ''}`,
    );
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      content.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    data = res.data;
    draw();
  }

  /** @type {HTMLElement | null} */
  let exportEl = null;
  function exportCard() {
    if (exportEl) return exportEl;
    const today = data.today;
    const from = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'a-input',
        type: 'date',
        id: 'sl-from',
        value: `${data.months[0].month}-01`,
      })
    );
    const to = /** @type {HTMLInputElement} */ (
      h('input', { class: 'a-input', type: 'date', id: 'sl-to', value: today })
    );
    const out = h('div', { class: 'a-stack', role: 'status' });
    /** @param {string} name @param {string} csv */
    const link = (name, csv) =>
      h(
        'a',
        {
          class: 'a-btn a-btn--link',
          download: name,
          href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
        },
        name,
      );
    exportEl = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('exportTitle')),
      h('p', { class: 'a-muted' }, t('exportIntro')),
      h(
        'div',
        { class: 'a-row' },
        h('label', { class: 'a-label', for: 'sl-from' }, t('from')),
        from,
        h('label', { class: 'a-label', for: 'sl-to' }, t('to')),
        to,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn a-btn--main',
          onclick: async () => {
            const res = await d.api(`/sales/export?from=${from.value}&to=${to.value}`);
            if (res.status === 401) return d.signedOut();
            if (res.status === 400)
              return out.replaceChildren(h('p', { class: 'a-error' }, t('badRange')));
            if (res.status !== 200)
              return out.replaceChildren(h('p', { class: 'a-error' }, t('error')));
            if (!res.data.cafes.length)
              return out.replaceChildren(h('p', { class: 'a-muted' }, t('noLive')));
            const files = salesCsv(res.data);
            const span = `${res.data.from}_${res.data.to}`;
            out.replaceChildren(
              h('p', { class: 'a-ok' }, t('ready', { n: res.data.cafes.length })),
              link(`digimenu-sales_${span}.csv`, files.all),
              ...files.perCafe.map((f) => link(`digimenu-sales_${f.slug}_${span}.csv`, f.csv)),
            );
          },
        },
        t('exportBtn'),
      ),
      out,
    );
    return exportEl;
  }

  body.replaceChildren(content);
  load();
}

/** @param {string} day */
function next(day) {
  const x = new Date(`${day}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/** Last day of "YYYY-MM". @param {string} month */
function endOf(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
