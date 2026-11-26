#!/usr/bin/env node
// @ts-check
/**
 * Moves one café to another release of the window without the staff app (issue #24): the
 * fallback the deploy repo's "Pin café" workflow runs when the staff app is unavailable. Same
 * rules and same pre-flight as the staff app (platform/shell/src/releases-api.js).
 *
 *   node tools/release/pin.js query --cafe <slug>
 *       prints the query that reads the café's state (run it with `wrangler d1 execute --json`)
 *
 *   node tools/release/pin.js plan --cafe <slug> --release <version> --reason <text>
 *       --by <who> --state <file.json> --site <https://host> [--back-only]
 *       reads that state, fetches the releases' manifests from the site, checks, and prints the
 *       SQL of the move; or explains on stderr why not and exits with 1
 *
 * `--back-only`: the person may only put the café back on the release it ran before (a
 * Maintainer's rollback); without it, any release of the window (Admin). The SQL moves the pin
 * and writes the history and audit lines only if the café is still where the plan found it.
 * Menus, configuration, orders and customer records are never touched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preflight, mayPin } from '../../platform/shell/src/releases-api.js';
import { isVersion, PLATFORM_API } from '../../platform/shell/src/releases.js';
import { ulid } from '../../platform/shell/src/ids.js';
import { isoNow } from '../../platform/shell/src/clock.js';

const HELP = `Usage:
  node tools/release/pin.js query --cafe <slug>
  node tools/release/pin.js plan --cafe <slug> --release <version> --reason <text> --by <who>
                                 --state <file.json> --site <https://host> [--back-only]
`;

const SLUG = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
/** @param {unknown} v */
const sql = (v) => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);

/** @param {string} slug */
export function stateQuery(slug) {
  if (!SLUG.test(slug)) throw new Error(`"${slug}" is not a café slug`);
  return `SELECT c.id, c.slug, c.pinned_release AS pinned, v.schema_version AS config_schema, v.body AS config,
  (SELECT s.schema_version FROM menu_snapshots s WHERE s.cafe_id = c.id AND s.rev = c.menu_rev) AS snapshot_schema,
  (SELECT data_schema_version FROM schema_meta WHERE id = 1) AS data_schema,
  (SELECT json_object('release', p.release, 'previous', p.previous_release) FROM release_pins p WHERE p.cafe_id = c.id ORDER BY p.pinned_at DESC, p.rowid DESC LIMIT 1) AS last_pin,
  (SELECT json_group_array(version) FROM releases WHERE status != 'retired') AS in_window
FROM cafes c JOIN config_versions v ON v.cafe_id = c.id AND v.version_no = c.active_config_version
WHERE c.slug = ${sql(slug)} AND c.status != 'closed';`;
}

/**
 * The café's row from `wrangler d1 execute --json` (an array of results), or the row itself.
 * @param {any} output
 */
export function stateRow(output) {
  const row = Array.isArray(output) ? output[0]?.results?.[0] : (output?.results?.[0] ?? output);
  if (!row || !row.pinned) throw new Error('café not found (or closed)');
  return row;
}

/**
 * @param {{ row: any, release: string, reason: string, by: string, backOnly: boolean,
 *   manifest: (version: string) => Promise<import('../../platform/shell/src/releases.js').ReleaseManifest | null>,
 *   now?: Date }} o
 * @returns {Promise<{ sql: string, from: string, direction: 'back' | 'forward' } | { error: string, problems?: any[] }>}
 */
export async function planPin(o) {
  const { row } = o;
  const reason = o.reason.trim();
  if (!isVersion(o.release)) return { error: 'bad_version' };
  if (reason.length < 3 || reason.length > 200) return { error: 'reason_needed' };
  if (!/^[\w.:@-]{1,60}$/.test(o.by)) return { error: 'bad_by' };
  const pinned = String(row.pinned);
  if (o.release === pinned) return { error: 'unchanged' };
  const inWindow = /** @type {string[]} */ (JSON.parse(row.in_window ?? '[]'));
  if (!inWindow.includes(o.release)) return { error: 'not_in_window' };
  const last = row.last_pin ? JSON.parse(row.last_pin) : null;
  const previous =
    last && last.release === pinned && last.previous && inWindow.includes(last.previous)
      ? String(last.previous)
      : null;
  const role = o.backOnly ? 'maintainer' : 'admin';
  const direction = mayPin(role, o.release, pinned, previous);
  if (!direction) return { error: o.backOnly ? 'back_to_previous_only' : 'forbidden' };
  const target = await o.manifest(o.release);
  const problems = preflight({
    target: target && target.platformApi === PLATFORM_API ? target : null,
    current: await o.manifest(pinned),
    config: JSON.parse(String(row.config)),
    configSchema: Number(row.config_schema),
    snapshotSchema: row.snapshot_schema === null ? null : Number(row.snapshot_schema),
    dataSchema: Number(row.data_schema ?? 1),
  });
  if (problems.length) return { error: 'preflight', problems };

  const now = o.now ?? new Date();
  const id = ulid(now.getTime());
  const at = isoNow(now);
  const cafe = sql(row.id);
  const lines = [
    `-- Pin café ${row.slug}: ${pinned} -> ${o.release} (${direction}). Generated by tools/release/pin.js.`,
    `INSERT INTO release_pins (id, cafe_id, release, previous_release, pinned_by, reason, config_version, pinned_at) SELECT ${sql(id)}, id, ${sql(o.release)}, pinned_release, ${sql(o.by)}, ${sql(reason)}, active_config_version, ${sql(at)} FROM cafes WHERE id = ${cafe} AND pinned_release = ${sql(pinned)};`,
    `UPDATE cafes SET pinned_release = ${sql(o.release)} WHERE id = ${cafe} AND pinned_release = ${sql(pinned)};`,
    `INSERT OR IGNORE INTO audit_log (id, category, action, cafe_id, target, actor, actor_role, at) SELECT ${sql(ulid(now.getTime()))}, 'release', ${sql(direction === 'back' ? 'rollback' : 'pin')}, ${cafe}, ${sql(`${row.slug} ${pinned} -> ${o.release}`)}, ${sql(o.by)}, ${sql(role)}, ${sql(at)} WHERE EXISTS (SELECT 1 FROM release_pins WHERE id = ${sql(id)});`,
  ];
  return { sql: lines.join('\n') + '\n', from: pinned, direction };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      cafe: { type: 'string' },
      release: { type: 'string' },
      reason: { type: 'string' },
      by: { type: 'string' },
      state: { type: 'string' },
      site: { type: 'string' },
      'back-only': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const command = positionals[0];
  if (values.help || !values.cafe || !['query', 'plan'].includes(command ?? '')) {
    process.stdout.write(HELP);
    process.exit(values.help ? 0 : 2);
  }
  if (command === 'query') {
    process.stdout.write(stateQuery(values.cafe) + '\n');
    return;
  }
  if (!values.release || !values.reason || !values.by || !values.state || !values.site) {
    process.stdout.write(HELP);
    process.exit(2);
  }
  const site = new URL(values.site);
  if (site.protocol !== 'https:') throw new Error('--site must be an https address');
  const row = stateRow(JSON.parse(readFileSync(path.resolve(values.state), 'utf8')));
  if (row.slug !== values.cafe) throw new Error(`the state is for ${row.slug}, not ${values.cafe}`);
  const plan = await planPin({
    row,
    release: values.release.replace(/^v/, ''),
    reason: values.reason,
    by: values.by,
    backOnly: values['back-only'],
    manifest: async (v) => {
      if (!isVersion(v)) return null;
      const res = await fetch(new URL(`/r/${v}/manifest.json`, site));
      return res.ok ? res.json() : null;
    },
  });
  if ('error' in plan) {
    process.stderr.write(
      `${plan.error}${plan.problems ? `: ${JSON.stringify(plan.problems)}` : ''}\n`,
    );
    process.exit(1);
  }
  process.stderr.write(`${values.cafe}: ${plan.from} -> ${values.release} (${plan.direction})\n`);
  process.stdout.write(plan.sql);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
