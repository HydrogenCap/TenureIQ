import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'tests/e2e/**', 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**/*.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname,
    },
  },
})
