import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Runs before paint so the stored theme applies without a flash of the
// wrong colours. localStorage key mirrors components/theme-toggle.tsx.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('tenureiq:theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

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
    // suppressHydrationWarning: the theme script mutates <html> class
    // before React hydrates, which is intentional.
    <html lang="en-GB" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
