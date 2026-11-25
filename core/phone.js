// @ts-check
/**
 * Phone numbers as customers type them: "20 123 456", "+216 20123456", "0021620123456".
 * Normalised to E.164 ("+21620123456"). Tunisian numbers have 8 digits; other countries are
 * accepted in international form. Not verified (no SMS, D-030).
 * @param {string} input
 * @returns {string | null}
 */
export function normalizePhone(input) {
  const raw = String(input ?? '').replace(/[\s.\-()/]/g, '');
  if (/^[2-9]\d{7}$/.test(raw)) return `+216${raw}`;
  const intl = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  if (/^\+216[2-9]\d{7}$/.test(intl)) return intl;
  if (/^\+(?!216)[1-9]\d{6,14}$/.test(intl)) return intl;
  return null;
}
