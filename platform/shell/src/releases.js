// @ts-check
/**
 * Release dispatcher: reads a release's manifest from the static assets (`/r/<version>/
 * manifest.json`, written by tools/release/build.js) and caches it for the life of the Worker
 * instance, since release files never change.
 */

/**
 * @typedef {object} ReleaseManifest
 * @property {string} version
 * @property {number} platformApi
 * @property {string} entry
 * @property {string} css
 * @property {Record<string, { entry: string, texts: Partial<Record<'fr' | 'ar' | 'en', Record<string, string>>> }>} modules
 */

/** @type {Map<string, ReleaseManifest>} */
const manifests = new Map();

export const PLATFORM_API = 1;

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
  const manifest = await response.json();
  if (manifest.platformApi !== PLATFORM_API) return null;
  manifests.set(version, manifest);
  return manifest;
}

/** For tests. */
export function clearManifests() {
  manifests.clear();
}
