import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TenureIQ',
  description: 'UK property portfolio management for HMO landlords and AASC providers.',
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
