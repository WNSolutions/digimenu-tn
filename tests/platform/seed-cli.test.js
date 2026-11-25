// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('the seed command adds the privacy notice before the café when --notice is given', () => {
  const out = execFileSync(
    process.execPath,
    [
      'tools/seed/seed.js',
      '--cafe',
      'cafes/demo',
      '--release',
      '0.1.0',
      '--replace',
      '--notice',
      'tools/seed/demo-privacy-notice.json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  const notice = out.indexOf('INSERT INTO privacy_notice_versions');
  assert.ok(notice >= 0, 'notice inserted');
  assert.ok(notice < out.indexOf('INSERT INTO cafes'), 'before the café');
  assert.match(out, /ON CONFLICT \(version_no\) DO NOTHING/);
});
