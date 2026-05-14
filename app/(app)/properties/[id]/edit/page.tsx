// app/(app)/properties/[id]/edit/page.tsx
import { notFound, redirect } from 'next/navigation'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PageHeader } from '@/components/page-header'
import { PropertyForm } from '../../_components/property-form'
import type {
  PropertyCreate,
  PropertyKind,
  HmoLicenceKind,
  EpcRating,
} from '@/lib/schemas/property'

type DbRow = {
  id: string
  entity_id: string
  address_line_1: string
  address_line_2: string | null
  city: string
  county: string | null
  postcode: string
  local_authority: string | null
  brma_code: string | null
  kind: string
  class_use: string | null
  bedrooms_total: number | null
  bathrooms_total: number | null
  purchase_price_pence: string | number
  purchase_date: string
  sdlt_paid_pence: string | number | null
  refurb_cost_pence: string | number | null
  acquisition_costs_pence: string | number | null
  epc_rating: string | null
  epc_expiry: string | null
  hmo_licence_kind: string
  hmo_licence_ref: string | null
  hmo_licence_expiry: string | null
  hmo_permitted_occupancy: number | null
  article_4_area: boolean
  is_aasc_property: boolean
  notes: string | null
}

function toBig(v: string | number): bigint {
  return BigInt(typeof v === 'string' ? v : Math.round(v))
}
function toOptionalBig(v: string | number | null): bigint | null {
  return v === null ? null : toBig(v)
}

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) redirect(`/properties/${id}`)

  const sb = await supabaseServer()
  const { data } = await sb
    .from('properties')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<DbRow>()

  if (!data) notFound()

  const { data: rawEntities } = await sb
    .from('entities')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  const entities = (rawEntities ?? []) as Array<{ id: string; name: string }>

  const initial: PropertyCreate = {
    entityId: data.entity_id,
    addressLine1: data.address_line_1,
    addressLine2: data.address_line_2,
    city: data.city,
    county: data.county,
    postcode: data.postcode,
    localAuthority: data.local_authority,
    brmaCode: data.brma_code,
    kind: data.kind as PropertyKind,
    classUse: data.class_use,
    bedroomsTotal: data.bedrooms_total,
    bathroomsTotal: data.bathrooms_total,
    purchasePricePence: toBig(data.purchase_price_pence),
    purchaseDate: new Date(data.purchase_date),
    sdltPaidPence: toOptionalBig(data.sdlt_paid_pence),
    refurbCostPence: toOptionalBig(data.refurb_cost_pence),
    acquisitionCostsPence: toOptionalBig(data.acquisition_costs_pence),
    epcRating: data.epc_rating === null ? null : (data.epc_rating as EpcRating),
    epcExpiry: data.epc_expiry ? new Date(data.epc_expiry) : null,
    hmoLicenceKind: data.hmo_licence_kind as HmoLicenceKind,
    hmoLicenceRef: data.hmo_licence_ref,
    hmoLicenceExpiry: data.hmo_licence_expiry ? new Date(data.hmo_licence_expiry) : null,
    hmoPermittedOccupancy: data.hmo_permitted_occupancy,
    article4Area: data.article_4_area,
    isAascProperty: data.is_aasc_property,
    notes: data.notes,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Edit ${data.address_line_1}`} />
      <PropertyForm mode="edit" propertyId={id} initial={initial} entities={entities} />
    </div>
  )
}
