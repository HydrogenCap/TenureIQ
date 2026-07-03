// app/(marketing)/pricing/page.tsx
// Public pricing. Numbers come straight from lib/billing/plans.ts —
// the same map the quota helpers enforce — so this page cannot drift
// from the real limits.

import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PLANS, type PlanId } from '@/lib/billing/plans'

export const metadata: Metadata = { title: 'Pricing' }

const TIERS: PlanId[] = ['starter', 'growth', 'pro']

const TIER_TAGLINES: Record<string, string> = {
  starter: 'For a landlord with a handful of properties who wants reports and reminders handled.',
  growth: 'For growing portfolios and AASC providers. This is the plan your trial runs on.',
  pro: 'For larger operators and investment groups reporting to investors.',
}

function formatMonthly(pence: bigint): string {
  return `£${(Number(pence) / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

function limit(value: number | null): string {
  return value === null ? 'Unlimited' : value.toLocaleString('en-GB')
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-16">
      <section className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground">
          Every new organisation starts on a 14-day Growth trial — no card required.
          When the trial ends, pick a plan or drop to the free tier
          ({limit(PLANS.free.maxProperties)} properties, {limit(PLANS.free.maxDocuments)}{' '}
          documents) and keep your data.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {TIERS.map((id) => {
          const plan = PLANS[id]
          const highlighted = id === 'growth'
          return (
            <div
              key={id}
              className={`flex flex-col rounded-lg border bg-card p-6 ${
                highlighted ? 'border-primary shadow-sm' : 'border-border'
              }`}
            >
              <h2 className="text-lg font-semibold">{plan.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{TIER_TAGLINES[id]}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold tracking-tight">
                  {plan.monthlyPricePence !== null ? formatMonthly(plan.monthlyPricePence) : '—'}
                </span>
                <span className="text-sm text-muted-foreground"> / month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                <li>Up to {limit(plan.maxProperties)} properties</li>
                <li>{limit(plan.maxDocuments)} stored documents</li>
                <li>{limit(plan.maxOcrPerMonth)} OCR extractions / month</li>
                <li className={plan.features.reports ? '' : 'text-muted-foreground line-through'}>
                  PDF report pack
                </li>
                <li className={plan.features.aasc ? '' : 'text-muted-foreground line-through'}>
                  AASC placements &amp; contracts
                </li>
                <li className={plan.features.investors ? '' : 'text-muted-foreground line-through'}>
                  Investor capital accounts
                </li>
              </ul>
              <Link
                href="/login"
                className={`mt-6 w-full ${buttonVariants({
                  variant: highlighted ? 'default' : 'outline',
                })}`}
              >
                Start with {plan.label}
              </Link>
            </div>
          )
        })}
      </section>

      <section className="mx-auto max-w-2xl space-y-2 text-center text-sm text-muted-foreground">
        <p>
          All plans include multi-user organisations, entity P&amp;L, mortgage and
          valuation tracking, compliance reminders and maintenance tracking. Billing is
          handled by Stripe; upgrade, downgrade or cancel any time from the billing
          settings.
        </p>
        <p>
          Need more than {limit(PLANS.pro.maxProperties)} properties? Enterprise plans
          have no fixed limits — email{' '}
          <a href="mailto:david@oxygen.rocks" className="text-primary underline-offset-4 hover:underline">
            david@oxygen.rocks
          </a>
          .
        </p>
      </section>
    </div>
  )
}
