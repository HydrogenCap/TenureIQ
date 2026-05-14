// eslint.config.mjs
import nextPlugin from 'eslint-config-next'

export default [
  ...nextPlugin,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
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
]
