import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { ContractorForm } from '../../_components/contractor-form'
import type { ContractorCreate, ContractorKind } from '@/lib/schemas/maintenance'

type DbRow = {
  id: string
  entity_id: string | null
  name: string
  kind: string
  contact_name: string | null
  phone: string | null
  email: string | null
  insurance_expiry: string | null
  accreditations: string[]
  notes: string | null
}

export default async function EditContractorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/contractors/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('contractors')
    .select(
      'id, entity_id, name, kind, contact_name, phone, email, insurance_expiry, accreditations, notes',
    )
    .eq('id', id)
    .eq('organisation_id', auth.organisationId)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()
  if (!data) notFound()

  const initial: ContractorCreate = {
    entityId: data.entity_id,
    name: data.name,
    kind: data.kind as ContractorKind,
    contactName: data.contact_name,
    phone: data.phone,
    email: data.email,
    insuranceExpiry: data.insurance_expiry ? new Date(data.insurance_expiry) : null,
    accreditations: data.accreditations,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={`Edit ${data.name}`} />
      <ContractorForm mode="edit" contractorId={id} initial={initial} />
    </div>
  )
}
