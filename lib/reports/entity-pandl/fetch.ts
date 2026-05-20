// lib/reports/entity-pandl/fetch.ts
// Pulls the YTD P&L surface for an entity. Mirrors the in-page
// EntityPandL component but returns plain data for the PDF renderer.

import { supabaseServer } from '@/lib/db/user'
import {
  monthlyPandL,
  CREDIT_CATEGORIES,
  type TransactionLike,
  type CategoryCode,
} from '@/lib/domain/transactions'
import {
  individualLandlordTax,
  companyLandlordTax,
  section24CostPence,
} from '@/lib/domain/section24'
import { bpsToPercent } from '@/lib/money'
import type { EntityPandLData, EntityPandLMonth } from './types'

type TxDb = {
  id: string
  posted_at: string
  amount_pence: string | number
  category_code: string
  property_id: string | null
  entity_id: string | null
  split_parent_id: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

function isCredit(code: string): boolean {
  return CREDIT_CATEGORIES.has(code as CategoryCode)
}

const TAX_EXCLUDED: ReadonlySet<string> = new Set([
  'mortgage_payment',
  'mortgage_capital',
  'mortgage_interest',
  'capital_expenditure',
  'investor_contribution',
  'investor_distribution',
  'director_loan_in',
  'director_loan_out',
  'refinance_drawdown',
  'tax_payment',
  'transfer',
  'reconciliation',
  'opening_balance',
  'uncategorised',
])

// UUID regex — used to validate entityId at the function entry as
// defence-in-depth. The .or() filter below interpolates entityId into
// a Postgrest filter string; rejecting non-UUID input here closes the
// injection vector even though every query already includes the
// .eq('organisation_id', …) gate.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchEntityPandL(
  entityId: string,
  organisationId: string,
): Promise<EntityPandLData | null> {
  if (!UUID_RE.test(entityId)) return null

  const sb = await supabaseServer()
  const year = new Date().getUTCFullYear()
  const yearStart = `${year}-01-01`

  const [orgRes, entityRes, propsRes] = await Promise.all([
    sb.from('organisations').select('name').eq('id', organisationId).single<{
      name: string
    }>(),
    sb
      .from('entities')
      .select('name, kind')
      .eq('id', entityId)
      .eq('organisation_id', organisationId)
      .maybeSingle<{ name: string; kind: string }>(),
    sb
      .from('properties')
      .select('id')
      .eq('entity_id', entityId)
      .eq('organisation_id', organisationId)
      .is('deleted_at', null),
  ])

  // Sentinel-free miss detection: return null when the entity doesn't
  // exist (or isn't in the caller's org). Don't fall back to a
  // displayable '—' here — an entity legitimately named '—' would
  // otherwise produce a spurious 404 / leak.
  if (!entityRes.data) return null

  const orgName = orgRes.data?.name ?? '—'
  const entityName = entityRes.data.name
  const entityKind = entityRes.data.kind
  const propertyIds = ((propsRes.data ?? []) as Array<{ id: string }>).map(
    (p) => p.id,
  )

  // Property-or-entity-tagged transactions for YTD.
  let txQuery = sb
    .from('transactions')
    .select(
      'id, posted_at, amount_pence, category_code, property_id, entity_id, split_parent_id',
    )
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .gte('posted_at', yearStart)
  if (propertyIds.length > 0) {
    txQuery = txQuery.or(
      `entity_id.eq.${entityId},property_id.in.(${propertyIds.join(',')})`,
    )
  } else {
    txQuery = txQuery.eq('entity_id', entityId)
  }
  const { data: rawTx } = await txQuery
  const transactions = (rawTx ?? []) as TxDb[]

  const splitParentIds = new Set<string>()
  for (const t of transactions) {
    if (t.split_parent_id !== null) splitParentIds.add(t.split_parent_id)
  }
  const rows: TransactionLike[] = transactions.map((t) => ({
    postedAt: t.posted_at,
    amountPence: toBig(t.amount_pence),
    categoryCode: t.category_code,
    propertyId: t.property_id,
    entityId: t.entity_id,
    isSplitParent: splitParentIds.has(t.id),
  }))

  const currentMonth = new Date().getUTCMonth() + 1
  const monthlyTotals = Array.from({ length: currentMonth }, (_, i) =>
    monthlyPandL({ transactions: rows, month: { year, month: i + 1 } }),
  )

  const months: EntityPandLMonth[] = monthlyTotals.map((m, i) => ({
    monthLabel: new Date(year, i, 1).toLocaleString('en-GB', { month: 'short' }),
    netPence: m.netPence,
    byCategory: m.byCategory,
  }))

  const seen = new Set<string>()
  for (const m of monthlyTotals) for (const k of Object.keys(m.byCategory)) seen.add(k)
  const creditCategories = [...seen].filter(isCredit).sort()
  const debitCategories = [...seen].filter((c) => !isCredit(c)).sort()

  const ytdNetPence = monthlyTotals.reduce((sum, m) => sum + m.netPence, 0n)

  // YTD per-category rollup for the tax estimate.
  const ytdByCategory = new Map<string, bigint>()
  for (const m of monthlyTotals) {
    for (const [cat, amount] of Object.entries(m.byCategory)) {
      ytdByCategory.set(cat, (ytdByCategory.get(cat) ?? 0n) + (amount ?? 0n))
    }
  }

  const ytdGrossRentPence =
    (ytdByCategory.get('rent') ?? 0n) +
    (ytdByCategory.get('aasc_payment') ?? 0n) +
    (ytdByCategory.get('other_income') ?? 0n)
  const ytdMortgageInterestPence =
    -(ytdByCategory.get('mortgage_interest') ?? 0n)

  let signedDebitSum = 0n
  for (const [cat, amount] of ytdByCategory) {
    if (TAX_EXCLUDED.has(cat)) continue
    if (CREDIT_CATEGORIES.has(cat as CategoryCode)) continue
    signedDebitSum += amount
  }
  const ytdOtherCostsPence = signedDebitSum < 0n ? -signedDebitSum : 0n

  const isCompany = entityKind === 'ltd' || entityKind === 'spv'
  let taxEstimate: EntityPandLData['taxEstimate'] = null

  if (ytdGrossRentPence > 0n) {
    if (isCompany) {
      const r = companyLandlordTax({
        grossRentPence: ytdGrossRentPence,
        mortgageInterestPence: ytdMortgageInterestPence,
        otherCostsPence: ytdOtherCostsPence,
        ctRateBps: 2500,
      })
      taxEstimate = {
        isCompany: true,
        netTaxPence: r.netTaxPence,
        effectiveRateOnRentBps: null,
        section24CostPence: null,
        headline: 'Estimated CT @ 25% (main rate)',
        rateAssumption:
          'Mortgage interest fully deductible. Switch to small-profits 19% if YTD profit < £50k.',
      }
    } else {
      const r = individualLandlordTax({
        grossRentPence: ytdGrossRentPence,
        mortgageInterestPence: ytdMortgageInterestPence,
        otherCostsPence: ytdOtherCostsPence,
        marginalRateBps: 4000,
      })
      const s24 = section24CostPence({
        grossRentPence: ytdGrossRentPence,
        mortgageInterestPence: ytdMortgageInterestPence,
        otherCostsPence: ytdOtherCostsPence,
        marginalRateBps: 4000,
      })
      taxEstimate = {
        isCompany: false,
        netTaxPence: r.netTaxPence,
        effectiveRateOnRentBps: r.effectiveRateOnRentBps,
        section24CostPence: s24,
        headline: `Estimated income tax @ 40% (post-S24, effective ${bpsToPercent(r.effectiveRateOnRentBps)} of rent)`,
        rateAssumption:
          'Assumes higher-rate (40%). 20% mortgage-interest tax credit applied per Section 24.',
      }
    }
  }

  return {
    organisationName: orgName,
    entityName,
    entityKind,
    asOf: new Date(),
    year,
    months,
    creditCategories,
    debitCategories,
    ytdNetPence,
    ytdGrossRentPence,
    ytdMortgageInterestPence,
    ytdOtherCostsPence,
    taxEstimate,
  }
}
