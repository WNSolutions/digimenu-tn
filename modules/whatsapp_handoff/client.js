// @ts-check
/**
 * whatsapp_handoff (M-03), customer side: "Commander par WhatsApp" in Ma liste (D-063).
 *
 * The customer's own WhatsApp opens to the café's number with the order already written: table,
 * lines, notes, total. The customer presses Send. Nothing is sent by DigiMenu itself, so it is
 * free and needs no WhatsApp Business account (ADR-0007). From Sprint 2 the order is stored
 * first and the reference is the server's order number; until then the reference is made on
 * the phone.
 *
 * Imports nothing: everything comes from `api` (MOD-02). The type import below is for the
 * checker only and is not loaded.
 */

/** @typedef {import('../../core/app/extensions.js').ModuleApi} ModuleApi */
/** @typedef {import('../../core/app/extensions.js').ListActionContext} ListActionContext */
/** @typedef {import('../../core/i18n.js').Lang} Lang */

/** Letters and digits that cannot be mixed up when read aloud or on a small screen. */
const REF_ALPHABET = 'ACDEFHJKMNPRTVWXY34679';

/**
 * A short order reference, e.g. "K7PX".
 * @param {(n: number) => Uint8Array} [random]
 */
export function makeRef(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(random(4), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

/**
 * @typedef {object} MessageInput
 * @property {import('../../core/i18n.js').LocalizedText} cafeName
 * @property {string | null} table        a checked table label, or null
 * @property {string} ref                 the order number (or a phone-made reference)
 * @property {{ qty: number, name: import('../../core/i18n.js').LocalizedText,
 *   variantName?: import('../../core/i18n.js').LocalizedText, total: number, note?: string }[]} lines
 * @property {string} note
 * @property {number} total
 * @property {Lang} customerLang
 */

/**
 * The message staff receive, in the café's language (or the one set in the settings).
 * @param {MessageInput} m
 * @param {{ lang: Lang, t: (key: string, vars?: Record<string, string | number>) => string,
 *   pick: ModuleApi['pick'], price: ModuleApi['price'] }} o
 */
export function composeMessage(m, o) {
  const { t, price, lang } = o;
  /** @param {import('../../core/i18n.js').LocalizedText | undefined} text */
  const name = (text) => (text ? o.pick(text, lang).text : '');
  const out = [
    t('msg.title', { cafe: name(m.cafeName) }),
    m.table ? t('msg.dineIn', { table: m.table }) : t('msg.noTable'),
    t('msg.ref', { ref: m.ref }),
    '',
  ];
  for (const line of m.lines) {
    const label = [name(line.name), name(line.variantName)].filter(Boolean).join(' · ');
    out.push(t('msg.line', { qty: line.qty, name: label, price: price(line.total) }));
    if (line.note) out.push(t('msg.lineNote', { note: line.note }));
  }
  out.push('');
  if (m.note) out.push(t('msg.orderNote', { note: m.note }));
  out.push(t('msg.total', { total: price(m.total) }));
  if (m.customerLang !== lang)
    out.push(t('msg.customerLang', { lang: t(`lang.${m.customerLang}`) }));
  out.push('', t('msg.footer'));
  return out.join('\n');
}

/**
 * The message for a list that is not stored (no server: standalone demo).
 * @param {ListActionContext} c
 * @param {{ lang: Lang, ref: string, t: (key: string, vars?: Record<string, string | number>) => string,
 *   pick: ModuleApi['pick'], price: ModuleApi['price'] }} o
 */
export function buildMessage(c, o) {
  const lines = [];
  for (const row of c.checked.lines) {
    if ((row.status !== 'ok' && row.status !== 'price_changed') || !row.entry) continue;
    lines.push({
      qty: row.line.qty,
      name: row.entry.item.name,
      ...(row.entry.variant.name ? { variantName: row.entry.variant.name } : {}),
      total: row.total,
      ...(row.line.note ? { note: row.line.note } : {}),
    });
  }
  return composeMessage(
    {
      cafeName: c.cafe.name,
      table: c.table?.valid ? c.table.label : null,
      ref: o.ref,
      lines,
      note: c.note,
      total: c.checked.total,
      customerLang: c.lang,
    },
    o,
  );
}

/**
 * The wa.me link. Without a number (demo café only) WhatsApp asks whom to send it to.
 * @param {string | undefined} number  "+216…"
 * @param {string} text
 */
export function whatsappLink(number, text) {
  const digits = (number ?? '').replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** @param {ModuleApi} api */
export default function register(api) {
  const number = typeof api.settings.number === 'string' ? api.settings.number : undefined;
  const fixed = api.settings.messageLanguage;
  /** One reference per list content, so the same order keeps the same reference. */
  const refs = new Map();

  api.contribute('list.action', (c) => {
    if (c.checked.count === 0) return null;
    const lang = /** @type {Lang} */ (
      fixed === 'fr' || fixed === 'ar' || fixed === 'en' ? fixed : c.cafe.languages.default
    );
    const content = JSON.stringify([c.checked.lines.map((l) => [l.key, l.line.qty]), c.note]);
    if (!refs.has(content)) refs.set(content, makeRef());
    const text = buildMessage(c, {
      lang,
      ref: refs.get(content),
      t: api.texts(lang),
      pick: api.pick,
      price: api.price,
    });
    const own = api.texts(c.lang);
    const o = { lang, t: api.texts(lang), pick: api.pick, price: api.price };
    return {
      kind: 'checkout',
      // Without a server (standalone demo) the core opens this link directly.
      href: whatsappLink(number, text),
      label: own('action.label'),
      icon: 'message-circle',
      note: own('action.note'),
      after: own('action.after'),
      // Once the order is stored, the message carries its number of the day (ADR-0007).
      complete: (order) => ({
        href: whatsappLink(
          number,
          composeMessage(
            {
              cafeName: c.cafe.name,
              table: order.table,
              ref: order.number,
              lines: order.lines,
              note: order.note,
              total: order.total,
              customerLang: c.lang,
            },
            o,
          ),
        ),
        label: own('done.open'),
        note: own('done.note'),
      }),
    };
  });
}
