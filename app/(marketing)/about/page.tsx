// app/(marketing)/about/page.tsx

import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'About' }

// String literals (not JSX text) may contain plain apostrophes —
// react/no-unescaped-entities only applies to literal JSX children.
const AUDIENCES = [
  {
    title: 'HMO landlords',
    body: 'Room-level tenancies, HMO licensing deadlines, gas safety, EICR and EPC tracking in one place — instead of a spreadsheet and a diary.',
  },
  {
    title: 'AASC accommodation providers',
    body: 'Placement and contract workflow built for asylum accommodation, designed so that service-user identities are never stored — only occupancy counts.',
  },
  {
    title: 'Portfolio investors',
    body: 'Entity-level P&L, mortgage schedules, capital accounts and distribution records for small investment groups that have outgrown shared spreadsheets.',
  },
] as const

const FEATURES = [
  {
    title: 'Portfolio finance, not just rent collection',
    body: 'Every property carries its mortgages and valuations, so TenureIQ can show equity, loan-to-value and interest cover across the portfolio — and stress-test them at higher rates. Refinance modelling flags fixed-rate windows before they lapse, so you approach a remortgage on your own schedule rather than your lender’s.',
  },
  {
    title: 'A compliance engine that chases you',
    body: 'Gas safety certificates, electrical installation condition reports, energy performance certificates and HMO licences all expire on their own timetables. TenureIQ tracks each item per property, shows what is due across the whole portfolio, and sends email reminders ahead of deadlines — so renewals happen before they become breaches.',
  },
  {
    title: 'AASC workflow with privacy by design',
    body: 'Providers working under asylum accommodation contracts need occupancy, placement and contract-rate tracking — not another database holding details of vulnerable people. TenureIQ stores service-user counts per placement and never stores the names or identities of service users. That is a structural decision in the data model, not a policy promise.',
  },
  {
    title: 'Investor reporting without the spreadsheet ritual',
    body: 'Capital accounts, contributions and distributions are recorded per investor and per entity, and portfolio reports render as PDFs on the server. When a quarter closes, the numbers are already where they need to be.',
  },
] as const

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-16 px-6 py-16">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Portfolio management for UK landlords who run their properties as a business
        </h1>
        <p className="text-lg text-muted-foreground">
          TenureIQ brings properties, entities, tenancies, mortgages, transactions and
          compliance into one system. It is built for the parts of UK residential
          property that generic tools skip: HMO licensing, AASC contracts, and knowing
          what your portfolio is actually worth after debt.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold tracking-tight">Who it&apos;s for</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-medium">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <h2 className="text-xl font-semibold tracking-tight">What it does</h2>
        {FEATURES.map((f) => (
          <div key={f.title} className="space-y-2">
            <h3 className="text-lg font-medium">{f.title}</h3>
            <p className="text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-medium">See the plans</h2>
        <p className="text-sm text-muted-foreground">
          Every new organisation starts on a 14-day Growth trial — no card required.
        </p>
        <div className="flex gap-3">
          <Link href="/pricing" className={buttonVariants({ variant: 'default' })}>
            View pricing
          </Link>
          <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
            Sign in
          </Link>
        </div>
      </section>
    </div>
  )
}
