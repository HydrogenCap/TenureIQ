import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'

type DbRow = {
  id: string
  label: string
  bank_name: string | null
  kind: string
  account_number_last4: string | null
  opening_balance_pence: string | number
  entity: Array<{ name: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function BankAccountsPage() {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data: rawRows, error } = await sb
    .from('bank_accounts')
    .select(
      'id, label, bank_name, kind, account_number_last4, opening_balance_pence, entity:entities(name)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('label')

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Bank accounts" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const rows = (rawRows ?? []) as DbRow[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank accounts"
        description="Accounts that transactions are imported into and reconciled against."
        actions={
          <Link href="/bank-accounts/new" className={buttonVariants()}>
            + New account
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No bank accounts yet"
          description="Add one to start recording transactions."
          action={
            <Link href="/bank-accounts/new" className={buttonVariants()}>
              + New account
            </Link>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Opening balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link href={`/bank-accounts/${row.id}`} className="hover:underline">
                    {row.label}
                  </Link>
                  {(row.bank_name || row.account_number_last4) && (
                    <p className="text-xs text-muted-foreground">
                      {row.bank_name ?? '—'}
                      {row.account_number_last4 && ` · ****${row.account_number_last4}`}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-sm">{row.entity?.[0]?.name ?? '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={row.kind} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MoneyDisplay pence={toBig(row.opening_balance_pence)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
      </p>
    </div>
  )
}
