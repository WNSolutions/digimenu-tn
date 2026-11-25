#!/usr/bin/env node
// @ts-check
/**
 * Creates a staff, manager, maintainer or Admin account (ADR-0006) as SQL, with a one-time
 * setup code. The person opens the staff app, chooses "Première connexion", and sets their own
 * password with the code; the password never passes through this tool.
 *
 *   node tools/accounts/account.js --username sami --name "Sami" --role staff --cafe demo --out acc.sql
 *
 * Prints the setup code once on stdout (the deploy workflow shows it only in the run summary).
 * A second run for the same username issues a new code (a reset).
 */
import { writeFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sql } from '../seed/seed.js';

const ALPHABET = 'ACDEFHJKMNPRTVWXY34679';
const ROLES = ['admin', 'manager', 'staff', 'maintainer'];

/** @param {number} [length] */
export function setupCode(length = 10) {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * @param {{ username: string, name: string, role: string, cafe?: string, code: string, now?: Date }} o
 */
export function accountSql({ username, name, role, cafe, code, now = new Date() }) {
  if (!/^[a-z0-9._-]{3,40}$/.test(username))
    throw new Error('username: 3-40 lower-case letters, digits, . _ -');
  if (!ROLES.includes(role)) throw new Error(`role: one of ${ROLES.join(', ')}`);
  if (role !== 'admin' && !cafe) throw new Error('--cafe is required except for admin');
  const at = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const expires = new Date(now.getTime() + 7 * 24 * 3_600_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const codeHash = createHash('sha256').update(code).digest('base64');
  const cafeId = role === 'admin' ? '' : `cafe-${cafe}`;
  return (
    [
      `INSERT INTO users (id, username, display_name, created_at) VALUES (${sql(`u-${randomUUID()}`)}, ${sql(username)}, ${sql(name)}, ${sql(at)}) ON CONFLICT (username) DO UPDATE SET display_name = excluded.display_name;`,
      `INSERT INTO memberships (user_id, cafe_id, role) SELECT id, ${sql(cafeId)}, ${sql(role)} FROM users WHERE username = ${sql(username)} ON CONFLICT (user_id, cafe_id) DO UPDATE SET role = excluded.role;`,
      `UPDATE reset_codes SET used_at = ${sql(at)} WHERE used_at IS NULL AND user_id = (SELECT id FROM users WHERE username = ${sql(username)});`,
      `INSERT INTO reset_codes (id, user_id, code_sha256, created_by, expires_at) SELECT ${sql(`rc-${randomUUID()}`)}, id, ${sql(codeHash)}, 'tools/accounts', ${sql(expires)} FROM users WHERE username = ${sql(username)};`,
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at) VALUES (${sql(`al-${randomUUID()}`)}, 'account', 'setup_code', ${sql(cafeId || null)}, ${sql(username)}, 'tools/accounts', 'admin', ${sql(at)});`,
    ].join('\n') + '\n'
  );
}

function run() {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      cafe: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.username || !values.name || !values.role || !values.out) {
    process.stdout.write(
      'Usage: node tools/accounts/account.js --username <u> --name <display name> --role <role> [--cafe <slug>] --out <file.sql>\n',
    );
    process.exitCode = 1;
    return;
  }
  const code = setupCode();
  writeFileSync(
    values.out,
    accountSql({
      username: values.username,
      name: values.name,
      role: values.role,
      cafe: values.cafe,
      code,
    }),
  );
  process.stdout.write(`${code}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    run();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  }
}
