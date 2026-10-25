/**
 * Spike version of the café hub: one Durable Object per café that pushes messages to every
 * connected staff device over HIBERNATING WebSockets (platform/hub/README.md).
 *
 * What the spike must prove on the free plan:
 *   1. two browsers connected to the same café both receive a pushed message;
 *   2. after the hub has been idle long enough to hibernate (unloaded from memory), the
 *      sockets stay open and the next push still reaches both browsers.
 *
 * How we see that hibernation really happened: every time the object is (re)built, the
 * constructor adds 1 to a `wakes` counter in the object's own SQLite storage. If `wakes` goes up
 * between two pushes while the same sockets keep receiving, the object was unloaded and woken
 * again without dropping the connections.
 */
import { DurableObject } from 'cloudflare:workers';

export class CafeHub extends DurableObject {
  /**
   * @param {DurableObjectState} ctx
   * @param {unknown} env
   */
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)');
    sql.exec("INSERT INTO meta (k, v) VALUES ('wakes', 1) ON CONFLICT (k) DO UPDATE SET v = v + 1");
    // Keep-alive pings are answered by Cloudflare without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** @returns {number} */
  wakes() {
    const row = this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = 'wakes'").one();
    return Number(row.v);
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // acceptWebSocket (not server.accept()) is what lets the object hibernate.
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ joinedAt: Date.now() });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/push') && request.method === 'POST') {
      const text = (await request.text()).slice(0, 500);
      const message = JSON.stringify({ type: 'push', text, at: Date.now() });
      let delivered = 0;
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
          delivered += 1;
        } catch {
          // A socket that is closing: skip it.
        }
      }
      return Response.json({ delivered, wakes: this.wakes() });
    }

    if (url.pathname.endsWith('/stats')) {
      return Response.json({ wakes: this.wakes(), sockets: this.ctx.getWebSockets().length });
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * A staff device acknowledges a message (the real hub will mark orders as seen).
   * @param {WebSocket} socket
   * @param {string | ArrayBuffer} _message
   */
  async webSocketMessage(socket, _message) {
    socket.send(JSON.stringify({ type: 'ack', wakes: this.wakes() }));
  }

  /**
   * @param {WebSocket} socket
   * @param {number} code
   * @param {string} reason
   */
  async webSocketClose(socket, code, reason) {
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}
