// lib/reports/portfolio-summary/fetch.ts
// Pulls per-property + per-mortgage rows scoped to the caller's org.
// RLS-enforced via supabaseServer(); no service-role usage. The report
// route is auth-gated upstream.

import { supabaseServer } from '@/lib/db/user'
import { meesStatus, type EpcBand } from '@/lib/domain/mees'
import { weightedAverageLtvBps, portfolioTotals } from '@/lib/domain/portfolio'
import { ltvBps as computeLtv } from '@/lib/domain/equity'
import { monthlyRentPence, type RentPeriod } from '@/lib/domain/rent'
import type { PortfolioRow, PortfolioSummaryData } from './types'

type PropertyDbRow = {
  id: string
  address_line_1: string
  postcode: string
  kind: string
  epc_rating: string | null
  epc_expiry: string | null
  current_valuation_pence: string | number | null
  purchase_price_pence: string | number
  entity: Array<{ name: string }>
}

type MortgageDbRow = {
  property_id: string
  current_balance_pence: string | number
}

type TenancyDbRow = {
  property_id: string
  rent_pence: string | number
  rent_period: string
}

type OrgDbRow = { name: string }

function toBig(v: string | number | null): bigint | null {
  if (v === null) return null
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}
function toBigRequired(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function fetchPortfolioSummary(
  organisationId: string,
): Promise<PortfolioSummaryData> {
  const sb = await supabaseServer()

  const [orgRes, propsRes, mortgagesRes, tenanciesRes] = await Promise.all([
    sb.from('organisations').select('name').eq('id', organisationId).single<OrgDbRow>(),
    sb
      .from('properties')
      .select(
        'id, address_line_1, postcode, kind, epc_rating, epc_expiry, current_valuation_pence, purchase_price_pence, entity:entities(name)',
      )
      .eq('organisation_id', organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
    sb
      .from('mortgages')
      .select('property_id, current_balance_pence')
      .eq('organisation_id', organisationId)
      .is('deleted_at', null),
    sb
      .from('tenancies')
      .select('property_id, rent_pence, rent_period')
      .eq('organisation_id', organisationId)
      .eq('status', 'active')
      .is('deleted_at', null),
  ])

  const orgName = orgRes.data?.name ?? 'Portfolio'
  const properties = (propsRes.data ?? []) as PropertyDbRow[]
  const mortgages = (mortgagesRes.data ?? []) as MortgageDbRow[]
  const tenancies = (tenanciesRes.data ?? []) as TenancyDbRow[]

  // Debt per property.
  const debtByProperty = new Map<string, bigint>()
  for (const m of mortgages) {
    const cur = debtByProperty.get(m.property_id) ?? 0n
    debtByProperty.set(m.property_id, cur + toBigRequired(m.current_balance_pence))
  }

  // Active monthly rent per property (active tenancies, normalised).
  const monthlyRentByProperty = new Map<string, bigint>()
  for (const t of tenancies) {
    const monthly = monthlyRentPence(toBigRequired(t.rent_pence), t.rent_period as RentPeriod)
    const cur = monthlyRentByProperty.get(t.property_id) ?? 0n
    monthlyRentByProperty.set(t.property_id, cur + monthly)
  }

  const rows: PortfolioRow[] = properties.map((p) => {
    const value =
      p.current_valuation_pence !== null
        ? toBigRequired(p.current_valuation_pence)
        : toBigRequired(p.purchase_price_pence)
    const debt = debtByProperty.get(p.id) ?? 0n
    const ltv = debt === 0n || value === 0n
      ? null
      : computeLtv({ valuationPence: value, balancePence: debt })
    // Gross yield: annualised monthly rent / value in bps.
    const monthly = monthlyRentByProperty.get(p.id) ?? 0n
    const grossYieldBps =
      value > 0n && monthly > 0n
        ? Number((monthly * 12n * 10_000n) / value)
        : null
    const mees = meesStatus(
      p.epc_rating === null ? null : (p.epc_rating as EpcBand),
      p.epc_expiry,
    )
    return {
      id: p.id,
      addressLine1: p.address_line_1,
      postcode: p.postcode,
      entityName: p.entity?.[0]?.name ?? '—',
      kind: p.kind,
      epcRating: p.epc_rating,
      valuePence: value,
      debtPence: debt,
      ltvBps: ltv,
      grossYieldBps,
      letBlocked: mees === 'let_blocked',
    }
  })

  const rollups = rows.map((r) => ({ valuePence: r.valuePence, debtPence: r.debtPence }))
  const tot = portfolioTotals(rollups)
  const weightedLtvBps = weightedAverageLtvBps(rollups)

  return {
    organisationName: orgName,
    asOf: new Date(),
    rows,
    totals: {
      propertyCount: rows.length,
      valuePence: tot.totalValuePence,
      debtPence: tot.totalDebtPence,
      equityPence: tot.totalEquityPence,
      weightedLtvBps,
    },
    letBlockedCount: rows.filter((r) => r.letBlocked).length,
  }
}

// Re-export for the route handler.
export type { PortfolioSummaryData }
// Re-import to keep the import-graph clean.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _toBig(_v: string | number | null) {
  return toBig(_v)
}
