// app/(app)/investors/accounts/[accountId]/page.tsx
// Capital account detail. KPIs derive from the transaction ledger via
// the domain helpers; XIRR is computed against today.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { StatusBadge } from '@/components/status-badge'
import { DateDisplay } from '@/components/date-display'
import { MoneyDisplay } from '@/components/money-display'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { bpsToPercent } from '@/lib/money'
import {
  currentBalancePence,
  contributionsToDatePence,
  distributionsToDatePence,
  xirrBps,
  pendingPreferredReturnPence,
} from '@/lib/domain/investor'

type AccountDbRow = {
  id: string
  investor_id: string
  entity_id: string
  kind: string
  status: string
  terms: Record<string, unknown> | null
  commitment_pence: string | number
  start_date: string
  end_date: string | null
  investor: Array<{ name: string }>
  entity: Array<{ name: string }>
}

type TxDbRow = {
  id: string
  kind: string
  transaction_date: string
  amount_pence: string | number
  notes: string | null
  linked_transaction_id: string | null
  deleted_at: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const [accountRes, txRes] = await Promise.all([
    sb
      .from('investor_capital_accounts')
      .select(
        'id, investor_id, entity_id, kind, status, terms, commitment_pence, start_date, end_date, investor:investors(name), entity:entities(name)',
      )
      .eq('id', accountId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .maybeSingle<AccountDbRow>(),
    sb
      .from('investor_transactions')
      .select('id, kind, transaction_date, amount_pence, notes, linked_transaction_id, deleted_at')
      .eq('account_id', accountId)
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false }),
  ])

  const account = accountRes.data
  if (!account) notFound()
  const txs = (txRes.data ?? []) as TxDbRow[]

  const today = new Date()
  const ledger = txs.map((t) => ({
    transactionDate: t.transaction_date,
    amountPence: toBig(t.amount_pence),
  }))
  const balance = currentBalancePence(ledger, today)
  const contributions = contributionsToDatePence(ledger, today)
  const distributions = distributionsToDatePence(ledger, today)

  // XIRR: build dated-amount cashflows. By convention the investor
  // pays IN (negative for them) on contributions and gets paid OUT
  // (positive for them) on distributions/redemptions. We store the
  // OPPOSITE in the ledger (contributions positive). Flip sign here
  // for the XIRR calc.
  const irrBps = xirrBps(
    ledger.map((t) => ({
      date: t.transactionDate,
      amountPence: -t.amountPence,
    })),
  )

  // Preferred return — only relevant for preferred_equity accounts with
  // a preferred_return_bps in the terms.
  const termsBps =
    typeof account.terms?.preferred_return_bps === 'number'
      ? (account.terms.preferred_return_bps as number)
      : 0
  const daysElapsed = Math.max(
    0,
    Math.floor(
      (today.getTime() - new Date(account.start_date).getTime()) / 86_400_000,
    ),
  )
  const pendingPref =
    account.kind === 'preferred_equity'
      ? pendingPreferredReturnPence({
          contributedToDatePence: contributions,
          preferredReturnBps: termsBps,
          daysAccruing: daysElapsed,
        })
      : 0n

  const investorName = account.investor?.[0]?.name ?? '—'
  const entityName = account.entity?.[0]?.name ?? '—'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${investorName} · ${entityName}`}
        description={`${account.kind.replace(/_/g, ' ')} · Commitment ${'£'}${(Number(toBig(account.commitment_pence)) / 100).toFixed(0)}`}
        actions={
          <>
            <Link
              href={`/investors/${account.investor_id}`}
              className="self-center text-sm font-medium text-muted-foreground hover:underline"
            >
              ← {investorName}
            </Link>
            <Link
              href={`/investors/accounts/${account.id}/transactions/new`}
              className={buttonVariants()}
            >
              + Record transaction
            </Link>
            <Link
              href={`/api/reports/investor-capital-statement?accountId=${account.id}`}
              target="_blank"
              className={buttonVariants({ variant: 'outline' })}
            >
              Statement PDF
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={account.status} />
        <StatusBadge status={account.kind} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Current balance"
          display={<MoneyDisplay pence={balance} />}
        />
        <KpiTile label="Contributions" display={<MoneyDisplay pence={contributions} />} />
        <KpiTile label="Distributions" display={<MoneyDisplay pence={distributions} />} />
        <KpiTile
          label="XIRR"
          display={irrBps === null ? '—' : bpsToPercent(irrBps)}
          sub="money-weighted, annualised"
        />
      </div>

      {account.kind === 'preferred_equity' && termsBps > 0 && (
        <div className="rounded-md border bg-card p-4">
          <h3 className="mb-2 text-base font-medium">Preferred return</h3>
          <p className="text-sm text-muted-foreground">
            Coupon: {bpsToPercent(termsBps)} on{' '}
            <MoneyDisplay pence={contributions} /> contributed to date.
          </p>
          <p className="mt-1 text-sm">
            Pending pref since account opened ({daysElapsed} days):{' '}
            <MoneyDisplay pence={pendingPref} className="font-medium" />
          </p>
        </div>
      )}

      <section>
        <h3 className="mb-2 text-base font-medium">Transaction ledger ({txs.length})</h3>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Linked txn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">
                    <DateDisplay date={t.transaction_date} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.kind} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(t.amount_pence)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.linked_transaction_id ? (
                      <Link
                        href={`/transactions/${t.linked_transaction_id}`}
                        className="text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
