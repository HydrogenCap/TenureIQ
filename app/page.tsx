// app/page.tsx
// Public landing page. Signed-in users go straight to the dashboard;
// everyone else gets the marketing hero. This page sits outside the
// (marketing) route group, so it carries its own minimal header and
// footer matching the marketing shell.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { supabaseServer } from '@/lib/db/user'

const FEATURES = [
  {
    title: 'Portfolio finance',
    body: 'Equity, LTV and interest cover per property and across the portfolio, with refinance windows flagged before fixed rates lapse.',
  },
  {
    title: 'Compliance engine',
    body: 'Gas safety, EICR, EPC and HMO licence deadlines tracked per property, with email reminders before anything expires.',
  },
  {
    title: 'HMO & AASC tenancies',
    body: 'Room-level ASTs and AASC placements side by side — and service-user identities are never stored, only counts.',
  },
  {
    title: 'Investor reporting',
    body: 'Capital accounts, contributions and distributions per investor and entity, with server-rendered PDF report packs.',
  },
] as const

export default async function HomePage() {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground"
            >
              T
            </span>
            TenureIQ
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/pricing" className="text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link href="/about" className="text-muted-foreground transition-colors hover:text-foreground">
              About
            </Link>
            <ThemeToggle />
            <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative mx-auto w-full max-w-3xl space-y-6 px-6 pb-16 pt-24 text-center">
          {/* Soft brand wash behind the hero — decorative only. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-14 -z-10 mx-auto h-72 max-w-4xl rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
          />
          <h1 className="text-4xl font-semibold tracking-tight">
            Your property portfolio, run like a business
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            TenureIQ manages properties, tenancies, mortgages, compliance and investor
            reporting for UK HMO landlords, AASC providers and small portfolios — in
            one system instead of six spreadsheets.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/login" className={buttonVariants({ size: 'lg' })}>
              Get started
            </Link>
            <Link href="/about" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Learn more
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            14-day Growth trial for every new organisation — no card required.
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-ring/40">
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Hydrogen Capital. All rights reserved.</p>
          <nav className="flex gap-4">
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
