// Year-to-date P&L for an entity. Pulls transactions whose property
// belongs to the entity OR where entity_id matches directly (entity-
// level transactions). Renders months as columns, categories as rows.
// Also adds a tax-estimate footer that picks the right computation
// based on entity.kind (individual/LLP → Section 24, ltd/SPV → CT).

import { supabaseServer } from '@/lib/db/user'
import { requireOrgMember } from '@/lib/auth/require'
import { redirect } from 'next/navigation'
import { MoneyDisplay } from '@/components/money-display'
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

export async function EntityPandL({ entityId }: { entityId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const year = new Date().getUTCFullYear()
  const yearStart = `${year}-01-01`

  // Entity kind drives the tax computation.
  const { data: rawEntity } = await sb
    .from('entities')
    .select('kind')
    .eq('id', entityId)
    .eq('organisation_id', auth.organisationId)
    .maybeSingle<{ kind: string }>()
  const entityKind = rawEntity?.kind ?? 'individual'

  // Properties under this entity (we use property_id OR entity_id direct).
  const { data: rawProps } = await sb
    .from('properties')
    .select('id')
    .eq('entity_id', entityId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  const propertyIds = ((rawProps ?? []) as Array<{ id: string }>).map((p) => p.id)

  // Pull transactions either tagged at the entity level or for one of
  // the entity's properties.
  let txQuery = sb
    .from('transactions')
    .select('id, posted_at, amount_pence, category_code, property_id, entity_id, split_parent_id')
    .eq('organisation_id', auth.organisationId)
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

  // A row is a split *parent* iff some other row has `split_parent_id`
  // pointing to it. Children carry the actual money amounts; parents must
  // not be summed (would double-count). Pre-compute the parent id set
  // once instead of per-row scanning the whole list (which is also what
  // the original wrong-by-default check was doing, but with the wrong
  // predicate).
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

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions in {year} yet. Record one or import a bank CSV to see your year-to-date P&L.
      </p>
    )
  }

  const currentMonth = new Date().getUTCMonth() + 1
  const monthlyTotals = Array.from({ length: currentMonth }, (_, i) =>
    monthlyPandL({ transactions: rows, month: { year, month: i + 1 } }),
  )

  // Collect every category that's appeared this year, split credit vs debit.
  const seen = new Set<string>()
  for (const m of monthlyTotals) for (const k of Object.keys(m.byCategory)) seen.add(k)
  const credits = [...seen].filter(isCredit).sort()
  const debits = [...seen].filter((c) => !isCredit(c)).sort()

  const totalsByMonth = monthlyTotals.map((m) => m.netPence)
  const ytdNet = totalsByMonth.reduce((sum, v) => sum + v, 0n)

  // Roll up YTD per category for the tax estimate.
  const ytdByCategory = new Map<string, bigint>()
  for (const m of monthlyTotals) {
    for (const [cat, amount] of Object.entries(m.byCategory)) {
      ytdByCategory.set(cat, (ytdByCategory.get(cat) ?? 0n) + (amount ?? 0n))
    }
  }

  // Credits are stored positive; debits are stored negative. The tax
  // helpers want absolute pence, so flip signs on cost rows.
  const grossRentPence =
    (ytdByCategory.get('rent') ?? 0n) +
    (ytdByCategory.get('aasc_payment') ?? 0n) +
    (ytdByCategory.get('other_income') ?? 0n)

  // mortgage_payment is the gross monthly cheque; we'd ideally split
  // it into interest + capital via the mortgage_events ledger. Without
  // a per-tx split we approximate mortgage interest as the sum of
  // explicit interest categories; if the user only categorises as
  // mortgage_payment we'll under-state the S24 credit, which is
  // conservative for tax-planning purposes.
  const mortgageInterestPence =
    -(ytdByCategory.get('mortgage_interest') ?? 0n)

  // Everything else debit-side counts as "other costs" for the tax
  // computation. We exclude mortgage_payment, mortgage_capital,
  // capital_expenditure, and the structural categories.
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
  // Sum signed amounts across the included debit categories, then
  // negate (debit categories sum to negative pence). This correctly
  // nets refunds — a positive amount on `maintenance` (someone refunded
  // a repair charge) reduces the total cost. Floor at 0 so a net-
  // positive debit-category sum doesn't reduce gross rent in the tax
  // helper (a refund-only year shouldn't shrink taxable profit below
  // the rent baseline).
  let signedDebitSum = 0n
  for (const [cat, amount] of ytdByCategory) {
    if (TAX_EXCLUDED.has(cat)) continue
    if (CREDIT_CATEGORIES.has(cat as CategoryCode)) continue
    signedDebitSum += amount
  }
  const otherCostsPence = signedDebitSum < 0n ? -signedDebitSum : 0n

  const isCompany = entityKind === 'ltd' || entityKind === 'spv'

  let taxBlock: {
    headline: string
    sub: string
    ytdTaxPence: bigint
    section24CostPence: bigint | null
    note: string
  } | null = null

  if (grossRentPence > 0n) {
    if (isCompany) {
      // Use main CT rate (25%) — the small-profits band only applies
      // below £50k profits and most landlord SPVs sit above it once
      // mortgage interest is excluded. This is a quick estimate, not
      // a CT computation.
      const r = companyLandlordTax({
        grossRentPence,
        mortgageInterestPence,
        otherCostsPence,
        ctRateBps: 2500,
      })
      taxBlock = {
        headline: 'Estimated CT @ 25% (main rate)',
        sub: 'Mortgage interest is fully deductible for companies',
        ytdTaxPence: r.netTaxPence,
        section24CostPence: null,
        note:
          'Quick estimate. Switch to small-profits 19% if YTD profit < £50k; full CT computation belongs on the year-end report.',
      }
    } else {
      // Default to higher-rate (40%) for the estimate — TenureIQ users
      // are usually higher-rate landlords; the worked tax-planning
      // report lets them try other rates.
      const r = individualLandlordTax({
        grossRentPence,
        mortgageInterestPence,
        otherCostsPence,
        marginalRateBps: 4000,
      })
      const s24 = section24CostPence({
        grossRentPence,
        mortgageInterestPence,
        otherCostsPence,
        marginalRateBps: 4000,
      })
      taxBlock = {
        headline: `Estimated income tax @ 40% (post-S24, effective ${bpsToPercent(r.effectiveRateOnRentBps)} of rent)`,
        sub: '20% mortgage-interest tax credit applied per Section 24',
        ytdTaxPence: r.netTaxPence,
        section24CostPence: s24,
        note:
          'Assumes higher-rate (40%). Mortgage interest restriction (Section 24) means interest is NOT deductible; a 20% basic-rate credit is given instead.',
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Category
              </th>
              {monthlyTotals.map((_, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                >
                  {new Date(year, i, 1).toLocaleString('en-GB', { month: 'short' })}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                YTD
              </th>
            </tr>
          </thead>
          <tbody>
            {credits.length > 0 && (
              <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <td className="px-3 py-1" colSpan={monthlyTotals.length + 2}>
                  Income
                </td>
              </tr>
            )}
            {credits.map((cat) => (
              <CategoryRow key={cat} category={cat} monthly={monthlyTotals} />
            ))}
            {debits.length > 0 && (
              <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <td className="px-3 py-1" colSpan={monthlyTotals.length + 2}>
                  Costs
                </td>
              </tr>
            )}
            {debits.map((cat) => (
              <CategoryRow key={cat} category={cat} monthly={monthlyTotals} />
            ))}
            <tr className="border-t-2 font-semibold">
              <td className="px-3 py-2">Net</td>
              {totalsByMonth.map((v, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums">
                  <MoneyDisplay pence={v} />
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">
                <MoneyDisplay pence={ytdNet} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>

      {taxBlock && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            YTD tax estimate ({isCompany ? 'company' : 'individual'})
          </p>
          <p className="mt-1 text-base font-semibold">{taxBlock.headline}</p>
          <p className="text-xs text-muted-foreground">{taxBlock.sub}</p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TaxFigure label="Gross rent" displayPence={grossRentPence} />
            <TaxFigure label="Mortgage interest" displayPence={mortgageInterestPence} />
            <TaxFigure label="Other allowable costs" displayPence={otherCostsPence} />
            <TaxFigure label="Estimated tax" displayPence={taxBlock.ytdTaxPence} highlight />
          </div>

          {taxBlock.section24CostPence !== null && taxBlock.section24CostPence > 0n && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Section 24 cost (extra tax vs pre-2017 deduction method):{' '}
              <span className="font-semibold">
                <MoneyDisplay pence={taxBlock.section24CostPence} />
              </span>
            </p>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">{taxBlock.note}</p>
        </div>
      )}
    </div>
  )
}

function TaxFigure({
  label,
  displayPence,
  highlight,
}: {
  label: string
  displayPence: bigint
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm tabular-nums ${highlight ? 'font-semibold' : ''}`}>
        <MoneyDisplay pence={displayPence} />
      </p>
    </div>
  )
}

function CategoryRow({
  category,
  monthly,
}: {
  category: string
  monthly: ReturnType<typeof monthlyPandL>[]
}) {
  const values = monthly.map((m) => m.byCategory[category as CategoryCode] ?? 0n)
  const ytd = values.reduce((sum, v) => sum + v, 0n)
  return (
    <tr>
      <td className="px-3 py-1.5 text-xs">{category.replace(/_/g, ' ')}</td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-1.5 text-right text-xs tabular-nums">
          {v === 0n ? <span className="text-muted-foreground">—</span> : <MoneyDisplay pence={v} />}
        </td>
      ))}
      <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">
        <MoneyDisplay pence={ytd} />
      </td>
    </tr>
  )
}
