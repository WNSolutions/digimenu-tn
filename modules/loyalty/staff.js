// @ts-check
/**
 * loyalty (M-15), staff side: the "Fidélité" tab (ADR-0013 §3, §5, §7).
 *
 * Staff scan the card's QR code with the phone's camera, or type its number or the customer's
 * phone number, then: add a stamp for a purchase paid at the counter (one every 10 minutes, with
 * "Annuler" right after), use a reward (two taps), or give a one-time code that opens the card
 * on a new phone (after checking the customer has the number).
 *
 * Imports nothing: everything comes from `api` (platform/admin/staff-api.js).
 */

/** @typedef {import('../../platform/admin/staff-api.js').StaffApi} StaffApi */

/** Phone number or card number? Digits only (8 or more), or starting with "+", is a phone. */
export function looksLikePhone(/** @type {string} */ value) {
  const v = value.replace(/[\s.-]/g, '');
  return /^\+?\d{8,15}$/.test(v);
}

/** @param {StaffApi} api */
export function panel(api) {
  const { h, t } = api;
  return {
    label: t('tab'),
    /** @param {HTMLElement} root */
    render(root) {
      const input = h('input', {
        class: 'a-input',
        id: 'loyalty-find',
        dir: 'ltr',
        autocomplete: 'off',
        autocapitalize: 'characters',
        spellcheck: 'false',
        maxlength: 20,
      });
      const message = h('p', { class: 'a-muted', role: 'status' });
      const result = h('div', { class: 'a-stack' });
      /** @type {Record<string, unknown>} */
      let query = {};

      /** @param {string} text @param {'ok' | 'error' | 'muted'} [tone] */
      const say = (text, tone = 'muted') => {
        message.className = tone === 'ok' ? 'a-ok' : tone === 'error' ? 'a-error' : 'a-muted';
        message.textContent = text;
      };

      /** @param {string} route @param {string} [done] */
      async function act(route, done) {
        const res = await api.call(route, query);
        if (res.status === 200) {
          if (done) say(t(done), 'ok');
          show(res.data);
        } else if (res.status === 404) {
          say(t('unknown'), 'error');
          result.replaceChildren();
        } else if (res.data?.error === 'too_soon') {
          say(t('tooSoon'), 'error');
          if (res.data.card) show(res.data.card);
        } else if (res.data?.error === 'no_reward') {
          say(t('noReward'), 'error');
        } else if (res.data?.error === 'bad_qr' || res.data?.error === 'qr_expired') {
          say(t(res.data.error === 'bad_qr' ? 'badQr' : 'qrExpired'), 'error');
          result.replaceChildren();
        } else {
          say(t('error'), 'error');
        }
      }

      /** @param {any} card */
      function show(card) {
        // Once found (typed or scanned), the next taps name the card by its number.
        query = { number: card.number };
        const reward = card.reward?.[api.lang] || card.reward?.fr || '';
        const actions = h('div', { class: 'a-row' });
        const stamp = h(
          'button',
          {
            type: 'button',
            class: 'a-btn a-btn--main',
            onclick: () => act('stamp', 'stamped'),
          },
          t('stamp'),
        );
        actions.append(stamp);
        if (card.canUndo) {
          actions.append(
            h(
              'button',
              { type: 'button', class: 'a-btn', onclick: () => act('undo', 'undone') },
              t('undo'),
            ),
          );
        }
        if (card.rewards > 0) {
          let armed = false;
          const redeem = h(
            'button',
            {
              type: 'button',
              class: 'a-btn a-btn--danger',
              onclick: () => {
                if (!armed) {
                  armed = true;
                  redeem.textContent = t('redeem.confirm', { reward });
                  return;
                }
                act('redeem', 'redeemed');
              },
            },
            t('redeem'),
          );
          actions.append(redeem);
        }
        const transferBox = h('div', { class: 'a-stack' });
        const transfer = h(
          'button',
          {
            type: 'button',
            class: 'a-btn a-btn--link',
            onclick: () => {
              transferBox.replaceChildren(
                h('p', { class: 'a-note' }, t('transfer.check')),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'a-btn',
                    onclick: async () => {
                      const res = await api.call('transfer', query);
                      if (res.status !== 200) return say(t('error'), 'error');
                      transferBox.replaceChildren(
                        h(
                          'p',
                          { class: 'a-number', dir: 'ltr' },
                          t('transfer.code', {
                            code: String(res.data.code).replace(/(.{5})(?=.)/, '$1 '),
                          }),
                        ),
                        h('p', { class: 'a-muted' }, t('transfer.how')),
                      );
                    },
                  },
                  t('transfer.confirm'),
                ),
              );
            },
          },
          t('transfer'),
        );
        result.replaceChildren(
          h(
            'article',
            { class: 'a-card a-stack' },
            h(
              'div',
              { class: 'a-row a-spread' },
              h('span', { class: 'a-number', dir: 'ltr' }, card.number),
              h(
                'span',
                { class: 'a-muted' },
                card.firstName
                  ? t('who', { name: card.firstName, last3: card.phoneLast3 })
                  : t('whoNoName', { last3: card.phoneLast3 }),
              ),
            ),
            h('strong', null, t('stamps', { stamps: card.stamps, needed: card.stampsNeeded })),
            h(
              'p',
              { class: card.rewards > 0 ? 'a-ok' : 'a-muted' },
              card.rewards > 1
                ? t('rewards', { n: card.rewards, reward })
                : card.rewards === 1
                  ? t('reward', { reward })
                  : t('toNext', { n: card.toNext, reward }),
            ),
            actions,
            h('p', { class: 'a-muted' }, t('stamp.help')),
            transfer,
            transferBox,
          ),
        );
      }

      const form = h(
        'form',
        {
          class: 'a-card a-stack',
          onsubmit: (/** @type {Event} */ e) => {
            e.preventDefault();
            const value = /** @type {HTMLInputElement} */ (input).value.trim();
            if (!value) return;
            query = looksLikePhone(value) ? { phone: value } : { number: value };
            say('');
            act('find');
          },
        },
        h('label', { class: 'a-label', for: 'loyalty-find' }, t('find.label')),
        h(
          'div',
          { class: 'a-row' },
          input,
          h('button', { type: 'submit', class: 'a-btn' }, t('find.btn')),
          h(
            'button',
            {
              type: 'button',
              class: 'a-btn a-btn--main',
              onclick: async () => {
                const text = await api.scan();
                if (!text) return;
                query = { qr: text };
                say('');
                act('find');
              },
            },
            t('scan'),
          ),
        ),
        h('p', { class: 'a-muted' }, t('find.help')),
      );
      root.replaceChildren(form, message, result);
    },
  };
}
