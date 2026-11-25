// @ts-check
/**
 * The staff app: sign-in (password stretched here, ADR-0006), the orders screen with "Reçue"
 * for WhatsApp orders (#45), the menu editor for prices and sold-out (#11), and a tab for each
 * switched-on module that has a staff panel (staff.panel, e.g. Fidélité).
 * Plain DOM, text set with textContent only.
 */
import { parsePrice, formatPrice } from '../../core/money.js';
import { STAFF_MODULES } from './staff-modules.js';
import { staffTexts } from './staff-api.js';
import { scanQr } from './scanner.js';
import { customersView, CUSTOMER_TEXT } from './customers.js';

const API = '/admin/api';
const POLL_MS = 10_000;

/** @type {Record<string, Record<string, string>>} */
const TEXT = {
  fr: {
    signIn: 'Connexion',
    username: "Nom d'utilisateur",
    password: 'Mot de passe',
    remember: 'Se souvenir de cet appareil',
    signInBtn: 'Se connecter',
    firstTime: 'Première connexion ou code reçu',
    code: 'Code reçu',
    newPassword: 'Nouveau mot de passe (10 caractères au moins)',
    confirm: 'Confirmer le mot de passe',
    setBtn: 'Choisir mon mot de passe',
    back: 'Retour',
    wrong: "Nom d'utilisateur ou mot de passe incorrect.",
    wrongCode: 'Code incorrect ou expiré. Demandez un nouveau code.',
    wait: 'Trop d’essais. Réessayez dans quelques minutes.',
    mismatch: 'Les deux mots de passe ne sont pas identiques.',
    short: '10 caractères au moins.',
    working: 'Vérification…',
    orders: 'Commandes',
    menu: 'Carte',
    signOut: 'Se déconnecter',
    sound: 'Activer le son',
    soundOn: 'Son activé',
    none: "Pas encore de commande aujourd'hui.",
    table: 'Table {t}',
    takeaway: 'À emporter',
    whatsapp: 'WhatsApp',
    received: 'Reçue',
    notReceived: 'Pas reçue',
    accept: 'Accepter',
    reject: 'Refuser',
    ready: 'Prête',
    served: 'Servie',
    st_received: 'Nouvelle',
    st_handoff: 'WhatsApp · à confirmer',
    st_accepted: 'Acceptée',
    st_ready: 'Prête',
    st_served: 'Servie',
    st_rejected: 'Refusée',
    st_unconfirmed: 'Pas reçue',
    total: 'Total',
    available: 'Disponible',
    save: 'Enregistrer',
    saved: 'Enregistré',
    priceAsk: '« {v} » : {a} ou {b} ?',
    priceBad: 'Prix non valable.',
    offline: 'Connexion perdue. Nouvel essai…',
    noAccess: "Ce compte n'a accès à aucun café.",
    cafe: 'Café',
    error: 'Une erreur est survenue. Réessayez.',
    scanTitle: 'Scanner un QR code',
    scanHint: 'Placez le QR code dans le cadre.',
    scanCancel: 'Annuler',
    scanDenied:
      "La caméra n'est pas disponible. Autorisez-la dans le navigateur, ou tapez le numéro.",
  },
  ar: {
    signIn: 'تسجيل الدخول',
    username: 'اسم المستخدم',
    password: 'كلمة السر',
    remember: 'تذكّر هذا الجهاز',
    signInBtn: 'دخول',
    firstTime: 'أول دخول أو رمز مُستلم',
    code: 'الرمز المُستلم',
    newPassword: 'كلمة سر جديدة (10 أحرف على الأقل)',
    confirm: 'أكّد كلمة السر',
    setBtn: 'اختر كلمة السر',
    back: 'رجوع',
    wrong: 'اسم المستخدم أو كلمة السر غير صحيحة.',
    wrongCode: 'رمز خاطئ أو منتهي. اطلب رمزًا جديدًا.',
    wait: 'محاولات كثيرة. أعد بعد بضع دقائق.',
    mismatch: 'كلمتا السر غير متطابقتين.',
    short: '10 أحرف على الأقل.',
    working: 'جارٍ التحقق…',
    orders: 'الطلبات',
    menu: 'القائمة',
    signOut: 'خروج',
    sound: 'تفعيل الصوت',
    soundOn: 'الصوت مفعّل',
    none: 'لا طلبات اليوم بعد.',
    table: 'الطاولة {t}',
    takeaway: 'للأخذ',
    whatsapp: 'واتساب',
    received: 'وصلت',
    notReceived: 'لم تصل',
    accept: 'قبول',
    reject: 'رفض',
    ready: 'جاهزة',
    served: 'قُدّمت',
    st_received: 'جديدة',
    st_handoff: 'واتساب · للتأكيد',
    st_accepted: 'مقبولة',
    st_ready: 'جاهزة',
    st_served: 'قُدّمت',
    st_rejected: 'مرفوضة',
    st_unconfirmed: 'لم تصل',
    total: 'المجموع',
    available: 'متوفر',
    save: 'حفظ',
    saved: 'حُفظ',
    priceAsk: '«{v}»: {a} أو {b}؟',
    priceBad: 'سعر غير صالح.',
    offline: 'انقطع الاتصال. إعادة المحاولة…',
    noAccess: 'هذا الحساب لا يصل إلى أي مقهى.',
    cafe: 'المقهى',
    error: 'حدث خطأ. أعد المحاولة.',
    scanTitle: 'مسح رمز QR',
    scanHint: 'ضع رمز QR داخل الإطار.',
    scanCancel: 'إلغاء',
    scanDenied: 'الكاميرا غير متاحة. اسمح بها في المتصفح، أو اكتب الرقم.',
  },
};
let lang = (navigator.language || 'fr').startsWith('ar') ? 'ar' : 'fr';
try {
  const saved = localStorage.getItem('dm:admin:lang');
  if (saved === 'fr' || saved === 'ar') lang = saved;
} catch {
  /* private mode */
}
/** @param {string} key @param {Record<string, string | number>} [vars] */
const t = (key, vars = {}) =>
  (TEXT[lang][key] ?? TEXT.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]
 * @param {...(Node | string | null | undefined | false)} children
 */
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

const app = /** @type {HTMLElement} */ (document.getElementById('app'));
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

/**
 * @param {string} path
 * @param {any} [body]
 */
async function api(path, body) {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const b64 = (/** @type {Uint8Array} */ b) => btoa(String.fromCharCode(...b));
const unb64 = (/** @type {string} */ s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The slow part of the password check, on this device (ADR-0006). */
async function stretch(
  /** @type {string} */ password,
  /** @type {string} */ salt,
  /** @type {number} */ iterations,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations },
    key,
    256,
  );
  return b64(new Uint8Array(bits));
}

function langSwitch() {
  return h(
    'button',
    {
      type: 'button',
      class: 'a-btn a-btn--link',
      onclick: () => {
        try {
          localStorage.setItem('dm:admin:lang', lang === 'fr' ? 'ar' : 'fr');
        } catch {
          /* ignore */
        }
        location.reload();
      },
    },
    lang === 'fr' ? 'عربي' : 'Français',
  );
}

function signInView() {
  const username = h('input', {
    class: 'a-input',
    id: 'u',
    autocomplete: 'username',
    autocapitalize: 'none',
    required: true,
  });
  const password = h('input', {
    class: 'a-input',
    id: 'p',
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const remember = h('input', { type: 'checkbox', id: 'r' });
  const msg = h('p', { class: 'a-error', role: 'alert', hidden: true });
  const button = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('signInBtn'))
  );
  const form = h(
    'form',
    { class: 'a-card a-stack' },
    h('h1', { class: 'a-title' }, t('signIn')),
    h('label', { class: 'a-label', for: 'u' }, t('username'), username),
    h('label', { class: 'a-label', for: 'p' }, t('password'), password),
    h('label', { class: 'a-check', for: 'r' }, remember, t('remember')),
    msg,
    button,
    h('button', { type: 'button', class: 'a-btn a-btn--link', onclick: setupView }, t('firstTime')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    button.disabled = true;
    button.textContent = t('working');
    try {
      const user = /** @type {HTMLInputElement} */ (username).value.trim().toLowerCase();
      const salt = await api('/auth/salt', { username: user });
      if (salt.status !== 200) throw new Error(salt.data.error);
      const key = await stretch(
        /** @type {HTMLInputElement} */ (password).value,
        salt.data.salt,
        salt.data.iterations,
      );
      const res = await api('/auth/sign-in', {
        username: user,
        key,
        remember: /** @type {HTMLInputElement} */ (remember).checked,
      });
      if (res.status === 200) return start();
      msg.textContent = t(res.data.error === 'wait' ? 'wait' : 'wrong');
    } catch {
      msg.textContent = t('error');
    }
    msg.hidden = false;
    button.disabled = false;
    button.textContent = t('signInBtn');
  });
  app.replaceChildren(
    h(
      'main',
      { class: 'a-wrap a-stack' },
      h('div', { class: 'a-row a-spread' }, h('strong', null, 'DigiMenu'), langSwitch()),
      form,
    ),
  );
}

function setupView() {
  const username = h('input', {
    class: 'a-input',
    id: 'su',
    autocomplete: 'username',
    autocapitalize: 'none',
    required: true,
  });
  const code = h('input', {
    class: 'a-input',
    id: 'sc',
    autocomplete: 'one-time-code',
    autocapitalize: 'characters',
    required: true,
  });
  const pw = h('input', {
    class: 'a-input',
    id: 'sp',
    type: 'password',
    autocomplete: 'new-password',
    required: true,
    minlength: 10,
  });
  const pw2 = h('input', {
    class: 'a-input',
    id: 'sp2',
    type: 'password',
    autocomplete: 'new-password',
    required: true,
    minlength: 10,
  });
  const msg = h('p', { class: 'a-error', role: 'alert', hidden: true });
  const button = /** @type {HTMLButtonElement} */ (
    h('button', { type: 'submit', class: 'a-btn a-btn--main' }, t('setBtn'))
  );
  const form = h(
    'form',
    { class: 'a-card a-stack' },
    h('h1', { class: 'a-title' }, t('firstTime')),
    h('label', { class: 'a-label', for: 'su' }, t('username'), username),
    h('label', { class: 'a-label', for: 'sc' }, t('code'), code),
    h('label', { class: 'a-label', for: 'sp' }, t('newPassword'), pw),
    h('label', { class: 'a-label', for: 'sp2' }, t('confirm'), pw2),
    msg,
    button,
    h('button', { type: 'button', class: 'a-btn a-btn--link', onclick: signInView }, t('back')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = /** @type {HTMLInputElement} */ (pw).value;
    if (p1.length < 10) return show('short');
    if (p1 !== /** @type {HTMLInputElement} */ (pw2).value) return show('mismatch');
    button.disabled = true;
    button.textContent = t('working');
    try {
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const iterations = 600_000;
      const key = await stretch(p1, salt, iterations);
      const res = await api('/auth/setup', {
        username: /** @type {HTMLInputElement} */ (username).value.trim().toLowerCase(),
        code: /** @type {HTMLInputElement} */ (code).value.trim().toUpperCase(),
        salt,
        iterations,
        key,
      });
      if (res.status === 200) return start();
      show(res.data.error === 'wrong_code' ? 'wrongCode' : 'error');
    } catch {
      show('error');
    }
    button.disabled = false;
    button.textContent = t('setBtn');
  });
  /** @param {string} key */
  function show(key) {
    msg.textContent = t(key);
    msg.hidden = false;
  }
  app.replaceChildren(h('main', { class: 'a-wrap a-stack' }, form));
}

/**
 * @type {{ me: any, cafe: string, view: string, timer: number, known: Set<string>,
 *   audio: AudioContext | null, panels: { key: string, label: string, render: (root: HTMLElement) => void }[],
 *   admin: boolean, cafes: { slug: string, name: any, role: string }[] }}
 *   view: 'orders', 'menu' or 'm:<module>'
 */
const state = {
  me: null,
  cafe: '',
  view: 'orders',
  timer: 0,
  known: new Set(),
  audio: null,
  panels: [],
  admin: false,
  cafes: [],
};

/** The staff panels of the modules this café switched on. */
async function loadPanels() {
  const res = await api(`/cafe?cafe=${encodeURIComponent(state.cafe)}`);
  if (res.status !== 200) return [];
  const panels = [];
  for (const key of res.data.modules ?? []) {
    const mod = Object.hasOwn(STAFF_MODULES, key) ? STAFF_MODULES[key] : null;
    if (!mod?.panel) continue;
    try {
      const panel = mod.panel({
        key,
        lang: /** @type {'fr' | 'ar'} */ (lang),
        t: staffTexts(mod.texts[/** @type {'fr' | 'ar'} */ (lang)] ?? {}, mod.texts.fr),
        h,
        call: (route, body = {}) => api(`/m/${key}/${route}`, { ...body, cafe: state.cafe }),
        role: res.data.role,
        price: formatPrice,
        scan: () =>
          scanQr(h, {
            title: t('scanTitle'),
            hint: t('scanHint'),
            cancel: t('scanCancel'),
            denied: t('scanDenied'),
          }),
      });
      if (panel) panels.push({ key, ...panel });
    } catch (err) {
      console.error(`module ${key}: staff panel failed`, err);
    }
  }
  return panels;
}

async function start() {
  const me = await api('/auth/me');
  if (me.status !== 200) return signInView();
  state.me = me.data;
  // The cafés this account works in; Admin sees every café and the Clients tab.
  const list = await api('/cafes');
  state.cafes = list.status === 200 ? list.data.cafes : [];
  state.admin = list.status === 200 && list.data.admin === true;
  const fromUrl = new URLSearchParams(location.search).get('cafe');
  state.cafe = state.cafes.some((c) => c.slug === fromUrl)
    ? /** @type {string} */ (fromUrl)
    : (state.cafes[0]?.slug ?? '');
  if (!state.cafe) {
    app.replaceChildren(
      h('main', { class: 'a-wrap' }, h('p', { class: 'a-error' }, t('noAccess'))),
    );
    return;
  }
  state.panels = await loadPanels();
  render();
}

function beep() {
  if (!state.audio) return;
  const o = state.audio.createOscillator();
  const g = state.audio.createGain();
  o.frequency.value = 880;
  g.gain.value = 0.2;
  o.connect(g).connect(state.audio.destination);
  o.start();
  o.stop(state.audio.currentTime + 0.35);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function topBar() {
  const tab = (/** @type {string} */ v, /** @type {string} */ label) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(state.view === v),
        onclick: () => {
          state.view = v;
          render();
        },
      },
      label,
    );
  const sound = h(
    'button',
    {
      type: 'button',
      class: 'a-btn',
      onclick: () => {
        state.audio = state.audio ?? new AudioContext();
        beep();
        sound.textContent = t('soundOn');
      },
    },
    state.audio ? t('soundOn') : t('sound'),
  );
  return h(
    'header',
    { class: 'a-top' },
    h(
      'div',
      { class: 'a-wrap a-row a-spread' },
      h(
        'div',
        { class: 'a-tabs', role: 'group' },
        tab('orders', t('orders')),
        tab('menu', t('menu')),
        ...state.panels.map((p) => tab(`m:${p.key}`, p.label)),
        state.admin ? tab('customers', CUSTOMER_TEXT[lang].tab) : null,
      ),
      h(
        'div',
        { class: 'a-row' },
        state.cafes.length > 1 ? cafeSwitch() : null,
        sound,
        langSwitch(),
        h(
          'button',
          {
            type: 'button',
            class: 'a-btn a-btn--link',
            onclick: async () => {
              await api('/auth/sign-out', {});
              signInView();
            },
          },
          t('signOut'),
        ),
      ),
    ),
  );
}

/** For people who work in more than one café (and Admin): which café is on screen. */
function cafeSwitch() {
  const select = /** @type {HTMLSelectElement} */ (
    h(
      'select',
      {
        class: 'a-input a-input--cafe',
        'aria-label': t('cafe'),
        onchange: async () => {
          state.cafe = select.value;
          state.known = new Set();
          state.panels = await loadPanels();
          if (state.view.startsWith('m:') && !state.panels.some((p) => `m:${p.key}` === state.view))
            state.view = 'orders';
          render();
        },
      },
      ...state.cafes.map((c) =>
        h('option', { value: c.slug, selected: c.slug === state.cafe }, pick(c.name) || c.slug),
      ),
    )
  );
  return select;
}

function render() {
  clearTimeout(state.timer);
  const body = h('main', { class: 'a-wrap a-stack' });
  app.replaceChildren(topBar(), body);
  if (state.view === 'orders') ordersView(body);
  else if (state.view === 'menu') menuView(body);
  else if (state.view === 'customers' && state.admin) {
    customersView(body, {
      h,
      lang: /** @type {'fr' | 'ar'} */ (lang),
      api,
      cafes: state.cafes,
      price: formatPrice,
      signedOut: signInView,
    });
  } else {
    const panel = state.panels.find((p) => `m:${p.key}` === state.view);
    try {
      panel?.render(body);
    } catch (err) {
      console.error(`module ${panel?.key}: staff panel failed`, err);
      body.replaceChildren(h('p', { class: 'a-error' }, t('error')));
    }
  }
}

/** @param {any} text */
const pick = (text) => (text ? text[lang] || text.fr || '' : '');

/** @param {HTMLElement} body */
async function ordersView(body) {
  const res = await api(`/orders?cafe=${encodeURIComponent(state.cafe)}`);
  if (res.status === 401) return signInView();
  if (res.status !== 200) {
    body.replaceChildren(h('p', { class: 'a-error' }, t('offline')));
  } else {
    const orders = res.data.orders;
    let fresh = false;
    for (const o of orders) {
      if (!state.known.has(o.id) && state.known.size) fresh = true;
    }
    const firstLoad = state.known.size === 0;
    body.replaceChildren(
      ...(orders.length
        ? orders.map((/** @type {any} */ o) => orderCard(o, !firstLoad && !state.known.has(o.id)))
        : [h('p', { class: 'a-muted' }, t('none'))]),
    );
    for (const o of orders) state.known.add(o.id);
    if (fresh) beep();
  }
  if (state.view === 'orders' && !document.hidden)
    state.timer = window.setTimeout(() => ordersView(body), POLL_MS);
}

/** @param {any} o @param {boolean} isNew */
function orderCard(o, isNew) {
  const time = new Date(o.createdAt).toLocaleTimeString(lang === 'ar' ? 'ar-TN' : 'fr-TN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    numberingSystem: 'latn',
  });
  /** @param {string} status @param {string} label @param {string} [cls] */
  const act = (status, label, cls = 'a-btn') =>
    h(
      'button',
      {
        type: 'button',
        class: cls,
        onclick: async (/** @type {Event} */ e) => {
          /** @type {HTMLButtonElement} */ (e.currentTarget).disabled = true;
          await api('/orders/status', { cafe: state.cafe, id: o.id, status });
          render();
        },
      },
      label,
    );
  /** @type {Record<string, Node[]>} */
  const actions = {
    handoff: [
      act('accepted', t('received'), 'a-btn a-btn--main'),
      act('unconfirmed', t('notReceived')),
    ],
    received: [
      act('accepted', t('accept'), 'a-btn a-btn--main'),
      act('rejected', t('reject'), 'a-btn a-btn--danger'),
    ],
    accepted: [act('ready', t('ready')), act('served', t('served'), 'a-btn a-btn--main')],
    ready: [act('served', t('served'), 'a-btn a-btn--main')],
    unconfirmed: [act('accepted', t('received'))],
  };
  return h(
    'article',
    { class: `a-card a-order${isNew ? ' is-new' : ''}` },
    h(
      'div',
      { class: 'a-row a-spread' },
      h('span', { class: 'a-number' }, o.number),
      h(
        'span',
        { class: 'a-row' },
        o.channel === 'whatsapp_handoff'
          ? h('span', { class: 'a-badge a-badge--wa' }, t('whatsapp'))
          : null,
        h('span', { class: 'a-badge' }, t(`st_${o.status}`)),
      ),
    ),
    h(
      'div',
      { class: 'a-row a-spread' },
      h('strong', null, o.table ? t('table', { t: o.table }) : t('takeaway')),
      h(
        'span',
        { class: 'a-muted' },
        `${time}${o.contact?.firstName ? ' · ' + o.contact.firstName : ''}${o.contact?.phone ? ' · ' + o.contact.phone : ''}`,
      ),
    ),
    h(
      'ul',
      { class: 'a-lines' },
      ...o.lines.map((/** @type {any} */ l) =>
        h(
          'li',
          null,
          h(
            'span',
            null,
            `${l.qty} × ${[pick(l.name), pick(l.variantName)].filter(Boolean).join(' · ')}${l.note ? ` — ${l.note}` : ''}`,
          ),
          h('bdi', null, formatPrice(l.total)),
        ),
      ),
    ),
    o.note ? h('p', { class: 'a-note' }, o.note) : null,
    h(
      'div',
      { class: 'a-row a-spread' },
      h('strong', null, `${t('total')} ${formatPrice(o.total)}`),
      h('div', { class: 'a-row' }, ...(actions[o.status] ?? [])),
    ),
  );
}

/** @param {HTMLElement} body */
async function menuView(body) {
  const res = await api(`/menu?cafe=${encodeURIComponent(state.cafe)}`);
  if (res.status === 401) return signInView();
  if (res.status !== 200) return body.replaceChildren(h('p', { class: 'a-error' }, t('error')));
  const canPrice = ['manager', 'admin'].includes(res.data.role);
  const nodes = [];
  for (const c of res.data.menu.categories) {
    nodes.push(h('h2', { class: 'a-cat' }, pick(c.title)));
    for (const g of c.groups) {
      for (const it of g.items) {
        const item = h('div', { class: 'a-item' });
        const itemAvail = h('input', { type: 'checkbox', checked: it.available });
        itemAvail.addEventListener('change', () =>
          save(
            '/menu/item',
            { id: it.id, available: /** @type {HTMLInputElement} */ (itemAvail).checked },
            item,
          ),
        );
        item.append(
          h(
            'div',
            { class: 'a-row a-spread' },
            h('strong', null, pick(it.name)),
            h('label', { class: 'a-switch' }, itemAvail, t('available')),
          ),
        );
        for (const v of it.variants) {
          const price = h('input', {
            class: 'a-input a-input--price',
            inputmode: 'decimal',
            value: formatPrice(v.price).replace(/\s?DT$/, ''),
            disabled: !canPrice,
            'aria-label': `${pick(it.name)} ${pick(v.name)}`,
          });
          const avail = h('input', { type: 'checkbox', checked: v.available });
          const note = h('span', { class: 'a-muted', role: 'status' });
          avail.addEventListener('change', () =>
            save(
              '/menu/variant',
              { id: v.id, available: /** @type {HTMLInputElement} */ (avail).checked },
              note,
            ),
          );
          const saveBtn = h(
            'button',
            {
              type: 'button',
              class: 'a-btn',
              hidden: !canPrice,
              onclick: () => savePrice(v.id, /** @type {HTMLInputElement} */ (price).value, note),
            },
            t('save'),
          );
          item.append(
            h(
              'div',
              { class: 'a-variant' },
              h('span', { class: 'a-variant-name' }, pick(v.name)),
              price,
              saveBtn,
              h('label', { class: 'a-switch' }, avail, t('available')),
              note,
            ),
          );
        }
        nodes.push(item);
      }
    }
  }
  body.replaceChildren(...nodes);
}

/** @param {string} id @param {string} text @param {HTMLElement} note */
async function savePrice(id, text, note) {
  const parsed = parsePrice(text);
  if (parsed.ok) return save('/menu/variant', { id, price: parsed.millimes }, note);
  if (parsed.reason === 'ambiguous' && parsed.choices) {
    // A whole number such as 4500: ask which one (D-045).
    const [a, b] = parsed.choices;
    note.replaceChildren(
      t('priceAsk', { v: text, a: formatPrice(a), b: formatPrice(b) }),
      ' ',
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => save('/menu/variant', { id, price: a }, note),
        },
        formatPrice(a),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'a-btn',
          onclick: () => save('/menu/variant', { id, price: b }, note),
        },
        formatPrice(b),
      ),
    );
    return;
  }
  note.textContent = t('priceBad');
}

/** @param {string} path @param {any} body @param {HTMLElement} note */
async function save(path, body, note) {
  const res = await api(path, { cafe: state.cafe, ...body });
  if (res.status === 401) return signInView();
  note.textContent = res.status === 200 ? t('saved') : t('error');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.me && state.view === 'orders') render();
});

start().catch(() => signInView());
