// @ts-check
/**
 * The Admin's "Clients" tab (ADR-0010, issue #23): search, one person's record, their file,
 * withdrawing offers, deletion on request after two confirmations, and the bulk export built
 * here in the browser (the server keeps no file). The server logs every step.
 */

/** @type {Record<string, Record<string, string>>} */
export const CUSTOMER_TEXT = {
  fr: {
    tab: 'Clients',
    q: 'Téléphone, 3 derniers chiffres ou prénom',
    allCafes: 'Tous les cafés',
    anyChoice: 'Tous les choix',
    marketing: 'Accepte les offres',
    loyalty: 'Membre fidélité',
    search: 'Chercher',
    more: 'Afficher plus',
    none: 'Aucun client trouvé.',
    exportAll: 'Exporter tout (CSV)',
    exporting: 'Export en cours… {n}',
    exported: '{n} clients exportés.',
    open: 'Ouvrir',
    back: 'Retour à la liste',
    orders: '{n} commande(s)',
    last: 'dernière le {d}',
    phone: 'Téléphone',
    since: 'Client depuis le {d}',
    optIns: 'Choix actuels',
    offersAt: 'offres : {c}',
    loyaltyAt: 'fidélité : {c}',
    noOptIn: 'aucune offre, pas de fidélité',
    history: 'Commandes',
    consents: 'Historique des choix',
    yes: 'oui',
    no: 'non',
    cards: 'Cartes de fidélité',
    exportOne: 'Exporter ce client (JSON)',
    withdraw: 'Retirer les offres · {c}',
    withdrawn: 'Offres retirées.',
    delete: 'Supprimer ce client…',
    deleteWarn:
      'Suppression définitive : prénom, téléphone, choix et carte de fidélité sont effacés ; les commandes restent sans nom, pour les comptes. Vérifiez d’abord que la personne contrôle ce numéro. Cela ne peut pas être annulé.',
    deleteConfirm: 'Tapez les 3 derniers chiffres du numéro pour confirmer',
    deleteBtn: 'Supprimer définitivement',
    deleted: 'Client supprimé. {n} commande(s) rendues anonymes.',
    mismatch: 'Les 3 chiffres ne correspondent pas.',
    badPhone: 'Numéro non valable.',
    error: 'Une erreur est survenue. Réessayez.',
    p_marketing: 'offres',
    p_order_updates: 'suivi de la commande',
    p_loyalty: 'fidélité',
    s_checkout: 'à la commande',
    s_admin: 'par Admin',
    s_loyalty_card: 'depuis la carte',
    c_active: 'active',
    c_left: 'quittée',
  },
  ar: {
    tab: 'الحرفاء',
    q: 'الهاتف، آخر 3 أرقام أو الاسم',
    allCafes: 'كل المقاهي',
    anyChoice: 'كل الاختيارات',
    marketing: 'يقبل العروض',
    loyalty: 'عضو الوفاء',
    search: 'بحث',
    more: 'عرض المزيد',
    none: 'لا يوجد حريف.',
    exportAll: 'تصدير الكل (CSV)',
    exporting: 'جارٍ التصدير… {n}',
    exported: 'تم تصدير {n} حريف.',
    open: 'فتح',
    back: 'رجوع إلى القائمة',
    orders: '{n} طلب',
    last: 'آخرها في {d}',
    phone: 'الهاتف',
    since: 'حريف منذ {d}',
    optIns: 'الاختيارات الحالية',
    offersAt: 'العروض: {c}',
    loyaltyAt: 'الوفاء: {c}',
    noOptIn: 'لا عروض ولا وفاء',
    history: 'الطلبات',
    consents: 'سجلّ الاختيارات',
    yes: 'نعم',
    no: 'لا',
    cards: 'بطاقات الوفاء',
    exportOne: 'تصدير هذا الحريف (JSON)',
    withdraw: 'إيقاف العروض · {c}',
    withdrawn: 'تم إيقاف العروض.',
    delete: 'حذف هذا الحريف…',
    deleteWarn:
      'حذف نهائي: يُمحى الاسم والهاتف والاختيارات وبطاقة الوفاء؛ تبقى الطلبات بدون اسم للحسابات. تأكّد أولًا أن الشخص يملك هذا الرقم. لا يمكن التراجع.',
    deleteConfirm: 'اكتب آخر 3 أرقام من الهاتف للتأكيد',
    deleteBtn: 'حذف نهائي',
    deleted: 'تم حذف الحريف. {n} طلب أصبح بدون اسم.',
    mismatch: 'الأرقام الثلاثة غير مطابقة.',
    badPhone: 'رقم غير صالح.',
    error: 'حدث خطأ. أعد المحاولة.',
    p_marketing: 'العروض',
    p_order_updates: 'متابعة الطلب',
    p_loyalty: 'الوفاء',
    s_checkout: 'عند الطلب',
    s_admin: 'من الإدارة',
    s_loyalty_card: 'من البطاقة',
    c_active: 'مفعّلة',
    c_left: 'ملغاة',
  },
};

/**
 * @typedef {object} Deps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {{ slug: string, name: any }[]} cafes
 * @property {(millimes: number) => string} price
 * @property {() => void} signedOut
 */

/** One CSV cell. @param {unknown} v */
const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Offers the browser a file to save; nothing stays on the server. @param {string} name @param {string} text @param {string} type */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * @param {HTMLElement} body
 * @param {Deps} d
 */
export function customersView(body, d) {
  const { h, lang } = d;
  const t = (/** @type {string} */ key, /** @type {Record<string, string | number>} */ vars = {}) =>
    (CUSTOMER_TEXT[lang][key] ?? CUSTOMER_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  const date = (/** @type {string} */ iso) =>
    new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      numberingSystem: 'latn',
    });
  const cafeName = (/** @type {string} */ slug) => {
    const c = d.cafes.find((x) => x.slug === slug);
    return (c?.name?.[lang] || c?.name?.fr || slug) ?? slug;
  };
  const message = h('p', { class: 'a-muted', role: 'status' });
  /** @param {string} text @param {'ok' | 'error' | 'muted'} [tone] */
  const say = (text, tone = 'muted') => {
    message.className = tone === 'ok' ? 'a-ok' : tone === 'error' ? 'a-error' : 'a-muted';
    message.textContent = text;
  };

  const q = h('input', {
    class: 'a-input',
    id: 'cust-q',
    dir: 'auto',
    autocomplete: 'off',
    maxlength: 60,
  });
  const cafe = h(
    'select',
    { class: 'a-input', 'aria-label': t('allCafes') },
    h('option', { value: '' }, t('allCafes')),
    ...d.cafes.map((c) => h('option', { value: c.slug }, cafeName(c.slug))),
  );
  const optin = h(
    'select',
    { class: 'a-input', 'aria-label': t('anyChoice') },
    h('option', { value: '' }, t('anyChoice')),
    h('option', { value: 'marketing' }, t('marketing')),
    h('option', { value: 'loyalty' }, t('loyalty')),
  );
  const results = h('div', { class: 'a-stack' });
  const value = (/** @type {HTMLElement} */ el) => /** @type {HTMLInputElement} */ (el).value;

  const query = (/** @type {string} */ cursor = '') => {
    const p = new URLSearchParams();
    if (value(q).trim()) p.set('q', value(q).trim());
    if (value(cafe)) p.set('cafe', value(cafe));
    if (value(optin)) p.set('optin', value(optin));
    if (cursor) p.set('cursor', cursor);
    return `/customers?${p}`;
  };

  /** @param {boolean} append @param {string} [cursor] */
  async function search(append, cursor) {
    const res = await d.api(query(cursor));
    if (res.status === 401) return d.signedOut();
    if (res.status === 422) return say(t('badPhone'), 'error');
    if (res.status !== 200) return say(t('error'), 'error');
    say('');
    const rows = res.data.customers.map((/** @type {any} */ c) =>
      h(
        'article',
        { class: 'a-card a-row a-spread' },
        h(
          'div',
          { class: 'a-stack' },
          h('strong', null, c.firstName || '—', ' ', h('bdi', { dir: 'ltr' }, c.phone)),
          h(
            'span',
            { class: 'a-muted' },
            [
              c.cafes.map(cafeName).join(', '),
              t('orders', { n: c.orders }),
              t('last', { d: date(c.lastOrderAt) }),
            ].join(' · '),
          ),
          optInLine(c.optIns),
        ),
        h('button', { type: 'button', class: 'a-btn', onclick: () => detail(c.id) }, t('open')),
      ),
    );
    if (!append) results.replaceChildren();
    results.querySelector('.cust-more')?.remove();
    if (!append && !rows.length) results.append(h('p', { class: 'a-muted' }, t('none')));
    results.append(...rows);
    if (res.data.next) {
      results.append(
        h(
          'button',
          { type: 'button', class: 'a-btn cust-more', onclick: () => search(true, res.data.next) },
          t('more'),
        ),
      );
    }
  }

  /** @param {Record<string, string[]>} optIns */
  function optInLine(optIns) {
    const parts = [];
    if (optIns.marketing?.length)
      parts.push(t('offersAt', { c: optIns.marketing.map(cafeName).join(', ') }));
    if (optIns.loyalty?.length)
      parts.push(t('loyaltyAt', { c: optIns.loyalty.map(cafeName).join(', ') }));
    return h('span', { class: 'a-muted' }, parts.length ? parts.join(' · ') : t('noOptIn'));
  }

  async function exportAll() {
    const lines = [
      ['id', 'first_name', 'phone', 'first_order_at', 'last_order_at', 'offers', 'loyalty'].join(
        ',',
      ),
    ];
    let cursor = '';
    let n = 0;
    for (;;) {
      const p = new URLSearchParams();
      if (value(cafe)) p.set('cafe', value(cafe));
      if (cursor) p.set('cursor', cursor);
      const res = await d.api(`/customers/export?${p}`);
      if (res.status !== 200) return say(t('error'), 'error');
      for (const c of res.data.customers) {
        lines.push(
          [
            c.id,
            c.firstName,
            c.phone,
            c.firstOrderAt,
            c.lastOrderAt,
            (c.optIns.marketing ?? []).join(' '),
            (c.optIns.loyalty ?? []).join(' '),
          ]
            .map(cell)
            .join(','),
        );
      }
      n += res.data.customers.length;
      say(t('exporting', { n }));
      if (!res.data.next) break;
      cursor = res.data.next;
    }
    // The byte-order mark lets spreadsheet programs read Arabic names correctly.
    download(`clients-${value(cafe) || 'all'}.csv`, '﻿' + lines.join('\r\n') + '\r\n', 'text/csv');
    say(t('exported', { n }), 'ok');
  }

  /** @param {string} id */
  async function detail(id) {
    const res = await d.api(`/customers/${id}`);
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) return say(t('error'), 'error');
    drawDetail(res.data);
  }

  /** @param {any} r */
  function drawDetail(r) {
    const c = r.customer;
    const confirm = h('input', {
      class: 'a-input',
      id: 'cust-confirm',
      inputmode: 'numeric',
      maxlength: 3,
      dir: 'ltr',
      autocomplete: 'off',
    });
    const deleteBtn = /** @type {HTMLButtonElement} */ (
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn a-btn--danger',
          disabled: true,
          onclick: async () => {
            deleteBtn.disabled = true;
            const res = await d.api(`/customers/${c.id}/delete`, { confirm: value(confirm) });
            if (res.status === 200) {
              body.replaceChildren(form, message, results);
              await search(false);
              say(t('deleted', { n: res.data.ordersAnonymised }), 'ok');
            } else {
              say(t(res.data?.error === 'confirm_mismatch' ? 'mismatch' : 'error'), 'error');
              deleteBtn.disabled = false;
            }
          },
        },
        t('deleteBtn'),
      )
    );
    confirm.addEventListener('input', () => {
      deleteBtn.disabled = !/^\d{3}$/.test(value(confirm));
    });
    const deleteBox = h(
      'div',
      { class: 'a-stack', hidden: true },
      h('p', { class: 'a-error' }, t('deleteWarn')),
      h('label', { class: 'a-label', for: 'cust-confirm' }, t('deleteConfirm')),
      confirm,
      deleteBtn,
    );
    const offers = (c.optIns.marketing ?? []).map((/** @type {string} */ slug) =>
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: async () => {
            const res = await d.api(`/customers/${c.id}/consent`, {
              cafe: slug,
              purpose: 'marketing',
            });
            if (res.status !== 200) return say(t('error'), 'error');
            say(t('withdrawn'), 'ok');
            drawDetail(res.data);
          },
        },
        t('withdraw', { c: cafeName(slug) }),
      ),
    );
    const cards = r.modules?.loyalty?.cards ?? [];
    body.replaceChildren(
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn a-btn--link',
          onclick: () => {
            body.replaceChildren(form, message, results);
          },
        },
        t('back'),
      ),
      message,
      h(
        'article',
        { class: 'a-card a-stack' },
        h('strong', { class: 'a-number' }, c.firstName || '—'),
        h(
          'p',
          null,
          h('span', { class: 'a-muted' }, t('phone')),
          ' ',
          h('bdi', { dir: 'ltr' }, c.phone),
        ),
        h('p', { class: 'a-muted' }, t('since', { d: date(c.firstOrderAt) })),
        h('p', null, h('strong', null, t('optIns')), ' · ', optInLine(c.optIns)),
        h(
          'div',
          { class: 'a-row' },
          h(
            'button',
            {
              type: 'button',
              class: 'a-btn a-btn--main',
              onclick: async () => {
                const res = await d.api(`/customers/${c.id}/export`);
                if (res.status !== 200) return say(t('error'), 'error');
                download(
                  `customer-${c.id}.json`,
                  JSON.stringify(res.data, null, 2),
                  'application/json',
                );
              },
            },
            t('exportOne'),
          ),
          ...offers,
        ),
      ),
      h('h2', { class: 'a-cat' }, t('history')),
      h(
        'ul',
        { class: 'a-lines' },
        ...r.orders.map((/** @type {any} */ o) =>
          h(
            'li',
            null,
            h('span', null, `${date(o.at)} · ${cafeName(o.cafe)} · ${o.number}`),
            h('bdi', null, d.price(o.total)),
          ),
        ),
      ),
      h('h2', { class: 'a-cat' }, t('consents')),
      h(
        'ul',
        { class: 'a-lines' },
        ...r.consents.map((/** @type {any} */ k) =>
          h(
            'li',
            null,
            h('span', null, `${date(k.at)} · ${cafeName(k.cafe)} · ${t(`p_${k.purpose}`)}`),
            h('span', null, `${k.granted ? t('yes') : t('no')} · ${t(`s_${k.source}`)}`),
          ),
        ),
      ),
      ...(cards.length
        ? [
            h('h2', { class: 'a-cat' }, t('cards')),
            h(
              'ul',
              { class: 'a-lines' },
              ...cards.map((/** @type {any} */ k) =>
                h(
                  'li',
                  null,
                  h('span', null, `${cafeName(k.cafe)} · ${k.number}`),
                  h('span', null, t(`c_${k.status}`)),
                ),
              ),
            ),
          ]
        : []),
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn a-btn--danger',
          onclick: (/** @type {Event} */ e) => {
            deleteBox.hidden = false;
            /** @type {HTMLElement} */ (e.currentTarget).hidden = true;
            confirm.focus();
          },
        },
        t('delete'),
      ),
      deleteBox,
    );
  }

  const form = h(
    'form',
    {
      class: 'a-card a-stack',
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault();
        search(false);
      },
    },
    h('label', { class: 'a-label', for: 'cust-q' }, t('q')),
    q,
    h('div', { class: 'a-row' }, cafe, optin),
    h(
      'div',
      { class: 'a-row' },
      h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('search')),
      h('button', { type: 'button', class: 'a-btn', onclick: () => exportAll() }, t('exportAll')),
    ),
  );
  body.replaceChildren(form, message, results);
  search(false);
}
