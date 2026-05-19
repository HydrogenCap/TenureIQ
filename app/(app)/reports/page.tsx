// app/(app)/reports/page.tsx
//
// Reports index. Each card opens the report in a new tab via its
// /api/reports/* route. All 7 M10 reports shipped.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'

type ReportCard = {
  href: string | null
  title: string
  description: string
  audience: string
  status: 'live' | 'queued' | 'per-entity' | 'per-property'
  queuedFor?: string
  navigateTo?: string
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
      'YTD profit & loss statement for one entity. Credit categories top, debit bottom, net at end. Tax-estimate footer picks individual (S24, 40% marginal) or company (25% CT) based on entity kind.',
    audience: 'Accountant · year-end',
    status: 'per-entity',
    navigateTo: '/entities',
  },
  {
    href: null,
    title: 'Property pack',
    description:
      'Refinance / investor-application bundle for one property: ownership, mortgages, valuations, tenancies, compliance status, KPIs, MEES callout. No tenant identity fields.',
    audience: 'Broker / lender',
    status: 'per-property',
    navigateTo: '/properties',
  },
  {
    href: '/api/reports/aasc-placements',
    title: 'AASC placement report',
    description:
      'Active placements, weekly contracted revenue, annual gross + net, contract dates, next break-clause / end. Service-user counts only — no identity data per the data-protection contract with prime contractors.',
    audience: 'Internal review · contractor reconciliation',
    status: 'live',
  },
  {
    href: '/api/reports/investor-capital-statement',
    title: 'Investor capital statement',
    description:
      'Per investor account, per period. Opening balance, contributions, distributions, accruals, closing balance, money-weighted return (XIRR), pending preferred return. Pass ?accountId=…&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD.',
    audience: 'Investor · quarterly',
    status: 'live',
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
              {(r.status === 'per-entity' || r.status === 'per-property') && (
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  Per {r.status === 'per-entity' ? 'entity' : 'property'}
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
            {(r.status === 'per-entity' || r.status === 'per-property') &&
              r.navigateTo && (
                <div className="mt-3 flex gap-2">
                  <Link
                    href={r.navigateTo}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Pick {r.status === 'per-entity' ? 'an entity' : 'a property'} →
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
