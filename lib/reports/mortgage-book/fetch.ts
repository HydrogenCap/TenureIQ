// lib/reports/mortgage-book/fetch.ts

import { supabaseServer } from '@/lib/db/user'
import { ltvBps as computeLtv } from '@/lib/domain/equity'
import {
  monthlyInterestPence,
  daysUntilFixedEnd,
} from '@/lib/domain/mortgage'
import type { MortgageBookRow, MortgageBookData } from './types'

type MortgageDbRow = {
  id: string
  property_id: string
  lender: string
  product: string
  is_interest_only: boolean
  current_balance_pence: string | number
  monthly_payment_pence: string | number
  interest_rate_bps: number
  fixed_end_date: string | null
  property: Array<{
    address_line_1: string
    postcode: string
    current_valuation_pence: string | number | null
    purchase_price_pence: string | number
    entity: Array<{ name: string }>
  }>
}

type OrgDbRow = { name: string }

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function fetchMortgageBook(
  organisationId: string,
): Promise<MortgageBookData> {
  const sb = await supabaseServer()
  const [orgRes, mortgagesRes] = await Promise.all([
    sb
      .from('organisations')
      .select('name')
      .eq('id', organisationId)
      .single<OrgDbRow>(),
    sb
      .from('mortgages')
      .select(
        'id, property_id, lender, product, is_interest_only, current_balance_pence, monthly_payment_pence, interest_rate_bps, fixed_end_date, property:properties(address_line_1, postcode, current_valuation_pence, purchase_price_pence, entity:entities(name))',
      )
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('lender'),
  ])

  const today = new Date()
  const orgName = orgRes.data?.name ?? 'Mortgage book'
  const mortgages = (mortgagesRes.data ?? []) as MortgageDbRow[]

  const rows: MortgageBookRow[] = mortgages.map((m) => {
    const p = m.property?.[0]
    const balance = toBig(m.current_balance_pence)
    const value = p
      ? p.current_valuation_pence !== null
        ? toBig(p.current_valuation_pence)
        : toBig(p.purchase_price_pence)
      : 0n
    const monthlyInt = monthlyInterestPence(balance, m.interest_rate_bps)
    const stress1pp = monthlyInterestPence(balance, m.interest_rate_bps + 100)
    const stress2pp = monthlyInterestPence(balance, m.interest_rate_bps + 200)
    const ltv =
      value === 0n
        ? null
        : computeLtv({ valuationPence: value, balancePence: balance })
    const daysFixed = daysUntilFixedEnd(
      {
        interestRateBps: m.interest_rate_bps,
        fixedEndDate: m.fixed_end_date,
        currentBalancePence: balance,
        isInterestOnly: m.is_interest_only,
      },
      today,
    )

    return {
      id: m.id,
      propertyAddressLine1: p?.address_line_1 ?? '—',
      propertyPostcode: p?.postcode ?? '',
      entityName: p?.entity?.[0]?.name ?? '—',
      lender: m.lender,
      product: m.product,
      isInterestOnly: m.is_interest_only,
      currentBalancePence: balance,
      monthlyPaymentPence: toBig(m.monthly_payment_pence),
      interestRateBps: m.interest_rate_bps,
      fixedEndDate: m.fixed_end_date,
      daysToFixedEnd: daysFixed,
      ltvBps: ltv,
      stressed1ppMonthlyInterestPence: stress1pp,
      stressed2ppMonthlyInterestPence: stress2pp,
    }
  })

  const totalBalance = rows.reduce((s, r) => s + r.currentBalancePence, 0n)
  const totalMonthlyInt = rows.reduce(
    (s, r) => s + monthlyInterestPence(r.currentBalancePence, r.interestRateBps),
    0n,
  )
  const totalStress1pp = rows.reduce(
    (s, r) => s + r.stressed1ppMonthlyInterestPence,
    0n,
  )
  const totalStress2pp = rows.reduce(
    (s, r) => s + r.stressed2ppMonthlyInterestPence,
    0n,
  )
  const weightedRate =
    totalBalance === 0n
      ? null
      : Number(
          rows.reduce(
            (s, r) => s + BigInt(r.interestRateBps) * r.currentBalancePence,
            0n,
          ) / totalBalance,
        )

  return {
    organisationName: orgName,
    asOf: today,
    rows,
    totals: {
      mortgageCount: rows.length,
      currentBalancePence: totalBalance,
      monthlyInterestPence: totalMonthlyInt,
      stressed1ppMonthlyInterestPence: totalStress1pp,
      stressed2ppMonthlyInterestPence: totalStress2pp,
      weightedAverageRateBps: weightedRate,
    },
    refinanceWindowCount: rows.filter(
      (r) => r.daysToFixedEnd !== null && r.daysToFixedEnd >= 0 && r.daysToFixedEnd <= 180,
    ).length,
  }
}
