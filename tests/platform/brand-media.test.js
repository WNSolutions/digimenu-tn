// @ts-check
/**
 * The brand layer and café logos in the built site (D-068): DigiMenu's own screens get the
 * brand's styles, fonts and logo files; café menus get only the café's logo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRelease, BRAND_FONTS } from '../../tools/release/build.js';
import { logoUrl, bootBody } from '../../platform/shell/src/boot-body.js';
import { THEME_FONT_FILES } from '../../tools/release/build.js';

const tmp = (/** @type {string} */ name) => mkdtempSync(path.join(tmpdir(), name));

test('a build without --brand has the styles and fonts, and no logo files', async () => {
  const out = tmp('dm-site-');
  const result = await buildRelease({ version: '0.1.0', out });
  assert.deepEqual(result.brandFiles, []);
  assert.ok(existsSync(path.join(out, 'brand/brand.css')));
  for (const font of BRAND_FONTS) {
    assert.ok(existsSync(path.join(out, 'brand/fonts', path.basename(font))), font);
  }
  for (const licence of ['OFL-jost.txt', 'OFL-cairo.txt']) {
    assert.match(readFileSync(path.join(out, 'brand/fonts', licence), 'utf8'), /Open Font License/);
  }
  // The fonts are named by brand.css, and brand.css is not part of the customer page.
  const css = readFileSync(path.join(out, 'brand/brand.css'), 'utf8');
  for (const font of BRAND_FONTS) assert.ok(css.includes(`/brand/fonts/${path.basename(font)}`));
  const customerCss = readFileSync(path.join(out, result.manifest.css), 'utf8');
  assert.doesNotMatch(customerCss, /Jost|Cairo|#004532/i, 'no DigiMenu brand on café menus');
  assert.match(readFileSync(path.join(out, 'admin/admin.css'), 'utf8'), /Jost/);
  // The demo café's invented logo is public; real cafés' logos come only from --media.
  assert.ok(existsSync(path.join(out, 'media/demo/logo.svg')));
  assert.equal(result.logos, 1);
  const headers = readFileSync(path.join(out, '_headers'), 'utf8');
  assert.match(headers, /\/brand\/\*\n {2}Cache-Control: public, max-age=86400/);
  assert.match(headers, /\/media\/\*\n {2}Cache-Control: public, max-age=3600/);
});

test('--brand and --media copy image files only, under plain names', async () => {
  const brand = tmp('dm-brand-');
  writeFileSync(path.join(brand, 'digimenu-logo-reversed.svg'), '<svg/>');
  writeFileSync(path.join(brand, 'favicon-32.png'), 'png');
  writeFileSync(path.join(brand, 'README.md'), 'not an image');
  writeFileSync(path.join(brand, 'Bad Name.svg'), '<svg/>');
  const media = tmp('dm-media-');
  mkdirSync(path.join(media, 'jobi'));
  writeFileSync(path.join(media, 'jobi/logo.webp'), 'webp');
  writeFileSync(path.join(media, 'jobi/notes.txt'), 'no');
  mkdirSync(path.join(media, 'demo'));
  writeFileSync(path.join(media, 'demo/logo.svg'), '<svg>not the demo</svg>');
  mkdirSync(path.join(media, '..hidden'));
  writeFileSync(path.join(media, 'README.md'), 'readme');

  const out = tmp('dm-site-');
  const result = await buildRelease({ version: '0.1.0', out, brand, media });
  assert.deepEqual(result.brandFiles.sort(), ['digimenu-logo-reversed.svg', 'favicon-32.png']);
  assert.ok(existsSync(path.join(out, 'brand/digimenu-logo-reversed.svg')));
  assert.ok(!existsSync(path.join(out, 'brand/README.md')));
  assert.ok(existsSync(path.join(out, 'media/jobi/logo.webp')));
  assert.ok(!existsSync(path.join(out, 'media/jobi/notes.txt')));
  assert.doesNotMatch(
    readFileSync(path.join(out, 'media/demo/logo.svg'), 'utf8'),
    /not the demo/,
    'the demo café keeps its own logo',
  );
  assert.equal(result.logos, 2);
});

test('the boot answer names the logo only for a safe path inside the café folder', () => {
  const config = (/** @type {string | undefined} */ logo) =>
    /** @type {any} */ ({ slug: 'jobi', branding: { primaryColor: '#612028', logo } });
  assert.equal(logoUrl(config('logo.webp')), '/media/jobi/logo.webp');
  assert.equal(logoUrl(config(undefined)), null);
  // Only files at the top of the folder are published, so a sub-folder would be a broken image.
  for (const bad of [
    '/etc/logo.svg',
    '../demo/logo.svg',
    '2026/logo.png',
    'logo.gif',
    'logo.svg?x=1',
    'a b.png',
  ]) {
    assert.equal(logoUrl(config(bad)), null, bad);
  }
});

test('a café theme goes in the boot answer with its checked colours, or not at all', () => {
  const config = (/** @type {any} */ theme, /** @type {any} */ menu = undefined) =>
    /** @type {any} */ ({
      slug: 'jobi',
      names: { fr: 'Jobi' },
      languages: { enabled: ['fr', 'en'], default: 'fr' },
      ...(menu ? { menu } : {}),
      branding: { primaryColor: '#C98B2E', logo: 'logo-white.webp', theme },
      ordering: { types: {} },
    });
  const boot = (/** @type {any} */ c) =>
    bootBody({
      config: c,
      table: null,
      menu: /** @type {any} */ ({ v: 1, rev: 1, categories: [] }),
      release: { version: '0.1.0', entry: '/r/0.1.0/a.js', css: '/r/0.1.0/a.css' },
      modules: [],
    });
  const themed = boot(
    config(
      { background: '#2A1117', text: '#F6EEDC', font: 'mohave', cover: 'cover.webp', logo: 'bare' },
      { prices: 'short' },
    ),
  );
  assert.deepEqual(themed.cafe.theme, {
    dark: true,
    font: 'mohave',
    cover: '/media/jobi/cover.webp',
    logo: 'bare',
  });
  assert.equal(themed.cafe.accent?.['--dm-cafe-bg'], '#2A1117');
  assert.equal(themed.cafe.prices, 'short');
  // An unreadable theme is left out entirely: the menu falls back to the neutral page.
  const refused = boot(config({ background: '#2A1117', text: '#3A2020' }));
  assert.equal(refused.cafe.theme, undefined);
  assert.equal(refused.cafe.accent?.['--dm-cafe-bg'], undefined);
  assert.equal(refused.cafe.prices, undefined);
  // An unknown font or an unsafe cover file name is dropped.
  const odd = boot(config({ background: '#2A1117', font: 'comic', cover: '../x.webp' }));
  assert.deepEqual(odd.cafe.theme, { dark: true, logo: 'plate' });
});

test('the release ships the theme fonts with their licence, declared in the customer CSS', async () => {
  const out = tmp('dm-site-');
  const result = await buildRelease({ version: '0.1.0', out });
  for (const font of THEME_FONT_FILES) {
    assert.ok(existsSync(path.join(out, 'fonts', path.basename(font))), font);
  }
  assert.match(readFileSync(path.join(out, 'fonts/OFL-mohave.txt'), 'utf8'), /Open Font License/);
  const css = readFileSync(path.join(out, result.manifest.css), 'utf8');
  assert.match(css, /DM Mohave/);
  assert.match(css, /\/fonts\/mohave-latin-600-italic\.woff2/);
  assert.match(readFileSync(path.join(out, '_headers'), 'utf8'), /\/fonts\/\*\n {2}Cache-Control/);
});
