/**
 * Test page for the café hub: connects to the demo café's hub over a WebSocket, shows every
 * pushed message and can push one. Text is shown with textContent, never as HTML.
 */
const CAFE = 'demo';
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const log = /** @type {HTMLElement} */ (document.getElementById('log'));
const send = /** @type {HTMLButtonElement} */ (document.getElementById('send'));

/** @param {string} text */
function addLine(text) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString('fr-TN')} · ${text}`;
  log.prepend(item);
}

function connect() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${scheme}://${location.host}/api/${CAFE}/hub`);
  socket.addEventListener('open', () => {
    status.textContent = 'Connecté.';
  });
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(String(event.data));
      if (data.type === 'push') addLine(`Reçu : ${data.text}`);
    } catch {
      // Not a JSON message (for example "pong"): ignore it.
    }
  });
  socket.addEventListener('close', () => {
    status.textContent = 'Déconnecté. Nouvelle tentative dans 3 s…';
    setTimeout(connect, 3000);
  });
}

send.addEventListener('click', async () => {
  const text = `Commande test ${Math.floor(Math.random() * 90) + 10}`;
  const response = await fetch(`/api/${CAFE}/hub/push`, { method: 'POST', body: text });
  const result = await response.json();
  addLine(`Envoyé à ${result.delivered} appareil(s)`);
});

connect();
