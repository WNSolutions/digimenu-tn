// @ts-check
/**
 * The static boot page's script: the same file for every café and table (ADR-0004).
 *
 *   1. Reads the café, table and check code from the printed link `/<café>/t/<table>?k=<code>`.
 *   2. Makes ONE call, `GET /api/boot`; the visit is counted inside that call (no beacon, no
 *      cookie). A first visit in this tab sends `nv=1`.
 *   3. Saves the answer on the phone (`dm:<café>:boot`). With no network, it uses the saved copy
 *      and the page says so.
 *   4. Loads the café's pinned release (CSS, then `start(boot)`). If the release fails to load,
 *      a minimal renderer still shows names and prices.
 *
 * Platform code: shared by every release, so it imports nothing from `core/` and stays small.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const RELEASE_FILE = /^\/r\/[0-9A-Za-z.-]+\/(?!.*\.\.)[0-9A-Za-z._/-]+\.(js|css)$/;
const TIMEOUT_MS = 8000;

/** Texts the boot page needs before any release is loaded. */
const TEXT = {
  fr: {
    loading: 'Chargement du menu…',
    badLink: 'Ce lien ne correspond à aucun menu. Scannez à nouveau le code de la table.',
    failed: 'Le menu ne se charge pas. Vérifiez votre connexion.',
    retry: 'Réessayer',
    simple: 'Affichage simplifié : noms et prix seulement.',
  },
  ar: {
    loading: 'جارٍ تحميل القائمة…',
    badLink: 'هذا الرابط لا يقود إلى أي قائمة. امسح رمز الطاولة من جديد.',
    failed: 'تعذّر تحميل القائمة. تحقّق من اتصالك.',
    retry: 'أعد المحاولة',
    simple: 'عرض مبسّط: الأسماء والأسعار فقط.',
  },
  en: {
    loading: 'Loading the menu…',
    badLink: 'This link does not lead to a menu. Scan the table code again.',
    failed: 'The menu does not load. Check your connection.',
    retry: 'Try again',
    simple: 'Simple view: names and prices only.',
  },
};

/** @typedef {'fr' | 'ar' | 'en'} Lang */
/** @typedef {{ cafe: string, table: string | null, code: string | null }} Link */

/**
 * Reads a printed link. `null` when the path is not a café page.
 * @param {string} pathname
 * @param {string} search
 * @returns {Link | null}
 */
export function parseLink(pathname, search) {
  const parts = pathname.split('/').filter(Boolean);
  const cafe = parts[0] ?? '';
  if (!SLUG.test(cafe)) return null;
  let table = null;
  if (parts[1] === 't' && parts[2]) {
    try {
      table = decodeURIComponent(parts[2]).trim().slice(0, 16) || null;
    } catch {
      table = null;
    }
  }
  const k = new URLSearchParams(search).get('k');
  return { cafe, table, code: k ? k.trim().slice(0, 16) : null };
}

/**
 * The `/api/boot` address for a link.
 * @param {Link} link
 * @param {{ lang?: string | null, newVisit?: boolean }} [options]
 */
export function bootUrl(link, options = {}) {
  const q = new URLSearchParams({ cafe: link.cafe });
  if (link.table) q.set('t', link.table);
  if (link.code) q.set('k', link.code);
  if (options.lang) q.set('lang', options.lang);
  if (options.newVisit) q.set('nv', '1');
  return `/api/boot?${q}`;
}

/**
 * Picks the boot page's own language before the café's settings are known.
 * @param {string | null} saved
 * @param {readonly string[]} phone
 * @returns {Lang}
 */
export function bootLanguage(saved, phone) {
  if (saved === 'fr' || saved === 'ar' || saved === 'en') return saved;
  for (const tag of phone) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'fr' || base === 'ar' || base === 'en') return base;
  }
  return 'fr';
}

/**
 * The saved copy to use when `/api/boot` cannot be reached. The table is kept only for the
 * same printed link, because a check code cannot be verified offline.
 * @param {string | null} raw   what localStorage holds
 * @param {Link} link
 * @param {number} now
 * @param {number} [maxAgeMs]   older copies are not used (prices may have changed)
 */
export function savedBoot(raw, link, now, maxAgeMs = 7 * 24 * 3_600_000) {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved?.savedAt !== 'number' || now - saved.savedAt > maxAgeMs) return null;
    if (saved.boot?.cafe?.slug !== link.cafe || !saved.boot.menu) return null;
    const same = saved.link?.table === link.table && saved.link?.code === link.code;
    return {
      ...saved.boot,
      table: same ? saved.boot.table : null,
      offline: { savedAt: saved.savedAt },
    };
  } catch {
    return null;
  }
}

/**
 * Price in millimes → "4,500 DT" (the release has the full version in core/money.js).
 * @param {number} millimes
 */
export function simplePrice(millimes) {
  const dinars = Math.floor(millimes / 1000);
  const rest = String(millimes % 1000).padStart(3, '0');
  return `${String(dinars).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')},${rest}\u00a0DT`;
}

/**
 * @param {Record<string, string> | undefined} text
 * @param {Lang} lang
 */
function pick(text, lang) {
  return text?.[lang] || text?.fr || '';
}

// ---------------------------------------------------------------------------------------------
// In the browser
// ---------------------------------------------------------------------------------------------

/** @param {Storage | null} s @param {string} key */
function read(s, key) {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** @param {Storage | null} s @param {string} key @param {string} value */
function write(s, key, value) {
  try {
    s?.setItem(key, value);
  } catch {
    /* storage full or blocked: the page still works, only offline reuse is lost */
  }
}

/** @param {() => Storage} get */
function storage(get) {
  try {
    return get();
  } catch {
    return null;
  }
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} url */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`boot ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} href */
function loadCss(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

/**
 * Names and prices only, when the release cannot load (overview: boot page).
 * @param {HTMLElement} root
 * @param {any} boot
 * @param {Lang} lang
 */
function minimalRender(root, boot, lang) {
  const wrap = el('main', 'dm-boot');
  wrap.append(el('h1', '', pick(boot.cafe.name, lang)), el('p', 'dm-boot-note', TEXT[lang].simple));
  for (const category of boot.menu.categories ?? []) {
    wrap.append(el('h2', '', pick(category.title, lang)));
    const list = el('ul', '');
    for (const group of category.groups ?? []) {
      for (const item of group.items ?? []) {
        for (const variant of item.variants ?? []) {
          const name = [pick(item.name, lang), pick(variant.name, lang)]
            .filter(Boolean)
            .join(' · ');
          const row = el('li', '', `${name} — `);
          const price = el('bdi', '', simplePrice(variant.price));
          row.append(price);
          list.append(row);
        }
      }
    }
    wrap.append(list);
  }
  root.replaceChildren(wrap);
}

/**
 * @param {HTMLElement} root
 * @param {string} message
 * @param {(() => void) | null} retry
 * @param {Lang} lang
 */
function showMessage(root, message, retry, lang) {
  const wrap = el('div', 'dm-boot');
  wrap.setAttribute('role', 'alert');
  wrap.append(el('p', '', message));
  if (retry) {
    const button = el('button', '', TEXT[lang].retry);
    button.setAttribute('type', 'button');
    button.addEventListener('click', retry);
    wrap.append(button);
  }
  root.replaceChildren(wrap);
}

async function main() {
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  const local = storage(() => window.localStorage);
  const session = storage(() => window.sessionStorage);
  const link = parseLink(location.pathname, location.search);
  const savedLang = link ? read(local, `dm:${link.cafe}:lang`) : null;
  const lang = bootLanguage(savedLang, navigator.languages ?? [navigator.language]);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (!link) return showMessage(root, TEXT[lang].badLink, null, lang);
  root.querySelector('[role="status"]')?.replaceChildren(TEXT[lang].loading);

  const seenKey = `dm:${link.cafe}:seen`;
  const newVisit = read(session, seenKey) === null;
  const bootKey = `dm:${link.cafe}:boot`;

  /** @type {any} */
  let boot;
  try {
    boot = await fetchJson(bootUrl(link, { lang: savedLang, newVisit }));
    write(session, seenKey, '1');
    write(local, bootKey, JSON.stringify({ savedAt: Date.now(), link, boot }));
  } catch {
    boot = savedBoot(read(local, bootKey), link, Date.now());
  }
  if (!boot) return showMessage(root, TEXT[lang].failed, () => location.reload(), lang);

  const release = boot.release ?? {};
  try {
    if (!RELEASE_FILE.test(release.entry ?? '') || !RELEASE_FILE.test(release.css ?? '')) {
      throw new Error('release files');
    }
    await loadCss(release.css);
    const mod = await import(release.entry);
    root.replaceChildren();
    mod.start(boot, { root });
  } catch {
    minimalRender(root, boot, lang);
  }
}

if (typeof document !== 'undefined') main();
