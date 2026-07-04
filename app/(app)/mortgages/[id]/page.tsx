// app/(app)/mortgages/[id]/page.tsx — mortgage detail with payment ledger.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { StatusBadge } from '@/components/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { bpsToPercent } from '@/lib/money'
import {
  currentInterestRateBps,
  daysUntilFixedEnd,
  monthlyInterestPence,
  type MortgageEventLike,
} from '@/lib/domain/mortgage'
import { ltvBps } from '@/lib/domain/equity'
import { monthlyRentPence as monthlyRentForPeriod, type RentPeriod } from '@/lib/domain/rent'
import { MortgageEventForm } from './_components/mortgage-event-form'
import { RefinanceCalculator } from './_components/refinance-calculator'

type DbRow = {
  id: string
  property_id: string
  lender: string
  account_ref: string | null
  product: string
  original_loan_pence: string | number
  current_balance_pence: string | number
  interest_rate_bps: number
  monthly_payment_pence: string | number
  term_months: number
  fixed_end_date: string | null
  is_interest_only: boolean
  broker: string | null
  notes: string | null
  property: Array<{
    address_line_1: string
    postcode: string
    current_valuation_pence: string | number | null
    purchase_price_pence: string | number
  }>
}

type EventRow = {
  id: string
  event_date: string
  kind: string
  amount_pence: string | number | null
  rate_post_bps: number | null
  balance_pence: string | number | null
  notes: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}
function toOptBig(v: string | number | null): bigint | null {
  return v === null ? null : toBig(v)
}

export default async function MortgageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('mortgages')
    .select(
      `*, property:properties(address_line_1, postcode, current_valuation_pence, purchase_price_pence)`,
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()
  if (!data) notFound()

  const { data: rawEvents } = await sb
    .from('mortgage_events')
    .select('id, event_date, kind, amount_pence, rate_post_bps, balance_pence, notes')
    .eq('mortgage_id', id)
    .order('event_date', { ascending: false })
    .limit(100)

  const events = (rawEvents ?? []) as EventRow[]

  // Monthly rent roll for the refinance calculator's ICR inputs — the same
  // active-tenancy query the property detail page uses for its weekly rent
  // roll, normalised to monthly here because lender affordability maths is
  // quoted per month.
  const { data: rawTenancies } = await sb
    .from('tenancies')
    .select('rent_pence, rent_period, status')
    .eq('property_id', data.property_id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)

  const tenancies = (rawTenancies ?? []) as Array<{
    rent_pence: string | number | null
    rent_period: string
    status: string
  }>
  const monthlyRentRollPence = tenancies
    .filter((t) => t.status === 'active' && t.rent_pence !== null)
    .reduce(
      (sum, t) =>
        sum + monthlyRentForPeriod(toBig(t.rent_pence ?? 0), t.rent_period as RentPeriod),
      0n,
    )

  const property = data.property?.[0]
  const balance = toBig(data.current_balance_pence)
  const value =
    property?.current_valuation_pence !== null && property?.current_valuation_pence !== undefined
      ? toBig(property.current_valuation_pence)
      : property
        ? toBig(property.purchase_price_pence)
        : null

  // Domain helpers expect MortgageEventLike shape — map once.
  const eventsForDomain: MortgageEventLike[] = events.map((e) => ({
    eventDate: e.event_date,
    kind: e.kind,
    ratePostBps: e.rate_post_bps,
    amountPence: toOptBig(e.amount_pence),
    balancePence: toOptBig(e.balance_pence),
  }))

  const currentRateBps = currentInterestRateBps(
    {
      interestRateBps: data.interest_rate_bps,
      fixedEndDate: data.fixed_end_date,
      currentBalancePence: balance,
      isInterestOnly: data.is_interest_only,
    },
    eventsForDomain,
  )
  const monthlyInterest = monthlyInterestPence(balance, currentRateBps)
  const daysToFixed = daysUntilFixedEnd({
    interestRateBps: data.interest_rate_bps,
    fixedEndDate: data.fixed_end_date,
    currentBalancePence: balance,
    isInterestOnly: data.is_interest_only,
  })
  const propertyLtvBps =
    value === null ? null : ltvBps({ valuationPence: value, balancePence: balance })

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.lender} — ${data.product.replace(/_/g, ' ')}`}
        description={
          property
            ? `${property.address_line_1}, ${property.postcode}`
            : undefined
        }
        actions={
          <>
            <Link
              href={`/properties/${data.property_id}?tab=finance`}
              className="self-center text-sm font-medium text-muted-foreground hover:underline"
            >
              ← Property finance
            </Link>
            <Link
              href={`/mortgages/${data.id}/edit`}
              className="self-center text-sm font-medium text-primary hover:underline"
            >
              Edit
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Current balance"
          display={<MoneyDisplay pence={balance} />}
        />
        <KpiTile
          label="Rate"
          display={bpsToPercent(currentRateBps)}
          sub={
            <>
              {data.is_interest_only ? 'Interest only · ' : ''}≈{' '}
              {monthlyInterest === 0n ? '—' : <MoneyDisplay pence={monthlyInterest} />} / mo
              interest
            </>
          }
        />
        <KpiTile
          label="LTV"
          display={propertyLtvBps === null ? '—' : bpsToPercent(propertyLtvBps)}
          sub={value === null ? 'no value' : undefined}
        />
        <KpiTile
          label="Fixed end"
          display={
            data.fixed_end_date ? (
              <DateDisplay date={data.fixed_end_date} formatStr="MMM yyyy" />
            ) : (
              '—'
            )
          }
          sub={
            daysToFixed === null
              ? undefined
              : daysToFixed < 0
                ? `${Math.abs(daysToFixed)} days ago`
                : `in ${daysToFixed} days`
          }
          trend={
            daysToFixed !== null && daysToFixed >= 0 && daysToFixed <= 180 ? 'down' : 'flat'
          }
        />
      </div>

      <MortgageEventForm mortgageId={data.id} isInterestOnly={data.is_interest_only} />

      <section>
        <h3 className="mb-2 text-base font-medium">Payment history</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Rate (after)</TableHead>
                <TableHead className="text-right">Balance (after)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <DateDisplay date={e.event_date} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={e.kind} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toOptBig(e.amount_pence)} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {e.rate_post_bps === null ? '—' : bpsToPercent(e.rate_post_bps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toOptBig(e.balance_pence)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-base font-medium">Refinance scenario</h3>
        <RefinanceCalculator
          currentBalancePence={balance.toString()}
          currentRateBps={currentRateBps}
          currentMonthlyPaymentPence={toBig(data.monthly_payment_pence).toString()}
          currentIsInterestOnly={data.is_interest_only}
          monthlyRentPence={monthlyRentRollPence.toString()}
        />
      </section>

      {data.notes && (
        <section>
          <h3 className="mb-2 text-base font-medium">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p>
        </section>
      )}
    </div>
  )
}
