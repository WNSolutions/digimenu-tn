// @ts-check
/**
 * Customer page entry point (release code). The static boot page calls `/api/boot`, then
 * imports this file from the café's pinned release and calls `start(boot)`.
 */
import { SPRITE } from '../ui/icons.js';
import { chooseLanguage } from '../i18n.js';
import { indexSnapshot } from '../menu/snapshot.js';
import { loadList, saveList, checkList, DEFAULT_MAX_AGE_MS } from '../list.js';
import { langParts } from './context.js';
import { renderPage } from './page.js';
import { h } from './dom.js';

/** @typedef {import('./context.js').Boot} Boot */
/** @typedef {import('./context.js').Ctx} Ctx */

/**
 * @param {Boot} boot
 * @param {{ root?: HTMLElement, storage?: Storage | null, now?: () => Date }} [env]
 */
export function start(boot, env = {}) {
  const root = env.root ?? /** @type {HTMLElement} */ (document.getElementById('app'));
  const storage = env.storage === undefined ? safeStorage() : env.storage;
  const now = env.now ?? (() => new Date());
  const cafe = boot.cafe;
  const langKey = `dm:${cafe.slug}:lang`;

  // Icons, café colour, glass bars (solid on low-memory phones, foundations §3.2).
  if (!document.getElementById('dm-sprite')) {
    const holder = h('div', { id: 'dm-sprite', hidden: true });
    holder.innerHTML = SPRITE; // a constant from the release, never café or customer data
    document.body.prepend(holder);
  }
  for (const [prop, value] of Object.entries(cafe.accent ?? {})) {
    if (/^--dm-cafe-[a-z-]+$/.test(prop) && /^#[0-9a-f]{6}$/i.test(value)) {
      document.documentElement.style.setProperty(prop, value);
    }
  }
  const memory = /** @type {any} */ (navigator).deviceMemory;
  if (!(typeof memory === 'number' && memory <= 2))
    document.documentElement.setAttribute('data-dm-glass', '');

  const live = h('div', { class: 'dm-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.appendChild(live);

  let saved = null;
  try {
    saved = storage?.getItem(langKey) ?? null;
  } catch {
    /* no storage */
  }
  const index = indexSnapshot(boot.menu);
  const maxAge = (cafe.listMaxAgeHours ?? DEFAULT_MAX_AGE_MS / 3_600_000) * 3_600_000;

  /** @type {Ctx} */
  const ctx = /** @type {any} */ ({
    boot,
    index,
    list: loadList(storage, cafe.slug, Date.now(), maxAge),
    now,
    ...langParts(
      chooseLanguage(cafe.languages, saved, navigator.languages ?? [navigator.language]),
    ),
  });
  let checkedFor = /** @type {unknown} */ (null);
  let checked = checkList(ctx.list, index);
  ctx.check = () => {
    if (checkedFor !== ctx.list) {
      checked = checkList(ctx.list, index);
      checkedFor = ctx.list;
    }
    return checked;
  };
  /** @type {() => void} */
  let refreshList = () => {};

  ctx.setList = (list) => {
    ctx.list = list;
    saveList(storage, cafe.slug, list, Date.now());
    refreshList();
  };
  ctx.announce = (message) => {
    live.textContent = '';
    setTimeout(() => (live.textContent = message), 50);
  };
  ctx.setLang = (lang) => {
    try {
      storage?.setItem(langKey, lang);
    } catch {
      /* no storage: the choice lasts for this visit */
    }
    const anchorCat = document.querySelector('.dm-chip.is-current')?.getAttribute('data-cat');
    const y = window.scrollY;
    Object.assign(ctx, langParts(lang));
    draw();
    // Same category, same place (components §3).
    const section = anchorCat
      ? document.querySelector(`section[data-cat="${CSS.escape(anchorCat)}"]`)
      : null;
    if (section && y > 0) section.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, y);
  };

  function draw() {
    document.documentElement.lang = ctx.lang;
    document.documentElement.dir = ctx.dir;
    document.title = ctx.pick(cafe.name).text;
    refreshList = renderPage(root, ctx);
  }
  draw();
  return ctx;
}

/** localStorage, or null when the browser refuses it (private mode, blocked site data). */
function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('dm:probe', '1');
    s.removeItem('dm:probe');
    return s;
  } catch {
    return null;
  }
}
