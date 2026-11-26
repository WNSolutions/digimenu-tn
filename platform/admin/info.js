// @ts-check
/**
 * "Infos" in the staff app (issue #20, US-28, C-06, C-07, C-08, ADR-0012): what customers see
 * in the café's Info sheet and at the top of the menu, run by the Manager from a phone.
 * Address, map link, phone, social links, opening hours per day, the brand colour and an
 * optional button colour with a live preview, and the modules' settings (e.g. the Google
 * review link). A colour too light for buttons is refused with a deeper shade to use instead.
 * Every save is a version; the history lists them and restores any earlier one.
 * Server: platform/shell/src/info-api.js.
 */
import { accentTokens } from '../../core/ui/accent.js';
import { parsePrice, formatPrice } from '../../core/money.js';

const DAYS = /** @type {const} */ (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const INFO_TEXT = {
  fr: {
    tab: 'Infos',
    intro:
      'Ce que les clients voient dans « Infos » et en haut du menu. Chaque enregistrement crée une version : vous pouvez revenir en arrière.',
    place: 'Adresse et contact',
    address: 'Adresse',
    lang_fr: 'français',
    lang_ar: 'arabe',
    lang_en: 'anglais',
    addressIn: 'Adresse en {l}',
    map: 'Lien du plan (Google Maps)',
    mapHelp: 'Dans Google Maps : Partager, puis Copier le lien.',
    phone: 'Téléphone du café',
    phoneHelp: 'Un numéro professionnel, par exemple +216 54 313 334.',
    social: 'Réseaux sociaux et site',
    socialHelp: 'Jusqu’à 6 liens, chacun commençant par https://.',
    addLink: 'Ajouter un lien',
    remove: 'Retirer',
    hours: 'Horaires',
    hoursHelp:
      'Heure de Tunis. Une fin plus tôt que le début veut dire après minuit (12:00 à 00:00).',
    open: 'Ouvert',
    closed: 'Fermé',
    addSpan: 'Ajouter un créneau',
    from: 'De',
    to: 'à',
    day_mon: 'Lundi',
    day_tue: 'Mardi',
    day_wed: 'Mercredi',
    day_thu: 'Jeudi',
    day_fri: 'Vendredi',
    day_sat: 'Samedi',
    day_sun: 'Dimanche',
    colours: 'Couleurs',
    brand: 'Couleur de la marque',
    button: 'Couleur des boutons (facultatif)',
    buttonHelp: 'Pour une marque trop claire : les boutons prennent cette couleur.',
    noButton: 'Utiliser la couleur de la marque',
    preview: 'Aperçu',
    previewButton: 'Commander',
    previewLink: 'Voir la carte',
    themeNote: 'Ce café a son propre thème : l’aperçu montre les boutons sur son fond.',
    settings: 'Réglages des modules',
    moduleOff: 'module désactivé',
    needed: 'Nécessaire pour activer le module.',
    save: 'Enregistrer',
    saved: 'Enregistré. Les clients le voient d’ici une minute.',
    unchanged: 'Rien n’a changé.',
    fix: 'Corrigez les points en rouge.',
    bad_text: 'Le français est obligatoire, 200 caractères au plus.',
    bad_url: 'Le lien doit commencer par https://.',
    bad_phone: 'Format : +216 suivi de 8 chiffres.',
    bad_hours: 'Heures invalides : début et fin différents, 3 créneaux au plus.',
    bad_colour: 'Couleur invalide.',
    contrast: 'Trop claire pour des boutons lisibles. Essayez {s}.',
    useSuggestion: 'Utiliser {s}',
    theme_contrast: 'Ne ressort pas sur le fond du menu : choisissez une couleur plus contrastée.',
    bad_setting: 'Valeur invalide.',
    error: 'Une erreur est survenue. Réessayez.',
    history: 'Historique',
    noHistory: 'Aucun changement pour le moment.',
    restore: 'Revenir à cette version',
    undo: 'Annuler le dernier changement',
    restored: 'Version {v} rétablie. Les clients la voient d’ici une minute.',
    hRestore: 'retour à la version {v}',
    f_info: 'adresse et contact',
    f_hours: 'horaires',
    f_branding: 'couleurs',
    f_settings: 'réglages',
    someone: 'quelqu’un',
  },
  ar: {
    tab: 'المعلومات',
    intro:
      'ما يراه الحرفاء في «معلومات» وأعلى القائمة. كل حفظ ينشئ نسخة: يمكنك الرجوع إلى نسخة سابقة.',
    place: 'العنوان والاتصال',
    address: 'العنوان',
    lang_fr: 'الفرنسية',
    lang_ar: 'العربية',
    lang_en: 'الإنجليزية',
    addressIn: 'العنوان بـ{l}',
    map: 'رابط الخريطة (Google Maps)',
    mapHelp: 'في Google Maps: مشاركة ثم نسخ الرابط.',
    phone: 'هاتف المقهى',
    phoneHelp: 'رقم مهني، مثلًا ‎+216 54 313 334‎.',
    social: 'الشبكات الاجتماعية والموقع',
    socialHelp: 'حتى 6 روابط، كل منها يبدأ بـ https://.',
    addLink: 'إضافة رابط',
    remove: 'حذف',
    hours: 'أوقات العمل',
    hoursHelp: 'بتوقيت تونس. نهاية قبل البداية تعني بعد منتصف الليل (12:00 إلى 00:00).',
    open: 'مفتوح',
    closed: 'مغلق',
    addSpan: 'إضافة فترة',
    from: 'من',
    to: 'إلى',
    day_mon: 'الاثنين',
    day_tue: 'الثلاثاء',
    day_wed: 'الأربعاء',
    day_thu: 'الخميس',
    day_fri: 'الجمعة',
    day_sat: 'السبت',
    day_sun: 'الأحد',
    colours: 'الألوان',
    brand: 'لون العلامة',
    button: 'لون الأزرار (اختياري)',
    buttonHelp: 'لعلامة فاتحة جدًا: تأخذ الأزرار هذا اللون.',
    noButton: 'استعمال لون العلامة',
    preview: 'معاينة',
    previewButton: 'اطلب',
    previewLink: 'عرض البطاقة',
    themeNote: 'لهذا المقهى مظهر خاص: المعاينة تعرض الأزرار على خلفيته.',
    settings: 'إعدادات الوحدات',
    moduleOff: 'الوحدة متوقفة',
    needed: 'ضروري لتشغيل الوحدة.',
    save: 'حفظ',
    saved: 'تم الحفظ. يراه الحرفاء خلال دقيقة.',
    unchanged: 'لم يتغير شيء.',
    fix: 'صحّح النقاط باللون الأحمر.',
    bad_text: 'الفرنسية إلزامية، 200 حرف على الأكثر.',
    bad_url: 'يجب أن يبدأ الرابط بـ https://.',
    bad_phone: 'الصيغة: ‎+216‎ متبوعة بـ 8 أرقام.',
    bad_hours: 'أوقات غير صالحة: بداية ونهاية مختلفتان، 3 فترات على الأكثر.',
    bad_colour: 'لون غير صالح.',
    contrast: 'فاتح جدًا لأزرار مقروءة. جرّب {s}.',
    useSuggestion: 'استعمال {s}',
    theme_contrast: 'لا يظهر بوضوح على خلفية القائمة: اختر لونًا أكثر تباينًا.',
    bad_setting: 'قيمة غير صالحة.',
    error: 'حدث خطأ. أعد المحاولة.',
    history: 'السجل',
    noHistory: 'لا تغييرات حتى الآن.',
    restore: 'الرجوع إلى هذه النسخة',
    undo: 'إلغاء آخر تغيير',
    restored: 'أُعيدت النسخة {v}. يراها الحرفاء خلال دقيقة.',
    hRestore: 'رجوع إلى النسخة {v}',
    f_info: 'العنوان والاتصال',
    f_hours: 'أوقات العمل',
    f_branding: 'الألوان',
    f_settings: 'الإعدادات',
    someone: 'شخص ما',
  },
};

/**
 * @typedef {object} InfoDeps
 * @property {(tag: string, attrs?: Record<string, any> | null, ...children: any[]) => HTMLElement} h
 * @property {'fr' | 'ar'} lang
 * @property {(path: string, body?: any) => Promise<{ status: number, data: any }>} api
 * @property {string} cafe
 * @property {() => void} signedOut
 */

/** "25/11 18:47", isolated left to right inside Arabic text. @param {string} iso */
const when = (iso) =>
  `⁦${new Date(iso).toLocaleString('fr-TN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })}⁩`;

/** @param {any} text @param {'fr' | 'ar'} lang */
const pick = (text, lang) => (text ? text[lang] || text.fr || '' : '');

/**
 * @param {HTMLElement} body
 * @param {InfoDeps} d
 */
export function infoView(body, d) {
  const { h, lang } = d;
  /** @param {string} key @param {Record<string, string>} [vars] */
  const t = (key, vars = {}) =>
    (INFO_TEXT[lang][key] ?? INFO_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  let uid = 0;
  const id = (/** @type {string} */ p) => `in-${p}-${++uid}`;

  /** @type {Map<string, HTMLElement>} field → where its problem shows */
  const slots = new Map();
  /** @param {string} field */
  const slot = (field) => {
    const p = h('p', { class: 'a-error', hidden: true, role: 'alert' });
    slots.set(field, p);
    return p;
  };
  const message = h('p', { role: 'status', hidden: true });
  /** @param {string} text @param {'ok' | 'error'} [tone] */
  const say = (text, tone = 'error') => {
    message.className = tone === 'ok' ? 'a-ok' : 'a-error';
    message.textContent = text;
    message.hidden = !text;
  };

  /**
   * A labelled input with optional help and a problem slot.
   * @param {string} label
   * @param {string} field
   * @param {Record<string, any>} attrs
   * @param {string} [help]
   */
  function input(label, field, attrs, help) {
    const i = id(field);
    const el = /** @type {HTMLInputElement} */ (h('input', { class: 'a-input', id: i, ...attrs }));
    return {
      el,
      node: h(
        'div',
        { class: 'a-stack a-field' },
        h('label', { class: 'a-label', for: i }, label, el),
        help ? h('p', { class: 'a-muted a-help' }, help) : null,
        slot(field),
      ),
    };
  }

  async function load() {
    const res = await d.api(`/info?cafe=${encodeURIComponent(d.cafe)}`);
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) {
      body.replaceChildren(h('p', { class: 'a-error' }, t('error')));
      return;
    }
    draw(res.data);
  }

  /** @param {any} v   the server's answer */
  function draw(v) {
    slots.clear();
    const langs = /** @type {string[]} */ (v.languages?.enabled ?? ['fr']);

    // ---- Address and contact ----
    const address = langs.map((l) =>
      input(t('addressIn', { l: t(`lang_${l}`) }), 'info.address', {
        value: v.info.address?.[l] ?? '',
        maxlength: 200,
        autocomplete: 'street-address',
        lang: l,
        dir: l === 'ar' ? 'rtl' : 'ltr',
      }),
    );
    // One problem slot for the address, after the last language.
    for (const a of address.slice(0, -1)) a.node.lastElementChild?.remove();
    const map = input(
      t('map'),
      'info.mapUrl',
      { type: 'url', value: v.info.mapUrl ?? '', inputmode: 'url', dir: 'ltr' },
      t('mapHelp'),
    );
    const phone = input(
      t('phone'),
      'info.phone',
      { type: 'tel', value: v.info.phone ?? '', autocomplete: 'tel', dir: 'ltr' },
      t('phoneHelp'),
    );
    const socialList = h('div', { class: 'a-stack' });
    /** @param {string} value */
    const socialRow = (value) => {
      const el = h('input', {
        class: 'a-input',
        type: 'url',
        value,
        dir: 'ltr',
        'aria-label': t('social'),
        inputmode: 'url',
      });
      const row = h(
        'div',
        { class: 'a-row' },
        el,
        h('button', { type: 'button', class: 'a-btn', onclick: () => row.remove() }, t('remove')),
      );
      return row;
    };
    for (const u of v.info.social ?? []) socialList.append(socialRow(u));
    const social = h(
      'div',
      { class: 'a-stack a-field' },
      h('p', { class: 'a-label' }, t('social')),
      socialList,
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => {
            if (socialList.childElementCount < 6) socialList.append(socialRow(''));
          },
        },
        t('addLink'),
      ),
      h('p', { class: 'a-muted a-help' }, t('socialHelp')),
      slot('info.social'),
    );

    // ---- Hours ----
    /** @type {Record<string, () => string[][]>} */
    const hoursOf = {};
    const hoursRows = DAYS.map((day) => {
      const spans = h('div', { class: 'a-stack' });
      /** @param {string[]} s */
      const span = (s) => {
        const a = h('input', {
          class: 'a-input a-time',
          type: 'time',
          value: s[0],
          'aria-label': `${t(`day_${day}`)} ${t('from')}`,
        });
        const b = h('input', {
          class: 'a-input a-time',
          type: 'time',
          value: s[1],
          'aria-label': `${t(`day_${day}`)} ${t('to')}`,
        });
        const row = h(
          'div',
          { class: 'a-row a-span', 'data-span': '' },
          h('span', null, t('from')),
          a,
          h('span', null, t('to')),
          b,
          h(
            'button',
            {
              type: 'button',
              class: 'a-btn',
              onclick: () => {
                row.remove();
                sync();
              },
            },
            t('remove'),
          ),
        );
        return row;
      };
      for (const s of v.hours[day] ?? []) spans.append(span(s));
      const add = h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => {
            if (spans.childElementCount < 3) spans.append(span(['08:00', '18:00']));
            sync();
          },
        },
        t('addSpan'),
      );
      const state = h('span', { class: 'a-badge' });
      const sync = () => {
        const open = spans.childElementCount > 0;
        state.textContent = open ? t('open') : t('closed');
        state.className = open ? 'a-badge a-badge--on' : 'a-badge';
        add.hidden = spans.childElementCount >= 3;
      };
      sync();
      hoursOf[day] = () =>
        [...spans.querySelectorAll('[data-span]')].map((r) =>
          [...r.querySelectorAll('input')].map((i) => /** @type {HTMLInputElement} */ (i).value),
        );
      return h(
        'div',
        { class: 'a-stack a-day' },
        h('div', { class: 'a-row a-spread' }, h('strong', null, t(`day_${day}`)), state),
        spans,
        add,
        slot(`hours.${day}`),
      );
    });

    // ---- Colours, with a live preview (ADR-0012) ----
    const brand = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'a-colour',
        type: 'color',
        value: (v.branding.primaryColor ?? '#004532').toLowerCase(),
        id: id('brand'),
      })
    );
    const hasButton = Boolean(v.branding.buttonColor);
    const button = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'a-colour',
        type: 'color',
        value: (v.branding.buttonColor ?? v.branding.primaryColor ?? '#004532').toLowerCase(),
        id: id('button'),
        disabled: !hasButton,
      })
    );
    const useBrand = /** @type {HTMLInputElement} */ (
      h('input', { type: 'checkbox', checked: !hasButton, id: id('nobutton') })
    );
    const sample = h(
      'button',
      { type: 'button', class: 'a-sample', tabindex: -1 },
      t('previewButton'),
    );
    const sampleLink = h('span', { class: 'a-sample-link' }, t('previewLink'));
    const preview = h('div', { class: 'a-preview', 'aria-hidden': 'true' }, sample, sampleLink);
    if (v.branding.theme) {
      preview.style.setProperty('background', v.branding.theme.background);
      if (v.branding.theme.text) preview.style.setProperty('color', v.branding.theme.text);
    }
    const advice = h('p', { class: 'a-error', hidden: true, role: 'alert' });
    const useIt = h('button', { type: 'button', class: 'a-btn', hidden: true });
    const colourSlot = slot('branding');
    const branding = () => ({
      primaryColor: brand.value.toUpperCase(),
      ...(useBrand.checked ? {} : { buttonColor: button.value.toUpperCase() }),
    });
    const paint = () => {
      button.disabled = useBrand.checked;
      const result = accentTokens(branding());
      sample.style.setProperty('background', result.tokens['--dm-cafe-accent']);
      sample.style.setProperty('color', result.tokens['--dm-cafe-on-accent']);
      sampleLink.style.setProperty(
        'color',
        v.branding.theme ? brand.value : result.tokens['--dm-cafe-accent-text'],
      );
      const s = result.errors.length ? result.suggestion : null;
      advice.hidden = !s;
      useIt.hidden = !s;
      if (s) {
        advice.textContent = t('contrast', { s });
        useIt.textContent = t('useSuggestion', { s });
        useIt.onclick = () => {
          (useBrand.checked ? brand : button).value = s.toLowerCase();
          paint();
        };
      }
    };
    for (const el of [brand, button, useBrand]) el.addEventListener('input', paint);
    paint();

    // ---- Module settings ----
    /** @type {(() => [string, string, unknown])[]} */
    const settingReaders = [];
    const moduleBlocks = v.modules.map((/** @type {any} */ m) => {
      const fields = Object.entries(m.fields).map(([name, schema]) =>
        settingField(m, name, /** @type {any} */ (schema), langs),
      );
      return h(
        'div',
        { class: 'a-stack a-module' },
        h(
          'h3',
          { class: 'a-subtitle' },
          pick(m.title, lang),
          m.enabled ? null : h('span', { class: 'a-muted' }, ` · ${t('moduleOff')}`),
        ),
        ...fields,
      );
    });

    /**
     * One setting's input, from its schema: text, number (DT for amounts), a choice, or a
     * text per language.
     * @param {any} m
     * @param {string} name
     * @param {any} schema
     * @param {string[]} langs
     */
    function settingField(m, name, schema, langs) {
      const field = `settings.${m.key}.${name}`;
      const label = pick(schema['x-labels'], lang) || name;
      const help = [pick(schema['x-help'], lang), m.needs.includes(name) ? t('needed') : '']
        .filter(Boolean)
        .join(' ');
      const value = m.values[name];
      if (schema.enum) {
        const i = id(field);
        const select = /** @type {HTMLSelectElement} */ (
          h(
            'select',
            { class: 'a-input', id: i },
            ...schema.enum.map((/** @type {string} */ o) =>
              h(
                'option',
                { value: o, selected: (value ?? schema.default) === o },
                pick(schema['x-enumLabels']?.[o], lang) || o,
              ),
            ),
          )
        );
        settingReaders.push(() => [m.key, name, select.value]);
        return h(
          'div',
          { class: 'a-stack a-field' },
          h('label', { class: 'a-label', for: i }, label, select),
          help ? h('p', { class: 'a-muted a-help' }, help) : null,
          slot(field),
        );
      }
      if (schema.type === 'object') {
        const parts = langs
          .filter((l) => schema.properties?.[l])
          .map((l) => {
            const one = input(`${label} (${t(`lang_${l}`)})`, field, {
              value: value?.[l] ?? '',
              lang: l,
              dir: l === 'ar' ? 'rtl' : 'ltr',
              maxlength: schema.properties[l].maxLength ?? 200,
            });
            one.node.lastElementChild?.remove();
            return { l, one };
          });
        settingReaders.push(() => {
          /** @type {Record<string, string>} */
          const out = {};
          for (const { l, one } of parts) if (one.el.value.trim()) out[l] = one.el.value.trim();
          return [m.key, name, Object.keys(out).length ? out : ''];
        });
        return h(
          'div',
          { class: 'a-stack a-field' },
          ...parts.map((p) => p.one.node),
          help ? h('p', { class: 'a-muted a-help' }, help) : null,
          slot(field),
        );
      }
      const money = schema['x-format'] === 'money';
      const numeric = schema.type === 'integer' || schema.type === 'number';
      const one = input(
        money ? `${label} (DT)` : label,
        field,
        {
          value:
            value === undefined
              ? ''
              : money
                ? formatPrice(Number(value)).replace(/\s*DT$/, '')
                : String(value),
          inputmode: numeric ? 'decimal' : undefined,
          dir: 'ltr',
          ...(schema.type === 'string' && schema.pattern?.startsWith('^https')
            ? { type: 'url' }
            : {}),
          ...(schema.type === 'string' && schema.pattern?.startsWith('^\\+')
            ? { type: 'tel' }
            : {}),
        },
        help,
      );
      settingReaders.push(() => {
        const raw = one.el.value.trim();
        if (!raw) return [m.key, name, ''];
        if (money) return [m.key, name, parsePrice(raw) ?? raw];
        if (numeric) return [m.key, name, Number(raw.replace(',', '.'))];
        return [m.key, name, raw];
      });
      return one.node;
    }

    // ---- Saving ----
    const save = h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('save'));
    const form = h(
      'form',
      { class: 'a-stack', novalidate: true },
      h(
        'section',
        { class: 'a-card a-stack' },
        h('h2', { class: 'a-title' }, t('place')),
        ...address.map((a) => a.node),
        map.node,
        phone.node,
        social,
      ),
      h(
        'section',
        { class: 'a-card a-stack' },
        h('h2', { class: 'a-title' }, t('hours')),
        h('p', { class: 'a-muted a-help' }, t('hoursHelp')),
        ...hoursRows,
      ),
      h(
        'section',
        { class: 'a-card a-stack' },
        h('h2', { class: 'a-title' }, t('colours')),
        h('label', { class: 'a-label a-row', for: brand.id }, brand, t('brand')),
        h('label', { class: 'a-label a-row', for: useBrand.id }, useBrand, t('noButton')),
        h('label', { class: 'a-label a-row', for: button.id }, button, t('button')),
        h('p', { class: 'a-muted a-help' }, t('buttonHelp')),
        h('p', { class: 'a-label' }, t('preview')),
        preview,
        v.branding.theme ? h('p', { class: 'a-muted a-help' }, t('themeNote')) : null,
        advice,
        useIt,
        colourSlot,
      ),
      moduleBlocks.length
        ? h(
            'section',
            { class: 'a-card a-stack' },
            h('h2', { class: 'a-title' }, t('settings')),
            ...moduleBlocks,
          )
        : null,
      message,
      save,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      for (const p of slots.values()) p.hidden = true;
      say('');
      /** @type {Record<string, Record<string, unknown>>} */
      const settings = {};
      for (const read of settingReaders) {
        const [key, name, value] = read();
        (settings[key] ??= {})[name] = value;
      }
      const payload = {
        info: {
          address: Object.fromEntries(address.map((a, i) => [langs[i], a.el.value])),
          mapUrl: map.el.value,
          phone: phone.el.value,
          social: [...socialList.querySelectorAll('input')].map(
            (i) => /** @type {HTMLInputElement} */ (i).value,
          ),
        },
        hours: Object.fromEntries(DAYS.map((day) => [day, hoursOf[day]()])),
        branding: { ...branding(), ...(useBrand.checked ? { buttonColor: '' } : {}) },
        ...(Object.keys(settings).length ? { settings } : {}),
      };
      /** @type {HTMLButtonElement} */ (save).disabled = true;
      const res = await d.api('/info', { ...payload, cafe: d.cafe });
      /** @type {HTMLButtonElement} */ (save).disabled = false;
      if (res.status === 401) return d.signedOut();
      if (res.status === 422) {
        for (const p of res.data.problems ?? []) {
          const where =
            slots.get(p.field) ??
            (p.field.startsWith('branding.')
              ? colourSlot
              : slots.get(p.field.split('.').slice(0, 2).join('.')));
          if (!where) continue;
          where.textContent = t(p.code, { s: p.suggestion ?? '' });
          where.hidden = false;
        }
        say(t('fix'));
        return;
      }
      if (res.status !== 200) return say(t('error'));
      if (res.data.unchanged) return say(t('unchanged'), 'ok');
      await load();
      say(t('saved'), 'ok');
    });

    // ---- History: undo the last change, or go back to an earlier version ----
    /** @param {number} version */
    const restore = async (version) => {
      const res = await d.api('/info/restore', { cafe: d.cafe, version });
      if (res.status === 401) return d.signedOut();
      if (res.status !== 200) return say(t('error'));
      if (res.data.unchanged) return say(t('unchanged'), 'ok');
      await load();
      say(t('restored', { v: String(version) }), 'ok');
    };
    const last = v.history[0];
    const history = h(
      'section',
      { class: 'a-card a-stack' },
      h('h2', { class: 'a-title' }, t('history')),
      last
        ? h(
            'button',
            { type: 'button', class: 'a-btn', onclick: () => restore(last.version - 1) },
            t('undo'),
          )
        : null,
      ...(v.history.length
        ? v.history.map((/** @type {any} */ r, /** @type {number} */ i) =>
            h(
              'div',
              { class: 'a-row a-spread a-hist' },
              h(
                'p',
                null,
                h('strong', null, `v${r.version}`),
                ` · ${
                  r.restores
                    ? t('hRestore', { v: String(r.restores) })
                    : [
                        ...new Set(
                          r.fields.map((/** @type {string} */ f) => t(`f_${f.split('.')[0]}`)),
                        ),
                      ].join(', ')
                } · ${r.by ?? t('someone')}, ${when(r.at)}`,
              ),
              // The newest is what customers see; an older one can be brought back.
              i > 0
                ? h(
                    'button',
                    { type: 'button', class: 'a-btn', onclick: () => restore(r.version) },
                    t('restore'),
                  )
                : null,
            ),
          )
        : [h('p', { class: 'a-muted' }, t('noHistory'))]),
    );

    body.replaceChildren(h('p', { class: 'a-muted' }, t('intro')), form, history);
  }

  body.replaceChildren(h('p', { class: 'a-muted' }, '…'));
  load();
}
