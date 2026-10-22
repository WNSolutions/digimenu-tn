// @ts-check
/**
 * Smoke test: the first, simplest test of the project.
 *
 * It proves two things before any application code exists:
 *   1. the test runner works (`npm test` uses Node's built-in `node:test`, no extra library);
 *   2. the repository skeleton from ARCHITECTURE §8 is in place.
 *
 * Git does not store empty folders, so every top-level folder carries a README.md.
 * If this test fails after a clone, a folder or its README was deleted by mistake.
 *
 * Unit tests are named `*.test.js` and run with node:test. Browser tests added later
 * (Playwright) will be named `*.spec.js` so the two runners never pick up each other's files.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root (the folder above tests/). */
const root = fileURLToPath(new URL('..', import.meta.url));

/** Top-level folders of the public toolkit repo (ARCHITECTURE §8). */
const TOP_LEVEL_FOLDERS = ['platform', 'core', 'modules', 'cafes', 'tools', 'tests', 'docs'];

test('every top-level folder from ARCHITECTURE §8 exists and has a README.md', () => {
  for (const folder of TOP_LEVEL_FOLDERS) {
    const dir = path.join(root, folder);
    assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `missing folder: ${folder}/`);
    assert.ok(existsSync(path.join(dir, 'README.md')), `missing file: ${folder}/README.md`);
  }
});

test('the repository has a README at its root', () => {
  assert.ok(existsSync(path.join(root, 'README.md')), 'missing file: README.md');
});

test('package.json is set up for ES modules on Node 22', () => {
  /** @type {{ private?: boolean, type?: string, engines?: { node?: string } }} */
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(
    pkg.private,
    true,
    'package.json must keep "private": true (never published to npm)',
  );
  assert.equal(pkg.type, 'module', 'package.json must keep "type": "module" (ES modules)');
  assert.match(pkg.engines?.node ?? '', /^>=22/, 'package.json must require Node 22 or newer');

  const nvmrc = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  assert.equal(nvmrc, '22', '.nvmrc must pin the Node major version used by CI');
});
