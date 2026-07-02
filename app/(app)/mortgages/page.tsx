// app/(app)/mortgages/page.tsx — global mortgages list.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { MortgagesTable, type MortgageRow } from './_components/mortgages-table'
import { ltvBps } from '@/lib/domain/equity'
import { daysUntilFixedEnd } from '@/lib/domain/mortgage'

type DbRow = {
  id: string
  property_id: string
  lender: string
  product: string
  current_balance_pence: string | number
  interest_rate_bps: number
  fixed_end_date: string | null
  is_interest_only: boolean
  property: Array<{
    address_line_1: string
    postcode: string
    current_valuation_pence: string | number | null
    purchase_price_pence: string | number
  }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export const metadata = { title: 'Mortgages' }

export default async function MortgagesPage({
  searchParams,
}: {
  searchParams: Promise<{ fixedEndWithin?: string }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { fixedEndWithin } = await searchParams

  const sb = await supabaseServer()
  const { data: rawRows, error } = await sb
    .from('mortgages')
    .select(
      'id, property_id, lender, product, current_balance_pence, interest_rate_bps, fixed_end_date, is_interest_only, property:properties(address_line_1, postcode, current_valuation_pence, purchase_price_pence)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('lender')

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mortgages" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const today = new Date()
  let mortgages = (rawRows ?? []) as DbRow[]

  // Optional "within N days of fixed end" filter for the dashboard tile.
  if (fixedEndWithin) {
    const cutoffDays = Number(fixedEndWithin)
    if (Number.isFinite(cutoffDays)) {
      mortgages = mortgages.filter((m) => {
        if (!m.fixed_end_date) return false
        const d = daysUntilFixedEnd(
          {
            interestRateBps: m.interest_rate_bps,
            fixedEndDate: m.fixed_end_date,
            currentBalancePence: 0n,
            isInterestOnly: m.is_interest_only,
          },
          today,
        )
        return d !== null && d >= 0 && d <= cutoffDays
      })
    }
  }

  const rows: MortgageRow[] = mortgages.map((m) => {
    const p = m.property?.[0]
    const value =
      p?.current_valuation_pence !== null && p?.current_valuation_pence !== undefined
        ? toBig(p.current_valuation_pence)
        : p
          ? toBig(p.purchase_price_pence)
          : null
    const balance = toBig(m.current_balance_pence)
    return {
      id: m.id,
      lender: m.lender,
      product: m.product,
      propertyAddressLine1: p?.address_line_1 ?? '—',
      propertyPostcode: p?.postcode ?? '',
      currentBalancePence: balance,
      interestRateBps: m.interest_rate_bps,
      fixedEndDate: m.fixed_end_date,
      ltvBps:
        value === null
          ? null
          : ltvBps({ valuationPence: value, balancePence: balance }),
      isInterestOnly: m.is_interest_only,
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mortgages"
        description={
          fixedEndWithin
            ? `Mortgages with fixed-rate end within ${fixedEndWithin} days.`
            : 'Every loan across your portfolio.'
        }
        actions={
          <Link href="/mortgages/new" className={buttonVariants()}>
            + New mortgage
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={fixedEndWithin ? 'No mortgages match this filter' : 'No mortgages yet'}
          description={
            fixedEndWithin
              ? 'No mortgages have a fixed-rate end inside this window.'
              : 'Add one to enable LTV, ICR, and refinance modelling.'
          }
          action={
            !fixedEndWithin && (
              <Link href="/mortgages/new" className={buttonVariants()}>
                + New mortgage
              </Link>
            )
          }
        />
      ) : (
        <MortgagesTable rows={rows} />
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'mortgage' : 'mortgages'}
      </p>
    </div>
  )
}
