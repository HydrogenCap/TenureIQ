import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { TransactionForm } from '../_components/transaction-form'

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ bankAccount?: string; property?: string }>
}) {
  const auth = await requireOrgRole(['owner', 'admin', 'manager', 'accountant'])
  if (!auth.ok) redirect('/transactions')

  const { bankAccount, property } = await searchParams

  const sb = await supabaseServer()
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

  const bankAccounts = ((accountsRes.data ?? []) as Array<{ id: string; label: string }>).map(
    (a) => ({ id: a.id, name: a.label }),
  )
  const properties = (
    (propertiesRes.data ?? []) as Array<{ id: string; address_line_1: string; postcode: string }>
  ).map((p) => ({ id: p.id, name: `${p.address_line_1}, ${p.postcode}` }))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="New transaction"
        description="Record a movement against a bank account or, when entity-level, leave the property blank."
      />
      <TransactionForm
        mode="create"
        bankAccounts={bankAccounts}
        properties={properties}
        initial={{
          bankAccountId: bankAccount ?? null,
          propertyId: property ?? null,
        }}
      />
    </div>
  )
}
