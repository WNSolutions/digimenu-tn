// @ts-check
/**
 * Café information editor (issue #20, US-28, C-06, C-07, C-08, ADR-0012).
 *
 *   GET  /admin/api/info?cafe=<slug>                      Manager, Maintainer, Admin
 *   POST /admin/api/info  { cafe, info?, hours?, branding?, settings? }
 *   POST /admin/api/info/restore  { cafe, version }      the information as it was at a version
 *
 * What a Manager runs from a phone: address, map link, business phone, social links, opening
 * hours per day, the brand colour and an optional button colour, and the modules' settings
 * (e.g. the Google review link). A colour that fails contrast is refused with a deeper shade
 * to use instead. Every save is a new configuration version (who, when, which fields), live in
 * this Worker at once and everywhere within 30 s; any earlier version can be restored the same
 * way. Staff do not see this screen.
 */
import { json, problem } from './http.js';
import { currentAccount, roleIn, sameOrigin } from './auth.js';
import { resolveCafe } from './cafes.js';
import { activeVersion, writeVersion } from './config-versions.js';
import { MODULE_CATALOG } from './module-catalog.js';
import { accentTokens, themeTokens } from '../../../core/ui/accent.js';
import { DAYS } from '../../../core/hours.js';
import { isoNow } from './clock.js';
import { ulid } from './ids.js';

const EDIT = ['manager', 'maintainer', 'admin'];
const LANGS = ['fr', 'ar', 'en'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const PHONE = /^\+[1-9][0-9]{6,14}$/;
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/;
/** What a café may publish (the café configuration schema). */
const MAX = { text: 200, url: 300, social: 6, spans: 3 };

/**
 * @typedef {object} Problem
 * @property {string} field   e.g. "info.phone", "hours.mon", "branding.primaryColor"
 * @property {string} code    bad_text, bad_url, bad_phone, bad_hours, bad_colour, contrast,
 *   theme_contrast, bad_setting, unknown_module
 * @property {string} [suggestion]   a colour that passes
 */

/** @param {unknown} v */
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * A phone number as people type it ("+216 54 31 33 34", "00216…") in international format.
 * @param {string} text
 */
export function normalisePhone(text) {
  const t = text.replace(/[\s.\-()]/g, '');
  return t.startsWith('00') ? `+${t.slice(2)}` : t;
}

/**
 * Checks one module setting against its schema (the shapes our modules use: text with a
 * pattern, whole numbers with bounds, a choice from a list, a text per language).
 * @param {import('./modules-api.js').SettingSchema & Record<string, any>} schema
 * @param {unknown} value
 * @returns {boolean}
 */
export function settingOk(schema, value) {
  if (schema.enum) return schema.enum.includes(value);
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    return !schema.pattern || new RegExp(schema.pattern).test(value);
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (schema.type === 'integer' && !Number.isInteger(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    return schema.maximum === undefined || value <= schema.maximum;
  }
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value).size !== value.length) return false;
    return !schema.items || value.every((x) => settingOk(/** @type {any} */ (schema.items), x));
  }
  const props = schema.properties;
  if (schema.type === 'object' && props) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const v = /** @type {Record<string, unknown>} */ (value);
    if ((schema.required ?? []).some((/** @type {string} */ k) => blank(v[k]))) return false;
    return Object.entries(v).every(([k, x]) => Object.hasOwn(props, k) && settingOk(props[k], x));
  }
  return false;
}

/**
 * Applies an edit to a café's configuration and checks it. Nothing is changed in `config`.
 * @param {any} config
 * @param {any} input   { info?, hours?, branding?, settings? }
 * @param {Record<string, import('./modules-api.js').CatalogEntry>} [catalog]
 * @returns {{ next: any, fields: string[], problems: Problem[] }}
 */
export function editInfo(config, input, catalog = MODULE_CATALOG) {
  const next = structuredClone(config);
  /** @type {Problem[]} */
  const problems = [];
  /** @type {Set<string>} */
  const fields = new Set();
  const langs = config.languages?.enabled ?? ['fr'];

  if (input.info && typeof input.info === 'object') {
    const info = { ...(next.info ?? {}) };
    const i = input.info;
    if ('address' in i) {
      if (blank(i.address)) delete info.address;
      else if (typeof i.address !== 'object')
        problems.push({ field: 'info.address', code: 'bad_text' });
      else {
        /** @type {Record<string, string>} */
        const address = {};
        for (const l of LANGS) {
          const text = typeof i.address[l] === 'string' ? i.address[l].trim() : '';
          if (text && langs.includes(l)) address[l] = text;
        }
        if (!address.fr || Object.values(address).some((t) => t.length > MAX.text))
          problems.push({ field: 'info.address', code: 'bad_text' });
        else info.address = address;
      }
      fields.add('info.address');
    }
    if ('mapUrl' in i) {
      if (blank(i.mapUrl)) delete info.mapUrl;
      else if (
        typeof i.mapUrl !== 'string' ||
        i.mapUrl.length > MAX.url ||
        !HTTPS.test(i.mapUrl.trim())
      )
        problems.push({ field: 'info.mapUrl', code: 'bad_url' });
      else info.mapUrl = i.mapUrl.trim();
      fields.add('info.mapUrl');
    }
    if ('phone' in i) {
      if (blank(i.phone)) delete info.phone;
      else {
        const phone = typeof i.phone === 'string' ? normalisePhone(i.phone) : '';
        if (!PHONE.test(phone)) problems.push({ field: 'info.phone', code: 'bad_phone' });
        else info.phone = phone;
      }
      fields.add('info.phone');
    }
    if ('social' in i) {
      const list = Array.isArray(i.social)
        ? [
            ...new Set(
              i.social
                .filter((/** @type {unknown} */ u) => !blank(u))
                .map((/** @type {any} */ u) => String(u).trim()),
            ),
          ]
        : null;
      if (
        !list ||
        list.length > MAX.social ||
        list.some((u) => u.length > MAX.url || !HTTPS.test(u))
      )
        problems.push({ field: 'info.social', code: 'bad_url' });
      else if (list.length) info.social = list;
      else delete info.social;
      fields.add('info.social');
    }
    next.info = info;
    if (!Object.keys(info).length) delete next.info;
  }

  if (input.hours && typeof input.hours === 'object') {
    const hours = { ...(next.hours ?? {}) };
    for (const day of DAYS) {
      if (!(day in input.hours)) continue;
      const spans = input.hours[day];
      const ok =
        Array.isArray(spans) &&
        spans.length <= MAX.spans &&
        spans.every(
          (s) =>
            Array.isArray(s) &&
            s.length === 2 &&
            CLOCK.test(String(s[0])) &&
            CLOCK.test(String(s[1])) &&
            s[0] !== s[1],
        );
      if (!ok) problems.push({ field: `hours.${day}`, code: 'bad_hours' });
      else hours[day] = spans.map((/** @type {string[]} */ s) => [s[0], s[1]]);
      fields.add(`hours.${day}`);
    }
    next.hours = hours;
  }

  if (input.branding && typeof input.branding === 'object') {
    const b = input.branding;
    const branding = { ...next.branding };
    if ('primaryColor' in b) {
      if (typeof b.primaryColor !== 'string' || !HEX.test(b.primaryColor))
        problems.push({ field: 'branding.primaryColor', code: 'bad_colour' });
      else branding.primaryColor = b.primaryColor.toUpperCase();
      fields.add('branding.primaryColor');
    }
    if ('buttonColor' in b) {
      if (blank(b.buttonColor)) delete branding.buttonColor;
      else if (typeof b.buttonColor !== 'string' || !HEX.test(b.buttonColor))
        problems.push({ field: 'branding.buttonColor', code: 'bad_colour' });
      else branding.buttonColor = b.buttonColor.toUpperCase();
      fields.add('branding.buttonColor');
    }
    if (!problems.some((p) => p.field.startsWith('branding.'))) {
      // ADR-0012: refused with a deeper shade to use instead.
      const accent = accentTokens(branding);
      if (accent.errors.length)
        problems.push({
          field: branding.buttonColor ? 'branding.buttonColor' : 'branding.primaryColor',
          code: 'contrast',
          ...(accent.suggestion ? { suggestion: accent.suggestion } : {}),
        });
      else if (branding.theme && themeTokens(branding).errors.length)
        problems.push({ field: 'branding.buttonColor', code: 'theme_contrast' });
    }
    next.branding = branding;
  }

  if (input.settings && typeof input.settings === 'object') {
    for (const [key, values] of Object.entries(input.settings)) {
      const mod = Object.hasOwn(catalog, key) ? catalog[key] : null;
      if (!mod || !values || typeof values !== 'object') {
        problems.push({ field: `settings.${key}`, code: 'unknown_module' });
        continue;
      }
      const entry = { enabled: false, ...(next.modules?.[key] ?? {}) };
      const settings = { ...(entry.settings ?? {}) };
      for (const [name, value] of Object.entries(/** @type {Record<string, unknown>} */ (values))) {
        const schema = Object.hasOwn(mod.settings, name) ? mod.settings[name] : null;
        fields.add(`settings.${key}.${name}`);
        if (!schema) problems.push({ field: `settings.${key}.${name}`, code: 'bad_setting' });
        else if (blank(value)) delete settings[name];
        else {
          const v = typeof value === 'string' && schema.type === 'string' ? value.trim() : value;
          if (settingOk(/** @type {any} */ (schema), v)) settings[name] = v;
          else problems.push({ field: `settings.${key}.${name}`, code: 'bad_setting' });
        }
      }
      next.modules = { ...(next.modules ?? {}), [key]: { ...entry, settings } };
      if (!Object.keys(settings).length) delete next.modules[key].settings;
    }
  }
  // Only what really changed is recorded (who, when, which fields).
  const changed = [...fields].filter(
    (f) => JSON.stringify(valueAt(config, f)) !== JSON.stringify(valueAt(next, f)),
  );
  return { next, fields: changed, problems };
}

/**
 * The value an edited field names: "info.phone", "hours.mon", "branding.buttonColor",
 * "settings.google_review.reviewUrl".
 * @param {any} config
 * @param {string} field
 */
function valueAt(config, field) {
  const [part, a, b] = field.split('.');
  if (part === 'settings') return config.modules?.[a]?.settings?.[b];
  return config[part]?.[a];
}

/** The parts of a configuration this editor changes (restored together). */
const PARTS = /** @type {const} */ (['info', 'hours', 'branding']);

/**
 * An earlier version's information, hours, colours and module settings on top of the current
 * configuration (switches stay as they are now).
 * @param {any} current
 * @param {any} earlier
 */
export function restoreInfo(current, earlier) {
  const next = structuredClone(current);
  for (const part of PARTS) {
    if (earlier[part] === undefined) delete next[part];
    else next[part] = structuredClone(earlier[part]);
  }
  for (const key of Object.keys({ ...(current.modules ?? {}), ...(earlier.modules ?? {}) })) {
    const settings = earlier.modules?.[key]?.settings;
    if (!next.modules?.[key]) continue;
    if (settings) next.modules[key].settings = structuredClone(settings);
    else delete next.modules[key].settings;
  }
  return next;
}

/** @param {Request} request */
async function readBody(request) {
  try {
    const text = await request.text();
    return text.length > 16_384 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @param {import('./auth.js').AuthEnv} env
 * @param {string} route   "info" or "info/restore"
 * @param {Date} [now]
 */
export async function handleInfo(request, env, route, now = new Date()) {
  const account = await currentAccount(request, env, now);
  if (!account) return problem(401, 'signed_out');
  const write = request.method === 'POST';
  if (write && !sameOrigin(request)) return problem(403, 'forbidden');
  if (!write && request.method !== 'GET') return problem(405, 'method_not_allowed');
  const input = write ? await readBody(request) : null;
  if (write && (!input || typeof input !== 'object')) return problem(400, 'bad_request');
  const url = new URL(request.url);
  const slug = String(write ? (input.cafe ?? '') : (url.searchParams.get('cafe') ?? ''));
  const cafe = await resolveCafe(env.DB, slug, now.getTime());
  if (!cafe) return problem(404, 'unknown_cafe');
  const role = roleIn(account, cafe.id);
  if (!role || !EDIT.includes(role)) return problem(403, 'forbidden');
  const active = await activeVersion(env, cafe.id);
  const c = active.config;

  if (route === 'info' && !write) {
    const history = (
      await env.DB.prepare(
        `SELECT v.version_no, v.change, v.created_at, u.display_name FROM config_versions v
           LEFT JOIN users u ON u.id = v.created_by
          WHERE v.cafe_id = ?1 AND json_extract(v.change, '$.info') IS NOT NULL
          ORDER BY v.version_no DESC LIMIT 10`,
      )
        .bind(cafe.id)
        .all()
    ).results.map((r) => {
      const change = JSON.parse(String(r.change));
      return {
        version: Number(r.version_no),
        fields: change.info,
        restores: change.restores ?? null,
        by: r.display_name === null ? null : String(r.display_name),
        at: String(r.created_at),
      };
    });
    return json(200, {
      role,
      version: active.version,
      languages: c.languages,
      names: c.names,
      info: c.info ?? {},
      hours: c.hours ?? {},
      branding: {
        primaryColor: c.branding?.primaryColor ?? null,
        buttonColor: c.branding?.buttonColor ?? null,
        // A café theme (ADR-0014) changes the page colours: the preview uses them.
        theme: c.branding?.theme
          ? { background: c.branding.theme.background, text: c.branding.theme.text ?? null }
          : null,
      },
      modules: Object.entries(MODULE_CATALOG)
        .filter(([, m]) => Object.keys(m.settings).length)
        .map(([key, m]) => ({
          key,
          title: m.title,
          enabled: c.modules?.[key]?.enabled === true,
          needs: m.needs,
          fields: m.settings,
          values: c.modules?.[key]?.settings ?? {},
        })),
      history,
    });
  }

  /** @type {{ next: any, fields: string[], restores?: number }} */
  let edit;
  if (route === 'info' && write) {
    const result = editInfo(c, input);
    if (result.problems.length) return json(422, { error: 'invalid', problems: result.problems });
    if (!result.fields.length) return json(200, { version: active.version, unchanged: true });
    edit = result;
  } else if (route === 'info/restore' && write) {
    const wanted = Number(input.version);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted >= active.version)
      return problem(400, 'bad_request');
    // The configuration as it was live at that version: the newest version up to it that was
    // live (never a Maintainer's request, approved or not: approving made a new version).
    const row = await env.DB.prepare(
      `SELECT body FROM config_versions
        WHERE cafe_id = ?1 AND version_no <= ?2 AND status != 'draft' AND decision IS NULL
        ORDER BY version_no DESC LIMIT 1`,
    )
      .bind(cafe.id, wanted)
      .first();
    if (!row) return problem(404, 'unknown_version');
    edit = {
      next: restoreInfo(c, JSON.parse(String(row.body))),
      fields: ['restore'],
      restores: wanted,
    };
  } else return problem(404, 'not_found');

  if (JSON.stringify(edit.next) === JSON.stringify(c))
    return json(200, { version: active.version, unchanged: true });
  const change = { info: edit.fields, ...(edit.restores ? { restores: edit.restores } : {}) };
  const version = await writeVersion(env, cafe, {
    config: edit.next,
    schemaVersion: active.schemaVersion,
    change,
    by: account.id,
    status: 'active',
    now,
  });
  await env.DB.prepare(
    `INSERT INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at)
     VALUES (?1, 'config', ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      ulid(now.getTime()),
      edit.restores ? 'restore' : 'info',
      cafe.id,
      `${cafe.slug}: ${edit.restores ? `v${edit.restores}` : edit.fields.join(',')}`.slice(0, 200),
      account.id,
      role,
      isoNow(now),
    )
    .run();
  return json(200, { version });
}
