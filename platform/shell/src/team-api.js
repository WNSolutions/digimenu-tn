// @ts-check
/**
 * Accounts of a café (issue #18, ADR-0006, D-026): who works there, new accounts, password
 * resets, disabling. Checked on the server for every request:
 *
 *   GET  /admin/api/team?cafe=<slug>                         Manager (own café), Admin
 *   POST /admin/api/team/create  { cafe, username, name, role }   Manager: staff only; Admin: any café role
 *   POST /admin/api/team/reset   { cafe, userId }             Manager: staff of own café; Admin: anyone
 *   POST /admin/api/team/disable { cafe, userId }             same as reset
 *   POST /admin/api/team/enable  { cafe, userId }             same as reset
 *   POST /admin/api/team/role    { cafe, userId, role }       Admin only
 *
 * A new account or a reset gives a one-time code (shown once, to hand over in person); the
 * person chooses their own password with it ("Première connexion"). Nobody ever sees a
 * password. A reset also erases the old password and signs the account out everywhere.
 * Every creation, reset, role change, disable and enable is in the audit log.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin, sha256 } from './auth.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';

const CODE_ALPHABET = 'ACDEFHJKMNPRTVWXY34679';
const CREATE_HOURS = 72;
const RESET_HOURS = 24;
const CAFE_ROLES = ['manager', 'staff', 'maintainer'];
const USERNAME = /^[a-z0-9._-]{3,40}$/;

/** @typedef {import('./auth.js').AuthEnv} TeamEnv */

function newCode() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
  ).join('');
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const text = await request.text();
    return text.length > 2048 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {TeamEnv} env
 * @param {string} route   "team" or "team/<action>"
 * @param {Date} [now]
 */
export async function handleTeam(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  const input = write ? await readBody(request) : null;
  if (write && !input) return problem(400, 'bad_request');
  const slug = write
    ? String(input.cafe ?? '')
    : (new URL(request.url).searchParams.get('cafe') ?? '');
  const cafe = await env.DB.prepare('SELECT id FROM cafes WHERE slug = ?1').bind(slug).first();
  if (!cafe) return problem(404, 'unknown_cafe');
  const cafeId = String(cafe.id);
  const role = roleIn(account, cafeId);
  if (role !== 'manager' && role !== 'admin') return problem(403, 'forbidden');
  const admin = role === 'admin';

  /** @param {string} action  e.g. "create:staff", "role:staff>manager" @param {string} target */
  const audit = (action, target) =>
    env.DB.prepare(
      `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at)
       VALUES (?1, 'account', ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(ulid(now.getTime()), action, cafeId, target, account.id, role, isoNow(now));

  if (route === 'team' && !write) return json(200, { team: await members(env, cafeId, now), role });

  if (route === 'team/create' && write) {
    const username = String(input.username ?? '')
      .trim()
      .toLowerCase();
    const name = String(input.name ?? '').trim();
    const newRole = String(input.role ?? 'staff');
    if (!USERNAME.test(username) || name.length < 1 || name.length > 60)
      return problem(400, 'bad_request');
    if (!CAFE_ROLES.includes(newRole)) return problem(400, 'bad_request');
    if (!admin && newRole !== 'staff') return problem(403, 'forbidden');
    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?1')
      .bind(username)
      .first();
    if (taken) return problem(409, 'username_taken');
    const userId = `u-${crypto.randomUUID()}`;
    const code = newCode();
    const expires = new Date(now.getTime() + CREATE_HOURS * 3_600_000);
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, username, display_name, created_at) VALUES (?1, ?2, ?3, ?4)',
      ).bind(userId, username, name, isoNow(now)),
      env.DB.prepare('INSERT INTO memberships (user_id, cafe_id, role) VALUES (?1, ?2, ?3)').bind(
        userId,
        cafeId,
        newRole,
      ),
      env.DB.prepare(
        'INSERT INTO reset_codes (id, user_id, code_sha256, created_by, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(ulid(now.getTime()), userId, await sha256(code), account.id, isoNow(expires)),
      audit(`create:${newRole}`, userId),
    ]);
    return json(201, { userId, username, code, expiresAt: isoNow(expires) });
  }

  const targetId = String(input?.userId ?? '');
  const target = await env.DB.prepare(
    `SELECT u.id, u.disabled_at, m.role FROM users u JOIN memberships m ON m.user_id = u.id
      WHERE u.id = ?1 AND m.cafe_id = ?2`,
  )
    .bind(targetId, cafeId)
    .first();
  if (!target) return problem(404, 'unknown_account');
  // A Manager manages the Staff of their own café only; Admin manages everyone in the café.
  if (!admin && target.role !== 'staff') return problem(403, 'forbidden');
  if (target.id === account.id) return problem(409, 'not_yourself');

  if (route === 'team/reset' && write) {
    const code = newCode();
    const expires = new Date(now.getTime() + RESET_HOURS * 3_600_000);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE reset_codes SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL',
      ).bind(isoNow(now), targetId),
      env.DB.prepare(
        'INSERT INTO reset_codes (id, user_id, code_sha256, created_by, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(ulid(now.getTime()), targetId, await sha256(code), account.id, isoNow(expires)),
      // The old password stops working and every device is signed out.
      env.DB.prepare(
        'UPDATE users SET password_hash = NULL, must_change_password = 1, failed_count = 0, locked_until = NULL WHERE id = ?1',
      ).bind(targetId),
      env.DB.prepare(
        'UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL',
      ).bind(isoNow(now), targetId),
      audit('reset', targetId),
    ]);
    return json(200, { code, expiresAt: isoNow(expires) });
  }

  if ((route === 'team/disable' || route === 'team/enable') && write) {
    const disable = route === 'team/disable';
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET disabled_at = ?1 WHERE id = ?2').bind(
        disable ? isoNow(now) : null,
        targetId,
      ),
      ...(disable
        ? [
            env.DB.prepare(
              'UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL',
            ).bind(isoNow(now), targetId),
          ]
        : []),
      audit(disable ? 'disable' : 'enable', targetId),
    ]);
    return json(200, { team: await members(env, cafeId, now) });
  }

  if (route === 'team/role' && write) {
    if (!admin) return problem(403, 'forbidden');
    const newRole = String(input.role ?? '');
    if (!CAFE_ROLES.includes(newRole)) return problem(400, 'bad_request');
    await env.DB.batch([
      env.DB.prepare('UPDATE memberships SET role = ?1 WHERE user_id = ?2 AND cafe_id = ?3').bind(
        newRole,
        targetId,
        cafeId,
      ),
      audit(`role:${target.role}>${newRole}`, targetId),
    ]);
    return json(200, { team: await members(env, cafeId, now) });
  }

  return problem(404, 'not_found');
}

/**
 * The café's accounts (not Admin's), with their state.
 * @param {TeamEnv} env
 * @param {string} cafeId
 * @param {Date} now
 */
async function members(env, cafeId, now) {
  const rows = (
    await env.DB.prepare(
      `SELECT u.id, u.username, u.display_name, u.disabled_at, u.password_hash IS NOT NULL AS has_password,
              m.role,
              (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen,
              (SELECT MAX(expires_at) FROM reset_codes r WHERE r.user_id = u.id AND r.used_at IS NULL AND r.expires_at > ?2) AS code_until
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE m.cafe_id = ?1 ORDER BY m.role, u.display_name`,
    )
      .bind(cafeId, isoNow(now))
      .all()
  ).results;
  return rows.map((r) => ({
    id: String(r.id),
    username: String(r.username),
    name: String(r.display_name),
    role: String(r.role),
    disabled: Boolean(r.disabled_at),
    hasPassword: Boolean(r.has_password),
    codeUntil: r.code_until ? String(r.code_until) : null,
    lastSeen: r.last_seen ? String(r.last_seen) : null,
  }));
}
