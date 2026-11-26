// @ts-check
/**
 * The staff screen's live line to its café (issue #16, US-45): a WebSocket to the café hub
 * (platform/shell/src/cafe-hub.js). A push ("new order", "accepted by Sami", "paused") makes the
 * screen fetch the orders at once. If the line drops (sleep, lock, network), it comes back by
 * itself, a little later each time (1 s, 2 s, 5 s, 10 s, then every 30 s), and the screen fetches
 * what it missed. Where there is no hub (local dev server), the screen polls instead.
 *
 * Kept alive with "ping" every 30 s, answered by the hub without waking it.
 */

const RETRY = [1_000, 2_000, 5_000, 10_000, 30_000];
const PING_MS = 30_000;

/**
 * @typedef {object} Live
 * @property {() => boolean} connected
 * @property {() => void} wake    after sleep or lock: reconnect now if the line is down
 * @property {() => void} close
 */

/**
 * @param {string} cafe
 * @param {{ onEvent: (e: any) => void, onState: (connected: boolean) => void,
 *   socket?: (url: string) => WebSocket }} o
 * @returns {Live}
 */
export function connectLive(cafe, o) {
  const make = o.socket ?? ((url) => new WebSocket(url));
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/admin/api/live?cafe=${encodeURIComponent(cafe)}`;
  /** @type {WebSocket | null} */
  let ws = null;
  let up = false;
  let closed = false;
  let tries = 0;
  let timer = 0;
  let ping = 0;

  function open() {
    clearTimeout(timer);
    if (closed) return;
    let socket;
    try {
      socket = make(url);
    } catch {
      return retry();
    }
    ws = socket;
    socket.onopen = () => {
      tries = 0;
      up = true;
      o.onState(true);
      clearInterval(ping);
      ping = window.setInterval(() => {
        try {
          socket.send('ping');
        } catch {
          /* closing: onclose retries */
        }
      }, PING_MS);
    };
    socket.onmessage = (m) => {
      if (m.data === 'pong') return;
      try {
        o.onEvent(JSON.parse(String(m.data)));
      } catch {
        /* not ours */
      }
    };
    socket.onclose = () => {
      clearInterval(ping);
      if (ws !== socket) return;
      ws = null;
      if (up) o.onState(false);
      up = false;
      retry();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* nothing to close */
      }
    };
  }

  function retry() {
    if (closed) return;
    const wait = RETRY[Math.min(tries, RETRY.length - 1)];
    tries += 1;
    timer = window.setTimeout(open, wait);
  }

  open();
  return {
    connected: () => up,
    wake: () => {
      if (!up && !closed) {
        tries = 0;
        open();
      }
    },
    close: () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      const s = ws;
      ws = null;
      try {
        s?.close();
      } catch {
        /* already closed */
      }
    },
  };
}
