// @ts-check
/**
 * ESLint configuration ("flat config", ESLint v10).
 *
 * ESLint reads our JavaScript and reports likely bugs (unused variables, typos in names,
 * `==` instead of `===`, ...). Run it with `npm run lint`; CI runs it on every pull request.
 *
 * This file has three parts:
 *   1. Which files are ignored.
 *   2. Rules for all code (ESLint's recommended set + a few safety rules).
 *   3. Per-folder settings: which global variables exist there (browser, Worker or Node)
 *      and the IMPORT BOUNDARIES between platform/, core/ and modules/.
 *
 * Import boundaries (ARCHITECTURE §4.5, REQUIREMENTS MOD-02 and MOD-15):
 *   - modules/<key>/ may import only `@digimenu/core-api` and its own files.
 *     A module never imports another module, the core's internals or the platform.
 *   - core/ never imports modules/ or platform/ (the core must work with every module off).
 *   - platform/ never imports modules/ directly (enabled modules are loaded through the
 *     release manifest, so a switched-off module costs zero bytes, MOD-03).
 *   - Only tools/ and tests/ may read cafes/ (no café-specific code, MOD-15).
 *   These rules see static `import ... from` lines only. A full import scan (including dynamic
 *   `import()`) is planned as CI stage 3 "module contract" (docs/operations/ci.md).
 */
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

// ---------------------------------------------------------------------------------------------
// Reusable pieces for the import-boundary rule
// ---------------------------------------------------------------------------------------------

/** Blocks imports that reach into the café data folder (MOD-15). */
const noCafesImport = {
  regex: '(^|/)cafes(/|$)',
  message:
    'Code must not read cafes/ directly: per-café differences live in configuration and content only (MOD-15).',
};

/** Blocks imports of module code from outside the module system (MOD-02, MOD-03). */
const noModulesImport = {
  regex: '(^|/)modules(/|$)',
  message:
    'Do not import modules/ directly. Enabled modules are loaded through the release manifest (ARCHITECTURE §4.3).',
};

/** Blocks imports of the platform shell from release code (ARCHITECTURE §3.1). */
const noPlatformImport = {
  regex: '(^|/)platform(/|$)',
  message:
    'Release code (core and modules) must not import platform/. Use the platformApi instead.',
};

/** In modules: the only allowed @digimenu package is the public core API. */
const onlyCoreApi = {
  regex: '^@digimenu/(?!core-api$)',
  message: 'A module may import only @digimenu/core-api (ARCHITECTURE §4.1, MOD-02).',
};

/** In modules: no reaching into core/ or platform/ internals by any path. */
const noInternals = {
  regex: '(^|/)(core|platform|cafes)(/|$)',
  message:
    'A module talks to the core only through @digimenu/core-api, never through core/ or platform/ files (MOD-02).',
};

/** @param {string} upLevels  regex for "leaves the module folder", e.g. '^\\.\\./' */
const staysInModule = (upLevels) => ({
  regex: upLevels,
  message:
    'A module may not import files outside its own folder, and never another module (MOD-02). Use @digimenu/core-api.',
});

// ---------------------------------------------------------------------------------------------
// The configuration
// ---------------------------------------------------------------------------------------------

export default defineConfig([
  // 1. Generated or third-party files: never linted.
  globalIgnores(['dist/', 'coverage/', '.wrangler/', 'test-results/', 'playwright-report/']),

  // 2. Rules for all JavaScript.
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    linterOptions: {
      // An `eslint-disable` comment that no longer hides anything is an error: delete it.
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Unused function arguments are allowed when their name starts with "_".
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      // Security: no running text as code. Our Content-Security-Policy forbids it anyway
      // (ARCHITECTURE §7), and the JSON-Schema validators are compiled at build time.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  // 3a. Where code runs decides which global variables exist.
  {
    // Worker side of the platform: Cloudflare Workers look like a service worker.
    files: ['platform/shell/**/*.js', 'platform/hub/**/*.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Admin app, staff screen: runs in the browser.
    files: ['platform/admin/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Release code runs in the browser AND at the edge (the same render function, §9).
    files: ['core/**/*.js', 'modules/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  {
    // Command-line tools, tests and config files run in Node.
    files: ['tools/**/*.js', 'tests/**/*.js', 'modules/*/tests/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Throwaway spikes (spikes/README.md): Worker code, browser pages, Node tools and tests.
    files: ['spikes/*/src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        WebSocketPair: 'readonly',
        WebSocketRequestResponsePair: 'readonly',
      },
    },
  },
  {
    files: ['spikes/*/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['spikes/*/tools/**/*.{js,mjs}', 'spikes/*/tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // 3b. Import boundaries (see the comment at the top of this file).
  //     Note: when several blocks set the same rule for one file, the LAST block wins,
  //     so each block below lists every pattern that applies to its files.
  {
    files: ['platform/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noModulesImport, noCafesImport] }],
    },
  },
  {
    files: ['core/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [noModulesImport, noPlatformImport, noCafesImport] },
      ],
    },
  },
  {
    // Files directly inside a module folder: modules/<key>/client.js, server.js, ...
    files: ['modules/*/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [staysInModule('^\\.\\./'), onlyCoreApi, noInternals] },
      ],
    },
  },
  {
    // Files one folder deeper: modules/<key>/tests/*.js, modules/<key>/lib/*.js, ...
    // (keep module folders flat: one level of sub-folders).
    files: ['modules/*/*/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [staysInModule('^\\.\\./\\.\\./'), onlyCoreApi, noInternals] },
      ],
    },
  },
]);
