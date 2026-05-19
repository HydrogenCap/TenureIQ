import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { MoneyDisplay } from '@/components/money-display'
import { DateDisplay } from '@/components/date-display'
import { buttonVariants } from '@/components/ui/button'
import { ReconcileToggle } from './_components/reconcile-toggle'

type DbRow = {
  id: string
  posted_at: string
  description: string
  amount_pence: string | number
  category_code: string
  reference: string | null
  reconciled_at: string | null
  bank_account_id: string | null
  property_id: string | null
  bank_account: Array<{ id: string; label: string }>
  property: Array<{ id: string; address_line_1: string; postcode: string }>
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const auth = await requireOrgMember()
  if (!auth.ok) redirect('/login')

  const sb = await supabaseServer()
  const { data } = await sb
    .from('transactions')
    .select(
      'id, posted_at, description, amount_pence, category_code, reference, reconciled_at, bank_account_id, property_id, bank_account:bank_accounts(id, label), property:properties(id, address_line_1, postcode)',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const canEdit =
    auth.role === 'owner' ||
    auth.role === 'admin' ||
    auth.role === 'manager' ||
    auth.role === 'accountant'

  const account = data.bank_account?.[0]
  const property = data.property?.[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.description}
        actions={
          canEdit && (
            <Link
              href={`/transactions/${data.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>
          )
        }
      />

      <p className="text-sm text-muted-foreground">
        <DateDisplay date={data.posted_at} />
        {data.reference && <> · {data.reference}</>}
      </p>

      <div className="flex items-center gap-2">
        <StatusBadge status={data.category_code} />
      </div>

      <ReconcileToggle
        transactionId={data.id}
        initialReconciledAt={data.reconciled_at}
        canEdit={canEdit}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Amount</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            <MoneyDisplay pence={toBig(data.amount_pence)} precise />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {toBig(data.amount_pence) >= 0n ? 'Credit (in)' : 'Debit (out)'}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Account</p>
          <p className="mt-1 font-medium">
            {account ? (
              <Link href={`/bank-accounts/${account.id}`} className="hover:underline">
                {account.label}
              </Link>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Property</p>
          <p className="mt-1 font-medium">
            {property ? (
              <Link href={`/properties/${property.id}`} className="hover:underline">
                {property.address_line_1}, {property.postcode}
              </Link>
            ) : (
              '— entity-level —'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
