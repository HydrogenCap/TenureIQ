// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Session replay off — tenant data must not leave the browser.
    environment: process.env.NODE_ENV,
  })
}
