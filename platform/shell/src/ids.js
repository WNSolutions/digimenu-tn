// @ts-check
/** ULIDs: sortable by time, generated in code (data-model rules). */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * @param {number} [time]
 * @param {(n: number) => Uint8Array} [random]
 */
export function ulid(time = Date.now(), random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let t = time;
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[t % 32] + head;
    t = Math.floor(t / 32);
  }
  const tail = Array.from(random(16), (b) => CROCKFORD[b % 32]).join('');
  return head + tail;
}
