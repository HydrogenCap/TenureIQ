// sentry.server.config.ts
// Server-side Sentry init. No-op unless a DSN is configured, so dev and
// CI are unaffected. process.env is used directly (not the t3-env schema)
// because this file loads before env validation in the instrumentation hook.

import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  })
}
