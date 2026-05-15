import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { PageHeader } from '@/components/page-header'
import { UnitForm } from '../_components/unit-form'

export default async function NewUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/properties/${id}`)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New unit" description="Add a unit to this property." />
      <UnitForm mode="create" propertyId={id} />
    </div>
  )
}
