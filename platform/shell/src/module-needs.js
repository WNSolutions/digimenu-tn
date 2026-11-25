// @ts-check
/**
 * Settings a module cannot work without (module.json `settings.needs`, e.g. the Google review
 * link of `google_review`). While one is missing, the module stays off for that café: the boot
 * answer leaves it out, its hooks do not run and its routes answer 404; the validator warns
 * (docs/architecture/modules.md, "Validation"). Switching it on is not an error: the café's
 * configuration stays valid and the module starts working once the setting is filled in.
 */

/**
 * The needed settings that are missing or empty.
 * @param {Record<string, unknown> | undefined} settings
 * @param {readonly string[] | undefined} needs
 * @returns {string[]}
 */
export function missingNeeds(settings, needs) {
  return (needs ?? []).filter((name) => {
    const v = settings?.[name];
    if (v === undefined || v === null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  });
}

/**
 * Validator warnings for the modules a café switched on without what they need.
 * @param {{ modules?: Record<string, { enabled: boolean, settings?: Record<string, unknown> }> }} config
 * @param {Record<string, readonly string[] | undefined>} needsByKey   module key → its needs
 * @returns {string[]}
 */
export function needsWarnings(config, needsByKey) {
  const out = [];
  for (const [key, m] of Object.entries(config.modules ?? {})) {
    if (!m?.enabled) continue;
    const missing = missingNeeds(m.settings, needsByKey[key]);
    if (missing.length)
      out.push(
        `${key} is switched on but has no ${missing.map((n) => `settings.${n}`).join(', ')}: it stays off until ${missing.length > 1 ? 'they are' : 'it is'} filled in.`,
      );
  }
  return out;
}
