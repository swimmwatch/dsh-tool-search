import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { flatConfigs as imports } from 'eslint-plugin-import-x';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import node from 'eslint-plugin-n';
import noSecrets from 'eslint-plugin-no-secrets';
import perfectionist from 'eslint-plugin-perfectionist';
import promise from 'eslint-plugin-promise';
import { configs as regexp } from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.local/**', 'artifacts/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      imports.recommended,
      node.configs['flat/recommended-module'],
      regexp['flat/recommended'],
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { jsdoc: jsdocPlugin, 'no-secrets': noSecrets, perfectionist, promise, sonarjs },
    rules: {
      ...promise.configs['flat/recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Published DSH and the compiled .js specifiers are resolved by TypeScript.
      'import-x/no-unresolved': 'off',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'n/no-unsupported-features/node-builtins': ['error', { version: '>=24.0.0' }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'sonarjs/cognitive-complexity': ['error', 20],
      'perfectionist/sort-named-imports': ['error', { type: 'natural', order: 'asc' }],
      'perfectionist/sort-named-exports': ['error', { type: 'natural', order: 'asc' }],
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'no-secrets/no-secrets': [
        'error',
        {
          tolerance: 4.5,
          ignoreModules: true,
          ignoreIdentifiers: [
            'checksum',
            'digest',
            'fingerprint',
            'hash',
            'integrity',
            'sha256',
            'sha512',
          ],
          ignoreContent: ['^https?://', '^sha256:'],
        },
      ],
    },
  },
  {
    files: [
      'src/client/**/*.{ts,tsx}',
      'src/constants.ts',
      'src/embedding-settings.ts',
      'src/core/shared/types.ts',
    ],
    rules: {
      'import-x/no-nodejs-modules': 'error',
      'no-restricted-globals': [
        'error',
        {
          globals: ['process', 'Buffer', 'fetch', 'WebSocket', 'XMLHttpRequest'],
          checkGlobalObject: true,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:\\.\\.?/)+(?:core/(?!shared/types\\.js$)|(?:config|discovery|embedding-provider|index|types)\\.js$)',
              message: 'Client code must use pure shared settings and public DSH client APIs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests deliberately inspect adversarial input and contain controlled callbacks.
      'sonarjs/cognitive-complexity': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-secrets/no-secrets': 'off',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // Retain upstream parsing and input-coercion behavior during the migration.
      '@typescript-eslint/no-base-to-string': 'off',
      'regexp/no-super-linear-backtracking': 'off',
      'sonarjs/cognitive-complexity': ['error', 35],
    },
  },
  {
    files: ['scripts/register-ui-sdk.ts'],
    rules: {
      // Node 24 supplies this experimental hook for the browser SDK test host only.
      'n/no-unsupported-features/node-builtins': [
        'error',
        { version: '>=24.0.0', ignores: ['module.registerHooks'] },
      ],
    },
  },
  prettier,
);
