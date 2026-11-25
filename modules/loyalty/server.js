// @ts-check
/**
 * loyalty (M-15), server side: a stamp card per customer and café (ADR-0013, D-064).
 *
 * - A card is made when the customer ticks "Rejoindre la fidélité" at checkout (consent
 *   `loyalty`). Its secret token goes only to that phone, once; the phone opens the card with it.
 * - A stamp needs a staff action (ADR-0013 §3): an order accepted on the staff screen (or a
 *   WhatsApp order marked "Reçue"), or "Ajouter un tampon" at the counter. A rejected order
 *   takes its stamp back. A customer can never add a stamp alone.
 * - A typed phone number is never enough to see or use a card: no SMS can check it (D-030).
 *   The card number and token are never sent to a phone that did not create the card; a new
 *   phone gets the card through a one-time code staff give after checking the customer.
 * - Rewards are used with staff only.
 *
 * Imports nothing from the platform: everything comes in `api` (module-host.js).
 */

/** @typedef {import('../../platform/shell/src/module-host.js').ServerApi} ServerApi */
/** @typedef {import('../../platform/shell/src/module-host.js').RouteAnswer} RouteAnswer */

/** Letters and digits that cannot be mixed up when read aloud or on a small screen. */
export const ALPHABET = 'ACDEFHJKMNPRTVWXY34679';
const NUMBER_LENGTH = 6;
const TRANSFER_LENGTH = 10;
const TRANSFER_MINUTES = 15;
const UNDO_MINUTES = 10;
const STAFF_ROLES = ['staff', 'manager', 'admin'];

/**
 * The café's rule, with safe defaults (settings.schema.json).
 * @param {any} settings
 */
export function rule(settings) {
  const n = settings?.stampsNeeded;
  const min = settings?.minOrderTotal;
  return {
    stampsNeeded: Number.isInteger(n) && n >= 2 && n <= 50 ? n : 10,
    reward:
      settings?.reward && typeof settings.reward.fr === 'string'
        ? settings.reward
        : { fr: 'Une récompense', ar: 'مكافأة', en: 'A reward' },
    minOrderTotal: Number.isSafeInteger(min) && min > 0 ? min : 0,
  };
}

/**
 * @param {number} length
 * @param {(n: number) => Uint8Array} [random]
 */
export function code(length, random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(random(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** What staff type: spaces, dashes and case do not matter. */
export function cleanCode(/** @type {unknown} */ value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/**
 * Stamps on a card, and rewards ready.
 * @param {ServerApi} api
 * @param {string} cardId
 */
export async function balance(api, cardId) {
  const { stampsNeeded, reward } = rule(api.settings);
  const row = await api.db
    .prepare(
      `SELECT COALESCE(SUM(CASE kind WHEN 'earn' THEN units ELSE -units END), 0) AS stamps
         FROM loyalty_ledger WHERE card_id = ?1`,
    )
    .bind(cardId)
    .first();
  const stamps = Math.max(0, Number(row?.stamps ?? 0));
  return {
    stamps,
    stampsNeeded,
    rewards: Math.floor(stamps / stampsNeeded),
    toNext: stampsNeeded - (stamps % stampsNeeded),
    reward,
  };
}

/**
 * @param {ServerApi} api
 * @param {string} where   SQL condition on `lc`
 * @param {unknown[]} values  bound from ?2
 */
async function findCard(api, where, values) {
  return api.db
    .prepare(
      `SELECT lc.id, lc.number, lc.status, lc.customer_id, lc.token_ct, lc.created_order_id
         FROM loyalty_cards lc WHERE lc.cafe_id = ?1 AND ${where}`,
    )
    .bind(api.cafe.id, ...values)
    .first();
}

/**
 * A card number not used yet in this café.
 * @param {ServerApi} api
 */
async function freeNumber(api) {
  for (let i = 0; i < 5; i++) {
    const number = code(NUMBER_LENGTH);
    if (!(await findCard(api, 'lc.number = ?2', [number]))) return number;
  }
  throw new Error('no free card number');
}

/**
 * The card as the customer's phone sees it: no name, no phone number.
 * @param {ServerApi} api
 * @param {any} card
 */
async function customerView(api, card) {
  return { number: String(card.number), ...(await balance(api, String(card.id))) };
}

/**
 * order.afterStore: makes the card when the customer joined, and tells the phone what happens.
 * Runs again on a retried order, so it answers the same way twice.
 * @param {ServerApi} api
 * @param {import('../../platform/shell/src/module-host.js').StoredOrderEvent} event
 */
export async function afterStore(api, { order, consents, input }) {
  if (!order.customerId) return null;
  if (!api.crypto) return null;
  const card = await findCard(api, 'lc.customer_id = ?2', [order.customerId]);
  const held = /** @type {any} */ (input)?.token;

  // The phone that made the card (or a retry of the order that made it) gets the token.
  if (card && card.status === 'active' && card.created_order_id === order.id) {
    const token = await api.crypto.open(String(card.token_ct));
    return { joined: true, token, ...(await customerView(api, card)) };
  }

  if (consents.loyalty === true && (!card || card.status === 'left')) {
    const token = newToken();
    const tokenHash = await api.sha256(token);
    const tokenCt = await api.crypto.seal(token);
    if (card) {
      // Joining again after leaving: same card number, new token, no stamps (they were cleared).
      await api.db
        .prepare(
          `UPDATE loyalty_cards SET status = 'active', left_at = NULL, token_sha256 = ?1, token_ct = ?2,
                  created_order_id = ?3, transfer_sha256 = NULL, transfer_until = NULL
            WHERE id = ?4 AND cafe_id = ?5`,
        )
        .bind(tokenHash, tokenCt, order.id, card.id, api.cafe.id)
        .run();
      return { joined: true, token, ...(await customerView(api, card)) };
    }
    const id = api.id();
    const number = await freeNumber(api);
    await api.db
      .prepare(
        `INSERT INTO loyalty_cards (id, cafe_id, customer_id, number, token_sha256, token_ct, created_order_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(id, api.cafe.id, order.customerId, number, tokenHash, tokenCt, order.id, api.iso())
      .run();
    return { joined: true, token, ...(await customerView(api, { id, number })) };
  }

  // A member ordering from the phone that holds the card: show the card's state.
  if (card && card.status === 'active' && typeof held === 'string' && TOKEN.test(held)) {
    const same = await findCard(api, 'lc.token_sha256 = ?2 AND lc.customer_id = ?3', [
      await api.sha256(held),
      order.customerId,
    ]);
    if (same) return { member: true, ...(await customerView(api, card)) };
  }
  // Already a member but on another phone: say nothing that would reveal the card.
  if (card && card.status === 'active' && consents.loyalty === true) return { known: true };
  return null;
}

/**
 * order.statusChanged: a stamp when staff accept the order, taken back if it is rejected.
 * @param {ServerApi} api
 * @param {import('../../platform/shell/src/module-host.js').StatusEvent} event
 */
export async function statusChanged(api, { order, from, to, actor }) {
  if (!order.customerId) return;
  const card = await findCard(api, "lc.customer_id = ?2 AND lc.status = 'active'", [
    order.customerId,
  ]);
  if (!card) return;
  const { minOrderTotal } = rule(api.settings);
  if (to === 'accepted' && ['received', 'handoff', 'unconfirmed'].includes(from)) {
    if (order.total < minOrderTotal) return;
    await api.db
      .prepare(
        `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, order_id, source, staff_user_id, at)
         VALUES (?1, ?2, ?3, 'earn', 1, ?4, 'order', ?5, ?6) ON CONFLICT DO NOTHING`,
      )
      .bind(api.id(), api.cafe.id, card.id, order.id, actor.userId, api.iso())
      .run();
  }
  if (to === 'rejected' || to === 'cancelled') {
    const earned = await api.db
      .prepare(`SELECT card_id FROM loyalty_ledger WHERE order_id = ?1 AND kind = 'earn'`)
      .bind(order.id)
      .first();
    if (!earned) return;
    await api.db
      .prepare(
        `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, order_id, source, staff_user_id, at)
         VALUES (?1, ?2, ?3, 'reverse', 1, ?4, 'order', ?5, ?6) ON CONFLICT DO NOTHING`,
      )
      .bind(api.id(), api.cafe.id, earned.card_id, order.id, actor.userId, api.iso())
      .run();
  }
}

/** @param {number} status @param {unknown} body @returns {RouteAnswer} */
const answer = (status, body) => ({ status, body });

/**
 * @param {ServerApi} api
 * @param {unknown} token
 */
async function cardByToken(api, token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  return findCard(api, "lc.token_sha256 = ?2 AND lc.status = 'active'", [await api.sha256(token)]);
}

/** Customer calls: POST /api/m/loyalty/<route> { cafe, ... }. */
export const routes = {
  /** The card page: { token } → stamps and reward. */
  async card(/** @type {ServerApi} */ api, /** @type {any} */ body) {
    const card = await cardByToken(api, body.token);
    if (!card) return answer(404, { error: 'unknown_card' });
    return answer(200, await customerView(api, card));
  },

  /** A new phone: { code } given by staff → a new token (the old phone's link stops working). */
  async claim(/** @type {ServerApi} */ api, /** @type {any} */ body) {
    const given = cleanCode(body.code);
    if (given.length !== TRANSFER_LENGTH) return answer(422, { error: 'bad_code' });
    const card = await findCard(
      api,
      "lc.transfer_sha256 = ?2 AND lc.transfer_until > ?3 AND lc.status = 'active'",
      [await api.sha256(given), api.iso()],
    );
    if (!card) return answer(422, { error: 'bad_code' });
    if (!api.crypto) return answer(503, { error: 'unavailable' });
    const token = newToken();
    await api.db
      .prepare(
        `UPDATE loyalty_cards SET token_sha256 = ?1, token_ct = ?2, created_order_id = NULL,
                transfer_sha256 = NULL, transfer_until = NULL
          WHERE id = ?3 AND cafe_id = ?4`,
      )
      .bind(await api.sha256(token), await api.crypto.seal(token), card.id, api.cafe.id)
      .run();
    return answer(200, { token, ...(await customerView(api, card)) });
  },

  /** Leaving the programme: the card stops, its stamps are cleared, the choice is recorded. */
  async leave(/** @type {ServerApi} */ api, /** @type {any} */ body) {
    const card = await cardByToken(api, body.token);
    if (!card) return answer(404, { error: 'unknown_card' });
    const { stamps } = await balance(api, String(card.id));
    const notice = await api.db
      .prepare('SELECT version_no FROM privacy_notice_versions ORDER BY version_no DESC LIMIT 1')
      .first();
    const lang = ['fr', 'ar', 'en'].includes(body.lang) ? body.lang : 'fr';
    const writes = [
      api.db
        .prepare(
          `UPDATE loyalty_cards SET status = 'left', left_at = ?1, transfer_sha256 = NULL, transfer_until = NULL
            WHERE id = ?2 AND cafe_id = ?3`,
        )
        .bind(api.iso(), card.id, api.cafe.id),
    ];
    if (stamps > 0) {
      writes.push(
        api.db
          .prepare(
            `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, source, at) VALUES (?1, ?2, ?3, 'reverse', ?4, 'customer', ?5)`,
          )
          .bind(api.id(), api.cafe.id, card.id, stamps, api.iso()),
      );
    }
    if (notice) {
      writes.push(
        api.db
          .prepare(
            `INSERT INTO consents (id, customer_id, cafe_id, purpose, granted, notice_version, language, source, at)
             VALUES (?1, ?2, ?3, 'loyalty', 0, ?4, ?5, 'loyalty_card', ?6)`,
          )
          .bind(api.id(), card.customer_id, api.cafe.id, notice.version_no, lang, api.iso()),
      );
    }
    await api.db.batch(writes);
    return answer(200, { left: true });
  },
};

/**
 * The card as staff see it: first name and last three digits to check it is the right person.
 * @param {ServerApi} api
 * @param {any} card
 */
async function staffView(api, card) {
  const row = await api.db
    .prepare('SELECT pii_ct, phone_last3 FROM customers WHERE id = ?1')
    .bind(card.customer_id)
    .first();
  let firstName = '';
  if (row?.pii_ct && api.crypto) {
    try {
      firstName = String((await api.crypto.open(String(row.pii_ct))).firstName ?? '');
    } catch {
      firstName = '';
    }
  }
  const last = await api.db
    .prepare(
      `SELECT kind, at FROM loyalty_ledger WHERE card_id = ?1 AND source = 'staff' AND order_id IS NULL
        ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .bind(card.id)
    .first();
  const undoUntil =
    last?.kind === 'earn'
      ? new Date(Date.parse(String(last.at)) + UNDO_MINUTES * 60_000).toISOString()
      : null;
  return {
    number: String(card.number),
    firstName,
    phoneLast3: String(row?.phone_last3 ?? ''),
    ...(await balance(api, String(card.id))),
    canUndo: Boolean(undoUntil && undoUntil > api.now.toISOString()),
  };
}

/**
 * Finds the card staff asked for: by card number, or by phone number (customer at the counter).
 * @param {ServerApi} api
 * @param {any} body
 */
async function staffCard(api, body) {
  if (body.phone) {
    const phone = api.normalizePhone(String(body.phone));
    if (!phone || !api.crypto) return null;
    const customer = await api.db
      .prepare('SELECT id FROM customers WHERE phone_idx = ?1')
      .bind(await api.crypto.lookup(phone))
      .first();
    if (!customer) return null;
    return findCard(api, "lc.customer_id = ?2 AND lc.status = 'active'", [customer.id]);
  }
  const number = cleanCode(body.number);
  if (number.length !== NUMBER_LENGTH) return null;
  return findCard(api, "lc.number = ?2 AND lc.status = 'active'", [number]);
}

/** Staff calls: POST /admin/api/m/loyalty/<route> { cafe, number | phone }. */
export const staff = {
  roles: {
    find: STAFF_ROLES,
    stamp: STAFF_ROLES,
    undo: STAFF_ROLES,
    redeem: STAFF_ROLES,
    transfer: STAFF_ROLES,
  },
  routes: {
    async find(
      /** @type {ServerApi} */ api,
      /** @type {any} */ body,
      /** @type {{ userId: string, role: string }} */ actor,
    ) {
      const card = await staffCard(api, body);
      if (!card) return answer(404, { error: 'unknown_card' });
      // Opening a card shows a customer's first name: every opening is in the audit log.
      await api.audit(body.phone ? 'find_by_phone' : 'find', String(card.id), actor);
      return answer(200, await staffView(api, card));
    },

    /** A stamp at the counter (a purchase not ordered through DigiMenu). */
    async stamp(
      /** @type {ServerApi} */ api,
      /** @type {any} */ body,
      /** @type {{ userId: string, role: string }} */ actor,
    ) {
      const card = await staffCard(api, body);
      if (!card) return answer(404, { error: 'unknown_card' });
      // One counter stamp per card every 10 minutes, so a double tap cannot add two.
      const view = await staffView(api, card);
      if (view.canUndo) return answer(409, { error: 'too_soon', card: view });
      await api.db
        .prepare(
          `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, source, staff_user_id, at)
           VALUES (?1, ?2, ?3, 'earn', 1, 'staff', ?4, ?5)`,
        )
        .bind(api.id(), api.cafe.id, card.id, actor.userId, api.iso())
        .run();
      await api.audit('stamp', String(card.id), actor);
      return answer(200, await staffView(api, card));
    },

    /** Takes back the last counter stamp (within 10 minutes). */
    async undo(
      /** @type {ServerApi} */ api,
      /** @type {any} */ body,
      /** @type {{ userId: string, role: string }} */ actor,
    ) {
      const card = await staffCard(api, body);
      if (!card) return answer(404, { error: 'unknown_card' });
      if (!(await staffView(api, card)).canUndo) return answer(409, { error: 'nothing_to_undo' });
      await api.db
        .prepare(
          `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, source, staff_user_id, at)
           VALUES (?1, ?2, ?3, 'reverse', 1, 'staff', ?4, ?5)`,
        )
        .bind(api.id(), api.cafe.id, card.id, actor.userId, api.iso())
        .run();
      await api.audit('undo', String(card.id), actor);
      return answer(200, await staffView(api, card));
    },

    /** The customer uses a reward: the stamps it needed are taken off. */
    async redeem(
      /** @type {ServerApi} */ api,
      /** @type {any} */ body,
      /** @type {{ userId: string, role: string }} */ actor,
    ) {
      const card = await staffCard(api, body);
      if (!card) return answer(404, { error: 'unknown_card' });
      const now = await balance(api, String(card.id));
      if (now.rewards < 1) return answer(409, { error: 'no_reward' });
      await api.db
        .prepare(
          `INSERT INTO loyalty_ledger (id, cafe_id, card_id, kind, units, source, staff_user_id, at)
           VALUES (?1, ?2, ?3, 'redeem', ?4, 'staff', ?5, ?6)`,
        )
        .bind(api.id(), api.cafe.id, card.id, now.stampsNeeded, actor.userId, api.iso())
        .run();
      await api.audit('redeem', String(card.id), actor);
      return answer(200, await staffView(api, card));
    },

    /**
     * A one-time code to open the card on a new phone, after staff checked the customer has the
     * number (for example the customer calls the café from it).
     */
    async transfer(
      /** @type {ServerApi} */ api,
      /** @type {any} */ body,
      /** @type {{ userId: string, role: string }} */ actor,
    ) {
      const card = await staffCard(api, body);
      if (!card) return answer(404, { error: 'unknown_card' });
      const given = code(TRANSFER_LENGTH);
      const until = new Date(api.now.getTime() + TRANSFER_MINUTES * 60_000);
      await api.db
        .prepare(
          'UPDATE loyalty_cards SET transfer_sha256 = ?1, transfer_until = ?2 WHERE id = ?3 AND cafe_id = ?4',
        )
        .bind(await api.sha256(given), api.iso(until), card.id, api.cafe.id)
        .run();
      await api.audit('transfer', String(card.id), actor);
      return answer(200, { code: given, until: api.iso(until) });
    },
  },
};
