import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { ContractForm } from '../_components/contract-form'

export default async function NewContractPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/aasc/contracts')

  const sb = await supabaseServer()
  const [entitiesRes, banksRes] = await Promise.all([
    sb
      .from('entities')
      .select('id, name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('name'),
    sb
      .from('bank_accounts')
      .select('id, label, bank_name')
      .eq('organisation_id', auth.organisationId)
      .is('deleted_at', null)
      .order('label'),
  ])

  const entities = ((entitiesRes.data ?? []) as Array<{ id: string; name: string }>).map(
    (e) => ({ id: e.id, name: e.name }),
  )
  const bankAccounts = (
    (banksRes.data ?? []) as Array<{ id: string; label: string; bank_name: string | null }>
  ).map((b) => ({
    id: b.id,
    name: b.bank_name ? `${b.label} · ${b.bank_name}` : b.label,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New AASC contract"
        description="Record a Clearsprings or Serco agreement. Identity data is never stored anywhere in this module."
      />
      <ContractForm mode="create" entities={entities} bankAccounts={bankAccounts} />
    </div>
  )
}
