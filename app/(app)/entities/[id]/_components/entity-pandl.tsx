// Year-to-date P&L for an entity. Pulls transactions whose property
// belongs to the entity OR where entity_id matches directly (entity-
// level transactions). Renders months as columns, categories as rows.

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

type TxDb = {
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
    .select('posted_at, amount_pence, category_code, property_id, entity_id, split_parent_id')
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

  const rows: TransactionLike[] = transactions.map((t) => ({
    postedAt: t.posted_at,
    amountPence: toBig(t.amount_pence),
    categoryCode: t.category_code,
    propertyId: t.property_id,
    entityId: t.entity_id,
    isSplitParent: t.split_parent_id !== null ? false : transactions.some((c) => c.split_parent_id === null),
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

  return (
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
