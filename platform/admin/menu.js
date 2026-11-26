// @ts-check
/**
 * "Menu" in the staff app (issue #20, US-27, US-06, C-08; #11 before it).
 *
 * - Everyone (Staff included): mark an item or a variant sold out or available.
 * - Manager, Maintainer, Admin: prices, and the whole menu: categories, sub-groups, items and
 *   variants, in each of the café's languages; add, edit, move, hide, delete.
 * - The "Versions" card lists the recent changes (who, role, when, what) and brings back an
 *   earlier menu in one tap ("Annuler le dernier changement", "Revenir à cette version").
 *
 * Editing panels open one at a time under the thing they edit, so a long menu stays a list on
 * a phone. Prices: "4500" asks "4,500 DT or 4 500,000 DT?" before saving (D-045).
 * Server: platform/shell/src/menu-api.js (structure, versions), admin-api.js (sold out, price).
 */
import { parsePrice, formatPrice } from '../../core/money.js';

/** @type {Record<'fr' | 'ar', Record<string, string>>} */
export const MENU_TEXT = {
  fr: {
    intro:
      'Touchez « Modifier » pour changer un nom, un prix ou l’ordre. Les clients voient chaque changement d’ici une minute.',
    staffIntro: 'Cochez ou décochez « Disponible » quand un article est épuisé.',
    available: 'Disponible',
    edit: 'Modifier',
    close: 'Fermer',
    save: 'Enregistrer',
    saved: 'Enregistré',
    up: 'Monter',
    down: 'Descendre',
    delete: 'Supprimer',
    confirmDelete: 'Confirmer : supprimer',
    hidden: 'Masquée',
    visible: 'Visible pour les clients',
    title: 'Nom',
    subtitle: 'Sous-titre (facultatif)',
    description: 'Description (facultatif)',
    in: '{f} ({l})',
    lang_fr: 'français',
    lang_ar: 'arabe',
    lang_en: 'anglais',
    price: 'Prix (DT)',
    variant: 'Variante (facultatif, ex. « Grand »)',
    variants: 'Variantes et prix',
    group: 'Sous-groupe',
    moveTo: 'Ranger dans',
    addCategory: 'Ajouter une catégorie',
    addGroup: 'Ajouter un sous-groupe',
    addItem: 'Ajouter un article',
    addVariant: 'Ajouter une variante',
    untitled: 'Sans titre',
    priceAsk: '« {v} » : {a} ou {b} ?',
    priceBad: 'Prix non valable.',
    bad_text: 'Le nom en français est obligatoire (120 caractères au plus).',
    bad_price: 'Prix non valable.',
    not_empty: 'Videz-la d’abord (déplacez ou supprimez ses articles).',
    last_group: 'Une catégorie garde au moins un sous-groupe.',
    last_variant: 'Un article garde au moins un prix.',
    error: 'Une erreur est survenue. Réessayez.',
    versions: 'Versions',
    noVersions: 'Aucun changement pour le moment.',
    undo: 'Annuler le dernier changement',
    restore: 'Revenir à cette version',
    restored: 'Menu rétabli. Les clients le voient d’ici une minute.',
    someone: 'quelqu’un',
    r_manager: 'gérant',
    r_maintainer: 'maintenance',
    r_admin: 'admin',
    r_staff: 'équipe',
    e_category: 'Catégorie',
    e_group: 'Sous-groupe',
    e_item: 'Article',
    e_variant: 'Variante',
    e_menu: 'Menu',
    f_added: 'ajouté',
    f_deleted: 'supprimé',
    f_title: 'nom',
    f_name: 'nom',
    f_subtitle: 'sous-titre',
    f_description: 'description',
    f_visible: 'visibilité',
    f_available: 'disponibilité',
    f_price: 'prix',
    f_sort: 'ordre',
    f_group: 'rangement',
    f_restored: 'retour à la version {v}',
    yes: 'disponible',
    no: 'épuisé',
  },
  ar: {
    intro: 'اضغط «تعديل» لتغيير اسم أو سعر أو ترتيب. يرى الحرفاء كل تغيير خلال دقيقة.',
    staffIntro: 'ضع أو أزل علامة «متوفر» عند نفاد صنف.',
    available: 'متوفر',
    edit: 'تعديل',
    close: 'إغلاق',
    save: 'حفظ',
    saved: 'حُفظ',
    up: 'إلى الأعلى',
    down: 'إلى الأسفل',
    delete: 'حذف',
    confirmDelete: 'تأكيد: حذف',
    hidden: 'مخفية',
    visible: 'ظاهرة للحرفاء',
    title: 'الاسم',
    subtitle: 'عنوان فرعي (اختياري)',
    description: 'وصف (اختياري)',
    in: '{f} ({l})',
    lang_fr: 'الفرنسية',
    lang_ar: 'العربية',
    lang_en: 'الإنجليزية',
    price: 'السعر (DT)',
    variant: 'النوع (اختياري، مثلًا «كبير»)',
    variants: 'الأنواع والأسعار',
    group: 'مجموعة فرعية',
    moveTo: 'نقل إلى',
    addCategory: 'إضافة فئة',
    addGroup: 'إضافة مجموعة فرعية',
    addItem: 'إضافة صنف',
    addVariant: 'إضافة نوع',
    untitled: 'بدون عنوان',
    priceAsk: '«{v}»: {a} أو {b}؟',
    priceBad: 'سعر غير صالح.',
    bad_text: 'الاسم بالفرنسية إلزامي (120 حرفًا على الأكثر).',
    bad_price: 'سعر غير صالح.',
    not_empty: 'أفرغها أولًا (انقل أصنافها أو احذفها).',
    last_group: 'تحتفظ الفئة بمجموعة فرعية واحدة على الأقل.',
    last_variant: 'يحتفظ الصنف بسعر واحد على الأقل.',
    error: 'حدث خطأ. أعد المحاولة.',
    versions: 'النسخ',
    noVersions: 'لا تغييرات حتى الآن.',
    undo: 'إلغاء آخر تغيير',
    restore: 'الرجوع إلى هذه النسخة',
    restored: 'أُعيدت القائمة. يراها الحرفاء خلال دقيقة.',
    someone: 'شخص ما',
    r_manager: 'مسيّر',
    r_maintainer: 'صيانة',
    r_admin: 'إدارة',
    r_staff: 'فريق',
    e_category: 'فئة',
    e_group: 'مجموعة فرعية',
    e_item: 'صنف',
    e_variant: 'نوع',
    e_menu: 'القائمة',
    f_added: 'أضيف',
    f_deleted: 'حُذف',
    f_title: 'الاسم',
    f_name: 'الاسم',
    f_subtitle: 'العنوان الفرعي',
    f_description: 'الوصف',
    f_visible: 'الظهور',
    f_available: 'التوفر',
    f_price: 'السعر',
    f_sort: 'الترتيب',
    f_group: 'النقل',
    f_restored: 'رجوع إلى النسخة {v}',
    yes: 'متوفر',
    no: 'نفد',
  },
};

/**
 * @typedef {object} MenuDeps
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

/**
 * @param {HTMLElement} body
 * @param {MenuDeps} d
 */
export function menuView(body, d) {
  const { h, lang } = d;
  /** @param {string} key @param {Record<string, string>} [vars] */
  const t = (key, vars = {}) =>
    (MENU_TEXT[lang][key] ?? MENU_TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
      String(vars[k] ?? ''),
    );
  /** @param {any} text */
  const pick = (text) => (text ? text[lang] || text.fr || '' : '');
  /** The café's languages (from the menu answer). */
  let langs = ['fr'];
  /** What the café's modules store per item (#29): { <module>: { title, fields } }. */
  /** @type {Record<string, { title: any, fields: Record<string, any> }>} */
  let itemFields = {};
  let uid = 0;
  /** The panel open now (one at a time) and where to come back after a reload. */
  let openKey = '';

  /**
   * Inputs for a text in each of the café's languages.
   * @param {string} label @param {any} value @param {number} max
   */
  function texts(label, value, max) {
    const fields = langs.map((l) => {
      const id = `mn-${++uid}`;
      const el = /** @type {HTMLInputElement} */ (
        h('input', {
          class: 'a-input',
          id,
          value: value?.[l] ?? '',
          maxlength: max,
          lang: l,
          dir: l === 'ar' ? 'rtl' : 'ltr',
        })
      );
      return {
        l,
        el,
        node: h(
          'label',
          { class: 'a-label', for: id },
          langs.length > 1 ? t('in', { f: label, l: t(`lang_${l}`) }) : label,
          el,
        ),
      };
    });
    return {
      nodes: fields.map((f) => f.node),
      /** @returns {Record<string, string>} */
      read: () =>
        Object.fromEntries(fields.map((f) => [f.l, f.el.value.trim()]).filter(([, v]) => v)),
    };
  }

  /** A price input; `read` resolves "4500" by asking (D-045). @param {number | null} value */
  function priceInput(value) {
    const el = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'a-input a-input--price',
        inputmode: 'decimal',
        value: value === null ? '' : formatPrice(value).replace(/\s?DT$/, ''),
        'aria-label': t('price'),
      })
    );
    /**
     * @param {HTMLElement} note
     * @param {(millimes: number) => void} then
     */
    const read = (note, then) => {
      const parsed = parsePrice(el.value);
      if (parsed.ok) return then(parsed.millimes);
      if (parsed.reason === 'ambiguous' && parsed.choices) {
        const [a, b] = parsed.choices;
        note.replaceChildren(
          t('priceAsk', { v: el.value, a: formatPrice(a), b: formatPrice(b) }),
          ' ',
          h('button', { type: 'button', class: 'a-btn', onclick: () => then(a) }, formatPrice(a)),
          h('button', { type: 'button', class: 'a-btn', onclick: () => then(b) }, formatPrice(b)),
        );
        return;
      }
      note.textContent = t('priceBad');
    };
    return { el, read };
  }

  /**
   * Sends one change; on success the menu reloads with the same panel open.
   * @param {string} path @param {any} payload @param {HTMLElement} note @param {string} [keep]
   */
  async function send(path, payload, note, keep = openKey) {
    const res = await d.api(path, { cafe: d.cafe, ...payload });
    if (res.status === 401) return d.signedOut();
    if (res.status === 200) {
      openKey = keep;
      await load();
      return;
    }
    const code = res.data?.error;
    note.textContent = code && MENU_TEXT.fr[code] ? t(code) : t('error');
  }
  /** @param {any} op @param {HTMLElement} note @param {string} [keep] */
  const edit = (op, note, keep) => send('/menu/edit', op, note, keep);

  /** A delete button that asks a second tap. @param {() => void} go */
  function deleteButton(go) {
    let armed = false;
    const b = h(
      'button',
      {
        type: 'button',
        class: 'a-btn a-btn--danger',
        onclick: () => {
          if (!armed) {
            armed = true;
            b.textContent = t('confirmDelete');
            return;
          }
          go();
        },
      },
      t('delete'),
    );
    return b;
  }

  /**
   * A row of order and delete buttons.
   * @param {string} kind @param {string} id @param {HTMLElement} note @param {boolean} [canDelete]
   */
  const arrange = (kind, id, note, canDelete = true) =>
    h(
      'div',
      { class: 'a-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => edit({ op: `${kind}.move`, id, dir: -1 }, note),
        },
        t('up'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => edit({ op: `${kind}.move`, id, dir: 1 }, note),
        },
        t('down'),
      ),
      canDelete ? deleteButton(() => edit({ op: `${kind}.delete`, id }, note, '')) : null,
    );

  /**
   * An editing panel under a row, opened by its button ("Modifier", "Ajouter un article").
   * @param {string} key   unique, to reopen it after a reload
   * @param {() => HTMLElement[]} build
   * @param {string} [label]
   */
  function panel(key, build, label = t('edit')) {
    const holder = h('div', { class: 'a-panel', hidden: openKey !== key });
    if (openKey === key) holder.replaceChildren(...build());
    const button = h(
      'button',
      {
        type: 'button',
        class: 'a-btn a-btn--link',
        'aria-expanded': String(openKey === key),
        onclick: () => {
          const opening = holder.hidden;
          for (const other of body.querySelectorAll('.a-panel'))
            /** @type {HTMLElement} */ (other).hidden = true;
          for (const b of body.querySelectorAll('[aria-expanded="true"]')) {
            b.setAttribute('aria-expanded', 'false');
            b.textContent = /** @type {HTMLElement} */ (b).dataset.label ?? t('edit');
          }
          openKey = opening ? key : '';
          if (opening) holder.replaceChildren(...build());
          holder.hidden = !opening;
          button.setAttribute('aria-expanded', String(opening));
          button.textContent = opening ? t('close') : label;
        },
      },
      openKey === key ? t('close') : label,
    );
    button.dataset.label = label;
    return { button, holder };
  }

  /** @param {HTMLElement} el @param {string} id */
  const mark = (el, id) => (el.setAttribute('data-id', id), el);

  /**
   * @param {any} menu   the café's menu tree (staff view: hidden and sold-out included)
   * @param {boolean} editor
   */
  function draw(menu, editor) {
    const groupsAll = menu.categories.flatMap((/** @type {any} */ c) =>
      c.groups.map((/** @type {any} */ g) => ({
        id: g.id,
        label: `${pick(c.title)}${g.title ? ` › ${pick(g.title)}` : ''}`,
      })),
    );
    const nodes = [];
    for (const c of menu.categories) {
      const note = h('p', { class: 'a-muted', role: 'status' });
      const catPanel = editor
        ? panel(`c:${c.id}`, () => {
            const title = texts(t('title'), c.title, 120);
            const sub = texts(t('subtitle'), c.subtitle, 300);
            const visible = /** @type {HTMLInputElement} */ (
              h('input', { type: 'checkbox', checked: c.visible !== false })
            );
            const empty = c.groups.every((/** @type {any} */ g) => !g.items.length);
            return [
              ...title.nodes,
              ...sub.nodes,
              h('label', { class: 'a-switch' }, visible, t('visible')),
              h(
                'button',
                {
                  type: 'button',
                  class: 'a-btn a-btn--main',
                  onclick: () =>
                    edit(
                      {
                        op: 'category.update',
                        id: c.id,
                        title: title.read(),
                        subtitle: sub.read(),
                        visible: visible.checked,
                      },
                      note,
                    ),
                },
                t('save'),
              ),
              arrange('category', c.id, note, empty),
              h(
                'button',
                {
                  type: 'button',
                  class: 'a-btn',
                  onclick: () =>
                    edit({ op: 'group.add', categoryId: c.id, title: { fr: t('untitled') } }, note),
                },
                t('addGroup'),
              ),
              note,
            ];
          })
        : null;
      nodes.push(
        mark(
          h(
            'div',
            { class: 'a-row a-spread a-cathead' },
            h(
              'h2',
              { class: 'a-cat' },
              pick(c.title),
              c.visible === false ? h('span', { class: 'a-badge' }, t('hidden')) : null,
            ),
            catPanel?.button ?? null,
          ),
          c.id,
        ),
      );
      if (catPanel) nodes.push(catPanel.holder);

      for (const g of c.groups) {
        const gNote = h('p', { class: 'a-muted', role: 'status' });
        if (editor && (g.title || c.groups.length > 1)) {
          const gPanel = panel(`g:${g.id}`, () => {
            const title = texts(t('title'), g.title, 120);
            const desc = texts(t('description'), g.description, 300);
            return [
              ...title.nodes,
              ...desc.nodes,
              h(
                'button',
                {
                  type: 'button',
                  class: 'a-btn a-btn--main',
                  onclick: () =>
                    edit(
                      {
                        op: 'group.update',
                        id: g.id,
                        title: title.read(),
                        description: desc.read(),
                      },
                      gNote,
                    ),
                },
                t('save'),
              ),
              arrange('group', g.id, gNote, !g.items.length && c.groups.length > 1),
              gNote,
            ];
          });
          nodes.push(
            mark(
              h(
                'div',
                { class: 'a-row a-spread a-grouphead' },
                h('h3', { class: 'a-subtitle' }, pick(g.title) || t('untitled')),
                gPanel.button,
              ),
              g.id,
            ),
            gPanel.holder,
          );
        } else if (g.title) nodes.push(h('h3', { class: 'a-subtitle' }, pick(g.title)));

        for (const it of g.items) nodes.push(itemRow(it, g, editor, groupsAll));

        if (editor) {
          const addNote = h('p', { class: 'a-muted', role: 'status' });
          const add = panel(
            `add:${g.id}`,
            () => {
              const name = texts(t('title'), null, 120);
              const desc = texts(t('description'), null, 300);
              const variant = texts(t('variant'), null, 120);
              const price = priceInput(null);
              return [
                ...name.nodes,
                ...desc.nodes,
                h('label', { class: 'a-label' }, t('price'), price.el),
                ...variant.nodes,
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'a-btn a-btn--main',
                    onclick: () =>
                      price.read(addNote, (millimes) =>
                        edit(
                          {
                            op: 'item.add',
                            groupId: g.id,
                            name: name.read(),
                            description: desc.read(),
                            variant: variant.read(),
                            price: millimes,
                          },
                          addNote,
                          `add:${g.id}`,
                        ),
                      ),
                  },
                  t('addItem'),
                ),
                addNote,
              ];
            },
            t('addItem'),
          );
          add.button.classList.add('a-additem');
          nodes.push(add.button, add.holder);
        }
      }
    }

    if (editor) {
      const note = h('p', { class: 'a-muted', role: 'status' });
      const title = texts(t('title'), null, 120);
      nodes.push(
        h(
          'section',
          { class: 'a-card a-stack' },
          h('h2', { class: 'a-title' }, t('addCategory')),
          ...title.nodes,
          h(
            'button',
            {
              type: 'button',
              class: 'a-btn a-btn--main',
              onclick: () => edit({ op: 'category.add', title: title.read() }, note, ''),
            },
            t('addCategory'),
          ),
          note,
        ),
      );
    }
    return nodes;
  }

  /**
   * The item's fields from the café's modules (#29): a list of choices becomes boxes to tick,
   * named in the staff's language; saved on their own, as one change of the item.
   * @param {any} it
   */
  function moduleFields(it) {
    return Object.entries(itemFields).map(([key, m]) => {
      const mNote = h('p', { class: 'a-muted', role: 'status' });
      /** @type {Record<string, HTMLInputElement[]>} */
      const boxes = {};
      const sets = Object.entries(m.fields)
        .filter(([, f]) => f.type === 'array' && Array.isArray(f.items?.enum))
        .map(([name, f]) => {
          const have = new Set(it.ext?.[key]?.[name] ?? []);
          boxes[name] = f.items.enum.map(
            (/** @type {string} */ v) =>
              /** @type {HTMLInputElement} */ (
                h('input', { type: 'checkbox', value: v, checked: have.has(v) })
              ),
          );
          return h(
            'fieldset',
            { class: 'a-stack a-choices' },
            h('legend', { class: 'a-label' }, pick(f['x-labels']) || name),
            f['x-help'] ? h('p', { class: 'a-muted' }, pick(f['x-help'])) : null,
            ...boxes[name].map((box) =>
              h(
                'label',
                { class: 'a-check' },
                box,
                pick(f['x-enumLabels']?.[box.value]) || box.value,
              ),
            ),
          );
        });
      return h(
        'div',
        { class: 'a-stack a-variantedit', 'data-module': key },
        h('h4', { class: 'a-subtitle' }, pick(m.title) || key),
        ...sets,
        h(
          'button',
          {
            type: 'button',
            class: 'a-btn',
            onclick: () =>
              edit(
                {
                  op: 'item.update',
                  id: it.id,
                  ext: {
                    [key]: Object.fromEntries(
                      Object.entries(boxes).map(([name, list]) => [
                        name,
                        list.filter((b) => b.checked).map((b) => b.value),
                      ]),
                    ),
                  },
                },
                mNote,
              ),
          },
          t('save'),
        ),
        mNote,
      );
    });
  }

  /**
   * One item: name, availability, prices; for editors a panel with everything else.
   * @param {any} it @param {any} g @param {boolean} editor @param {{ id: string, label: string }[]} groups
   */
  function itemRow(it, g, editor, groups) {
    const item = mark(h('div', { class: 'a-item' }), it.id);
    const note = h('span', { class: 'a-muted', role: 'status' });
    const avail = /** @type {HTMLInputElement} */ (
      h('input', { type: 'checkbox', checked: it.available })
    );
    avail.addEventListener('change', () =>
      quick('/menu/item', { id: it.id, available: avail.checked }, note),
    );
    const itemPanel = editor
      ? panel(`i:${it.id}`, () => {
          const pNote = h('p', { class: 'a-muted', role: 'status' });
          const name = texts(t('title'), it.name, 120);
          const desc = texts(t('description'), it.description, 300);
          const where = /** @type {HTMLSelectElement} */ (
            h(
              'select',
              { class: 'a-input' },
              ...groups.map((x) => h('option', { value: x.id, selected: x.id === g.id }, x.label)),
            )
          );
          const variants = it.variants.map((/** @type {any} */ v) => {
            const vNote = h('p', { class: 'a-muted', role: 'status' });
            const vName = texts(t('variant'), v.name, 120);
            const price = priceInput(v.price);
            return h(
              'div',
              { class: 'a-stack a-variantedit' },
              ...vName.nodes,
              h('label', { class: 'a-label' }, t('price'), price.el),
              h(
                'button',
                {
                  type: 'button',
                  class: 'a-btn a-btn--main',
                  onclick: () =>
                    price.read(vNote, (millimes) =>
                      edit(
                        { op: 'variant.update', id: v.id, name: vName.read(), price: millimes },
                        vNote,
                      ),
                    ),
                },
                t('save'),
              ),
              arrange('variant', v.id, vNote, it.variants.length > 1),
              vNote,
            );
          });
          const newName = texts(t('variant'), null, 120);
          const newPrice = priceInput(null);
          const addNote = h('p', { class: 'a-muted', role: 'status' });
          return [
            ...name.nodes,
            ...desc.nodes,
            h('label', { class: 'a-label' }, t('moveTo'), where),
            h(
              'button',
              {
                type: 'button',
                class: 'a-btn a-btn--main',
                onclick: () =>
                  edit(
                    {
                      op: 'item.update',
                      id: it.id,
                      name: name.read(),
                      description: desc.read(),
                      ...(where.value !== g.id ? { groupId: where.value } : {}),
                    },
                    pNote,
                  ),
              },
              t('save'),
            ),
            arrange('item', it.id, pNote),
            pNote,
            ...moduleFields(it),
            h('h4', { class: 'a-subtitle' }, t('variants')),
            ...variants,
            h(
              'div',
              { class: 'a-stack a-variantedit' },
              ...newName.nodes,
              h('label', { class: 'a-label' }, t('price'), newPrice.el),
              h(
                'button',
                {
                  type: 'button',
                  class: 'a-btn',
                  onclick: () =>
                    newPrice.read(addNote, (millimes) =>
                      edit(
                        { op: 'variant.add', itemId: it.id, name: newName.read(), price: millimes },
                        addNote,
                      ),
                    ),
                },
                t('addVariant'),
              ),
              addNote,
            ),
          ];
        })
      : null;
    item.append(
      h(
        'div',
        { class: 'a-row a-spread' },
        h('strong', null, pick(it.name)),
        h(
          'div',
          { class: 'a-row' },
          h('label', { class: 'a-switch' }, avail, t('available')),
          itemPanel?.button ?? null,
        ),
      ),
    );
    for (const v of it.variants) {
      const vAvail = /** @type {HTMLInputElement} */ (
        h('input', { type: 'checkbox', checked: v.available })
      );
      const vNote = h('span', { class: 'a-muted', role: 'status' });
      vAvail.addEventListener('change', () =>
        quick('/menu/variant', { id: v.id, available: vAvail.checked }, vNote),
      );
      item.append(
        h(
          'div',
          { class: 'a-variant' },
          h('span', { class: 'a-variant-name' }, pick(v.name)),
          h('span', { class: 'a-price' }, formatPrice(v.price)),
          it.variants.length > 1 ? h('label', { class: 'a-switch' }, vAvail, t('available')) : null,
          vNote,
        ),
      );
    }
    item.append(note);
    if (itemPanel) item.append(itemPanel.holder);
    return item;
  }

  /** Sold out or available: saved at once, no reload. @param {string} path @param {any} payload @param {HTMLElement} note */
  async function quick(path, payload, note) {
    const res = await d.api(path, { cafe: d.cafe, ...payload });
    if (res.status === 401) return d.signedOut();
    note.textContent = res.status === 200 ? t('saved') : t('error');
  }

  /** The "Versions" card. @param {any} v */
  function versions(v) {
    const note = h('p', { class: 'a-muted', role: 'status' });
    /** @param {number} rev */
    const restore = async (rev) => {
      const res = await d.api('/menu/restore', { cafe: d.cafe, rev });
      if (res.status === 401) return d.signedOut();
      if (res.status !== 200) return (note.textContent = t('error'));
      openKey = '';
      await load();
      body.querySelector('.a-versions [role=status]')?.replaceChildren(t('restored'));
    };
    /** @param {any} c */
    const line = (c) => {
      const what = `${t(`e_${c.entity}`)} · ${t(`f_${c.field}`, { v: String(c.after) })}`;
      if (c.field === 'price')
        return `${what} : ${formatPrice(c.before)} → ${formatPrice(c.after)}`;
      if (c.field === 'available') return `${what} : ${c.after ? t('yes') : t('no')}`;
      const name =
        c.after && typeof c.after === 'object' ? pick(c.after.name ?? c.after) || '' : '';
      return name ? `${what} : ${name}` : what;
    };
    return h(
      'section',
      { class: 'a-card a-stack a-versions' },
      h('h2', { class: 'a-title' }, t('versions')),
      v.previous
        ? h(
            'button',
            { type: 'button', class: 'a-btn', onclick: () => restore(v.previous) },
            t('undo'),
          )
        : null,
      note,
      ...(v.versions.length
        ? v.versions.map((/** @type {any} */ r, /** @type {number} */ i) =>
            h(
              'div',
              { class: 'a-stack a-hist' },
              h(
                'p',
                null,
                h('strong', null, `v${r.rev}`),
                ` · ${r.by ?? t('someone')} (${t(`r_${r.role}`)}), ${when(r.at)}`,
              ),
              ...r.changes
                .slice(0, 4)
                .map((/** @type {any} */ c) => h('p', { class: 'a-muted' }, line(c))),
              r.changes.length > 4
                ? h('p', { class: 'a-muted' }, `+${r.changes.length - 4}`)
                : null,
              i > 0 && r.restorable
                ? h(
                    'button',
                    { type: 'button', class: 'a-btn', onclick: () => restore(r.rev) },
                    t('restore'),
                  )
                : null,
            ),
          )
        : [h('p', { class: 'a-muted' }, t('noVersions'))]),
    );
  }

  async function load() {
    const y = window.scrollY;
    const res = await d.api(`/menu?cafe=${encodeURIComponent(d.cafe)}`);
    if (res.status === 401) return d.signedOut();
    if (res.status !== 200) return body.replaceChildren(h('p', { class: 'a-error' }, t('error')));
    const editor = ['manager', 'maintainer', 'admin'].includes(res.data.role);
    langs = res.data.languages?.length ? res.data.languages : ['fr'];
    itemFields = res.data.itemFields ?? {};
    const v = editor ? await d.api(`/menu/versions?cafe=${encodeURIComponent(d.cafe)}`) : null;
    body.replaceChildren(
      h('p', { class: 'a-muted' }, editor ? t('intro') : t('staffIntro')),
      ...draw(res.data.menu, editor),
      ...(v?.status === 200 ? [versions(v.data)] : []),
    );
    window.scrollTo(0, y);
  }

  load();
}
