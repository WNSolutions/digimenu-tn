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
 */

/** @typedef {{ waitUntil: (promise: Promise<unknown>) => void }} ExecutionContext */

export {};
