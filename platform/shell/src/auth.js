// @ts-check
/**
 * Sign-in for staff, managers and Admin (ADR-0006).
 *
 * The browser stretches the password (PBKDF2-SHA256, 600,000 iterations by default) and sends
 * only the derived key; the server keeps HMAC-SHA256(pepper, key). Sessions are 32 random bytes
 * in a host-only cookie; only their SHA-256 is stored. Roles are read on every request.
 */
import { json, problem } from './http.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';

const COOKIE = '__Host-dm_sid';
const DEFAULT_ITERATIONS = 600_000;
const IDLE_MS = 12 * 3_600_000;
const REMEMBER_MS = 90 * 24 * 3_600_000;
const enc = new TextEncoder();

/** @typedef {import('./d1.d.js').Env & { AUTH_PEPPER?: string }} AuthEnv */
/** @typedef {{ id: string, username: string, displayName: string, roles: { cafeId: string, role: string }[] }} Account */

/** @param {Uint8Array} b */
export const b64 = (b) => btoa(String.fromCharCode(...b));
/** @param {string} s */
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** @param {string} text */
export async function sha256(text) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

/** @param {AuthEnv} env */
async function pepperKey(env) {
  if (!env.AUTH_PEPPER) return null;
  return crypto.subtle.importKey(
    'raw',
    unb64(env.AUTH_PEPPER),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** @param {CryptoKey} key @param {string | Uint8Array} data */
async function hmac(key, data) {
  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      /** @type {BufferSource} */ (typeof data === 'string' ? enc.encode(data) : data),
    ),
  );
}

/** Constant-time comparison of two strings of equal length. @param {string} a @param {string} b */
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** State-changing calls: same origin and a JSON body only (ADR-0006, cross-site requests). */
export function sameOrigin(/** @type {Request} */ request) {
  const origin = request.headers.get('origin');
  return (
    origin === new URL(request.url).origin &&
    (request.headers.get('content-type') ?? '').startsWith('application/json')
  );
}

/** @param {Request} request */
async function body(request) {
  try {
    const text = await request.text();
    return text.length > 4096 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** Growing delay after 5 failures; no permanent lock for staff, disabled after 100. @param {number} failures */
export function lockFor(failures) {
  if (failures < 5) return 0;
  return Math.min(15 * 60_000, 10_000 * 2 ** (failures - 5));
}

/**
 * @param {AuthEnv} env
 * @param {string} userId
 * @param {boolean} remember
 * @param {Date} now
 */
async function newSession(env, userId, remember, now) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  const expires = new Date(now.getTime() + (remember ? REMEMBER_MS : IDLE_MS));
  await env.DB.prepare(
    `INSERT INTO sessions (token_sha256, user_id, remember, created_at, last_seen_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5)`,
  )
    .bind(await sha256(token), userId, remember ? 1 : 0, isoNow(now), isoNow(expires))
    .run();
  const maxAge = remember ? `; Max-Age=${REMEMBER_MS / 1000}` : '';
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/${maxAge}`;
}

/**
 * The signed-in account for a request, or null. Refreshes the idle timer.
 * @param {Request} request
 * @param {AuthEnv} env
 * @param {Date} [now]
 * @returns {Promise<Account | null>}
 */
export async function currentAccount(request, env, now = new Date()) {
  const cookie = request.headers.get('cookie') ?? '';
  const token = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token || token.length > 64) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.remember, s.expires_at, u.username, u.display_name, u.disabled_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_sha256 = ?1 AND s.revoked_at IS NULL`,
  )
    .bind(hash)
    .first();
  if (!row || row.disabled_at || String(row.expires_at) < isoNow(now)) return null;
  const expires = row.remember ? String(row.expires_at) : isoNow(new Date(now.getTime() + IDLE_MS));
  await env.DB.prepare(
    'UPDATE sessions SET last_seen_at = ?1, expires_at = ?2 WHERE token_sha256 = ?3',
  )
    .bind(isoNow(now), expires, hash)
    .run();
  const roles = (
    await env.DB.prepare('SELECT cafe_id, role FROM memberships WHERE user_id = ?1')
      .bind(row.user_id)
      .all()
  ).results.map((r) => ({ cafeId: String(r.cafe_id), role: String(r.role) }));
  return {
    id: String(row.user_id),
    username: String(row.username),
    displayName: String(row.display_name),
    roles,
  };
}

/**
 * The role an account has in a café ('admin' covers every café), or null.
 * @param {Account} account
 * @param {string} cafeId
 */
export function roleIn(account, cafeId) {
  if (account.roles.some((r) => r.role === 'admin')) return 'admin';
  return account.roles.find((r) => r.cafeId === cafeId)?.role ?? null;
}

/**
 * /admin/api/auth/*
 * @param {Request} request
 * @param {AuthEnv} env
 * @param {string} action
 * @param {Date} [now]
 */
export async function handleAuth(request, env, action, now = new Date()) {
  if (action === 'me') {
    const account = await currentAccount(request, env, now);
    return account ? json(200, account) : problem(401, 'signed_out');
  }
  if (request.method !== 'POST' || !sameOrigin(request)) return problem(403, 'forbidden');
  const pepper = await pepperKey(env);
  if (!pepper) return problem(503, 'auth_unavailable');
  const input = await body(request);
  const username = String(input?.username ?? '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username) && action !== 'sign-out')
    return problem(400, 'bad_request');

  if (action === 'salt') {
    const user = await env.DB.prepare('SELECT salt, iterations FROM users WHERE username = ?1')
      .bind(username)
      .first();
    // Unknown accounts get a stable fake salt, so the answer never reveals which exist.
    const salt = user?.salt
      ? String(user.salt)
      : b64((await hmac(pepper, `salt|${username}`)).slice(0, 16));
    return json(200, { salt, iterations: Number(user?.iterations ?? DEFAULT_ITERATIONS) });
  }

  if (action === 'sign-in') {
    const user = await env.DB.prepare(
      'SELECT id, password_hash, failed_count, locked_until, disabled_at FROM users WHERE username = ?1',
    )
      .bind(username)
      .first();
    if (user?.locked_until && String(user.locked_until) > isoNow(now)) return problem(429, 'wait');
    const key = String(input?.key ?? '');
    let ok = false;
    if (user?.password_hash && !user.disabled_at && key.length >= 40 && key.length <= 64) {
      const [, , , stored] = String(user.password_hash).split('$');
      ok = same(b64(await hmac(pepper, unb64(key))), stored);
    }
    if (!ok) {
      if (user) {
        const failures = Number(user.failed_count) + 1;
        const lock = lockFor(failures);
        await env.DB.prepare(
          'UPDATE users SET failed_count = ?1, locked_until = ?2, disabled_at = ?3 WHERE id = ?4',
        )
          .bind(
            failures,
            lock ? isoNow(new Date(now.getTime() + lock)) : null,
            failures >= 100 ? isoNow(now) : (user.disabled_at ?? null),
            user.id,
          )
          .run();
      }
      return problem(401, 'wrong_credentials');
    }
    await env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?1')
      .bind(user?.id)
      .run();
    const cookie = await newSession(env, String(user?.id), Boolean(input?.remember), now);
    return json(200, { ok: true }, { 'set-cookie': cookie });
  }

  if (action === 'setup') {
    // First password, or a reset: username + one-time code + the new stretched key.
    const code = String(input?.code ?? '')
      .trim()
      .toUpperCase();
    const salt = String(input?.salt ?? '');
    const iterations = Number(input?.iterations);
    const key = String(input?.key ?? '');
    if (
      !/^[A-Z0-9]{8,16}$/.test(code) ||
      salt.length < 16 ||
      !Number.isInteger(iterations) ||
      iterations < 310_000 ||
      key.length < 40
    ) {
      return problem(400, 'bad_request');
    }
    const user = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ?1 AND disabled_at IS NULL',
    )
      .bind(username)
      .first();
    const row = user
      ? await env.DB.prepare(
          `SELECT id, code_sha256, tries FROM reset_codes WHERE user_id = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY expires_at DESC LIMIT 1`,
        )
          .bind(user.id, isoNow(now))
          .first()
      : null;
    if (!user || !row || Number(row.tries) >= 5) return problem(401, 'wrong_code');
    if (!same(await sha256(code), String(row.code_sha256))) {
      await env.DB.prepare('UPDATE reset_codes SET tries = tries + 1 WHERE id = ?1')
        .bind(row.id)
        .run();
      return problem(401, 'wrong_code');
    }
    const hash = `pbkdf2c-sha256$${iterations}$${salt}$${b64(await hmac(pepper, unb64(key)))}$p1`;
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET password_hash = ?1, salt = ?2, iterations = ?3, must_change_password = 0, failed_count = 0, locked_until = NULL WHERE id = ?4',
      ).bind(hash, salt, iterations, user.id),
      env.DB.prepare('UPDATE reset_codes SET used_at = ?1 WHERE id = ?2').bind(isoNow(now), row.id),
      env.DB.prepare(
        'UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL',
      ).bind(isoNow(now), user.id),
      env.DB.prepare(
        `INSERT INTO audit_log (id, category, action, target, actor, actor_role, at) VALUES (?1, 'account', 'password_set', ?2, ?2, 'self', ?3)`,
      ).bind(ulid(now.getTime()), user.id, isoNow(now)),
    ]);
    const cookie = await newSession(env, String(user.id), Boolean(input?.remember), now);
    return json(200, { ok: true }, { 'set-cookie': cookie });
  }

  if (action === 'sign-out') {
    const cookie = request.headers.get('cookie') ?? '';
    const token = cookie
      .split(/;\s*/)
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (token) {
      await env.DB.prepare('UPDATE sessions SET revoked_at = ?1 WHERE token_sha256 = ?2')
        .bind(isoNow(now), await sha256(token))
        .run();
    }
    return json(
      200,
      { ok: true },
      { 'set-cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` },
    );
  }
  return problem(404, 'not_found');
}
