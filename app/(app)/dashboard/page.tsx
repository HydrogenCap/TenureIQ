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
import {
  arrearsForProperty,
  expectedByMonth,
  expectedMonthlyRentPence,
  lastNMonthKeys,
  monthKey,
  type ArrearsTenancy,
} from '@/lib/domain/arrears'
import type { RentPeriod } from '@/lib/domain/rent'

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

  // Arrears tile window: last 3 months keeps the transactions scan cheap
  // while still catching anything worth a red flag on the dashboard.
  const arrearsMonths = lastNMonthKeys(3, new Date())
  const arrearsWindowStart = `${arrearsMonths[0] ?? monthKey(new Date())}-01`

  const sb = await supabaseServer()
  const [orgRes, propertiesRes, mortgagesRes, complianceRes, aascRes, aascContractRes, maintenanceRes, tenancyRes, rentTxRes] =
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
      sb
        .from('maintenance_jobs')
        .select('id, priority, status')
        .eq('organisation_id', auth.organisationId)
        .is('deleted_at', null)
        .not('status', 'in', '("completed","cancelled")'),
      sb
        .from('tenancies')
        .select('property_id, rent_pence, rent_period, status, start_date')
        .eq('organisation_id', auth.organisationId)
        .eq('status', 'active')
        .is('deleted_at', null),
      sb
        .from('transactions')
        .select('id, property_id, amount_pence, posted_at, split_parent_id')
        .eq('organisation_id', auth.organisationId)
        .eq('category_code', 'rent')
        .gt('amount_pence', 0)
        .gte('posted_at', arrearsWindowStart)
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

  // Maintenance health: open jobs (anything not completed/cancelled),
  // with emergency/urgent broken out for the tile highlight.
  const openJobs = (maintenanceRes.data ?? []) as Array<{
    id: string
    priority: string
    status: string
  }>
  const openJobCount = openJobs.length
  const emergencyUrgentCount = openJobs.filter(
    (j) => j.priority === 'emergency' || j.priority === 'urgent',
  ).length

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

  // Rent arrears: per-property expectation from active tenancies vs
  // rent-category credits, summed portfolio-wide. Full method (FIFO
  // allocation, first-month skip) lives in lib/domain/arrears.
  const activeTenancies = (tenancyRes.data ?? []) as Array<{
    property_id: string
    rent_pence: string | number
    rent_period: string
    status: string
    start_date: string
  }>
  const rentCredits = (rentTxRes.data ?? []) as Array<{
    id: string
    property_id: string | null
    amount_pence: string | number
    posted_at: string
    split_parent_id: string | null
  }>
  // Split parents must not be summed — their children carry the money.
  const rentSplitParents = new Set<string>()
  for (const tx of rentCredits) {
    if (tx.split_parent_id !== null) rentSplitParents.add(tx.split_parent_id)
  }
  const arrearsTenanciesByProperty = new Map<string, ArrearsTenancy[]>()
  for (const t of activeTenancies) {
    const list = arrearsTenanciesByProperty.get(t.property_id) ?? []
    list.push({
      rentPence: toBig(t.rent_pence),
      rentPeriod: t.rent_period as RentPeriod,
      status: t.status,
      startDate: t.start_date,
    })
    arrearsTenanciesByProperty.set(t.property_id, list)
  }
  const rentReceivedByPropertyMonth = new Map<string, Map<string, bigint>>()
  for (const tx of rentCredits) {
    if (tx.property_id === null || rentSplitParents.has(tx.id)) continue
    const byMonth =
      rentReceivedByPropertyMonth.get(tx.property_id) ?? new Map<string, bigint>()
    const key = monthKey(tx.posted_at)
    byMonth.set(key, (byMonth.get(key) ?? 0n) + toBig(tx.amount_pence))
    rentReceivedByPropertyMonth.set(tx.property_id, byMonth)
  }
  let arrearsOutstandingPence = 0n
  for (const [propertyId, propTenancies] of arrearsTenanciesByProperty) {
    const byMonth =
      rentReceivedByPropertyMonth.get(propertyId) ?? new Map<string, bigint>()
    arrearsOutstandingPence += arrearsForProperty({
      expectedMonthlyPence: expectedMonthlyRentPence(propTenancies),
      receivedByMonth: [...byMonth.entries()].map(([month, receivedPence]) => ({
        month,
        receivedPence,
      })),
      months: arrearsMonths,
      expectedByMonthPence: expectedByMonth(propTenancies, arrearsMonths),
    }).balancePence
  }

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
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
        <Link href="/arrears" className="block">
          <KpiTile
            label="Rent arrears"
            display={
              <MoneyDisplay
                pence={arrearsOutstandingPence}
                className={arrearsOutstandingPence > 0n ? 'text-destructive' : undefined}
              />
            }
            sub={arrearsOutstandingPence > 0n ? 'Open arrears →' : 'Last 3 months'}
            className={
              arrearsOutstandingPence > 0n
                ? 'border-destructive/50 transition-colors hover:bg-destructive/5'
                : 'transition-colors hover:bg-muted'
            }
          />
        </Link>
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

      {openJobCount > 0 && (
        <Link
          href="/maintenance?view=board"
          className="block rounded-lg border bg-card p-4 hover:bg-muted"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {openJobCount} open maintenance {openJobCount === 1 ? 'job' : 'jobs'}
            </p>
            {emergencyUrgentCount > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                {emergencyUrgentCount} emergency/urgent
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Open the maintenance board →
          </p>
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
