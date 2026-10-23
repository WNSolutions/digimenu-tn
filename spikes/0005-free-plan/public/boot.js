/**
 * Boot script of the static table page. The page is the same file for every table link, so it
 * reads the café and table from the address, fetches the menu and renders it with the same
 * function the Worker uses at the edge.
 */
import { renderMenu } from './render.js';

const app = /** @type {HTMLElement} */ (document.getElementById('app'));
const match = /^\/([a-z0-9-]{1,40})\/t\/([A-Za-z0-9-]{1,10})\/?$/.exec(location.pathname);

/** @param {string} text */
function showError(text) {
  app.replaceChildren(
    Object.assign(document.createElement('p'), { className: 'error', textContent: text }),
  );
}

async function boot() {
  if (!match) {
    showError('Lien de table invalide.');
    return;
  }
  const [, cafe, table] = match;
  const lang = new URLSearchParams(location.search).get('lang');
  const response = await fetch(`/api/${cafe}/menu`);
  if (!response.ok) {
    showError('Carte introuvable.');
    return;
  }
  const menu = await response.json();
  const chosen = lang === 'ar' || lang === 'en' ? lang : 'fr';
  document.documentElement.lang = chosen;
  document.documentElement.dir = chosen === 'ar' ? 'rtl' : 'ltr';
  // renderMenu escapes every text that comes from the database.
  app.innerHTML = renderMenu(menu.items, { cafeName: menu.cafe.name, table, lang: chosen });
}

boot().catch(() => showError('Connexion impossible. Réessayez.'));
