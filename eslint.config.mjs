// eslint.config.mjs
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/db/admin', '**/lib/db/prisma', '@prisma/client'],
              message:
                'Service-role Supabase and Prisma clients are restricted to lib/jobs/, lib/admin/, lib/cron/, app/api/webhooks/. Use supabaseServer() from lib/db/user for user-facing queries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'lib/jobs/**',
      'lib/admin/**',
      'lib/cron/**',
      'app/api/webhooks/**',
      'prisma/**',
      'scripts/**',
      'tests/integration/**',
      'tests/factories/**',
      'lib/db/admin.ts',
      'lib/db/prisma.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Test files may use non-null assertions on fixture data.
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
