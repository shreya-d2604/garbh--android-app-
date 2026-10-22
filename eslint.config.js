// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/*',
      'dist/*',
      '.expo/*',
      'supabase/functions/*',
      'src/types/database.ts',
    ],
  },
  {
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
