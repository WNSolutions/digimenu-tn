// @ts-check
/**
 * Responses of the platform API. Customer hosts set no cookies (ADR-0004); API answers are never
 * cached by browsers and never sniffed.
 */

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

/**
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

/**
 * An error the customer page can act on: a stable code, never a stack trace.
 * @param {number} status
 * @param {string} code
 */
export function problem(status, code) {
  return json(status, { error: code });
}
