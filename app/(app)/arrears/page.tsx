// app/(app)/arrears/page.tsx — portfolio rent-arrears view.
//
// Transactions carry no tenancy link, so arrears is computed per PROPERTY:
// rent-category credits received each month vs the monthly-equivalent
// expectation of the property's active tenancies (lib/domain/arrears).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { formatGbp } from '@/lib/money'
import type { RentPeriod } from '@/lib/domain/rent'
import {
  arrearsForProperty,
  expectedByMonth,
  expectedMonthlyRentPence,
  lastNMonthKeys,
  monthKey,
  type AgeingBuckets,
  type ArrearsTenancy,
} from '@/lib/domain/arrears'

type TenancyDbRow = {
  property_id: string
  rent_pence: string | number
  rent_period: string
  status: string
  start_date: string
}

type TxDbRow = {
  id: string
  property_id: string | null
  amount_pence: string | number
  posted_at: string
  split_parent_id: string | null
}

type PropertyDbRow = {
  id: string
  address_line_1: string
  postcode: string
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

const WINDOW_MONTHS = 6

export const metadata = { title: 'Arrears' }

export default async function ArrearsPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const months = lastNMonthKeys(WINDOW_MONTHS, new Date())
  const oldestMonth = months[0] ?? monthKey(new Date())
  const newestMonth = months[months.length - 1] ?? oldestMonth
  const windowStart = `${oldestMonth}-01`

  // Org filter is defence-in-depth on top of RLS, matching sibling pages.
  const sb = await supabaseServer()
  const [tenanciesRes, txRes, propertiesRes] = await Promise.all([
    sb
      .from('tenancies')
      .select('property_id, rent_pence, rent_period, status, start_date')
      .eq('organisation_id', auth.organisationId)
      .in('status', ['active', 'notice_given'])
      .is('deleted_at', null),
    sb
      .from('transactions')
      .select('id, property_id, amount_pence, posted_at, split_parent_id')
      .eq('organisation_id', auth.organisationId)
      .eq('category_code', 'rent')
      .gt('amount_pence', 0)
      .gte('posted_at', windowStart)
      .is('deleted_at', null),
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null),
  ])

  const loadError = tenanciesRes.error ?? txRes.error ?? propertiesRes.error
  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Arrears" />
        <p className="text-sm text-destructive">Failed to load: {loadError.message}</p>
      </div>
    )
  }

  const tenancies = (tenanciesRes.data ?? []) as TenancyDbRow[]
  const transactions = (txRes.data ?? []) as TxDbRow[]
  const properties = (propertiesRes.data ?? []) as PropertyDbRow[]

  // A row is a split *parent* iff another fetched row points at it — the
  // children carry the money, so parents must not be summed twice.
  const splitParentIds = new Set<string>()
  for (const t of transactions) {
    if (t.split_parent_id !== null) splitParentIds.add(t.split_parent_id)
  }

  // Group active tenancies by property.
  const tenanciesByProperty = new Map<string, ArrearsTenancy[]>()
  for (const t of tenancies) {
    const list = tenanciesByProperty.get(t.property_id) ?? []
    list.push({
      rentPence: toBig(t.rent_pence),
      rentPeriod: t.rent_period as RentPeriod,
      status: t.status,
      startDate: t.start_date,
    })
    tenanciesByProperty.set(t.property_id, list)
  }

  // Group rent credits by property + month. Credits with no property link
  // cannot be attributed and are excluded (noted in the footnote).
  const receivedByPropertyMonth = new Map<string, Map<string, bigint>>()
  for (const tx of transactions) {
    if (tx.property_id === null) continue
    if (splitParentIds.has(tx.id)) continue
    const key = monthKey(tx.posted_at)
    const byMonth = receivedByPropertyMonth.get(tx.property_id) ?? new Map<string, bigint>()
    byMonth.set(key, (byMonth.get(key) ?? 0n) + toBig(tx.amount_pence))
    receivedByPropertyMonth.set(tx.property_id, byMonth)
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]))

  type ArrearsRow = {
    propertyId: string
    addressLine1: string
    postcode: string
    expectedMonthlyPence: bigint
    receivedNewestMonthPence: bigint
    balancePence: bigint
    ageing: AgeingBuckets
  }

  // Only properties with an active tenancy carry an expectation; a vacant
  // property can never be in arrears.
  const rows: ArrearsRow[] = []
  for (const [propertyId, propTenancies] of tenanciesByProperty) {
    const byMonth = receivedByPropertyMonth.get(propertyId) ?? new Map<string, bigint>()
    const result = arrearsForProperty({
      expectedMonthlyPence: expectedMonthlyRentPence(propTenancies),
      receivedByMonth: [...byMonth.entries()].map(([month, receivedPence]) => ({
        month,
        receivedPence,
      })),
      months,
      expectedByMonthPence: expectedByMonth(propTenancies, months),
    })
    if (result.balancePence <= 0n) continue

    const property = propertyById.get(propertyId)
    rows.push({
      propertyId,
      addressLine1: property?.address_line_1 ?? 'Unknown property',
      postcode: property?.postcode ?? '',
      expectedMonthlyPence: expectedMonthlyRentPence(propTenancies),
      receivedNewestMonthPence: byMonth.get(newestMonth) ?? 0n,
      balancePence: result.balancePence,
      ageing: result.ageing,
    })
  }

  // Worst first.
  rows.sort((a, b) => (b.balancePence > a.balancePence ? 1 : b.balancePence < a.balancePence ? -1 : 0))

  let totalOutstandingPence = 0n
  let total90PlusPence = 0n
  for (const r of rows) {
    totalOutstandingPence += r.balancePence
    total90PlusPence += r.ageing.days90plus
  }

  const newestMonthLabel = monthLabel(newestMonth)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arrears"
        description={`Rent received vs expected over the last ${WINDOW_MONTHS} months, per property.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          label="Total outstanding"
          display={
            <MoneyDisplay
              pence={totalOutstandingPence}
              className={totalOutstandingPence > 0n ? 'text-destructive' : undefined}
            />
          }
        />
        <KpiTile label="Properties in arrears" display={rows.length} />
        <KpiTile
          label="Overdue 90+ days"
          display={
            <MoneyDisplay
              pence={total90PlusPence}
              className={total90PlusPence > 0n ? 'text-destructive' : undefined}
            />
          }
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No arrears"
          description="Every property is fully paid up."
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Property
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Expected / mo
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Received ({newestMonthLabel})
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Outstanding
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Ageing
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.propertyId} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/properties/${r.propertyId}`}
                        className="font-medium hover:underline"
                      >
                        {r.addressLine1}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{r.postcode}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <MoneyDisplay pence={r.expectedMonthlyPence} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <MoneyDisplay pence={r.receivedNewestMonthPence} />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">
                      <MoneyDisplay pence={r.balancePence} />
                    </td>
                    <td className="px-3 py-2">
                      <AgeingBadges ageing={r.ageing} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Method: for each property, rent-category credit transactions are compared month by
        month against the monthly-equivalent rent of its active tenancies. Payments clear the
        oldest month first; overpayments carry forward. A tenancy&apos;s first partial month is
        not charged, and rent credits without a property assigned are not counted.
      </p>
    </div>
  )
}

// 'YYYY-MM' → short human label, e.g. 'Jul 2026'.
function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  if (y === undefined || m === undefined) return key
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Small per-bucket amount badges — colour escalates with age.
function AgeingBadges({ ageing }: { ageing: AgeingBuckets }) {
  const buckets: Array<{ label: string; pence: bigint; className: string }> = [
    {
      label: 'current',
      pence: ageing.current,
      className: 'bg-muted text-muted-foreground',
    },
    {
      label: '30d',
      pence: ageing.days30,
      className:
        'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    },
    {
      label: '60d',
      pence: ageing.days60,
      className:
        'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
    },
    {
      label: '90d+',
      pence: ageing.days90plus,
      className: 'bg-destructive/10 text-destructive',
    },
  ]
  return (
    <div className="flex flex-wrap gap-1">
      {buckets
        .filter((b) => b.pence > 0n)
        .map((b) => (
          <span
            key={b.label}
            className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${b.className}`}
          >
            {b.label} {formatGbp(b.pence)}
          </span>
        ))}
    </div>
  )
}
