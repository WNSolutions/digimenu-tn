// @ts-check
/**
 * loyalty (M-15), customer side (ADR-0013).
 *
 * - "Fidélité" in the top bar opens the card (also at /<café>/carte, for the home screen).
 * - Checkout: an unticked "Rejoindre la fidélité" (the privacy notice's own text) with the rule
 *   under it; a phone that already holds a card sends it instead, so the order shows its stamps.
 * - After the order: the card's secret token is kept on this phone only, and the customer can
 *   open the card. The stamp itself is added on the server when staff confirm the order.
 * - The card shows the stamps, the reward and the card number to give at the counter. A new
 *   phone opens the card with a one-time code from staff. Leaving clears the stamps.
 *
 * Imports nothing: everything comes from `api` (MOD-02). The type imports are for the checker.
 */

/** @typedef {import('../../core/app/extensions.js').ModuleApi} ModuleApi */
/** @typedef {import('../../core/app/extensions.js').Block} Block */
/** @typedef {import('../../core/i18n.js').Lang} Lang */

const TOKEN = 'card';
const LAST = 'last';

/**
 * @typedef {object} CardView
 * @property {string} number
 * @property {number} stamps
 * @property {number} stampsNeeded
 * @property {number} rewards
 * @property {number} toNext
 * @property {import('../../core/i18n.js').LocalizedText} reward
 * @property {{ rows: string[], until: string }} [qr]   signed by the server, valid until `until`
 */

/**
 * The card as blocks.
 * @param {CardView} card
 * @param {{ t: (key: string, vars?: Record<string, string | number>) => string,
 *   reward: string, now?: Date }} o
 * @returns {Block[]}
 */
export function cardBlocks(card, o) {
  const { t } = o;
  // A QR code past its time (a card saved while offline) is left out: staff type the number.
  const qr =
    card.qr &&
    Array.isArray(card.qr.rows) &&
    Date.parse(card.qr.until) > (o.now ?? new Date()).getTime()
      ? card.qr
      : null;
  const needed = card.stampsNeeded;
  const full = card.rewards > 0;
  /** @type {Block[]} */
  const blocks = [
    { kind: 'text', text: t('rule', { needed, reward: o.reward }) },
    {
      kind: 'stamps',
      filled: full ? needed : card.stamps % needed,
      total: needed,
      label: t('stampsLabel', { stamps: full ? needed : card.stamps % needed, needed }),
    },
    full
      ? {
          kind: 'text',
          tone: 'success',
          text:
            card.rewards > 1
              ? t('readyMany', { n: card.rewards, reward: o.reward })
              : t('ready', { reward: o.reward }),
        }
      : { kind: 'text', text: t('toNext', { n: card.toNext }) },
    ...(qr ? [/** @type {Block} */ ({ kind: 'qr', rows: qr.rows, label: t('qr.label') })] : []),
    { kind: 'code', label: t('number'), value: card.number },
    { kind: 'text', tone: 'muted', text: t(qr ? 'showQr' : 'show') },
  ];
  return blocks;
}

/** @param {ModuleApi} api */
export default function register(api) {
  const settings = /** @type {any} */ (api.settings);
  const needed = Number.isInteger(settings.stampsNeeded) ? settings.stampsNeeded : 10;
  const rewardOf = (/** @type {Lang} */ lang) =>
    api.pick(settings.reward ?? { fr: 'Une récompense' }, lang).text;

  /** @param {Lang} lang @param {string} [error] @returns {Block[]} */
  function noCard(lang, error) {
    const t = api.texts(lang);
    return [
      ...(error ? [/** @type {Block} */ ({ kind: 'text', tone: 'error', text: error })] : []),
      { kind: 'title', text: t('none.title') },
      { kind: 'text', text: t('rule', { needed, reward: rewardOf(lang) }) },
      { kind: 'text', text: t('none.join') },
      { kind: 'text', tone: 'muted', text: t('none.claim') },
      {
        kind: 'form',
        fields: [{ id: 'code', label: t('claim.label'), maxlength: 14, ltr: true }],
        submit: t('claim.submit'),
        run: async (values) => {
          const res = await api.call('claim', { code: values.code ?? '' });
          if (!res.ok) return noCard(lang, res.status === 0 ? t('offline') : t('claim.bad'));
          api.storage.set(TOKEN, String(res.data.token));
          api.storage.set(LAST, JSON.stringify(res.data));
          return withLeave(res.data, lang);
        },
      },
    ];
  }

  /** @param {CardView} card @param {Lang} lang @returns {Block[]} */
  function withLeave(card, lang) {
    const t = api.texts(lang);
    return [
      ...cardBlocks(card, { t, reward: rewardOf(lang) }),
      {
        kind: 'button',
        look: 'danger',
        label: t('leave'),
        confirm: t('leave.confirm'),
        run: async () => {
          const res = await api.call('leave', { token: api.storage.get(TOKEN) ?? '', lang });
          if (!res.ok && res.status !== 404) {
            return [{ kind: 'text', tone: 'error', text: t('offline') }, ...withLeave(card, lang)];
          }
          api.storage.remove(TOKEN);
          api.storage.remove(LAST);
          return [{ kind: 'text', tone: 'success', text: t('leave.done') }];
        },
      },
    ];
  }

  /** @param {{ lang: Lang }} c @returns {Promise<Block[]>} */
  async function view({ lang }) {
    const t = api.texts(lang);
    const token = api.storage.get(TOKEN);
    if (!token) return noCard(lang);
    const res = await api.call('card', { token });
    if (res.ok) {
      api.storage.set(LAST, JSON.stringify(res.data));
      return withLeave(res.data, lang);
    }
    if (res.status === 404) {
      api.storage.remove(TOKEN);
      api.storage.remove(LAST);
      return noCard(lang, t('lost'));
    }
    // Offline: the last card seen on this phone, with a word that it may be out of date.
    try {
      const last = JSON.parse(api.storage.get(LAST) ?? 'null');
      if (last?.number) {
        return [
          { kind: 'text', tone: 'muted', text: t('offline') },
          ...cardBlocks(last, { t, reward: rewardOf(lang) }),
        ];
      }
    } catch {
      /* nothing saved */
    }
    return [
      { kind: 'text', tone: 'error', text: t('offline') },
      { kind: 'button', label: t('retry'), run: () => view({ lang }) },
    ];
  }

  api.contribute('sheet.page', {
    id: 'card',
    path: 'carte',
    title: (lang) => api.texts(lang)('page.title'),
    view,
  });

  api.contribute('header.action', ({ lang }) => ({
    label: api.texts(lang)('header.label'),
    icon: 'gift',
    page: 'card',
  }));

  api.contribute('checkout.fields', ({ lang }) => {
    const t = api.texts(lang);
    const token = api.storage.get(TOKEN);
    if (token) return { fields: [{ kind: 'info', text: t('checkout.member') }], input: { token } };
    return {
      fields: [
        {
          kind: 'consent',
          purpose: 'loyalty',
          note: t('checkout.rule', { needed, reward: rewardOf(lang) }),
        },
      ],
    };
  });

  api.contribute('postOrder.block', ({ answer, lang }) => {
    const a = /** @type {any} */ (answer);
    if (!a) return null;
    const t = api.texts(lang);
    if (a.joined && typeof a.token === 'string') {
      api.storage.set(TOKEN, a.token);
      api.storage.set(LAST, JSON.stringify(a));
      return [
        { kind: 'text', tone: 'success', text: t('after.joined') },
        { kind: 'page', label: t('after.open'), page: 'card' },
      ];
    }
    if (a.member) {
      api.storage.set(LAST, JSON.stringify(a));
      return [
        a.rewards > 0
          ? { kind: 'text', tone: 'success', text: t('ready', { reward: rewardOf(lang) }) }
          : {
              kind: 'text',
              text: t('after.member', {
                stamps: a.stamps % a.stampsNeeded,
                needed: a.stampsNeeded,
              }),
            },
        { kind: 'page', label: t('after.open'), page: 'card' },
      ];
    }
    if (a.known) return [{ kind: 'text', tone: 'muted', text: t('after.known') }];
    return null;
  });
}
