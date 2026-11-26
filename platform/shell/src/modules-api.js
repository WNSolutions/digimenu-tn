// @ts-check
/**
 * Module switches and the kill switch (issue #21, US-29, MOD-05, MOD-06, MOD-16, C-09).
 *
 *   GET  /admin/api/modules?cafe=<slug>                 Manager (to see), Maintainer, Admin
 *   POST /admin/api/modules/switch  { cafe, key, on }   see "Who may switch"
 *   POST /admin/api/modules/decide  { cafe, version, approve }   Admin: a Maintainer's request
 *   GET  /admin/api/modules/notices                     Admin: what others changed, 14 days
 *
 * Who may switch (docs/architecture/modules.md, ADR-0008 §8):
 * - **Off** (the kill switch): a Maintainer of the café at once, or Admin. Admin sees what a
 *   Maintainer switched off in the staff app (`notices`).
 * - **On** at a live café: Admin. A Maintainer's "on" waits as a request until Admin approves.
 * - **On** at a demo or onboarding café: a Maintainer or Admin (setting the café up).
 * - A **paid** module (manifest `externalService.paid`): Admin only, with the café's written
 *   agreement (MOD-18).
 * - A Manager sees the switches and asks Admin; Staff do not see them.
 *
 * Switching on checks the café's pinned release has the module, its `requires` /
 * `requiresAnyOf` are on and nothing it conflicts with is on; a refusal names what is missing.
 * Switching off also switches off the modules that need it, and says which. Every change is a
 * new configuration version: who, when, and what changed (`change`). Nothing is deleted: a
 * module's stored data stays for when it is switched on again. This Worker uses the new
 * version at once; the others within 30 s (cafes.js), well inside the 10 minutes asked.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin } from './auth.js';
import { resolveCafe } from './cafes.js';
import { releaseManifest } from './releases.js';
import { missingNeeds } from './module-needs.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';
import { MODULE_CATALOG } from './module-catalog.js';
import { activeVersion, writeVersion } from './config-versions.js';

/**
 * What the catalogue knows about a module (from its manifest, tools/modules/registry.js).
 * @typedef {object} CatalogEntry
 * @property {string} id
 * @property {Record<string, string>} title
 * @property {Record<string, string> | null} summary
 * @property {string} version
 * @property {string} stability
 * @property {string[]} requires
 * @property {string[]} requiresAnyOf
 * @property {string[]} conflicts
 * @property {string[]} needs
 * @property {boolean} paid
 * @property {boolean} client     has customer code (so must be in the café's release)
 * @property {string} customerRecords
 * @property {Record<string, SettingSchema>} settings   the settings schema's properties
 * @property {Record<string, SettingSchema>} itemFields   what the module stores per item (#29)
 */

/**
 * One setting as its module's settings schema describes it (the subset the editor handles;
 * other keywords may be present).
 * @typedef {object} SettingSchema
 * @property {'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array'} [type]
 * @property {unknown} [default]
 * @property {SettingSchema} [items]      for an array: what each entry is
 * @property {boolean} [uniqueItems]
 * @property {number} [maxItems]
 * @property {Record<string, SettingSchema>} [properties]
 * @property {string[]} [required]
 * @property {boolean} [additionalProperties]
 * @property {Record<string, string>} [x-labels]   the field's name for staff (fr, ar)
 * @property {Record<string, string>} [x-help]     one line of help for staff (fr, ar)
 * @property {'money'} [x-format]                  an amount in millimes, edited in DT
 * @property {Record<string, Record<string, string>>} [x-enumLabels]   a name for each choice
 * @property {number} [maxLength]
 * @property {number} [minLength]
 * @property {string} [pattern]
 * @property {unknown[]} [enum]
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {string} [description]
 */

/** @typedef {{ key: string, on: boolean, also?: string[], approves?: number }} Change */
/** @typedef {import('./auth.js').AuthEnv & { ASSETS: { fetch: (r: Request) => Promise<Response> } }} ModulesEnv */

const SEE = ['manager', 'maintainer', 'admin'];
const KEY = /^[a-z][a-z0-9_]{1,31}$/;
const NOTICE_DAYS = 14;

/**
 * Whether a switch is allowed by the modules themselves (dependencies, conflicts, release).
 * Roles are checked by the caller.
 * @param {any} config   the café's active configuration
 * @param {string} key
 * @param {boolean} on
 * @param {{ catalog?: Record<string, CatalogEntry>, inRelease?: (key: string) => boolean }} [o]
 * @returns {{ error: string, detail?: Record<string, unknown> } | { also: string[] }}
 */
export function checkSwitch(config, key, on, o = {}) {
  const catalog = o.catalog ?? MODULE_CATALOG;
  const mod = Object.hasOwn(catalog, key) ? catalog[key] : null;
  if (!mod) return { error: 'unknown_module' };
  const enabled = (/** @type {string} */ k) => config?.modules?.[k]?.enabled === true;
  if (!on) {
    // The kill switch always works; modules that need this one go off with it.
    const also = Object.entries(catalog)
      .filter(([k, m]) => k !== key && enabled(k) && m.requires.includes(key))
      .map(([k]) => k);
    return { also };
  }
  if (mod.client && o.inRelease && !o.inRelease(key)) return { error: 'not_in_release' };
  const missing = mod.requires.filter((k) => !enabled(k));
  if (missing.length) return { error: 'missing_dependency', detail: { missing } };
  if (mod.requiresAnyOf.length && !mod.requiresAnyOf.some(enabled))
    return { error: 'missing_dependency', detail: { anyOf: mod.requiresAnyOf } };
  const clash = [
    ...mod.conflicts.filter(enabled),
    ...Object.entries(catalog)
      .filter(([k, m]) => enabled(k) && m.conflicts.includes(key))
      .map(([k]) => k),
  ];
  if (clash.length) return { error: 'conflict', detail: { with: [...new Set(clash)] } };
  return { also: [] };
}

/**
 * The configuration with a switch applied. Settings and everything else stay as they were.
 * @param {any} config
 * @param {Change} change
 */
export function applySwitch(config, change) {
  const next = structuredClone(config);
  next.modules = next.modules ?? {};
  for (const k of [change.key, ...(change.also ?? [])]) {
    next.modules[k] = { ...(next.modules[k] ?? {}), enabled: k === change.key ? change.on : false };
  }
  return next;
}

/**
 * Closes a Maintainer's open request (approved, refused, or replaced by a direct switch).
 * @param {ModulesEnv} env
 * @param {string} cafeId
 * @param {number} version
 * @param {'approved' | 'rejected' | 'replaced'} decision
 * @param {string} by
 * @param {Date} now
 */
function closeRequest(env, cafeId, version, decision, by, now) {
  return env.DB.prepare(
    `UPDATE config_versions SET status = 'superseded', decision = ?3, decided_by = ?4, decided_at = ?5
      WHERE cafe_id = ?1 AND version_no = ?2 AND status = 'draft'`,
  )
    .bind(cafeId, version, decision, by, isoNow(now))
    .run();
}

/**
 * Open requests of a café, with the module each asks for.
 * @param {ModulesEnv} env
 * @param {string} cafeId
 */
async function openRequests(env, cafeId) {
  return (
    await env.DB.prepare(
      `SELECT v.version_no, v.change, v.created_at, u.display_name FROM config_versions v
         LEFT JOIN users u ON u.id = v.created_by
        WHERE v.cafe_id = ?1 AND v.status = 'draft' ORDER BY v.version_no`,
    )
      .bind(cafeId)
      .all()
  ).results.map((r) => ({
    version: Number(r.version_no),
    ...parseChange(r.change),
    by: r.display_name === null ? null : String(r.display_name),
    at: String(r.created_at),
  }));
}

/** A module's name from the catalogue, or null. @param {string | null} key */
const titleOf = (key) =>
  key && Object.hasOwn(MODULE_CATALOG, key) ? MODULE_CATALOG[key].title : null;

/** @param {unknown} text @returns {Change | { key: null, on: null }} */
function parseChange(text) {
  try {
    const c = JSON.parse(String(text));
    if (c && typeof c.key === 'string') return c;
  } catch {
    /* a seeded or older version: no change recorded */
  }
  return { key: null, on: null };
}

/**
 * @param {ModulesEnv} env
 * @param {string} cafeId
 * @param {{ userId: string, role: string }} actor
 * @param {string} action
 * @param {string} target
 * @param {Date} now
 */
function audit(env, cafeId, actor, action, target, now) {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at)
     VALUES (?1, 'modules', ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(ulid(now.getTime()), action, cafeId, target, actor.userId, actor.role, isoNow(now))
    .run();
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const text = await request.text();
    return text.length > 1024 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {ModulesEnv} env
 * @param {string} route   "modules", "modules/switch", "modules/decide" or "modules/notices"
 * @param {Date} [now]
 */
export async function handleModules(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const isAdmin = account.roles.some((r) => r.role === 'admin');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  if (!write && request.method !== 'GET') return problem(405, 'method_not_allowed');

  if (route === 'modules/notices') {
    if (write) return problem(405, 'method_not_allowed');
    if (!isAdmin) return problem(403, 'forbidden');
    return json(200, await notices(env, account.id, now));
  }

  const input = write ? await readBody(request) : null;
  if (write && (!input || typeof input !== 'object')) return problem(400, 'bad_request');
  const url = new URL(request.url);
  const slug = String(write ? (input.cafe ?? '') : (url.searchParams.get('cafe') ?? ''));
  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !SEE.includes(role)) return problem(403, 'forbidden');
  const actor = { userId: account.id, role };
  const live = cafe.status === 'live' || cafe.status === 'paused';

  if (route === 'modules' && !write) {
    const active = await activeVersion(env, cafe.id);
    const manifest = await releaseManifest(env.ASSETS, cafe.pinnedRelease, url.origin);
    const requests = await openRequests(env, cafe.id);
    const history = (
      await env.DB.prepare(
        `SELECT v.version_no, v.status, v.change, v.created_at, v.decision, v.decided_at,
                u.display_name, d.display_name AS decider
           FROM config_versions v
           LEFT JOIN users u ON u.id = v.created_by
           LEFT JOIN users d ON d.id = v.decided_by
          WHERE v.cafe_id = ?1 AND json_extract(v.change, '$.key') IS NOT NULL
          ORDER BY v.version_no DESC LIMIT 20`,
      )
        .bind(cafe.id)
        .all()
    ).results.map((r) => ({
      version: Number(r.version_no),
      status: String(r.status),
      ...parseChange(r.change),
      by: r.display_name === null ? null : String(r.display_name),
      at: String(r.created_at),
      decision: r.decision === null ? null : String(r.decision),
      decider: r.decider === null ? null : String(r.decider),
      decidedAt: r.decided_at === null ? null : String(r.decided_at),
    }));
    return json(200, {
      cafe: { slug: cafe.slug, status: cafe.status, release: cafe.pinnedRelease },
      role,
      version: active.version,
      can: {
        off: role === 'maintainer' || role === 'admin',
        on:
          role === 'admin'
            ? 'direct'
            : role === 'maintainer'
              ? live
                ? 'request'
                : 'direct'
              : 'no',
        decide: role === 'admin',
      },
      modules: Object.entries(MODULE_CATALOG).map(([key, m]) => {
        const c = active.config.modules?.[key];
        return {
          key,
          id: m.id,
          title: m.title,
          summary: m.summary,
          stability: m.stability,
          paid: m.paid,
          enabled: c?.enabled === true,
          // Switched on but missing a setting it needs: it stays off (module-needs.js).
          missing: c?.enabled ? missingNeeds(c.settings, m.needs) : [],
          requires: m.requires,
          conflicts: m.conflicts,
          inRelease: !m.client || Boolean(manifest?.modules?.[key]),
          request: requests.find((r) => r.key === key) ?? null,
        };
      }),
      history,
    });
  }

  if (route === 'modules/switch' && write) {
    const key = String(input.key ?? '');
    if (!KEY.test(key) || typeof input.on !== 'boolean') return problem(400, 'bad_request');
    const on = input.on;
    if (role === 'manager') return problem(403, 'ask_admin');
    const mod = Object.hasOwn(MODULE_CATALOG, key) ? MODULE_CATALOG[key] : null;
    if (on && mod?.paid && role !== 'admin') return problem(403, 'paid_admin_only');
    const active = await activeVersion(env, cafe.id);
    if ((active.config.modules?.[key]?.enabled === true) === on)
      return json(200, { version: active.version, unchanged: true });
    const manifest = on ? await releaseManifest(env.ASSETS, cafe.pinnedRelease, url.origin) : null;
    const checked = checkSwitch(active.config, key, on, {
      inRelease: (k) => Boolean(manifest?.modules?.[k]),
    });
    if ('error' in checked)
      return json(409, { error: checked.error, release: cafe.pinnedRelease, ...checked.detail });

    const requests = (await openRequests(env, cafe.id)).filter((r) => r.key === key);
    /** @type {Change} */
    const change = { key, on, ...(checked.also.length ? { also: checked.also } : {}) };
    if (on && role === 'maintainer' && live) {
      if (requests.length) return problem(409, 'already_requested');
      const version = await writeVersion(env, cafe, {
        config: applySwitch(active.config, change),
        schemaVersion: active.schemaVersion,
        change,
        by: account.id,
        status: 'draft',
        now,
      });
      await audit(env, cafe.id, actor, 'request_on', `${cafe.slug}/${key}`, now);
      return json(202, { version, pending: true });
    }
    const version = await writeVersion(env, cafe, {
      config: applySwitch(active.config, change),
      schemaVersion: active.schemaVersion,
      change,
      by: account.id,
      status: 'active',
      now,
    });
    for (const r of requests)
      await closeRequest(env, cafe.id, r.version, 'replaced', account.id, now);
    await audit(env, cafe.id, actor, on ? 'on' : 'off', `${cafe.slug}/${key}`, now);
    for (const k of checked.also)
      await audit(env, cafe.id, actor, 'off', `${cafe.slug}/${k} (needs ${key})`, now);
    return json(200, { version, also: checked.also });
  }

  if (route === 'modules/decide' && write) {
    if (role !== 'admin') return problem(403, 'forbidden');
    const wanted = Number(input.version);
    if (!Number.isInteger(wanted) || typeof input.approve !== 'boolean')
      return problem(400, 'bad_request');
    const request_ = (await openRequests(env, cafe.id)).find((r) => r.version === wanted);
    if (!request_ || request_.key === null) return problem(404, 'unknown_request');
    if (!input.approve) {
      await closeRequest(env, cafe.id, wanted, 'rejected', account.id, now);
      await audit(env, cafe.id, actor, 'reject_on', `${cafe.slug}/${request_.key}`, now);
      return json(200, { rejected: wanted });
    }
    // Approving applies the request to the configuration as it is now (other switches may
    // have changed since it was asked), after the same checks.
    const active = await activeVersion(env, cafe.id);
    const manifest = await releaseManifest(env.ASSETS, cafe.pinnedRelease, url.origin);
    const checked = checkSwitch(active.config, request_.key, true, {
      inRelease: (k) => Boolean(manifest?.modules?.[k]),
    });
    if ('error' in checked)
      return json(409, { error: checked.error, release: cafe.pinnedRelease, ...checked.detail });
    /** @type {Change} */
    const change = { key: request_.key, on: true, approves: wanted };
    const version = await writeVersion(env, cafe, {
      config: applySwitch(active.config, change),
      schemaVersion: active.schemaVersion,
      change,
      by: account.id,
      status: 'active',
      now,
    });
    await closeRequest(env, cafe.id, wanted, 'approved', account.id, now);
    await audit(env, cafe.id, actor, 'approve_on', `${cafe.slug}/${request_.key}`, now);
    return json(200, { version });
  }

  return problem(404, 'not_found');
}

/**
 * For Admin: module changes made by someone else in the last 14 days, in every café, and the
 * requests waiting for a decision (MOD-16: Admin is told about a kill switch).
 * @param {ModulesEnv} env
 * @param {string} adminId
 * @param {Date} now
 */
async function notices(env, adminId, now) {
  const since = isoNow(new Date(now.getTime() - NOTICE_DAYS * 86_400_000));
  const rows = (
    await env.DB.prepare(
      `SELECT c.slug, v.version_no, v.status, v.change, v.created_at, v.decision, u.display_name,
              (SELECT body FROM config_versions a WHERE a.cafe_id = c.id AND a.version_no = c.active_config_version) AS body
         FROM config_versions v
         JOIN cafes c ON c.id = v.cafe_id
         LEFT JOIN users u ON u.id = v.created_by
        WHERE json_extract(v.change, '$.key') IS NOT NULL AND v.created_by != ?1
          AND (v.created_at >= ?2 OR (v.status = 'draft' AND v.decision IS NULL))
        ORDER BY v.created_at DESC LIMIT 50`,
    )
      .bind(adminId, since)
      .all()
  ).results;
  return {
    changes: rows.map((r) => ({
      cafe: String(r.slug),
      name: JSON.parse(String(r.body)).names ?? null,
      version: Number(r.version_no),
      ...parseChange(r.change),
      title: titleOf(parseChange(r.change).key),
      by: r.display_name === null ? null : String(r.display_name),
      at: String(r.created_at),
      pending: r.status === 'draft',
      decision: r.decision === null ? null : String(r.decision),
    })),
  };
}
