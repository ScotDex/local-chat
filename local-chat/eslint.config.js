import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['overlay/**/*.js'],
    rules: {
      'no-undef': 'off', // TypeScript checks undefined names in @ts-check files, with browser types
    },
  },
  { ignores: ['node_modules/'] },
);
