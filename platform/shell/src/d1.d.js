// @ts-check
/**
 * The small part of Cloudflare's D1 and Workers types this code uses, written out so the type
 * checker needs no extra dependency. They match the Workers runtime (compatibility date in
 * platform/wrangler.template.jsonc).
 */

/**
 * @typedef {object} D1Result
 * @property {Record<string, unknown>[]} results
 * @property {boolean} success
 * @property {{ changes?: number, last_row_id?: number }} [meta]
 */

/**
 * @typedef {object} D1PreparedStatement
 * @property {(...values: unknown[]) => D1PreparedStatement} bind
 * @property {<T = Record<string, unknown>>() => Promise<T | null>} first
 * @property {() => Promise<D1Result>} all
 * @property {() => Promise<D1Result>} run
 */

/**
 * @typedef {object} D1Database
 * @property {(sql: string) => D1PreparedStatement} prepare
 * @property {(statements: D1PreparedStatement[]) => Promise<D1Result[]>} batch
 */

/**
 * @typedef {object} Env
 * @property {D1Database} DB
 * @property {{ fetch: (request: Request) => Promise<Response> }} ASSETS
 * @property {string} [ENVIRONMENT]   "preview" or "production"
 * @property {string} [ADMIN_HOST]    host name of the staff app (production)
 * @property {string} [ADMIN_ON_MAIN_HOST]   "1" on preview: staff app under /admin on the one host
 * @property {string} [AUTH_PEPPER]   Worker secret (ADR-0006)
 * @property {string} [FIELD_KEY]     Worker secret (ADR-0010)
 * @property {string} [LOOKUP_KEY]    Worker secret (ADR-0010)
 * @property {string} [KEY_VERSION]
 */

/** @typedef {{ waitUntil: (promise: Promise<unknown>) => void }} ExecutionContext */

export {};
