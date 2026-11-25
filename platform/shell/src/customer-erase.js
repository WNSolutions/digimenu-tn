// @ts-check
/**
 * Erasing one customer record (ADR-0010 §7), shared by deletion on request (Admin, Clients
 * tab) and the retention rule (D-067: no order for 24 months).
 *
 * Modules erase their part first (`customer.records`, fail-closed: an error stops everything).
 * Then one batch: every order loses its customer link, contact and free-text notes (lines and
 * totals stay, anonymous, for sales counts), and the consents and the record are deleted. A
 * deletion on request also puts the number's keyed hash on the suppression list; retention
 * does not, since the person did not ask.
 */
import { isoNow } from './clock.js';
import { runCustomerErase } from './module-host.js';

/**
 * @param {import('./module-host.js').HostEnv} env
 * @param {{ id: unknown, phone_idx: unknown }} row   the customer record
 * @param {{ suppress: boolean, now: Date }} o
 * @returns {Promise<{ orders: number, moduleRows: number }>}  throws if a module cannot erase
 */
export async function eraseCustomer(env, row, o) {
  const id = String(row.id);
  const modules = await runCustomerErase(env, id, o.now);
  const orders = (
    await env.DB.prepare('SELECT id, lines FROM orders WHERE customer_id = ?1').bind(id).all()
  ).results;
  const writes = [
    ...(o.suppress
      ? [
          env.DB.prepare(
            'INSERT INTO suppressions (phone_idx, since) VALUES (?1, ?2) ON CONFLICT DO NOTHING',
          ).bind(row.phone_idx, isoNow(o.now)),
        ]
      : []),
    ...orders.map((order) =>
      env.DB.prepare(
        `UPDATE orders SET customer_id = NULL, contact_ct = NULL, note = '', lines = ?1 WHERE id = ?2`,
      ).bind(withoutNotes(String(order.lines)), order.id),
    ),
    env.DB.prepare('DELETE FROM consents WHERE customer_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM customers WHERE id = ?1').bind(id),
  ];
  await env.DB.batch(writes);
  return { orders: orders.length, moduleRows: Object.values(modules).reduce((n, x) => n + x, 0) };
}

/** An order's lines without their free-text notes. @param {string} lines */
function withoutNotes(lines) {
  return JSON.stringify(
    JSON.parse(lines).map((/** @type {any} */ l) => {
      const rest = { ...l };
      delete rest.note;
      return rest;
    }),
  );
}
