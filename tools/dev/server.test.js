// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './server.js';

const get = (/** @type {string} */ path) => handle('GET', new URL(path, 'http://localhost'));

test('table links and café pages get the static boot page', async () => {
  for (const path of ['/demo/t/5', '/demo/t/T1', '/demo', '/demo/']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.match(String(res.body), /<script type="module" src="\/boot.js">/);
  }
  assert.equal((await get('/')).location, '/demo/t/5?k=7QF3K9');
});

test('/api/boot answers for the demo café and checks the table code', async () => {
  const ok = JSON.parse(String((await get('/api/boot?cafe=demo&t=5&k=7QF3K9')).body));
  assert.equal(ok.v, 1);
  assert.deepEqual(ok.table, { label: '5', valid: true });
  assert.equal(ok.release.entry, '/r/dev/app/main.js');
  assert.ok(ok.menu.categories.length > 0);

  const wrongCode = JSON.parse(String((await get('/api/boot?cafe=demo&t=5&k=AAAAAA')).body));
  assert.deepEqual(wrongCode.table, { label: '5', valid: false });
  const unknownTable = JSON.parse(String((await get('/api/boot?cafe=demo&t=99')).body));
  assert.equal(unknownTable.table, null, 'an unknown table opens the menu as "no table"');
  assert.equal((await get('/api/boot?cafe=nope')).status, 404);
});

test('release files come from core/ only, never tests or files outside it', async () => {
  const main = await get('/r/dev/app/main.js');
  assert.equal(main.status, 200);
  assert.match(String(main.type), /javascript/);
  assert.match(String((await get('/r/dev/i18n/fr.json')).type), /json/);
  assert.match(String((await get('/r/dev/app.css')).body), /--dm-bg/);
  assert.equal((await get('/r/dev/money.test.js')).status, 404);
  assert.equal((await get('/r/dev/../package.json')).status, 404);
  assert.equal((await get('/r/dev/%2e%2e/package.json')).status, 404);
  assert.equal((await handle('POST', new URL('http://localhost/api/boot'))).status, 405);
});
