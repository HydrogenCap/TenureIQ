import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  // Module-scope: the t3-oss env proxy isn't usable here, so read the
  // public var straight off process.env with a local-dev fallback.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'TenureIQ',
    template: '%s · TenureIQ',
  },
  description: 'UK property portfolio management for HMO landlords and AASC providers.',
  applicationName: 'TenureIQ',
}

// Global BigInt JSON serialiser
declare global {
  interface BigInt {
    toJSON(): string
  }
}
;(BigInt.prototype as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
