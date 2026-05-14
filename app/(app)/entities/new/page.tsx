// app/(app)/entities/new/page.tsx
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { EntityForm } from '../_components/entity-form'

export default async function NewEntityPage() {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect('/entities')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New entity" description="Add a company, partnership, or individual." />
      <EntityForm mode="create" />
    </div>
  )
}
