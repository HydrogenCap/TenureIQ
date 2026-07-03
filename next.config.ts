import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

import './env' // validate env at build time

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
}

// Sentry wrapper injects the client config + source-map handling. Upload
// is disabled (no SENTRY_AUTH_TOKEN in CI); errors still report via DSN.
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  webpack: { treeshake: { removeDebugLogging: true } },
})
