import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { ContractorForm } from '../_components/contractor-form'

export default async function NewContractorPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/contractors')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New contractor" />
      <ContractorForm mode="create" />
    </div>
  )
}
