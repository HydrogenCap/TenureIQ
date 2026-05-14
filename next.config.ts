import type { NextConfig } from 'next'

import './env' // validate env at build time

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ['@prisma/client', 'prisma'],
}

export default nextConfig
