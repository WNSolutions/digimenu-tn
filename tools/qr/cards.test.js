// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardLink, tableText, readTables, makeCards, domainIsLive } from './cards.js';
import { encodeQr } from '../../core/qr.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const demoDir = path.join(root, 'cafes/demo');
const tmp = () => mkdtempSync(path.join(tmpdir(), 'cards-'));

/** A fictional real café: the demo folder with another slug and status. */
function realCafe() {
  const dir = tmp();
  cpSync(demoDir, dir, { recursive: true });
  const info = JSON.parse(readFileSync(path.join(dir, 'info.json'), 'utf8'));
  writeFileSync(
    path.join(dir, 'info.json'),
    JSON.stringify({ ...info, slug: 'cafe-test', status: 'live' }),
  );
  return dir;
}

const live = /** @type {any} */ (
  async () => Response.json({ ok: true, environment: 'production' })
);
const preview = /** @type {any} */ (
  async () => Response.json({ ok: true, environment: 'preview' })
);

test('each card links to exactly its café and table, with the check code (ADR-0004)', () => {
  assert.equal(
    cardLink('https://digimenu.wnsolutions.tn/', 'demo', '5', '7QF3K9'),
    'https://digimenu.wnsolutions.tn/demo/t/5?k=7QF3K9',
  );
  assert.equal(
    cardLink('https://x.tn', 'demo', 'Terrasse 2', 'AB12'),
    'https://x.tn/demo/t/Terrasse%202?k=AB12',
  );
  assert.equal(tableText('7'), '07');
  assert.equal(tableText('12'), '12');
  assert.equal(tableText('t1'), 'T1');
  const tables = readTables(demoDir);
  assert.deepEqual(tables[4], { label: '5', code: '7QF3K9' });
  assert.equal(tables.length, 12);
});

test('demo cards: one page per table, marked DEMO, each QR code holding its link', async () => {
  const out = path.join(tmp(), 'cards.html');
  const { cards } = await makeCards({ base: 'https://preview.example', tables: '5,T1', out });
  assert.deepEqual(
    cards.map((c) => c.link),
    ['https://preview.example/demo/t/5?k=7QF3K9', 'https://preview.example/demo/t/T1?k=Z6CK3M'],
  );
  const html = readFileSync(out, 'utf8');
  assert.equal(html.match(/<section class="card">/g)?.length, 2);
  assert.equal(html.match(/<span class="demo">DEMO<\/span>/g)?.length, 2);
  assert.match(html, /TABLE 05/);
  assert.match(html, /TABLE T1/);
  assert.match(html, /Scan for the menu · Scannez pour le menu/);
  assert.match(html, /امسح للقائمة/);
  assert.match(html, /preview\.example\/demo</);
  assert.match(html, /@font-face\{font-family:'Jost'/, 'fonts are embedded');
  // The drawn modules are exactly the encoder's for that link.
  const rows = encodeQr(cards[0].link).rows;
  const dark = rows.join('').split('1').length - 1;
  const path0 = html.match(/<svg class="qr"[^>]*><path fill="#004532" d="([^"]+)"/)?.[1] ?? '';
  const drawn = [...path0.matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);
  assert.equal(drawn, dark);
});

test('cards to print: refused for the demo café, without a log, or before the domain is live', async () => {
  const out = path.join(tmp(), 'cards.html');
  await assert.rejects(
    makeCards({ print: true, log: 'x.csv', out }, { fetch: live }),
    /demo café gets demo cards only/,
  );
  const dir = realCafe();
  await assert.rejects(makeCards({ cafe: dir, print: true, out }, { fetch: live }), /--log/);
  const log = path.join(tmp(), 'printed-links.csv');
  await assert.rejects(
    makeCards({ cafe: dir, print: true, log, out }, { fetch: preview }),
    /refused until the domain is live/,
  );
  assert.equal(existsSync(log), false);
  await assert.rejects(makeCards({ cafe: dir, tables: '99', out }), /No such table/);
});

test('cards to print are not marked DEMO, and every link is appended to the printed-links log', async () => {
  const dir = realCafe();
  const out = path.join(tmp(), 'cards.html');
  const log = path.join(tmp(), 'printed-links.csv');
  const now = new Date('2026-12-01T09:00:00Z');
  await makeCards({ cafe: dir, print: true, log, out, tables: '1,2', now }, { fetch: live });
  await makeCards({ cafe: dir, print: true, log, out, tables: '1', now }, { fetch: live });
  assert.doesNotMatch(readFileSync(out, 'utf8'), /class="demo"/);
  assert.equal(
    readFileSync(log, 'utf8'),
    [
      'printed_at,cafe,table,link',
      '2026-12-01T09:00:00.000Z,cafe-test,1,https://digimenu.wnsolutions.tn/cafe-test/t/1?k=7QF3K2',
      '2026-12-01T09:00:00.000Z,cafe-test,2,https://digimenu.wnsolutions.tn/cafe-test/t/2?k=M4XH8D',
      '2026-12-01T09:00:00.000Z,cafe-test,1,https://digimenu.wnsolutions.tn/cafe-test/t/1?k=7QF3K2',
      '',
    ].join('\n'),
    'a reprint gives the same table the same link',
  );
});

test('the domain check needs the production server to answer', async () => {
  assert.equal(await domainIsLive('https://x.tn', live), true);
  assert.equal(await domainIsLive('https://x.tn', preview), false);
  const down = /** @type {any} */ (
    async () => {
      throw new Error('ENOTFOUND');
    }
  );
  assert.equal(await domainIsLive('https://x.tn', down), false);
});
