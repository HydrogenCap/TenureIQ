// app/(app)/reports/page.tsx
//
// Reports index. Each card opens the report in a new tab via its
// /api/reports/* route. Three reports shipped in M10 (portfolio
// summary, mortgage book, compliance status); four more are queued.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'

type ReportCard = {
  href: string | null
  title: string
  description: string
  audience: string
  status: 'live' | 'queued'
  queuedFor?: string
}

const REPORTS: ReportCard[] = [
  {
    href: '/api/reports/portfolio-summary',
    title: 'Portfolio summary',
    description:
      'Per-property table with EPC, value, debt, LTV, yield. Headline KPIs and let-blocked callouts. One-pager for monthly review.',
    audience: 'Owner · monthly review',
    status: 'live',
  },
  {
    href: '/api/reports/mortgage-book',
    title: 'Mortgage book',
    description:
      'Every mortgage: lender, product, rate, balance, fixed end. Parallel rate-shock sensitivity (+1% / +2%) at the bottom.',
    audience: 'Broker · refinance modelling',
    status: 'live',
  },
  {
    href: '/api/reports/compliance-status',
    title: 'Compliance status',
    description:
      'All compliance items grouped by property with traffic-light status. Expired and missing items rank first. Required-but-not-recorded items surface as synthetic "missing" rows.',
    audience: 'LA inspector · insurance underwriter',
    status: 'live',
  },
  {
    href: null,
    title: 'Entity P&L',
    description:
      'Profit & loss statement for one entity over a date range. Credit categories top, debit bottom, net at end. YTD and last-12-months variants.',
    audience: 'Accountant · year-end',
    status: 'queued',
    queuedFor: 'M10 follow-up',
  },
  {
    href: null,
    title: 'Property pack',
    description:
      'Refinance-application bundle for one property: ownership, mortgages, valuations, tenancies (no tenant names), 12-month income, compliance, photos.',
    audience: 'Broker / lender',
    status: 'queued',
    queuedFor: 'M10 follow-up',
  },
  {
    href: null,
    title: 'AASC placement report',
    description:
      'Active placements, weekly contracted revenue, commission, areas covered, contract dates, break clauses. Service-user counts only — no identity data.',
    audience: 'Internal review · contractor reconciliation',
    status: 'queued',
    queuedFor: 'M10 follow-up',
  },
  {
    href: null,
    title: 'Investor capital statement',
    description:
      'Per investor, per period. Opening balance, contributions, distributions, current value, IRR. One investor per statement.',
    audience: 'Investor · quarterly',
    status: 'queued',
    queuedFor: 'M11 — investor reporting',
  },
]

export default async function ReportsPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Server-rendered PDFs. Open in a new tab, download, print, or send to a broker / accountant / LA."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <article
            key={r.title}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
          >
            <header className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold">{r.title}</h2>
              {r.status === 'queued' && (
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  Queued
                </span>
              )}
            </header>
            <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-wide">Audience</span> · {r.audience}
            </p>
            {r.status === 'live' && r.href && (
              <div className="mt-3 flex gap-2">
                <Link
                  href={r.href}
                  target="_blank"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open PDF →
                </Link>
              </div>
            )}
            {r.status === 'queued' && r.queuedFor && (
              <p className="mt-3 text-xs italic text-muted-foreground">
                {r.queuedFor}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
