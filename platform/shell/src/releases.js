// @ts-check
/**
 * Release dispatcher: reads a release's manifest from the static assets (`/r/<version>/
 * manifest.json`, written by tools/release/build.js) and caches it for the life of the Worker
 * instance, since release files never change.
 *
 * One deployment carries a window of up to 3 releases (tools/release/window.js); each café is
 * pinned to one of them (`cafes.pinned_release`, releases-api.js).
 */

/**
 * What a release says about itself (tools/release/build.js). `dataSchema`, `reads` and the
 * modules' `version` and `settingsVersion` were added with #24; a release built before says
 * nothing, and is read with LEGACY (the formats that existed then).
 * @typedef {object} ReleaseManifest
 * @property {string} version
 * @property {number} platformApi
 * @property {string} entry
 * @property {string} css
 * @property {number} [dataSchema]   the database migration it was built against (it needs at
 *   least this one; later migrations only add, until a MAJOR release says otherwise)
 * @property {{ config: number[], snapshot: number[] }} [reads]   configuration and menu
 *   snapshot formats it reads
 * @property {Record<string, { entry: string, version?: string, settingsVersion?: number, needs?: string[],
 *   texts: Partial<Record<'fr' | 'ar' | 'en', Record<string, string>>> }>} modules
 */

/** @type {Map<string, ReleaseManifest>} */
const manifests = new Map();

export const PLATFORM_API = 1;

/** What a release built before #24 reads: configuration format 0, menu snapshot format 1. */
export const LEGACY = { dataSchema: 1, reads: { config: [0], snapshot: [1] } };

/**
 * @param {{ fetch: (request: Request) => Promise<Response> }} assets
 * @param {string} version
 * @param {string} origin
 * @returns {Promise<ReleaseManifest | null>}
 */
export async function releaseManifest(assets, version, origin) {
  const hit = manifests.get(version);
  if (hit) return hit;
  if (!/^[0-9A-Za-z.-]+$/.test(version)) return null;
  const response = await assets.fetch(new Request(new URL(`/r/${version}/manifest.json`, origin)));
  if (!response.ok) return null;
  /** @type {ReleaseManifest} */
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    // Not a manifest: the asset layer answers a missing file with the boot page (single-page
    // application mode), so a release that is not on the site comes back as HTML.
    return null;
  }
  if (manifest?.version !== version || manifest.platformApi !== PLATFORM_API) return null;
  manifests.set(version, manifest);
  return manifest;
}

/** For tests. */
export function clearManifests() {
  manifests.clear();
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

/** @param {string} v */
export const isVersion = (v) => SEMVER.test(v);

/**
 * Semantic-version order (semver.org §11): 0.16.0-preview.1 < 0.16.0 < 0.17.0-preview.1.
 * @param {string} a
 * @param {string} b
 * @returns {number} below 0 when a is older, 0 when equal, above 0 when a is newer
 */
export function compareVersions(a, b) {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) throw new Error(`not a version: ${x ? b : a}`);
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(x[i]) - Number(y[i]);
    if (d) return d;
  }
  const p = x[4];
  const q = y[4];
  if (p === q) return 0;
  if (p === undefined) return 1;
  if (q === undefined) return -1;
  const ps = p.split('.');
  const qs = q.split('.');
  for (let i = 0; i < Math.max(ps.length, qs.length); i += 1) {
    if (ps[i] === undefined) return -1;
    if (qs[i] === undefined) return 1;
    if (ps[i] === qs[i]) continue;
    const pn = /^\d+$/.test(ps[i]);
    const qn = /^\d+$/.test(qs[i]);
    if (pn && qn) return Number(ps[i]) - Number(qs[i]);
    if (pn) return -1;
    if (qn) return 1;
    return ps[i] < qs[i] ? -1 : 1;
  }
  return 0;
}
