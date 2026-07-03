import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/db/user'
import { requireOrgMember } from '@/lib/auth/require'
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { bpsToPercent } from '@/lib/money'
import { daysUntilFixedEnd } from '@/lib/domain/mortgage'
import { weightedAverageLtvBps, portfolioTotals } from '@/lib/domain/portfolio'
import {
  placementGrossPerWeekPence,
  placementNetPerWeekPence,
} from '@/lib/domain/aasc-placement'

type PropertyDbRow = {
  id: string
  current_valuation_pence: string | number | null
  purchase_price_pence: string | number
}

type MortgageDbRow = {
  id: string
  property_id: string
  current_balance_pence: string | number
  interest_rate_bps: number
  fixed_end_date: string | null
  is_interest_only: boolean
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const [orgRes, propertiesRes, mortgagesRes, complianceRes, aascRes, aascContractRes] =
    await Promise.all([
      sb.from('organisations').select('name, slug').eq('id', auth.organisationId).single(),
      sb
        .from('properties')
        .select('id, current_valuation_pence, purchase_price_pence')
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null),
      sb
        .from('mortgages')
        .select(
          'id, property_id, current_balance_pence, interest_rate_bps, fixed_end_date, is_interest_only',
        )
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null),
      sb
        .from('compliance_items')
        .select('id, expiry_date, status')
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null),
      sb
        .from('aasc_placements')
        .select(
          'id, contract_id, status, service_user_count, weekly_rate_pence, commission_rate_bps_override, end_date',
        )
        .eq('organisation_id', auth.organisationId)
        .eq('status', 'active')
        .is('deleted_at', null),
      sb
        .from('aasc_contracts')
        .select('id, status, break_clause_date, commission_rate_bps')
        .eq('organisation_id', auth.organisationId)
        .eq('status', 'active')
        .is('deleted_at', null),
    ])

  const org = orgRes.data as { name: string; slug: string } | null
  const properties = (propertiesRes.data ?? []) as PropertyDbRow[]
  const mortgages = (mortgagesRes.data ?? []) as MortgageDbRow[]
  const complianceItems = (complianceRes.data ?? []) as Array<{
    id: string
    expiry_date: string | null
    status: string
  }>
  const aascPlacements = (aascRes.data ?? []) as Array<{
    id: string
    contract_id: string | null
    status: string
    service_user_count: number
    weekly_rate_pence: string | number
    commission_rate_bps_override: number | null
    end_date: string | null
  }>
  const aascContracts = (aascContractRes.data ?? []) as Array<{
    id: string
    status: string
    break_clause_date: string | null
    commission_rate_bps: number
  }>
  const commissionByContract = new Map<string, number>()
  for (const c of aascContracts) commissionByContract.set(c.id, c.commission_rate_bps)

  // Aggregate debt per property for the weighted LTV.
  const debtByProperty = new Map<string, bigint>()
  for (const m of mortgages) {
    const balance = toBig(m.current_balance_pence)
    debtByProperty.set(m.property_id, (debtByProperty.get(m.property_id) ?? 0n) + balance)
  }

  const rollups = properties.map((p) => ({
    valuePence:
      p.current_valuation_pence !== null
        ? toBig(p.current_valuation_pence)
        : toBig(p.purchase_price_pence),
    debtPence: debtByProperty.get(p.id) ?? 0n,
  }))

  const totals = portfolioTotals(rollups)
  const weightedLtv = weightedAverageLtvBps(rollups)

  // Mortgages with fixed end within 180 days.
  const today = new Date()
  const refinanceWindowCount = mortgages.filter((m) => {
    if (!m.fixed_end_date) return false
    const d = daysUntilFixedEnd(
      {
        interestRateBps: m.interest_rate_bps,
        fixedEndDate: m.fixed_end_date,
        currentBalancePence: toBig(m.current_balance_pence),
        isInterestOnly: m.is_interest_only,
      },
      today,
    )
    return d !== null && d >= 0 && d <= 180
  }).length

  // Compliance attention: items expiring within 60 days or already expired.
  // Status column is stored at write time and may be stale; recompute live.
  const SIXTY_DAYS_MS = 60 * 86_400_000
  const complianceAttentionCount = complianceItems.filter((c) => {
    if (c.status === 'exempt') return false
    if (!c.expiry_date) return true // missing
    const expiry = new Date(c.expiry_date)
    if (Number.isNaN(expiry.getTime())) return false
    return expiry.getTime() - today.getTime() <= SIXTY_DAYS_MS
  }).length

  // AASC rollups (active placements only).
  const aascServiceUserCount = aascPlacements.reduce(
    (n, p) => n + p.service_user_count,
    0,
  )
  let aascAnnualGrossPence = 0n
  let aascAnnualNetPence = 0n
  for (const p of aascPlacements) {
    const weekly = BigInt(
      typeof p.weekly_rate_pence === 'string'
        ? p.weekly_rate_pence
        : Math.round(p.weekly_rate_pence),
    )
    aascAnnualGrossPence +=
      placementGrossPerWeekPence({
        weeklyRatePence: weekly,
        serviceUserCount: p.service_user_count,
      }) * 52n
    aascAnnualNetPence +=
      placementNetPerWeekPence({
        weeklyRatePence: weekly,
        serviceUserCount: p.service_user_count,
        commissionRateBpsOverride: p.commission_rate_bps_override,
        contractCommissionRateBps:
          commissionByContract.get(p.contract_id ?? '') ?? 0,
      }) * 52n
  }
  const nextAascBreak = aascContracts
    .filter((c) => c.break_clause_date !== null)
    .map((c) => c.break_clause_date as string)
    .sort()[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{org?.name ?? 'Dashboard'}</h1>
        <p className="text-sm text-muted-foreground">
          {properties.length === 0
            ? 'Welcome to TenureIQ. Add your first property to get started.'
            : 'Headline numbers across your portfolio.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Properties" display={properties.length} />
        <KpiTile
          label="Portfolio value"
          display={<MoneyDisplay pence={totals.totalValuePence} />}
        />
        <KpiTile
          label="Mortgage debt"
          display={<MoneyDisplay pence={totals.totalDebtPence} />}
          sub={
            <>
              Equity: <MoneyDisplay pence={totals.totalEquityPence} />
            </>
          }
        />
        <KpiTile
          label="Weighted LTV"
          display={weightedLtv === null ? '—' : bpsToPercent(weightedLtv)}
        />
      </div>

      {aascPlacements.length > 0 && (
        <Link
          href="/aasc"
          className="block rounded-lg border bg-card p-4 hover:bg-muted"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                AASC placements
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {aascPlacements.length}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Service users
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {aascServiceUserCount}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                AASC annual gross
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                <MoneyDisplay pence={aascAnnualGrossPence} />
              </p>
              <p className="text-xs text-muted-foreground">
                Net: <MoneyDisplay pence={aascAnnualNetPence} />
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Next break clause
              </p>
              <p className="mt-1 text-sm">
                <DateDisplay date={nextAascBreak} />
              </p>
            </div>
          </div>
        </Link>
      )}

      {complianceAttentionCount > 0 && (
        <Link
          href="/compliance"
          className="block rounded-lg border border-red-200 bg-red-50 p-4 hover:bg-red-100 dark:border-red-900 dark:bg-red-950"
        >
          <p className="text-sm font-medium text-red-900 dark:text-red-100">
            {complianceAttentionCount}{' '}
            {complianceAttentionCount === 1 ? 'certificate needs' : 'certificates need'} attention
            (expiring within 60 days, expired, or missing).
          </p>
          <p className="text-xs text-red-800 dark:text-red-200">
            Open compliance →
          </p>
        </Link>
      )}

      {refinanceWindowCount > 0 && (
        <Link
          href="/mortgages?fixedEndWithin=180"
          className="block rounded-lg border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {refinanceWindowCount}{' '}
            {refinanceWindowCount === 1 ? 'mortgage has' : 'mortgages have'} a fixed-rate end
            within the next 6 months.
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Open the refinance-window view →
          </p>
        </Link>
      )}
    </div>
  )
}
