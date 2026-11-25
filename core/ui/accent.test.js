// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentTokens, contrast } from './accent.js';

/**
 * The worked examples of docs/design/foundations.md §2.3. If one of these changes, the design
 * documentation must change with it.
 */
const EXAMPLES = [
  {
    brand: '#1F6F5C',
    fill: '#1F6F5C',
    text: '#1F6F5C',
    darkFill: '#1F6F5C',
    darkText: '#579385',
    error: false,
  },
  {
    brand: '#FFC300',
    fill: '#B98D00',
    text: '#866600',
    darkFill: '#FFC300',
    darkText: '#FFC300',
    error: true,
  },
  {
    brand: '#1D3557',
    fill: '#1D3557',
    text: '#1D3557',
    darkFill: '#50627D',
    darkText: '#7D8B9E',
    error: false,
  },
  {
    brand: '#000000',
    fill: '#000000',
    text: '#000000',
    darkFill: '#666666',
    darkText: '#868686',
    error: false,
  },
  {
    brand: '#7B2CBF',
    fill: '#7B2CBF',
    text: '#7B2CBF',
    darkFill: '#853CC4',
    darkText: '#A671D4',
    error: false,
  },
  {
    brand: '#F4A261',
    fill: '#C3824E',
    text: '#92613A',
    darkFill: '#F4A261',
    darkText: '#F4A261',
    error: false,
  },
];

for (const ex of EXAMPLES) {
  test(`accent for ${ex.brand} matches the worked example`, () => {
    const { tokens, errors } = accentTokens({ primaryColor: ex.brand });
    assert.equal(tokens['--dm-cafe-accent'].toUpperCase(), ex.fill);
    assert.equal(tokens['--dm-cafe-accent-text'].toUpperCase(), ex.text);
    assert.equal(tokens['--dm-cafe-accent-dark'].toUpperCase(), ex.darkFill);
    assert.equal(tokens['--dm-cafe-accent-text-dark'].toUpperCase(), ex.darkText);
    assert.equal(errors.length > 0, ex.error);
    // Whatever the brand, the button label is readable (WCAG 4.5:1).
    assert.ok(contrast(tokens['--dm-cafe-accent'], tokens['--dm-cafe-on-accent']) >= 4.5);
    assert.ok(contrast(tokens['--dm-cafe-accent-dark'], tokens['--dm-cafe-on-accent-dark']) >= 4.5);
  });
}

test('black warns: almost grey, and lightened by 40 % for dark mode', () => {
  const { warnings } = accentTokens({ primaryColor: '#000000' });
  assert.equal(warnings.length, 2);
});

test('a separate button colour changes the fill but not the accent text', () => {
  const { tokens } = accentTokens({ primaryColor: '#1D3557', buttonColor: '#7B2CBF' });
  assert.equal(tokens['--dm-cafe-accent'].toUpperCase(), '#7B2CBF');
  assert.equal(tokens['--dm-cafe-accent-text'].toUpperCase(), '#1D3557');
});
