// @ts-check
/**
 * An in-memory stand-in for Cloudflare D1, on Node's built-in SQLite, for tests and the local dev server. It
 * implements the calls the platform uses: prepare().bind().first() / .all() / .run(), batch(),
 * and exec() to load migrations and seed files.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIGRATIONS = fileURLToPath(new URL('../../platform/migrations/', import.meta.url));

/** @param {unknown} v */
const toSqlite = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  /** @param {string} sql @param {unknown[]} values */
  const statement = (sql, values = []) => {
    const stmt = () => db.prepare(sql);
    const params = () => /** @type {any[]} */ (values.map(toSqlite));
    return {
      /** @param {...unknown} v */
      bind: (...v) => statement(sql, v),
      first: async () => /** @type {any} */ (stmt().get(...params()) ?? null),
      all: async () => ({ results: /** @type {any[]} */ (stmt().all(...params())), success: true }),
      run: async () => {
        const r = stmt().run(...params());
        return {
          results: [],
          success: true,
          meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      },
      _sql: sql,
      _values: values,
    };
  };

  return {
    /** @param {string} sql */
    prepare: (sql) => statement(sql),
    /** @param {ReturnType<typeof statement>[]} statements */
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    /** @param {string} sql */
    exec: (sql) => db.exec(sql),
    /** Applies every migration in platform/migrations/, in order. */
    migrate() {
      for (const file of readdirSync(MIGRATIONS)
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort()) {
        db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
      }
      return this;
    },
  };
}
