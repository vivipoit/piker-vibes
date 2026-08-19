import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tsPlugin from '@typescript-eslint/eslint-plugin'

export default [
  {
    // dist/coverage/playwright output are build artifacts; data/data-chaotic
    // are local CSV data dirs; scripts/ is gitignored local build tooling
    // (see CLAUDE.md's Data pipeline section) - none of these are part of
    // the tracked, linted app.
    ignores: [
      'dist',
      'dist-ssr',
      'coverage',
      'playwright-report',
      'test-results',
      'data',
      'data-chaotic',
      'scripts',
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
  // App code runs in the browser (Vite/React).
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // Every context module deliberately pairs a Provider component with its
  // useXxx hook in the same file (see e.g. src/context/FxRateContext.tsx) -
  // that's the established pattern here, not something to split up just to
  // satisfy fast-refresh.
  {
    files: ['src/context/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Vite/Playwright config and the dev-server CSV plugin run under Node.
  {
    files: ['*.config.ts', 'vite-plugins/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Playwright specs run under Node but drive/assert against browser APIs
  // (Page, DOM text) through @playwright/test's own types.
  {
    files: ['tests/e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // PostCSS config is loaded by Node as CommonJS.
  {
    files: ['*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
]
