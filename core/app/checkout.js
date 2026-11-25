// @ts-check
/**
 * Checkout (overview, main flow 3): the customer's first name and phone, the short privacy
 * notice, an unticked marketing choice, then one button. The order is stored on the server
 * first; only then does the channel's next step appear (e.g. "Ouvrir WhatsApp" with the order
 * number, D-063). Nothing is sent later behind the customer's back: a failure says so and
 * offers "Montrer au serveur".
 */
import { h, icon, bdi } from './dom.js';
import { openSheet } from './sheet.js';
import { openWaiter } from './list-view.js';
import { emptyList } from '../list.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./extensions.js').ListAction & { key: string }} Channel */

const DETAILS_KEY = 'dm:details';

/** @param {number} [bytes] */
function randomKey(bytes = 18) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** Name and phone typed before, kept only on this phone (ADR-0010: pre-fill from the browser). */
function savedDetails() {
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return { firstName: String(d?.firstName ?? ''), phone: String(d?.phone ?? '') };
  } catch {
    return { firstName: '', phone: '' };
  }
}

/** @param {{ firstName: string, phone: string }} d */
function saveDetails(d) {
  try {
    localStorage.setItem(DETAILS_KEY, JSON.stringify(d));
  } catch {
    /* storage blocked: the customer types it again next time */
  }
}

/** Server error codes → text keys. */
const ERRORS = /** @type {Record<string, string>} */ ({
  unavailable: 'checkout.err.unavailable',
  table_code: 'checkout.err.table',
  closed: 'checkout.err.closed',
  paused: 'checkout.err.closed',
  customer_details: 'checkout.err.details',
  notice_changed: 'checkout.err.notice',
  too_many_orders: 'checkout.err.busy',
  ordering_off: 'checkout.err.off',
});

/**
 * @param {Ctx} ctx
 * @param {Channel} channel
 */
export function openCheckout(ctx, channel) {
  const { t } = ctx;
  const boot = ctx.boot;
  const type = boot.table?.valid ? 'dine_in' : 'takeaway';
  const accepted = boot.ordering?.types?.[type]?.includes(channel.key) ?? false;
  const checked = ctx.check();
  const required = type === 'takeaway' || boot.ordering?.dineInDetails !== 'optional';
  const clientKey = randomKey();
  const before = savedDetails();
  const privacy = boot.privacy;

  const content = h('div', { class: 'dm-checkout' });
  const actions = h('div', { class: 'dm-actions-stack' });
  const sheet = openSheet({
    title: t('checkout.title'),
    content,
    actions,
    size: 'large',
    closeLabel: t('sheet.close'),
    grabberLabels: [t('sheet.expand'), t('sheet.collapse')],
    lang: ctx.lang,
    dir: ctx.dir,
  });

  const where = h(
    'p',
    { class: 'dm-where' },
    type === 'dine_in' ? icon('utensils', 'dm-icon--text') : null,
    type === 'dine_in'
      ? t('checkout.where', {
          table: '⁨' + boot.table?.label + '⁩',
          total: '\u2068' + ctx.price(checked.total) + '\u2069',
        })
      : t('checkout.whereTakeaway', { total: '\u2068' + ctx.price(checked.total) + '\u2069' }),
  );
  const error = h('p', { class: 'dm-checkout-error', role: 'alert', hidden: true });

  if (!accepted || !privacy) {
    content.replaceChildren(
      where,
      h('p', { class: 'dm-checkout-error', role: 'alert' }, t('checkout.err.off')),
    );
    actions.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'dm-prominent', onclick: () => openWaiter(ctx) },
        t('list.showWaiter'),
      ),
    );
    return sheet;
  }

  const optional = required ? '' : ` (${t('checkout.optional')})`;
  const firstName = h('input', {
    class: 'dm-input',
    id: 'co-first',
    name: 'given-name',
    autocomplete: 'given-name',
    maxlength: 40,
    required,
  });
  firstName.value = before.firstName;
  const phone = h('input', {
    class: 'dm-input',
    id: 'co-phone',
    name: 'tel',
    type: 'tel',
    dir: 'ltr',
    inputmode: 'tel',
    autocomplete: 'tel',
    maxlength: 20,
    placeholder: t('checkout.phoneHint'),
    required,
  });
  phone.value = before.phone;
  const marketing = h('input', { type: 'checkbox', id: 'co-marketing' });
  const pick = (/** @type {Record<string, string> | undefined} */ text) =>
    ctx.pick(/** @type {import('../i18n.js').LocalizedText | undefined} */ (text)).text;
  const fullNotice = h('p', { class: 'dm-notice-full', hidden: true }, pick(privacy.full));

  /** @type {Node[]} */
  const fields = [
    where,
    h(
      'div',
      { class: 'dm-field' },
      h('label', { class: 'dm-field-label', for: 'co-first' }, t('checkout.firstName') + optional),
      firstName,
    ),
    h(
      'div',
      { class: 'dm-field' },
      h('label', { class: 'dm-field-label', for: 'co-phone' }, t('checkout.phone') + optional),
      phone,
    ),
  ];
  if (privacy.optIn?.marketing) {
    fields.push(
      h(
        'label',
        { class: 'dm-check', for: 'co-marketing' },
        marketing,
        h('span', null, pick(privacy.optIn.marketing)),
      ),
    );
  }
  fields.push(
    h('p', { class: 'dm-notice' }, pick(privacy.short)),
    h(
      'button',
      {
        type: 'button',
        class: 'dm-plain',
        'aria-expanded': 'false',
        onclick: (/** @type {Event} */ e) => {
          fullNotice.hidden = !fullNotice.hidden;
          /** @type {HTMLElement} */ (e.currentTarget).setAttribute(
            'aria-expanded',
            String(!fullNotice.hidden),
          );
        },
      },
      t('checkout.noticeMore'),
    ),
    fullNotice,
    error,
  );
  content.replaceChildren(...fields);

  const send = h(
    'button',
    { type: 'button', class: 'dm-prominent', onclick: submit },
    t('checkout.send'),
    ' · ',
    bdi(ctx.price(checked.total)),
  );
  actions.replaceChildren(send);

  /** @param {string} key */
  function fail(key) {
    error.textContent = t(key);
    error.hidden = false;
    send.disabled = false;
    send.replaceChildren(t('checkout.send'), ' · ', bdi(ctx.price(checked.total)));
    actions.replaceChildren(
      send,
      h(
        'button',
        { type: 'button', class: 'dm-plain dm-plain--center', onclick: () => openWaiter(ctx) },
        t('list.showWaiter'),
      ),
    );
  }

  async function submit() {
    if (send.disabled) return;
    const details = { firstName: firstName.value.trim(), phone: phone.value.trim() };
    if (required && (!details.firstName || !details.phone)) return fail('checkout.err.details');
    send.disabled = true;
    send.replaceChildren(t('checkout.sending'));
    error.hidden = true;
    const lines = checked.lines
      .filter((c) => c.status === 'ok' || c.status === 'price_changed')
      .map((c) => ({
        variantId: c.line.variantId,
        qty: c.line.qty,
        ...(c.line.note ? { note: c.line.note } : {}),
      }));
    /** @type {Response} */
    let response;
    try {
      response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          cafe: boot.cafe.slug,
          clientKey,
          type,
          channel: channel.key,
          ...(type === 'dine_in' ? { table: boot.table?.label, code: boot.table?.code } : {}),
          lines,
          note: ctx.list.note,
          lang: ctx.lang,
          ...(details.firstName || details.phone ? { customer: details } : {}),
          consents: { orderUpdates: true, marketing: marketing.checked },
          noticeVersion: privacy?.version,
        }),
      });
    } catch {
      return fail('checkout.err.network');
    }
    /** @type {any} */
    const out = await response.json().catch(() => ({}));
    if (!response.ok) return fail(ERRORS[out?.error] ?? 'checkout.err.network');

    if (details.firstName || details.phone) saveDetails(details);
    ctx.setList(emptyList());
    const next = channel.complete?.(out);
    ctx.announce(t('checkout.saved', { number: out.number }));
    content.replaceChildren(
      h(
        'div',
        { class: 'dm-done' },
        h('p', { class: 'dm-done-title' }, t('checkout.savedTitle')),
        bdi(out.number, 'dm-ticket-number'),
        next?.note ? h('p', { class: 'dm-actions-note' }, next.note) : null,
      ),
    );
    actions.replaceChildren(
      next
        ? h(
            'a',
            {
              class: 'dm-prominent',
              href: next.href,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            channel.icon ? icon(channel.icon) : null,
            next.label,
          )
        : h(
            'button',
            { type: 'button', class: 'dm-prominent', onclick: () => sheet.close() },
            t('list.backToMenu'),
          ),
    );
  }

  return sheet;
}
