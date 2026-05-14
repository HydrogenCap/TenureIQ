// app/(app)/entities/[id]/edit/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { EntityForm } from '../../_components/entity-form'
import type { EntityCreate, EntityKind } from '@/lib/schemas/entity'

export default async function EditEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/entities/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('entities')
    .select(
      'id, name, kind, companies_house_number, registered_address, hmrc_utr, vat_number, year_end_month, year_end_day, notes',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      name: string
      kind: string
      companies_house_number: string | null
      registered_address: string | null
      hmrc_utr: string | null
      vat_number: string | null
      year_end_month: number | null
      year_end_day: number | null
      notes: string | null
    }>()

  if (!data) notFound()

  const initial: EntityCreate = {
    name: data.name,
    kind: data.kind as EntityKind,
    companiesHouseNumber: data.companies_house_number,
    registeredAddress: data.registered_address,
    hmrcUtr: data.hmrc_utr,
    vatNumber: data.vat_number,
    yearEndMonth: data.year_end_month,
    yearEndDay: data.year_end_day,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={`Edit ${data.name}`} />
      <EntityForm mode="edit" entityId={id} initial={initial} />
    </div>
  )
}
