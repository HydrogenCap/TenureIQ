// Global transactions ledger with filters.

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
import { DateDisplay } from '@/components/date-display'
import { TransactionFilters } from './_components/transaction-filters'

type DbRow = {
  id: string
  posted_at: string
  description: string
  amount_pence: string | number
  category_code: string
  property_id: string | null
  bank_account: Array<{ label: string }>
  property: Array<{ address_line_1: string; postcode: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export const metadata = { title: 'Transactions' }

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    bankAccount?: string
    property?: string
    category?: string
    from?: string
    to?: string
  }>
}) {
  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const { q, bankAccount, property, category, from, to } = await searchParams

  const sb = await supabaseServer()

  let query = sb
    .from('transactions')
    .select(
      'id, posted_at, description, amount_pence, category_code, property_id, bank_account:bank_accounts(label), property:properties(address_line_1, postcode)',
    )
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .order('posted_at', { ascending: false })
    .limit(500)

  if (bankAccount) query = query.eq('bank_account_id', bankAccount)
  if (property) query = query.eq('property_id', property)
  if (category) query = query.eq('category_code', category)
  if (from) query = query.gte('posted_at', from)
  if (to) query = query.lte('posted_at', to)
  if (q) {
    const safe = q.trim().replace(/[%_]/g, '')
    if (safe) query = query.ilike('description', `%${safe}%`)
  }

  const { data: rawRows, error } = await query

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Transactions" />
        <p className="text-sm text-destructive">Failed to load: {error.message}</p>
      </div>
    )
  }

  const rows = (rawRows ?? []) as DbRow[]

  // Filter options
  const [accountsRes, propertiesRes] = await Promise.all([
    sb
      .from('bank_accounts')
      .select('id, label')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('label'),
    sb
      .from('properties')
      .select('id, address_line_1, postcode')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('address_line_1'),
  ])
  const accountOptions = ((accountsRes.data ?? []) as Array<{ id: string; label: string }>).map(
    (a) => ({ id: a.id, name: a.label }),
  )
  const propertyOptions = (
    (propertiesRes.data ?? []) as Array<{ id: string; address_line_1: string; postcode: string }>
  ).map((p) => ({ id: p.id, name: `${p.address_line_1}, ${p.postcode}` }))

  const totalPence = rows.reduce((sum, r) => sum + toBig(r.amount_pence), 0n)

  const hasFilters = !!(q || bankAccount || property || category || from || to)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every bank-account movement across your portfolio."
        actions={
          <Link href="/transactions/new" className={buttonVariants()}>
            + Record transaction
          </Link>
        }
      />

      <TransactionFilters bankAccounts={accountOptions} properties={propertyOptions} />

      {rows.length === 0 && !hasFilters ? (
        <EmptyState
          title="No transactions yet"
          description="Record one manually or import a bank CSV."
          action={
            <Link href="/transactions/new" className={buttonVariants()}>
              + Record transaction
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions match these filters.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">
                    <DateDisplay date={t.posted_at} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/transactions/${t.id}`} className="hover:underline">
                      {t.description}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{t.bank_account?.[0]?.label ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {t.property?.[0] ? `${t.property[0].address_line_1}` : '—'}
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

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {rows.length} {rows.length === 1 ? 'transaction' : 'transactions'} (limit 500)
            </span>
            <span>
              Net: <MoneyDisplay pence={totalPence} />
            </span>
          </div>
        </>
      )}
    </div>
  )
}
