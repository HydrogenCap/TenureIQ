// Bank account detail page — opening balance + reconciled balance +
// transaction list (most recent 100). The full ledger lives at
// /transactions filtered by ?bankAccount=...

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { KpiTile } from '@/components/kpi-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { buttonVariants } from '@/components/ui/button'

type AccountRow = {
  id: string
  label: string
  bank_name: string | null
  kind: string
  sort_code_masked: string | null
  account_number_last4: string | null
  opening_balance_pence: string | number
  opening_balance_date: string | null
  notes: string | null
  entity: Array<{ id: string; name: string }>
}

type TxRow = {
  id: string
  posted_at: string
  description: string
  amount_pence: string | number
  category_code: string
  reference: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function BankAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()

  const { data: account } = await sb
    .from('bank_accounts')
    .select(
      'id, label, bank_name, kind, sort_code_masked, account_number_last4, opening_balance_pence, opening_balance_date, notes, entity:entities(id, name)',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<AccountRow>()

  if (!account) notFound()

  const { data: rawTransactions } = await sb
    .from('transactions')
    .select('id, posted_at, description, amount_pence, category_code, reference')
    .eq('bank_account_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('posted_at', { ascending: false })
    .limit(100)

  const transactions = (rawTransactions ?? []) as TxRow[]

  // Reconciled balance: openingBalancePence + sum of all transaction
  // pence values on this account. RLS guarantees we only see rows in
  // this org; the explicit org_id is defence-in-depth.
  const { data: rawAll } = await sb
    .from('transactions')
    .select('amount_pence')
    .eq('bank_account_id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
  const allRows = (rawAll ?? []) as Array<{ amount_pence: string | number }>
  const totalDeltaPence = allRows.reduce((sum, t) => sum + toBig(t.amount_pence), 0n)
  const openingPence = toBig(account.opening_balance_pence)
  const reconciledPence = openingPence + totalDeltaPence

  return (
    <div className="space-y-6">
      <PageHeader
        title={account.label}
        description={
          [
            account.bank_name,
            account.entity?.[0]?.name,
            account.account_number_last4 && `****${account.account_number_last4}`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <Link
            href={`/transactions/new?bankAccount=${id}`}
            className={buttonVariants()}
          >
            + Record transaction
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge status={account.kind} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          label="Opening balance"
          display={<MoneyDisplay pence={openingPence} />}
          sub={
            account.opening_balance_date && (
              <>
                as at <DateDisplay date={account.opening_balance_date} />
              </>
            )
          }
        />
        <KpiTile
          label="Net movement"
          display={<MoneyDisplay pence={totalDeltaPence} />}
          trend={totalDeltaPence >= 0n ? 'up' : 'down'}
        />
        <KpiTile
          label="Reconciled balance"
          display={<MoneyDisplay pence={reconciledPence} />}
          sub={`${allRows.length} ${allRows.length === 1 ? 'txn' : 'txns'}`}
        />
      </div>

      <section>
        <h3 className="mb-3 text-base font-medium">Recent transactions</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">
                    <DateDisplay date={t.posted_at} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/transactions/${t.id}`} className="hover:underline">
                      {t.description}
                    </Link>
                    {t.reference && (
                      <p className="text-xs text-muted-foreground">{t.reference}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.category_code} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <MoneyDisplay pence={toBig(t.amount_pence)} />
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
