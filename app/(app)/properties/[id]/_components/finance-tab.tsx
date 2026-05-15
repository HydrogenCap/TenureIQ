// Property detail Finance tab — mortgages + valuations + the "Add
// valuation" inline form. Server component.

import Link from 'next/link'
import { supabaseServer } from '@/lib/db/user'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { bpsToPercent } from '@/lib/money'
import { AddValuationForm } from './add-valuation-form'

type MortgageRow = {
  id: string
  lender: string
  product: string
  current_balance_pence: string | number
  interest_rate_bps: number
  fixed_end_date: string | null
  is_interest_only: boolean
}

type ValuationRow = {
  id: string
  valuation_date: string
  value_pence: string | number
  kind: string
  source: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export async function FinanceTab({ propertyId }: { propertyId: string }) {
  const sb = await supabaseServer()

  const [mortgagesRes, valuationsRes] = await Promise.all([
    sb
      .from('mortgages')
      .select(
        'id, lender, product, current_balance_pence, interest_rate_bps, fixed_end_date, is_interest_only',
      )
      .eq('property_id', propertyId)
      .is('deleted_at', null),
    sb
      .from('valuations')
      .select('id, valuation_date, value_pence, kind, source')
      .eq('property_id', propertyId)
      .is('deleted_at', null)
      .order('valuation_date', { ascending: false })
      .limit(20),
  ])

  const mortgages = (mortgagesRes.data ?? []) as MortgageRow[]
  const valuations = (valuationsRes.data ?? []) as ValuationRow[]

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium">Mortgages ({mortgages.length})</h3>
          <Link
            href={`/mortgages/new`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            + New mortgage
          </Link>
        </div>
        {mortgages.length === 0 ? (
          <EmptyState
            title="No mortgages on this property"
            description="Owned outright — or just not yet recorded."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lender / product</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Fixed end</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mortgages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.lender}
                    <p className="text-xs text-muted-foreground">
                      <StatusBadge status={m.product} className="text-[10px]" />
                      {m.is_interest_only && <span className="ml-1">· IO</span>}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(m.current_balance_pence)} />
                  </TableCell>
                  <TableCell className="tabular-nums">{bpsToPercent(m.interest_rate_bps)}</TableCell>
                  <TableCell className="text-sm">
                    {m.fixed_end_date ? <DateDisplay date={m.fixed_end_date} /> : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/mortgages/${m.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-medium">Valuations ({valuations.length})</h3>
        </div>

        <AddValuationForm propertyId={propertyId} />

        <div className="mt-4">
          {valuations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No valuations recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuations.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <DateDisplay date={v.valuation_date} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.kind} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyDisplay pence={toBig(v.value_pence)} />
                    </TableCell>
                    <TableCell className="text-sm">{v.source ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}
