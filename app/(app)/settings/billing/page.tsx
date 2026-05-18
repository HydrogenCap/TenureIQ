// app/(app)/settings/billing/page.tsx
// Per-organisation billing overview. Owner-only — manager/accountant
// roles get redirected on entry.

import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import { PlanCompareTable } from './_components/plan-compare-table'

type OrgRow = {
  plan: string
  plan_status: string
  plan_renews_at: string | null
  stripe_customer_id: string | null
  trial_ends_at: string | null
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')
  if (auth.role !== 'owner') redirect('/dashboard')

  const { status } = await searchParams

  const sb = await supabaseServer()
  const { data: org } = await sb
    .from('organisations')
    .select('plan, plan_status, plan_renews_at, stripe_customer_id, trial_ends_at')
    .eq('id', auth.organisationId)
    .maybeSingle<OrgRow>()
  if (!org) redirect('/dashboard')

  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString()
  const [propsRes, ocrRes, docsRes] = await Promise.all([
    sb
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null),
    sb
      .from('usage_log')
      .select('count', { count: 'exact', head: true })
      .eq('organisation_id', auth.organisationId)
      .eq('metric', 'ocr_runs')
      .gte('at', monthStart),
    sb
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null),
  ])
  const propertyCount = propsRes.count ?? 0
  const ocrThisMonth = ocrRes.count ?? 0
  const documentCount = docsRes.count ?? 0

  const limits = PLANS[org.plan as PlanId] ?? PLANS.free

  function quota(used: number, max: number | null): string {
    if (max === null) return `${used} / unlimited`
    return `${used} / ${max}`
  }

  const trialing = org.plan_status === 'trialing'
  const pastDue = org.plan_status === 'past_due'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your subscription, current plan limits, and usage."
      />

      {status === 'success' && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          Checkout complete. Your plan will update once the Stripe webhook
          processes — usually within seconds.
        </div>
      )}
      {pastDue && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          <strong>Payment failed.</strong> Your subscription is past due.
          Resolve via the Manage billing portal to restore full access. The
          org will go read-only after 7 days of past-due.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={org.plan} />
        <StatusBadge status={org.plan_status} />
        {trialing && org.trial_ends_at && (
          <span className="text-xs text-muted-foreground">
            Trial ends <DateDisplay date={org.trial_ends_at} />
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Current plan"
          display={limits.label}
          sub={
            limits.monthlyPricePence === null
              ? trialing
                ? 'Trial — no card on file'
                : 'No billing'
              : <MoneyDisplay pence={limits.monthlyPricePence} />
          }
        />
        <KpiTile
          label="Properties"
          display={quota(propertyCount, limits.maxProperties)}
        />
        <KpiTile
          label="OCR runs (month)"
          display={quota(ocrThisMonth, limits.maxOcrPerMonth)}
        />
        <KpiTile
          label="Documents"
          display={quota(documentCount, limits.maxDocuments)}
        />
      </div>

      {org.plan_renews_at && !trialing && (
        <p className="text-sm text-muted-foreground">
          Next renewal: <DateDisplay date={org.plan_renews_at} />
        </p>
      )}

      <PlanCompareTable
        currentPlan={org.plan as PlanId}
        hasStripeCustomer={!!org.stripe_customer_id}
      />
    </div>
  )
}
