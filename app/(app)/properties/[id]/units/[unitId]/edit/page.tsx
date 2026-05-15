import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { UnitForm } from '../../_components/unit-form'
import type { UnitCreate, UnitStatus } from '@/lib/schemas/unit'

type DbRow = {
  id: string
  label: string
  bedrooms: number
  bathrooms_ensuite: boolean
  floor_area_sqm: number | string | null
  market_rent_pence: string | number | null
  status: string
  notes: string | null
}

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>
}) {
  const { id, unitId } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/properties/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('units')
    .select(
      'id, label, bedrooms, bathrooms_ensuite, floor_area_sqm, market_rent_pence, status, notes',
    )
    .eq('id', unitId)
    .eq('property_id', id)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const initial: UnitCreate = {
    label: data.label,
    bedrooms: data.bedrooms,
    bathroomsEnsuite: data.bathrooms_ensuite,
    floorAreaSqm: data.floor_area_sqm === null ? null : Number(data.floor_area_sqm),
    marketRentPence:
      data.market_rent_pence === null
        ? null
        : BigInt(
            typeof data.market_rent_pence === 'string'
              ? data.market_rent_pence
              : Math.round(data.market_rent_pence),
          ),
    status: data.status as UnitStatus,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={`Edit ${data.label}`} />
      <UnitForm mode="edit" propertyId={id} unitId={unitId} initial={initial} />
    </div>
  )
}
