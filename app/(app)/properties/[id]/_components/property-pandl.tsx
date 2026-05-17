// Year-to-date P&L filtered to one property. Same shape as the entity
// P&L grid but scoped via property_id only.

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
  id: string
  posted_at: string
  amount_pence: string | number
  category_code: string
  split_parent_id: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

function isCredit(code: string): boolean {
  return CREDIT_CATEGORIES.has(code as CategoryCode)
}

export async function PropertyPandL({ propertyId }: { propertyId: string }) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const year = new Date().getUTCFullYear()
  const yearStart = `${year}-01-01`

  const { data: rawTx } = await sb
    .from('transactions')
    .select('id, posted_at, amount_pence, category_code, split_parent_id')
    .eq('property_id', propertyId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .gte('posted_at', yearStart)

  const transactions = (rawTx ?? []) as TxDb[]

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions on this property in {year} yet.
      </p>
    )
  }

  // A row is a parent iff some other row in the result has split_parent_id
  // pointing to it. Parents must not be summed (their children carry the
  // money). Pre-compute the parent set once.
  const splitParentIds = new Set<string>()
  for (const t of transactions) {
    if (t.split_parent_id !== null) splitParentIds.add(t.split_parent_id)
  }

  const rows: TransactionLike[] = transactions.map((t) => ({
    postedAt: t.posted_at,
    amountPence: toBig(t.amount_pence),
    categoryCode: t.category_code,
    isSplitParent: splitParentIds.has(t.id),
  }))

  const currentMonth = new Date().getUTCMonth() + 1
  const monthlyTotals = Array.from({ length: currentMonth }, (_, i) =>
    monthlyPandL({ transactions: rows, month: { year, month: i + 1 } }),
  )

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
              <Row key={cat} category={cat} monthly={monthlyTotals} />
            ))}
            {debits.length > 0 && (
              <tr className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <td className="px-3 py-1" colSpan={monthlyTotals.length + 2}>
                  Costs
                </td>
              </tr>
            )}
            {debits.map((cat) => (
              <Row key={cat} category={cat} monthly={monthlyTotals} />
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

function Row({
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
