import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { RecordTransactionForm } from '../../../../_components/record-transaction-form'

export default async function NewTransactionPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect('/investors')

  const sb = await supabaseServer()
  const { data: account } = await sb
    .from('investor_capital_accounts')
    .select('id, kind, status, investor:investors(name), entity:entities(name)')
    .eq('id', accountId)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      kind: string
      status: string
      investor: Array<{ name: string }>
      entity: Array<{ name: string }>
    }>()
  if (!account) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Record transaction"
        description={`${account.investor?.[0]?.name ?? '—'} · ${account.entity?.[0]?.name ?? '—'} · ${account.kind.replace(/_/g, ' ')}`}
      />
      <RecordTransactionForm accountId={accountId} accountStatus={account.status} />
    </div>
  )
}
